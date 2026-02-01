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
  contactPoint: text("contact_point"), // Email, phone, KakaoID, etc
  tags: text("tags").array(),
  memo: text("memo"),
  client: text("client"), // Client/advertiser name
  subType: text("sub_type"), // Category/type of influencer
  contactStatus: text("contact_status"), // Y, N, 진행중, 보류
  replyStatus: text("reply_status"), // Y, N, 진행중, 보류
  collabStatus: text("collab_status"), // Y, N, 진행중, 보류
  finalContentUrl: text("final_content_url"), // URL to final content
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
  followers: integer("followers").default(0),
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
  firstContactCompleted: boolean("first_contact_completed").default(false),
  firstContactAt: timestamp("first_contact_at"),
  firstContactMethod: text("first_contact_method"), // auto, manual
});

// === EMAIL INTERNALIZATION ===
export const emailAccounts = pgTable("email_accounts", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  email: text("email").notNull(),
  provider: text("provider").default("gmail"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  imapHost: text("imap_host"),
  imapPort: integer("imap_port"),
  smtpHost: text("smtp_host"),
  smtpPort: integer("smtp_port"),
  imapPassword: text("imap_password"),
  lastSyncedAt: timestamp("last_synced_at"),
});

// Campaign-LineItem based Conversations (for messenger-style threads)
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  campaignLineItemId: integer("campaign_line_item_id").notNull(),
  emailAccountId: integer("email_account_id"),
  subjectPrefix: text("subject_prefix"),
  gmailThreadId: text("gmail_thread_id"),
  lastMessageAt: timestamp("last_message_at"),
  status: text("status").default("active"), // active, unread, replied, no_response
  createdAt: timestamp("created_at").defaultNow(),
});

