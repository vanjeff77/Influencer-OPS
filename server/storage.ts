import { db } from "./db";
import {
  users, workspaces, influencers, influencerAccounts, groups, groupInfluencers, campaigns, campaignInfluencers,
  emailAccounts, emailThreads, trackingJobs, trackingMetrics, contents, timelineEvents, auditLogs, notifications,
  type User, type InsertUser, type Workspace, type InsertWorkspace,
  type Influencer, type CreateInfluencerWithAccounts, type InfluencerAccount,
  type Group, type GroupInfluencer, type Campaign, type CampaignInfluencer, type Content,
  type EmailAccount, type EmailThread, type EmailMessage, type TrackingJob, type InsertTrackingJob,
  type TimelineEvent, type InsertTimelineEvent, type AuditLog, type Notification
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
  createInfluencer(workspaceId: number, data: CreateInfluencerWithAccounts): Promise<Influencer & { accounts: InfluencerAccount[] }>;
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

  // Email
  getEmailAccounts(workspaceId: number): Promise<EmailAccount[]>;
  createEmailAccount(workspaceId: number, account: any): Promise<EmailAccount>;
  getEmailThreads(accountId: number): Promise<EmailThread[]>;
  createEmailThread(thread: any): Promise<EmailThread>;
  
  // Tracking
  getTrackingJobs(workspaceId: number): Promise<TrackingJob[]>;
  getTrackingJob(id: number): Promise<TrackingJob | undefined>;
  createTrackingJob(workspaceId: number, job: InsertTrackingJob): Promise<TrackingJob>;
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

  async createInfluencer(workspaceId: number, data: CreateInfluencerWithAccounts): Promise<Influencer & { accounts: InfluencerAccount[] }> {
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

  async getEmailAccounts(workspaceId: number): Promise<EmailAccount[]> {
    return await db.select().from(emailAccounts).where(eq(emailAccounts.workspaceId, workspaceId));
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

  async createTrackingJob(workspaceId: number, job: InsertTrackingJob): Promise<TrackingJob> {
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
    const influencerIds = [...new Set(items.map(i => i.influencerId))];
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
    // Note: filtering would need to be added if entityType/entityId are provided
    return await query.orderBy(desc(auditLogs.createdAt)).limit(100);
  }
}

export const storage = new DatabaseStorage();
