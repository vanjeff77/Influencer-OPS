import type { Express } from "express";
import { createServer, type Server } from "http";
import crypto from "crypto";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { campaignInfluencers, campaigns, influencers, influencerAccounts, users, workspaceMembers, workspaces, emailAccounts, contentSubmissions, conversations, conversationMessages } from "@shared/schema";
import { eq, and, or, inArray, sql, isNull, desc } from "drizzle-orm";
import { getImapSmtpSettings } from "./smtp";
import { encryptPassword } from "./imap";
import { normalizeInstagramHandle, normalizeInstagramUrl } from "@shared/utils";
import { getDefaultFrameworkDoc } from "./ai/draft-generator";
import { fetchProfileImage, getDirectDownloadUrl } from "./profile-fetcher";

// Singleton browser instance for PDF generation
let sharedBrowser: any = null;
let browserLaunchPromise: Promise<any> | null = null;
let puppeteerAvailable = true;
let pdfServiceReady = false;
let pdfServiceError: string | null = null;

// Check font files at startup
import * as fsSync from 'fs';
import * as pathSync from 'path';

const fontPathRegularCheck = pathSync.join(process.cwd(), 'server', 'fonts', 'NotoSansKR-Regular.ttf');
const fontPathBoldCheck = pathSync.join(process.cwd(), 'server', 'fonts', 'NotoSansKR-Bold.ttf');
const fontsAvailable = fsSync.existsSync(fontPathRegularCheck) && fsSync.existsSync(fontPathBoldCheck);
const isProduction = process.env.NODE_ENV === 'production';

if (!fontsAvailable) {
  if (isProduction) {
    console.error('[PDF] CRITICAL: Korean fonts not found in production. PDF generation disabled.');
    pdfServiceError = 'PDF 생성에 필요한 폰트 파일이 없습니다. 관리자에게 문의해주세요.';
  } else {
    console.warn('[PDF] Warning: Korean fonts not found. PDF generation will use Google Fonts fallback (dev mode).');
  }
} else {
  console.log('[PDF] Korean fonts (NotoSansKR) found. PDF generation ready.');
}

// Shared Puppeteer launch args for consistency between preflight and production
const PUPPETEER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--font-render-hinting=none'
];

// Find system Chromium executable path
import * as fsSync from 'fs';
function findChromiumPath(): string | undefined {
  const paths = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome'
  ];
  
  for (const p of paths) {
    if (p && fsSync.existsSync(p)) {
      console.log('[PDF] Found Chromium at:', p);
      return p;
    }
  }
  return undefined;
}

const chromiumPath = findChromiumPath();

// Preflight check for Puppeteer at startup - uses actual getSharedBrowser for consistency
(async function preflightPuppeteerCheck() {
  // Skip preflight if font errors already detected
  if (pdfServiceError) {
    console.log('[PDF] Skipping preflight - service already disabled due to font issues.');
    return;
  }
  
  // Check if Chromium is available
  if (!chromiumPath) {
    console.error('[PDF] Chromium not found. PDF generation will be disabled.');
    puppeteerAvailable = false;
    pdfServiceError = 'PDF 생성에 필요한 Chromium 브라우저가 설치되어 있지 않습니다.';
    return;
  }
  
  try {
    const puppeteer = await import('puppeteer');
    sharedBrowser = await puppeteer.default.launch({
      headless: true,
      executablePath: chromiumPath,
      args: PUPPETEER_ARGS
    });
    
    // Handle browser disconnect
    sharedBrowser.on('disconnected', () => {
      sharedBrowser = null;
      browserLaunchPromise = null;
    });
    
    pdfServiceReady = true;
    console.log('[PDF] Puppeteer preflight check passed. PDF service ready.');
  } catch (err: any) {
    console.error('[PDF] Puppeteer preflight check failed:', err.message);
    puppeteerAvailable = false;
    pdfServiceError = 'PDF 생성 서비스 초기화에 실패했습니다. Chromium 브라우저를 확인해주세요.';
  }
})();

async function getSharedBrowser() {
  // Check for service errors first
  if (pdfServiceError) {
    throw new Error(pdfServiceError);
  }
  if (!puppeteerAvailable) {
    throw new Error('PDF 생성 서비스가 현재 사용 불가능합니다. 관리자에게 문의해주세요.');
  }
  // Check if service is ready (preflight passed)
  if (!pdfServiceReady) {
    throw new Error('PDF 생성 서비스가 아직 준비 중입니다. 잠시 후 다시 시도해주세요.');
  }
  
  if (sharedBrowser) return sharedBrowser;
  
  if (browserLaunchPromise) return browserLaunchPromise;
  
  browserLaunchPromise = (async () => {
    try {
      const puppeteer = await import('puppeteer');
      sharedBrowser = await puppeteer.default.launch({
        headless: true,
        executablePath: chromiumPath,
        args: PUPPETEER_ARGS
      });
      
      // Handle browser disconnect
      sharedBrowser.on('disconnected', () => {
        sharedBrowser = null;
        browserLaunchPromise = null;
      });
      
      console.log('[PDF] Puppeteer browser launched successfully.');
      return sharedBrowser;
    } catch (err: any) {
      console.error('[PDF] Failed to launch Puppeteer browser:', err.message);
      puppeteerAvailable = false;
      browserLaunchPromise = null;
      throw new Error('PDF 생성 서비스 초기화에 실패했습니다. Chromium 브라우저를 확인해주세요.');
    }
  })();
  
  return browserLaunchPromise;
}

