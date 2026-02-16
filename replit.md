# Influencer Management Platform

## Overview

This is a full-stack influencer management platform MVP designed for agencies to manage their influencer operations. It provides a complete workflow for influencer discovery, campaign and group management, email communications, performance tracking, and financial settlements. Key capabilities include multi-workspace support with permissions, comprehensive influencer profile management across various platforms, integrated email center with Gmail OAuth, and robust financial tracking. The platform aims to streamline agency workflows, enhance influencer relationship management, and provide powerful tools for campaign execution and financial oversight, with a mobile-optimized UI.

## User Preferences

Preferred communication style: Simple, everyday language.

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