import { db } from "./db";
import {
  users, workspaces, workspaceMembers, influencers, influencerAccounts, groups, groupInfluencers, campaigns, campaignInfluencers,
  emailAccounts, emailThreads, trackingJobs, trackingMetrics, contents, timelineEvents, auditLogs, notifications,
  conversations, conversationMessages, emailTemplates, bulkEmailJobs, bulkEmailQueueItems, campaignContents, feedbackNotes,
  clients, clientUserAssignments, contractTemplates, contentSubmissions, aiDraftReplies, emailSyncLogs,
  type User, type InsertUser, type Workspace, type InsertWorkspace,
  type EmailSyncLog,
  type Client, type InsertClient, type ClientUserAssignment, type InsertClientUserAssignment,
  type Influencer, type CreateInfluencerWithAccounts, type InfluencerAccount,
  type Group, type GroupInfluencer, type Campaign, type CampaignInfluencer, type Content,
  type EmailAccount, type EmailThread, type EmailMessage, type TrackingJob, type InsertTrackingJob,
  type TimelineEvent, type InsertTimelineEvent, type AuditLog, type Notification,
  type Conversation, type ConversationMessage, type EmailTemplate,
  type InsertConversation, type InsertConversationMessage, type InsertEmailTemplate,
  type BulkEmailJob, type BulkEmailQueueItem, type InsertBulkEmailJob, type InsertBulkEmailQueueItem,
  type CampaignContent, type InsertCampaignContent,
  type FeedbackNote, type InsertFeedbackNote,
  type ContractTemplate, type InsertContractTemplate,
  type ContentSubmission, type InsertContentSubmission,
  type AiDraftReply, type InsertAiDraftReply,
  type AiSearchJob, type InsertAiSearchJob, type AiSearchCandidate, type InsertAiSearchCandidate,
  aiSearchJobs, aiSearchCandidates
} from "@shared/schema";
import { eq, like, or, and, sql, inArray, desc, isNull } from "drizzle-orm";
import { fetchProfileImage } from "./profile-fetcher";

export interface IStorage {
  // User & Workspace
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getWorkspaces(): Promise<Workspace[]>;
  createWorkspace(ws: InsertWorkspace): Promise<Workspace>;
  updateWorkspace(id: number, data: Partial<InsertWorkspace>): Promise<Workspace>;

  // Influencers
  getInfluencers(workspaceId: number, search?: string, filters?: { platform?: string; tags?: string[] }): Promise<(Influencer & { accounts: InfluencerAccount[] })[]>;
  getInfluencer(id: number): Promise<(Influencer & { accounts: InfluencerAccount[]; contents: Content[]; timeline: TimelineEvent[] }) | undefined>;
  createInfluencer(workspaceId: number, data: Omit<CreateInfluencerWithAccounts, 'workspaceId'>): Promise<Influencer & { accounts: InfluencerAccount[] }>;
  updateInfluencer(id: number, data: Partial<Influencer> & { accounts?: Array<{ platform: string; handle: string; url?: string }> }): Promise<Influencer & { accounts?: InfluencerAccount[] }>;
  deleteInfluencer(id: number): Promise<void>;

  // Influencer Contents
  getInfluencerContents(influencerId: number): Promise<Content[]>;
  createContent(data: Partial<Content>): Promise<Content>;
  deleteContent(id: number): Promise<void>;

  // Timeline Events
  getTimelineEvents(influencerId: number): Promise<TimelineEvent[]>;
  createTimelineEvent(data: InsertTimelineEvent): Promise<TimelineEvent>;

  // Groups
  getGroups(workspaceId: number): Promise<(Group & { memberCount: number })[]>;
  getGroup(id: number): Promise<(Group & { members: (GroupInfluencer & { influencer: Influencer & { accounts: InfluencerAccount[] } })[] }) | undefined>;
  createGroup(workspaceId: number, group: any): Promise<Group>;
  updateGroup(id: number, data: Partial<Group>): Promise<Group>;
  addInfluencersToGroup(groupId: number, influencerIds: number[]): Promise<void>;
  removeInfluencerFromGroup(groupId: number, influencerId: number): Promise<void>;
  
  // Campaigns
  getCampaigns(workspaceId: number): Promise<Campaign[]>;
  createCampaign(workspaceId: number, campaign: any): Promise<Campaign>;
  getCampaign(id: number): Promise<(Campaign & { items: (CampaignInfluencer & { influencer?: Influencer & { accounts: InfluencerAccount[] } })[] }) | undefined>;
  updateCampaign(id: number, data: Partial<Campaign>): Promise<Campaign>;
  deleteCampaign(id: number): Promise<void>;
  addInfluencersToCampaign(campaignId: number, influencerIds: number[]): Promise<CampaignInfluencer[]>;
  updateCampaignItem(id: number, updates: Partial<CampaignInfluencer>): Promise<CampaignInfluencer>;
  deleteCampaignItem(id: number): Promise<void>;
  getAllCampaignInfluencers(workspaceId: number): Promise<CampaignInfluencer[]>;
  getInfluencerCampaignHistory(influencerId: number, workspaceId: number): Promise<{
    id: number;
    campaignId: number;
    campaignName: string;
    clientName: string | null;
    status: string | null;
    offerFee: number | null;
    createdAt: Date | null;
  }[]>;

  // Workspace Memberships
  getWorkspaceMemberships(userId: number): Promise<{ workspaceId: number; role: string }[]>;

  // Email
  getEmailAccounts(userId: number, workspaceId: number): Promise<EmailAccount[]>;
  getEmailAccountById(accountId: number): Promise<EmailAccount | null>;
  createEmailAccount(userId: number, workspaceId: number, account: any): Promise<EmailAccount>;
  deleteEmailAccount(accountId: number): Promise<void>;
  updateEmailAccountSignature(accountId: number, data: { signature?: string | null; useSignature?: boolean }): Promise<EmailAccount>;
  getEmailThreads(accountId: number): Promise<EmailThread[]>;
  createEmailThread(thread: any): Promise<EmailThread>;
  
  // Tracking
  getTrackingJobs(workspaceId: number): Promise<TrackingJob[]>;
  getTrackingJob(id: number): Promise<TrackingJob | undefined>;
  createTrackingJob(workspaceId: number, job: Omit<InsertTrackingJob, 'workspaceId'>): Promise<TrackingJob>;
  updateTrackingJob(id: number, data: Partial<TrackingJob>): Promise<TrackingJob>;
  updateTrackingMetric(jobId: number, date: string, value: number): Promise<void>;
  getTrackingMetrics(jobId: number): Promise<{ date: string; value: number }[]>;

  // Finance/Aggregation
  getFinanceSummary(workspaceId: number, filters?: { month?: string; status?: string }): Promise<{
    pendingTotal: number;
    paidThisMonth: number;
    pendingCount: number;
    items: (CampaignInfluencer & { campaign?: Campaign; influencer?: Influencer })[];
  }>;

  // Settlement Work Queue (정산 작업큐)
  getSettlementWorkQueue(workspaceId: number, filters?: { 
    clientId?: number; 
    campaignId?: number; 
    payoutStatus?: string; 
    settlementInfoComplete?: boolean;
    uploadCompletedOnly?: boolean;
  }): Promise<{
    kpi: {
      pendingCount: number;
      pendingTotal: number;
      incompleteInfoCount: number;
      holdCount: number;
      settlementRequestCount: number;
      settlementRequestTotal: number;
    };
    items: (CampaignInfluencer & { 
      campaign?: Campaign; 
      influencer?: Influencer;
      client?: { id: number; name: string } | null;
      settlementInfoComplete: boolean;
    })[];
  }>;

  // Update line item payout info
  updateLineItemPayout(itemId: number, data: {
    payoutStatus?: string;
    payoutAmountSupply?: number;
    payoutVat?: number;
    payoutTotal?: number;
    payoutMemo?: string;
    invoiceFileId?: string;
    invoiceIssuedAt?: Date;
    payoutDueAt?: Date;
    paidAt?: Date;
    transferProofFileId?: string;
  }): Promise<CampaignInfluencer>;

  // Mark upload completed (triggers payout status)
  markUploadCompleted(itemId: number, userId: number, completed: boolean): Promise<CampaignInfluencer>;

  // Audit Logs
  createAuditLog(data: Partial<AuditLog>): Promise<AuditLog>;
  getAuditLogs(workspaceId: number, entityType?: string, entityId?: number): Promise<AuditLog[]>;

  // Bulk Email
  createBulkEmailJob(job: InsertBulkEmailJob): Promise<BulkEmailJob>;
  getBulkEmailJob(id: number): Promise<BulkEmailJob | undefined>;
  getBulkEmailJobs(campaignId: number): Promise<BulkEmailJob[]>;
  updateBulkEmailJob(id: number, data: Partial<BulkEmailJob>): Promise<BulkEmailJob>;
  createBulkEmailQueueItems(items: InsertBulkEmailQueueItem[]): Promise<BulkEmailQueueItem[]>;
  getBulkEmailQueueItems(jobId: number): Promise<BulkEmailQueueItem[]>;
  getNextPendingQueueItem(jobId: number): Promise<BulkEmailQueueItem | undefined>;
  updateBulkEmailQueueItem(id: number, data: Partial<BulkEmailQueueItem>): Promise<BulkEmailQueueItem>;
  getSentEmailsForCampaign(campaignId: number): Promise<{ influencerId: number; email: string }[]>;

