import { pgTable, text, serial, integer, boolean, timestamp, jsonb, date } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// === ENUMS ===
export const userRoleEnum = z.enum(["MASTER", "EDITOR", "VIEWER"]); // Legacy, kept for compatibility
export const workspaceRoleEnum = z.enum(["WORKSPACE_OWNER", "WORKSPACE_MEMBER", "CLIENT"]);
export const platformEnum = z.enum(["IG", "YT", "TikTok", "X", "Blog"]);
export const jobStatusEnum = z.enum(["pending", "processing", "completed", "failed"]);

// Campaign status enum
export const campaignStatusEnum = z.enum(["대기중", "진행중", "완료"]);

// Campaign line item enums
export const stageEnum = z.enum(["선정완료", "오퍼확정", "계약진행", "일정확정", "초안수신", "피드백중", "완성본확정", "완료"]);
export const commStatusEnum = z.enum(["컨택전", "미응답", "협의중", "수락", "거절", "보류"]);
export const reviewStatusEnum = z.enum(["초안대기", "검토중", "피드백전달", "승인완료", "업로드완료"]);

// === SESSION (for connect-pg-simple) ===
export const session = pgTable("session", {
  sid: text("sid").primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire").notNull(),
});

// === USERS & WORKSPACES ===
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(), // bcrypt hash
  name: text("name").notNull(),
  isActive: boolean("is_active").default(true), // For account activation status
  isPlatformAdmin: boolean("is_platform_admin").default(false), // Platform-wide admin privileges
  onboardingCompleted: boolean("onboarding_completed").default(false), // Main tour completed
  dismissedHints: text("dismissed_hints").array().default([]), // Array of dismissed hint IDs
  createdAt: timestamp("created_at").defaultNow(),
});

export const workspaces = pgTable("workspaces", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  logo: text("logo"), // url
  tabDescriptions: jsonb("tab_descriptions").$type<Record<string, string>>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const workspaceMembers = pgTable("workspace_members", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  userId: integer("user_id").notNull(),
  role: text("role").notNull().default("WORKSPACE_MEMBER"), // WORKSPACE_OWNER, WORKSPACE_MEMBER, CLIENT
  joinedAt: timestamp("joined_at").defaultNow(),
});

// === CLIENTS (for access control scoping) ===
export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  memo: text("memo"),
  status: text("status").default("active"), // active, inactive
  createdAt: timestamp("created_at").defaultNow(),
});

// Client-User assignment (many-to-many for CLIENT role access control)
export const clientUserAssignments = pgTable("client_user_assignments", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  userId: integer("user_id").notNull(),
  workspaceId: integer("workspace_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Settlement type enum
export const settlementTypeEnum = z.enum(["사업자", "프리랜서"]);

// Payout status enum for campaign line items
export const payoutStatusEnum = z.enum(["정산정보미비", "증빙요청", "증빙수령", "지급대기", "지급완료", "보류"]);

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
  tag1: text("tag1"), // 태그1 (formerly subType)
  tag2: text("tag2"), // 태그2
  tag3: text("tag3"), // 태그3
  contactStatus: text("contact_status"), // Y, N, 진행중, 보류
  replyStatus: text("reply_status"), // Y, N, 진행중, 보류
  collabStatus: text("collab_status"), // Y, N, 진행중, 보류
  finalContentUrl: text("final_content_url"), // URL to final content
  
  // Price memo (단가 메모)
  priceMemo: text("price_memo"), // 단가 관련 내부 메모 (예: "YT 롱폼 350만+VAT, 릴스 150만")
  priceMemoUpdatedAt: timestamp("price_memo_updated_at"),
  priceMemoUpdatedByUserId: integer("price_memo_updated_by_user_id"),
  
  // Personal info
  birthDate: text("birth_date"), // 생년월일 (YYYY-MM-DD)
  
  // Settlement info (정산정보)
  settlementType: text("settlement_type"), // 사업자 | 프리랜서
  businessName: text("business_name"), // 사업자등록명/성명
  businessRegNo: text("business_reg_no"), // 사업자등록번호
  freelancerId: text("freelancer_id"), // 프리랜서 주민번호
  bankName: text("bank_name"), // 은행명
  accountHolder: text("account_holder"), // 예금주명
  accountNumber: text("account_number"), // 계좌번호
  settlementInfoUpdatedAt: timestamp("settlement_info_updated_at"),
  settlementInfoUpdatedByUserId: integer("settlement_info_updated_by_user_id"),
  
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
  clientId: integer("client_id"), // Foreign key to clients table for access control
  name: text("name").notNull(),
  client: text("client"), // Legacy: client name as text (kept for backwards compatibility)
  goal: text("goal"),
  budget: integer("budget").default(0),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  status: text("status").default("대기중"), // 대기중, 진행중, 완료
  createdAt: timestamp("created_at").defaultNow(),
});

