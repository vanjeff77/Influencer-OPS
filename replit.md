# Influencer Management Platform

## Overview

This is a full-stack influencer management platform designed for agencies to manage influencer discovery, campaign and group management, email communications, performance tracking, and financial settlements. The platform supports multi-workspace environments with permissions, comprehensive influencer profile management across various platforms, an integrated email center with Gmail OAuth, and robust financial tracking. Its purpose is to streamline agency workflows, enhance influencer relationship management, and provide tools for campaign execution and financial oversight, with a mobile-optimized UI.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript (Vite)
- **Routing**: Wouter
- **State Management**: TanStack Query
- **UI Components**: shadcn/ui (Radix UI, Tailwind CSS custom theme)
- **Data Visualization**: Recharts
- **Internationalization**: Korean language support
- **UI/UX Decisions**: Responsive design, mobile-first navigation, consolidated detail drawers, WYSIWYG editor for emails.

### Backend
- **Framework**: Express.js with TypeScript
- **API Design**: RESTful API with typed route definitions
- **Authentication**: Passport.js (local strategy, session-based via PostgreSQL, 30-day cookie expiration)
- **Authorization**: Three-tier Role-Based Access Control (RBAC): `WORKSPACE_OWNER`, `WORKSPACE_MEMBER`, `CLIENT`, and `PLATFORM_ADMIN`.
- **Email Services**: IMAP for searching/fetching threads, SMTP queue-based system for bulk email sending with throttling and variable substitution.

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Management**: Drizzle Kit for migrations, schema defined in `shared/schema.ts`
- **Key Data Models**: Users, Workspaces, Influencers (multi-platform), Groups, Campaigns, Email accounts, Threads, Messages, Tracking jobs, Feedback Notes, Bulk Email Jobs, Clients, ClientUserAssignments.
- **Influencer Contact Fields**: Dedicated fields for `email` and `contactPoint`.

### Project Structure
- `client/`: React frontend
- `server/`: Express backend
- `shared/`: Shared code (schema, route definitions)
- `migrations/`: Database migration scripts

### Core Features & Technical Implementations
- **Campaign Operations**: Management of influencer line items, stages, communication, review, and deadlines.
- **Influencer Import**: Batch import with validation, platform normalization, duplicate detection, and partial success handling.
- **Instagram URL Normalization**: Utility to normalize Instagram handles across all save paths.
- **Email Communication**:
    - **Attach Existing Email Thread**: Wizard for linking external email threads via IMAP search.
    - **Bulk Email Sending**: Queue-based 1:1 delivery with throttling, WYSIWYG editor, variable substitution.
    - **Integrated Messenger**: 3-pane layout for campaign communication, Gmail syncing, influencer detail editing, and content sanitization.
    - **Auto Email Sync**: Gmail History API-based incremental sync with background worker and frontend auto-refresh. IMAP auto-sync via `fetchInboxReplies` (two-phase: headers-first matching, then full body fetch for matches only). 60-second sync interval with 45-second IMAP timeout. Supports both Gmail OAuth and IMAP provider accounts.
- **Mobile Optimization**: Fully responsive UI.
- **Influencer Campaign History**: Displays past campaigns and allows navigation to details.
- **Content Submission History**: Tracks influencer content submissions, supports multiple uploads, and integrates with review tracking.
- **Finance & Tracking**: Real-time finance summary and CSV export.
- **Settlement Management**: Finance page with work queue, settlement info editing, payout status workflow, and role-based access control.
- **Influencer Profile Image Auto-Fetch**:
    - **Schema**: `profileImageUrl` and `profileImageFileId` columns on `influencer_accounts` table.
    - **Service**: `server/profile-fetcher.ts` — RapidAPI (instagram120) for IG, YouTube Data API for YT.
    - **OneDrive Caching**: Images downloaded from CDN, uploaded to OneDrive `프로필사진/` folder, served via `/api/profile-image/:fileId` proxy endpoint (301 permanent redirect to OneDrive download URL with 1-year immutable cache + ETag).
    - **Client-Side Caching**: `CachedAvatar` component with IndexedDB-based image cache (`client/src/lib/image-cache.ts`). First load fetches from OneDrive, subsequent loads serve from IndexedDB instantly. Blob URL lifecycle managed with proper revocation.
    - **Auto-trigger**: On influencer account create/update, background fetch runs async.
    - **Manual APIs**: `POST /api/influencer-accounts/:id/refresh-profile-image`, `POST /api/workspaces/:workspaceId/influencers/refresh-all-profile-images`.
    - **Environment**: `RAPIDAPI_KEY` (secret) for Instagram, `YOUTUBE_API_KEY` (optional) for YouTube.
- **Security**: IMAP password encryption (AES-256-CBC), Zod validation, authentication and workspace authorization.
- **Contract Template Management**: CRUD operations for templates, rich text editor (TipTap), variable substitution, and dual DOCX/PDF export.
- **Client Logo Management**: URL-based client logos with live preview and integration into campaign UI.
- **User Onboarding System**: TourGuide component for step-by-step walkthroughs and FeatureHint for contextual hints.
- **Slack Bot for Email Notifications**:
    - **Service**: `server/slack-bot.ts` — real-time Slack notifications for inbound emails with AI draft actions.
    - **Channel Routing**: Client-specific channel mapping (`clients.slackChannelId`) with workspace-level fallback.
    - **Compact Messages**: 150-char body/draft previews with "전체 보기" button opening Slack modals for full content.
    - **AI Draft Actions**: Send draft (2-step confirmation), regenerate with feedback (modal), alternative classifications, dismiss. Progress indicator during generation.
    - **Settings UI**: Client Slack channel ID field in client edit dialog. Recent inbound messages table with resend test functionality.
    - **APIs**: `GET /api/workspaces/:workspaceId/recent-inbound-messages`, `POST /api/workspaces/:workspaceId/resend-slack-notification`.
- **AI Auto-Reply Draft Generation**:
    - **RAG-based**: Uses a customizable email response framework document and campaign-level AI instructions.
    - **LLM Provider Abstraction**: Supports Replit AI, OpenAI API, and Anthropic API.
    - **Draft Generator**: Builds prompts from various contexts, returns draft text and classification.
    - **Background Generation**: Async, non-blocking generation after inbound message sync.
    - **UI Integration**: Displays pending draft cards, allows user feedback for regeneration, and provides alternative classification options. Never auto-sends; user always reviews.

## External Dependencies

- **Database**: PostgreSQL
- **ORM**: Drizzle ORM
- **Authentication/Email Services**: Gmail OAuth / Google APIs client library
- **Email Transport**: Nodemailer
- **Charting**: Recharts
- **Excel Handling**: `xlsx`