export const conversationMessages = pgTable("conversation_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull(),
  direction: text("direction").notNull(), // inbound, outbound
  snippet: text("snippet"),
  bodyHtml: text("body_html"),
  bodyText: text("body_text"),
  attachments: jsonb("attachments"),
  gmailMessageId: text("gmail_message_id"),
  gmailThreadId: text("gmail_thread_id"),
  sendStatus: text("send_status").default("sent"), // queued, sent, failed
  sentAt: timestamp("sent_at"),
  receivedAt: timestamp("received_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Email templates for quick sending
export const emailTemplates = pgTable("email_templates", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(), // first_contact, followup, contract_request, settlement_request
  subject: text("subject").notNull(),
  bodyHtml: text("body_html").notNull(),
  variables: text("variables").array(),
  createdAt: timestamp("created_at").defaultNow(),
});

// === BULK EMAIL SENDING ===
export const bulkEmailJobs = pgTable("bulk_email_jobs", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  campaignId: integer("campaign_id").notNull(),
  emailAccountId: integer("email_account_id").notNull(),
  templateSubject: text("template_subject").notNull(),
  templateBody: text("template_body").notNull(),
  totalCount: integer("total_count").default(0),
  sentCount: integer("sent_count").default(0),
  failedCount: integer("failed_count").default(0),
  skippedCount: integer("skipped_count").default(0),
  status: text("status").default("pending"), // pending, processing, completed, cancelled
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const bulkEmailQueueItems = pgTable("bulk_email_queue_items", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull(),
  campaignId: integer("campaign_id").notNull(),
  lineItemId: integer("line_item_id").notNull(),
  influencerId: integer("influencer_id").notNull(),
  email: text("email").notNull(),
  renderedSubject: text("rendered_subject").notNull(),
  renderedBody: text("rendered_body").notNull(),
  variables: jsonb("variables"), // { influencer_name, campaign_name, etc }
  status: text("status").default("queued"), // queued, sending, sent, failed, skipped
  reason: text("reason"), // skip/fail reason
  attempts: integer("attempts").default(0),
  lastAttemptAt: timestamp("last_attempt_at"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Legacy email tables (keeping for backwards compatibility)
export const emailThreads = pgTable("email_threads", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull(),
  threadId: text("thread_id").notNull(),
  subject: text("subject"),
  snippet: text("snippet"),
  lastMessageDate: timestamp("last_message_date"),
});

export const emailMessages = pgTable("email_messages", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id").notNull(),
  gmailId: text("gmail_id").notNull(),
  from: text("from").notNull(),
  to: text("to").notNull(),
  subject: text("subject"),
  body: text("body"),
  date: timestamp("date"),
});

// === CAMPAIGN CONTENTS ===
export const campaignContents = pgTable("campaign_contents", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull(),
  lineItemId: integer("line_item_id").notNull(),
  influencerId: integer("influencer_id").notNull(),
  platform: text("platform").notNull(), // IG, YT, TikTok, X, Blog
  contentUrl: text("content_url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  publishedAt: timestamp("published_at"),
  views: integer("views").default(0),
  likes: integer("likes").default(0),
  comments: integer("comments").default(0),
  shares: integer("shares").default(0),
  engagementRate: text("engagement_rate"), // stored as string like "3.5%"
  status: text("status").default("published"), // published, scheduled, draft
  memo: text("memo"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
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
  conversations: many(conversations),
}));

export const emailThreadRelations = relations(emailThreads, ({ one, many }) => ({
  account: one(emailAccounts, { fields: [emailThreads.accountId], references: [emailAccounts.id] }),
  messages: many(emailMessages),
}));

export const emailMessageRelations = relations(emailMessages, ({ one }) => ({
  thread: one(emailThreads, { fields: [emailMessages.threadId], references: [emailThreads.id] }),
}));

export const conversationRelations = relations(conversations, ({ one, many }) => ({
  lineItem: one(campaignInfluencers, { fields: [conversations.campaignLineItemId], references: [campaignInfluencers.id] }),
  emailAccount: one(emailAccounts, { fields: [conversations.emailAccountId], references: [emailAccounts.id] }),
  messages: many(conversationMessages),
}));

export const conversationMessageRelations = relations(conversationMessages, ({ one }) => ({
  conversation: one(conversations, { fields: [conversationMessages.conversationId], references: [conversations.id] }),
}));

export const campaignContentRelations = relations(campaignContents, ({ one }) => ({
  campaign: one(campaigns, { fields: [campaignContents.campaignId], references: [campaigns.id] }),
  lineItem: one(campaignInfluencers, { fields: [campaignContents.lineItemId], references: [campaignInfluencers.id] }),
  influencer: one(influencers, { fields: [campaignContents.influencerId], references: [influencers.id] }),
}));

// === SCHEMAS ===
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertWorkspaceSchema = createInsertSchema(workspaces).omit({ id: true, createdAt: true });
export const insertInfluencerSchema = createInsertSchema(influencers).omit({ id: true, createdAt: true });
export const insertInfluencerAccountSchema = createInsertSchema(influencerAccounts).omit({ id: true });
export const insertGroupSchema = createInsertSchema(groups).omit({ id: true, createdAt: true });
export const insertCampaignSchema = createInsertSchema(campaigns).omit({ id: true, createdAt: true });
export const insertEmailAccountSchema = createInsertSchema(emailAccounts).omit({ id: true, lastSyncedAt: true });
export const insertConversationSchema = createInsertSchema(conversations).omit({ id: true, createdAt: true });
export const insertConversationMessageSchema = createInsertSchema(conversationMessages).omit({ id: true, createdAt: true });
export const insertEmailTemplateSchema = createInsertSchema(emailTemplates).omit({ id: true, createdAt: true });
export const insertTrackingJobSchema = createInsertSchema(trackingJobs).omit({ id: true, lastRunAt: true, createdAt: true });
export const insertContentSchema = createInsertSchema(contents).omit({ id: true });
export const insertTimelineEventSchema = createInsertSchema(timelineEvents).omit({ id: true, createdAt: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });
export const insertBulkEmailJobSchema = createInsertSchema(bulkEmailJobs).omit({ id: true, createdAt: true, completedAt: true });
export const insertBulkEmailQueueItemSchema = createInsertSchema(bulkEmailQueueItems).omit({ id: true, createdAt: true });
export const insertCampaignContentSchema = createInsertSchema(campaignContents).omit({ id: true, createdAt: true, updatedAt: true });

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
export type Conversation = typeof conversations.$inferSelect;
export type ConversationMessage = typeof conversationMessages.$inferSelect;
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type TrackingJob = typeof trackingJobs.$inferSelect;
export type BulkEmailJob = typeof bulkEmailJobs.$inferSelect;
export type BulkEmailQueueItem = typeof bulkEmailQueueItems.$inferSelect;
export type CampaignContent = typeof campaignContents.$inferSelect;
export type InsertCampaignContent = z.infer<typeof insertCampaignContentSchema>;

export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type InsertConversationMessage = z.infer<typeof insertConversationMessageSchema>;
export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertWorkspace = z.infer<typeof insertWorkspaceSchema>;
export type InsertInfluencer = z.infer<typeof insertInfluencerSchema>;
export type InsertContent = z.infer<typeof insertContentSchema>;
export type InsertTimelineEvent = z.infer<typeof insertTimelineEventSchema>;
export type InsertTrackingJob = z.infer<typeof insertTrackingJobSchema>;
export type InsertBulkEmailJob = z.infer<typeof insertBulkEmailJobSchema>;
export type InsertBulkEmailQueueItem = z.infer<typeof insertBulkEmailQueueItemSchema>;

// Account type without influencerId (assigned server-side)
export type CreateAccountInput = Omit<z.infer<typeof insertInfluencerAccountSchema>, 'influencerId'>;

export type CreateInfluencerWithAccounts = z.infer<typeof insertInfluencerSchema> & {
  accounts?: CreateAccountInput[];
};