  // Campaign Contents
  getCampaignContents(campaignId: number): Promise<(CampaignContent & { influencer?: Influencer })[]>;
  createCampaignContent(content: InsertCampaignContent): Promise<CampaignContent>;
  updateCampaignContent(id: number, data: Partial<CampaignContent>): Promise<CampaignContent>;
  deleteCampaignContent(id: number): Promise<void>;
  
  // Feedback Notes
  getFeedbackNotes(lineItemId: number): Promise<(FeedbackNote & { author?: User })[]>;
  createFeedbackNote(note: InsertFeedbackNote): Promise<FeedbackNote>;
  updateFeedbackNote(id: number, data: Partial<FeedbackNote>): Promise<FeedbackNote>;
  deleteFeedbackNote(id: number): Promise<void>;
  
  // Line Item Operations
  getLineItemWithDetails(id: number): Promise<(CampaignInfluencer & { 
    influencer?: Influencer & { accounts: InfluencerAccount[] };
    feedbackNotes?: (FeedbackNote & { author?: User })[];
  }) | undefined>;

  // Clients
  getClients(workspaceId: number): Promise<Client[]>;
  getClient(id: number): Promise<Client | undefined>;
  createClient(client: InsertClient): Promise<Client>;
  updateClient(id: number, data: Partial<Client>): Promise<Client>;
  deleteClient(id: number): Promise<void>;

  // Client-User Assignments
  getClientUserAssignments(workspaceId: number): Promise<(ClientUserAssignment & { client?: Client; user?: User })[]>;
  getUserClientAssignments(userId: number, workspaceId: number): Promise<ClientUserAssignment[]>;
  createClientUserAssignment(assignment: InsertClientUserAssignment): Promise<ClientUserAssignment>;
  deleteClientUserAssignment(id: number): Promise<void>;
  deleteClientUserAssignmentsByClient(clientId: number): Promise<void>;
  deleteClientUserAssignmentsByUser(userId: number, workspaceId: number): Promise<void>;

  // User Management
  getWorkspaceUsers(workspaceId: number): Promise<(User & { role: string; assignedClients?: Client[] })[]>;
  updateUser(id: number, data: Partial<User>): Promise<User>;
  updateWorkspaceMemberRole(userId: number, workspaceId: number, role: string): Promise<void>;
  createWorkspaceMember(userId: number, workspaceId: number, role: string): Promise<void>;
  getWorkspaceMember(userId: number, workspaceId: number): Promise<{ userId: number; workspaceId: number; role: string } | undefined>;
  getWorkspaceMembers(workspaceId: number): Promise<{ userId: number; workspaceId: number; role: string }[]>;
  deleteWorkspaceMember(userId: number, workspaceId: number): Promise<void>;

  // Contract Templates
  getContractTemplates(workspaceId: number): Promise<ContractTemplate[]>;
  getContractTemplate(id: number): Promise<ContractTemplate | undefined>;
  createContractTemplate(template: InsertContractTemplate): Promise<ContractTemplate>;
  updateContractTemplate(id: number, data: Partial<ContractTemplate>): Promise<ContractTemplate>;
  deleteContractTemplate(id: number): Promise<void>;

  // AI Draft Replies
  getAiDraft(id: number): Promise<AiDraftReply | undefined>;
  getLatestPendingDraft(conversationId: number): Promise<AiDraftReply | undefined>;
  getDraftByTriggerMessage(triggerMessageId: number): Promise<AiDraftReply | undefined>;
  createAiDraft(draft: InsertAiDraftReply): Promise<AiDraftReply>;
  updateAiDraft(id: number, data: Partial<AiDraftReply>): Promise<AiDraftReply>;
  getPendingDraftConversationIds(conversationIds: number[]): Promise<number[]>;

  // Email Sync Logs
  createEmailSyncLog(data: Partial<EmailSyncLog>): Promise<EmailSyncLog>;
  updateEmailSyncLog(id: number, data: Partial<EmailSyncLog>): Promise<EmailSyncLog>;
  getEmailSyncLogs(workspaceId: number, limit?: number, offset?: number): Promise<{ logs: EmailSyncLog[]; total: number }>;
  getEmailSyncLog(id: number): Promise<EmailSyncLog | undefined>;

