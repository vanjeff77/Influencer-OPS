import { createFolderIfNotExists, uploadSmallFile, getDirectDownloadUrl } from './onedrive';

const FETCH_TIMEOUT = 8000;

export interface ProfileImageResult {
  fileId: string;
}

async function fetchWithTimeout(url: string, headers: Record<string, string> = {}): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...headers,
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractOgImage(html: string): string | null {
  const match = html.match(/<meta\s+(?:[^>]*?\s+)?(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']/i)
    || html.match(/<meta\s+content=["']([^"']+)["']\s+(?:[^>]*?\s+)?(?:property|name)=["']og:image["']/i);
  return match?.[1] || null;
}

function sanitizeHandle(handle: string): string {
  let clean = handle.replace(/^@/, '').trim();
  clean = clean.replace(/^https?:\/\/(www\.)?(instagram\.com|youtube\.com|youtu\.be)\/?/i, '');
  clean = clean.replace(/^@/, '');
  clean = clean.split('/')[0].split('?')[0];
  return clean;
}

async function fetchInstagramViaRapidAPI(handle: string): Promise<string | null> {
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(
      'https://instagram120.p.rapidapi.com/api/instagram/profile',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-rapidapi-key': apiKey,
          'x-rapidapi-host': 'instagram120.p.rapidapi.com',
        },
        body: JSON.stringify({ username: handle }),
        signal: controller.signal,
      }
    );
    if (!res.ok) {
      console.log(`[ProfileFetch] RapidAPI IG response ${res.status} for @${handle}`);
      return null;
    }
    const data = await res.json() as any;
    const profile = data?.result || data;
    return profile?.profile_pic_url_hd || profile?.profile_pic_url || null;
  } catch (err: any) {
    console.log(`[ProfileFetch] RapidAPI IG error for @${handle}:`, err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function downloadImageBuffer(imageUrl: string): Promise<Buffer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

let profileFolderIdCache: string | null = null;

async function cacheImageToOneDrive(platform: string, handle: string, imageUrl: string): Promise<ProfileImageResult | null> {
  try {
    if (!profileFolderIdCache) {
      profileFolderIdCache = await createFolderIfNotExists('프로필사진');
    }

    const buffer = await downloadImageBuffer(imageUrl);
    if (!buffer || buffer.length < 100) {
      console.log(`[ProfileFetch] Image download failed or too small for @${handle}`);
      return null;
    }

    const fileName = `${platform}_${handle}.jpg`;
    const uploaded = await uploadSmallFile(profileFolderIdCache, fileName, buffer);
    console.log(`[ProfileFetch] Uploaded to OneDrive: ${fileName} (${buffer.length} bytes), fileId: ${uploaded.id}`);

    return { fileId: uploaded.id };
  } catch (err: any) {
    console.log(`[ProfileFetch] OneDrive cache failed for @${handle}:`, err.message);
    return null;
  }
}

async function fetchInstagramProfileImage(handle: string): Promise<ProfileImageResult | null> {
  const cleanHandle = sanitizeHandle(handle);
  if (!cleanHandle) return null;

  const cdnUrl = await fetchInstagramViaRapidAPI(cleanHandle);
  if (!cdnUrl) {
    const html = await fetchWithTimeout(`https://www.instagram.com/${cleanHandle}/`);
    if (!html) return null;
    const ogUrl = extractOgImage(html);
    if (!ogUrl) return null;
    return await cacheImageToOneDrive('IG', cleanHandle, ogUrl);
  }

  return await cacheImageToOneDrive('IG', cleanHandle, cdnUrl);
}

async function fetchYouTubeProfileImage(handle: string): Promise<ProfileImageResult | null> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  const cleanHandle = sanitizeHandle(handle);
  if (!cleanHandle) return null;

  let imageUrl: string | null = null;

  if (apiKey) {
    try {
      const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet&forHandle=${encodeURIComponent(cleanHandle)}&key=${apiKey}`;
      const html = await fetchWithTimeout(url);
      if (html) {
        const data = JSON.parse(html);
        const thumbnails = data?.items?.[0]?.snippet?.thumbnails;
        if (thumbnails) {
          imageUrl = thumbnails.high?.url || thumbnails.medium?.url || thumbnails.default?.url || null;
        }
      }
    } catch {
    }
  }

  if (!imageUrl) {
    const html = await fetchWithTimeout(`https://www.youtube.com/@${cleanHandle}`);
    if (html) {
      imageUrl = extractOgImage(html);
    }
  }

  if (!imageUrl) return null;

  return await cacheImageToOneDrive('YT', cleanHandle, imageUrl);
}

export async function fetchProfileImage(platform: string, handle: string): Promise<ProfileImageResult | null> {
  try {
    switch (platform) {
      case 'IG':
        return await fetchInstagramProfileImage(handle);
      case 'YT':
        return await fetchYouTubeProfileImage(handle);
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export { getDirectDownloadUrl };