export const campaignInfluencers = pgTable("campaign_influencers", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull(),
  influencerId: integer("influencer_id").notNull(),
  status: text("status").default("waiting"), // waiting, contacted, confirmed, contracted
  contractStatus: text("contract_status").default("pending"), // pending, signed
  paymentStatus: text("payment_status").default("pending"), // pending, scheduled, paid
  payAmount: integer("pay_amount").default(0),
  docs: jsonb("docs"), // Array of { type: 'contract'|'invoice', url: string }
  contentLink: text("content_link"),
  firstContactCompleted: boolean("first_contact_completed").default(false),
  firstContactAt: timestamp("first_contact_at"),
  firstContactMethod: text("first_contact_method"), // auto, manual
  
  // Operations stage (운영단계)
  stage: text("stage").default("선정완료"), // 선정완료, 오퍼확정, 계약진행, 일정확정, 초안수신, 피드백중, 완성본확정, 완료
  commStatus: text("comm_status").default("컨택전"), // 컨택전, 미응답, 협의중, 수락, 거절, 보류
  reviewStatus: text("review_status").default("초안대기"), // 초안대기, 검토중, 피드백전달, 승인완료, 업로드완료
  
  // Offer details (오퍼 확정)
  offerFee: integer("offer_fee"), // 진행비
  offerVatIncluded: boolean("offer_vat_included").default(false),
  offerUsageMonths: integer("offer_usage_months"), // 2차활용 기간(개월)
  offerUsageNote: text("offer_usage_note"), // 범위/조건 메모
  offerUsageRenewalFee: integer("offer_usage_renewal_fee"), // 2차활용 갱신 비용
  offerDeadlineNote: text("offer_deadline_note"), // 납기 메모
  
  // Contract details (계약)
  contractUrl: text("contract_url"),
  contractFileId: text("contract_file_id"),
  contractContent: text("contract_content"),
  contractTemplateId: integer("contract_template_id"),
  
  // Schedule (일정)
  draftDueAt: timestamp("draft_due_at"), // 초안 수신 예정일
  uploadDueAt: timestamp("upload_due_at"), // 업로드(게시) 예정일
  
  // Draft and final content (자료)
  draftUrl: text("draft_url"),
  draftFileId: text("draft_file_id"),
  finalUrl: text("final_url"), // 게시 URL / 완성본 링크
  finalFileId: text("final_file_id"),
  
  // Published confirmation (게시 확인)
  isPublishedConfirmed: boolean("is_published_confirmed").default(false),
  publishedConfirmedAt: timestamp("published_confirmed_at"),
  
  // Feedback summary (피드백 요약)
  feedbackSummary: text("feedback_summary"),
  feedbackSummaryUpdatedAt: timestamp("feedback_summary_updated_at"),
  
  // Last outbound for comm tracking
  lastOutboundAt: timestamp("last_outbound_at"),
  
  // Upload completion (업로드 완료 트리거)
  isUploadCompleted: boolean("is_upload_completed").default(false),
  uploadCompletedAt: timestamp("upload_completed_at"),
  uploadCompletedByUserId: integer("upload_completed_by_user_id"),
  
  // Settlement request (정산 요청)
  settlementRequested: boolean("settlement_requested").default(false),
  settlementRequestedAt: timestamp("settlement_requested_at"),
  settlementRequestedByUserId: integer("settlement_requested_by_user_id"),
  
  // Payout info (정산 정보)
  payoutStatus: text("payout_status").default("정산정보미비"), // 정산정보미비, 증빙요청, 증빙수령, 지급대기, 지급완료, 보류
  payoutAmountSupply: integer("payout_amount_supply"), // 공급가
  payoutVat: integer("payout_vat"), // VAT
  payoutTotal: integer("payout_total"), // 총액
  payoutMemo: text("payout_memo"),
  invoiceFileId: text("invoice_file_id"), // 세금계산서/청구서/증빙
  invoiceIssuedAt: timestamp("invoice_issued_at"),
  payoutDueAt: timestamp("payout_due_at"), // 지급예정일
  paidAt: timestamp("paid_at"), // 지급완료일
  transferProofFileId: text("transfer_proof_file_id"), // 이체확인증
  
  updatedAt: timestamp("updated_at").defaultNow(),
});

