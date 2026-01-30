import { db } from "./db";
import {
  users, workspaces, influencers, influencerAccounts, groups, campaigns, campaignInfluencers,
  emailAccounts, emailThreads, trackingJobs, trackingMetrics,
  type User, type InsertUser, type Workspace, type InsertWorkspace,
  type Influencer, type CreateInfluencerWithAccounts, type InfluencerAccount,
  type Group, type Campaign, type CampaignInfluencer,
  type EmailAccount, type EmailThread, type EmailMessage, type TrackingJob, type InsertTrackingJob
} from "@shared/schema";
import { eq, like, or, and, sql } from "drizzle-orm";

export interface IStorage {
  // User & Workspace
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getWorkspaces(): Promise<Workspace[]>; // Simplified for MVP
  createWorkspace(ws: InsertWorkspace): Promise<Workspace>;

  // Influencers
  getInfluencers(workspaceId: number, search?: string): Promise<(Influencer & { accounts: InfluencerAccount[] })[]>;
  getInfluencer(id: number): Promise<(Influencer & { accounts: InfluencerAccount[] }) | undefined>;
  createInfluencer(workspaceId: number, data: CreateInfluencerWithAccounts): Promise<Influencer & { accounts: InfluencerAccount[] }>;

  // Groups
  getGroups(workspaceId: number): Promise<Group[]>;
  createGroup(workspaceId: number, group: any): Promise<Group>;
  
  // Campaigns
  getCampaigns(workspaceId: number): Promise<Campaign[]>;
  createCampaign(workspaceId: number, campaign: any): Promise<Campaign>;
  getCampaign(id: number): Promise<(Campaign & { items: CampaignInfluencer[] }) | undefined>;
  updateCampaignItem(id: number, updates: Partial<CampaignInfluencer>): Promise<CampaignInfluencer>;

  // Email
  getEmailAccounts(workspaceId: number): Promise<EmailAccount[]>;
  createEmailAccount(workspaceId: number, account: any): Promise<EmailAccount>;
  getEmailThreads(accountId: number): Promise<EmailThread[]>;
  createEmailThread(thread: any): Promise<EmailThread>;
  
  // Tracking
  getTrackingJobs(workspaceId: number): Promise<TrackingJob[]>;
  createTrackingJob(workspaceId: number, job: InsertTrackingJob): Promise<TrackingJob>;
  updateTrackingMetric(jobId: number, date: string, value: number): Promise<void>;
  getTrackingMetrics(jobId: number): Promise<{ date: string; value: number }[]>;
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

  async getInfluencers(workspaceId: number, search?: string): Promise<(Influencer & { accounts: InfluencerAccount[] })[]> {
    let query = db.select().from(influencers).where(eq(influencers.workspaceId, workspaceId));
    
    if (search) {
      query = db.select().from(influencers).where(and(
        eq(influencers.workspaceId, workspaceId),
        or(like(influencers.name, `%${search}%`), like(influencers.email, `%${search}%`))
      ));
    }

    const results = await query;
    const allAccounts = await db.select().from(influencerAccounts).where(
      or(...results.map(i => eq(influencerAccounts.influencerId, i.id)))
    );

    return results.map(inf => ({
      ...inf,
      accounts: allAccounts.filter(a => a.influencerId === inf.id)
    }));
  }

  async getInfluencer(id: number): Promise<(Influencer & { accounts: InfluencerAccount[] }) | undefined> {
    const [inf] = await db.select().from(influencers).where(eq(influencers.id, id));
    if (!inf) return undefined;
    const accounts = await db.select().from(influencerAccounts).where(eq(influencerAccounts.influencerId, id));
    return { ...inf, accounts };
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

  async getGroups(workspaceId: number): Promise<Group[]> {
    return await db.select().from(groups).where(eq(groups.workspaceId, workspaceId));
  }

  async createGroup(workspaceId: number, group: any): Promise<Group> {
    const [g] = await db.insert(groups).values({ ...group, workspaceId }).returning();
    return g;
  }

  async getCampaigns(workspaceId: number): Promise<Campaign[]> {
    return await db.select().from(campaigns).where(eq(campaigns.workspaceId, workspaceId));
  }

  async createCampaign(workspaceId: number, campaign: any): Promise<Campaign> {
    const [c] = await db.insert(campaigns).values({ ...campaign, workspaceId }).returning();
    return c;
  }

  async getCampaign(id: number): Promise<(Campaign & { items: CampaignInfluencer[] }) | undefined> {
    const [c] = await db.select().from(campaigns).where(eq(campaigns.id, id));
    if (!c) return undefined;
    const items = await db.select().from(campaignInfluencers).where(eq(campaignInfluencers.campaignId, id));
    return { ...c, items };
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

  async createTrackingJob(workspaceId: number, job: InsertTrackingJob): Promise<TrackingJob> {
    const [j] = await db.insert(trackingJobs).values({ ...job, workspaceId }).returning();
    return j;
  }

  async updateTrackingMetric(jobId: number, dateStr: string, value: number): Promise<void> {
    // Basic insert/update logic
    await db.insert(trackingMetrics).values({ jobId, date: dateStr, value }).onConflictDoNothing(); // simplified
  }

  async getTrackingMetrics(jobId: number): Promise<{ date: string; value: number }[]> {
    const metrics = await db.select().from(trackingMetrics).where(eq(trackingMetrics.jobId, jobId));
    return metrics.map(m => ({ date: m.date, value: m.value || 0 }));
  }
}

export const storage = new DatabaseStorage();