  // AI Search
  createAiSearchJob(data: InsertAiSearchJob): Promise<AiSearchJob>;
  getAiSearchJob(id: number): Promise<AiSearchJob | undefined>;
  getAiSearchJobs(workspaceId: number): Promise<AiSearchJob[]>;
  updateAiSearchJob(id: number, data: Partial<AiSearchJob>): Promise<AiSearchJob>;
  createAiSearchCandidate(data: InsertAiSearchCandidate): Promise<AiSearchCandidate>;
  getAiSearchCandidates(jobId: number): Promise<AiSearchCandidate[]>;
  updateAiSearchCandidate(id: number, data: Partial<AiSearchCandidate>): Promise<AiSearchCandidate>;
  bulkCreateAiSearchCandidates(data: InsertAiSearchCandidate[]): Promise<AiSearchCandidate[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.googleId, googleId));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getWorkspaces(): Promise<Workspace[]> {
    return await db.select().from(workspaces);
  }

  async createWorkspace(ws: InsertWorkspace): Promise<Workspace> {
    const [w] = await db.insert(workspaces).values(ws).returning();
    return w;
  }

  async updateWorkspace(id: number, data: Partial<InsertWorkspace>): Promise<Workspace> {
    const [w] = await db.update(workspaces).set(data).where(eq(workspaces.id, id)).returning();
    return w;
  }

  async getInfluencers(workspaceId: number, search?: string, filters?: { platform?: string; tags?: string[] }): Promise<(Influencer & { accounts: InfluencerAccount[] })[]> {
    let results = await db.select().from(influencers).where(eq(influencers.workspaceId, workspaceId));
    
    if (search) {
      const searchLower = search.toLowerCase();
      results = results.filter(i => 
        i.name.toLowerCase().includes(searchLower) || 
        (i.email && i.email.toLowerCase().includes(searchLower))
      );
    }

    if (results.length === 0) {
      return [];
    }

    const allAccounts = await db.select().from(influencerAccounts).where(
      inArray(influencerAccounts.influencerId, results.map(i => i.id))
    );

    let enrichedResults = results.map(inf => ({
      ...inf,
      accounts: allAccounts.filter(a => a.influencerId === inf.id)
    }));

    // Filter by platform if specified
    if (filters?.platform) {
      enrichedResults = enrichedResults.filter(i => 
        i.accounts.some(a => a.platform === filters.platform)
      );
    }

    return enrichedResults;
  }

  async getInfluencer(id: number): Promise<(Influencer & { accounts: InfluencerAccount[]; contents: Content[]; timeline: TimelineEvent[] }) | undefined> {
    const [inf] = await db.select().from(influencers).where(eq(influencers.id, id));
    if (!inf) return undefined;
    
    const accounts = await db.select().from(influencerAccounts).where(eq(influencerAccounts.influencerId, id));
    const contentList = await db.select().from(contents).where(eq(contents.influencerId, id)).orderBy(desc(contents.publishedAt));
    const timeline = await db.select().from(timelineEvents).where(eq(timelineEvents.influencerId, id)).orderBy(desc(timelineEvents.createdAt));
    
    return { ...inf, accounts, contents: contentList, timeline };
  }

  async createInfluencer(workspaceId: number, data: Omit<CreateInfluencerWithAccounts, 'workspaceId'>): Promise<Influencer & { accounts: InfluencerAccount[] }> {
    const { accounts, ...infData } = data;
    const [inf] = await db.insert(influencers).values({ ...infData, workspaceId }).returning();
    
    let createdAccounts: InfluencerAccount[] = [];
    if (accounts && accounts.length > 0) {
      createdAccounts = await db.insert(influencerAccounts).values(
        accounts.map(a => ({ ...a, influencerId: inf.id }))
      ).returning();
      this.fetchAndUpdateProfileImages(createdAccounts);
    }
    return { ...inf, accounts: createdAccounts };
  }

  async updateInfluencer(id: number, data: Partial<Influencer> & { accounts?: Array<{ platform: string; handle: string; url?: string; followers?: number | null }> }): Promise<Influencer & { accounts?: InfluencerAccount[] }> {
    const { accounts: newAccounts, ...influencerData } = data as any;
    const [inf] = await db.update(influencers).set(influencerData).where(eq(influencers.id, id)).returning();
    
    if (newAccounts !== undefined) {
      await db.delete(influencerAccounts).where(eq(influencerAccounts.influencerId, id));
      const createdAccounts: InfluencerAccount[] = [];
      for (const acc of newAccounts) {
        const [account] = await db.insert(influencerAccounts).values({
          influencerId: id,
          platform: acc.platform,
          handle: acc.handle,
          url: acc.url || null,
          followers: acc.followers || null
        }).returning();
        createdAccounts.push(account);
      }
      this.fetchAndUpdateProfileImages(createdAccounts);
      return { ...inf, accounts: createdAccounts };
    }
    
    return inf;
  }

  async deleteInfluencer(id: number): Promise<void> {
    // Delete related data first (cascade manually)
    await db.delete(influencerAccounts).where(eq(influencerAccounts.influencerId, id));
    await db.delete(contents).where(eq(contents.influencerId, id));
    await db.delete(timelineEvents).where(eq(timelineEvents.influencerId, id));
    await db.delete(groupInfluencers).where(eq(groupInfluencers.influencerId, id));
    await db.delete(campaignInfluencers).where(eq(campaignInfluencers.influencerId, id));
    // Finally delete the influencer
    await db.delete(influencers).where(eq(influencers.id, id));
  }

  async getInfluencerContents(influencerId: number): Promise<Content[]> {
    return await db.select().from(contents).where(eq(contents.influencerId, influencerId)).orderBy(desc(contents.publishedAt));
  }

  async createContent(data: Partial<Content>): Promise<Content> {
    const [content] = await db.insert(contents).values(data as any).returning();
    return content;
  }

  async deleteContent(id: number): Promise<void> {
    await db.delete(contents).where(eq(contents.id, id));
  }

  async getTimelineEvents(influencerId: number): Promise<TimelineEvent[]> {
    return await db.select().from(timelineEvents).where(eq(timelineEvents.influencerId, influencerId)).orderBy(desc(timelineEvents.createdAt));
  }

  async createTimelineEvent(data: InsertTimelineEvent): Promise<TimelineEvent> {
    const [event] = await db.insert(timelineEvents).values(data).returning();
    return event;
  }

  async getGroups(workspaceId: number): Promise<(Group & { memberCount: number })[]> {
    const groupList = await db.select().from(groups).where(eq(groups.workspaceId, workspaceId));
    
    // Get member counts
    const memberCounts = await db.select({
      groupId: groupInfluencers.groupId,
      count: sql<number>`count(*)::int`
    }).from(groupInfluencers).groupBy(groupInfluencers.groupId);
    
    const countMap = new Map(memberCounts.map(m => [m.groupId, m.count]));
    
    return groupList.map(g => ({
      ...g,
      memberCount: countMap.get(g.id) || 0
    }));
  }

  async getGroup(id: number): Promise<(Group & { members: (GroupInfluencer & { influencer: Influencer & { accounts: InfluencerAccount[] } })[] }) | undefined> {
    const [group] = await db.select().from(groups).where(eq(groups.id, id));
    if (!group) return undefined;
    
    const memberships = await db.select().from(groupInfluencers).where(eq(groupInfluencers.groupId, id));
    
    if (memberships.length === 0) {
      return { ...group, members: [] };
    }
    
    const influencerIds = memberships.map(m => m.influencerId);
    const influencerList = await db.select().from(influencers).where(inArray(influencers.id, influencerIds));
    const allAccounts = await db.select().from(influencerAccounts).where(inArray(influencerAccounts.influencerId, influencerIds));
    
    const members = memberships.map(m => ({
      ...m,
      influencer: {
        ...influencerList.find(i => i.id === m.influencerId)!,
        accounts: allAccounts.filter(a => a.influencerId === m.influencerId)
      }
    }));
    
    return { ...group, members };
  }

  async createGroup(workspaceId: number, group: any): Promise<Group> {
    const [g] = await db.insert(groups).values({ ...group, workspaceId }).returning();
    return g;
  }

  async updateGroup(id: number, data: Partial<Group>): Promise<Group> {
    const [g] = await db.update(groups).set(data).where(eq(groups.id, id)).returning();
    return g;
  }

  async addInfluencersToGroup(groupId: number, influencerIds: number[]): Promise<void> {
    // Check existing to avoid duplicates
    const existing = await db.select().from(groupInfluencers).where(eq(groupInfluencers.groupId, groupId));
    const existingIds = new Set(existing.map(e => e.influencerId));
    
    const newIds = influencerIds.filter(id => !existingIds.has(id));
    if (newIds.length > 0) {
      await db.insert(groupInfluencers).values(newIds.map(influencerId => ({ groupId, influencerId })));
    }
  }

  async removeInfluencerFromGroup(groupId: number, influencerId: number): Promise<void> {
    await db.delete(groupInfluencers).where(
      and(eq(groupInfluencers.groupId, groupId), eq(groupInfluencers.influencerId, influencerId))
    );
  }

  async getCampaigns(workspaceId: number): Promise<Campaign[]> {
    return await db.select().from(campaigns).where(eq(campaigns.workspaceId, workspaceId));
  }

  async createCampaign(workspaceId: number, campaign: any): Promise<Campaign> {
    const [c] = await db.insert(campaigns).values({ 
      ...campaign, 
      workspaceId,
      status: campaign.status || "대기중"
    }).returning();
    return c;
  }

  async getCampaign(id: number): Promise<(Campaign & { items: (CampaignInfluencer & { influencer?: Influencer & { accounts: InfluencerAccount[] } })[] }) | undefined> {
    const [c] = await db.select().from(campaigns).where(eq(campaigns.id, id));
    if (!c) return undefined;
    
    const items = await db.select().from(campaignInfluencers).where(eq(campaignInfluencers.campaignId, id));
    
    if (items.length === 0) {
      return { ...c, items: [] };
    }
    
    const influencerIds = items.map(i => i.influencerId);
    const influencerList = await db.select().from(influencers).where(inArray(influencers.id, influencerIds));
    const allAccounts = await db.select().from(influencerAccounts).where(inArray(influencerAccounts.influencerId, influencerIds));
    
    const enrichedItems = items.map(item => ({
      ...item,
      influencer: {
        ...influencerList.find(i => i.id === item.influencerId)!,
        accounts: allAccounts.filter(a => a.influencerId === item.influencerId)
      }
    }));
    
    return { ...c, items: enrichedItems };
  }

  async updateCampaign(id: number, data: Partial<Campaign>): Promise<Campaign> {
    const [c] = await db.update(campaigns).set(data).where(eq(campaigns.id, id)).returning();
    return c;
  }

  async deleteCampaign(id: number): Promise<void> {
    await db.delete(campaignInfluencers).where(eq(campaignInfluencers.campaignId, id));
    await db.delete(campaigns).where(eq(campaigns.id, id));
  }

  async addInfluencersToCampaign(campaignId: number, influencerIds: number[]): Promise<CampaignInfluencer[]> {
    // Check existing to avoid duplicates
    const existing = await db.select().from(campaignInfluencers).where(eq(campaignInfluencers.campaignId, campaignId));
    const existingIds = new Set(existing.map(e => e.influencerId));
    
    const newIds = influencerIds.filter(id => !existingIds.has(id));
    if (newIds.length === 0) return [];
    
    const items = await db.insert(campaignInfluencers).values(
      newIds.map(influencerId => ({ 
        campaignId, 
        influencerId,
        status: 'waiting',
        contractStatus: 'pending',
        paymentStatus: 'pending',
        offerFee: 0
      }))
    ).returning();
    
    return items;
  }

  async updateCampaignItem(id: number, updates: Partial<CampaignInfluencer>): Promise<CampaignInfluencer> {
    const [item] = await db.update(campaignInfluencers).set(updates).where(eq(campaignInfluencers.id, id)).returning();
    return item;
  }

  async deleteCampaignItem(id: number): Promise<void> {
    await db.delete(campaignInfluencers).where(eq(campaignInfluencers.id, id));
  }

  async getAllCampaignInfluencers(workspaceId: number): Promise<CampaignInfluencer[]> {
    const workspaceCampaigns = await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.workspaceId, workspaceId));
    const campaignIds = workspaceCampaigns.map(c => c.id);
    if (campaignIds.length === 0) return [];
    return await db.select().from(campaignInfluencers).where(inArray(campaignInfluencers.campaignId, campaignIds));
  }

  async getInfluencerCampaignHistory(influencerId: number, workspaceId: number): Promise<{
    id: number;
    campaignId: number;
    campaignName: string;
    clientName: string | null;
    status: string | null;
    offerFee: number | null;
    createdAt: Date | null;
  }[]> {
    const results = await db.select({
      id: campaignInfluencers.id,
      campaignId: campaignInfluencers.campaignId,
      campaignName: campaigns.name,
      clientName: clients.name,
      status: campaignInfluencers.status,
      offerFee: campaignInfluencers.offerFee,
      createdAt: campaigns.createdAt
    })
      .from(campaignInfluencers)
      .innerJoin(campaigns, eq(campaignInfluencers.campaignId, campaigns.id))
      .leftJoin(clients, eq(campaigns.clientId, clients.id))
      .where(and(
        eq(campaignInfluencers.influencerId, influencerId),
        eq(campaigns.workspaceId, workspaceId)
      ))
      .orderBy(desc(campaigns.createdAt));
    return results;
  }

  async getWorkspaceMemberships(userId: number): Promise<{ workspaceId: number; role: string }[]> {
    return await db.select({
      workspaceId: workspaceMembers.workspaceId,
      role: workspaceMembers.role
    }).from(workspaceMembers).where(eq(workspaceMembers.userId, userId));
  }

  async getEmailAccounts(userId: number, workspaceId: number): Promise<EmailAccount[]> {
    return await db.select().from(emailAccounts).where(
      and(eq(emailAccounts.userId, userId), eq(emailAccounts.workspaceId, workspaceId))
    );
  }

  async getEmailAccountById(accountId: number): Promise<EmailAccount | null> {
    const [account] = await db.select().from(emailAccounts).where(eq(emailAccounts.id, accountId));
    return account || null;
  }

  async createEmailAccount(userId: number, workspaceId: number, account: any): Promise<EmailAccount> {
    const [a] = await db.insert(emailAccounts).values({ ...account, userId, workspaceId }).returning();
    return a;
  }

  async deleteEmailAccount(accountId: number): Promise<void> {
    await db.delete(emailThreads).where(eq(emailThreads.accountId, accountId));
    await db.delete(emailAccounts).where(eq(emailAccounts.id, accountId));
  }

  async getAllGmailAccounts(): Promise<EmailAccount[]> {
    return await db.select().from(emailAccounts).where(eq(emailAccounts.provider, 'gmail'));
  }

  async updateEmailAccountHistoryId(accountId: number, historyId: string): Promise<void> {
    await db.update(emailAccounts)
      .set({ lastHistoryId: historyId, lastSyncedAt: new Date() })
      .where(eq(emailAccounts.id, accountId));
  }

  async getConversationByGmailThreadId(threadId: string): Promise<Conversation | undefined> {
    const [conv] = await db.select().from(conversations).where(eq(conversations.gmailThreadId, threadId));
    return conv;
  }

  async getAllImapAccounts(): Promise<EmailAccount[]> {
    return await db.select().from(emailAccounts).where(eq(emailAccounts.provider, 'imap'));
  }

  async getActiveConversationsForImapSync(accountId: number, accountEmail: string): Promise<{ id: number; emailAccountId: number | null; campaignLineItemId: number }[]> {
    const byAccount = await db
      .select({
        id: conversations.id,
        emailAccountId: conversations.emailAccountId,
        campaignLineItemId: conversations.campaignLineItemId,
      })
      .from(conversations)
      .where(
        and(
          eq(conversations.emailAccountId, accountId),
          or(eq(conversations.status, 'active'), eq(conversations.status, 'replied'))
        )
      );

    const bySender = await db
      .select({
        id: conversations.id,
        emailAccountId: conversations.emailAccountId,
        campaignLineItemId: conversations.campaignLineItemId,
      })
      .from(conversations)
      .innerJoin(conversationMessages, eq(conversationMessages.conversationId, conversations.id))
      .where(
        and(
          sql`${conversations.emailAccountId} IS NULL`,
          eq(conversationMessages.direction, 'outbound'),
          eq(conversationMessages.senderEmail, accountEmail),
          or(eq(conversations.status, 'active'), eq(conversations.status, 'replied'))
        )
      );

    const seen = new Set(byAccount.map(c => c.id));
    const combined = [...byAccount];
    for (const c of bySender) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        combined.push(c);
      }
    }
    return combined;
  }

  async getAllActiveConversationsWithGmailThread(): Promise<(Conversation & { emailAccount?: EmailAccount })[]> {
    const results = await db
      .select()
      .from(conversations)
      .where(
        and(
          sql`${conversations.gmailThreadId} IS NOT NULL`,
          eq(conversations.status, 'active')
        )
      );
    return results as any;
  }

  async getConversationsWithoutGmailThread(): Promise<{ id: number; emailAccountId: number | null; influencerEmail: string | null; campaignLineItemId: number }[]> {
    const results = await db
      .select({
        id: conversations.id,
        emailAccountId: conversations.emailAccountId,
        influencerEmail: influencers.email,
        campaignLineItemId: conversations.campaignLineItemId,
      })
      .from(conversations)
      .innerJoin(campaignInfluencers, eq(conversations.campaignLineItemId, campaignInfluencers.id))
      .innerJoin(influencers, eq(campaignInfluencers.influencerId, influencers.id))
      .where(
        and(
          sql`${conversations.gmailThreadId} IS NULL`,
          eq(conversations.status, 'active')
        )
      );
    return results;
  }

  async updateEmailAccountSignature(accountId: number, data: { signature?: string | null; useSignature?: boolean }): Promise<EmailAccount> {
    const [updated] = await db.update(emailAccounts)
      .set(data)
      .where(eq(emailAccounts.id, accountId))
      .returning();
    return updated;
  }

  async getEmailThreads(accountId: number): Promise<EmailThread[]> {
    return await db.select().from(emailThreads).where(eq(emailThreads.accountId, accountId));
  }

  async createEmailThread(thread: any): Promise<EmailThread> {
    const [t] = await db.insert(emailThreads).values(thread).returning();
    return t;
  }

  async getTrackingJobs(workspaceId: number): Promise<TrackingJob[]> {
    return await db.select().from(trackingJobs).where(eq(trackingJobs.workspaceId, workspaceId));
  }

  async getTrackingJob(id: number): Promise<TrackingJob | undefined> {
    const [job] = await db.select().from(trackingJobs).where(eq(trackingJobs.id, id));
    return job;
  }

  async createTrackingJob(workspaceId: number, job: Omit<InsertTrackingJob, 'workspaceId'>): Promise<TrackingJob> {
    const [j] = await db.insert(trackingJobs).values({ ...job, workspaceId }).returning();
    return j;
  }

  async updateTrackingJob(id: number, data: Partial<TrackingJob>): Promise<TrackingJob> {
    const [j] = await db.update(trackingJobs).set(data).where(eq(trackingJobs.id, id)).returning();
    return j;
  }

  async updateTrackingMetric(jobId: number, dateStr: string, value: number): Promise<void> {
    await db.insert(trackingMetrics).values({ jobId, date: dateStr, value }).onConflictDoNothing();
  }

  async getTrackingMetrics(jobId: number): Promise<{ date: string; value: number }[]> {
    const metrics = await db.select().from(trackingMetrics).where(eq(trackingMetrics.jobId, jobId));
    return metrics.map(m => ({ date: m.date, value: m.value || 0 }));
  }

  async getFinanceSummary(workspaceId: number, filters?: { month?: string; status?: string }): Promise<{
    pendingTotal: number;
    paidThisMonth: number;
    pendingCount: number;
    items: (CampaignInfluencer & { campaign?: Campaign; influencer?: Influencer })[];
  }> {
    // Get all campaigns for workspace
    const campaignList = await db.select().from(campaigns).where(eq(campaigns.workspaceId, workspaceId));
    if (campaignList.length === 0) {
      return { pendingTotal: 0, paidThisMonth: 0, pendingCount: 0, items: [] };
    }
    
    const campaignIds = campaignList.map(c => c.id);
    let items = await db.select().from(campaignInfluencers).where(inArray(campaignInfluencers.campaignId, campaignIds));
    
    // Filter by status if specified
    if (filters?.status) {
      items = items.filter(i => i.paymentStatus === filters.status);
    }
    
    // Get influencer data
    const influencerIds = Array.from(new Set(items.map(i => i.influencerId)));
    const influencerList = influencerIds.length > 0 
      ? await db.select().from(influencers).where(inArray(influencers.id, influencerIds))
      : [];
    
    const enrichedItems = items.map(item => ({
      ...item,
      campaign: campaignList.find(c => c.id === item.campaignId),
      influencer: influencerList.find(i => i.id === item.influencerId)
    }));
    
    const pendingItems = enrichedItems.filter(i => i.paymentStatus !== 'paid');
    const paidItems = enrichedItems.filter(i => i.paymentStatus === 'paid');
    
    return {
      pendingTotal: pendingItems.reduce((sum, i) => sum + (i.offerFee || 0), 0),
      paidThisMonth: paidItems.reduce((sum, i) => sum + (i.offerFee || 0), 0),
      pendingCount: pendingItems.length,
      items: enrichedItems
    };
  }

  // Settlement Work Queue implementation
  async getSettlementWorkQueue(workspaceId: number, filters?: { 
    clientId?: number; 
    campaignId?: number; 
    payoutStatus?: string; 
    settlementInfoComplete?: boolean;
    uploadCompletedOnly?: boolean;
  }): Promise<{
    kpi: {
      pendingCount: number;
      pendingTotal: number;
      incompleteInfoCount: number;
      holdCount: number;
      settlementRequestCount: number;
      settlementRequestTotal: number;
    };
    items: (CampaignInfluencer & { 
      campaign?: Campaign; 
      influencer?: Influencer;
      client?: { id: number; name: string } | null;
      settlementInfoComplete: boolean;
    })[];
  }> {
    const campaignList = await db.select().from(campaigns).where(eq(campaigns.workspaceId, workspaceId));
    if (campaignList.length === 0) {
      return { kpi: { pendingCount: 0, pendingTotal: 0, incompleteInfoCount: 0, holdCount: 0, settlementRequestCount: 0, settlementRequestTotal: 0 }, items: [] };
    }
    
    // Get clients for the workspace
    const clientList = await db.select().from(clients).where(eq(clients.workspaceId, workspaceId));
    
    let campaignIds = campaignList.map(c => c.id);
    
    // Filter by clientId if specified
    if (filters?.clientId) {
      campaignIds = campaignList.filter(c => c.clientId === filters.clientId).map(c => c.id);
    }
    
    // Filter by campaignId if specified
    if (filters?.campaignId) {
      campaignIds = campaignIds.filter(id => id === filters.campaignId);
    }
    
    if (campaignIds.length === 0) {
      return { kpi: { pendingCount: 0, pendingTotal: 0, incompleteInfoCount: 0, holdCount: 0, settlementRequestCount: 0, settlementRequestTotal: 0 }, items: [] };
    }
    
    let allItems = await db.select().from(campaignInfluencers).where(inArray(campaignInfluencers.campaignId, campaignIds));
    
    // Filter by uploadCompletedOnly (default true) - applies to both KPI and list
    if (filters?.uploadCompletedOnly !== false) {
      allItems = allItems.filter(i => i.isUploadCompleted);
    }
    
    // Get influencer data for ALL items (before payoutStatus filtering)
    const allInfluencerIds = Array.from(new Set(allItems.map(i => i.influencerId)));
    const influencerList = allInfluencerIds.length > 0 
      ? await db.select().from(influencers).where(inArray(influencers.id, allInfluencerIds))
      : [];
    
    // Helper to check if settlement info is complete
    const isSettlementInfoComplete = (inf: Influencer | undefined): boolean => {
      if (!inf) return false;
      const hasBank = !!inf.bankName && !!inf.accountHolder && !!inf.accountNumber;
      if (inf.settlementType === '사업자') {
        return hasBank && !!inf.businessName && !!inf.businessRegNo;
      } else if (inf.settlementType === '프리랜서') {
        return hasBank && !!inf.freelancerId;
      }
      return false;
    };
    
    // Enrich ALL items for KPI calculation
    const allEnrichedItems = allItems.map(item => {
      const campaign = campaignList.find(c => c.id === item.campaignId);
      const influencer = influencerList.find(i => i.id === item.influencerId);
      const client = campaign?.clientId ? clientList.find(c => c.id === campaign.clientId) : null;
      
      return {
        ...item,
        campaign,
        influencer,
        client: client ? { id: client.id, name: client.name } : null,
        settlementInfoComplete: isSettlementInfoComplete(influencer)
      };
    });
    
    // Calculate KPI from ALL items (before payoutStatus filtering)
    const pendingItems = allEnrichedItems.filter(i => i.payoutStatus === '지급대기');
    const incompleteInfoItems = allEnrichedItems.filter(i => !i.settlementInfoComplete || i.payoutStatus === '정산정보미비');
    const holdItems = allEnrichedItems.filter(i => i.payoutStatus === '보류');
    const settlementRequestItems = allEnrichedItems.filter(i => i.payoutStatus === '정산요청');
    
    // Now apply payoutStatus filter for the returned items list
    let filteredItems = allEnrichedItems;
    if (filters?.payoutStatus) {
      filteredItems = allEnrichedItems.filter(i => i.payoutStatus === filters.payoutStatus);
    }
    
    // Filter by settlementInfoComplete if specified
    if (filters?.settlementInfoComplete !== undefined) {
      filteredItems = filteredItems.filter(i => i.settlementInfoComplete === filters.settlementInfoComplete);
    }
    
    // Sort: incompleteInfo and pending first, then by uploadCompletedAt oldest first
    filteredItems.sort((a, b) => {
      const statusPriority: Record<string, number> = {
        '정산요청': 1,
        '정산정보미비': 2,
        '지급대기': 3,
        '대기': 4,
        '보류': 5,
        '입금완료': 6
      };
      const aPriority = statusPriority[a.payoutStatus || '정산정보미비'] || 5;
      const bPriority = statusPriority[b.payoutStatus || '정산정보미비'] || 5;
      if (aPriority !== bPriority) return aPriority - bPriority;
      
      const aDate = a.uploadCompletedAt ? new Date(a.uploadCompletedAt).getTime() : 0;
      const bDate = b.uploadCompletedAt ? new Date(b.uploadCompletedAt).getTime() : 0;
      return aDate - bDate;
    });
    
    return {
      kpi: {
        pendingCount: pendingItems.length,
        pendingTotal: pendingItems.reduce((sum, i) => sum + (i.payoutTotal || i.offerFee || 0), 0),
        incompleteInfoCount: incompleteInfoItems.length,
        holdCount: holdItems.length,
        settlementRequestCount: settlementRequestItems.length,
        settlementRequestTotal: settlementRequestItems.reduce((sum, i) => sum + (i.payoutTotal || i.offerFee || 0), 0)
      },
      items: filteredItems
    };
  }

  async updateLineItemPayout(itemId: number, data: {
    payoutStatus?: string;
    payoutAmountSupply?: number;
    payoutVat?: number;
    payoutTotal?: number;
    payoutMemo?: string;
    invoiceFileId?: string;
    invoiceIssuedAt?: Date;
    payoutDueAt?: Date;
    paidAt?: Date;
    transferProofFileId?: string;
  }): Promise<CampaignInfluencer> {
    const [updated] = await db.update(campaignInfluencers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(campaignInfluencers.id, itemId))
      .returning();
    return updated;
  }

  async markUploadCompleted(itemId: number, userId: number, completed: boolean): Promise<CampaignInfluencer> {
    // Get the line item with influencer
    const [item] = await db.select().from(campaignInfluencers).where(eq(campaignInfluencers.id, itemId));
    if (!item) throw new Error('Line item not found');
    
    // Get influencer to check settlement info
    const [inf] = await db.select().from(influencers).where(eq(influencers.id, item.influencerId));
    
    // Helper to check if settlement info is complete
    const isSettlementInfoComplete = (): boolean => {
      if (!inf) return false;
      const hasBank = !!inf.bankName && !!inf.accountHolder && !!inf.accountNumber;
      if (inf.settlementType === '사업자') {
        return hasBank && !!inf.businessName && !!inf.businessRegNo;
      } else if (inf.settlementType === '프리랜서') {
        return hasBank && !!inf.freelancerId;
      }
      return false;
    };
    
    let newPayoutStatus = item.payoutStatus;
    if (completed) {
      // Set payoutStatus based on settlement info completeness
      newPayoutStatus = isSettlementInfoComplete() ? '지급대기' : '정산정보미비';
    } else {
      // When unchecking, set to 보류
      newPayoutStatus = '보류';
    }
    
    const [updated] = await db.update(campaignInfluencers)
      .set({
        isUploadCompleted: completed,
        uploadCompletedAt: completed ? new Date() : null,
        uploadCompletedByUserId: completed ? userId : null,
        payoutStatus: newPayoutStatus,
        updatedAt: new Date()
      })
      .where(eq(campaignInfluencers.id, itemId))
      .returning();
    
    return updated;
  }

  async createAuditLog(data: Partial<AuditLog>): Promise<AuditLog> {
    const [log] = await db.insert(auditLogs).values(data as any).returning();
    return log;
  }

  async getAuditLogs(workspaceId: number, entityType?: string, entityId?: number): Promise<AuditLog[]> {
    let query = db.select().from(auditLogs).where(eq(auditLogs.workspaceId, workspaceId));
    return await query.orderBy(desc(auditLogs.createdAt)).limit(100);
  }

  // === CONVERSATIONS ===
  async getConversationsByCampaign(campaignId: number): Promise<(Conversation & { lineItem: CampaignInfluencer & { influencer?: Influencer }; messageCount: number; lastMessage?: ConversationMessage })[]> {
    const campaign = await this.getCampaign(campaignId);
    if (!campaign) return [];
    
    const lineItemIds = campaign.items.map(i => i.id);
    if (lineItemIds.length === 0) return [];
    
    const convList = await db.select().from(conversations)
      .where(inArray(conversations.campaignLineItemId, lineItemIds))
      .orderBy(desc(conversations.lastMessageAt));
    
    const convIds = convList.map(c => c.id);
    const allMessages = convIds.length > 0 
      ? await db.select().from(conversationMessages)
          .where(and(
            inArray(conversationMessages.conversationId, convIds),
            isNull(conversationMessages.deletedAt)
          ))
          .orderBy(desc(conversationMessages.createdAt))
      : [];
    
    return convList.map(conv => {
      const messages = allMessages.filter(m => m.conversationId === conv.id);
      const lineItem = campaign.items.find(i => i.id === conv.campaignLineItemId);
      return {
        ...conv,
        lineItem: lineItem!,
        messageCount: messages.length,
        lastMessage: messages[0]
      };
    });
  }

  async getConversation(id: number): Promise<(Conversation & { messages: ConversationMessage[]; lineItem: CampaignInfluencer & { influencer?: Influencer & { accounts: InfluencerAccount[] } } }) | undefined> {
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
    if (!conv) return undefined;
    
    const messages = await db.select().from(conversationMessages)
      .where(and(
        eq(conversationMessages.conversationId, id),
        isNull(conversationMessages.deletedAt)
      ))
      .orderBy(conversationMessages.createdAt);
    
    const [lineItem] = await db.select().from(campaignInfluencers).where(eq(campaignInfluencers.id, conv.campaignLineItemId));
    let influencer: (Influencer & { accounts: InfluencerAccount[] }) | undefined;
    if (lineItem) {
      const [inf] = await db.select().from(influencers).where(eq(influencers.id, lineItem.influencerId));
      if (inf) {
        const accounts = await db.select().from(influencerAccounts).where(eq(influencerAccounts.influencerId, inf.id));
        influencer = { ...inf, accounts };
      }
    }
    
    return {
      ...conv,
      messages,
      lineItem: { ...lineItem, influencer }
    };
  }

  async getConversationByLineItem(lineItemId: number): Promise<Conversation | undefined> {
    const [conv] = await db.select().from(conversations).where(eq(conversations.campaignLineItemId, lineItemId));
    return conv;
  }

  async createConversation(data: InsertConversation): Promise<Conversation> {
    const [conv] = await db.insert(conversations).values(data).returning();
    return conv;
  }

  async updateConversation(id: number, data: Partial<Conversation>): Promise<Conversation> {
    const [conv] = await db.update(conversations).set(data).where(eq(conversations.id, id)).returning();
    return conv;
  }

  async createConversationMessage(data: InsertConversationMessage): Promise<ConversationMessage> {
    const [msg] = await db.insert(conversationMessages).values(data).returning();
    
    // Update conversation's lastMessageAt
    await db.update(conversations)
      .set({ lastMessageAt: new Date() })
      .where(eq(conversations.id, data.conversationId));
    
    return msg;
  }

  async getConversationMessages(conversationId: number): Promise<ConversationMessage[]> {
    return await db.select().from(conversationMessages)
      .where(and(
        eq(conversationMessages.conversationId, conversationId),
        isNull(conversationMessages.deletedAt)
      ))
      .orderBy(conversationMessages.createdAt);
  }

  async softDeleteMessage(messageId: number): Promise<void> {
    await db.update(conversationMessages)
      .set({ deletedAt: new Date() })
      .where(eq(conversationMessages.id, messageId));
  }

  async getMessageById(messageId: number): Promise<ConversationMessage | undefined> {
    const [msg] = await db.select().from(conversationMessages)
      .where(eq(conversationMessages.id, messageId));
    return msg;
  }

  async getRecentInboundMessages(workspaceId: number, limit: number = 30): Promise<any[]> {
    const results = await db
      .select({
        messageId: conversationMessages.id,
        conversationId: conversationMessages.conversationId,
        senderEmail: conversationMessages.senderEmail,
        snippet: conversationMessages.snippet,
        receivedAt: conversationMessages.receivedAt,
        createdAt: conversationMessages.createdAt,
        campaignName: campaigns.name,
        campaignId: campaigns.id,
        clientId: campaigns.clientId,
        influencerName: influencers.name,
        influencerId: influencers.id,
      })
      .from(conversationMessages)
      .innerJoin(conversations, eq(conversationMessages.conversationId, conversations.id))
      .innerJoin(campaignInfluencers, eq(conversations.campaignLineItemId, campaignInfluencers.id))
      .innerJoin(campaigns, eq(campaignInfluencers.campaignId, campaigns.id))
      .innerJoin(influencers, eq(campaignInfluencers.influencerId, influencers.id))
      .where(
        and(
          eq(campaigns.workspaceId, workspaceId),
          eq(conversationMessages.direction, 'inbound'),
          isNull(conversationMessages.deletedAt),
        )
      )
      .orderBy(desc(conversationMessages.createdAt))
      .limit(limit);

    const clientCache = new Map<number, string>();
    const enriched = [];
    for (const r of results) {
      let clientName = '';
      if (r.clientId) {
        if (clientCache.has(r.clientId)) {
          clientName = clientCache.get(r.clientId)!;
        } else {
          const client = await this.getClient(r.clientId);
          clientName = client?.name || '';
          clientCache.set(r.clientId, clientName);
        }
      }

      enriched.push({
        messageId: r.messageId,
        conversationId: r.conversationId,
        senderEmail: r.senderEmail,
        snippet: r.snippet,
        receivedAt: r.receivedAt,
        createdAt: r.createdAt,
        campaignName: r.campaignName,
        campaignId: r.campaignId,
        clientName,
        influencerName: r.influencerName || '',
        hasDraft: false,
      });
    }

    return enriched;
  }

  // === EMAIL TEMPLATES ===
  async getEmailTemplates(workspaceId: number): Promise<EmailTemplate[]> {
    return await db.select().from(emailTemplates).where(eq(emailTemplates.workspaceId, workspaceId));
  }

  async createEmailTemplate(data: InsertEmailTemplate): Promise<EmailTemplate> {
    const [template] = await db.insert(emailTemplates).values(data).returning();
    return template;
  }

  async updateEmailTemplate(id: number, data: Partial<EmailTemplate>): Promise<EmailTemplate> {
    const [template] = await db.update(emailTemplates).set(data).where(eq(emailTemplates.id, id)).returning();
    return template;
  }

  async deleteEmailTemplate(id: number): Promise<void> {
    await db.delete(emailTemplates).where(eq(emailTemplates.id, id));
  }

  // === BULK EMAIL ===
  async createBulkEmailJob(job: InsertBulkEmailJob): Promise<BulkEmailJob> {
    const [created] = await db.insert(bulkEmailJobs).values(job).returning();
    return created;
  }

  async getBulkEmailJob(id: number): Promise<BulkEmailJob | undefined> {
    const [job] = await db.select().from(bulkEmailJobs).where(eq(bulkEmailJobs.id, id));
    return job;
  }

  async getBulkEmailJobs(campaignId: number): Promise<BulkEmailJob[]> {
    return await db.select().from(bulkEmailJobs)
      .where(eq(bulkEmailJobs.campaignId, campaignId))
      .orderBy(desc(bulkEmailJobs.createdAt));
  }

  async updateBulkEmailJob(id: number, data: Partial<BulkEmailJob>): Promise<BulkEmailJob> {
    const [job] = await db.update(bulkEmailJobs).set(data).where(eq(bulkEmailJobs.id, id)).returning();
    return job;
  }

  async createBulkEmailQueueItems(items: InsertBulkEmailQueueItem[]): Promise<BulkEmailQueueItem[]> {
    if (items.length === 0) return [];
    return await db.insert(bulkEmailQueueItems).values(items).returning();
  }

  async getBulkEmailQueueItems(jobId: number): Promise<BulkEmailQueueItem[]> {
    return await db.select().from(bulkEmailQueueItems)
      .where(eq(bulkEmailQueueItems.jobId, jobId))
      .orderBy(bulkEmailQueueItems.id);
  }

  async getNextPendingQueueItem(jobId: number): Promise<BulkEmailQueueItem | undefined> {
    const [item] = await db.select().from(bulkEmailQueueItems)
      .where(and(
        eq(bulkEmailQueueItems.jobId, jobId),
        eq(bulkEmailQueueItems.status, 'queued')
      ))
      .orderBy(bulkEmailQueueItems.id)
      .limit(1);
    return item;
  }

  async updateBulkEmailQueueItem(id: number, data: Partial<BulkEmailQueueItem>): Promise<BulkEmailQueueItem> {
    const [item] = await db.update(bulkEmailQueueItems).set(data).where(eq(bulkEmailQueueItems.id, id)).returning();
    return item;
  }

  async getSentEmailsForCampaign(campaignId: number): Promise<{ influencerId: number; email: string }[]> {
    return await db.select({
      influencerId: bulkEmailQueueItems.influencerId,
      email: bulkEmailQueueItems.email
    }).from(bulkEmailQueueItems)
      .where(and(
        eq(bulkEmailQueueItems.campaignId, campaignId),
        eq(bulkEmailQueueItems.status, 'sent')
      ));
  }

  async getCampaignContents(campaignId: number): Promise<(CampaignContent & { influencer?: Influencer })[]> {
    const rows = await db.select({
      content: campaignContents,
      influencer: influencers
    })
      .from(campaignContents)
      .leftJoin(influencers, eq(campaignContents.influencerId, influencers.id))
      .where(eq(campaignContents.campaignId, campaignId))
      .orderBy(desc(campaignContents.createdAt));
    
    return rows.map(row => ({
      ...row.content,
      influencer: row.influencer || undefined
    }));
  }

  async createCampaignContent(content: InsertCampaignContent): Promise<CampaignContent> {
    const [created] = await db.insert(campaignContents).values(content).returning();
    return created;
  }

  async updateCampaignContent(id: number, data: Partial<CampaignContent>): Promise<CampaignContent> {
    const [updated] = await db.update(campaignContents)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(campaignContents.id, id))
      .returning();
    return updated;
  }

  async deleteCampaignContent(id: number): Promise<void> {
    await db.delete(campaignContents).where(eq(campaignContents.id, id));
  }

  async findInfluencerByKey(workspaceId: number, platform: string | null, handle: string | null, url: string | null, name: string | null): Promise<(Influencer & { accounts: InfluencerAccount[] }) | null> {
    if (platform && handle) {
      const account = await db.select().from(influencerAccounts)
        .innerJoin(influencers, eq(influencerAccounts.influencerId, influencers.id))
        .where(and(
          eq(influencers.workspaceId, workspaceId),
          eq(influencerAccounts.platform, platform),
          eq(influencerAccounts.handle, handle)
        ))
        .limit(1);
      if (account.length > 0) {
        const inf = account[0].influencers;
        const accounts = await db.select().from(influencerAccounts).where(eq(influencerAccounts.influencerId, inf.id));
        return { ...inf, accounts };
      }
    }
    if (platform && url) {
      const account = await db.select().from(influencerAccounts)
        .innerJoin(influencers, eq(influencerAccounts.influencerId, influencers.id))
        .where(and(
          eq(influencers.workspaceId, workspaceId),
          eq(influencerAccounts.platform, platform),
          eq(influencerAccounts.url, url)
        ))
        .limit(1);
      if (account.length > 0) {
        const inf = account[0].influencers;
        const accounts = await db.select().from(influencerAccounts).where(eq(influencerAccounts.influencerId, inf.id));
        return { ...inf, accounts };
      }
    }
    if (name && platform) {
      const account = await db.select().from(influencerAccounts)
        .innerJoin(influencers, eq(influencerAccounts.influencerId, influencers.id))
        .where(and(
          eq(influencers.workspaceId, workspaceId),
          eq(influencers.name, name),
          eq(influencerAccounts.platform, platform)
        ))
        .limit(1);
      if (account.length > 0) {
        const inf = account[0].influencers;
        const accounts = await db.select().from(influencerAccounts).where(eq(influencerAccounts.influencerId, inf.id));
        return { ...inf, accounts };
      }
    }
    return null;
  }

  async upsertInfluencerWithAccount(
    workspaceId: number,
    influencerData: {
      name: string;
      contactPoint?: string | null;
      memo?: string | null;
      client?: string | null;
      tag1?: string | null;
      tag2?: string | null;
      tag3?: string | null;
      contactStatus?: string | null;
      replyStatus?: string | null;
      collabStatus?: string | null;
      finalContentUrl?: string | null;
      priceMemo?: string | null;
    },
    accountData: {
      platform: string;
      handle: string;
      url: string;
      followers?: number;
    } | null,
    existingInfluencer?: Influencer | null
  ): Promise<{ influencer: Influencer; account: InfluencerAccount | null; isNew: boolean }> {
    if (existingInfluencer) {
      const updateData: Partial<Influencer> = {};
      if (influencerData.name && !existingInfluencer.name) updateData.name = influencerData.name;
      if (influencerData.name) updateData.name = influencerData.name;
      if (influencerData.contactPoint) updateData.contactPoint = influencerData.contactPoint;
      if (influencerData.memo) updateData.memo = influencerData.memo;
      if (influencerData.client) updateData.client = influencerData.client;
      if (influencerData.tag1) updateData.tag1 = influencerData.tag1;
      if (influencerData.tag2) updateData.tag2 = influencerData.tag2;
      if (influencerData.tag3) updateData.tag3 = influencerData.tag3;
      if (influencerData.contactStatus) updateData.contactStatus = influencerData.contactStatus;
      if (influencerData.replyStatus) updateData.replyStatus = influencerData.replyStatus;
      if (influencerData.collabStatus) updateData.collabStatus = influencerData.collabStatus;
      if (influencerData.finalContentUrl) updateData.finalContentUrl = influencerData.finalContentUrl;
      if (influencerData.priceMemo) updateData.priceMemo = influencerData.priceMemo;

      const [updatedInf] = await db.update(influencers).set(updateData).where(eq(influencers.id, existingInfluencer.id)).returning();

      let updatedAccount: InfluencerAccount | null = null;
      if (accountData) {
        const existingAccounts = await db.select().from(influencerAccounts).where(
          and(
            eq(influencerAccounts.influencerId, existingInfluencer.id),
            eq(influencerAccounts.platform, accountData.platform)
          )
        );
        if (existingAccounts.length > 0) {
          const [acc] = await db.update(influencerAccounts).set({
            handle: accountData.handle,
            url: accountData.url,
            followers: accountData.followers || existingAccounts[0].followers
          }).where(eq(influencerAccounts.id, existingAccounts[0].id)).returning();
          updatedAccount = acc;
          if (!acc.profileImageUrl) {
            this.fetchAndUpdateProfileImages([acc]);
          }
        } else {
          const [acc] = await db.insert(influencerAccounts).values({
            influencerId: existingInfluencer.id,
            platform: accountData.platform,
            handle: accountData.handle,
            url: accountData.url,
            followers: accountData.followers || 0
          }).returning();
          updatedAccount = acc;
          this.fetchAndUpdateProfileImages([acc]);
        }
      }
      return { influencer: updatedInf, account: updatedAccount, isNew: false };
    } else {
      const [newInf] = await db.insert(influencers).values({
        workspaceId,
        name: influencerData.name || 'Unknown',
        contactPoint: influencerData.contactPoint,
        memo: influencerData.memo,
        client: influencerData.client,
        tag1: influencerData.tag1,
        tag2: influencerData.tag2,
        tag3: influencerData.tag3,
        contactStatus: influencerData.contactStatus,
        replyStatus: influencerData.replyStatus,
        collabStatus: influencerData.collabStatus,
        finalContentUrl: influencerData.finalContentUrl,
        priceMemo: influencerData.priceMemo
      }).returning();

      let newAccount: InfluencerAccount | null = null;
      if (accountData) {
        const [acc] = await db.insert(influencerAccounts).values({
          influencerId: newInf.id,
          platform: accountData.platform,
          handle: accountData.handle,
          url: accountData.url,
          followers: accountData.followers || 0
        }).returning();
        newAccount = acc;
        this.fetchAndUpdateProfileImages([acc]);
      }
      return { influencer: newInf, account: newAccount, isNew: true };
    }
  }

  // Feedback Notes
  async getFeedbackNotes(lineItemId: number): Promise<(FeedbackNote & { author?: User })[]> {
    const notes = await db.select().from(feedbackNotes)
      .where(eq(feedbackNotes.lineItemId, lineItemId))
      .orderBy(desc(feedbackNotes.createdAt));
    
    if (notes.length === 0) return [];
    
    const authorIds = [...new Set(notes.map(n => n.authorUserId))];
    const allUsers = await db.select().from(users).where(inArray(users.id, authorIds));
    
    return notes.map(note => ({
      ...note,
      author: allUsers.find(u => u.id === note.authorUserId)
    }));
  }

  async createFeedbackNote(note: InsertFeedbackNote): Promise<FeedbackNote> {
    const [newNote] = await db.insert(feedbackNotes).values(note).returning();
    return newNote;
  }

  async updateFeedbackNote(id: number, data: Partial<FeedbackNote>): Promise<FeedbackNote> {
    const [updated] = await db.update(feedbackNotes).set(data).where(eq(feedbackNotes.id, id)).returning();
    return updated;
  }

  async deleteFeedbackNote(id: number): Promise<void> {
    await db.delete(feedbackNotes).where(eq(feedbackNotes.id, id));
  }

  async getLineItemWithDetails(id: number): Promise<(CampaignInfluencer & { 
    influencer?: Influencer & { accounts: InfluencerAccount[] };
    feedbackNotes?: (FeedbackNote & { author?: User })[];
  }) | undefined> {
    const [lineItem] = await db.select().from(campaignInfluencers).where(eq(campaignInfluencers.id, id));
    if (!lineItem) return undefined;
    
    const [inf] = await db.select().from(influencers).where(eq(influencers.id, lineItem.influencerId));
    const accounts = inf ? await db.select().from(influencerAccounts).where(eq(influencerAccounts.influencerId, inf.id)) : [];
    const notes = await this.getFeedbackNotes(id);
    
    return {
      ...lineItem,
      influencer: inf ? { ...inf, accounts } : undefined,
      feedbackNotes: notes
    };
  }

  // === CLIENTS ===
  async getClients(workspaceId: number): Promise<Client[]> {
    return await db.select().from(clients).where(eq(clients.workspaceId, workspaceId));
  }

  async getClient(id: number): Promise<Client | undefined> {
    const [client] = await db.select().from(clients).where(eq(clients.id, id));
    return client;
  }

  async createClient(client: InsertClient): Promise<Client> {
    const [created] = await db.insert(clients).values(client).returning();
    return created;
  }

  async updateClient(id: number, data: Partial<Client>): Promise<Client> {
    const [updated] = await db.update(clients).set(data).where(eq(clients.id, id)).returning();
    return updated;
  }

  async deleteClient(id: number): Promise<void> {
    await db.delete(clientUserAssignments).where(eq(clientUserAssignments.clientId, id));
    await db.delete(clients).where(eq(clients.id, id));
  }

  // === CLIENT-USER ASSIGNMENTS ===
  async getClientUserAssignments(workspaceId: number): Promise<(ClientUserAssignment & { client?: Client; user?: User })[]> {
    const assignments = await db.select().from(clientUserAssignments)
      .where(eq(clientUserAssignments.workspaceId, workspaceId));
    
    if (assignments.length === 0) return [];

    const clientIds = [...new Set(assignments.map(a => a.clientId))];
    const userIds = [...new Set(assignments.map(a => a.userId))];
    
    const clientList = await db.select().from(clients).where(inArray(clients.id, clientIds));
    const userList = await db.select().from(users).where(inArray(users.id, userIds));
    
    return assignments.map(a => ({
      ...a,
      client: clientList.find(c => c.id === a.clientId),
      user: userList.find(u => u.id === a.userId)
    }));
  }

  async getUserClientAssignments(userId: number, workspaceId: number): Promise<ClientUserAssignment[]> {
    return await db.select().from(clientUserAssignments)
      .where(and(
        eq(clientUserAssignments.userId, userId),
        eq(clientUserAssignments.workspaceId, workspaceId)
      ));
  }

  async createClientUserAssignment(assignment: InsertClientUserAssignment): Promise<ClientUserAssignment> {
    const [created] = await db.insert(clientUserAssignments).values(assignment).returning();
    return created;
  }

  async deleteClientUserAssignment(id: number): Promise<void> {
    await db.delete(clientUserAssignments).where(eq(clientUserAssignments.id, id));
  }

  async deleteClientUserAssignmentsByClient(clientId: number): Promise<void> {
    await db.delete(clientUserAssignments).where(eq(clientUserAssignments.clientId, clientId));
  }

  async deleteClientUserAssignmentsByUser(userId: number, workspaceId: number): Promise<void> {
    await db.delete(clientUserAssignments).where(and(
      eq(clientUserAssignments.userId, userId),
      eq(clientUserAssignments.workspaceId, workspaceId)
    ));
  }

  // === USER MANAGEMENT ===
  async getWorkspaceUsers(workspaceId: number): Promise<(User & { role: string; assignedClients?: Client[] })[]> {
    const members = await db.select({
      userId: workspaceMembers.userId,
      role: workspaceMembers.role
    }).from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId));

    if (members.length === 0) return [];

    const userIds = members.map(m => m.userId);
    const userList = await db.select().from(users).where(inArray(users.id, userIds));
    
    const assignments = await db.select().from(clientUserAssignments)
      .where(eq(clientUserAssignments.workspaceId, workspaceId));
    
    const clientIds = [...new Set(assignments.map(a => a.clientId))];
    const clientList = clientIds.length > 0 
      ? await db.select().from(clients).where(inArray(clients.id, clientIds))
      : [];

    return userList.map(user => {
      const member = members.find(m => m.userId === user.id);
      const userAssignments = assignments.filter(a => a.userId === user.id);
      const assignedClients = userAssignments.map(a => clientList.find(c => c.id === a.clientId)).filter(Boolean) as Client[];
      
      return {
        ...user,
        role: member?.role || 'WORKSPACE_MEMBER',
        assignedClients
      };
    });
  }

  async updateUser(id: number, data: Partial<User>): Promise<User> {
    const [updated] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return updated;
  }

  async updateWorkspaceMemberRole(userId: number, workspaceId: number, role: string): Promise<void> {
    await db.update(workspaceMembers)
      .set({ role })
      .where(and(
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.workspaceId, workspaceId)
      ));
  }

  async createWorkspaceMember(userId: number, workspaceId: number, role: string): Promise<void> {
    await db.insert(workspaceMembers).values({ userId, workspaceId, role });
  }

  async getWorkspaceMember(userId: number, workspaceId: number): Promise<{ userId: number; workspaceId: number; role: string } | undefined> {
    const [member] = await db.select().from(workspaceMembers)
      .where(and(
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.workspaceId, workspaceId)
      ));
    return member;
  }

  async getWorkspaceMembers(workspaceId: number): Promise<{ userId: number; workspaceId: number; role: string }[]> {
    return await db.select().from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, workspaceId));
  }

  async deleteWorkspaceMember(userId: number, workspaceId: number): Promise<void> {
    await db.delete(clientUserAssignments)
      .where(and(
        eq(clientUserAssignments.userId, userId),
      ));
    await db.delete(workspaceMembers)
      .where(and(
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.workspaceId, workspaceId)
      ));
  }

  // Contract Templates
  async getContractTemplates(workspaceId: number): Promise<ContractTemplate[]> {
    return await db.select().from(contractTemplates)
      .where(eq(contractTemplates.workspaceId, workspaceId))
      .orderBy(desc(contractTemplates.createdAt));
  }

  async getContractTemplate(id: number): Promise<ContractTemplate | undefined> {
    const [template] = await db.select().from(contractTemplates).where(eq(contractTemplates.id, id));
    return template;
  }

  async createContractTemplate(template: InsertContractTemplate): Promise<ContractTemplate> {
    const [created] = await db.insert(contractTemplates).values(template).returning();
    return created;
  }

  async updateContractTemplate(id: number, data: Partial<ContractTemplate>): Promise<ContractTemplate> {
    const [updated] = await db.update(contractTemplates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(contractTemplates.id, id))
      .returning();
    return updated;
  }

  async deleteContractTemplate(id: number): Promise<void> {
    await db.delete(contractTemplates).where(eq(contractTemplates.id, id));
  }

  // Content Submissions
  async getContentSubmissions(campaignId: number): Promise<ContentSubmission[]> {
    return await db.select().from(contentSubmissions)
      .where(eq(contentSubmissions.campaignId, campaignId))
      .orderBy(desc(contentSubmissions.submittedAt));
  }

  async getContentSubmissionsByLineItem(lineItemId: number): Promise<ContentSubmission[]> {
    return await db.select().from(contentSubmissions)
      .where(eq(contentSubmissions.lineItemId, lineItemId))
      .orderBy(desc(contentSubmissions.submittedAt));
  }

  async createContentSubmission(data: InsertContentSubmission): Promise<ContentSubmission> {
    const [submission] = await db.insert(contentSubmissions).values(data).returning();
    return submission;
  }

  async updateContentSubmission(id: number, data: Partial<ContentSubmission>): Promise<ContentSubmission> {
    const [updated] = await db.update(contentSubmissions)
      .set(data)
      .where(eq(contentSubmissions.id, id))
      .returning();
    return updated;
  }

  async findInfluencerByEmailInCampaign(campaignId: number, email: string): Promise<{ influencer: Influencer; lineItem: CampaignInfluencer } | null> {
    const lineItems = await db.select().from(campaignInfluencers)
      .where(eq(campaignInfluencers.campaignId, campaignId));
    
    if (lineItems.length === 0) return null;
    
    const influencerIds = lineItems.map(li => li.influencerId);
    const matchingInfluencers = await db.select().from(influencers)
      .where(and(
        inArray(influencers.id, influencerIds),
        or(
          eq(influencers.email, email),
          eq(influencers.contactPoint, email)
        )
      ));
    
    if (matchingInfluencers.length === 0) return null;
    
    const influencer = matchingInfluencers[0];
    const lineItem = lineItems.find(li => li.influencerId === influencer.id);
    
    return lineItem ? { influencer, lineItem } : null;
  }

  async getAiDraft(id: number): Promise<AiDraftReply | undefined> {
    const [draft] = await db.select().from(aiDraftReplies)
      .where(eq(aiDraftReplies.id, id));
    return draft;
  }

  async getLatestPendingDraft(conversationId: number): Promise<AiDraftReply | undefined> {
    const [draft] = await db.select().from(aiDraftReplies)
      .where(and(
        eq(aiDraftReplies.conversationId, conversationId),
        eq(aiDraftReplies.status, "pending")
      ))
      .orderBy(desc(aiDraftReplies.createdAt))
      .limit(1);
    return draft;
  }

  async getDraftByTriggerMessage(triggerMessageId: number): Promise<AiDraftReply | undefined> {
    const [draft] = await db.select().from(aiDraftReplies)
      .where(eq(aiDraftReplies.triggerMessageId, triggerMessageId));
    return draft;
  }

  async createAiDraft(draft: InsertAiDraftReply): Promise<AiDraftReply> {
    const [created] = await db.insert(aiDraftReplies).values(draft).returning();
    return created;
  }

  async updateAiDraft(id: number, data: Partial<AiDraftReply>): Promise<AiDraftReply> {
    const [updated] = await db.update(aiDraftReplies)
      .set(data)
      .where(eq(aiDraftReplies.id, id))
      .returning();
    return updated;
  }

  private fetchAndUpdateProfileImages(accounts: InfluencerAccount[]): void {
    const supportedPlatforms = ['IG', 'YT'];
    const toFetch = accounts.filter(a => supportedPlatforms.includes(a.platform) && !a.profileImageUrl);
    if (toFetch.length === 0) return;

    Promise.allSettled(
      toFetch.map(async (acc) => {
        try {
          const result = await fetchProfileImage(acc.platform, acc.handle);
          if (result) {
            await db.update(influencerAccounts)
              .set({ profileImageUrl: `/api/profile-image/${result.fileId}`, profileImageFileId: result.fileId })
              .where(eq(influencerAccounts.id, acc.id));
          }
        } catch (err) {
          console.error(`Failed to fetch profile image for ${acc.platform}/${acc.handle}:`, err);
        }
      })
    ).catch(() => {});
  }

  async getPendingDraftConversationIds(conversationIds: number[]): Promise<number[]> {
    if (conversationIds.length === 0) return [];
    const results = await db.select({ conversationId: aiDraftReplies.conversationId })
      .from(aiDraftReplies)
      .where(and(
        inArray(aiDraftReplies.conversationId, conversationIds),
        eq(aiDraftReplies.status, "pending")
      ));
    return [...new Set(results.map(r => r.conversationId))];
  }

  async createEmailSyncLog(data: Partial<EmailSyncLog>): Promise<EmailSyncLog> {
    const [log] = await db.insert(emailSyncLogs).values(data as any).returning();
    return log;
  }

  async updateEmailSyncLog(id: number, data: Partial<EmailSyncLog>): Promise<EmailSyncLog> {
    const [log] = await db.update(emailSyncLogs).set(data as any).where(eq(emailSyncLogs.id, id)).returning();
    return log;
  }

  async getEmailSyncLogs(workspaceId: number, limit = 50, offset = 0): Promise<{ logs: EmailSyncLog[]; total: number }> {
    const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(emailSyncLogs).where(eq(emailSyncLogs.workspaceId, workspaceId));
    const total = Number(countResult?.count || 0);
    const logs = await db.select().from(emailSyncLogs)
      .where(eq(emailSyncLogs.workspaceId, workspaceId))
      .orderBy(desc(emailSyncLogs.startedAt))
      .limit(limit)
      .offset(offset);
    return { logs, total };
  }

  async getEmailSyncLog(id: number): Promise<EmailSyncLog | undefined> {
    const [log] = await db.select().from(emailSyncLogs).where(eq(emailSyncLogs.id, id));
    return log;
  }

  async createAiSearchJob(data: InsertAiSearchJob): Promise<AiSearchJob> {
    const [job] = await db.insert(aiSearchJobs).values(data).returning();
    return job;
  }

  async getAiSearchJob(id: number): Promise<AiSearchJob | undefined> {
    const [job] = await db.select().from(aiSearchJobs).where(eq(aiSearchJobs.id, id));
    return job;
  }

  async getAiSearchJobs(workspaceId: number): Promise<AiSearchJob[]> {
    return await db.select().from(aiSearchJobs)
      .where(eq(aiSearchJobs.workspaceId, workspaceId))
      .orderBy(desc(aiSearchJobs.createdAt));
  }

  async updateAiSearchJob(id: number, data: Partial<AiSearchJob>): Promise<AiSearchJob> {
    const [job] = await db.update(aiSearchJobs).set(data).where(eq(aiSearchJobs.id, id)).returning();
    return job;
  }

  async createAiSearchCandidate(data: InsertAiSearchCandidate): Promise<AiSearchCandidate> {
    const [candidate] = await db.insert(aiSearchCandidates).values(data).returning();
    return candidate;
  }

  async getAiSearchCandidates(jobId: number): Promise<AiSearchCandidate[]> {
    return await db.select().from(aiSearchCandidates)
      .where(eq(aiSearchCandidates.jobId, jobId))
      .orderBy(desc(aiSearchCandidates.aiScore));
  }

  async updateAiSearchCandidate(id: number, data: Partial<AiSearchCandidate>): Promise<AiSearchCandidate> {
    const [candidate] = await db.update(aiSearchCandidates).set(data).where(eq(aiSearchCandidates.id, id)).returning();
    return candidate;
  }

  async bulkCreateAiSearchCandidates(data: InsertAiSearchCandidate[]): Promise<AiSearchCandidate[]> {
    if (data.length === 0) return [];
    return await db.insert(aiSearchCandidates).values(data).returning();
  }
}

export const storage = new DatabaseStorage();
