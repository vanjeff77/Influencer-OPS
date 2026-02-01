# Influencer Management Platform

## Overview

This is a full-stack influencer management platform MVP designed for agencies to manage their influencer operations. The platform provides a complete workflow from discovering influencers, managing campaigns and groups, handling email communications, tracking performance, and managing finances/settlements.

Core features include:
- Multi-workspace support with team member permissions (Master/Editor/Viewer)
- Influencer discovery and profile management with multi-platform account support (Instagram, YouTube, TikTok, X, Blog)
- Campaign management with contract and payment tracking
- Integrated email center with Gmail OAuth support for sending/receiving emails
- Performance tracking with metrics visualization
- Finance dashboard for payment management

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript, using Vite as the build tool
- **Routing**: Wouter for client-side routing (lightweight alternative to React Router)
- **State Management**: TanStack Query (React Query) for server state management
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom theme configuration including CSS variables for theming
- **Charts**: Recharts for data visualization in tracking and finance dashboards
- **Internationalization**: Korean language support via static i18n file (`client/src/i18n/ko.ts`)

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **API Design**: RESTful API with typed route definitions in `shared/routes.ts`
- **Authentication**: Passport.js with local strategy (email/password), session-based auth stored in PostgreSQL
- **Session Storage**: connect-pg-simple for PostgreSQL-backed sessions

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Location**: `shared/schema.ts` contains all table definitions and Zod validation schemas
- **Migrations**: Drizzle Kit for schema migrations (`drizzle.config.ts`)

### Key Data Models
- Users and Workspaces with membership roles
- Influencers with multi-platform accounts and metrics
- Groups for organizing influencers
- Campaigns with line items tracking stages, contracts, and payments
- Email accounts, threads, and messages
- Tracking jobs with time-series metrics

### Authentication & Authorization
- Session-based authentication with 30-day cookie expiration
- Password hashing with bcryptjs
- Role-based permissions planned (MASTER/EDITOR/VIEWER) at workspace level

### Project Structure
```
├── client/           # React frontend
│   └── src/
│       ├── components/  # UI components (shadcn/ui)
│       ├── hooks/       # Custom React hooks for API calls
│       ├── pages/       # Page components
│       ├── i18n/        # Internationalization
│       └── lib/         # Utilities
├── server/           # Express backend
│   ├── auth.ts       # Authentication setup
│   ├── routes.ts     # API route handlers
│   ├── storage.ts    # Database operations
│   └── db.ts         # Database connection
├── shared/           # Shared between client/server
│   ├── schema.ts     # Drizzle schema + Zod types
│   └── routes.ts     # API route definitions
└── migrations/       # Database migrations
```

## External Dependencies

### Database
- **PostgreSQL**: Primary database, connection via `DATABASE_URL` environment variable
- **Drizzle ORM**: Type-safe database queries and schema management

### Authentication Services
- **Gmail OAuth**: For email account integration (planned for sending/receiving emails)
- Google APIs client library (`googleapis`) for Gmail API access

### Environment Variables Required
- `DATABASE_URL`: PostgreSQL connection string
- `SESSION_SECRET`: Secret for session encryption (defaults to fallback in dev)
- `ENCRYPTION_KEY`: For encrypting OAuth tokens stored in database (email integration)

### Key NPM Packages
- `express`, `express-session`: Web server and sessions
- `passport`, `passport-local`: Authentication
- `drizzle-orm`, `drizzle-kit`: Database ORM and migrations
- `@tanstack/react-query`: Client-side data fetching
- `googleapis`: Google API client for Gmail integration
- `recharts`: Charting library for dashboards
- `xlsx`: Excel file generation for exports
- `nodemailer`: Email sending capability

## Recent Changes (2026-02-01)

### Bulk Email Sending System (SMTP Queue-Based)
- **Queue-Based Delivery**: Individual 1:1 emails (no BCC) with 5-second throttle + random jitter to avoid spam classification
- **WYSIWYG Editor**: react-quill-new integration for rich HTML email templates
- **Variable Substitution**: {{influencer_name}}, {{campaign_name}} tokens with extensible design
- **4-Step Workflow**: Template editor → Preview → Test Send → Confirm → Start
- **Validation Rules**: Duplicate email detection, already-sent check, missing variables warning
- **First Contact Tracking**: Automatic status update (firstContactCompleted) on successful send
- **Send Logs**: Filter by all/failed, job status tracking (pending/processing/completed)
- **Retry Logic**: Transient errors retry up to 3 times with exponential backoff
- **Database Tables**: `bulk_email_jobs` (job tracking), `bulk_email_queue_items` (individual sends)
- **Key Components**: 
  - `client/src/components/bulk-email-dialog.tsx`: 4-step send workflow
  - `client/src/components/bulk-email-log-dialog.tsx`: Send history viewer
  - `server/smtp.ts`: SMTP queue processor with nodemailer
- **API Endpoints**:
  - `POST /api/bulk-email/preview`: Preview template with variable substitution
  - `POST /api/bulk-email/test-send`: Send test email to single address
  - `POST /api/bulk-email/validate`: Get eligible/excluded recipient list
  - `POST /api/bulk-email/start`: Create and start bulk email job
  - `GET /api/bulk-email/jobs/:campaignId`: List jobs for campaign
  - `GET /api/bulk-email/jobs/:campaignId/:jobId`: Get job details with items
  - `PATCH /api/line-items/:id/first-contact`: Toggle first contact status

