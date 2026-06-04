---
name: Production WAF blocks raw HTML in request bodies
description: Deployed app's WAF returns an HTML 403 (not from Express) when a JSON body contains raw HTML; solved globally by base64-wrapping every apiRequest body.
---

# Production WAF blocks raw HTML in JSON request bodies

On the **deployed** app (Cloudflare-fronted), write requests whose JSON body contains
raw HTML (email/template/contract content) can be blocked with a **403 whose body is an
HTML page**, *before* the request reaches Express (so it never appears in deployment
logs). The `.replit.dev` dev domain has no such WAF, so the same request returns 200 in
dev — the bug is production-only and not reproducible locally.

**Diagnosing:** if a prod write fails but there is NO matching entry in deployment logs,
the request was blocked before Express (WAF), not by our code. Note the client error
flow in `client/src/lib/queryClient.ts`: `handleGlobalError` returns *silently* on 401
(so the user sees only the mutation's own onError toast, no status), and shows
`서버 오류 (status)` only when the error body starts with `<!`/`<html` (an HTML/WAF
response). A reported toast without a status code does NOT confirm the cause — check logs.

## Current solution: global base64 body wrapping (transport layer)

WAF-safety is handled once, transparently, for ALL writes — do NOT scatter per-field
encoding anymore (the old `_enc:true` + `decodeEncodedFields` per-field approach was
removed in favor of this):

- **Client** (`apiRequest` in `client/src/lib/queryClient.ts`): for any request with a
  body, sends `{ __enc: base64(JSON.stringify(data)) }` and header `X-Encoded-Body: 1`.
  `encodeContent(str)` is the UTF-8-safe base64 helper (TextEncoder → byte string → btoa).
- **Server** (middleware in `server/index.ts`, right after `express.json`): when the
  header is present and `req.body.__enc` is a string, replaces `req.body` with the decoded
  JSON; returns 400 on decode failure. Requests without the header (external webhooks,
  OAuth callbacks, multipart uploads) pass through untouched. `req.rawBody` (captured by
  express.json verify) is only used by such external callers, so it's unaffected.

**Why base64 bypasses the WAF:** WAF HTML/XSS rules match `<tag` patterns; a pure base64
string (alphanumeric + `/+=`) never matches. Same dependency for any base64 approach.

**Why global, not per-field:** the user hit this repeatedly (bulk email, then templates,
then contract content). Per-field meant enumerating every HTML field on every endpoint —
fragile and easy to miss one. Global makes it a transport concern, immune to new fields.

## How to apply / stay consistent

- Route every mutating JSON request through `apiRequest`. Raw `fetch` with a JSON body
  bypasses the wrapper and stays WAF-exposed. Bodyless `fetch(url,{method:'POST'})`
  (logout, onboarding, tracking-start) is fine — no body, no risk.
- Base64 inflates ~33%; Express limit is 10mb so effective max original JSON is ~7mb —
  only a concern for very large rich-text payloads.

**Verify in dev** (no WAF there, so this only proves decode correctness, not WAF bypass):
encoded body with raw HTML inside → reaches Express, decodes, returns normal response;
bad `__enc` with header → 400; non-encoded plain request → still works (backward compat).
