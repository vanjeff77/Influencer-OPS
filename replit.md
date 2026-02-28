# Influencer Management Platform

## Overview

This is a full-stack influencer management platform MVP designed for agencies to manage their influencer operations. It provides a complete workflow for influencer discovery, campaign and group management, email communications, performance tracking, and financial settlements. Key capabilities include multi-workspace support with permissions, comprehensive influencer profile management across various platforms, integrated email center with Gmail OAuth, and robust financial tracking. The platform aims to streamline agency workflows, enhance influencer relationship management, and provide powerful tools for campaign execution and financial oversight, with a mobile-optimized UI.

## User Preferences

Preferred communication style: Simple, everyday language.

## Agent Development Guidelines (오류 방지 원칙)

아래 원칙들은 반복된 실수에서 배운 것이다. **기계적으로 모든 상황에 적용하지 말고, 상황에 맞게 유연하게 판단**한다. 예: 방금 읽은 파일은 다시 읽지 않아도 되고, 사소한 수정이면 서버 확인을 건너뛸 수 있다. 핵심은 "안전 vs 속도의 균형"이다.

1. **코드 수정 전 파일 읽기** — 추측으로 편집하면 실패→재시도가 반복된다. 읽고 나서 수정하는 게 총 시간이 짧다.
2. **점진적 변경** — 여러 파일을 한꺼번에 바꾸면 원인 추적이 어렵다. 단, 서로 의존하는 변경은 묶어서 해도 된다.
3. **타입/스키마 변경 시 전파** — schema → db:push → API → 프론트 순서. 기존 ID 타입은 절대 변경하지 않는다.
4. **Null/Falsy 주의** — `!value`는 0도 걸러낸다. 숫자는 `!= null`, "값 지우기"는 `null`로 전송.
5. **DB 안전** — 파괴적 SQL은 사용자 승인 필요. `npm run db:push` 사용.
6. **서버 기동 확인** — 큰 변경 후에는 curl로 확인(1초). 사소한 변경은 생략 가능.
7. **기존 패턴 따르기** — 주변 코드의 import, 상태관리, 에러처리 패턴을 먼저 파악하고 동일하게 작성.
8. **edit 정확성** — old_string은 파일에서 읽은 그대로. 줄 번호 포함 금지, 충분한 컨텍스트 포함.
9. **에러 대응** — 로그 확인 → 원인 추적 → 최소 수정. 전체 재작성은 최후의 수단.
10. **테스트** — API 변경은 curl, UI 변경은 e2e 테스트로 검증. 검증 범위는 변경 규모에 비례.
11. **Port conflict 대응** — 워크플로우 재시작 실패 시: (1) `lsof -i :5000`으로 포트 점유 프로세스 확인 (2) 좀비 프로세스가 있으면 `kill` 후 워크플로우 재시작 (3) curl로 서버 정상 응답 확인되면 재시도 루프를 멈추고 사용자에게 상황 보고. 포트 충돌 후 워크플로우 상태가 꼬일 수 있으므로 완전한 프로세스 정리 후 재시작이 핵심.
12. **도구 실패 시 재시도 제한** — `restart_workflow`나 `mark_completed_and_get_feedback`이 2회 연속 실패하면, curl로 서버 상태만 확인하고 사용자에게 현재 상황을 보고한다. 무한 재시도 루프 금지.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript (Vite)
- **Routing**: Wouter
- **State Management**: TanStack Query (React Query)
- **UI Components**: shadcn/ui (Radix UI, Tailwind CSS custom theme)
- **Data Visualization**: Recharts
- **Internationalization**: Korean language support
- **UI/UX Decisions**: Responsive design, mobile-first navigation, consolidated detail drawers, WYSIWYG editor for emails.

### Backend
- **Framework**: Express.js with TypeScript
- **API Design**: RESTful API with typed route definitions
- **Authentication**: Passport.js (local strategy, session-based via PostgreSQL, 30-day cookie expiration)
- **Authorization**: Three-tier Role-Based Access Control (RBAC): `WORKSPACE_OWNER`, `WORKSPACE_MEMBER`, `CLIENT`, and `PLATFORM_ADMIN`.
- **Email Services**: IMAP for searching/fetching threads, SMTP queue-based system for bulk email sending with throttling and variable substitution. User-specific email accounts.

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Management**: Drizzle Kit for migrations, schema defined in `shared/schema.ts`
- **Key Data Models**: Users, Workspaces, Influencers (multi-platform), Groups, Campaigns (line items), Email accounts, Threads, Messages, Tracking jobs, Feedback Notes, Bulk Email Jobs, Clients, ClientUserAssignments.
- **Influencer Contact Fields**: Dedicated fields for `email` and `contactPoint` (non-email contacts).