### Email Account Registration Security
- **Gmail Registration**: Uses Replit's Google Mail connector to fetch profile and register account
- **IMAP/SMTP Registration**: Manual email configuration with server settings
- **Security Features**:
  - Authentication check (req.isAuthenticated() required)
  - Workspace authorization (user must be workspace member)
  - Zod validation for all request bodies
  - IMAP password encryption (AES-256-CBC with random IV)
- **API Endpoints**:
  - `POST /api/email/gmail/register`: Register Gmail account using Replit connector
  - `POST /api/email/imap/register`: Register IMAP/SMTP email account
- **Storage**: Added `getWorkspaceMemberships(userId)` function to check workspace access

### Campaign Communication System (Gmail-Integrated Messenger)
- **3-Pane Messenger Layout**: Left panel (influencer list with search), center panel (message thread with bubbles), right panel (influencer details editor)
- **Gmail Integration**: Status indicator, message sync from Gmail threads, send emails via Gmail API
- **Message Thread UI**: Outbound messages (primary color, right-aligned), inbound messages (muted, left-aligned), timestamps, send status indicators
- **Influencer Detail Editor**: Inline editing for email, phone, tags, memo with save functionality
- **Security**: DOMPurify sanitization for HTML email content to prevent XSS
- **Loading States**: Skeleton loaders for conversation list, spinner for message loading
- **Search Filtering**: Real-time search by influencer name or email in left panel
- **i18n Support**: Full Korean translations in `client/src/i18n/ko.ts` under `pages.communication`

### Key Components
- `client/src/components/campaign-communication.tsx`: Main 3-pane communication component
- Communication tab added to campaign detail page (`/campaigns/:id`)

### API Endpoints (Communication)
- `GET /api/conversations?campaignId=X`: List conversations for a campaign
- `GET /api/conversations/:id`: Get conversation with messages
- `POST /api/line-items/:id/start-conversation`: Create new conversation for line item
- `POST /api/conversations/:id/messages`: Send a message
- `POST /api/conversations/:id/sync`: Sync messages from Gmail

### Mobile UI Optimization
- **Responsive Sidebar**: Mobile-first navigation using Sheet component overlay with hamburger menu toggle
- **All Pages Mobile-Optimized**: Responsive layouts using Tailwind breakpoints (md:, lg:)
- **Responsive Typography**: text-xs md:text-sm pattern for mobile-first text sizing
- **Responsive Components**: Button heights (h-7 md:h-8), card padding, spacing throughout
- **Mobile Tables**: Horizontal scrolling with min-width constraints, column hiding on smaller screens
- **Grid Layouts**: grid-cols-2 md:grid-cols-3 patterns for cards and summary sections
- **Pages Updated**: Home, Discover, Campaigns, Groups, Finance, Tracking, Login

### Previous Updates (2026-01-31)
- **Finance Page**: Now fetches real data from `/api/finance/summary` endpoint - displays paid amounts, pending payments, and average cost per influencer from actual campaign line items
- **Tracking Page**: Added CSV export button for metrics data (날짜, 값, Job 이름 headers with UTF-8 BOM support)
- **Campaigns Page**: Added advertiser filter buttons (전체, 코딩밸리, Grab, Voye) for client-side filtering
- **Type Safety**: Fixed type definitions for `createInfluencer` and `createTrackingJob` to properly exclude `workspaceId` from input (injected server-side)

### Previously Implemented (2026-01-30)
- **Discover Page**: Multi-select checkboxes, bulk actions (save to group, assign to campaign), influencer detail drawer with 4 tabs (info, content, timeline, memo)
- **Groups Page**: Sidebar with group list and member counts, group detail view with member table, add/remove member functionality, CSV export
- **Campaign Detail Page**: Summary cards showing influencer count and payment status, line item table with status dropdowns, add influencer modal, line item detail drawer with contract/settlement tabs

### Database Tables
- `timeline_events`: Tracking influencer history (campaign assignments, group additions, status changes)
- `audit_logs`: Tracking all data changes
- `notifications`: In-app notifications

### API Endpoints
- Bulk operations: `/api/bulk/save-to-group`, `/api/bulk/assign-to-campaign`
- Group management: `/api/groups/:id`, `/api/groups/:id/influencers`, `/api/groups/:id/members/:influencerId`
- Campaign management: `/api/campaigns/:id/line-items`
- Finance: `/api/finance/summary` (returns pendingTotal, paidThisMonth, pendingCount, items)
- Timeline: `/api/influencers/:id/timeline`

### Demo Credentials
- Email: demo@example.com
- Password: password

### Seeded Test Data
- 10 influencers with Korean names (인플루언서 1-10)
- 2 groups: 뷰티 인플루언서 (3 members), 라이프스타일 크리에이터 (2 members)
- 1 campaign: 서머 런칭 2025 with 3 line items at various stages
- Sample content for first 5 influencers with thumbnail images