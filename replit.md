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
- **Email Services**: IMAP for searching/fetching threads, SMTP queue-based system for bulk email sending with throttling and variable substitution.

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Management**: Drizzle Kit for migrations, schema defined in `shared/schema.ts`
- **Key Data Models**: Users, Workspaces, Influencers (with multi-platform accounts), Groups, Campaigns (with line items), Email accounts, Threads, Messages, Tracking jobs, Feedback Notes, Bulk Email Jobs, Clients, ClientUserAssignments.

### Project Structure
- `client/`: React frontend
- `server/`: Express backend
- `shared/`: Code shared between client and server (e.g., schema, route definitions)
- `migrations/`: Database migration scripts

### Core Features & Technical Implementations
- **Campaign Operations**: Comprehensive management of influencer line items, including stages, communication status, review, and deadline tracking (D-day badges). Detailed panel with feedback notes and summary generation.
- **Influencer Import**: 4-step Excel paste import wizard with TSV parsing, validation, column recognition, platform normalization, and upsert logic.
- **Email Communication**:
    - **Attach Existing Email Thread**: Wizard for linking external email threads via IMAP search (recipient, subject, message ID) to campaign conversations, importing all messages.
    - **Bulk Email Sending**: Queue-based 1:1 email delivery with throttling, WYSIWYG editor, variable substitution, validation, and first contact tracking.
    - **Integrated Messenger**: 3-pane layout for real-time campaign communication, syncing with Gmail, influencer detail editing, and DOMPurify for content sanitization.
- **Mobile Optimization**: Fully responsive UI across all pages, components, and tables using Tailwind CSS for a consistent mobile-first experience.
- **Finance & Tracking**: Real-time finance summary, CSV export for tracking data.
- **Settlement Management (정산)**:
    - **Settlement Work Queue**: Finance page with KPI cards (pending count/total, incomplete info, hold count) and filterable work queue table showing upload-completed line items.
    - **Settlement Info on Influencers**: Accordion section in InfluencerDetailPanel for editing settlement type (사업자/프리랜서), bank info (은행명, 예금주, 계좌번호), business info (상호명, 사업자번호), or freelancer ID (주민등록번호).
    - **Payout Status Workflow**: Status enum (정산정보미비, 증빙요청, 증빙수령, 지급대기, 지급완료, 보류) with automatic status determination based on settlement info completeness when upload is marked completed.
    - **Role-Based Access Control**: CLIENT role blocked from settlement features; OWNER-only for "입금완료" confirmation; MEMBER+OWNER for payout updates.
    - **TSV Clipboard Copy**: Copy bank transfer data (bankName, accountNumber, accountHolder, amount) to clipboard for easy Excel paste.
- **Security**: IMAP password encryption (AES-256-CBC), Zod validation, authentication and workspace authorization checks for sensitive operations.

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