### Project Structure
- `client/`: React frontend
- `server/`: Express backend
- `shared/`: Shared code (schema, route definitions)
- `migrations/`: Database migration scripts

### Core Features & Technical Implementations
- **Campaign Operations**: Comprehensive management of influencer line items, stages, communication, review, and deadlines.
- **Influencer Import**: Batch import with fixed columns, TSV paste support, cell-level validation, platform normalization, auto URL generation, duplicate detection, and partial success handling.
- **Instagram URL Normalization**: Shared utility (`shared/utils.ts`) normalizes IG handles across all save paths (create, update, bulk import). Strips query params/fragments, rejects content URLs (`/p/`, `/reel/`, etc.), extracts handles from full URLs, and cleans `@` prefixes. Admin migration endpoint (`POST /api/admin/migrate-instagram-urls`) cleans existing DB data.
- **Email Communication**:
    - **Attach Existing Email Thread**: Wizard for linking external email threads via IMAP search, importing all messages.
    - **Bulk Email Sending**: Queue-based 1:1 delivery with throttling, WYSIWYG editor, variable substitution, validation, and first contact tracking.
    - **Integrated Messenger**: 3-pane layout (3+7+2 grid) for real-time campaign communication, Gmail syncing, influencer detail editing, and DOMPurify for content sanitization. Progress status bar (대기/컨택/확정/계약) in message header. Compact right-side detail panel.
    - **Auto Email Sync**: Gmail History API-based incremental sync (`server/email-sync.ts`). Background worker runs every 3 minutes using `lastHistoryId` per account for efficient delta sync. Frontend auto-refreshes conversation list (30s) and messages (15s). Manual sync-all endpoint (`POST /api/campaigns/:id/sync-all`) for immediate batch sync. History 404 fallback triggers thread-based backfill.
- **Mobile Optimization**: Fully responsive UI using Tailwind CSS.
- **Influencer Campaign History**: Displays past campaigns for an influencer within their detail panel, including navigation to campaign details.
- **Content Submission History**:
    - **Influencer View**: After upload, influencers see their submission history (type, filename, size, date) with option to upload more files.
    - **Campaign Production Tab**: Per-influencer submission count button with red "N" badge for unreviewed submissions. Dialog shows full history with OneDrive file links.
    - **Review Tracking**: Auto-marks submissions as reviewed when staff opens the history dialog. `reviewedAt` and `reviewedByUserId` tracked per submission.
    - **Settlement Skip**: Returning influencers with confirmed settlement info (`settlementConfirmedAt`) skip the settlement step on re-upload.
- **Finance & Tracking**: Real-time finance summary, CSV export for tracking data.
- **Settlement Management**:
    - **Settlement Work Queue**: Finance page with KPI cards and filterable work queue for upload-completed line items.
    - **Settlement Info**: Accordion section in InfluencerDetailPanel for editing settlement type, bank info, business info, or freelancer ID.
    - **Payout Status Workflow**: Automated status (e.g., `정산정보미비`, `지급완료`) based on settlement info completeness.
    - **Role-Based Access Control**: `CLIENT` role blocked; `OWNER` for "입금완료" confirmation; `MEMBER`+`OWNER` for payout updates.
    - **TSV Clipboard Copy**: Copy bank transfer data for easy Excel paste.
- **Security**: IMAP password encryption (AES-256-CBC), Zod validation, authentication and workspace authorization for sensitive operations.
- **Contract Template Management**:
    - **Template CRUD**: Create, read, update, delete operations for templates in Settings, with default template marking.
    - **Rich Text Editor**: TipTap (ProseMirror-based) WYSIWYG editor for content, email composition, and signatures with extensive formatting options.
    - **Variable Substitution**: Supports placeholders like `{{인플루언서명}}`, `{{캠페인명}}`, etc.
    - **Dual Format Export**: DOCX (using `html-to-docx` with Malgun Gothic font) and PDF (using Puppeteer with embedded Noto Sans KR fonts for full HTML/CSS rendering).
    - **Production Readiness**: Startup preflight checks, font availability checks, singleton browser pattern, HTTP 503 for unavailability, Google Fonts fallback disabled in production.
