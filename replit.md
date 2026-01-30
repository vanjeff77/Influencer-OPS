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