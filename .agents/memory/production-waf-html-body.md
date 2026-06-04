---
name: Production WAF blocks raw HTML in request bodies
description: Deployed app's WAF returns an HTML 403 (not from Express) when a POST JSON body contains raw HTML; dev domain has no such WAF.
---

# Production WAF blocks raw HTML in JSON request bodies

On the **deployed** app (Cloudflare-fronted), POST requests whose JSON body contains
raw HTML email/template content can be blocked with a **403 whose body is an HTML
page**, *before* the request reaches Express (so it never appears in deployment logs).
The `.replit.dev` dev domain has no such WAF, so the same request returns 200 in dev —
the bug is production-only and not reproducible locally.

**Symptom:** client toast shows `서버 오류 (403)`. In `client/src/lib/queryClient.ts`,
`handleGlobalError` shows the generic `서버 오류 (status)` message *only when the error
body starts with `<!`/`<html`* (i.e. an HTML response). Our routes only ever return
JSON, so an HTML 403 means an infra/WAF block, not our code.

**Fix pattern:** base64-encode the HTML fields client-side (UTF-8 safe:
`TextEncoder` → byte string → `btoa`) and send a flag `_enc: true`; decode server-side
with `Buffer.from(x,'base64').toString('utf8')` before use (and before any Zod parse —
Zod ZodObjects strip the unknown `_enc` key by default, so it never reaches storage).

- Client helper: canonical shared `encodeContent(str)` exported from
  `client/src/lib/queryClient.ts` — reuse it everywhere, do not re-define locally.
- Server helper: generic `decodeEncodedFields(req, fields)` (in `server/routes.ts`);
  `decodeBulkContent` delegates to it. Decode only listed fields that are present
  strings, so partial PATCH updates never clobber absent fields.

Applied to: 4 `/api/bulk-email/*` endpoints (`subject`,`body`); email-template
create/update (`subject`,`bodyHtml`); contract-template create/update (`content`);
line-item contract-content PATCH (`contractContent`).

**Why:** transport obfuscation to avoid WAF false-positives on HTML payloads.

**How to apply / still-exposed:** any *other* route carrying rich HTML in a JSON body is
still vulnerable — notably `POST /api/conversations/:id/messages` (regular message
send). If a user reports a production-only 403 on an HTML-carrying send, apply the same
`encodeContent` + `_enc` + `decodeEncodedFields` pattern there. When `_enc` is set, every
listed field that IS present must be encoded, or the server will mangle a plaintext field.
