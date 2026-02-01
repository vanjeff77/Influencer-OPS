import { db } from "./db";
import {
  users, workspaces, workspaceMembers, influencers, influencerAccounts, groups, groupInfluencers, campaigns, campaignInfluencers,
  emailAccounts, emailThreads, trackingJobs, trackingMetrics, contents, timelineEvents, auditLogs, notifications,
  conversations, conversationMessages, emailTemplates, bulkEmailJobs, bulkEmailQueueItems, campaignContents,
  type User, type InsertUser, type Workspace, type InsertWorkspace,
  type Influencer, type CreateInfluencerWithAccounts, type InfluencerAccount,
  type Group, type GroupInfluencer, type Campaign, type CampaignInfluencer, type Content,
  type EmailAccount, type EmailThread, type EmailMessage, type TrackingJob, type InsertTrackingJob,
  type TimelineEvent, type InsertTimelineEvent, type AuditLog, type Notification,
  type Conversation, type ConversationMessage, type EmailTemplate,
  type InsertConversation, type InsertConversationMessage, type InsertEmailTemplate,
  type BulkEmailJob, type BulkEmailQueueItem, type InsertBulkEmailJob, type InsertBulkEmailQueueItem,
  type CampaignContent, type InsertCampaignContent
} from "@shared/schema";
import { eq, like, or, and, sql, inArray, desc } from "drizzle-orm";

export interface IStorage {
  // User & Workspace
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getWorkspaces(): Promise<Workspace[]>;
  createWorkspace(ws: InsertWorkspace): Promise<Workspace>;

  // Influencers
  getInfluencers(workspaceId: number, search?: string, filters?: { platform?: string; tags?: string[] }): Promise<(Influencer & { accounts: InfluencerAccount[] })[]>;
  getInfluencer(id: number): Promise<(Influencer & { accounts: InfluencerAccount[]; contents: Content[]; timeline: TimelineEvent[] }) | undefined>;
  createInfluencer(workspaceId: number, data: Omit<CreateInfluencerWithAccounts, 'workspaceId'>): Promise<Influencer & { accounts: InfluencerAccount[] }>;
  updateInfluencer(id: number, data: Partial<Influencer>): Promise<Influencer>;

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
  addInfluencersToCampaign(campaignId: number, influencerIds: number[]): Promise<CampaignInfluencer[]>;
  updateCampaignItem(id: number, updates: Partial<CampaignInfluencer>): Promise<CampaignInfluencer>;
  getAllCampaignInfluencers(workspaceId: number): Promise<CampaignInfluencer[]>;

  // Workspace Memberships
  getWorkspaceMemberships(userId: number): Promise<{ workspaceId: number; role: string }[]>;

  // Email
  getEmailAccounts(workspaceId: number): Promise<EmailAccount[]>;
  getEmailAccountById(accountId: number): Promise<EmailAccount | null>;
  createEmailAccount(workspaceId: number, account: any): Promise<EmailAccount>;
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
    }
    return { ...inf, accounts: createdAccounts };
  }

  async updateInfluencer(id: number, data: Partial<Influencer>): Promise<Influencer> {
    const [inf] = await db.update(influencers).set(data).where(eq(influencers.id, id)).returning();
    return inf;
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
    const [c] = await db.insert(campaigns).values({ ...campaign, workspaceId }).returning();
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
        status: 'contacted',
        contractStatus: 'pending',
        paymentStatus: 'pending',
        payAmount: 0
      }))
    ).returning();
    
    return items;
  }

  async updateCampaignItem(id: number, updates: Partial<CampaignInfluencer>): Promise<CampaignInfluencer> {
    const [item] = await db.update(campaignInfluencers).set(updates).where(eq(campaignInfluencers.id, id)).returning();
    return item;
  }

  async getAllCampaignInfluencers(workspaceId: number): Promise<CampaignInfluencer[]> {
    const workspaceCampaigns = await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.workspaceId, workspaceId));
    const campaignIds = workspaceCampaigns.map(c => c.id);
    if (campaignIds.length === 0) return [];
    return await db.select().from(campaignInfluencers).where(inArray(campaignInfluencers.campaignId, campaignIds));
  }

  async getWorkspaceMemberships(userId: number): Promise<{ workspaceId: number; role: string }[]> {
    return await db.select({
      workspaceId: workspaceMembers.workspaceId,
      role: workspaceMembers.role
    }).from(workspaceMembers).where(eq(workspaceMembers.userId, userId));
  }

  async getEmailAccounts(workspaceId: number): Promise<EmailAccount[]> {
    return await db.select().from(emailAccounts).where(eq(emailAccounts.workspaceId, workspaceId));
  }

  async getEmailAccountById(accountId: number): Promise<EmailAccount | null> {
    const [account] = await db.select().from(emailAccounts).where(eq(emailAccounts.id, accountId));
    return account || null;
  }

  async createEmailAccount(workspaceId: number, account: any): Promise<EmailAccount> {
    const [a] = await db.insert(emailAccounts).values({ ...account, workspaceId }).returning();
    return a;
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
      pendingTotal: pendingItems.reduce((sum, i) => sum + (i.payAmount || 0), 0),
      paidThisMonth: paidItems.reduce((sum, i) => sum + (i.payAmount || 0), 0),
      pendingCount: pendingItems.length,
      items: enrichedItems
    };
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
    
    // Get all messages for counts
    const convIds = convList.map(c => c.id);
    const allMessages = convIds.length > 0 
      ? await db.select().from(conversationMessages)
          .where(inArray(conversationMessages.conversationId, convIds))
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
      .where(eq(conversationMessages.conversationId, id))
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
      .where(eq(conversationMessages.conversationId, conversationId))
      .orderBy(conversationMessages.createdAt);
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
}

export const storage = new DatabaseStorage();
