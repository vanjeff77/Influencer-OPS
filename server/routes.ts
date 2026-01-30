import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { google } from "googleapis";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  setupAuth(app);

  // === AUTH ===
  app.post(api.auth.login.path, (req, res, next) => {
    // Manual passport handling to return JSON
    import("passport").then((passport) => {
      passport.default.authenticate("local", (err: any, user: any, info: any) => {
        if (err) return next(err);
        if (!user) return res.status(401).json({ message: info?.message || "Unauthorized" });
        req.logIn(user, (err) => {
          if (err) return next(err);
          return res.json({ id: user.id, email: user.email, name: user.name });
        });
      })(req, res, next);
    });
  });

  app.post(api.auth.logout.path, (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.json({});
    });
  });

  app.get(api.auth.me.path, (req, res) => {
    if (!req.isAuthenticated()) return res.json(null);
    const user = req.user as any;
    res.json({ id: user.id, email: user.email, name: user.name });
  });

  // === WORKSPACES ===
  app.get(api.workspaces.list.path, async (req, res) => {
    // For MVP, return all workspaces. In real app, filter by user membership.
    const w = await storage.getWorkspaces();
    res.json(w);
  });

  app.post(api.workspaces.create.path, async (req, res) => {
    const input = api.workspaces.create.input.parse(req.body);
    const w = await storage.createWorkspace(input);
    res.status(201).json(w);
  });

  // === INFLUENCERS ===
  app.get(api.influencers.list.path, async (req, res) => {
    const wId = parseInt(req.params.workspaceId);
    const { search } = req.query as { search?: string };
    const infs = await storage.getInfluencers(wId, search);
    res.json(infs);
  });

  app.post(api.influencers.create.path, async (req, res) => {
    const wId = parseInt(req.params.workspaceId);
    const input = api.influencers.create.input.parse(req.body);
    const inf = await storage.createInfluencer(wId, input);
    res.status(201).json(inf);
  });

  app.get(api.influencers.get.path, async (req, res) => {
    const inf = await storage.getInfluencer(parseInt(req.params.id));
    if (!inf) return res.status(404).json({ message: "Not found" });
    res.json(inf);
  });

  // === GROUPS ===
  app.get(api.groups.list.path, async (req, res) => {
    const groups = await storage.getGroups(parseInt(req.params.workspaceId));
    res.json(groups);
  });

  app.post(api.groups.create.path, async (req, res) => {
    const group = await storage.createGroup(parseInt(req.params.workspaceId), req.body);
    res.status(201).json(group);
  });

  // === CAMPAIGNS ===
  app.get(api.campaigns.list.path, async (req, res) => {
    const campaigns = await storage.getCampaigns(parseInt(req.params.workspaceId));
    res.json(campaigns);
  });

  app.post(api.campaigns.create.path, async (req, res) => {
    const campaign = await storage.createCampaign(parseInt(req.params.workspaceId), req.body);
    res.status(201).json(campaign);
  });

  app.get(api.campaigns.get.path, async (req, res) => {
    const campaign = await storage.getCampaign(parseInt(req.params.id));
    if (!campaign) return res.status(404).json({ message: "Not found" });
    res.json(campaign);
  });

  app.patch(api.campaigns.updateItem.path, async (req, res) => {
    const item = await storage.updateCampaignItem(parseInt(req.params.id), req.body);
    res.json(item);
  });

  // === EMAIL ===
  // Stub for Gmail OAuth Callback
  app.get('/api/email/gmail/callback', async (req, res) => {
    // In a real app, we'd exchange code for token here
    // For MVP, we might just simulate "Connected"
    const code = req.query.code;
    res.send("Gmail Connected! You can close this window.");
  });

  app.get(api.email.listAccounts.path, async (req, res) => {
    const accounts = await storage.getEmailAccounts(parseInt(req.params.workspaceId));
    res.json(accounts);
  });

  app.post(api.email.sync.path, async (req, res) => {
    // Mock Sync
    const accountId = parseInt(req.params.id);
    // Add some mock threads
    await storage.createEmailThread({
      accountId,
      threadId: `thread-${Date.now()}`,
      subject: "Re: Collaboration Proposal",
      snippet: "Sounds good, let's proceed.",
      lastMessageDate: new Date(),
    });
    res.json({ syncedCount: 1 });
  });

  app.get(api.email.threads.path, async (req, res) => {
    const threads = await storage.getEmailThreads(parseInt(req.params.accountId));
    res.json(threads);
  });

  app.post(api.email.sendBulk.path, async (req, res) => {
    // Mock Send
    res.json({ sent: req.body.to.length, failed: 0 });
  });

  // === TRACKING ===
  app.get(api.tracking.list.path, async (req, res) => {
    const jobs = await storage.getTrackingJobs(parseInt(req.params.workspaceId));
    res.json(jobs);
  });

  app.post(api.tracking.create.path, async (req, res) => {
    const job = await storage.createTrackingJob(parseInt(req.params.workspaceId), req.body);
    res.status(201).json(job);
  });

  app.post(api.tracking.mockUpdate.path, async (req, res) => {
    const jobId = parseInt(req.params.id);
    // Generate 7 days of mock data
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const val = Math.floor(Math.random() * 1000) + 5000;
      await storage.updateTrackingMetric(jobId, d.toISOString().split('T')[0], val);
    }
    res.json({});
  });

  app.get(api.tracking.getMetrics.path, async (req, res) => {
    const metrics = await storage.getTrackingMetrics(parseInt(req.params.id));
    res.json(metrics);
  });

  // SEED DATA logic (called once)
  seedDatabase();

  return httpServer;
}

async function seedDatabase() {
  const existingUser = await storage.getUserByEmail("demo@example.com");
  if (!existingUser) {
    const hashedPassword = await bcrypt.hash("password", 10);
    const user = await storage.createUser({
      email: "demo@example.com",
      password: hashedPassword,
      name: "Demo User",
    });

    const ws = await storage.createWorkspace({
      name: "Demo Workspace",
      logo: "https://github.com/shadcn.png"
    });

    // Create 5 influencers
    for (let i = 1; i <= 5; i++) {
      await storage.createInfluencer(ws.id, {
        name: `Influencer ${i}`,
        email: `inf${i}@example.com`,
        tags: ["fashion", "beauty"],
        accounts: [
          { platform: "IG", handle: `@influencer${i}`, url: `https://instagram.com/influencer${i}`, verified: true }
        ]
      });
    }

    // Create 1 Campaign
    const camp = await storage.createCampaign(ws.id, {
      name: "Summer Launch 2025",
      client: "Acme Corp",
      budget: 50000,
      status: "active"
    });
  }
}