async function ensureWorkspaceMembers() {
  try {
    const allWorkspaces = await storage.getWorkspaces();
    const allUsers = await db.select().from(users);
    
    if (allWorkspaces.length > 0 && allUsers.length > 0) {
      const existingMembers = await db.select().from(workspaceMembers);
      
      if (existingMembers.length === 0) {
        console.log("[init] No workspace members found, creating default assignments...");
        
        const firstWorkspace = allWorkspaces[0];
        const firstUser = allUsers[0];
        
        await db.insert(workspaceMembers).values({
          workspaceId: firstWorkspace.id,
          userId: firstUser.id,
          role: 'WORKSPACE_OWNER'
        });
        
        console.log(`[init] Assigned user ${firstUser.email} as WORKSPACE_OWNER to ${firstWorkspace.name}`);
      }
      
      // Migration: Move members from Main Workspace to VANCED and delete Main Workspace
      const vancedWorkspace = allWorkspaces.find(w => w.name === 'VANCED');
      const mainWorkspace = allWorkspaces.find(w => w.name === 'Main Workspace');
      
      if (vancedWorkspace && mainWorkspace) {
        const vancedMembers = existingMembers.filter(m => m.workspaceId === vancedWorkspace.id);
        const mainMembers = existingMembers.filter(m => m.workspaceId === mainWorkspace.id);
        
        // If VANCED has no members but Main Workspace does, migrate members
        if (vancedMembers.length === 0 && mainMembers.length > 0) {
          console.log("[migration] Migrating members from Main Workspace to VANCED...");
          
          for (const member of mainMembers) {
            await db.insert(workspaceMembers).values({
              workspaceId: vancedWorkspace.id,
              userId: member.userId,
              role: member.role
            }).onConflictDoNothing();
            console.log(`[migration] Migrated user ${member.userId} to VANCED with role ${member.role}`);
          }
          
          // Delete Main Workspace members first
          await db.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, mainWorkspace.id));
          console.log("[migration] Deleted Main Workspace members");
          
          // Delete Main Workspace
          await db.delete(workspaces).where(eq(workspaces.id, mainWorkspace.id));
          console.log("[migration] Deleted Main Workspace");
        }
      }
    }
  } catch (error) {
    console.error("[init] Error ensuring workspace members:", error);
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  setupAuth(app);
  
  await ensureWorkspaceMembers();

  // === AUTH ===
  app.post(api.auth.login.path, (req, res, next) => {
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

  app.get(api.auth.me.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.json(null);
    const user = req.user as any;
    // Fetch full user data to include isPlatformAdmin and onboarding status
    const fullUser = await storage.getUser(user.id);
    res.json({ 
      id: user.id, 
      email: user.email, 
      name: user.name,
      isPlatformAdmin: fullUser?.isPlatformAdmin || false,
      onboardingCompleted: fullUser?.onboardingCompleted || false,
      dismissedHints: fullUser?.dismissedHints || []
    });
  });

  // === ONBOARDING ===
  app.post("/api/onboarding/complete", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    const user = req.user as any;
    await db.update(users).set({ onboardingCompleted: true }).where(eq(users.id, user.id));
    res.json({ success: true });
  });

  app.post("/api/onboarding/reset", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    const user = req.user as any;
    await db.update(users).set({ onboardingCompleted: false, dismissedHints: [] }).where(eq(users.id, user.id));
    res.json({ success: true });
  });

  app.post("/api/onboarding/dismiss-hint", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    const user = req.user as any;
    const { hintId } = req.body;
    if (!hintId) return res.status(400).json({ message: "hintId required" });
    const fullUser = await storage.getUser(user.id);
    const currentHints = fullUser?.dismissedHints || [];
    if (!currentHints.includes(hintId)) {
      await db.update(users).set({ dismissedHints: [...currentHints, hintId] }).where(eq(users.id, user.id));
    }
    res.json({ success: true });
  });

  // === WORKSPACES ===
  app.get(api.workspaces.list.path, async (req, res) => {
    const w = await storage.getWorkspaces();
    res.json(w);
  });

  app.post(api.workspaces.create.path, async (req, res) => {
    const input = api.workspaces.create.input.parse(req.body);
    const w = await storage.createWorkspace(input);
    res.status(201).json(w);
  });

  // Update workspace (name change)
  app.patch('/api/workspaces/:workspaceId', async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const workspaceId = parseInt(req.params.workspaceId);
    if (isNaN(workspaceId)) {
      return res.status(400).json({ message: '잘못된 워크스페이스 ID입니다.' });
    }

    const userId = (req.user as any).id;

    // Check if user is WORKSPACE_OWNER
    const membership = await storage.getWorkspaceMember(userId, workspaceId);
    if (!membership || membership.role !== 'WORKSPACE_OWNER') {
      return res.status(403).json({ message: '워크스페이스 소유자만 이름을 변경할 수 있습니다.' });
    }

    const { name, tabDescriptions, aiDraftEnabled, aiProvider, aiApiKey, aiModel } = req.body as {
      name?: string;
      tabDescriptions?: Record<string, string>;
      aiDraftEnabled?: boolean;
      aiProvider?: string;
      aiApiKey?: string;
      aiModel?: string;
    };

    const updateData: any = {};

    if (name !== undefined) {
      if (!name.trim()) {
        return res.status(400).json({ message: '워크스페이스 이름을 입력해주세요.' });
      }
      const trimmedName = name.trim();
      if (trimmedName.length > 100) {
        return res.status(400).json({ message: '워크스페이스 이름은 100자를 초과할 수 없습니다.' });
      }
      updateData.name = trimmedName;
    }

    if (tabDescriptions !== undefined) {
      updateData.tabDescriptions = tabDescriptions;
    }

    if (aiDraftEnabled !== undefined) {
      updateData.aiDraftEnabled = aiDraftEnabled;
    }

    if (aiProvider !== undefined) {
      if (!['replit', 'openai', 'anthropic'].includes(aiProvider)) {
        return res.status(400).json({ message: '유효하지 않은 AI 제공자입니다.' });
      }
      updateData.aiProvider = aiProvider;
    }

    if (aiApiKey !== undefined) {
      if (aiApiKey === '') {
        updateData.aiApiKey = null;
      } else {
        const encryptedKey = encryptPassword(aiApiKey);
        updateData.aiApiKey = encryptedKey;
      }
    }

    if (aiModel !== undefined) {
      updateData.aiModel = aiModel || null;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: '변경할 내용이 없습니다.' });
    }

    const updated = await storage.updateWorkspace(workspaceId, updateData);
    const responseData = { ...updated, aiApiKey: updated.aiApiKey ? '••••••••' : null };
    res.json(responseData);
  });

  app.get('/api/workspaces/:id/ai-framework', async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const workspaceId = parseInt(req.params.id);
      const userId = (req.user as any).id;
      const membership = await storage.getWorkspaceMember(userId, workspaceId);
      if (!membership) return res.status(403).json({ message: "Forbidden" });

      const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
      if (!workspace) return res.status(404).json({ message: "Workspace not found" });

      if (workspace.aiFrameworkDoc) {
        return res.json({ content: workspace.aiFrameworkDoc, isCustom: true });
      }

      res.json({ content: getDefaultFrameworkDoc(), isCustom: false });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put('/api/workspaces/:id/ai-framework', async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const workspaceId = parseInt(req.params.id);
      const userId = (req.user as any).id;
      const membership = await storage.getWorkspaceMember(userId, workspaceId);
      if (!membership || membership.role !== 'WORKSPACE_OWNER') {
        return res.status(403).json({ message: "소유자만 프레임워크 문서를 수정할 수 있습니다." });
      }

      const { content } = req.body as { content: string };
      if (content == null) return res.status(400).json({ message: "content is required" });

      const updated = await storage.updateWorkspace(workspaceId, { aiFrameworkDoc: content });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/workspaces/:id/ai-framework/reset', async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const workspaceId = parseInt(req.params.id);
      const userId = (req.user as any).id;
      const membership = await storage.getWorkspaceMember(userId, workspaceId);
      if (!membership || membership.role !== 'WORKSPACE_OWNER') {
        return res.status(403).json({ message: "소유자만 프레임워크 문서를 초기화할 수 있습니다." });
      }

      await storage.updateWorkspace(workspaceId, { aiFrameworkDoc: null });

      res.json({ content: getDefaultFrameworkDoc(), isCustom: false });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === INFLUENCERS ===
  app.get(api.influencers.list.path, async (req, res) => {
    const wId = parseInt(req.params.workspaceId);
    const { search, platform, tags } = req.query as { search?: string; platform?: string; tags?: string };
    const filters = platform || tags ? { platform, tags: tags?.split(',') } : undefined;
    const infs = await storage.getInfluencers(wId, search, filters);
    res.json(infs);
  });

  app.post(api.influencers.create.path, async (req, res) => {
    const wId = parseInt(req.params.workspaceId);
    const input = api.influencers.create.input.parse(req.body);
    const inf = await storage.createInfluencer(wId, input);
    res.status(201).json(inf);
  });

  // Batch create influencers
  app.post('/api/workspaces/:workspaceId/influencers/batch', async (req, res) => {
    // Check authentication
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const wId = parseInt(req.params.workspaceId);
    const { items } = req.body as { items: Array<{
      nickname: string;
      handle: string;
      platform: string;
      followers?: number | null;
      email?: string | null;
      contactPoint?: string | null;
      tag1?: string | null;
      tag2?: string | null;
      tag3?: string | null;
      memo?: string | null;
      priceMemo?: string | null;
      client?: string | null;
      contactStatus?: string | null;
      replyStatus?: string | null;
      collabStatus?: string | null;
      finalContentUrl?: string | null;
    }> };

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'items array is required' });
    }

    // Normalize platform names to short codes (IG, YT, etc.)
    const normalizePlatform = (platform: string): string => {
      const mapping: Record<string, string> = {
        'instagram': 'IG',
        'insta': 'IG',
        'ig': 'IG',
        '인스타': 'IG',
        '인스타그램': 'IG',
        'youtube': 'YT',
        'yt': 'YT',
        '유튜브': 'YT',
        'tiktok': 'TikTok',
        '틱톡': 'TikTok',
        'x': 'X',
        'twitter': 'X',
        '트위터': 'X',
        'blog': 'Blog',
        '블로그': 'Blog',
        '네이버블로그': 'Blog',
      };
      return mapping[platform.toLowerCase().trim()] || platform;
    };

    const results: Array<{ index: number; status: 'created' | 'failed'; reason?: string; influencerId?: number }> = [];
    let createdCount = 0;
    let failedCount = 0;

    // Get existing influencers to check for duplicates
    const existingInfluencers = await storage.getInfluencers(wId);
    const existingHandles = new Set(
      existingInfluencers.flatMap(inf => 
        inf.accounts.map(acc => `${acc.platform.toLowerCase()}:${acc.handle.toLowerCase()}`)
      )
    );

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      try {
        // Validate required fields with detailed error messages
        const missingFields: string[] = [];
        if (!item.nickname?.trim()) {
          missingFields.push('닉네임');
        }
        
        if (missingFields.length > 0) {
          results.push({ index: i, status: 'failed', reason: `필수 필드 누락: ${missingFields.join(', ')}` });
          failedCount++;
          continue;
        }

        const generateUrl = (platform: string, handle: string): string => {
          if (!handle) return '';
          const cleanHandle = handle.replace(/^@/, '');
          const platformLower = platform.toLowerCase();
          switch (platformLower) {
            case 'ig': 
            case 'instagram': return normalizeInstagramUrl(cleanHandle);
            case 'yt':
            case 'youtube': return `https://youtube.com/@${cleanHandle}`;
            case 'tiktok': return `https://tiktok.com/@${cleanHandle}`;
            case 'x': return `https://x.com/${cleanHandle}`;
            case 'blog': return `https://blog.naver.com/${cleanHandle}`;
            default: return `https://${platformLower}.com/${cleanHandle}`;
          }
        };

        const hasPlatform = item.platform?.trim();
        const hasHandle = item.handle?.trim();
        const normalizedPlatform = hasPlatform ? normalizePlatform(item.platform) : '';
        
        let finalHandle = hasHandle ? item.handle.replace(/^@/, '') : '';
        if (hasHandle && (normalizedPlatform === 'IG' || normalizedPlatform === 'Instagram')) {
          const normalized = normalizeInstagramHandle(item.handle);
          if (normalized === null) {
            results.push({ index: i, status: 'failed', reason: `잘못된 인스타그램 URL입니다 (콘텐츠 URL은 사용할 수 없습니다)` });
            failedCount++;
            continue;
          }
          finalHandle = normalized;
        }
        
        if (hasPlatform && hasHandle) {
          const handleKey = `${normalizedPlatform.toLowerCase()}:${finalHandle.toLowerCase()}`;
          if (existingHandles.has(handleKey)) {
            results.push({ index: i, status: 'failed', reason: `이미 존재하는 계정입니다 (${normalizedPlatform}: ${finalHandle})` });
            failedCount++;
            continue;
          }
        }

        const accounts = hasPlatform ? [{
          platform: normalizedPlatform,
          handle: finalHandle,
          url: finalHandle ? generateUrl(normalizedPlatform, finalHandle) : '',
          followers: item.followers || undefined,
        }] : [];

        // Create influencer
        const inf = await storage.createInfluencer(wId, {
          name: item.nickname.trim(),
          email: (item.email && item.email.includes('@')) ? item.email : (item.contactPoint?.includes('@') ? item.contactPoint : undefined),
          phone: item.contactPoint && !item.contactPoint.includes('@') ? item.contactPoint : undefined,
          contactPoint: item.contactPoint || undefined,
          memo: item.memo || undefined,
          priceMemo: item.priceMemo || undefined,
          tag1: item.tag1 || undefined,
          tag2: item.tag2 || undefined,
          tag3: item.tag3 || undefined,
          client: item.client || undefined,
          contactStatus: item.contactStatus || undefined,
          replyStatus: item.replyStatus || undefined,
          collabStatus: item.collabStatus || undefined,
          finalContentUrl: item.finalContentUrl || undefined,
          accounts
        });

        if (hasPlatform && hasHandle) {
          const handleKey = `${normalizedPlatform.toLowerCase()}:${finalHandle.toLowerCase()}`;
          existingHandles.add(handleKey);
        }
        results.push({ index: i, status: 'created', influencerId: inf.id });
        createdCount++;
      } catch (err: any) {
        results.push({ index: i, status: 'failed', reason: err.message || '생성 실패' });
        failedCount++;
      }
    }

    res.json({ createdCount, failedCount, results });
  });

  app.get(api.influencers.get.path, async (req, res) => {
    const inf = await storage.getInfluencer(parseInt(req.params.id));
    if (!inf) return res.status(404).json({ message: "Not found" });
    res.json(inf);
  });

  // Get campaign participation history for an influencer
  app.get('/api/influencers/:id/campaigns', async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const influencerId = parseInt(req.params.id);
    const workspaceId = parseInt(req.query.workspaceId as string);
    if (!workspaceId) {
      return res.json([]);
    }
    
    // Verify user has access to this workspace
    const userId = (req.user as any).id;
    const memberships = await storage.getWorkspaceMemberships(userId);
    const hasAccess = memberships.some(m => m.workspaceId === workspaceId);
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }
    
    const participations = await storage.getInfluencerCampaignHistory(influencerId, workspaceId);
    res.json(participations);
  });

  // Update influencer (memo, tags, email, phone, priceMemo, etc.)
  app.patch('/api/influencers/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const data = { ...req.body };
      
      // Parse date fields
      if (data.priceMemoUpdatedAt) data.priceMemoUpdatedAt = new Date(data.priceMemoUpdatedAt);
      if (data.settlementInfoUpdatedAt) data.settlementInfoUpdatedAt = new Date(data.settlementInfoUpdatedAt);
      
      const inf = await storage.updateInfluencer(id, data);
      res.json(inf);
    } catch (err: any) {
      console.error('Failed to update influencer:', err);
      res.status(500).json({ message: "Failed to update", error: err.message });
    }
  });

  // Delete influencer
  app.delete('/api/influencers/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      const campaignAssignments = await db.select({
        campaignName: campaigns.name
      })
        .from(campaignInfluencers)
        .innerJoin(campaigns, eq(campaignInfluencers.campaignId, campaigns.id))
        .where(eq(campaignInfluencers.influencerId, id));
      
      if (campaignAssignments.length > 0) {
        const campaignNames = campaignAssignments.map(a => a.campaignName).join(', ');
        return res.status(400).json({ 
          message: `캠페인에 할당된 인플루언서는 삭제할 수 없습니다. 해당 캠페인에서 먼저 제외한 후 삭제해 주세요. (${campaignNames})` 
        });
      }
      
      await storage.deleteInfluencer(id);
      res.json({ success: true });
    } catch (err: any) {
      console.error('Failed to delete influencer:', err);
      res.status(500).json({ message: "인플루언서 삭제 실패", error: err.message });
    }
  });

  // Bulk delete influencers
  app.post('/api/influencers/bulk-delete', async (req, res) => {
    try {
      const { ids } = req.body as { ids: number[] };
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "삭제할 인플루언서 ID가 필요합니다." });
      }
      
      const campaignAssignments = await db.select({
        influencerId: campaignInfluencers.influencerId,
        campaignName: campaigns.name
      })
        .from(campaignInfluencers)
        .innerJoin(campaigns, eq(campaignInfluencers.campaignId, campaigns.id))
        .where(inArray(campaignInfluencers.influencerId, ids));
      
      if (campaignAssignments.length > 0) {
        const blockedIds = Array.from(new Set(campaignAssignments.map(a => a.influencerId)));
        const campaignNames = Array.from(new Set(campaignAssignments.map(a => a.campaignName))).join(', ');
        return res.status(400).json({ 
          message: `캠페인에 할당된 인플루언서 ${blockedIds.length}명은 삭제할 수 없습니다. 해당 캠페인에서 먼저 제외한 후 삭제해 주세요. (${campaignNames})` 
        });
      }
      
      let deleted = 0;
      for (const id of ids) {
        await storage.deleteInfluencer(id);
        deleted++;
      }
      
      res.json({ success: true, deleted });
    } catch (err: any) {
      console.error('Failed to bulk delete influencers:', err);
      res.status(500).json({ message: "대량 삭제 실패", error: err.message });
    }
  });

  // === INFLUENCER IMPORT (PASTE/TSV) ===
  const ALLOWED_COLUMNS = [
    '닉네임', '플랫폼', '플랫폼 계정', '채널 URL', '팔로워', '컨택포인트',
    '메모', '클라이언트', '세부유형', '컨택여부', '회신 여부', '협업 여부', '콘텐츠 완성본 링크', '단가 메모'
  ];

  const PLATFORM_MAP: Record<string, string> = {
    'instagram': 'IG', 'IG': 'IG', '인스타그램': 'IG', '인스타': 'IG',
    'youtube': 'YT', 'YT': 'YT', '유튜브': 'YT',
    'tiktok': 'TikTok', 'TikTok': 'TikTok', '틱톡': 'TikTok',
    'x': 'X', 'X': 'X', 'twitter': 'X', '트위터': 'X',
    'blog': 'Blog', 'Blog': 'Blog', '블로그': 'Blog', 'naver': 'Blog', '네이버': 'Blog',
  };

  const VALID_PLATFORMS = ['IG', 'YT', 'TikTok', 'X', 'Blog'];
  
  function parsePlatform(val: string | undefined | null): string | null {
    if (!val) return null;
    const normalized = val.trim().toLowerCase();
    for (const [key, mapped] of Object.entries(PLATFORM_MAP)) {
      if (key.toLowerCase() === normalized) return mapped;
    }
    // Unknown platform - return null to indicate invalid
    return null;
  }

  function parseFollowers(val: string | number | undefined | null): number | null {
    if (val === null || val === undefined || val === '') return null;
    if (typeof val === 'number') return val;
    const cleaned = val.toString().replace(/,/g, '').trim();
    const num = parseInt(cleaned, 10);
    return isNaN(num) ? null : num;
  }

  function extractHandleFromUrl(url: string): string {
    if (!url) return '';
    const trimmed = url.trim();
    // Instagram: https://www.instagram.com/username/
    const igMatch = trimmed.match(/instagram\.com\/([^\/\?]+)/i);
    if (igMatch) return igMatch[1];
    // YouTube: https://www.youtube.com/@username
    const ytMatch = trimmed.match(/youtube\.com\/@([^\/\?]+)/i);
    if (ytMatch) return ytMatch[1];
    // TikTok: https://www.tiktok.com/@username
    const ttMatch = trimmed.match(/tiktok\.com\/@([^\/\?]+)/i);
    if (ttMatch) return ttMatch[1];
    // X/Twitter: https://x.com/username
    const xMatch = trimmed.match(/(?:x|twitter)\.com\/([^\/\?]+)/i);
    if (xMatch) return xMatch[1];
    // Blog: https://blog.naver.com/username
    const blogMatch = trimmed.match(/blog\.naver\.com\/([^\/\?]+)/i);
    if (blogMatch) return blogMatch[1];
    return '';
  }

  app.post('/api/workspaces/:workspaceId/influencers/import', async (req, res) => {
    try {
      const workspaceId = parseInt(req.params.workspaceId as string);
      const { headers, rows } = req.body as { headers: string[]; rows: (string | number | null)[][] };

      if (!headers || !rows) {
        return res.status(400).json({ message: 'headers and rows are required' });
      }

      // Map column indices
      const colIndex: Record<string, number> = {};
      const excludedColumns: string[] = [];
      headers.forEach((h, i) => {
        const trimmed = (h || '').toString().trim();
        if (ALLOWED_COLUMNS.includes(trimmed)) {
          colIndex[trimmed] = i;
        } else if (trimmed) {
          excludedColumns.push(trimmed);
        }
      });

      const results = {
        created: 0,
        updated: 0,
        skipped: 0,
        errors: [] as { row: number; reason: string }[]
      };

      for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
        const row = rows[rowIdx];
        if (!row || row.length === 0 || row.every(c => c === null || c === '')) {
          results.skipped++;
          continue;
        }

        const getValue = (col: string): string | number | null => {
          const idx = colIndex[col];
          return idx !== undefined ? row[idx] : null;
        };

        const nickname = (getValue('닉네임') || '').toString().trim();
        const platformRaw = (getValue('플랫폼') || '').toString().trim();
        const platformAccount = (getValue('플랫폼 계정') || '').toString().trim();
        const channelUrl = (getValue('채널 URL') || '').toString().trim();
        const followersRaw = getValue('팔로워');
        const contactPoint = (getValue('컨택포인트') || '').toString().trim();
        const memo = (getValue('메모') || '').toString().trim();
        const client = (getValue('클라이언트') || '').toString().trim();
        const tag1 = (getValue('태그1') || getValue('세부유형') || '').toString().trim();
        const tag2 = (getValue('태그2') || '').toString().trim();
        const tag3 = (getValue('태그3') || '').toString().trim();
        const contactStatus = (getValue('컨택여부') || '').toString().trim();
        const replyStatus = (getValue('회신 여부') || '').toString().trim();
        const collabStatus = (getValue('협업 여부') || '').toString().trim();
        const finalContentUrl = (getValue('콘텐츠 완성본 링크') || '').toString().trim();
        const priceMemo = (getValue('단가 메모') || '').toString().trim();

        const platform = parsePlatform(platformRaw);
        const followers = parseFollowers(followersRaw);
        let handle = platformAccount || extractHandleFromUrl(channelUrl);
        const url = channelUrl;

        // Validate platform if provided - must be a known platform
        if (platformRaw && !platform) {
          results.errors.push({ row: rowIdx + 1, reason: `알 수 없는 플랫폼: ${platformRaw}` });
          continue;
        }

        // Validate status fields (must be Y, N, or empty)
        const validStatusValues = ['Y', 'N', ''];
        if (contactStatus && !validStatusValues.includes(contactStatus)) {
          results.errors.push({ row: rowIdx + 1, reason: `컨택여부 값이 올바르지 않음: ${contactStatus}` });
          continue;
        }
        if (replyStatus && !validStatusValues.includes(replyStatus)) {
          results.errors.push({ row: rowIdx + 1, reason: `회신 여부 값이 올바르지 않음: ${replyStatus}` });
          continue;
        }
        if (collabStatus && !validStatusValues.includes(collabStatus)) {
          results.errors.push({ row: rowIdx + 1, reason: `협업 여부 값이 올바르지 않음: ${collabStatus}` });
          continue;
        }

        // Validate: need at least nickname OR (platform + handle) OR (platform + url)
        if (!nickname && !handle && !url) {
          results.errors.push({ row: rowIdx + 1, reason: '필수 키(닉네임, 채널 URL) 없음' });
          continue;
        }

        try {
          // Find existing influencer
          const existing = await storage.findInfluencerByKey(
            workspaceId,
            platform,
            handle || null,
            url || null,
            nickname || null
          );

          const influencerData = {
            name: nickname || handle || 'Unknown',
            contactPoint: contactPoint || null,
            memo: memo || null,
            client: client || null,
            tag1: tag1 || null,
            tag2: tag2 || null,
            tag3: tag3 || null,
            contactStatus: contactStatus || null,
            replyStatus: replyStatus || null,
            collabStatus: collabStatus || null,
            finalContentUrl: finalContentUrl || null,
            priceMemo: priceMemo || null
          };

          const accountData = (platform || handle || url) ? {
            platform: platform || 'IG',
            handle: handle || nickname || 'unknown',
            url: url || '',
            followers: followers || 0
          } : null;

          const result = await storage.upsertInfluencerWithAccount(
            workspaceId,
            influencerData,
            accountData,
            existing
          );

          if (result.isNew) {
            results.created++;
          } else {
            results.updated++;
          }
        } catch (err) {
          results.errors.push({ row: rowIdx + 1, reason: 'DB 저장 실패' });
        }
      }

      res.json({
        success: true,
        excludedColumns,
        ...results
      });
    } catch (err) {
      console.error('Import error:', err);
      res.status(500).json({ message: 'Import failed' });
    }
  });

  // === INFLUENCER CONTENTS ===
  app.get('/api/influencers/:id/contents', async (req, res) => {
    const contents = await storage.getInfluencerContents(parseInt(req.params.id));
    res.json(contents);
  });

  app.post('/api/influencers/:id/contents', async (req, res) => {
    const influencerId = parseInt(req.params.id);
    const content = await storage.createContent({ ...req.body, influencerId });
    
    // Create timeline event
    const inf = await storage.getInfluencer(influencerId);
    if (inf) {
      await storage.createTimelineEvent({
        workspaceId: inf.workspaceId,
        influencerId,
        eventType: 'content_added',
        title: '콘텐츠 추가',
        description: req.body.link,
        metadata: { contentId: content.id }
      });
    }
    
    res.status(201).json(content);
  });

  app.delete('/api/contents/:id', async (req, res) => {
    await storage.deleteContent(parseInt(req.params.id));
    res.json({ success: true });
  });

  // === TIMELINE EVENTS ===
  app.get('/api/influencers/:id/timeline', async (req, res) => {
    const events = await storage.getTimelineEvents(parseInt(req.params.id));
    res.json(events);
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

  // Get group with members
  app.get('/api/groups/:id', async (req, res) => {
    const group = await storage.getGroup(parseInt(req.params.id));
    if (!group) return res.status(404).json({ message: "Not found" });
    res.json(group);
  });

  // Update group
  app.patch('/api/groups/:id', async (req, res) => {
    const group = await storage.updateGroup(parseInt(req.params.id), req.body);
    res.json(group);
  });

  // Add influencers to group
  app.post(api.groups.addInfluencers.path, async (req, res) => {
    const groupId = parseInt(req.params.id);
    const { influencerIds } = req.body;
    await storage.addInfluencersToGroup(groupId, influencerIds);
    
    // Create timeline events for each influencer
    const group = await storage.getGroup(groupId);
    if (group) {
      for (const influencerId of influencerIds) {
        await storage.createTimelineEvent({
          workspaceId: group.workspaceId,
          influencerId,
          eventType: 'group_added',
          title: '그룹에 추가됨',
          description: `"${group.name}" 그룹에 추가됨`,
          metadata: { groupId, groupName: group.name }
        });
      }
    }
    
    res.json({ success: true });
  });

  // Remove influencer from group
  app.delete('/api/groups/:id/members/:influencerId', async (req, res) => {
    await storage.removeInfluencerFromGroup(parseInt(req.params.id), parseInt(req.params.influencerId));
    res.json({ success: true });
  });

  // === CAMPAIGNS ===
  app.get(api.campaigns.list.path, async (req, res) => {
    try {
      const workspaceId = parseInt(req.params.workspaceId);
      let campaigns = await storage.getCampaigns(workspaceId);
      
      // CLIENT role filtering: only show campaigns for assigned clients
      if (req.isAuthenticated()) {
        const userId = (req.user as any).id;
        const member = await storage.getWorkspaceMember(userId, workspaceId);
        
        if (member?.role === 'CLIENT') {
          const assignments = await storage.getUserClientAssignments(userId, workspaceId);
          const assignedClientIds = new Set(assignments.map(a => a.clientId));
          
          campaigns = campaigns.filter(c => 
            c.clientId && assignedClientIds.has(c.clientId)
          );
        }
      }
      
      res.json(campaigns);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post(api.campaigns.create.path, async (req, res) => {
    const campaign = await storage.createCampaign(parseInt(req.params.workspaceId), req.body);
    res.status(201).json(campaign);
  });

  app.get(api.campaigns.get.path, async (req, res) => {
    try {
      const campaign = await storage.getCampaign(parseInt(req.params.id));
      if (!campaign) return res.status(404).json({ message: "Not found" });
      
      // CLIENT role filtering: check if user has access to this campaign's client
      if (req.isAuthenticated()) {
        const userId = (req.user as any).id;
        const member = await storage.getWorkspaceMember(userId, campaign.workspaceId);
        
        if (member?.role === 'CLIENT') {
          const assignments = await storage.getUserClientAssignments(userId, campaign.workspaceId);
          const assignedClientIds = new Set(assignments.map(a => a.clientId));
          
          if (!campaign.clientId || !assignedClientIds.has(campaign.clientId)) {
            return res.status(403).json({ message: "이 캠페인에 대한 접근 권한이 없습니다" });
          }
        }
      }
      
      res.json(campaign);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Update campaign
  app.patch('/api/campaigns/:id', async (req, res) => {
    const campaign = await storage.updateCampaign(parseInt(req.params.id), req.body);
    res.json(campaign);
  });

  app.get('/api/campaigns/:id/ai-instruction', async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const campaignId = parseInt(req.params.id);
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) return res.status(404).json({ message: "Campaign not found" });

      const userId = (req.user as any).id;
      const memberships = await storage.getWorkspaceMemberships(userId);
      const member = memberships.find(m => m.workspaceId === campaign.workspaceId);
      if (!member) return res.status(403).json({ message: "Forbidden" });

      res.json({ instruction: campaign.aiInstruction || '' });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put('/api/campaigns/:id/ai-instruction', async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const campaignId = parseInt(req.params.id);
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) return res.status(404).json({ message: "Campaign not found" });

      const userId = (req.user as any).id;
      const memberships = await storage.getWorkspaceMemberships(userId);
      const member = memberships.find(m => m.workspaceId === campaign.workspaceId);
      if (!member) return res.status(403).json({ message: "Forbidden" });
      if (member.role === 'CLIENT') return res.status(403).json({ message: "CLIENT role cannot edit AI instructions" });

      const { instruction } = req.body as { instruction: string };
      await storage.updateCampaign(campaignId, { aiInstruction: instruction || null });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete('/api/campaigns/:id', async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const userId = (req.user as any).id;
      const campaignId = parseInt(req.params.id);
      
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      
      const memberships = await storage.getWorkspaceMemberships(userId);
      const member = memberships.find(m => m.workspaceId === campaign.workspaceId);
      if (!member) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      if (member.role === 'CLIENT') {
        return res.status(403).json({ message: "CLIENT role cannot delete campaigns" });
      }
      
      await storage.deleteCampaign(campaignId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Get all campaign influencer assignments for a workspace
  app.get('/api/campaign-influencers', async (req, res) => {
    const workspaceId = parseInt(req.query.workspaceId as string);
    if (!workspaceId) {
      return res.json([]);
    }
    const items = await storage.getAllCampaignInfluencers(workspaceId);
    res.json(items);
  });

  // Add influencers to campaign (creates line items)
  app.post('/api/campaigns/:id/line-items', async (req, res) => {
    const campaignId = parseInt(req.params.id);
    const { influencerIds } = req.body;
    const items = await storage.addInfluencersToCampaign(campaignId, influencerIds);
    
    // Create timeline events
    const campaign = await storage.getCampaign(campaignId);
    if (campaign) {
      for (const influencerId of influencerIds) {
        await storage.createTimelineEvent({
          workspaceId: campaign.workspaceId,
          influencerId,
          campaignId,
          eventType: 'campaign_assigned',
          title: '캠페인 배정',
          description: `"${campaign.name}" 캠페인에 배정됨`,
          metadata: { campaignId, campaignName: campaign.name }
        });
      }
    }
    
    res.status(201).json(items);
  });

  app.patch(api.campaigns.updateItem.path, async (req, res) => {
    const itemId = parseInt(req.params.id);
    
    // Get old value for audit log
    const campaign = await storage.getCampaign(1); // simplified - would need to get correct campaign
    const oldItem = campaign?.items.find(i => i.id === itemId);
    
    const item = await storage.updateCampaignItem(itemId, req.body);
    
    // Create timeline event if status changed
    if (oldItem && item.status !== oldItem.status) {
      const inf = await storage.getInfluencer(item.influencerId);
      if (inf) {
        await storage.createTimelineEvent({
          workspaceId: inf.workspaceId,
          influencerId: item.influencerId,
          campaignId: item.campaignId,
          lineItemId: item.id,
          eventType: 'status_changed',
          title: '상태 변경',
          description: `${oldItem.status} → ${item.status}`,
          metadata: { oldStatus: oldItem.status, newStatus: item.status }
        });
      }
    }
    
    res.json(item);
  });

  // === CAMPAIGN CONTENTS ===
  app.get('/api/campaigns/:id/contents', async (req, res) => {
    const campaignId = parseInt(req.params.id);
    const contents = await storage.getCampaignContents(campaignId);
    res.json(contents);
  });

  app.post('/api/campaigns/:id/contents', async (req, res) => {
    const campaignId = parseInt(req.params.id);
    const { lineItemId, influencerId, platform, contentUrl, thumbnailUrl, publishedAt, views, likes, comments, shares, engagementRate, memo, status } = req.body;
    
    const content = await storage.createCampaignContent({
      campaignId,
      lineItemId,
      influencerId,
      platform,
      contentUrl,
      thumbnailUrl,
      publishedAt: publishedAt ? new Date(publishedAt) : null,
      views: views || 0,
      likes: likes || 0,
      comments: comments || 0,
      shares: shares || 0,
      engagementRate,
      memo,
      status: status || 'published'
    });
    
    // Create timeline event
    const influencer = await storage.getInfluencer(influencerId);
    const campaign = await storage.getCampaign(campaignId);
    if (influencer && campaign) {
      await storage.createTimelineEvent({
        workspaceId: campaign.workspaceId,
        influencerId,
        campaignId,
        lineItemId,
        eventType: 'content_added',
        title: '콘텐츠 등록',
        description: `"${campaign.name}" 캠페인에 콘텐츠 등록`,
        metadata: { contentUrl, platform }
      });
    }
    
    res.status(201).json(content);
  });

  app.patch('/api/campaign-contents/:id', async (req, res) => {
    const contentId = parseInt(req.params.id);
    const updated = await storage.updateCampaignContent(contentId, req.body);
    res.json(updated);
  });

  app.delete('/api/campaign-contents/:id', async (req, res) => {
    const contentId = parseInt(req.params.id);
    await storage.deleteCampaignContent(contentId);
    res.status(204).send();
  });

  // === BULK OPERATIONS ===
  app.post('/api/bulk/save-to-group', async (req, res) => {
    const { influencerIds, groupId, createGroup } = req.body;
    
    let targetGroupId = groupId;
    
    // Create new group if requested
    if (createGroup) {
      const workspaceId = createGroup.workspaceId;
      const newGroup = await storage.createGroup(workspaceId, {
        name: createGroup.name,
        description: createGroup.description || ''
      });
      targetGroupId = newGroup.id;
    }
    
    await storage.addInfluencersToGroup(targetGroupId, influencerIds);
    
    const group = await storage.getGroup(targetGroupId);
    res.json({ success: true, group });
  });

  app.post('/api/bulk/assign-to-campaign', async (req, res) => {
    const { influencerIds, campaignId, createCampaign } = req.body;
    
    let targetCampaignId = campaignId;
    
    // Create new campaign if requested
    if (createCampaign) {
      const workspaceId = createCampaign.workspaceId;
      const newCampaign = await storage.createCampaign(workspaceId, {
        name: createCampaign.name,
        client: createCampaign.client || '',
        clientId: createCampaign.clientId || null,
        status: 'active'
      });
      targetCampaignId = newCampaign.id;
    }
    
    const items = await storage.addInfluencersToCampaign(targetCampaignId, influencerIds);
    
    const campaign = await storage.getCampaign(targetCampaignId);
    res.json({ success: true, campaign, items });
  });

  // === FINANCE ===
  app.get('/api/finance/summary', async (req, res) => {
    try {
      const { workspaceId, month, status } = req.query;
      const wsId = parseInt(workspaceId as string) || 1;
      let summary = await storage.getFinanceSummary(wsId, { month: month as string, status: status as string });
      
      // CLIENT role filtering: only show items for assigned clients' campaigns
      if (req.isAuthenticated()) {
        const userId = (req.user as any).id;
        const member = await storage.getWorkspaceMember(userId, wsId);
        
        if (member?.role === 'CLIENT') {
          const assignments = await storage.getUserClientAssignments(userId, wsId);
          const assignedClientIds = new Set(assignments.map(a => a.clientId));
          
          const filteredItems = summary.items.filter(item => 
            item.campaign?.clientId && assignedClientIds.has(item.campaign.clientId)
          );
          
          summary = {
            ...summary,
            items: filteredItems,
            pendingTotal: filteredItems.filter(i => i.paymentStatus !== 'paid').reduce((sum, i) => sum + (i.offerFee || 0), 0),
            paidThisMonth: filteredItems.filter(i => i.paymentStatus === 'paid').reduce((sum, i) => sum + (i.offerFee || 0), 0),
            pendingCount: filteredItems.filter(i => i.paymentStatus !== 'paid').length,
          };
        }
      }
      
      res.json(summary);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === SETTLEMENT WORK QUEUE (정산 작업큐) ===
  app.get('/api/settlement/queue', async (req, res) => {
    try {
      const { workspaceId, clientId, campaignId, payoutStatus, settlementInfoComplete, uploadCompletedOnly } = req.query;
      const wsId = parseInt(workspaceId as string) || 1;
      
      // Check role access (CLIENT cannot access settlement)
      if (req.isAuthenticated()) {
        const userId = (req.user as any).id;
        const member = await storage.getWorkspaceMember(userId, wsId);
        if (member?.role === 'CLIENT') {
          return res.status(403).json({ message: 'CLIENT role cannot access settlement queue' });
        }
      }
      
      const filters = {
        clientId: clientId ? parseInt(clientId as string) : undefined,
        campaignId: campaignId ? parseInt(campaignId as string) : undefined,
        payoutStatus: payoutStatus as string | undefined,
        settlementInfoComplete: settlementInfoComplete !== undefined ? settlementInfoComplete === 'true' : undefined,
        uploadCompletedOnly: uploadCompletedOnly !== undefined ? uploadCompletedOnly === 'true' : true
      };
      
      const result = await storage.getSettlementWorkQueue(wsId, filters);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Update payout info for a line item (MEMBER or OWNER only)
  app.patch('/api/settlement/items/:id/payout', async (req, res) => {
    try {
      const itemId = parseInt(req.params.id);
      const data = req.body;
      const { workspaceId } = data;
      
      // Check role access (CLIENT cannot update payout)
      if (req.isAuthenticated()) {
        const userId = (req.user as any).id;
        const member = await storage.getWorkspaceMember(userId, workspaceId);
        if (member?.role === 'CLIENT') {
          return res.status(403).json({ message: 'CLIENT role cannot update payout info' });
        }
      }
      
      // Parse dates if needed
      if (data.invoiceIssuedAt) data.invoiceIssuedAt = new Date(data.invoiceIssuedAt);
      if (data.payoutDueAt) data.payoutDueAt = new Date(data.payoutDueAt);
      if (data.paidAt) data.paidAt = new Date(data.paidAt);
      
      const updated = await storage.updateLineItemPayout(itemId, data);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Mark payment complete (OWNER only)
  app.post('/api/settlement/items/:id/mark-paid', async (req, res) => {
    try {
      const itemId = parseInt(req.params.id);
      const { workspaceId } = req.body;
      
      // Check role access (OWNER only)
      if (req.isAuthenticated()) {
        const userId = (req.user as any).id;
        const member = await storage.getWorkspaceMember(userId, workspaceId);
        if (member?.role !== 'WORKSPACE_OWNER') {
          return res.status(403).json({ message: 'Only OWNER can mark items as paid' });
        }
      }
      
      const updated = await storage.updateLineItemPayout(itemId, {
        payoutStatus: '입금완료',
        paidAt: new Date()
      });
      
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Mark upload completed (triggers payout status)
  app.post('/api/settlement/items/:id/upload-completed', async (req, res) => {
    try {
      const itemId = parseInt(req.params.id);
      const { completed } = req.body;
      const userId = req.isAuthenticated() ? (req.user as any).id : 1;
      
      const updated = await storage.markUploadCompleted(itemId, userId, completed !== false);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === TODAY'S TASKS ===
  app.get('/api/overview/tasks', async (req, res) => {
    const { workspaceId } = req.query;
    const wsId = parseInt(workspaceId as string) || 1;
    
    // Get all active campaigns with line items
    const campaignsList = await storage.getCampaigns(wsId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tasks: any[] = [];
    
    for (const campaignBasic of campaignsList) {
      if (campaignBasic.status !== 'active') continue;
      const campaign = await storage.getCampaign(campaignBasic.id);
      if (!campaign) continue;
      
      for (const item of campaign.items || []) {
        const influencer = item.influencer;
        
        // Calculate draft deadline tasks
        if (item.draftDueAt && !item.draftUrl && !item.draftFileId) {
          const draftDue = new Date(item.draftDueAt);
          draftDue.setHours(0, 0, 0, 0);
          const diffDays = Math.floor((draftDue.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          
          if (diffDays <= 3) {
            tasks.push({
              id: `draft-${item.id}`,
              type: 'draft',
              title: '초안 수신 확인',
              campaignId: campaign.id,
              campaignName: campaign.name,
              lineItemId: item.id,
              influencerId: item.influencerId,
              influencerName: influencer?.name || `인플루언서 #${item.influencerId}`,
              stage: item.stage,
              dueIn: diffDays,
              priority: diffDays < 0 ? 0 : diffDays === 0 ? 1 : 2,
              link: `/campaigns/${campaign.id}?tab=operations`,
            });
          }
        }
        
        // Calculate upload deadline tasks
        if (item.uploadDueAt && (!item.finalUrl || !item.isPublishedConfirmed)) {
          const uploadDue = new Date(item.uploadDueAt);
          uploadDue.setHours(0, 0, 0, 0);
          const diffDays = Math.floor((uploadDue.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          
          if (diffDays <= 3) {
            tasks.push({
              id: `upload-${item.id}`,
              type: 'upload',
              title: item.finalUrl && !item.isPublishedConfirmed ? '업로드 확인' : '업로드 예정',
              campaignId: campaign.id,
              campaignName: campaign.name,
              lineItemId: item.id,
              influencerId: item.influencerId,
              influencerName: influencer?.name || `인플루언서 #${item.influencerId}`,
              stage: item.stage,
              dueIn: diffDays,
              priority: diffDays < 0 ? 0 : diffDays === 0 ? 1 : 2,
              link: `/campaigns/${campaign.id}?tab=operations`,
            });
          }
        }
        
        // Feedback pending tasks
        if (item.reviewStatus === '검토중' || item.reviewStatus === '피드백전달') {
          tasks.push({
            id: `feedback-${item.id}`,
            type: 'feedback',
            title: item.reviewStatus === '검토중' ? '초안 검토 필요' : '피드백 전달 대기',
            campaignId: campaign.id,
            campaignName: campaign.name,
            lineItemId: item.id,
            influencerId: item.influencerId,
            influencerName: influencer?.name || `인플루언서 #${item.influencerId}`,
            stage: item.stage,
            dueIn: 0,
            priority: 1,
            link: `/campaigns/${campaign.id}?tab=operations`,
          });
        }
        
        // No response follow-up tasks
        if (item.commStatus === '미응답') {
          tasks.push({
            id: `followup-${item.id}`,
            type: 'followup',
            title: '미응답 인플루언서 팔로업',
            campaignId: campaign.id,
            campaignName: campaign.name,
            lineItemId: item.id,
            influencerId: item.influencerId,
            influencerName: influencer?.name || `인플루언서 #${item.influencerId}`,
            stage: item.stage,
            dueIn: 0,
            priority: 2,
            link: `/campaigns/${campaign.id}?tab=communication`,
          });
        }
        
        // Payment pending tasks
        if (item.paymentStatus === 'pending' && item.offerFee && item.offerFee > 0 && item.stage === '완료') {
          tasks.push({
            id: `payment-${item.id}`,
            type: 'payment',
            title: '정산 정보 수집',
            campaignId: campaign.id,
            campaignName: campaign.name,
            lineItemId: item.id,
            influencerId: item.influencerId,
            influencerName: influencer?.name || `인플루언서 #${item.influencerId}`,
            stage: item.stage,
            dueIn: 3,
            priority: 3,
            link: `/finance`,
          });
        }
      }
    }
    
    // Sort by priority (lower is higher priority)
    tasks.sort((a, b) => a.priority - b.priority);
    
    res.json(tasks);
  });

  // === EMAIL ===
  app.get('/api/email/gmail/callback', async (req, res) => {
    const code = req.query.code;
    res.send("Gmail Connected! You can close this window.");
  });

  // Register Gmail account (using Replit Google Mail connector)
  // Zod schemas for email registration
  const gmailRegisterSchema = z.object({
    workspaceId: z.number()
  });
  
  const imapRegisterSchema = z.object({
    workspaceId: z.number(),
    email: z.string().email(),
    password: z.string().min(1),
    imapServer: z.string().min(1),
    imapPort: z.string().default("993"),
    smtpServer: z.string().min(1),
    smtpPort: z.string().default("587")
  });
  
  // Encryption key - use ENCRYPTION_KEY if available, otherwise fall back to SESSION_SECRET
  const getEncryptionKey = (): Buffer => {
    const key = process.env.ENCRYPTION_KEY || process.env.SESSION_SECRET || 'default-secret-key-32chars-long!!';
    return Buffer.from(key.slice(0, 32).padEnd(32, '0'));
  };
  
  // Simple encryption for IMAP password using crypto
  const encryptPassword = (password: string): string => {
    const keyBuffer = getEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, iv);
    let encrypted = cipher.update(password, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  };

  app.post('/api/email/gmail/register', async (req, res) => {
    try {
      // Auth check
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const parsed = gmailRegisterSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.errors });
      }
      const { workspaceId } = parsed.data;
      
      // Check workspace access
      const memberships = await storage.getWorkspaceMemberships((req.user as any).id);
      if (!memberships.some(m => m.workspaceId === workspaceId)) {
        return res.status(403).json({ message: "Access denied to this workspace" });
      }
      
      const { getGmailProfile } = await import('./gmail');
      const profile = await getGmailProfile();
      
      if (!profile.emailAddress) {
        return res.status(400).json({ message: "Gmail not connected. Please connect Gmail first via Replit." });
      }
      
      const userId = (req.user as any).id;
      
      // Check if account already exists for this user
      const existingAccounts = await storage.getEmailAccounts(userId, workspaceId);
      const existing = existingAccounts.find(a => a.email === profile.emailAddress);
      if (existing) {
        return res.json({ account: existing, message: "Account already registered" });
      }
      
      // Create new email account for this user
      const account = await storage.createEmailAccount(userId, workspaceId, {
        email: profile.emailAddress,
        provider: 'gmail',
        accessToken: null,
        refreshToken: null,
      });
      
      res.status(201).json({ account, message: "Gmail account registered successfully" });
    } catch (err: any) {
      console.error('Gmail register error:', err);
      res.status(500).json({ message: err.message || "Failed to register Gmail account" });
    }
  });

  // Register IMAP/SMTP email account
  app.post('/api/email/imap/register', async (req, res) => {
    try {
      // Auth check
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const parsed = imapRegisterSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.errors });
      }
      const { workspaceId, email, password, imapServer, imapPort, smtpServer, smtpPort } = parsed.data;
      
      // Check workspace access
      const userId = (req.user as any).id;
      const memberships = await storage.getWorkspaceMemberships(userId);
      console.log('IMAP register debug:', { userId, workspaceId, memberships });
      
      const hasAccess = memberships.some(m => m.workspaceId === workspaceId);
      if (!hasAccess) {
        console.log('Access denied - membership check failed:', { memberships, requestedWorkspaceId: workspaceId });
        return res.status(403).json({ message: "Access denied to this workspace" });
      }
      
      // Check if account already exists for this user
      const existingAccounts = await storage.getEmailAccounts(userId, workspaceId);
      const existing = existingAccounts.find(a => a.email === email);
      if (existing) {
        return res.status(400).json({ message: "Account already registered" });
      }
      
      const encryptedPassword = encryptPassword(password);
      const account = await storage.createEmailAccount(userId, workspaceId, {
        email,
        provider: 'imap',
        imapHost: imapServer,
        imapPort: parseInt(imapPort) || 993,
        smtpHost: smtpServer,
        smtpPort: parseInt(smtpPort) || 587,
        imapPassword: encryptedPassword,
      });
      
      res.status(201).json({ account, message: "IMAP account registered successfully" });
    } catch (err: any) {
      console.error('IMAP register error:', err);
      res.status(500).json({ message: err.message || "Failed to register IMAP account" });
    }
  });

  app.get(api.email.listAccounts.path, async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const userId = (req.user as any).id;
    const workspaceId = parseInt(req.params.workspaceId);
    const accounts = await storage.getEmailAccounts(userId, workspaceId);
    res.json(accounts);
  });

  // Delete email account
  app.delete('/api/email/accounts/:id', async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const accountId = parseInt(req.params.id);
      const userId = (req.user as any).id;
      
      // Get account to verify workspace access
      const account = await storage.getEmailAccountById(accountId);
      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }
      
      // Check workspace membership
      const memberships = await storage.getWorkspaceMemberships(userId);
      const hasAccess = memberships.some(m => m.workspaceId === account.workspaceId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to this workspace" });
      }
      
      await storage.deleteEmailAccount(accountId);
      res.json({ message: "Account deleted successfully" });
    } catch (err: any) {
      console.error('Delete email account error:', err);
      res.status(500).json({ message: err.message || "Failed to delete account" });
    }
  });

  // Test IMAP connection
  app.post('/api/email/imap/test', async (req, res) => {
    try {
      const { email, password, imapServer, imapPort } = req.body;
      
      const { testImapConnection } = await import('./imap');
      
      const result = await testImapConnection({
        user: email,
        password: password,
        host: imapServer,
        port: parseInt(imapPort) || 993,
        tls: true,
      });
      
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post(api.email.sync.path, async (req, res) => {
    const accountId = parseInt(req.params.id);
    
    try {
      // Get account info by ID directly
      const account = await storage.getEmailAccountById(accountId);
      
      if (!account) {
        return res.status(404).json({ message: "계정을 찾을 수 없습니다" });
      }
      
      // Check if it's an IMAP account
      if (account.provider === 'imap') {
        const { fetchEmails, decryptPassword } = await import('./imap');
        
        const { imapHost, imapPort: imapPortNum, imapPassword: encPwd } = getImapSmtpSettings(account);
        if (!imapHost || !encPwd) {
          return res.status(400).json({ message: "IMAP 설정이 완료되지 않았습니다." });
        }
        const password = decryptPassword(encPwd);
        
        const imapConfig = {
          user: account.email,
          password: password,
          host: imapHost,
          port: imapPortNum,
          tls: true,
        };
        
        console.log('Connecting to IMAP server:', imapHost, 'for', account.email);
        
        const emails = await fetchEmails(imapConfig, 'INBOX', 20);
        console.log(`Fetched ${emails.length} emails from IMAP`);
        
        // Get existing threads to avoid duplicates
        const existingThreads = await storage.getEmailThreads(accountId);
        const existingMessageIds = new Set(existingThreads.map(t => t.threadId));
        
        let syncedCount = 0;
        for (const email of emails) {
          const threadId = email.messageId || `imap-${Date.now()}-${syncedCount}`;
          
          if (!existingMessageIds.has(threadId)) {
            await storage.createEmailThread({
              accountId,
              threadId,
              subject: email.subject,
              snippet: email.snippet,
              lastMessageDate: email.date,
            });
            syncedCount++;
          }
        }
        
        res.json({ syncedCount, message: `${syncedCount}개의 새 이메일을 동기화했습니다` });
      } else {
        // Gmail or other provider - use existing mock behavior
        const existingThreads = await storage.getEmailThreads(accountId);
        if (existingThreads.length === 0) {
          await storage.createEmailThread({
            accountId,
            threadId: `demo-thread-${accountId}`,
            subject: "Re: Collaboration Proposal",
            snippet: "Sounds good, let's proceed.",
            lastMessageDate: new Date(),
          });
          res.json({ syncedCount: 1 });
        } else {
          res.json({ syncedCount: 0, message: "이미 최신 상태입니다" });
        }
      }
    } catch (err: any) {
      console.error('Email sync error:', err);
      res.status(500).json({ 
        message: `이메일 동기화 실패: ${err.message}`,
        error: err.message 
      });
    }
  });

  app.get(api.email.threads.path, async (req, res) => {
    const threads = await storage.getEmailThreads(parseInt(req.params.accountId));
    res.json(threads);
  });

  app.post(api.email.sendBulk.path, async (req, res) => {
    res.json({ sent: req.body.to.length, failed: 0 });
  });

  // === GMAIL STATUS ===
  app.get('/api/email/gmail/status', async (req, res) => {
    try {
      const { getGmailProfile } = await import('./gmail');
      const profile = await getGmailProfile();
      res.json({ connected: true, email: profile.emailAddress });
    } catch (err) {
      res.json({ connected: false, email: null });
    }
  });

  // === EMAIL ACCOUNTS BY USER (per-user email accounts) ===
  app.get('/api/workspaces/:workspaceId/email-accounts', async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const workspaceId = parseInt(req.params.workspaceId);
      const userId = (req.user as any).id;
      
      const memberships = await storage.getWorkspaceMemberships(userId);
      if (!memberships.some(m => m.workspaceId === workspaceId)) {
        return res.status(403).json({ message: "이 워크스페이스에 대한 접근 권한이 없습니다" });
      }
      
      // Get only the current user's email accounts
      const accounts = await storage.getEmailAccounts(userId, workspaceId);
      const safeAccounts = accounts.map(acc => ({
        id: acc.id,
        email: acc.email,
        provider: acc.provider,
        imapHost: acc.imapHost,
        smtpHost: acc.smtpHost,
        signature: acc.signature,
        useSignature: acc.useSignature ?? true,
      }));
      res.json(safeAccounts);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === EMAIL ACCOUNT SIGNATURE UPDATE ===
  const emailSignatureSchema = z.object({
    signature: z.string().nullable().optional(),
    useSignature: z.boolean().optional(),
  });

  app.patch('/api/email/accounts/:id/signature', async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const accountId = parseInt(req.params.id);
      const userId = (req.user as any).id;
      
      const parsed = emailSignatureSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.errors });
      }
      
      const account = await storage.getEmailAccountById(accountId);
      if (!account) {
        return res.status(404).json({ message: "이메일 계정을 찾을 수 없습니다" });
      }
      
      // Verify the account belongs to the current user
      if (account.userId !== userId) {
        return res.status(403).json({ message: "이 이메일 계정에 대한 권한이 없습니다" });
      }
      
      const updated = await storage.updateEmailAccountSignature(accountId, parsed.data);
      res.json({ 
        id: updated.id,
        signature: updated.signature,
        useSignature: updated.useSignature 
      });
    } catch (err: any) {
      console.error('Update email signature error:', err);
      res.status(500).json({ message: err.message });
    }
  });

  // === EMAIL THREAD SEARCH ===
  const threadSearchSchema = z.object({
    accountId: z.number(),
    searchMode: z.enum(['email', 'subject', 'messageId']),
    query: z.string().min(1),
  });

  app.post('/api/email/search-threads', async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const parsed = threadSearchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.errors });
      }
      
      const { accountId, searchMode, query } = parsed.data;
      const account = await storage.getEmailAccountById(accountId);
      
      if (!account) {
        return res.status(404).json({ message: "이메일 계정을 찾을 수 없습니다" });
      }
      
      if (account.provider === 'imap') {
        const { searchThreads, decryptPassword } = await import('./imap');
        
        const { imapHost, imapPort: imapPortNum, imapPassword: encPwd } = getImapSmtpSettings(account);
        if (!imapHost || !encPwd) {
          return res.status(400).json({ message: "IMAP 설정이 완료되지 않았습니다." });
        }
        const password = decryptPassword(encPwd);
        
        const imapConfig = {
          user: account.email,
          password: password,
          host: imapHost,
          port: imapPortNum,
          tls: true,
        };
        
        const threads = await searchThreads(imapConfig, searchMode, query, 20);
        return res.json({ threads, accountEmail: account.email });
      } else if (account.provider === 'gmail') {
        return res.status(501).json({ message: "Gmail 검색은 아직 지원되지 않습니다. IMAP 계정을 사용해 주세요." });
      }
      
      res.status(400).json({ message: "지원되지 않는 이메일 제공자입니다" });
    } catch (err: any) {
      console.error('Thread search error:', err);
      res.status(500).json({ message: err.message || "스레드 검색 중 오류가 발생했습니다" });
    }
  });

  // === ATTACH THREAD TO CONVERSATION ===
  const attachThreadSchema = z.object({
    lineItemId: z.number(),
    accountId: z.number(),
    threadId: z.string(),
    threadSubject: z.string(),
  });

  app.post('/api/conversations/attach-thread', async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const parsed = attachThreadSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.errors });
      }
      
      const { lineItemId, accountId, threadId, threadSubject } = parsed.data;
      const userId = (req.user as any).id;
      
      const account = await storage.getEmailAccountById(accountId);
      if (!account) {
        return res.status(404).json({ message: "이메일 계정을 찾을 수 없습니다" });
      }
      
      const memberships = await storage.getWorkspaceMemberships(userId);
      if (!memberships.some(m => m.workspaceId === account.workspaceId)) {
        return res.status(403).json({ message: "이 이메일 계정에 대한 접근 권한이 없습니다" });
      }
      
      let conversation = await storage.getConversationByLineItem(lineItemId);
      
      if (conversation) {
        conversation = await storage.updateConversation(conversation.id, {
          emailAccountId: accountId,
          gmailThreadId: threadId,
          subjectPrefix: threadSubject,
        });
      } else {
        conversation = await storage.createConversation({
          campaignLineItemId: lineItemId,
          emailAccountId: accountId,
          gmailThreadId: threadId,
          subjectPrefix: threadSubject,
          status: 'active',
        });
      }
      
      if (account.provider === 'imap') {
        const { fetchThreadMessages, decryptPassword } = await import('./imap');
        
        const { imapHost, imapPort: imapPortNum, imapPassword: encPwd } = getImapSmtpSettings(account);
        if (!imapHost || !encPwd) {
          return res.status(400).json({ message: "IMAP 설정이 완료되지 않았습니다." });
        }
        const password = decryptPassword(encPwd);
        
        const imapConfig = {
          user: account.email,
          password: password,
          host: imapHost,
          port: imapPortNum,
          tls: true,
        };
        
        try {
          const messages = await fetchThreadMessages(imapConfig, threadSubject);
          
          for (const msg of messages) {
            const direction = msg.from === account.email ? 'outbound' : 'inbound';
            await storage.createConversationMessage({
              conversationId: conversation.id,
              direction,
              senderEmail: msg.from || null,
              senderName: null,
              snippet: `[${msg.subject}] ${msg.snippet}`,
              bodyHtml: msg.body,
              bodyText: msg.snippet,
              sendStatus: 'sent',
              sentAt: direction === 'outbound' ? msg.date : null,
              receivedAt: direction === 'inbound' ? msg.date : null,
              gmailMessageId: msg.messageId,
            });
          }
          
          if (messages.length > 0) {
            const lastMsg = messages[messages.length - 1];
            await storage.updateConversation(conversation.id, {
              lastMessageAt: lastMsg.date,
            });
          }
        } catch (fetchErr: any) {
          console.error('Error fetching thread messages:', fetchErr);
        }
      }
      
      const updatedConv = await storage.getConversation(conversation.id);
      res.json({ success: true, conversation: updatedConv });
    } catch (err: any) {
      console.error('Attach thread error:', err);
      res.status(500).json({ message: err.message || "스레드 연결 중 오류가 발생했습니다" });
    }
  });

  app.get('/api/campaigns/:campaignId/line-items/:lineItemId/has-thread', async (req, res) => {
    try {
      const lineItemId = parseInt(req.params.lineItemId);
      const conv = await storage.getConversationByLineItem(lineItemId);
      if (conv) {
        const messages = await storage.getConversationMessages(conv.id);
        return res.json({ hasThread: messages.length > 0 });
      }
      return res.json({ hasThread: false });
    } catch (err) {
      console.error('Check thread error:', err);
      res.json({ hasThread: false });
    }
  });

  // === CONVERSATIONS (Messenger-style email threads) ===
  app.get('/api/conversations', async (req, res) => {
    const campaignId = parseInt(req.query.campaignId as string);
    if (!campaignId) return res.json([]);
    const convs = await storage.getConversationsByCampaign(campaignId);
    res.json(convs);
  });

  app.get('/api/conversations/:id', async (req, res) => {
    const conv = await storage.getConversation(parseInt(req.params.id));
    if (!conv) return res.status(404).json({ message: "Not found" });
    res.json(conv);
  });

  app.post('/api/conversations', async (req, res) => {
    const conv = await storage.createConversation(req.body);
    res.status(201).json(conv);
  });

  app.patch('/api/conversations/:id', async (req, res) => {
    try {
      const data = { ...req.body };
      if (data.lastReadAt && typeof data.lastReadAt === 'string') {
        const parsed = new Date(data.lastReadAt);
        if (isNaN(parsed.getTime())) return res.status(400).json({ message: "Invalid lastReadAt date" });
        data.lastReadAt = parsed;
      }
      if (data.lastMessageAt && typeof data.lastMessageAt === 'string') {
        const parsed = new Date(data.lastMessageAt);
        if (isNaN(parsed.getTime())) return res.status(400).json({ message: "Invalid lastMessageAt date" });
        data.lastMessageAt = parsed;
      }
      const conv = await storage.updateConversation(parseInt(req.params.id), data);
      res.json(conv);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Send message in conversation (with Gmail integration)
  app.post('/api/conversations/:id/messages', async (req, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      const conv = await storage.getConversation(conversationId);
      if (!conv) return res.status(404).json({ message: "Conversation not found" });
      
      const { body, subject, cc } = req.body;
      const influencer = conv.lineItem.influencer;
      const toEmail = influencer?.email;
      
      if (!toEmail) {
        return res.status(400).json({ message: "인플루언서 이메일이 없습니다" });
      }
      
      const userId = (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ message: "로그인이 필요합니다" });
      }

      const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, conv.lineItem.campaignId));
      if (!campaign) {
        return res.status(404).json({ message: "캠페인을 찾을 수 없습니다" });
      }

      const userAccounts = await storage.getEmailAccounts(userId, campaign.workspaceId);
      if (!userAccounts || userAccounts.length === 0) {
        return res.status(400).json({ message: "등록된 이메일 계정이 없습니다. 설정에서 이메일 계정을 먼저 등록해주세요." });
      }
      const account = (conv.emailAccountId && userAccounts.find(a => a.id === conv.emailAccountId)) || userAccounts[0];

      const { convertToGmailCompatibleHtml } = await import('./smtp');
      const isPlainText = !/<[a-z][\s\S]*>/i.test(body);
      const htmlBody = isPlainText 
        ? body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
        : body;
      let finalBody = convertToGmailCompatibleHtml(htmlBody);
      if (account.useSignature && account.signature) {
        finalBody += `<br><br>--<br>${account.signature}`;
      }
      
      const userCcEmails: string[] = cc 
        ? (Array.isArray(cc) ? cc : cc.split(',').map((e: string) => e.trim()).filter(Boolean))
        : [];
      
      const existingMsgs = await storage.getConversationMessages(conversationId);
      const isReply = existingMsgs.length > 0;
      
      const previousCcSet = new Set<string>();
      for (const msg of existingMsgs) {
        if (msg.ccEmails && Array.isArray(msg.ccEmails)) {
          for (const email of msg.ccEmails) {
            if (email) previousCcSet.add(email.toLowerCase().trim());
          }
        }
      }
      
      const excludeEmails = new Set<string>();
      excludeEmails.add(account.email.toLowerCase().trim());
      excludeEmails.add(toEmail.toLowerCase().trim());
      
      const mergedCcSet = new Set<string>();
      for (const e of previousCcSet) {
        if (!excludeEmails.has(e)) mergedCcSet.add(e);
      }
      for (const e of userCcEmails) {
        if (!excludeEmails.has(e.toLowerCase().trim())) mergedCcSet.add(e.toLowerCase().trim());
      }
      const ccEmails: string[] = Array.from(mergedCcSet);
      
      let gmailMessageId: string | undefined;
      let gmailThreadId: string | undefined;
      let sendStatus = 'sent';
      
      let finalSubject: string;
      if (isReply && conv.subjectPrefix) {
        const originalSubject = conv.subjectPrefix;
        finalSubject = originalSubject.startsWith('Re:') ? originalSubject : `Re: ${originalSubject}`;
      } else if (conv.subjectPrefix) {
        finalSubject = subject ? `${conv.subjectPrefix} ${subject}`.trim() : conv.subjectPrefix;
      } else {
        finalSubject = subject || '';
      }
      
      try {
        if (account.provider === 'imap') {
          const { createSmtpTransporter, sendEmail: sendSmtpEmail } = await import('./smtp');
          const { decryptPassword } = await import('./imap');
          
          const replySmtp = getImapSmtpSettings(account);
          if (!replySmtp.smtpHost || !replySmtp.imapPassword) {
            return res.status(400).json({ message: "SMTP 설정이 완료되지 않았습니다. 이메일 계정 설정을 확인해주세요." });
          }
          
          const password = decryptPassword(replySmtp.imapPassword);
          const transporter = createSmtpTransporter({
            host: replySmtp.smtpHost,
            port: replySmtp.smtpPort,
            secure: replySmtp.smtpPort === 465,
            user: account.email,
            password,
          });
          
          const lastInbound = existingMsgs.filter(m => m.direction === 'inbound').pop();
          const lastMessageId = lastInbound?.gmailMessageId || existingMsgs[existingMsgs.length - 1]?.gmailMessageId;
          
          const smtpMailOptions: any = {
            from: account.email,
            to: toEmail,
            cc: ccEmails.length > 0 ? ccEmails : undefined,
            subject: finalSubject,
            html: finalBody,
          };
          
          if (lastMessageId) {
            smtpMailOptions.inReplyTo = lastMessageId;
            const allRefs = existingMsgs
              .map(m => m.gmailMessageId)
              .filter((id): id is string => !!id && id.startsWith('<'));
            smtpMailOptions.references = allRefs;
          }

          const result = await sendSmtpEmail(transporter, smtpMailOptions);
          
          if (result.success) {
            gmailMessageId = result.messageId;
          } else {
            console.error('SMTP send failed:', result.error);
            sendStatus = 'failed';
          }
        } else {
          const { sendEmail: sendGmailEmail } = await import('./gmail');
          let threadIdForReply = conv.gmailThreadId;
          if (!threadIdForReply && isReply) {
            const msgWithThread = existingMsgs.find(m => m.gmailThreadId);
            threadIdForReply = msgWithThread?.gmailThreadId || null;
          }
          
          let gmailReplyHeaders: { inReplyTo?: string; references?: string[] } | undefined;
          if (isReply) {
            const lastInbound = existingMsgs.filter(m => m.direction === 'inbound').pop();
            const lastMsgId = lastInbound?.gmailMessageId || existingMsgs[existingMsgs.length - 1]?.gmailMessageId;
            if (lastMsgId) {
              gmailReplyHeaders = {
                inReplyTo: lastMsgId,
                references: existingMsgs
                  .map(m => m.gmailMessageId)
                  .filter((id): id is string => !!id && id.startsWith('<')),
              };
            }
          }
          const result = await sendGmailEmail(toEmail, finalSubject, finalBody, threadIdForReply || undefined, ccEmails, undefined, gmailReplyHeaders);
          gmailMessageId = result.id || undefined;
          gmailThreadId = result.threadId || undefined;
          
          if (!conv.gmailThreadId && gmailThreadId) {
            await storage.updateConversation(conversationId, { gmailThreadId });
          }
        }
      } catch (sendErr) {
        console.error('Email send failed:', sendErr);
        sendStatus = 'failed';
      }
      
      const { generateSnippet } = await import('./gmail');
      const snippet = generateSnippet(finalBody);
      
      const message = await storage.createConversationMessage({
        conversationId,
        direction: 'outbound',
        senderEmail: account.email,
        senderName: null,
        recipientEmail: toEmail,
        ccEmails: ccEmails.length > 0 ? ccEmails : null,
        snippet,
        bodyHtml: finalBody,
        bodyText: finalBody.replace(/<[^>]*>/g, ''),
        gmailMessageId,
        gmailThreadId,
        sendStatus,
        sentAt: new Date()
      });
      
      await storage.updateConversation(conversationId, { lastMessageAt: new Date() });

      if (influencer) {
        await storage.createTimelineEvent({
          workspaceId: influencer.workspaceId,
          influencerId: influencer.id,
          lineItemId: conv.campaignLineItemId,
          eventType: 'email_sent',
          title: '이메일 발송',
          description: subject || '(제목 없음)',
          metadata: { conversationId, messageId: message.id, sendStatus }
        });
      }
      
      res.status(201).json(message);
    } catch (err) {
      console.error('Send message error:', err);
      res.status(500).json({ message: "메시지 전송 실패" });
    }
  });

  // Sync conversation (fetch new emails via IMAP Message-ID based threading)
  app.post('/api/conversations/:id/sync', async (req, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      const fullSync = req.body?.fullSync === true;
      const conv = await storage.getConversation(conversationId);
      if (!conv) return res.status(404).json({ message: "Conversation not found" });

      const existingMessages = await storage.getConversationMessages(conversationId);

      const knownMessageIds = existingMessages
        .map(m => m.gmailMessageId)
        .filter((id): id is string => !!id && id.startsWith('<'));

      if (knownMessageIds.length === 0 && !fullSync) {
        return res.json({ synced: 0, message: "동기화할 메시지 ID가 없습니다" });
      }

      const emailAccountId = conv.emailAccountId || existingMessages.find(m => m.senderEmail)?.id;
      let emailAccount: any = null;

      if (conv.emailAccountId) {
        emailAccount = await storage.getEmailAccountById(conv.emailAccountId);
      }
      if (!emailAccount) {
        const senderEmail = existingMessages.find(m => m.direction === 'outbound')?.senderEmail;
        if (senderEmail) {
          const workspaceId = conv.lineItem.influencer?.workspaceId || 0;
          const allAccounts = await db.select().from(emailAccounts).where(eq(emailAccounts.workspaceId, workspaceId));
          emailAccount = allAccounts.find((a: any) => a.email === senderEmail);
        }
      }

      if (!emailAccount) {
        return res.json({ synced: 0, message: "이메일 계정을 찾을 수 없습니다" });
      }

      const { imapHost, imapPort: imapPortNum, imapPassword: encPwd } = getImapSmtpSettings(emailAccount);
      if (!imapHost || !encPwd) {
        return res.json({ synced: 0, message: "IMAP 설정이 완료되지 않았습니다" });
      }

      const { decryptPassword } = await import('./imap');
      const password = decryptPassword(encPwd);
      const imapConfig = {
        user: emailAccount.email,
        password,
        host: imapHost,
        port: imapPortNum,
        tls: true,
      };

      const imap = await import('./imap');
      let threadMessages: any[] = [];

      if (knownMessageIds.length > 0) {
        console.log(`[Sync] Searching IMAP for thread with ${knownMessageIds.length} message IDs for conversation ${conversationId}`);
        threadMessages = await imap.fetchThreadByMessageIds(imapConfig, knownMessageIds);
      }

      if (fullSync && threadMessages.length === 0 && influencer?.email) {
        console.log(`[FullSync] Searching IMAP by email address: ${influencer.email} for conversation ${conversationId}`);
        try {
          const searchResults = await imap.searchThreads(imapConfig, 'email', influencer.email, 50);
          if (searchResults && searchResults.length > 0) {
            for (const thread of searchResults) {
              if (thread.messageId) {
                const fetched = await imap.fetchThreadByMessageIds(imapConfig, [thread.messageId]);
                threadMessages.push(...fetched);
              }
            }
          }
        } catch (searchErr) {
          console.warn(`[FullSync] Search by email failed:`, searchErr);
        }
      }
      console.log(`[Sync] Found ${threadMessages.length} messages in IMAP thread`);

      if (threadMessages.length === 0) {
        return res.json({ synced: 0 });
      }

      const existingMsgIds = new Set(existingMessages.map(m => m.gmailMessageId).filter(Boolean));
      const existingFingerprints = new Set(
        existingMessages.map(m => {
          const sender = (m.senderEmail || '').toLowerCase().trim();
          const date = m.receivedAt ? new Date(m.receivedAt).getTime() : (m.sentAt ? new Date(m.sentAt).getTime() : 0);
          const snip = (m.snippet || '').replace(/\s+/g, ' ').trim().slice(0, 80);
          return `${sender}|${date}|${snip}`;
        }).filter(f => f !== '|0|')
      );
      const influencer = conv.lineItem.influencer;
      let syncedCount = 0;

      for (const msg of threadMessages) {
        if (msg.messageId && existingMsgIds.has(msg.messageId)) continue;

        const msgSender = (msg.from || '').toLowerCase().trim();
        const msgDate = msg.date ? msg.date.getTime() : 0;
        const msgSnip = (msg.snippet || '').replace(/\s+/g, ' ').trim().slice(0, 80);
        const fingerprint = `${msgSender}|${msgDate}|${msgSnip}`;
        if (existingFingerprints.has(fingerprint)) continue;

        const isInbound = influencer?.email
          ? msg.from.toLowerCase().includes(influencer.email.toLowerCase())
          : false;
        const isOutbound = emailAccount.email
          ? msg.from.toLowerCase().includes(emailAccount.email.toLowerCase())
          : false;

        if (!isInbound && !isOutbound) continue;

        const ccEmails = msg.cc
          ? msg.cc.split(',').map((e: string) => e.trim()).filter(Boolean)
          : null;

        await storage.createConversationMessage({
          conversationId,
          direction: isInbound ? 'inbound' : 'outbound',
          senderEmail: msg.from,
          senderName: null,
          recipientEmail: msg.to || null,
          ccEmails: ccEmails && ccEmails.length > 0 ? ccEmails : null,
          snippet: msg.snippet,
          bodyHtml: msg.bodyHtml,
          bodyText: msg.bodyText,
          gmailMessageId: msg.messageId || null,
          gmailThreadId: null,
          sendStatus: 'sent',
          receivedAt: msg.date
        });

        syncedCount++;
        existingMsgIds.add(msg.messageId);
        existingFingerprints.add(fingerprint);

        if (isInbound && influencer) {
          await storage.createTimelineEvent({
            workspaceId: influencer.workspaceId,
            influencerId: influencer.id,
            lineItemId: conv.campaignLineItemId,
            eventType: 'email_received',
            title: '이메일 수신',
            description: msg.subject,
            metadata: { conversationId, messageId: msg.messageId }
          });
        }
      }

      if (syncedCount > 0) {
        const maxDate = threadMessages.reduce((max, m) => {
          const d = m.date ? new Date(m.date) : null;
          return d && (!max || d > max) ? d : max;
        }, null as Date | null);
        const updateData: any = {};
        if (maxDate) {
          const currentConv = await storage.getConversation(conversationId);
          if (!currentConv?.lastMessageAt || maxDate > new Date(currentConv.lastMessageAt)) {
            updateData.lastMessageAt = maxDate;
          }
        }
        const hasInbound = threadMessages.some(m =>
          influencer?.email && m.from.toLowerCase().includes(influencer.email.toLowerCase())
          && !existingMessages.some(em => em.gmailMessageId === m.messageId)
        );
        if (hasInbound) {
          updateData.status = 'replied';
        }
        if (Object.keys(updateData).length > 0) {
          await storage.updateConversation(conversationId, updateData);
        }
      }

      res.json({ synced: syncedCount });
    } catch (err) {
      console.error('Sync error:', err);
      res.status(500).json({ message: "동기화 실패: " + (err as Error).message });
    }
  });

  app.post('/api/campaigns/:id/sync-all', async (req, res) => {
    try {
      const campaignId = parseInt(req.params.id);
      const { syncCampaignConversations } = await import('./email-sync');
      const result = await syncCampaignConversations(campaignId);
      res.json(result);
    } catch (err) {
      console.error('Campaign sync-all error:', err);
      res.status(500).json({ message: "동기화 실패: " + (err as Error).message });
    }
  });

  // === AI DRAFT REPLIES ===
  app.get('/api/conversations/:id/ai-draft', async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const conversationId = parseInt(req.params.id);
      if (isNaN(conversationId)) return res.status(400).json({ message: "Invalid conversation ID" });
      const draft = await storage.getLatestPendingDraft(conversationId);
      if (draft && draft.alternatives) {
        try {
          (draft as any).alternativesParsed = JSON.parse(draft.alternatives);
        } catch {}
      }
      res.json(draft || null);
    } catch (err) {
      console.error('Get AI draft error:', err);
      res.status(500).json({ message: "AI 초안 조회 실패" });
    }
  });

  app.post('/api/conversations/:id/ai-draft', async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const conversationId = parseInt(req.params.id);
      if (isNaN(conversationId)) return res.status(400).json({ message: "Invalid conversation ID" });

      const conv = await storage.getConversation(conversationId);
      if (!conv) return res.status(404).json({ message: "대화를 찾을 수 없습니다" });

      const lineItem = await storage.getLineItemWithDetails(conv.campaignLineItemId);
      if (!lineItem) return res.status(404).json({ message: "라인아이템을 찾을 수 없습니다" });

      const campaign = await storage.getCampaign(lineItem.campaignId);
      if (!campaign) return res.status(404).json({ message: "캠페인을 찾을 수 없습니다" });

      const allWorkspaces = await storage.getWorkspaces();
      const workspace = allWorkspaces.find(w => w.id === campaign.workspaceId);
      if (!workspace) return res.status(404).json({ message: "워크스페이스를 찾을 수 없습니다" });
      if (!workspace.aiDraftEnabled) return res.status(400).json({ message: "AI 초안 기능이 비활성화되어 있습니다" });

      const { userFeedback, requestedClassification, requestedClassificationLabel } = (req.body || {}) as { userFeedback?: string; requestedClassification?: string; requestedClassificationLabel?: string };

      const messages = await storage.getConversationMessages(conversationId);
      if (messages.length === 0) return res.status(400).json({ message: "대화 메시지가 없습니다" });

      const lastInbound = [...messages].reverse().find(m => m.direction === 'inbound');
      if (!lastInbound) return res.status(400).json({ message: "인바운드 메시지가 없습니다" });

      const { generateEmailDraft } = await import('./ai/draft-generator');
      const result = await generateEmailDraft(
        messages,
        lineItem.influencer || {},
        campaign,
        workspace,
        lineItem.offerFee,
        userFeedback,
        requestedClassification,
        requestedClassificationLabel,
      );

      const existingDraft = await storage.getLatestPendingDraft(conversationId);
      if (existingDraft) {
        await storage.updateAiDraft(existingDraft.id, { status: 'dismissed' });
      }

      const draft = await storage.createAiDraft({
        conversationId,
        triggerMessageId: lastInbound.id,
        draft: result.draft,
        classification: result.classification,
        classificationLabel: result.classificationLabel,
        alternatives: result.alternatives ? JSON.stringify(result.alternatives) : null,
        status: 'pending',
      });

      const response: any = { ...draft };
      if (draft.alternatives) {
        try { response.alternativesParsed = JSON.parse(draft.alternatives); } catch {}
      }
      res.json(response);
    } catch (err) {
      console.error('Generate AI draft error:', err);
      res.status(500).json({ message: "AI 초안 생성 실패: " + (err as Error).message });
    }
  });

  app.patch('/api/ai-drafts/:id', async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const draftId = parseInt(req.params.id);
      if (isNaN(draftId)) return res.status(400).json({ message: "Invalid draft ID" });
      const { status } = req.body as { status: string };
      if (!['used', 'dismissed'].includes(status)) {
        return res.status(400).json({ message: "유효하지 않은 상태입니다" });
      }
      const updated = await storage.updateAiDraft(draftId, { status });
      res.json(updated);
    } catch (err) {
      console.error('Update AI draft error:', err);
      res.status(500).json({ message: "AI 초안 상태 업데이트 실패" });
    }
  });

  app.post('/api/conversations/ai-draft-ids', async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const { conversationIds } = req.body as { conversationIds: number[] };
      if (!Array.isArray(conversationIds)) return res.status(400).json({ message: "Invalid input" });
      const ids = await storage.getPendingDraftConversationIds(conversationIds);
      res.json({ conversationIds: ids });
    } catch (err) {
      console.error('Get AI draft IDs error:', err);
      res.status(500).json({ message: "AI 초안 ID 조회 실패" });
    }
  });

  // Start a new conversation for a line item
  app.post('/api/line-items/:id/start-conversation', async (req, res) => {
    try {
      const lineItemId = parseInt(req.params.id);
      
      // Check if conversation already exists
      const existing = await storage.getConversationByLineItem(lineItemId);
      if (existing) {
        const conv = await storage.getConversation(existing.id);
        return res.json(conv);
      }
      
      // Get line item and campaign for subject prefix
      const [lineItem] = await db.select().from(campaignInfluencers).where(eq(campaignInfluencers.id, lineItemId));
      if (!lineItem) return res.status(404).json({ message: "Line item not found" });
      
      const campaign = await storage.getCampaign(lineItem.campaignId);
      const subjectPrefix = campaign ? `[${campaign.name}]` : '';
      
      const conv = await storage.createConversation({
        campaignLineItemId: lineItemId,
        subjectPrefix,
        status: 'active',
      });
      
      res.status(201).json(conv);
    } catch (err) {
      console.error('Start conversation error:', err);
      res.status(500).json({ message: "대화 시작 실패" });
    }
  });

  // === EMAIL TEMPLATES ===
  app.get('/api/email-templates', async (req, res) => {
    const workspaceId = parseInt(req.query.workspaceId as string) || 1;
    const templates = await storage.getEmailTemplates(workspaceId);
    res.json(templates);
  });

  app.post('/api/email-templates', async (req, res) => {
    const template = await storage.createEmailTemplate(req.body);
    res.status(201).json(template);
  });

  app.patch('/api/email-templates/:id', async (req, res) => {
    const template = await storage.updateEmailTemplate(parseInt(req.params.id), req.body);
    res.json(template);
  });

  app.delete('/api/email-templates/:id', async (req, res) => {
    await storage.deleteEmailTemplate(parseInt(req.params.id));
    res.json({ success: true });
  });

  // === BULK EMAIL ===
  
  // Preview template with variable substitution
  app.post('/api/bulk-email/preview', async (req, res) => {
    try {
      const { subject, body, influencerId, campaignId, emailAccountId } = req.body;
      const { renderTemplate, validateVariables, convertToGmailCompatibleHtml } = await import('./smtp');
      
      const influencer = await storage.getInfluencer(influencerId);
      const campaign = await storage.getCampaign(campaignId);
      
      if (!influencer) {
        return res.status(404).json({ message: "인플루언서를 찾을 수 없습니다" });
      }
      
      const variables: Record<string, string> = {
        influencer_name: influencer.name || '',
        campaign_name: campaign?.name || '',
      };
      
      const subjectValidation = validateVariables(subject, variables);
      const bodyValidation = validateVariables(body, variables);
      
      if (!subjectValidation.valid || !bodyValidation.valid) {
        const allMissing = [...new Set([...subjectValidation.missingVars, ...bodyValidation.missingVars])];
        return res.json({ 
          valid: false, 
          missingVars: allMissing,
          message: `변수값 없음: ${allMissing.join(', ')}`
        });
      }
      
      const renderedSubject = renderTemplate(subject, variables);
      let renderedBody = convertToGmailCompatibleHtml(renderTemplate(body, variables));
      
      if (emailAccountId) {
        const emailAccount = await storage.getEmailAccountById(emailAccountId);
        if (emailAccount?.useSignature && emailAccount?.signature) {
          renderedBody += `<br><br>--<br>${emailAccount.signature}`;
        }
      }
      
      res.json({ 
        valid: true,
        renderedSubject, 
        renderedBody,
        variables 
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
  
  // Send test email
  app.post('/api/bulk-email/test', async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      
      const { subject, body, cc, testEmail, emailAccountId, influencerId, campaignId } = req.body;
      const { renderTemplate, createSmtpTransporter, sendEmail, convertToGmailCompatibleHtml } = await import('./smtp');
      const { decryptPassword } = await import('./imap');
      
      if (!testEmail) {
        return res.status(400).json({ message: "테스트 이메일 주소를 입력하세요" });
      }
      
      const influencer = await storage.getInfluencer(influencerId);
      const campaign = await storage.getCampaign(campaignId);
      const emailAccount = await storage.getEmailAccountById(emailAccountId);
      
      if (!emailAccount) {
        return res.status(404).json({ message: "이메일 계정을 찾을 수 없습니다" });
      }
      
      const ccEmails: string[] = cc
        ? (typeof cc === 'string' ? cc.split(',').map((e: string) => e.trim()).filter(Boolean) : Array.isArray(cc) ? cc : [])
        : [];
      
      const variables: Record<string, string> = {
        influencer_name: influencer?.name || '[인플루언서 이름]',
        campaign_name: campaign?.name || '[캠페인 이름]',
      };
      
      const renderedSubject = `[테스트] ${renderTemplate(subject, variables)}`;
      let renderedBody = convertToGmailCompatibleHtml(renderTemplate(body, variables));
      
      if (emailAccount.useSignature && emailAccount.signature) {
        renderedBody += `<br><br>--<br>${emailAccount.signature}`;
      }
      
      const bulkSmtpSettings = getImapSmtpSettings(emailAccount);
      if (emailAccount.provider === 'imap' && bulkSmtpSettings.smtpHost && bulkSmtpSettings.imapPassword) {
        const decryptedPassword = decryptPassword(bulkSmtpSettings.imapPassword);
        
        const transporter = createSmtpTransporter({
          host: bulkSmtpSettings.smtpHost,
          port: bulkSmtpSettings.smtpPort,
          secure: bulkSmtpSettings.smtpPort === 465,
          user: emailAccount.email,
          password: decryptedPassword,
        });
        
        const result = await sendEmail(transporter, {
          from: emailAccount.email,
          to: testEmail,
          cc: ccEmails.length > 0 ? ccEmails : undefined,
          subject: renderedSubject,
          html: renderedBody,
          forceUniqueThread: true,
        });
        
        if (result.success) {
          res.json({ success: true, message: `테스트 메일이 ${testEmail}로 발송되었습니다` });
        } else {
          res.status(500).json({ success: false, message: result.error });
        }
      } else {
        res.status(400).json({ message: "IMAP/SMTP 계정만 지원됩니다" });
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
  
  // Validate recipients and get summary before sending
  app.post('/api/bulk-email/validate', async (req, res) => {
    try {
      const { subject, body, campaignId, lineItemIds, allowResend } = req.body;
      const { validateVariables } = await import('./smtp');
      
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        return res.status(404).json({ message: "캠페인을 찾을 수 없습니다" });
      }
      
      const alreadySent = await storage.getSentEmailsForCampaign(campaignId);
      const sentInfluencerIds = new Set(alreadySent.map(s => s.influencerId));
      const sentEmails = new Set(alreadySent.map(s => s.email.toLowerCase()));
      
      const eligible: any[] = [];
      const excluded: any[] = [];
      const emailSet = new Map<string, any>();
      
      for (const lineItem of campaign.items || []) {
        if (lineItemIds && !lineItemIds.includes(lineItem.id)) continue;
        
        const influencer = lineItem.influencer;
        if (!influencer) continue;
        
        if (!allowResend && sentInfluencerIds.has(influencer.id)) {
          excluded.push({
            lineItemId: lineItem.id,
            influencerId: influencer.id,
            name: influencer.name,
            email: influencer.email,
            reason: '이미 발송됨',
          });
          continue;
        }
        
        if (!influencer.email) {
          excluded.push({
            lineItemId: lineItem.id,
            influencerId: influencer.id,
            name: influencer.name,
            email: null,
            reason: '이메일 없음',
          });
          continue;
        }
        
        const emailLower = influencer.email.toLowerCase();
        if (emailSet.has(emailLower)) {
          excluded.push({
            lineItemId: lineItem.id,
            influencerId: influencer.id,
            name: influencer.name,
            email: influencer.email,
            reason: '중복 이메일',
          });
          continue;
        }
        
        const variables: Record<string, string> = {
          influencer_name: influencer.name || '',
          campaign_name: campaign.name || '',
        };
        
        const subjectValidation = validateVariables(subject, variables);
        const bodyValidation = validateVariables(body, variables);
        
        if (!subjectValidation.valid || !bodyValidation.valid) {
          const allMissing = [...new Set([...subjectValidation.missingVars, ...bodyValidation.missingVars])];
          excluded.push({
            lineItemId: lineItem.id,
            influencerId: influencer.id,
            name: influencer.name,
            email: influencer.email,
            reason: `변수값 누락: ${allMissing.join(', ')}`,
          });
          continue;
        }
        
        emailSet.set(emailLower, true);
        eligible.push({
          lineItemId: lineItem.id,
          influencerId: influencer.id,
          name: influencer.name,
          email: influencer.email,
          variables,
        });
      }
      
      res.json({
        totalSelected: (lineItemIds || campaign.items || []).length,
        eligibleCount: eligible.length,
        excludedCount: excluded.length,
        eligible,
        excluded,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
  
  // Start bulk email job
  app.post('/api/bulk-email/start', async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const user = req.user as any;
      
      const { subject, body, cc, campaignId, emailAccountId, eligible, useSignature: useSignatureOverride } = req.body;
      const { renderTemplate, startBulkEmailWorker, convertToGmailCompatibleHtml } = await import('./smtp');
      
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        return res.status(404).json({ message: "캠페인을 찾을 수 없습니다" });
      }
      
      const ccString = cc ? (typeof cc === 'string' ? cc.trim() : '') : '';
      
      const emailAccount = await storage.getEmailAccountById(emailAccountId);
      const shouldUseSignature = useSignatureOverride !== undefined ? useSignatureOverride : (emailAccount?.useSignature ?? true);
      const signatureHtml = shouldUseSignature && emailAccount?.signature ? `<br><br>--<br>${emailAccount.signature}` : '';
      
      const job = await storage.createBulkEmailJob({
        workspaceId: campaign.workspaceId,
        campaignId,
        emailAccountId,
        templateSubject: subject,
        templateBody: body,
        cc: ccString || null,
        totalCount: eligible.length,
        sentCount: 0,
        failedCount: 0,
        skippedCount: 0,
        status: 'pending',
        createdBy: user.id,
      });
      
      const queueItems = eligible.map((item: any) => ({
        jobId: job.id,
        campaignId,
        lineItemId: item.lineItemId,
        influencerId: item.influencerId,
        email: item.email,
        renderedSubject: renderTemplate(subject, item.variables),
        renderedBody: convertToGmailCompatibleHtml(renderTemplate(body, item.variables)) + signatureHtml,
        variables: item.variables,
        status: 'queued' as const,
      }));
      
      await storage.createBulkEmailQueueItems(queueItems);
      
      startBulkEmailWorker(job.id);
      
      res.status(201).json({ 
        jobId: job.id, 
        message: `${eligible.length}명에게 발송을 시작합니다` 
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
  
  // Get bulk email jobs for a campaign
  app.get('/api/bulk-email/jobs/:campaignId', async (req, res) => {
    const jobs = await storage.getBulkEmailJobs(parseInt(req.params.campaignId));
    res.json(jobs);
  });
  
  // Get bulk email job details with queue items
  app.get('/api/bulk-email/jobs/:campaignId/:jobId', async (req, res) => {
    const job = await storage.getBulkEmailJob(parseInt(req.params.jobId));
    if (!job) return res.status(404).json({ message: "Job not found" });
    const items = await storage.getBulkEmailQueueItems(job.id);
    res.json({ job, items });
  });
  
  app.post('/api/bulk-email/jobs/:jobId/retry', async (req, res) => {
    try {
      const jobId = parseInt(req.params.jobId);
      const job = await storage.getBulkEmailJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });
      
      const items = await storage.getBulkEmailQueueItems(jobId);
      const retryItems = items.filter(i => i.status === 'queued' || i.status === 'failed');
      if (retryItems.length === 0) {
        return res.status(400).json({ message: "발송 대기 중인 항목이 없습니다." });
      }
      
      for (const item of retryItems) {
        await storage.updateBulkEmailQueueItem(item.id, { status: 'queued', attempts: 0 });
      }
      
      const alreadySent = items.filter(i => i.status === 'sent').length;
      await storage.updateBulkEmailJob(jobId, { 
        status: 'pending', 
        completedAt: null,
        sentCount: alreadySent,
        failedCount: 0,
      });
      
      const { startBulkEmailWorker } = await import('./smtp');
      startBulkEmailWorker(jobId);
      
      res.json({ message: "재발송을 시작합니다.", retryCount: retryItems.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Toggle first contact completed status
  app.patch('/api/line-items/:id/first-contact', async (req, res) => {
    try {
      const lineItemId = parseInt(req.params.id);
      const { firstContactCompleted } = req.body;
      
      const updated = await storage.updateCampaignItem(lineItemId, {
        firstContactCompleted,
        firstContactAt: firstContactCompleted ? new Date() : null,
        firstContactMethod: 'manual',
      });
      
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === LINE ITEM OPERATIONS ===
  
  // Get line item with full details (influencer + feedback notes)
  app.get('/api/line-items/:id', async (req, res) => {
    try {
      const lineItemId = parseInt(req.params.id);
      const lineItem = await storage.getLineItemWithDetails(lineItemId);
      if (!lineItem) {
        return res.status(404).json({ message: "Line item not found" });
      }
      res.json(lineItem);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete('/api/line-items/:id', async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const userId = (req.user as any).id;
      const lineItemId = parseInt(req.params.id);
      
      const lineItem = await storage.getLineItemWithDetails(lineItemId);
      if (!lineItem) {
        return res.status(404).json({ message: "Line item not found" });
      }
      
      const campaign = await storage.getCampaign(lineItem.campaignId);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      
      const memberships = await storage.getWorkspaceMemberships(userId);
      const member = memberships.find(m => m.workspaceId === campaign.workspaceId);
      if (!member) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      if (member.role === 'CLIENT') {
        return res.status(403).json({ message: "CLIENT role cannot delete line items" });
      }
      
      await storage.deleteCampaignItem(lineItemId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Update line item operations data (stage, comm status, offer, contract, etc.)
  app.patch('/api/line-items/:id/operations', async (req, res) => {
    try {
      const lineItemId = parseInt(req.params.id);
      const updates = { ...req.body };
      
      // Convert date string fields to Date objects
      const dateFields = ['draftDueAt', 'uploadDueAt', 'publishedConfirmedAt', 'feedbackSummaryUpdatedAt', 'lastOutboundAt', 'firstContactAt', 'settlementRequestedAt'];
      for (const field of dateFields) {
        if (updates[field] !== undefined) {
          updates[field] = updates[field] ? new Date(updates[field]) : null;
        }
      }
      
      // Handle published confirmation timestamp
      if (updates.isPublishedConfirmed === true && !updates.publishedConfirmedAt) {
        updates.publishedConfirmedAt = new Date();
      }
      
      updates.updatedAt = new Date();
      
      const updated = await storage.updateCampaignItem(lineItemId, updates);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Get feedback notes for a line item
  app.get('/api/line-items/:id/feedback-notes', async (req, res) => {
    try {
      const lineItemId = parseInt(req.params.id);
      const notes = await storage.getFeedbackNotes(lineItemId);
      res.json(notes);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Create a feedback note
  app.post('/api/line-items/:id/feedback-notes', async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const lineItemId = parseInt(req.params.id);
      const { body } = req.body;
      
      if (!body || !body.trim()) {
        return res.status(400).json({ message: "Note body is required" });
      }
      
      const note = await storage.createFeedbackNote({
        lineItemId,
        authorUserId: (req.user as any).id,
        body: body.trim(),
      });
      
      res.status(201).json(note);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Update a feedback note
  app.patch('/api/feedback-notes/:id', async (req, res) => {
    try {
      const noteId = parseInt(req.params.id);
      const { body, isSelectedForSummary, isPinned } = req.body;
      
      const updates: any = {};
      if (body !== undefined) updates.body = body;
      if (isSelectedForSummary !== undefined) updates.isSelectedForSummary = isSelectedForSummary;
      if (isPinned !== undefined) updates.isPinned = isPinned;
      
      const updated = await storage.updateFeedbackNote(noteId, updates);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Delete a feedback note
  app.delete('/api/feedback-notes/:id', async (req, res) => {
    try {
      const noteId = parseInt(req.params.id);
      await storage.deleteFeedbackNote(noteId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Save feedback summary
  app.patch('/api/line-items/:id/feedback-summary', async (req, res) => {
    try {
      const lineItemId = parseInt(req.params.id);
      const { feedbackSummary } = req.body;
      
      const updated = await storage.updateCampaignItem(lineItemId, {
        feedbackSummary,
        feedbackSummaryUpdatedAt: new Date(),
      });
      
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
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

  app.get('/api/tracking-jobs/:id', async (req, res) => {
    const job = await storage.getTrackingJob(parseInt(req.params.id));
    if (!job) return res.status(404).json({ message: "Not found" });
    res.json(job);
  });

  app.patch('/api/tracking-jobs/:id', async (req, res) => {
    const job = await storage.updateTrackingJob(parseInt(req.params.id), req.body);
    res.json(job);
  });

  app.post(api.tracking.mockUpdate.path, async (req, res) => {
    const jobId = parseInt(req.params.id);
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

  // Tracking export (CSV)
  app.get('/api/tracking-jobs/:id/export', async (req, res) => {
    const metrics = await storage.getTrackingMetrics(parseInt(req.params.id));
    const job = await storage.getTrackingJob(parseInt(req.params.id));
    
    const csv = ['날짜,지표값', ...metrics.map(m => `${m.date},${m.value}`)].join('\n');
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${job?.name || 'tracking'}-export.csv"`);
    res.send('\uFEFF' + csv); // BOM for Korean Excel compatibility
  });

  // === EMAIL TEMPLATES ===
  app.get(api.emailTemplates.list.path, async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const wId = parseInt(req.params.workspaceId);
      const templates = await storage.getEmailTemplates(wId);
      res.json(templates);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get(api.emailTemplates.get.path, async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const templates = await storage.getEmailTemplates(parseInt(req.params.workspaceId));
      const template = templates.find(t => t.id === parseInt(req.params.id));
      if (!template) return res.status(404).json({ message: "Template not found" });
      res.json(template);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post(api.emailTemplates.create.path, async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const wId = parseInt(req.params.workspaceId);
      const input = api.emailTemplates.create.input.parse({ ...req.body, workspaceId: wId });
      const template = await storage.createEmailTemplate(input);
      res.status(201).json(template);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch(api.emailTemplates.update.path, async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const id = parseInt(req.params.id);
      const input = api.emailTemplates.update.input.parse(req.body);
      const template = await storage.updateEmailTemplate(id, input);
      if (!template) return res.status(404).json({ message: "Template not found" });
      res.json(template);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete(api.emailTemplates.delete.path, async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const id = parseInt(req.params.id);
      await storage.deleteEmailTemplate(id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === CONTRACT TEMPLATES ===
  app.get(api.contractTemplates.list.path, async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const wId = parseInt(req.params.workspaceId);
      const templates = await storage.getContractTemplates(wId);
      res.json(templates);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get(api.contractTemplates.get.path, async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const template = await storage.getContractTemplate(parseInt(req.params.id));
      if (!template) return res.status(404).json({ message: "Template not found" });
      res.json(template);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post(api.contractTemplates.create.path, async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const wId = parseInt(req.params.workspaceId);
      const input = api.contractTemplates.create.input.parse({ ...req.body, workspaceId: wId });
      const template = await storage.createContractTemplate(input);
      res.status(201).json(template);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch(api.contractTemplates.update.path, async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const id = parseInt(req.params.id);
      const existing = await storage.getContractTemplate(id);
      if (!existing) return res.status(404).json({ message: "Template not found" });
      const input = api.contractTemplates.update.input.parse(req.body);
      const template = await storage.updateContractTemplate(id, input);
      res.json(template);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete(api.contractTemplates.delete.path, async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const id = parseInt(req.params.id);
      const existing = await storage.getContractTemplate(id);
      if (!existing) return res.status(404).json({ message: "Template not found" });
      await storage.deleteContractTemplate(id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  function convertQuillAlignToInline(html: string): string {
    return html
      .replace(/class="ql-align-center"/g, 'style="text-align: center;"')
      .replace(/class="ql-align-right"/g, 'style="text-align: right;"')
      .replace(/class="ql-align-justify"/g, 'style="text-align: justify;"');
  }

  // === Contract Content Helper ===
  async function renderContractContent(templateContent: string, lineItem: any, campaign: any, extraVariables?: Record<string, string>): Promise<string> {
    const defaultVariables: Record<string, string> = {
      '인플루언서명': lineItem.influencer?.name || '',
      '캠페인명': campaign?.name || '',
      '광고비': (lineItem.offerFee || 0).toLocaleString() + '원',
      '금액': (lineItem.offerFee || 0).toLocaleString() + '원',
      '날짜': new Date().toLocaleDateString('ko-KR'),
      '초안예정일': lineItem.draftDueAt ? new Date(lineItem.draftDueAt).toLocaleDateString('ko-KR') : '',
      '업로드예정일': lineItem.uploadDueAt ? new Date(lineItem.uploadDueAt).toLocaleDateString('ko-KR') : '',
      '클라이언트명': campaign?.client || '',
      '이메일': lineItem.influencer?.email || '',
      '연락처': lineItem.influencer?.phone || lineItem.influencer?.contactPoint || '',
      '은행명': lineItem.influencer?.bankName || '',
      '계좌번호': lineItem.influencer?.accountNumber || '',
      '예금주': lineItem.influencer?.accountHolder || '',
      '사업자명': lineItem.influencer?.businessName || '',
      '사업자등록번호': lineItem.influencer?.businessRegNo || '',
      '정산유형': lineItem.influencer?.settlementType || '',
      '생년월일': lineItem.influencer?.birthDate || '',
      '2차활용기간': lineItem.offerUsageMonths ? lineItem.offerUsageMonths + '개월' : '',
      '2차활용갱신비용': lineItem.offerUsageRenewalFee ? (lineItem.offerUsageRenewalFee).toLocaleString() + '원' : '',
    };
    const allVariables = { ...defaultVariables, ...extraVariables };
    let content = templateContent;
    for (const [key, value] of Object.entries(allVariables)) {
      content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }
    const hasHtmlTags = /<\s*[a-zA-Z][^>]*>/.test(content);
    if (!hasHtmlTags) {
      const escapeHtml = (text: string) => text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      content = content.split('\n').map((line: string) => `<p>${escapeHtml(line)}</p>`).join('');
    }
    return content;
  }

  // Render template preview (returns HTML with variables substituted)
  app.post('/api/workspaces/:workspaceId/contract-templates/:id/render-preview', async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const templateId = parseInt(req.params.id);
      const { lineItemId } = req.body;

      const template = await storage.getContractTemplate(templateId);
      if (!template) return res.status(404).json({ message: "Template not found" });

      const lineItem = await storage.getLineItemWithDetails(lineItemId);
      if (!lineItem) return res.status(404).json({ message: "Line item not found" });

      const campaign = await storage.getCampaign(lineItem.campaignId);
      const renderedContent = await renderContractContent(template.content, lineItem, campaign);

      res.json({ content: renderedContent });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Save individual contract content for a line item
  app.patch('/api/line-items/:id/contract-content', async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const lineItemId = parseInt(req.params.id);
      const { contractContent, contractTemplateId } = req.body;

      const updated = await storage.updateCampaignItem(lineItemId, {
        contractContent,
        contractTemplateId,
      });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Get line item contract content
  app.get('/api/line-items/:id/contract-content', async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const lineItemId = parseInt(req.params.id);
      const lineItem = await storage.getLineItemWithDetails(lineItemId);
      if (!lineItem) return res.status(404).json({ message: "Line item not found" });

      res.json({ 
        contractContent: lineItem.contractContent || null,
        contractTemplateId: lineItem.contractTemplateId || null,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Generate DOCX contract (from saved content or template)
  app.post(api.contractTemplates.generateDocx.path, async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const templateId = parseInt(req.params.id);
      const { lineItemId, variables, useCustomContent } = req.body;

      const lineItem = await storage.getLineItemWithDetails(lineItemId);
      if (!lineItem) return res.status(404).json({ message: "Line item not found" });

      let content: string;

      if (useCustomContent && lineItem.contractContent) {
        content = lineItem.contractContent;
      } else {
        const template = await storage.getContractTemplate(templateId);
        if (!template) return res.status(404).json({ message: "Template not found" });
        const campaign = await storage.getCampaign(lineItem.campaignId);
        content = await renderContractContent(template.content, lineItem, campaign, variables);
      }

      // Convert Quill alignment classes to inline styles for reliable rendering
      const processedContent = convertQuillAlignToInline(content);
      
      // Generate DOCX using html-to-docx library
      const HTMLtoDOCX = (await import('html-to-docx')).default;
      
      // Wrap content in proper HTML structure for better rendering
      // Using 맑은 고딕 (Malgun Gothic) as primary font with Noto Sans KR as fallback
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: '맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif; font-size: 12pt; line-height: 1.6; }
            h1 { font-size: 18pt; font-weight: bold; margin-bottom: 12pt; }
            h2 { font-size: 16pt; font-weight: bold; margin-bottom: 10pt; }
            h3 { font-size: 14pt; font-weight: bold; margin-bottom: 8pt; }
            p { margin: 6pt 0; }
            ul, ol { margin: 6pt 0; padding-left: 24pt; }
            li { margin: 4pt 0; }
            table { border-collapse: collapse; width: 100%; margin: 10pt 0; }
            td, th { border: 1px solid #000; padding: 6pt; }
            th { background-color: #f5f5f5; font-weight: bold; }
            strong, b { font-weight: bold; }
            em, i { font-style: italic; }
            u { text-decoration: underline; }
          </style>
        </head>
        <body>${processedContent}</body>
        </html>
      `;
      
      const buffer = await HTMLtoDOCX(htmlContent, null, {
        table: { row: { cantSplit: true } },
        footer: false,
        header: false,
        pageNumber: false,
        font: '맑은 고딕'
      });
      
      const filename = `계약서_${lineItem.influencer?.name || 'contract'}_${new Date().toISOString().split('T')[0]}.docx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      res.send(buffer);
    } catch (err: any) {
      console.error('DOCX generation error:', err);
      const errorDetails = {
        message: 'DOCX 생성 중 오류가 발생했습니다.',
        details: err.message || '알 수 없는 오류',
        suggestions: [
          '템플릿 내용이 올바른지 확인해주세요.',
          'HTML 형식이 올바른지 확인해주세요.',
          '특수 문자나 복잡한 표가 포함되어 있다면 단순화해 보세요.',
          '문제가 지속되면 관리자에게 문의해주세요.'
        ]
      };
      res.status(500).json(errorDetails);
    }
  });

  // Generate PDF contract (from saved content or template)
  app.post(api.contractTemplates.generatePdf.path, async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const templateId = parseInt(req.params.id);
      const { lineItemId, variables, useCustomContent } = req.body;

      const lineItem = await storage.getLineItemWithDetails(lineItemId);
      if (!lineItem) return res.status(404).json({ message: "Line item not found" });

      let content: string;

      if (useCustomContent && lineItem.contractContent) {
        content = lineItem.contractContent;
      } else {
        const template = await storage.getContractTemplate(templateId);
        if (!template) return res.status(404).json({ message: "Template not found" });
        const campaign = await storage.getCampaign(lineItem.campaignId);
        content = await renderContractContent(template.content, lineItem, campaign, variables);
      }

      // Convert Quill alignment classes to inline styles for reliable rendering
      const processedContent = convertQuillAlignToInline(content);

      // Generate PDF using Puppeteer for full HTML/CSS support with rich text formatting
      const fs = await import('fs');
      const path = await import('path');
      
      // Read and embed local fonts (regular and bold) as base64 for offline rendering
      const fontPathRegular = path.join(process.cwd(), 'server', 'fonts', 'NotoSansKR-Regular.ttf');
      const fontPathBold = path.join(process.cwd(), 'server', 'fonts', 'NotoSansKR-Bold.ttf');
      let fontBase64Regular = '';
      let fontBase64Bold = '';
      try {
        if (fs.existsSync(fontPathRegular)) {
          const fontBuffer = fs.readFileSync(fontPathRegular);
          fontBase64Regular = fontBuffer.toString('base64');
        }
        if (fs.existsSync(fontPathBold)) {
          const fontBuffer = fs.readFileSync(fontPathBold);
          fontBase64Bold = fontBuffer.toString('base64');
        }
      } catch (e) {
        console.warn('Could not load local fonts');
        // In production, font read errors are fatal for deterministic rendering
        if (isProduction) {
          throw new Error('PDF 생성에 필요한 폰트를 읽을 수 없습니다. 관리자에게 문의해주세요.');
        }
        console.warn('Falling back to Google Fonts (dev mode)');
      }
      
      // In production, require local fonts for deterministic rendering
      if (isProduction && (!fontBase64Regular || !fontBase64Bold)) {
        throw new Error('PDF 생성에 필요한 폰트 파일이 없습니다. 관리자에게 문의해주세요.');
      }
      
      // Create full HTML document with embedded fonts (local or Google Fonts fallback)
      const hasLocalFonts = fontBase64Regular && fontBase64Bold;
      const fontFaceRule = hasLocalFonts 
        ? `@font-face {
            font-family: 'Noto Sans KR';
            src: url('data:font/truetype;base64,${fontBase64Regular}') format('truetype');
            font-weight: 400;
            font-style: normal;
          }
          @font-face {
            font-family: 'Noto Sans KR';
            src: url('data:font/truetype;base64,${fontBase64Bold}') format('truetype');
            font-weight: 700;
            font-style: normal;
          }`
        : '';
      
      // Google Fonts fallback only in dev mode (production requires local fonts)
      const googleFontsLink = (hasLocalFonts || isProduction)
        ? '' 
        : '<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&display=swap" rel="stylesheet">';
      
      const htmlDocument = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  ${googleFontsLink}
  <style>
    ${fontFaceRule}
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Noto Sans KR', '맑은 고딕', 'Malgun Gothic', sans-serif;
      font-size: 12pt;
      line-height: 1.6;
      padding: 40px;
      color: #333;
    }
    h1 { font-size: 20pt; font-weight: 700; margin-bottom: 16px; }
    h2 { font-size: 16pt; font-weight: 700; margin-bottom: 12px; }
    h3 { font-size: 14pt; font-weight: 700; margin-bottom: 10px; }
    p { margin-bottom: 10px; }
    ul, ol { margin-left: 24px; margin-bottom: 10px; }
    li { margin-bottom: 6px; }
    strong, b { font-weight: 700; }
    em, i { font-style: italic; }
    u { text-decoration: underline; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 16px; }
    th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
    th { background-color: #f5f5f5; font-weight: 700; }
  </style>
</head>
<body>
  ${processedContent}
</body>
</html>`;

      // Use shared browser instance for efficiency
      const browser = await getSharedBrowser();
      const page = await browser.newPage();
      
      try {
        // Set a longer timeout for font loading
        page.setDefaultTimeout(30000);
        
        await page.setContent(htmlDocument, { 
          waitUntil: 'networkidle0',
          timeout: 30000
        });
        
        // Wait for fonts to load
        await page.evaluateHandle('document.fonts.ready');
        
        const pdfBuffer = await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' }
        });
        
        const filename = `계약서_${lineItem.influencer?.name || 'contract'}_${new Date().toISOString().split('T')[0]}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        res.send(pdfBuffer);
      } finally {
        // Always close the page but keep the browser running
        await page.close();
      }
    } catch (err: any) {
      console.error('[PDF Generation Error] Details:', {
        message: err.message,
        name: err.name,
        stack: err.stack,
        templateId: parseInt(req.params.id),
        lineItemId: req.body?.lineItemId
      });
      
      // Determine appropriate HTTP status code
      const isServiceUnavailable = 
        err.message?.includes('서비스가 아직 준비 중') ||
        err.message?.includes('서비스가 현재 사용 불가능') ||
        err.message?.includes('서비스 초기화에 실패') ||
        err.message?.includes('폰트 파일이 없습니다') ||
        err.message?.includes('폰트를 읽을 수 없습니다');
      
      const statusCode = isServiceUnavailable ? 503 : 500;
      
      const errorDetails = {
        message: isServiceUnavailable ? 'PDF 생성 서비스를 사용할 수 없습니다.' : 'PDF 생성 중 오류가 발생했습니다.',
        details: err.message || '알 수 없는 오류',
        errorType: err.name || 'Error',
        suggestions: isServiceUnavailable 
          ? ['잠시 후 다시 시도해주세요.', '문제가 지속되면 관리자에게 문의해주세요.']
          : [
              '템플릿 내용이 올바른지 확인해주세요.',
              '특수 문자나 이모지가 포함되어 있다면 제거해 보세요.',
              '문제가 지속되면 DOCX 형식으로 다운로드를 시도해주세요.'
            ]
      };
      res.status(statusCode).json(errorDetails);
    }
  });

  // Send contract PDF via email (through existing conversation thread)
  app.post('/api/line-items/:id/send-contract-email', async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const lineItemId = parseInt(req.params.id);
      const { emailBody } = req.body;

      const lineItem = await storage.getLineItemWithDetails(lineItemId);
      if (!lineItem) return res.status(404).json({ message: "Line item not found" });

      if (!lineItem.contractContent) {
        return res.status(400).json({ message: "저장된 계약서 내용이 없습니다. 먼저 계약서를 저장해주세요." });
      }

      const conversation = await storage.getConversationByLineItem(lineItemId);
      if (!conversation) {
        return res.status(400).json({ message: "연결된 이메일 스레드가 없습니다. 커뮤니케이션 탭에서 먼저 이메일을 연결해주세요." });
      }

      const toEmail = lineItem.influencer?.email;
      if (!toEmail) {
        return res.status(400).json({ message: "인플루언서 이메일이 없습니다." });
      }

      const campaign = await storage.getCampaign(lineItem.campaignId);
      if (!campaign) {
        return res.status(404).json({ message: "캠페인을 찾을 수 없습니다." });
      }
      const pdfContent = convertQuillAlignToInline(lineItem.contractContent);

      const fs = await import('fs');
      const path = await import('path');
      
      const fontPathRegular = path.join(process.cwd(), 'server', 'fonts', 'NotoSansKR-Regular.ttf');
      const fontPathBold = path.join(process.cwd(), 'server', 'fonts', 'NotoSansKR-Bold.ttf');
      let fontBase64Regular = '';
      let fontBase64Bold = '';
      try {
        if (fs.existsSync(fontPathRegular)) fontBase64Regular = fs.readFileSync(fontPathRegular).toString('base64');
        if (fs.existsSync(fontPathBold)) fontBase64Bold = fs.readFileSync(fontPathBold).toString('base64');
      } catch (e) {
        console.warn('Could not load local fonts for PDF email');
      }

      const hasLocalFonts = fontBase64Regular && fontBase64Bold;
      const fontFaceRule = hasLocalFonts 
        ? `@font-face { font-family: 'Noto Sans KR'; src: url('data:font/truetype;base64,${fontBase64Regular}') format('truetype'); font-weight: 400; }
           @font-face { font-family: 'Noto Sans KR'; src: url('data:font/truetype;base64,${fontBase64Bold}') format('truetype'); font-weight: 700; }`
        : '';

      const htmlDocument = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
        ${fontFaceRule}
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Noto Sans KR', '맑은 고딕', sans-serif; font-size: 12pt; line-height: 1.6; padding: 40px; color: #333; }
        h1 { font-size: 20pt; font-weight: 700; margin-bottom: 16px; }
        h2 { font-size: 16pt; font-weight: 700; margin-bottom: 12px; }
        h3 { font-size: 14pt; font-weight: 700; margin-bottom: 10px; }
        p { margin-bottom: 10px; }
        ul, ol { margin-left: 24px; margin-bottom: 10px; }
        li { margin-bottom: 6px; }
        strong, b { font-weight: 700; }
        em, i { font-style: italic; }
        u { text-decoration: underline; }
        table { border-collapse: collapse; width: 100%; margin-bottom: 16px; }
        th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
        th { background-color: #f5f5f5; font-weight: 700; }
      </style></head><body>${pdfContent}</body></html>`;

      const browser = await getSharedBrowser();
      const page = await browser.newPage();
      let pdfBuffer: Buffer;
      
      try {
        page.setDefaultTimeout(30000);
        await page.setContent(htmlDocument, { waitUntil: 'networkidle0', timeout: 30000 });
        await page.evaluateHandle('document.fonts.ready');
        pdfBuffer = Buffer.from(await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' }
        }));
      } finally {
        await page.close();
      }

      const filename = `계약서_${lineItem.influencer?.name || 'contract'}_${new Date().toISOString().split('T')[0]}.pdf`;
      const body = emailBody || `안녕하세요, ${lineItem.influencer?.name}님.\n\n${campaign?.name || ''} 캠페인 계약서를 첨부하여 보내드립니다.\n\n확인 부탁드립니다.`;

      const contractUserId = (req.user as any)?.id;
      if (!contractUserId) {
        return res.status(401).json({ message: "로그인이 필요합니다" });
      }

      const contractUserAccounts = await storage.getEmailAccounts(contractUserId, campaign.workspaceId);
      if (!contractUserAccounts || contractUserAccounts.length === 0) {
        return res.status(400).json({ message: "등록된 이메일 계정이 없습니다. 설정에서 이메일 계정을 먼저 등록해주세요." });
      }
      const account = (conversation.emailAccountId && contractUserAccounts.find(a => a.id === conversation.emailAccountId)) || contractUserAccounts[0];

      const { convertToGmailCompatibleHtml } = await import('./smtp');
      let finalBody = convertToGmailCompatibleHtml(body);
      if (account.useSignature && account.signature) {
        finalBody += `<br><br>--<br>${account.signature}`;
      }

      const subject = conversation.subjectPrefix ? `${conversation.subjectPrefix} 계약서 송부`.trim() : '계약서 송부';

      let gmailMessageId: string | null = null;
      let gmailThreadId: string | null = null;
      let sendStatus = 'sent';

      try {
        if (account.provider === 'imap') {
          const { createSmtpTransporter, sendEmail: sendSmtpEmail } = await import('./smtp');
          const { decryptPassword } = await import('./imap');

          const contractSmtp = getImapSmtpSettings(account);
          if (!contractSmtp.smtpHost || !contractSmtp.imapPassword) {
            return res.status(400).json({ message: "SMTP 설정이 완료되지 않았습니다." });
          }

          const password = decryptPassword(contractSmtp.imapPassword);
          const transporter = createSmtpTransporter({
            host: contractSmtp.smtpHost,
            port: contractSmtp.smtpPort,
            secure: contractSmtp.smtpPort === 465,
            user: account.email,
            password,
          });

          const result = await sendSmtpEmail(transporter, {
            from: account.email,
            to: toEmail,
            subject,
            html: finalBody,
            attachments: [{
              filename,
              content: pdfBuffer,
              contentType: 'application/pdf',
            }],
          });

          if (!result.success) {
            throw new Error(result.error || 'SMTP 전송 실패');
          }
        } else {
          const { sendEmail: sendGmailEmail } = await import('./gmail');
          const result = await sendGmailEmail(
            toEmail, subject, finalBody,
            conversation.gmailThreadId || undefined,
            undefined,
            [{ filename, content: pdfBuffer, mimeType: 'application/pdf' }]
          );
          gmailMessageId = result.id || null;
          gmailThreadId = result.threadId || null;

          if (!conversation.gmailThreadId && gmailThreadId) {
            await storage.updateConversation(conversation.id, { gmailThreadId });
          }
        }
      } catch (sendErr: any) {
        console.error('Contract email send failed:', sendErr);
        sendStatus = 'failed';
      }

      const { generateSnippet } = await import('./gmail');
      const snippet = generateSnippet(finalBody);
      await storage.createConversationMessage({
        conversationId: conversation.id,
        direction: 'outbound',
        senderEmail: account.email,
        senderName: null,
        recipientEmail: toEmail,
        ccEmails: null,
        snippet,
        bodyHtml: finalBody,
        bodyText: finalBody.replace(/<[^>]*>/g, ''),
        gmailMessageId,
        gmailThreadId,
        sendStatus,
      });

      if (sendStatus === 'failed') {
        return res.status(500).json({ message: '계약서 이메일 발송에 실패했습니다.' });
      }

      await storage.updateConversation(conversation.id, { lastMessageAt: new Date() });

      res.json({ success: true, message: '계약서가 이메일로 발송되었습니다.' });
    } catch (err: any) {
      console.error('Send contract email error:', err);
      res.status(500).json({ message: err.message || '계약서 이메일 발송 실패' });
    }
  });

  // === AUDIT LOGS ===
  app.get('/api/audit-logs', async (req, res) => {
    const { workspaceId, entityType, entityId } = req.query;
    const logs = await storage.getAuditLogs(
      parseInt(workspaceId as string) || 1,
      entityType as string,
      entityId ? parseInt(entityId as string) : undefined
    );
    res.json(logs);
  });

  // === CLIENT MANAGEMENT (OWNER only) ===
  const clientSchema = z.object({
    workspaceId: z.number(),
    name: z.string().min(1),
    logoUrl: z.string().optional().nullable(),
    memo: z.string().optional().nullable(),
    status: z.enum(['active', 'inactive']).optional(),
  });

  // Helper to check if user is OWNER
  async function isWorkspaceOwner(userId: number, workspaceId: number): Promise<boolean> {
    const member = await storage.getWorkspaceMember(userId, workspaceId);
    return member?.role === 'WORKSPACE_OWNER';
  }

  // Helper to check if user is platform admin
  async function isPlatformAdmin(userId: number): Promise<boolean> {
    const user = await storage.getUser(userId);
    return user?.isPlatformAdmin === true;
  }

  // Helper to check if user can manage workspace members (owner or platform admin)
  async function canManageWorkspaceMembers(userId: number, workspaceId: number): Promise<boolean> {
    if (await isPlatformAdmin(userId)) return true;
    return await isWorkspaceOwner(userId, workspaceId);
  }

  app.get('/api/clients', async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const { workspaceId } = req.query;
      if (!workspaceId) return res.status(400).json({ message: "workspaceId required" });
      
      const clients = await storage.getClients(parseInt(workspaceId as string));
      res.json(clients);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/clients', async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const parsed = clientSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.errors });
      
      const userId = (req.user as any).id;
      if (!await isWorkspaceOwner(userId, parsed.data.workspaceId)) {
        return res.status(403).json({ message: "소유자만 클라이언트를 생성할 수 있습니다" });
      }
      
      const client = await storage.createClient(parsed.data);
      res.status(201).json(client);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch('/api/clients/:id', async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const clientId = parseInt(req.params.id);
      const existing = await storage.getClient(clientId);
      if (!existing) return res.status(404).json({ message: "클라이언트를 찾을 수 없습니다" });
      
      const userId = (req.user as any).id;
      if (!await isWorkspaceOwner(userId, existing.workspaceId)) {
        return res.status(403).json({ message: "소유자만 클라이언트를 수정할 수 있습니다" });
      }
      
      const updated = await storage.updateClient(clientId, req.body);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete('/api/clients/:id', async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const clientId = parseInt(req.params.id);
      const existing = await storage.getClient(clientId);
      if (!existing) return res.status(404).json({ message: "클라이언트를 찾을 수 없습니다" });
      
      const userId = (req.user as any).id;
      if (!await isWorkspaceOwner(userId, existing.workspaceId)) {
        return res.status(403).json({ message: "소유자만 클라이언트를 삭제할 수 있습니다" });
      }
      
      await storage.deleteClient(clientId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === USER MANAGEMENT (OWNER only) ===
  const createUserSchema = z.object({
    workspaceId: z.number(),
    email: z.string().email(),
    password: z.string().min(6),
    name: z.string().min(1),
    role: z.enum(['WORKSPACE_OWNER', 'WORKSPACE_MEMBER', 'CLIENT']),
    clientIds: z.array(z.number()).optional(),
  });

  const updateUserRoleSchema = z.object({
    workspaceId: z.number(),
    role: z.enum(['WORKSPACE_OWNER', 'WORKSPACE_MEMBER', 'CLIENT']),
    clientIds: z.array(z.number()).optional(),
  });

  app.get('/api/workspace-users', async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const { workspaceId } = req.query;
      if (!workspaceId) return res.status(400).json({ message: "workspaceId required" });
      
      const users = await storage.getWorkspaceUsers(parseInt(workspaceId as string));
      res.json(users);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/workspace-users', async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const parsed = createUserSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.errors });
      
      const currentUserId = (req.user as any).id;
      if (!await isWorkspaceOwner(currentUserId, parsed.data.workspaceId)) {
        return res.status(403).json({ message: "소유자만 사용자를 추가할 수 있습니다" });
      }
      
      // Check if email already exists
      const existingUser = await storage.getUserByEmail(parsed.data.email);
      if (existingUser) {
        // Check if already a member of this workspace
        const existingMember = await storage.getWorkspaceMember(existingUser.id, parsed.data.workspaceId);
        if (existingMember) {
          return res.status(400).json({ message: "이미 워크스페이스 멤버입니다" });
        }
        // Add existing user to workspace
        await storage.createWorkspaceMember(existingUser.id, parsed.data.workspaceId, parsed.data.role);
        
        // Assign clients if CLIENT role
        if (parsed.data.role === 'CLIENT' && parsed.data.clientIds?.length) {
          for (const clientId of parsed.data.clientIds) {
            await storage.createClientUserAssignment({
              clientId,
              userId: existingUser.id,
              workspaceId: parsed.data.workspaceId,
            });
          }
        }
        return res.status(201).json(existingUser);
      }
      
      // Create new user with hashed password
      const hashedPassword = await bcrypt.hash(parsed.data.password, 10);
      const newUser = await storage.createUser({
        email: parsed.data.email,
        password: hashedPassword,
        name: parsed.data.name,
        isActive: true,
      });
      
      await storage.createWorkspaceMember(newUser.id, parsed.data.workspaceId, parsed.data.role);
      
      // Assign clients if CLIENT role
      if (parsed.data.role === 'CLIENT' && parsed.data.clientIds?.length) {
        for (const clientId of parsed.data.clientIds) {
          await storage.createClientUserAssignment({
            clientId,
            userId: newUser.id,
            workspaceId: parsed.data.workspaceId,
          });
        }
      }
      
      res.status(201).json(newUser);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch('/api/workspace-users/:userId/role', async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const parsed = updateUserRoleSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.errors });
      
      const targetUserId = parseInt(req.params.userId);
      const currentUserId = (req.user as any).id;
      
      if (!await canManageWorkspaceMembers(currentUserId, parsed.data.workspaceId)) {
        return res.status(403).json({ message: "소유자 또는 플랫폼 어드민만 역할을 변경할 수 있습니다" });
      }
      
      await storage.updateWorkspaceMemberRole(targetUserId, parsed.data.workspaceId, parsed.data.role);
      
      // Update client assignments if CLIENT role
      await storage.deleteClientUserAssignmentsByUser(targetUserId, parsed.data.workspaceId);
      if (parsed.data.role === 'CLIENT' && parsed.data.clientIds?.length) {
        for (const clientId of parsed.data.clientIds) {
          await storage.createClientUserAssignment({
            clientId,
            userId: targetUserId,
            workspaceId: parsed.data.workspaceId,
          });
        }
      }
      
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch('/api/workspace-users/:userId/status', async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const { workspaceId, isActive } = req.body;
      const targetUserId = parseInt(req.params.userId);
      const currentUserId = (req.user as any).id;
      
      if (!await canManageWorkspaceMembers(currentUserId, workspaceId)) {
        return res.status(403).json({ message: "소유자 또는 플랫폼 어드민만 사용자 상태를 변경할 수 있습니다" });
      }
      
      const updated = await storage.updateUser(targetUserId, { isActive });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete('/api/workspace-users/:userId', async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const { workspaceId } = req.body;
      const targetUserId = parseInt(req.params.userId);
      const currentUserId = (req.user as any).id;

      const currentMember = await storage.getWorkspaceMember(currentUserId, workspaceId);
      if (!currentMember || currentMember.role !== 'WORKSPACE_OWNER') {
        return res.status(403).json({ message: "워크스페이스 소유자만 사용자를 삭제할 수 있습니다" });
      }

      if (targetUserId === currentUserId) {
        return res.status(400).json({ message: "자기 자신을 삭제할 수 없습니다" });
      }

      await storage.deleteWorkspaceMember(targetUserId, workspaceId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Get current user's role and assigned clients in workspace
  app.get('/api/workspace-users/me', async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const { workspaceId } = req.query;
      if (!workspaceId) return res.status(400).json({ message: "workspaceId required" });
      
      const userId = (req.user as any).id;
      const member = await storage.getWorkspaceMember(userId, parseInt(workspaceId as string));
      if (!member) return res.status(404).json({ message: "워크스페이스 멤버가 아닙니다" });
      
      const assignments = await storage.getUserClientAssignments(userId, parseInt(workspaceId as string));
      const clientIds = assignments.map(a => a.clientId);
      
      res.json({
        userId,
        role: member.role,
        assignedClientIds: clientIds,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === CLIENT-USER ASSIGNMENTS ===
  app.get('/api/client-user-assignments', async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const { workspaceId } = req.query;
      if (!workspaceId) return res.status(400).json({ message: "workspaceId required" });
      
      const assignments = await storage.getClientUserAssignments(parseInt(workspaceId as string));
      res.json(assignments);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/client-user-assignments', async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const { clientId, userId, workspaceId } = req.body;
      
      const currentUserId = (req.user as any).id;
      if (!await isWorkspaceOwner(currentUserId, workspaceId)) {
        return res.status(403).json({ message: "소유자만 클라이언트 할당을 변경할 수 있습니다" });
      }
      
      const assignment = await storage.createClientUserAssignment({ clientId, userId, workspaceId });
      res.status(201).json(assignment);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete('/api/client-user-assignments/:id', async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const { workspaceId } = req.body;
      
      const currentUserId = (req.user as any).id;
      if (!await isWorkspaceOwner(currentUserId, workspaceId)) {
        return res.status(403).json({ message: "소유자만 클라이언트 할당을 변경할 수 있습니다" });
      }
      
      await storage.deleteClientUserAssignment(parseInt(req.params.id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === CONTENT SUBMISSION ROUTES (인플루언서 콘텐츠 제출) ===
  
  // Public: 캠페인 정보 조회 (제출 페이지용)
  app.get('/api/submit/:campaignId/info', async (req, res) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        return res.status(404).json({ message: "캠페인을 찾을 수 없습니다" });
      }
      res.json({
        id: campaign.id,
        name: campaign.name,
        clientName: campaign.clientName,
        status: campaign.status
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Public: 이메일로 인플루언서 검증
  app.post('/api/submit/:campaignId/verify', async (req, res) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ message: "이메일을 입력해주세요" });
      }
      
      const result = await storage.findInfluencerByEmailInCampaign(campaignId, email.toLowerCase().trim());
      if (!result) {
        return res.status(404).json({ message: "등록되지 않은 이메일입니다. 담당자에게 문의해주세요." });
      }
      
      const inf = result.influencer;
      const maskValue = (val: string | null | undefined, visibleEnd = 4) => {
        if (!val) return '';
        if (val.length <= visibleEnd) return val;
        return '*'.repeat(val.length - visibleEnd) + val.slice(-visibleEnd);
      };
      res.json({
        influencerId: inf.id,
        influencerName: inf.name,
        lineItemId: result.lineItem.id,
        settlementInfo: {
          bankName: inf.bankName || '',
          accountHolder: inf.accountHolder || '',
          accountNumber: maskValue(inf.accountNumber),
          settlementType: inf.settlementType || '',
          businessName: inf.businessName || '',
          businessRegNo: maskValue(inf.businessRegNo),
          freelancerId: maskValue(inf.freelancerId),
        },
        hasSettlementInfo: !!(inf.bankName && inf.accountHolder && inf.accountNumber && inf.settlementType && inf.businessName && (inf.settlementType === '프리랜서' ? inf.freelancerId : inf.businessRegNo)),
        settlementConfirmed: !!result.lineItem.settlementConfirmedAt,
        postUrl: result.lineItem.postUrl || '',
        metaPartnershipCode: result.lineItem.metaPartnershipCode || '',
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Public: 정산정보 저장
  app.post('/api/submit/:campaignId/settlement', async (req, res) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      const { email, bankName, accountHolder, accountNumber, settlementType, businessName, businessRegNo, freelancerId } = req.body;

      if (!email) {
        return res.status(400).json({ message: "이메일이 필요합니다" });
      }

      if (!bankName || !accountHolder || !accountNumber || !settlementType || !businessName) {
        return res.status(400).json({ message: "필수 항목을 모두 입력해주세요" });
      }

      if (!['사업자', '프리랜서'].includes(settlementType)) {
        return res.status(400).json({ message: "정산유형이 올바르지 않습니다" });
      }

      if (!/^\d+$/.test(accountNumber)) {
        return res.status(400).json({ message: "계좌번호는 숫자만 입력해주세요" });
      }

      if (settlementType === '프리랜서') {
        if (!freelancerId || !/^\d{6}-\d{7}$/.test(freelancerId)) {
          return res.status(400).json({ message: "주민등록번호 형식이 올바르지 않습니다 (000000-0000000)" });
        }
      }

      if (settlementType === '사업자') {
        if (!businessRegNo || !/^\d{3}-\d{2}-\d{5}$/.test(businessRegNo)) {
          return res.status(400).json({ message: "사업자등록번호 형식이 올바르지 않습니다 (000-00-00000)" });
        }
      }

      const result = await storage.findInfluencerByEmailInCampaign(campaignId, email.toLowerCase().trim());
      if (!result) {
        return res.status(403).json({ message: "이 캠페인에 등록된 이메일이 아닙니다" });
      }

      const updateData: any = {
        bankName,
        accountHolder,
        accountNumber,
        settlementType,
        businessName,
        settlementInfoUpdatedAt: new Date(),
      };

      if (settlementType === '프리랜서') {
        updateData.freelancerId = freelancerId;
        updateData.businessRegNo = null;
      } else if (settlementType === '사업자') {
        updateData.businessRegNo = businessRegNo;
        updateData.freelancerId = null;
      }

      await db.update(influencers).set(updateData).where(eq(influencers.id, result.influencer.id));
      await db.update(campaignInfluencers).set({ settlementConfirmedAt: new Date() }).where(eq(campaignInfluencers.id, result.lineItem.id));

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Public: OneDrive 업로드 세션 생성
  app.post('/api/submit/:campaignId/upload-session', async (req, res) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      const { email, fileName, submissionType } = req.body;
      
      if (!email) {
        return res.status(400).json({ message: "이메일이 필요합니다" });
      }
      
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        return res.status(404).json({ message: "캠페인을 찾을 수 없습니다" });
      }
      
      // 이메일로 인플루언서/라인아이템 재검증
      const lineItems = await db.select({
        lineItem: campaignInfluencers,
        influencer: influencers
      })
        .from(campaignInfluencers)
        .innerJoin(influencers, eq(campaignInfluencers.influencerId, influencers.id))
        .where(and(
          eq(campaignInfluencers.campaignId, campaignId),
          or(
            eq(influencers.email, email.toLowerCase().trim()),
            eq(influencers.contactPoint, email.toLowerCase().trim())
          )
        ));
      
      if (lineItems.length === 0) {
        return res.status(403).json({ message: "이 캠페인에 등록된 이메일이 아닙니다" });
      }
      
      const { lineItem, influencer } = lineItems[0];
      
      const { createFolderIfNotExists, createUploadSession } = await import('./onedrive');
      
      // 폴더 경로: 콘텐츠제출/캠페인명/인플루언서명
      const sanitizedCampaignName = campaign.name.replace(/[<>:"/\\|?*]/g, '_');
      const sanitizedInfluencerName = influencer.name.replace(/[<>:"/\\|?*]/g, '_');
      const folderPath = `콘텐츠제출/${sanitizedCampaignName}/${sanitizedInfluencerName}`;
      
      const folderId = await createFolderIfNotExists(folderPath);
      
      // 파일명에 타입과 타임스탬프 추가
      const timestamp = new Date().toISOString().split('T')[0];
      const typePrefix = submissionType === 'draft' ? '초안' : '완성본';
      const ext = fileName.split('.').pop() || '';
      const baseName = fileName.replace(`.${ext}`, '');
      const finalFileName = `${typePrefix}_${timestamp}_${baseName}.${ext}`;
      
      const session = await createUploadSession(folderId, finalFileName);
      
      res.json({
        uploadUrl: session.uploadUrl,
        expirationDateTime: session.expirationDateTime,
        folderId,
        finalFileName,
        influencerId: influencer.id,
        lineItemId: lineItem.id,
        influencerName: influencer.name
      });
    } catch (err: any) {
      console.error('Upload session error:', err);
      res.status(500).json({ message: err.message || "업로드 세션 생성 실패" });
    }
  });

  // Public: 제출 완료 기록
  app.post('/api/submit/:campaignId/complete', async (req, res) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      const { email, submissionType, fileName, fileSize, folderId, fileId, memo } = req.body;
      
      if (!email) {
        return res.status(400).json({ message: "이메일이 필요합니다" });
      }
      
      // 이메일로 인플루언서/라인아이템 재검증
      const verifyResult = await db.select({
        lineItem: campaignInfluencers,
        influencer: influencers
      })
        .from(campaignInfluencers)
        .innerJoin(influencers, eq(campaignInfluencers.influencerId, influencers.id))
        .where(and(
          eq(campaignInfluencers.campaignId, campaignId),
          or(
            eq(influencers.email, email.toLowerCase().trim()),
            eq(influencers.contactPoint, email.toLowerCase().trim())
          )
        ));
      
      if (verifyResult.length === 0) {
        return res.status(403).json({ message: "이 캠페인에 등록된 이메일이 아닙니다" });
      }
      
      const { lineItem, influencer } = verifyResult[0];
      
      // OneDrive 파일 링크 생성 및 초안/완성본 링크 자동 업데이트
      let oneDriveLink: string | null = null;
      if (fileId) {
        try {
          const { getFileLink } = await import('./onedrive');
          oneDriveLink = await getFileLink(fileId);
          
          // 초안이면 draftUrl, 완성본이면 finalUrl 업데이트
          if (submissionType === 'draft') {
            await db.update(campaignInfluencers)
              .set({ draftUrl: oneDriveLink, draftFileId: fileId })
              .where(eq(campaignInfluencers.id, lineItem.id));
          } else {
            await db.update(campaignInfluencers)
              .set({ finalUrl: oneDriveLink, finalFileId: fileId })
              .where(eq(campaignInfluencers.id, lineItem.id));
          }
        } catch (linkErr) {
          console.error('Failed to generate OneDrive link:', linkErr);
        }
      }
      
      const submission = await storage.createContentSubmission({
        campaignId,
        lineItemId: lineItem.id,
        influencerId: influencer.id,
        submissionType,
        fileName,
        fileSize,
        oneDriveFolderId: folderId,
        oneDriveFileId: fileId,
        oneDriveLink,
        memo
      });
      
      // 담당자에게 이메일 알림 발송
      try {
        const campaign = await storage.getCampaign(campaignId);
        
        if (campaign) {
          // 타임라인 이벤트 생성
          await storage.createTimelineEvent({
            workspaceId: campaign.workspaceId,
            influencerId: influencer.id,
            campaignId,
            lineItemId: lineItem.id,
            eventType: 'content_submitted',
            title: `${submissionType === 'draft' ? '초안' : '완성본'} 제출`,
            description: `${influencer.name}님이 ${fileName}을 제출했습니다`,
            metadata: { submissionId: submission.id, fileName, fileSize, oneDriveLink }
          });
        }
        
        await storage.updateContentSubmission(submission.id, { notifiedAt: new Date() });
      } catch (notifyErr) {
        console.error('Failed to send notification:', notifyErr);
      }
      
      res.json({ success: true, submissionId: submission.id, oneDriveLink });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Authenticated: 캠페인별 제출 이력 조회 (미조회 건수 포함)
  app.get('/api/campaigns/:id/submissions', async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const campaignId = parseInt(req.params.id);
      const submissions = await storage.getContentSubmissions(campaignId);
      
      const result = await Promise.all(submissions.map(async (sub) => {
        const influencer = await storage.getInfluencer(sub.influencerId);
        return {
          id: sub.id,
          campaignId: sub.campaignId,
          lineItemId: sub.lineItemId,
          influencerId: sub.influencerId,
          influencerName: influencer?.name || '알 수 없음',
          submissionType: sub.submissionType,
          fileName: sub.fileName,
          fileSize: sub.fileSize,
          oneDriveFileId: sub.oneDriveFileId,
          oneDriveLink: sub.oneDriveLink,
          memo: sub.memo,
          submittedAt: sub.submittedAt,
          reviewedAt: sub.reviewedAt,
          reviewedByUserId: sub.reviewedByUserId,
        };
      }));
      
      // 라인아이템별 미조회 건수 계산
      const unreviewedByLineItem: Record<number, number> = {};
      for (const sub of result) {
        if (!sub.reviewedAt) {
          unreviewedByLineItem[sub.lineItemId] = (unreviewedByLineItem[sub.lineItemId] || 0) + 1;
        }
      }
      
      res.json({ submissions: result, unreviewedByLineItem });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Authenticated: 특정 인플루언서의 제출 이력 조회 완료 마킹
  app.post('/api/campaigns/:id/submissions/mark-reviewed', async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const user = req.user as any;
      const campaignId = parseInt(req.params.id);
      const { lineItemId } = req.body;
      
      if (!lineItemId) return res.status(400).json({ message: "lineItemId is required" });
      
      await db.update(contentSubmissions)
        .set({ reviewedAt: new Date(), reviewedByUserId: user.id })
        .where(
          and(
            eq(contentSubmissions.campaignId, campaignId),
            eq(contentSubmissions.lineItemId, lineItemId),
            isNull(contentSubmissions.reviewedAt)
          )
        );
      
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Public: 게시물 URL 및 Meta 파트너십 코드 저장 (이메일 기반)
  app.post('/api/submit/:campaignId/post-info', async (req, res) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      const { email, postUrl, metaPartnershipCode } = req.body;
      if (!email) return res.status(400).json({ message: "이메일을 입력해주세요" });

      const result = await storage.findInfluencerByEmailInCampaign(campaignId, email.toLowerCase().trim());
      if (!result) return res.status(404).json({ message: "캠페인 참여 정보를 찾을 수 없습니다" });

      const updates: any = {};
      if (postUrl !== undefined) updates.postUrl = postUrl || null;
      if (metaPartnershipCode !== undefined) updates.metaPartnershipCode = metaPartnershipCode || null;

      await db.update(campaignInfluencers)
        .set(updates)
        .where(eq(campaignInfluencers.id, result.lineItem.id));

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Public: 인플루언서 본인의 제출 이력 조회 (이메일 기반)
  app.post('/api/submit/:campaignId/history', async (req, res) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "이메일을 입력해주세요" });
      
      const result = await storage.findInfluencerByEmailInCampaign(campaignId, email.toLowerCase().trim());
      if (!result) return res.json([]);
      
      const subs = await db.select().from(contentSubmissions)
        .where(
          and(
            eq(contentSubmissions.campaignId, campaignId),
            eq(contentSubmissions.influencerId, result.influencer.id)
          )
        )
        .orderBy(desc(contentSubmissions.submittedAt));
      
      res.json(subs.map(s => ({
        id: s.id,
        submissionType: s.submissionType,
        fileName: s.fileName,
        fileSize: s.fileSize,
        memo: s.memo,
        submittedAt: s.submittedAt,
        oneDriveLink: s.oneDriveLink,
      })));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/admin/backfill-conversations', async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const adminUser = req.user as any;
      if (!adminUser.isPlatformAdmin) return res.status(403).json({ message: "Admin only" });

      const allConvs = await db.select().from(conversations);
      let nullified = 0;
      let recalculated = 0;

      for (const conv of allConvs) {
        const msgs = await db.select().from(conversationMessages)
          .where(eq(conversationMessages.conversationId, conv.id))
          .orderBy(desc(conversationMessages.createdAt));

        if (msgs.length === 0) {
          if (conv.lastMessageAt) {
            await db.update(conversations).set({ lastMessageAt: null }).where(eq(conversations.id, conv.id));
            nullified++;
          }
        } else {
          const latestDate = msgs[0].sentAt || msgs[0].createdAt;
          if (latestDate) {
            await db.update(conversations).set({ lastMessageAt: new Date(latestDate) }).where(eq(conversations.id, conv.id));
            recalculated++;
          }
        }
      }

      res.json({ total: allConvs.length, nullified, recalculated });
    } catch (err: any) {
      console.error('Backfill conversations error:', err);
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/influencer-accounts/:id/refresh-profile-image', async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const user = req.user as any;
      const accountId = parseInt(req.params.id);
      const [account] = await db.select().from(influencerAccounts).where(eq(influencerAccounts.id, accountId));
      if (!account) return res.status(404).json({ message: "Account not found" });

      const [inf] = await db.select().from(influencers).where(eq(influencers.id, account.influencerId));
      if (!inf) return res.status(404).json({ message: "Influencer not found" });
      const membership = await storage.getWorkspaceMember(inf.workspaceId, user.id);
      if (!membership) return res.status(403).json({ message: "Forbidden" });

      const result = await fetchProfileImage(account.platform, account.handle);
      if (result) {
        const proxyUrl = `/api/profile-image/${result.fileId}`;
        await db.update(influencerAccounts).set({ profileImageUrl: proxyUrl, profileImageFileId: result.fileId }).where(eq(influencerAccounts.id, accountId));
        res.json({ success: true, profileImageUrl: proxyUrl });
      } else {
        res.json({ success: false, message: "Could not fetch profile image" });
      }
    } catch (err: any) {
      console.error('Refresh profile image error:', err);
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/workspaces/:workspaceId/influencers/refresh-all-profile-images', async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const user = req.user as any;
      const workspaceId = parseInt(req.params.workspaceId);
      const membership = await storage.getWorkspaceMember(workspaceId, user.id);
      if (!membership) return res.status(403).json({ message: "Forbidden" });
      
      const allInfluencers = await db.select().from(influencers).where(eq(influencers.workspaceId, workspaceId));
      const inflIds = allInfluencers.map(i => i.id);
      if (inflIds.length === 0) return res.json({ total: 0, updated: 0 });

      const accounts = await db.select().from(influencerAccounts).where(
        and(
          inArray(influencerAccounts.influencerId, inflIds),
          or(eq(influencerAccounts.platform, 'IG'), eq(influencerAccounts.platform, 'YT'))
        )
      );

      const toFetch = accounts.filter(a => !a.profileImageUrl);
      let updated = 0;

      const BATCH_SIZE = 5;
      for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
        const batch = toFetch.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(async (acc) => {
            const result = await fetchProfileImage(acc.platform, acc.handle);
            if (result) {
              const proxyUrl = `/api/profile-image/${result.fileId}`;
              await db.update(influencerAccounts).set({ profileImageUrl: proxyUrl, profileImageFileId: result.fileId }).where(eq(influencerAccounts.id, acc.id));
              return true;
            }
            return false;
          })
        );
        updated += results.filter(r => r.status === 'fulfilled' && r.value).length;
      }

      res.json({ total: accounts.length, needsFetch: toFetch.length, updated });
    } catch (err: any) {
      console.error('Refresh all profile images error:', err);
      res.status(500).json({ message: err.message });
    }
  });

  app.get('/api/profile-image/:fileId', async (req, res) => {
    try {
      const { fileId } = req.params;
      if (!fileId) return res.status(400).json({ message: "Missing fileId" });

      const downloadUrl = await getDirectDownloadUrl(fileId);
      if (!downloadUrl) return res.status(404).json({ message: "Image not found" });

      res.set('Cache-Control', 'public, max-age=31536000, immutable');
      res.set('ETag', `"${fileId}"`);

      const ifNoneMatch = req.headers['if-none-match'];
      if (ifNoneMatch === `"${fileId}"`) {
        return res.status(304).end();
      }

      res.redirect(301, downloadUrl);
    } catch (err: any) {
      console.error('Profile image proxy error:', err.message);
      res.status(500).json({ message: "Failed to serve image" });
    }
  });

  app.post('/api/admin/migrate-instagram-urls', async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const user = req.user as any;
      if (!user.isPlatformAdmin) return res.status(403).json({ message: "Admin only" });

      const allAccounts = await db.select().from(influencerAccounts).where(
        or(eq(influencerAccounts.platform, 'IG'), eq(influencerAccounts.platform, 'Instagram'))
      );
      let cleaned = 0;
      let skipped = 0;
      let rejected = 0;
      const details: string[] = [];

      for (const acc of allAccounts) {
        const rawHandle = acc.handle || '';
        const rawUrl = acc.url || '';
        
        const inputForNormalization = rawHandle || rawUrl;
        if (!inputForNormalization) { skipped++; continue; }

        const normalizedHandle = normalizeInstagramHandle(inputForNormalization);
        if (normalizedHandle === null) {
          rejected++;
          details.push(`ID ${acc.id}: rejected (content URL or invalid) - handle: "${rawHandle}", url: "${rawUrl}"`);
          continue;
        }

        const normalizedUrl = normalizeInstagramUrl(normalizedHandle);
        const needsPlatformFix = acc.platform !== 'IG';
        if (normalizedHandle !== rawHandle || normalizedUrl !== rawUrl || needsPlatformFix) {
          await db.update(influencerAccounts)
            .set({ platform: 'IG', handle: normalizedHandle, url: normalizedUrl })
            .where(eq(influencerAccounts.id, acc.id));
          cleaned++;
          details.push(`ID ${acc.id}: "${rawHandle}" -> "${normalizedHandle}"`);
        } else {
          skipped++;
        }
      }

      res.json({ total: allAccounts.length, cleaned, skipped, rejected, details });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // SEED DATA
  seedDatabase();

  // Backfill lastMessageAt for conversations where it's missing or stale
  backfillLastMessageAt();

  return httpServer;
}

async function backfillLastMessageAt() {
  try {
    await db.execute(sql`
      UPDATE conversations c
      SET last_message_at = sub.actual_last
      FROM (
        SELECT cm.conversation_id, GREATEST(MAX(cm.sent_at), MAX(cm.received_at)) as actual_last
        FROM conversation_messages cm
        GROUP BY cm.conversation_id
      ) sub
      WHERE c.id = sub.conversation_id
        AND sub.actual_last IS NOT NULL
        AND (c.last_message_at IS NULL OR c.last_message_at != sub.actual_last)
    `);
    console.log('Backfill lastMessageAt completed');
  } catch (err) {
    console.error('Backfill lastMessageAt error:', err);
  }
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

    // Set demo user as workspace owner
    await storage.createWorkspaceMember(user.id, ws.id, 'WORKSPACE_OWNER');

    // Create 10 influencers with varied data
    const platforms = ["IG", "YT", "TikTok"];
    const categories = ["뷰티", "패션", "라이프스타일", "푸드", "여행"];
    const tagSets = [
      ["패션", "뷰티"], 
      ["라이프스타일", "브이로그"], 
      ["푸드", "레시피"],
      ["여행", "사진"],
      ["뷰티", "스킨케어"]
    ];
    
    const influencerIds: number[] = [];
    for (let i = 1; i <= 10; i++) {
      const platformIdx = i % platforms.length;
      const inf = await storage.createInfluencer(ws.id, {
        name: `인플루언서 ${i}`,
        email: `influencer${i}@example.com`,
        phone: `010-1234-567${i}`,
        tags: tagSets[i % tagSets.length],
        memo: i <= 3 ? `메모: VIP 인플루언서 #${i}` : null,
        accounts: [
          { 
            platform: platforms[platformIdx], 
            handle: `@influencer_${i}`, 
            url: `https://${platforms[platformIdx].toLowerCase()}.com/influencer_${i}`,
            category: categories[i % categories.length],
            language: 'ko',
            verified: i <= 5
          }
        ]
      });
      influencerIds.push(inf.id);

      // Add sample content for first 5 influencers
      if (i <= 5) {
        await storage.createContent({
          influencerId: inf.id,
          link: `https://instagram.com/p/sample${i}`,
          thumbnail: `https://picsum.photos/seed/${i}/300/300`,
          publishedAt: new Date(Date.now() - i * 86400000),
          metrics: { views: 10000 + i * 1000, likes: 500 + i * 100, comments: 20 + i * 5 }
        });
      }
    }

    // Create 2 groups with members
    const group1 = await storage.createGroup(ws.id, {
      name: "뷰티 인플루언서",
      description: "뷰티/스킨케어 전문 인플루언서 그룹"
    });
    await storage.addInfluencersToGroup(group1.id, [influencerIds[0], influencerIds[1], influencerIds[4]]);

    const group2 = await storage.createGroup(ws.id, {
      name: "라이프스타일 크리에이터",
      description: "라이프스타일/브이로그 크리에이터"
    });
    await storage.addInfluencersToGroup(group2.id, [influencerIds[2], influencerIds[3]]);

    // Create 1 Campaign with 3 line items
    const camp = await storage.createCampaign(ws.id, {
      name: "서머 런칭 2025",
      client: "Acme 코퍼레이션",
      goal: "브랜드 인지도 향상",
      budget: 5000000,
      status: "active"
    });

    // Add influencers to campaign with varied statuses
    const items = await storage.addInfluencersToCampaign(camp.id, [influencerIds[0], influencerIds[1], influencerIds[2]]);
    
    // Update items with different statuses
    if (items[0]) await storage.updateCampaignItem(items[0].id, { status: 'contracted', contractStatus: 'signed', paymentStatus: 'pending', offerFee: 500000 });
    if (items[1]) await storage.updateCampaignItem(items[1].id, { status: 'contracted', contractStatus: 'signed', paymentStatus: 'paid', offerFee: 750000 });
    if (items[2]) await storage.updateCampaignItem(items[2].id, { status: 'contacted', contractStatus: 'pending', paymentStatus: 'pending', offerFee: 300000 });

    // Create tracking job
    await storage.createTrackingJob(ws.id, {
      name: "#서머런칭2025",
      targetType: "keyword",
      keywords: { include: ["서머런칭", "Acme"], exclude: [] },
      status: "active"
    });

    // Create default email account (Naver)
    const defaultEmailPassword = process.env.DEFAULT_EMAIL_PASSWORD;
    if (defaultEmailPassword) {
      const crypto = await import('crypto');
      const encryptionKey = process.env.ENCRYPTION_KEY || 'default-encryption-key-32bytes!';
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(encryptionKey.padEnd(32, '0').slice(0, 32)), iv);
      let encrypted = cipher.update(defaultEmailPassword, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const encryptedPassword = iv.toString('hex') + ':' + encrypted;

      await storage.createEmailAccount(demoUser.id, ws.id, {
        email: 'jaff77@naver.com',
        provider: 'naver',
        imapHost: 'imap.naver.com',
        imapPort: 993,
        smtpHost: 'smtp.naver.com',
        smtpPort: 587,
        imapPassword: encryptedPassword
      });
    }
  }
}
