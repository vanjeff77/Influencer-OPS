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
- **Authentication**: Google OAuth single sign-on using Passport.js. Users must be pre-registered by a workspace owner.
- **Authorization**: Three-tier Role-Based Access Control (RBAC): `WORKSPACE_OWNER`, `WORKSPACE_MEMBER`, `CLIENT`, and `PLATFORM_ADMIN`.
- **Email Services**: Dual-mode per account – Gmail API (via per-user OAuth refresh_token) or IMAP/SMTP. Features include bulk email sending with throttling and variable substitution, integrated messenger with Gmail syncing, and auto email sync via Gmail History API or IMAP.

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Management**: Drizzle Kit for migrations.
- **Key Data Models**: Users, Workspaces, Influencers, Groups, Campaigns, Email accounts, Threads, Messages, Tracking jobs, Feedback Notes, Bulk Email Jobs, Clients, ClientUserAssignments.

### Core Features & Technical Implementations
- **Campaign Operations**: Management of influencer line items, stages, communication, review, and deadlines.
- **Influencer Management**: Batch import with validation, Instagram URL normalization, and profile image auto-fetching from social media platforms with OneDrive caching.
- **Email Communication**: Features include attaching existing email threads, bulk email sending, integrated messenger with Gmail syncing, auto-email synchronization, and message soft-delete (hover trash icon on bubbles + delete button in full message dialog, `deletedAt` column on `conversation_messages`, `DELETE /api/messages/:messageId`).
- **Finance & Tracking**: Real-time finance summary, CSV export, and settlement management with workflow and role-based access.
- **Security**: IMAP password encryption (AES-256-CBC), Zod validation, authentication, and workspace authorization.
- **Influencer Submission Portal**: Public portal (`/submit/:campaignId`) with email verification, featuring a 4-button menu: settlement info entry (always fresh, no pre-fill), signed contract upload (OneDrive), content file upload (OneDrive), and post info entry (URL, Meta partnership code). Completion badges on settlement/contract/post info; upload count badge on content.
- **Contract Management**: CRUD operations for templates, rich text editor, variable substitution, and DOCX/PDF export.
- **Google Sheets Auto-Sync**: Syncs campaign influencer contract/settlement data to Google Sheets, triggered by data changes.
- **Client Management**: URL-based client logos, client manager assignment with multi-select, and auto-population of CC fields.
- **User Onboarding**: TourGuide component for walkthroughs and FeatureHint for contextual hints.
- **Slack Bot Integration**: Real-time Slack notifications for inbound emails with AI draft actions, client-specific channel routing, and thread-based notifications.
- **Email Sync Logging**: Tracks auto-sync cycles per account with status, synced message details, and timing in a dedicated log table.
- **AI Auto-Reply Draft Generation**: RAG-based generation using customizable email response frameworks and campaign-level AI instructions, supporting multiple LLM providers.
- **AI Influencer Discovery**: Tracks search jobs and candidates, utilizes RapidAPI for Instagram data, and employs an LLM-powered AI Analyzer for candidate scoring.

## External Dependencies

- **Database**: PostgreSQL
- **ORM**: Drizzle ORM
- **Authentication/Email Services**: Gmail OAuth / Google APIs client library
- **Email Transport**: Nodemailer
- **Charting**: Recharts
- **Excel Handling**: `xlsx`
- **Social Media APIs**: RapidAPI (instagram120), YouTube Data API
- **Cloud Storage**: OneDrive
- **LLM Providers**: Replit AI, OpenAI API, Anthropic API
- **Collaboration Tools**: Slack (for notifications)