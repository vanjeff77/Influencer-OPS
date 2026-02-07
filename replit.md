# Influencer Management Platform

## Overview

This is a full-stack influencer management platform MVP designed for agencies to manage their influencer operations. The platform provides a complete workflow from discovering influencers, managing campaigns and groups, handling email communications, tracking performance, and managing finances/settlements.

Core capabilities include:
- Multi-workspace support with team member permissions
- Influencer discovery and comprehensive profile management across multiple platforms (Instagram, YouTube, TikTok, X, Blog)
- Campaign management with integrated contract and payment tracking
- Integrated email center with Gmail OAuth for sending and receiving communications, including bulk email features and attaching existing threads
- Performance tracking with data visualization
- Finance dashboard for payment and settlement management, including detailed operation tracking for campaign line items
- Mobile-optimized UI for accessibility across devices

The platform aims to streamline agency workflows, enhance influencer relationship management, and provide robust tools for campaign execution and financial oversight.

## User Preferences

Preferred communication style: Simple, everyday language.

## Development Testing

- **Test Account**: demo@example.com / password (or "test")
- Use this account for all development testing and verification

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript, using Vite
- **Routing**: Wouter
- **State Management**: TanStack Query (React Query)
- **UI Components**: shadcn/ui built on Radix UI, styled with Tailwind CSS (custom theme)
- **Data Visualization**: Recharts for charts
- **Internationalization**: Korean language support (`client/src/i18n/ko.ts`)
- **UI/UX Decisions**: Responsive design using Tailwind CSS breakpoints, mobile-first navigation with Sheet components, consolidated detail drawers, and WYSIWYG editor for emails.

### Backend
- **Framework**: Express.js with TypeScript
- **API Design**: RESTful API with typed route definitions (`shared/routes.ts`)
- **Authentication**: Passport.js with local strategy, session-based auth stored in PostgreSQL, 30-day cookie expiration
- **Authorization**: Three-tier role-based access control (RBAC) system:
    - `WORKSPACE_OWNER`: Full access to all features including settings, client management, and user management
    - `WORKSPACE_MEMBER`: Standard access to all operational features (influencers, campaigns, finance, email, tracking, groups)
    - `CLIENT`: Restricted access with server-side data filtering based on assigned clients (campaigns and finance only)
    - `PLATFORM_ADMIN` (isPlatformAdmin flag on users table): Cross-workspace privileges, can manage members and grant WORKSPACE_OWNER role in any workspace
- **Email Services**: IMAP for searching/fetching threads, SMTP queue-based system for bulk email sending with throttling and variable substitution. Email accounts are per-user (not workspace-shared), allowing each team member to connect their own accounts.

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Management**: Drizzle Kit for migrations, schema defined in `shared/schema.ts`
- **Key Data Models**: Users, Workspaces, Influencers (with multi-platform accounts), Groups, Campaigns (with line items), Email accounts, Threads, Messages, Tracking jobs, Feedback Notes, Bulk Email Jobs, Clients, ClientUserAssignments.
- **Influencer Contact Fields**:
    - `email`: Used by all system features (email sending, communication, contracts, CSV export). UI label: "이메일".
    - `contactPoint`: For non-email contacts (KakaoID, etc.). UI label: "컨택포인트". Kept separate from email.
    - Both fields are editable in Discover detail panel, bulk edit, and new influencer form. Batch import maps the "이메일" column to `email`.

### Project Structure
- `client/`: React frontend
- `server/`: Express backend
- `shared/`: Code shared between client and server (e.g., schema, route definitions)
- `migrations/`: Database migration scripts

### Core Features & Technical Implementations
- **Campaign Operations**: Comprehensive management of influencer line items, including stages, communication status, review, and deadline tracking (D-day badges). Detailed panel with feedback notes and summary generation.
- **Influencer Import**: Simplified batch import with fixed 7-column grid (닉네임, 플랫폼 계정, 플랫폼, 팔로워, 컨택포인트, 메모, 단가 메모). Features TSV paste from Excel/Sheets, cell-level validation, platform normalization (Korean/English variants), auto URL generation, duplicate detection, partial success with retry capability.
- **Email Communication**:
    - **Attach Existing Email Thread**: Wizard for linking external email threads via IMAP search (recipient, subject, message ID) to campaign conversations, importing all messages.
    - **Bulk Email Sending**: Queue-based 1:1 email delivery with throttling, WYSIWYG editor, variable substitution, validation, and first contact tracking.
    - **Integrated Messenger**: 3-pane layout for real-time campaign communication, syncing with Gmail, influencer detail editing, and DOMPurify for content sanitization.
