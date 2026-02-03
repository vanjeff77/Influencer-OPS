import type { Express } from "express";
import { createServer, type Server } from "http";
import crypto from "crypto";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { campaignInfluencers, campaigns, users, workspaceMembers } from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";

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

// Preflight check for Puppeteer at startup - uses actual getSharedBrowser for consistency
(async function preflightPuppeteerCheck() {
  // Skip preflight if font errors already detected
  if (pdfServiceError) {
    console.log('[PDF] Skipping preflight - service already disabled due to font issues.');
    return;
  }
  
  try {
    const puppeteer = await import('puppeteer');
    sharedBrowser = await puppeteer.default.launch({
      headless: true,
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

  app.get(api.auth.me.path, (req, res) => {
    if (!req.isAuthenticated()) return res.json(null);
    const user = req.user as any;
    res.json({ id: user.id, email: user.email, name: user.name });
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

        // Generate URL based on platform and handle
        const generateUrl = (platform: string, handle: string): string => {
          if (!handle) return '';
          const cleanHandle = handle.replace(/^@/, '');
          const platformLower = platform.toLowerCase();
          switch (platformLower) {
            case 'ig': 
            case 'instagram': return `https://instagram.com/${cleanHandle}`;
            case 'yt':
            case 'youtube': return `https://youtube.com/@${cleanHandle}`;
            case 'tiktok': return `https://tiktok.com/@${cleanHandle}`;
            case 'x': return `https://x.com/${cleanHandle}`;
            case 'blog': return `https://blog.naver.com/${cleanHandle}`;
            default: return `https://${platformLower}.com/${cleanHandle}`;
          }
        };

        // Check if platform is provided (handle is optional now)
        const hasPlatform = item.platform?.trim();
        const hasHandle = item.handle?.trim();
        const normalizedPlatform = hasPlatform ? normalizePlatform(item.platform) : '';
        
        // Check for duplicates only if both handle and platform are provided
        if (hasPlatform && hasHandle) {
          const handleKey = `${normalizedPlatform.toLowerCase()}:${item.handle.toLowerCase().replace(/^@/, '')}`;
          if (existingHandles.has(handleKey)) {
            results.push({ index: i, status: 'failed', reason: `이미 존재하는 계정입니다 (${normalizedPlatform}: ${item.handle})` });
            failedCount++;
            continue;
          }
        }

        // Build accounts array if platform is provided (handle is optional)
        const accounts = hasPlatform ? [{
          platform: normalizedPlatform,
          handle: hasHandle ? item.handle.replace(/^@/, '') : '',
          url: hasHandle ? generateUrl(normalizedPlatform, item.handle) : '',
          followers: item.followers || undefined,
        }] : [];

        // Create influencer
        const inf = await storage.createInfluencer(wId, {
          name: item.nickname.trim(),
          email: item.contactPoint?.includes('@') ? item.contactPoint : undefined,
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
          const handleKey = `${normalizedPlatform.toLowerCase()}:${item.handle.toLowerCase().replace(/^@/, '')}`;
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
      
      // Check if influencer is assigned to any active (진행중) campaigns
      const activeCampaignAssignments = await db.select({
        campaignName: campaigns.name
      })
        .from(campaignInfluencers)
        .innerJoin(campaigns, eq(campaignInfluencers.campaignId, campaigns.id))
        .where(and(
          eq(campaignInfluencers.influencerId, id),
          eq(campaigns.status, '진행중')
        ));
      
      if (activeCampaignAssignments.length > 0) {
        const campaignNames = activeCampaignAssignments.map(a => a.campaignName).join(', ');
        return res.status(400).json({ 
          message: `진행 중인 캠페인에 배정된 인플루언서는 삭제할 수 없습니다. (${campaignNames})` 
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
      
      // Check if any influencers are assigned to active campaigns
      const activeCampaignAssignments = await db.select({
        influencerId: campaignInfluencers.influencerId,
        campaignName: campaigns.name
      })
        .from(campaignInfluencers)
        .innerJoin(campaigns, eq(campaignInfluencers.campaignId, campaigns.id))
        .where(and(
          inArray(campaignInfluencers.influencerId, ids),
          eq(campaigns.status, '진행중')
        ));
      
      if (activeCampaignAssignments.length > 0) {
        const blockedIds = Array.from(new Set(activeCampaignAssignments.map(a => a.influencerId)));
        const campaignNames = Array.from(new Set(activeCampaignAssignments.map(a => a.campaignName))).join(', ');
        return res.status(400).json({ 
          message: `진행 중인 캠페인에 배정된 인플루언서 ${blockedIds.length}명은 삭제할 수 없습니다. (${campaignNames})` 
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
          results.errors.push({ row: rowIdx + 1, reason: '필수 키(닉네임, 플랫폼 계정, 채널 URL) 없음' });
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
            pendingTotal: filteredItems.filter(i => i.paymentStatus !== 'paid').reduce((sum, i) => sum + (i.payAmount || 0), 0),
            paidThisMonth: filteredItems.filter(i => i.paymentStatus === 'paid').reduce((sum, i) => sum + (i.payAmount || 0), 0),
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
        payoutStatus: '지급완료',
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
        if (item.paymentStatus === 'pending' && item.payAmount && item.payAmount > 0 && item.stage === '완료') {
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
      
      // Create new email account with encrypted password for this user
      const imapSettings = JSON.stringify({ imapServer, imapPort, smtpServer, smtpPort });
      const encryptedPassword = encryptPassword(password);
      const account = await storage.createEmailAccount(userId, workspaceId, {
        email,
        provider: 'imap',
        accessToken: imapSettings,
        refreshToken: encryptedPassword,
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
      if (account.provider === 'imap' && account.accessToken) {
        const { fetchEmails, decryptPassword } = await import('./imap');
        
        const settings = JSON.parse(account.accessToken);
        const password = decryptPassword(account.refreshToken || '');
        
        const imapConfig = {
          user: account.email,
          password: password,
          host: settings.imapServer,
          port: parseInt(settings.imapPort) || 993,
          tls: true,
        };
        
        console.log('Connecting to IMAP server:', settings.imapServer, 'for', account.email);
        
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
      }));
      res.json(safeAccounts);
    } catch (err: any) {
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
      
      if (account.provider === 'imap' && account.accessToken) {
        const { searchThreads, decryptPassword } = await import('./imap');
        
        const settings = JSON.parse(account.accessToken);
        const password = decryptPassword(account.refreshToken || '');
        
        const imapConfig = {
          user: account.email,
          password: password,
          host: settings.imapServer,
          port: parseInt(settings.imapPort) || 993,
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
      
      if (account.provider === 'imap' && account.accessToken) {
        const { fetchThreadMessages, decryptPassword } = await import('./imap');
        
        const settings = JSON.parse(account.accessToken);
        const password = decryptPassword(account.refreshToken || '');
        
        const imapConfig = {
          user: account.email,
          password: password,
          host: settings.imapServer,
          port: parseInt(settings.imapPort) || 993,
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
    const conv = await storage.updateConversation(parseInt(req.params.id), req.body);
    res.json(conv);
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
      
      // Parse CC emails from request (can be array or comma-separated string)
      const ccEmails: string[] = cc 
        ? (Array.isArray(cc) ? cc : cc.split(',').map((e: string) => e.trim()).filter(Boolean))
        : [];
      
      let gmailMessageId: string | undefined;
      let gmailThreadId: string | undefined;
      let sendStatus = 'sent';
      
      try {
        const { sendEmail, generateSnippet } = await import('./gmail');
        const finalSubject = conv.subjectPrefix ? `${conv.subjectPrefix} ${subject || ''}`.trim() : subject;
        const result = await sendEmail(toEmail, finalSubject, body, conv.gmailThreadId || undefined, ccEmails);
        gmailMessageId = result.id || undefined;
        gmailThreadId = result.threadId || undefined;
        
        // Update conversation with Gmail thread ID if first message
        if (!conv.gmailThreadId && gmailThreadId) {
          await storage.updateConversation(conversationId, { gmailThreadId });
        }
      } catch (gmailErr) {
        console.error('Gmail send failed:', gmailErr);
        sendStatus = 'failed';
      }
      
      const { generateSnippet } = await import('./gmail');
      const snippet = generateSnippet(body);
      
      const message = await storage.createConversationMessage({
        conversationId,
        direction: 'outbound',
        senderEmail: account?.email || null,
        senderName: null,
        recipientEmail: toEmail,
        ccEmails: ccEmails.length > 0 ? ccEmails : null,
        snippet,
        bodyHtml: body,
        bodyText: body.replace(/<[^>]*>/g, ''),
        gmailMessageId,
        gmailThreadId,
        sendStatus,
        sentAt: new Date()
      });
      
      // Create timeline event
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

  // Sync conversation (fetch new emails from Gmail)
  app.post('/api/conversations/:id/sync', async (req, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      const conv = await storage.getConversation(conversationId);
      if (!conv) return res.status(404).json({ message: "Conversation not found" });
      
      if (!conv.gmailThreadId) {
        return res.json({ synced: 0, message: "아직 Gmail 스레드가 없습니다" });
      }
      
      const { getThread, parseMessageHeaders, getMessageBody, generateSnippet } = await import('./gmail');
      const thread = await getThread(conv.gmailThreadId);
      
      if (!thread.messages) {
        return res.json({ synced: 0 });
      }
      
      // Get existing message IDs to avoid duplicates
      const existingMessages = await storage.getConversationMessages(conversationId);
      const existingGmailIds = new Set(existingMessages.map(m => m.gmailMessageId).filter(Boolean));
      
      // Also track by snippet to avoid duplicates when gmailMessageId is missing
      const existingSnippets = new Set(existingMessages.map(m => m.snippet?.slice(0, 50)).filter(Boolean));
      
      let syncedCount = 0;
      const influencer = conv.lineItem.influencer;
      
      for (const msg of thread.messages) {
        // Skip if we already have this Gmail message ID
        if (msg.id && existingGmailIds.has(msg.id)) continue;
        
        const headers = parseMessageHeaders(msg);
        const body = getMessageBody(msg);
        const snippet = generateSnippet(body.text || body.html);
        
        // Skip if we already have a message with similar content (prevents duplicates)
        if (snippet && existingSnippets.has(snippet.slice(0, 50))) continue;
        
        const isInbound = influencer?.email ? headers.from.toLowerCase().includes(influencer.email.toLowerCase()) : false;
        
        if (!isInbound) continue; // Only sync inbound messages
        
        const senderEmailMatch = headers.from.match(/<([^>]+)>/);
        const senderEmail = senderEmailMatch ? senderEmailMatch[1] : headers.from.split(/\s/)[0];
        const senderName = headers.from.replace(/<[^>]+>/, '').trim() || null;
        
        await storage.createConversationMessage({
          conversationId,
          direction: 'inbound',
          senderEmail,
          senderName,
          recipientEmail: headers.to || null,
          ccEmails: headers.ccEmails && headers.ccEmails.length > 0 ? headers.ccEmails : null,
          snippet,
          bodyHtml: body.html,
          bodyText: body.text,
          gmailMessageId: msg.id || null,
          gmailThreadId: msg.threadId || null,
          sendStatus: 'sent',
          receivedAt: new Date(parseInt(msg.internalDate || '0'))
        });
        
        syncedCount++;
        existingSnippets.add(snippet?.slice(0, 50));
        
        // Create timeline event
        if (influencer) {
          await storage.createTimelineEvent({
            workspaceId: influencer.workspaceId,
            influencerId: influencer.id,
            lineItemId: conv.campaignLineItemId,
            eventType: 'email_received',
            title: '이메일 수신',
            description: headers.subject,
            metadata: { conversationId, gmailMessageId: msg.id }
          });
        }
      }
      
      // Update conversation status if got reply
      if (syncedCount > 0) {
        await storage.updateConversation(conversationId, { status: 'replied' });
      }
      
      res.json({ synced: syncedCount });
    } catch (err) {
      console.error('Sync error:', err);
      res.status(500).json({ message: "동기화 실패" });
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
        lastMessageAt: new Date()
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
      const { subject, body, influencerId, campaignId } = req.body;
      const { renderTemplate, validateVariables } = await import('./smtp');
      
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
      const renderedBody = renderTemplate(body, variables);
      
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
      
      const { subject, body, testEmail, emailAccountId, influencerId, campaignId } = req.body;
      const { renderTemplate, createSmtpTransporter, sendEmail } = await import('./smtp');
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
      
      const variables: Record<string, string> = {
        influencer_name: influencer?.name || '[인플루언서 이름]',
        campaign_name: campaign?.name || '[캠페인 이름]',
      };
      
      const renderedSubject = `[테스트] ${renderTemplate(subject, variables)}`;
      const renderedBody = renderTemplate(body, variables);
      
      if (emailAccount.provider === 'imap' && emailAccount.accessToken) {
        const config = JSON.parse(emailAccount.accessToken);
        const decryptedPassword = decryptPassword(config.encryptedPassword);
        
        const transporter = createSmtpTransporter({
          host: config.smtpServer,
          port: parseInt(config.smtpPort) || 587,
          secure: parseInt(config.smtpPort) === 465,
          user: emailAccount.email,
          password: decryptedPassword,
        });
        
        const result = await sendEmail(transporter, {
          from: emailAccount.email,
          to: testEmail,
          subject: renderedSubject,
          html: renderedBody,
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
      const { subject, body, campaignId, lineItemIds } = req.body;
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
        
        if (sentInfluencerIds.has(influencer.id)) {
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
      
      const { subject, body, campaignId, emailAccountId, eligible } = req.body;
      const { renderTemplate, startBulkEmailWorker } = await import('./smtp');
      
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        return res.status(404).json({ message: "캠페인을 찾을 수 없습니다" });
      }
      
      const job = await storage.createBulkEmailJob({
        workspaceId: campaign.workspaceId,
        campaignId,
        emailAccountId,
        templateSubject: subject,
        templateBody: body,
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
        renderedBody: renderTemplate(body, item.variables),
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
      const updates = req.body;
      
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

  // Generate DOCX contract
  app.post(api.contractTemplates.generateDocx.path, async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const templateId = parseInt(req.params.id);
      const { lineItemId, variables } = req.body;

      const template = await storage.getContractTemplate(templateId);
      if (!template) return res.status(404).json({ message: "Template not found" });

      const lineItem = await storage.getLineItemWithDetails(lineItemId);
      if (!lineItem) return res.status(404).json({ message: "Line item not found" });

      const campaign = await storage.getCampaign(lineItem.campaignId);
      
      // Build variables for replacement
      const defaultVariables: Record<string, string> = {
        '인플루언서명': lineItem.influencer?.name || '',
        '캠페인명': campaign?.name || '',
        '금액': (lineItem.offerFee || lineItem.payAmount || 0).toLocaleString() + '원',
        '날짜': new Date().toLocaleDateString('ko-KR'),
        '초안예정일': lineItem.draftDueAt ? new Date(lineItem.draftDueAt).toLocaleDateString('ko-KR') : '',
        '업로드예정일': lineItem.uploadDueAt ? new Date(lineItem.uploadDueAt).toLocaleDateString('ko-KR') : '',
        '클라이언트명': campaign?.client || '',
        '이메일': lineItem.influencer?.email || '',
        '연락처': lineItem.influencer?.phone || lineItem.influencer?.contactPoint || '',
      };

      const allVariables = { ...defaultVariables, ...variables };

      // Replace variables in template content
      let content = template.content;
      for (const [key, value] of Object.entries(allVariables)) {
        content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
      }
      
      // Handle legacy plain-text templates (convert to HTML)
      // Use regex to detect actual HTML tags, not just < or > characters
      const hasHtmlTags = /<\s*[a-zA-Z][^>]*>/.test(content);
      if (!hasHtmlTags) {
        // Escape HTML entities in plain text and wrap each line in <p>
        const escapeHtml = (text: string) => text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        content = content.split('\n').map((line: string) => `<p>${escapeHtml(line)}</p>`).join('');
      }

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
        <body>${content}</body>
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

  // Generate PDF contract
  app.post(api.contractTemplates.generatePdf.path, async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const templateId = parseInt(req.params.id);
      const { lineItemId, variables } = req.body;

      const template = await storage.getContractTemplate(templateId);
      if (!template) return res.status(404).json({ message: "Template not found" });

      const lineItem = await storage.getLineItemWithDetails(lineItemId);
      if (!lineItem) return res.status(404).json({ message: "Line item not found" });

      const campaign = await storage.getCampaign(lineItem.campaignId);
      
      // Build variables for replacement
      const defaultVariables: Record<string, string> = {
        '인플루언서명': lineItem.influencer?.name || '',
        '캠페인명': campaign?.name || '',
        '금액': (lineItem.offerFee || lineItem.payAmount || 0).toLocaleString() + '원',
        '날짜': new Date().toLocaleDateString('ko-KR'),
        '초안예정일': lineItem.draftDueAt ? new Date(lineItem.draftDueAt).toLocaleDateString('ko-KR') : '',
        '업로드예정일': lineItem.uploadDueAt ? new Date(lineItem.uploadDueAt).toLocaleDateString('ko-KR') : '',
        '클라이언트명': campaign?.client || '',
        '이메일': lineItem.influencer?.email || '',
        '연락처': lineItem.influencer?.phone || lineItem.influencer?.contactPoint || '',
      };

      const allVariables = { ...defaultVariables, ...variables };

      // Replace variables in template content
      let content = template.content;
      for (const [key, value] of Object.entries(allVariables)) {
        content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
      }
      
      // Handle legacy plain-text templates (convert to HTML)
      // Use regex to detect actual HTML tags, not just < or > characters
      const hasHtmlTags = /<\s*[a-zA-Z][^>]*>/.test(content);
      if (!hasHtmlTags) {
        // Escape HTML entities in plain text and wrap each line in <p>
        const escapeHtml = (text: string) => text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        content = content.split('\n').map((line: string) => `<p>${escapeHtml(line)}</p>`).join('');
      }

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
  ${content}
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
      console.error('PDF generation error:', err);
      
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
      
      if (!await isWorkspaceOwner(currentUserId, parsed.data.workspaceId)) {
        return res.status(403).json({ message: "소유자만 역할을 변경할 수 있습니다" });
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
      
      if (!await isWorkspaceOwner(currentUserId, workspaceId)) {
        return res.status(403).json({ message: "소유자만 사용자 상태를 변경할 수 있습니다" });
      }
      
      const updated = await storage.updateUser(targetUserId, { isActive });
      res.json(updated);
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

  // SEED DATA
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
    if (items[0]) await storage.updateCampaignItem(items[0].id, { status: 'contracted', contractStatus: 'signed', paymentStatus: 'pending', payAmount: 500000 });
    if (items[1]) await storage.updateCampaignItem(items[1].id, { status: 'posted', contractStatus: 'signed', paymentStatus: 'paid', payAmount: 750000 });
    if (items[2]) await storage.updateCampaignItem(items[2].id, { status: 'negotiated', contractStatus: 'pending', paymentStatus: 'pending', payAmount: 300000 });

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
