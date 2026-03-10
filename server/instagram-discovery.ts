const RAPIDAPI_HOST = 'instagram-scraper2.p.rapidapi.com';
const DEFAULT_MAX_FOLLOWINGS = 500;
const RETRY_MAX = 3;
const RATE_LIMIT_DELAY_MS = 3000;

export interface FollowingUser {
  handle: string;
  fullName?: string;
  profilePicUrl?: string;
  isPrivate?: boolean;
  isVerified?: boolean;
}

export interface ProfileInfo {
  handle: string;
  fullName?: string;
  bio?: string;
  followers: number;
  following: number;
  category?: string;
  profilePicUrl?: string;
  isVerified: boolean;
  isPrivate: boolean;
  externalUrl?: string;
}

export interface AggregatedCandidate {
  handle: string;
  profileData: ProfileInfo;
  sourceSeeds: string[];
}

function getApiKey(): string {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) throw new Error('RAPIDAPI_KEY environment variable is not set');
  return key;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiRequest(endpoint: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`https://${RAPIDAPI_HOST}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'x-rapidapi-key': getApiKey(),
        'x-rapidapi-host': RAPIDAPI_HOST,
      },
      signal: controller.signal,
    });

    const text = await res.text();

    if (!res.ok) {
      throw new Error(`RapidAPI ${res.status}: ${text.substring(0, 200)}`);
    }

    if (text.includes('429') && text.includes('rate limit')) {
      throw new Error(`RapidAPI rate limit: ${text.substring(0, 200)}`);
    }

    try {
      const json = JSON.parse(text);
      if (typeof json === 'string') {
        if (json.includes('429') || json.toLowerCase().includes('rate limit')) {
          throw new Error(`RapidAPI rate limit (wrapped 200): ${json.substring(0, 200)}`);
        }
        throw new Error(`RapidAPI unexpected string response: ${json.substring(0, 200)}`);
      }
      if (json?.message && (json.message.includes('rate limit') || json.message.includes('429'))) {
        throw new Error(`RapidAPI rate limit: ${json.message.substring(0, 200)}`);
      }
      return json;
    } catch (parseErr: any) {
      if (parseErr.message.startsWith('RapidAPI')) throw parseErr;
      throw new Error(`RapidAPI invalid JSON response: ${text.substring(0, 200)}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= RETRY_MAX; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      console.log(`[InstagramDiscovery] ${label} attempt ${attempt}/${RETRY_MAX} failed: ${err.message}`);
      if (attempt < RETRY_MAX) {
        const isRateLimit = err.message?.includes('rate limit') || err.message?.includes('429');
        const waitMs = isRateLimit ? RATE_LIMIT_DELAY_MS * attempt * 3 : RATE_LIMIT_DELAY_MS * attempt;
        console.log(`[InstagramDiscovery] Waiting ${waitMs}ms before retry...`);
        await delay(waitMs);
      }
    }
  }
  throw lastError!;
}

function sanitizeHandle(handle: string): string {
  let clean = handle.replace(/^@/, '').trim();
  clean = clean.replace(/^https?:\/\/(www\.)?instagram\.com\/?/i, '');
  clean = clean.replace(/^@/, '');
  clean = clean.split('/')[0].split('?')[0];
  return clean;
}

function parseProfileFromResponse(data: any, fallbackHandle: string): ProfileInfo {
  const profile = data?.data?.user || data?.data || data?.user || data;

  return {
    handle: profile.username || fallbackHandle,
    fullName: profile.full_name || profile.fullName || '',
    bio: profile.biography || profile.bio || '',
    followers: profile.follower_count || profile.followers || 0,
    following: profile.following_count || profile.following || 0,
    category: profile.category || profile.category_name || '',
    profilePicUrl: profile.profile_pic_url_hd || profile.profile_pic_url || profile.profilePicUrl || '',
    isVerified: profile.is_verified ?? profile.isVerified ?? false,
    isPrivate: profile.is_private ?? profile.isPrivate ?? false,
    externalUrl: profile.external_url || profile.externalUrl || '',
  };
}

