const FETCH_TIMEOUT = 8000;

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
    return data?.profile_pic_url_hd || data?.profile_pic_url || null;
  } catch (err: any) {
    console.log(`[ProfileFetch] RapidAPI IG error for @${handle}:`, err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchInstagramProfileImage(handle: string): Promise<string | null> {
  const cleanHandle = sanitizeHandle(handle);
  if (!cleanHandle) return null;

  const rapidResult = await fetchInstagramViaRapidAPI(cleanHandle);
  if (rapidResult) return rapidResult;

  const html = await fetchWithTimeout(`https://www.instagram.com/${cleanHandle}/`);
  if (!html) return null;
  return extractOgImage(html);
}

async function fetchYouTubeProfileImage(handle: string): Promise<string | null> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  const cleanHandle = sanitizeHandle(handle);
  if (!cleanHandle) return null;

  if (apiKey) {
    try {
      const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet&forHandle=${encodeURIComponent(cleanHandle)}&key=${apiKey}`;
      const html = await fetchWithTimeout(url);
      if (html) {
        const data = JSON.parse(html);
        const thumbnails = data?.items?.[0]?.snippet?.thumbnails;
        if (thumbnails) {
          return thumbnails.high?.url || thumbnails.medium?.url || thumbnails.default?.url || null;
        }
      }
    } catch {
    }
  }

  const html = await fetchWithTimeout(`https://www.youtube.com/@${cleanHandle}`);
  if (!html) return null;
  return extractOgImage(html);
}

export async function fetchProfileImage(platform: string, handle: string): Promise<string | null> {
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
