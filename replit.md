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
    - **Integrated Messenger**: 3-pane layout for real-time campaign communication, Gmail syncing, influencer detail editing, and DOMPurify for content sanitization.
- **Mobile Optimization**: Fully responsive UI using Tailwind CSS.
- **Influencer Campaign History**: Displays past campaigns for an influencer within their detail panel, including navigation to campaign details.
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

## External Dependencies

- **Database**: PostgreSQL (`DATABASE_URL`)
- **ORM**: Drizzle ORM
- **Authentication/Email Services**: Gmail OAuth / Google APIs client library, Replit's Google Mail connector
- **Email Transport**: Nodemailer
- **Charting**: Recharts
- **Excel Handling**: `xlsx`
- **Environment Variables**: `DATABASE_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY`