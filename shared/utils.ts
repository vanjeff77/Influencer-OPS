export function normalizeInstagramHandle(input: string): string | null {
  if (!input || !input.trim()) return null;
  let cleaned = input.trim();

  const topLevelContentPaths = ['p', 'reel', 'reels', 'stories', 'explore', 'direct', 'tv'];
  const contentPathsAfterHandle = ['p', 'reel', 'stories', 'direct', 'tv'];
  const allowedProfileSubPaths = ['reels', 'tagged', 'followers', 'following', 'saved', 'channel'];

  if (/^https?:\/\//i.test(cleaned) || cleaned.startsWith('instagram.com') || cleaned.startsWith('www.instagram.com')) {
    if (!cleaned.startsWith('http')) cleaned = 'https://' + cleaned;
    try {
      const url = new URL(cleaned);
      const pathname = url.pathname.replace(/\/+$/, '');
      const segments = pathname.split('/').filter(Boolean);
      if (segments.length === 0) return null;

      if (topLevelContentPaths.includes(segments[0].toLowerCase())) return null;

      const handle = segments[0].replace(/^@/, '');
      if (!handle) return null;

      for (let i = 1; i < segments.length; i++) {
        const seg = segments[i].toLowerCase();
        if (contentPathsAfterHandle.includes(seg)) return null;
        if (!allowedProfileSubPaths.includes(seg)) {
          break;
        }
      }

      return handle;
    } catch {
      return null;
    }
  }

  cleaned = cleaned.replace(/^@/, '');
  cleaned = cleaned.split('?')[0].split('#')[0];
  if (!cleaned) return null;
  return cleaned;
}

export function normalizeInstagramUrl(handle: string): string {
  return `https://instagram.com/${handle}`;
}

export function normalizeAccountHandle(platform: string, rawHandle: string): { handle: string; url: string } | null {
  const platformUpper = platform.toUpperCase();
  if (platformUpper === 'IG' || platformUpper === 'INSTAGRAM') {
    const normalized = normalizeInstagramHandle(rawHandle);
    if (normalized === null) return null;
    return { handle: normalized, url: normalizeInstagramUrl(normalized) };
  }
  const cleanHandle = rawHandle.replace(/^@/, '');
  return { handle: cleanHandle, url: '' };
}