// === EMAIL INTERNALIZATION ===
export const emailAccounts = pgTable("email_accounts", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  userId: integer("user_id"), // Each user has their own email accounts
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
  signature: text("signature"), // Rich text email signature (HTML)
  useSignature: boolean("use_signature").default(true), // Whether to append signature to emails
});

// Campaign-LineItem based Conversations (for messenger-style threads)
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  campaignLineItemId: integer("campaign_line_item_id").notNull(),
  emailAccountId: integer("email_account_id"),
  subjectPrefix: text("subject_prefix"),
  gmailThreadId: text("gmail_thread_id"),
  lastMessageAt: timestamp("last_message_at"),
  lastReadAt: timestamp("last_read_at"),
  status: text("status").default("active"), // active, unread, replied, no_response
  createdAt: timestamp("created_at").defaultNow(),
});

export const conversationMessages = pgTable("conversation_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull(),
  direction: text("direction").notNull(), // inbound, outbound
  senderEmail: text("sender_email"),
  senderName: text("sender_name"),
  recipientEmail: text("recipient_email"), // To: field
  ccEmails: text("cc_emails").array(), // CC recipients
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
  description: text("description"),
  type: text("type").notNull(), // first_contact, followup, contract_request, settlement_request
  subject: text("subject").notNull(),
  bodyHtml: text("body_html").notNull(),
  variables: text("variables").array(),
  isDefault: boolean("is_default").default(false),
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
  cc: text("cc"),
  totalCount: integer("total_count").default(0),
  sentCount: integer("sent_count").default(0),
  failedCount: integer("failed_count").default(0),
  skippedCount: integer("skipped_count").default(0),
  status: text("status").default("pending"),
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

// === FEEDBACK NOTES (for campaign line item internal feedback) ===
export const feedbackNotes = pgTable("feedback_notes", {
  id: serial("id").primaryKey(),
  lineItemId: integer("line_item_id").notNull(), // campaignInfluencer id
  authorUserId: integer("author_user_id").notNull(),
  body: text("body").notNull(),
  isPinned: boolean("is_pinned").default(false),
  isSelectedForSummary: boolean("is_selected_for_summary").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// === CONTRACT TEMPLATES ===
export const contractTemplates = pgTable("contract_templates", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  content: text("content").notNull(), // Template content with {{variables}}
  variables: text("variables").array(), // List of available variables
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});


// === RELATIONS ===
export const workspaceRelations = relations(workspaces, ({ many }) => ({
  members: many(workspaceMembers),
  influencers: many(influencers),
  groups: many(groups),
  campaigns: many(campaigns),
  clients: many(clients),
}));

export const clientRelations = relations(clients, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [clients.workspaceId], references: [workspaces.id] }),
  assignments: many(clientUserAssignments),
}));

export const clientUserAssignmentRelations = relations(clientUserAssignments, ({ one }) => ({
  client: one(clients, { fields: [clientUserAssignments.clientId], references: [clients.id] }),
  user: one(users, { fields: [clientUserAssignments.userId], references: [users.id] }),
}));

export const workspaceMemberRelations = relations(workspaceMembers, ({ one }) => ({
  workspace: one(workspaces, { fields: [workspaceMembers.workspaceId], references: [workspaces.id] }),
  user: one(users, { fields: [workspaceMembers.userId], references: [users.id] }),
}));