function extractUserId(data: any): string | null {
  const candidates = [
    data?.data?.user,
    data?.data,
    data?.user,
    data,
  ];
  for (const obj of candidates) {
    if (!obj || typeof obj !== 'object') continue;
    const id = obj.pk || obj.id || obj.user_id || obj.pk_id;
    if (id) return String(id);
  }
  console.log(`[InstagramDiscovery] Could not find user_id in response:`, JSON.stringify(data).substring(0, 500));
  return null;
}

export async function fetchProfileInfo(handle: string): Promise<ProfileInfo> {
  const cleanHandle = sanitizeHandle(handle);
  if (!cleanHandle) throw new Error('Invalid handle');

  const data = await withRetry(
    () => apiRequest('/user_info', { user_name: cleanHandle }),
    `fetchProfileInfo(@${cleanHandle})`
  );

  return parseProfileFromResponse(data, cleanHandle);
}

async function fetchUserId(handle: string): Promise<string> {
  const cleanHandle = sanitizeHandle(handle);
  if (!cleanHandle) throw new Error('Invalid handle');

  const data = await withRetry(
    () => apiRequest('/user_info', { user_name: cleanHandle }),
    `fetchUserId(@${cleanHandle})`
  );

  const userId = extractUserId(data);
  if (!userId) {
    throw new Error(`Could not extract user_id for @${cleanHandle}`);
  }
  return userId;
}

export async function fetchFollowings(handle: string, maxCount: number = DEFAULT_MAX_FOLLOWINGS): Promise<FollowingUser[]> {
  const cleanHandle = sanitizeHandle(handle);
  if (!cleanHandle) throw new Error('Invalid handle');

  console.log(`[InstagramDiscovery] Fetching followings for @${cleanHandle} (max: ${maxCount})`);

  const userId = await fetchUserId(cleanHandle);
  console.log(`[InstagramDiscovery] Got user_id ${userId} for @${cleanHandle}`);

  const allFollowings: FollowingUser[] = [];
  let nextCursor: string | undefined;

  while (allFollowings.length < maxCount) {
    const params: Record<string, string> = {
      user_id: userId,
      batch_size: '50',
    };
    if (nextCursor) {
      params.next_cursor = nextCursor;
    }

    const data = await withRetry(
      () => apiRequest('/following', params),
      `fetchFollowings(@${cleanHandle})`
    );

    const items = data?.data?.items || data?.items || data?.data?.users || data?.users || [];
    if (!items.length) break;

    for (const item of items) {
      if (allFollowings.length >= maxCount) break;
      allFollowings.push({
        handle: item.username || item.handle || '',
        fullName: item.full_name || item.fullName || '',
        profilePicUrl: item.profile_pic_url || item.profilePicUrl || '',
        isPrivate: item.is_private ?? item.isPrivate ?? false,
        isVerified: item.is_verified ?? item.isVerified ?? false,
      });
    }

    nextCursor = data?.next_cursor || data?.data?.next_cursor;
    if (!nextCursor) break;

    await delay(RATE_LIMIT_DELAY_MS);
  }

  console.log(`[InstagramDiscovery] Found ${allFollowings.length} followings for @${cleanHandle}`);
  return allFollowings;
}

export interface SeedLog {
  type: 'success' | 'warning' | 'error';
  message: string;
}