- **Client Logo Management**:
    - **URL-Based Logos**: Clients enter external image URLs for logos (no file upload needed, saves server costs).
    - **Logo UI**: URL input with live preview in Settings client dialogs (create/edit), rounded-xl display.
    - **Campaign Integration**: Client logos shown in campaign list cards and campaign detail headers.
- **User Onboarding System**:
    - **TourGuide Component**: Step-by-step walkthrough overlay for new users (5 steps).
    - **FeatureHint Component**: Contextual page-level hint cards with dismiss functionality.
    - **State Management**: Stored per-user with `onboardingCompleted` flag and `dismissedHints` array.
    - **Reset Onboarding**: Option in Settings.
- **AI Auto-Reply Draft Generation**:
    - **RAG-based**: Email response framework document — default at `server/ai/email-framework.md`, customizable per workspace via `aiFrameworkDoc` column. Editable in Settings > AI tab.
    - **Campaign-level AI Instructions**: Per-campaign `aiInstruction` column for campaign-specific AI guidance (e.g., pricing guidelines). Editable in collapsible panel on Communication tab. Injected as "캠페인별 추가 지침" section in user prompt.
    - **LLM Provider Abstraction**: `server/ai/llm-provider.ts` with 3 providers (Replit AI, OpenAI API, Anthropic API). Workspace-configurable via settings.
    - **Draft Generator**: `server/ai/draft-generator.ts` builds system+user prompts from framework doc (workspace-level), campaign instructions, conversation messages, influencer/campaign context. Returns draft text + classification code/label.
    - **Background Generation**: Triggered in `server/email-sync.ts` after inbound message sync. Async, non-blocking, errors silently logged.
    - **Storage**: `ai_draft_replies` table (conversationId, triggerMessageId, draft, classification, classificationLabel, status).
    - **Workspace Settings**: `aiDraftEnabled`, `aiProvider`, `aiApiKey` (AES-256-CBC encrypted), `aiModel`, `aiFrameworkDoc` columns on workspaces table. Settings UI in workspace tab (owner-only).
    - **Framework Editing**: Settings > AI tab shows textarea for editing framework doc (markdown, monospace). "Save" and "Reset to default" buttons. `GET/PUT /api/workspaces/:id/ai-framework`, `POST /api/workspaces/:id/ai-framework/reset`.
    - **Campaign AI Instructions**: `GET/PUT /api/campaigns/:id/ai-instruction`. Collapsible panel on Communication tab with textarea, save button, and edit indicator.
    - **Communication UI**: Auto-displays pending draft card (purple theme) above MessageComposer when conversation selected. "초안 사용" inserts into textarea, "다른 답변 요청하기" opens feedback textarea for custom re-generation, "Dismiss" hides card. Manual "Generate AI draft" button when no pending draft and last message is inbound. Sparkles icon on conversation list items with pending drafts.
    - **User Feedback Regeneration**: AI draft card has a separate "요청사항 반영 재생성" button (MessageSquare icon) that toggles a feedback textarea. User can type specific instructions (e.g., "좀 더 정중하게") and regenerate with feedback. API accepts optional `userFeedback` body param on `POST /api/conversations/:id/ai-draft`, appended as "사용자 추가 요청사항" section in user prompt.
    - **Alternative Classification Options**: LLM returns top classification + 2 alternatives. Alternatives stored as JSON in `alternatives` column of `ai_draft_replies`. Displayed as clickable buttons below draft body. Clicking generates new draft with that classification via `requestedClassification` param.
    - **Expandable Message Composer**: Maximize2 button next to send button opens a Dialog modal with full-width textarea (min-height 300px), CC input, sender/recipient info, and send button. Content syncs back to inline composer when dialog closes.
    - **API Endpoints**: `GET/POST /api/conversations/:id/ai-draft` (POST accepts optional `userFeedback`, `requestedClassification`, `requestedClassificationLabel`), `PATCH /api/ai-drafts/:id`, `POST /api/conversations/ai-draft-ids`.
    - **Safety**: Never auto-sends. User always reviews and manually sends.

## External Dependencies

- **Database**: PostgreSQL (`DATABASE_URL`)
- **ORM**: Drizzle ORM
- **Authentication/Email Services**: Gmail OAuth / Google APIs client library, Replit's Google Mail connector
- **Email Transport**: Nodemailer
- **Charting**: Recharts
- **Excel Handling**: `xlsx`
- **Environment Variables**: `DATABASE_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY`