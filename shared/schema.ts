import { pgTable, text, serial, integer, boolean, timestamp, jsonb, date } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// === ENUMS ===
export const userRoleEnum = z.enum(["MASTER", "EDITOR", "VIEWER"]);
export const platformEnum = z.enum(["IG", "YT", "TikTok", "X", "Blog"]);
export const jobStatusEnum = z.enum(["pending", "processing", "completed", "failed"]);

// === USERS & WORKSPACES ===
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(), // bcrypt hash
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const workspaces = pgTable("workspaces", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  logo: text("logo"), // url
  createdAt: timestamp("created_at").defaultNow(),
});

export const workspaceMembers = pgTable("workspace_members", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  userId: integer("user_id").notNull(),
  role: text("role").notNull().default("VIEWER"), // MASTER, EDITOR, VIEWER
  joinedAt: timestamp("joined_at").defaultNow(),
});

// === INFLUENCERS ===
export const influencers = pgTable("influencers", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  tags: text("tags").array(),
  memo: text("memo"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const influencerAccounts = pgTable("influencer_accounts", {
  id: serial("id").primaryKey(),
  influencerId: integer("influencer_id").notNull(),
  platform: text("platform").notNull(), // IG, YT, etc
  handle: text("handle").notNull(),
  url: text("url").notNull(),
  category: text("category"),
  language: text("language"),
  verified: boolean("verified").default(false),
});

export const metricsSnapshots = pgTable("metrics_snapshots", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull(),
  date: timestamp("date").defaultNow(),
  followers: integer("followers").default(0),
  er: text("er"), // Engagement Rate (stored as string to preserve precision or %)
  avgViews: integer("avg_views").default(0),
  avgLikes: integer("avg_likes").default(0),
});

export const contents = pgTable("contents", {
  id: serial("id").primaryKey(),
  influencerId: integer("influencer_id").notNull(),
  thumbnail: text("thumbnail"),
  link: text("link").notNull(),
  publishedAt: timestamp("published_at"),
  metrics: jsonb("metrics"), // Flexible JSON for views, likes, comments
});

// === GROUPS ===
export const groups = pgTable("groups", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  columnSettings: jsonb("column_settings"), // Custom column order/visibility
  createdAt: timestamp("created_at").defaultNow(),
});

export const groupInfluencers = pgTable("group_influencers", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull(),
  influencerId: integer("influencer_id").notNull(),
});

// === CAMPAIGNS ===
export const campaigns = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  name: text("name").notNull(),
  client: text("client"),
  goal: text("goal"),
  budget: integer("budget").default(0),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  status: text("status").default("draft"), // draft, active, completed
  createdAt: timestamp("created_at").defaultNow(),
});

export const campaignInfluencers = pgTable("campaign_influencers", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull(),
  influencerId: integer("influencer_id").notNull(),
  status: text("status").default("contacted"), // contacted, negotiated, contracted, posted, paid
  contractStatus: text("contract_status").default("pending"), // pending, signed
  paymentStatus: text("payment_status").default("pending"), // pending, scheduled, paid
  payAmount: integer("pay_amount").default(0),
  docs: jsonb("docs"), // Array of { type: 'contract'|'invoice', url: string }
  contentLink: text("content_link"),
});

// === EMAIL INTERNALIZATION ===
export const emailAccounts = pgTable("email_accounts", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  email: text("email").notNull(),
  provider: text("provider").default("gmail"),
  accessToken: text("access_token"), // Encrypted in logic
  refreshToken: text("refresh_token"), // Encrypted in logic
  lastSyncedAt: timestamp("last_synced_at"),
});

export const emailThreads = pgTable("email_threads", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull(),
  threadId: text("thread_id").notNull(), // Gmail Thread ID
  subject: text("subject"),
  snippet: text("snippet"),
  lastMessageDate: timestamp("last_message_date"),
});

export const emailMessages = pgTable("email_messages", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id").notNull(), // FK to emailThreads.id (internal)
  gmailId: text("gmail_id").notNull(),
  from: text("from").notNull(),
  to: text("to").notNull(),
  subject: text("subject"),
  body: text("body"), // HTML or Text
  date: timestamp("date"),
});

// === TRACKING JOBS ===
export const trackingJobs = pgTable("tracking_jobs", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  name: text("name").notNull(),
  targetType: text("target_type").notNull(), // keyword, link, account, group, campaign
  targetId: integer("target_id"), // group or campaign id if applicable
  keywords: jsonb("keywords"), // { include: [], exclude: [] }
  period: jsonb("period"), // { type: 'fixed' | 'rolling', startDate, endDate, rollingDays }
  status: text("status").default("active"),
  lastRunAt: timestamp("last_run_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const trackingMetrics = pgTable("tracking_metrics", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull(),
  date: date("date").notNull(),
  value: integer("value").default(0), // Simplified metric
});