export async function collectFollowingsFromSeeds(
  seedHandles: string[],
  maxFollowingsPerSeed: number = DEFAULT_MAX_FOLLOWINGS,
  onProgress?: (seedsProcessed: number, seedsTotal: number, candidatesFound: number) => void,
  onLog?: (log: SeedLog) => void
): Promise<Map<string, { followingUser: FollowingUser; sourceSeeds: string[] }>> {
  const candidateMap = new Map<string, { followingUser: FollowingUser; sourceSeeds: string[] }>();
  const seedSet = new Set(seedHandles.map((h) => sanitizeHandle(h).toLowerCase()));

  for (let i = 0; i < seedHandles.length; i++) {
    const seedHandle = sanitizeHandle(seedHandles[i]);

    try {
      const followings = await fetchFollowings(seedHandle, maxFollowingsPerSeed);
      let privateSkipped = 0;

      for (const following of followings) {
        if (!following.handle) continue;
        if (following.isPrivate) { privateSkipped++; continue; }

        const key = following.handle.toLowerCase();
        if (seedSet.has(key)) continue;

        const existing = candidateMap.get(key);
        if (existing) {
          if (!existing.sourceSeeds.includes(seedHandle)) {
            existing.sourceSeeds.push(seedHandle);
          }
        } else {
          candidateMap.set(key, {
            followingUser: following,
            sourceSeeds: [seedHandle],
          });
        }
      }
      onLog?.({ type: 'success', message: `@${seedHandle}: 팔로잉 ${followings.length}명 수집 완료 (비공개 ${privateSkipped}명 제외)` });
    } catch (err: any) {
      console.error(`[InstagramDiscovery] Failed to fetch followings for seed @${seedHandle}: ${err.message}`);
      onLog?.({ type: 'error', message: `@${seedHandle}: 팔로잉 수집 실패 — ${err.message}` });
    }

    onProgress?.(i + 1, seedHandles.length, candidateMap.size);

    if (i < seedHandles.length - 1) {
      await delay(RATE_LIMIT_DELAY_MS);
    }
  }

  return candidateMap;
}

export interface ProfileFetchStats {
  total: number;
  passed: number;
  filteredByFollowerMin: number;
  filteredByFollowerMax: number;
  filteredByPrivate: number;
  fetchErrors: number;
}

export async function fetchProfilesForCandidates(
  candidates: Map<string, { followingUser: FollowingUser; sourceSeeds: string[] }>,
  followerMin?: number | null,
  followerMax?: number | null,
  onProgress?: (profilesFetched: number, totalCandidates: number) => void,
  onLog?: (log: SeedLog) => void
): Promise<{ results: AggregatedCandidate[]; stats: ProfileFetchStats }> {
  const results: AggregatedCandidate[] = [];
  const entries = Array.from(candidates.entries());
  let fetched = 0;
  const stats: ProfileFetchStats = { total: entries.length, passed: 0, filteredByFollowerMin: 0, filteredByFollowerMax: 0, filteredByPrivate: 0, fetchErrors: 0 };

  for (const [handle, { followingUser, sourceSeeds }] of entries) {
    try {
      const profile = await fetchProfileInfo(handle);

      if (followerMin != null && profile.followers < followerMin) {
        stats.filteredByFollowerMin++;
        fetched++;
        onProgress?.(fetched, entries.length);
        await delay(RATE_LIMIT_DELAY_MS);
        continue;
      }
      if (followerMax != null && profile.followers > followerMax) {
        stats.filteredByFollowerMax++;
        fetched++;
        onProgress?.(fetched, entries.length);
        await delay(RATE_LIMIT_DELAY_MS);
        continue;
      }

      if (profile.isPrivate) {
        stats.filteredByPrivate++;
        fetched++;
        onProgress?.(fetched, entries.length);
        await delay(RATE_LIMIT_DELAY_MS);
        continue;
      }

      stats.passed++;
      results.push({
        handle: profile.handle || handle,
        profileData: profile,
        sourceSeeds,
      });
    } catch (err: any) {
      stats.fetchErrors++;
      console.error(`[InstagramDiscovery] Failed to fetch profile for @${handle}: ${err.message}`);
    }

    fetched++;
    onProgress?.(fetched, entries.length);
    await delay(RATE_LIMIT_DELAY_MS);
  }

  const filterParts: string[] = [];
  if (stats.filteredByFollowerMin > 0) filterParts.push(`최소 팔로워 미달 ${stats.filteredByFollowerMin}명`);
  if (stats.filteredByFollowerMax > 0) filterParts.push(`최대 팔로워 초과 ${stats.filteredByFollowerMax}명`);
  if (stats.filteredByPrivate > 0) filterParts.push(`비공개 계정 ${stats.filteredByPrivate}명`);
  if (stats.fetchErrors > 0) filterParts.push(`조회 실패 ${stats.fetchErrors}명`);

  const filterSummary = filterParts.length > 0 ? ` (제외: ${filterParts.join(', ')})` : '';
  onLog?.({ type: stats.passed > 0 ? 'success' : 'warning', message: `프로필 조회 완료: ${stats.total}명 중 ${stats.passed}명 통과${filterSummary}` });

  return { results, stats };
}
