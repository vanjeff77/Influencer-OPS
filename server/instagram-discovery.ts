const RAPIDAPI_HOST = 'instagram-scraper-api2.p.rapidapi.com';
const DEFAULT_MAX_FOLLOWINGS = 500;
const RETRY_MAX = 3;
const RATE_LIMIT_DELAY_MS = 1500;

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

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`RapidAPI ${res.status}: ${text.substring(0, 200)}`);
    }

    return await res.json();
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
        await delay(RATE_LIMIT_DELAY_MS * attempt);
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

export async function fetchFollowings(handle: string, maxCount: number = DEFAULT_MAX_FOLLOWINGS): Promise<FollowingUser[]> {
  const cleanHandle = sanitizeHandle(handle);
  if (!cleanHandle) throw new Error('Invalid handle');

  console.log(`[InstagramDiscovery] Fetching followings for @${cleanHandle} (max: ${maxCount})`);

  const allFollowings: FollowingUser[] = [];
  let paginationToken: string | undefined;

  while (allFollowings.length < maxCount) {
    const params: Record<string, string> = {
      username_or_id_or_url: cleanHandle,
    };
    if (paginationToken) {
      params.pagination_token = paginationToken;
    }

    const data = await withRetry(
      () => apiRequest('/v1/following', params),
      `fetchFollowings(@${cleanHandle})`
    );

    const items = data?.data?.items || data?.items || [];
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

    paginationToken = data?.pagination_token || data?.data?.pagination_token;
    if (!paginationToken) break;

    await delay(RATE_LIMIT_DELAY_MS);
  }

  console.log(`[InstagramDiscovery] Found ${allFollowings.length} followings for @${cleanHandle}`);
  return allFollowings;
}

export async function fetchProfileInfo(handle: string): Promise<ProfileInfo> {
  const cleanHandle = sanitizeHandle(handle);
  if (!cleanHandle) throw new Error('Invalid handle');

  const data = await withRetry(
    () => apiRequest('/v1/info', { username_or_id_or_url: cleanHandle }),
    `fetchProfileInfo(@${cleanHandle})`
  );

  const profile = data?.data || data;

  return {
    handle: profile.username || cleanHandle,
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

export async function collectFollowingsFromSeeds(
  seedHandles: string[],
  maxFollowingsPerSeed: number = DEFAULT_MAX_FOLLOWINGS,
  onProgress?: (seedsProcessed: number, seedsTotal: number, candidatesFound: number) => void
): Promise<Map<string, { followingUser: FollowingUser; sourceSeeds: string[] }>> {
  const candidateMap = new Map<string, { followingUser: FollowingUser; sourceSeeds: string[] }>();
  const seedSet = new Set(seedHandles.map((h) => sanitizeHandle(h).toLowerCase()));

  for (let i = 0; i < seedHandles.length; i++) {
    const seedHandle = sanitizeHandle(seedHandles[i]);

    try {
      const followings = await fetchFollowings(seedHandle, maxFollowingsPerSeed);

      for (const following of followings) {
        if (!following.handle) continue;
        if (following.isPrivate) continue;

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
    } catch (err: any) {
      console.error(`[InstagramDiscovery] Failed to fetch followings for seed @${seedHandle}: ${err.message}`);
    }

    onProgress?.(i + 1, seedHandles.length, candidateMap.size);

    if (i < seedHandles.length - 1) {
      await delay(RATE_LIMIT_DELAY_MS);
    }
  }

  return candidateMap;
}

export async function fetchProfilesForCandidates(
  candidates: Map<string, { followingUser: FollowingUser; sourceSeeds: string[] }>,
  followerMin?: number | null,
  followerMax?: number | null,
  onProgress?: (profilesFetched: number, totalCandidates: number) => void
): Promise<AggregatedCandidate[]> {
  const results: AggregatedCandidate[] = [];
  const entries = Array.from(candidates.entries());
  let fetched = 0;

  for (const [handle, { followingUser, sourceSeeds }] of entries) {
    try {
      const profile = await fetchProfileInfo(handle);

      if (followerMin != null && profile.followers < followerMin) {
        fetched++;
        onProgress?.(fetched, entries.length);
        await delay(RATE_LIMIT_DELAY_MS);
        continue;
      }
      if (followerMax != null && profile.followers > followerMax) {
        fetched++;
        onProgress?.(fetched, entries.length);
        await delay(RATE_LIMIT_DELAY_MS);
        continue;
      }

      if (profile.isPrivate) {
        fetched++;
        onProgress?.(fetched, entries.length);
        await delay(RATE_LIMIT_DELAY_MS);
        continue;
      }

      results.push({
        handle: profile.handle || handle,
        profileData: profile,
        sourceSeeds,
      });
    } catch (err: any) {
      console.error(`[InstagramDiscovery] Failed to fetch profile for @${handle}: ${err.message}`);
    }

    fetched++;
    onProgress?.(fetched, entries.length);
    await delay(RATE_LIMIT_DELAY_MS);
  }

  return results;
}