- **Mobile Optimization**: Fully responsive UI across all pages, components, and tables using Tailwind CSS for a consistent mobile-first experience.
- **Influencer Campaign History**: In the discovery tab, when viewing an influencer's detail panel under the "협업 내역" tab, displays the list of campaigns the influencer has been registered to, including campaign name, client, status, and payment amount. Clicking a campaign card navigates to the campaign detail page.
- **Finance & Tracking**: Real-time finance summary, CSV export for tracking data.
- **Settlement Management (정산)**:
    - **Settlement Work Queue**: Finance page with KPI cards (pending count/total, incomplete info, hold count) and filterable work queue table showing upload-completed line items.
    - **Settlement Info on Influencers**: Accordion section in InfluencerDetailPanel for editing settlement type (사업자/프리랜서), bank info (은행명, 예금주, 계좌번호), business info (상호명, 사업자번호), or freelancer ID (주민등록번호).
    - **Payout Status Workflow**: Status enum (정산정보미비, 증빙요청, 증빙수령, 지급대기, 지급완료, 보류) with automatic status determination based on settlement info completeness when upload is marked completed.
    - **Role-Based Access Control**: CLIENT role blocked from settlement features; OWNER-only for "입금완료" confirmation; MEMBER+OWNER for payout updates.
    - **TSV Clipboard Copy**: Copy bank transfer data (bankName, accountNumber, accountHolder, amount) to clipboard for easy Excel paste.
- **Security**: IMAP password encryption (AES-256-CBC), Zod validation, authentication and workspace authorization checks for sensitive operations.
- **Contract Template Management (계약서 템플릿)**:
    - **Template CRUD**: Full create, read, update, delete operations for contract templates in Settings page with default template marking.
    - **Rich Text Editor**: React-Quill WYSIWYG editor for template content with bold, italic, underline, headers, lists, colors, and tables.
    - **Variable Substitution**: Supports {{인플루언서명}}, {{캠페인명}}, {{금액}}, {{날짜}}, {{초안예정일}}, {{업로드예정일}}, {{클라이언트명}}, {{이메일}}, {{연락처}} placeholders.
    - **Dual Format Export**: 
        - DOCX: Uses html-to-docx library for full HTML support with 맑은 고딕 font.
        - PDF: Uses Puppeteer for full HTML/CSS rendering with embedded Noto Sans KR fonts (base64). Supports all rich text formatting including bold, italic, underline, colors, tables, and lists.
    - **Font**: PDF uses locally embedded Noto Sans KR fonts (`server/fonts/NotoSansKR-Regular.ttf` and `NotoSansKR-Bold.ttf`) as base64 for deterministic offline rendering. DOCX uses 맑은 고딕 (Malgun Gothic) font option.
    - **Production Readiness**: 
        - Startup preflight check validates Chromium/Puppeteer availability
        - Font availability check at startup (required in production, optional in dev)
        - Singleton browser pattern for efficient resource usage
        - HTTP 503 status for service unavailability with Korean error messages
        - Google Fonts fallback disabled in production for deterministic rendering
    - **Legacy Template Support**: Plain-text templates auto-detected via regex and converted to HTML with entity escaping.
    - **Inline Date Editing**: Direct editing of 초안 예정일 and 업로드 예정일 columns in Operations table.
    - **Error Handling**: Detailed Korean error messages with suggestions for troubleshooting.
- **User Onboarding System**:
    - **TourGuide Component**: Step-by-step walkthrough overlay for new users (5 steps: Discover → Campaigns → Email → Finance → Settings).
    - **FeatureHint Component**: Contextual page-level hint cards with dismiss functionality.
    - **State Management**: Stored per-user with `onboardingCompleted` flag and `dismissedHints` array.
    - **Reset Onboarding**: Available in Settings page to restart the tour and show all hints again.
    - **API Endpoints**: `/api/onboarding/complete`, `/api/onboarding/dismiss-hint`, `/api/onboarding/reset`.

## External Dependencies

- **Database**: PostgreSQL (`DATABASE_URL` environment variable)
- **ORM**: Drizzle ORM
- **Authentication/Email Services**:
    - Gmail OAuth / Google APIs client library (`googleapis`) for Gmail integration
    - Replit's Google Mail connector (for Gmail account registration)
- **Email Transport**: Nodemailer (for SMTP queue)
- **Charting**: Recharts
- **Excel Handling**: xlsx (for Excel file generation/export)
- **Environment Variables**:
    - `DATABASE_URL`
    - `SESSION_SECRET`
    - `ENCRYPTION_KEY`