export const userRelations = relations(users, ({ many }) => ({
  workspaces: many(workspaceMembers),
  clientAssignments: many(clientUserAssignments),
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
  client: one(clients, { fields: [campaigns.clientId], references: [clients.id] }),
  items: many(campaignInfluencers),
}));

export const campaignInfluencerRelations = relations(campaignInfluencers, ({ one }) => ({
  campaign: one(campaigns, { fields: [campaignInfluencers.campaignId], references: [campaigns.id] }),
  influencer: one(influencers, { fields: [campaignInfluencers.influencerId], references: [influencers.id] }),
}));

export const emailAccountRelations = relations(emailAccounts, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [emailAccounts.workspaceId], references: [workspaces.id] }),
  user: one(users, { fields: [emailAccounts.userId], references: [users.id] }),
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

export const feedbackNoteRelations = relations(feedbackNotes, ({ one }) => ({
  lineItem: one(campaignInfluencers, { fields: [feedbackNotes.lineItemId], references: [campaignInfluencers.id] }),
  author: one(users, { fields: [feedbackNotes.authorUserId], references: [users.id] }),
}));

export const contractTemplateRelations = relations(contractTemplates, ({ one }) => ({
  workspace: one(workspaces, { fields: [contractTemplates.workspaceId], references: [workspaces.id] }),
}));

// === SCHEMAS ===
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertWorkspaceSchema = createInsertSchema(workspaces).omit({ id: true, createdAt: true });
export const insertClientSchema = createInsertSchema(clients).omit({ id: true, createdAt: true });
export const insertClientUserAssignmentSchema = createInsertSchema(clientUserAssignments).omit({ id: true, createdAt: true });
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
export const insertFeedbackNoteSchema = createInsertSchema(feedbackNotes).omit({ id: true, createdAt: true });
export const insertCampaignInfluencerSchema = createInsertSchema(campaignInfluencers).omit({ id: true, updatedAt: true });
export const insertContractTemplateSchema = createInsertSchema(contractTemplates).omit({ id: true, createdAt: true, updatedAt: true });

// === TYPES ===
export type User = typeof users.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type ClientUserAssignment = typeof clientUserAssignments.$inferSelect;
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
export type FeedbackNote = typeof feedbackNotes.$inferSelect;
export type InsertCampaignContent = z.infer<typeof insertCampaignContentSchema>;
export type InsertFeedbackNote = z.infer<typeof insertFeedbackNoteSchema>;
export type InsertCampaignInfluencer = z.infer<typeof insertCampaignInfluencerSchema>;
export type ContractTemplate = typeof contractTemplates.$inferSelect;
export type InsertContractTemplate = z.infer<typeof insertContractTemplateSchema>;

export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type InsertConversationMessage = z.infer<typeof insertConversationMessageSchema>;
export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertWorkspace = z.infer<typeof insertWorkspaceSchema>;
export type InsertClient = z.infer<typeof insertClientSchema>;
export type InsertClientUserAssignment = z.infer<typeof insertClientUserAssignmentSchema>;
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

// === CONTENT SUBMISSIONS (인플루언서 콘텐츠 제출) ===
export const contentSubmissions = pgTable("content_submissions", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull(),
  lineItemId: integer("line_item_id").notNull(),
  influencerId: integer("influencer_id").notNull(),
  submissionType: text("submission_type").notNull(), // draft (초안), final (완성본)
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size"), // bytes
  oneDriveFolderId: text("onedrive_folder_id"),
  oneDriveFileId: text("onedrive_file_id"),
  oneDriveLink: text("onedrive_link"),
  memo: text("memo"),
  submittedAt: timestamp("submitted_at").defaultNow(),
  notifiedAt: timestamp("notified_at"), // 담당자에게 알림 발송 시간
});

export const insertContentSubmissionSchema = createInsertSchema(contentSubmissions).omit({ id: true, submittedAt: true });
export type InsertContentSubmission = z.infer<typeof insertContentSubmissionSchema>;
export type ContentSubmission = typeof contentSubmissions.$inferSelect;