// === TIMELINE EVENTS (for influencer history) ===
export const timelineEvents = pgTable("timeline_events", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  influencerId: integer("influencer_id"),
  campaignId: integer("campaign_id"),
  lineItemId: integer("line_item_id"),
  eventType: text("event_type").notNull(), // campaign_assigned, email_sent, contract_signed, payment_completed, content_added, memo_updated, etc
  title: text("title").notNull(),
  description: text("description"),
  metadata: jsonb("metadata"), // flexible JSON for additional data
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: integer("created_by"), // user id
});

// === AUDIT LOGS (for all changes) ===
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  userId: integer("user_id"),
  action: text("action").notNull(), // create, update, delete, assign, upload, send
  entityType: text("entity_type").notNull(), // influencer, campaign, group, line_item, contract, settlement
  entityId: integer("entity_id").notNull(),
  oldValue: jsonb("old_value"),
  newValue: jsonb("new_value"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === NOTIFICATIONS ===
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  userId: integer("user_id"),
  type: text("type").notNull(), // payment_due, tracking_error, email_failed
  title: text("title").notNull(),
  message: text("message"),
  read: boolean("read").default(false),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});


// === RELATIONS ===
export const workspaceRelations = relations(workspaces, ({ many }) => ({
  members: many(workspaceMembers),
  influencers: many(influencers),
  groups: many(groups),
  campaigns: many(campaigns),
}));

export const influencerRelations = relations(influencers, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [influencers.workspaceId], references: [workspaces.id] }),
  accounts: many(influencerAccounts),
  contents: many(contents),
  groups: many(groupInfluencers),
  campaigns: many(campaignInfluencers),
}));

export const campaignRelations = relations(campaigns, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [campaigns.workspaceId], references: [workspaces.id] }),
  items: many(campaignInfluencers),
}));

export const campaignInfluencerRelations = relations(campaignInfluencers, ({ one }) => ({
  campaign: one(campaigns, { fields: [campaignInfluencers.campaignId], references: [campaigns.id] }),
  influencer: one(influencers, { fields: [campaignInfluencers.influencerId], references: [influencers.id] }),
}));

export const emailAccountRelations = relations(emailAccounts, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [emailAccounts.workspaceId], references: [workspaces.id] }),
  threads: many(emailThreads),
}));

export const emailThreadRelations = relations(emailThreads, ({ one, many }) => ({
  account: one(emailAccounts, { fields: [emailThreads.accountId], references: [emailAccounts.id] }),
  messages: many(emailMessages),
}));

export const emailMessageRelations = relations(emailMessages, ({ one }) => ({
  thread: one(emailThreads, { fields: [emailMessages.threadId], references: [emailThreads.id] }),
}));

// === SCHEMAS ===
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertWorkspaceSchema = createInsertSchema(workspaces).omit({ id: true, createdAt: true });
export const insertInfluencerSchema = createInsertSchema(influencers).omit({ id: true, createdAt: true });
export const insertInfluencerAccountSchema = createInsertSchema(influencerAccounts).omit({ id: true });
export const insertGroupSchema = createInsertSchema(groups).omit({ id: true, createdAt: true });
export const insertCampaignSchema = createInsertSchema(campaigns).omit({ id: true, createdAt: true });
export const insertEmailAccountSchema = createInsertSchema(emailAccounts).omit({ id: true, lastSyncedAt: true });
export const insertTrackingJobSchema = createInsertSchema(trackingJobs).omit({ id: true, lastRunAt: true, createdAt: true });
export const insertContentSchema = createInsertSchema(contents).omit({ id: true });
export const insertTimelineEventSchema = createInsertSchema(timelineEvents).omit({ id: true, createdAt: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });

// === TYPES ===
export type User = typeof users.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type Influencer = typeof influencers.$inferSelect;
export type InfluencerAccount = typeof influencerAccounts.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type GroupInfluencer = typeof groupInfluencers.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type CampaignInfluencer = typeof campaignInfluencers.$inferSelect;
export type Content = typeof contents.$inferSelect;
export type TimelineEvent = typeof timelineEvents.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type EmailAccount = typeof emailAccounts.$inferSelect;
export type EmailThread = typeof emailThreads.$inferSelect;
export type EmailMessage = typeof emailMessages.$inferSelect;
export type TrackingJob = typeof trackingJobs.$inferSelect;

export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertWorkspace = z.infer<typeof insertWorkspaceSchema>;
export type InsertInfluencer = z.infer<typeof insertInfluencerSchema>;
export type InsertContent = z.infer<typeof insertContentSchema>;
export type InsertTimelineEvent = z.infer<typeof insertTimelineEventSchema>;
export type InsertTrackingJob = z.infer<typeof insertTrackingJobSchema>;

// Account type without influencerId (assigned server-side)
export type CreateAccountInput = Omit<z.infer<typeof insertInfluencerAccountSchema>, 'influencerId'>;

export type CreateInfluencerWithAccounts = z.infer<typeof insertInfluencerSchema> & {
  accounts?: CreateAccountInput[];
};
