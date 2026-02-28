const DB_NAME = 'profile-image-cache';
const STORE_NAME = 'images';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getCachedImage(fileId: string): Promise<string | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(fileId);
      req.onsuccess = () => {
        const blob = req.result as Blob | undefined;
        if (blob) {
          resolve(URL.createObjectURL(blob));
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function cacheImage(fileId: string, blob: Blob): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(blob, fileId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // silently fail
  }
}

export function extractFileId(src: string): string | null {
  const match = src.match(/^\/api\/profile-image\/(.+)$/);
  return match ? match[1] : null;
}

export async function getImageUrl(src: string): Promise<string> {
  const fileId = extractFileId(src);
  if (!fileId) return src;

  const cached = await getCachedImage(fileId);
  if (cached) return cached;

  try {
    const response = await fetch(src);
    if (response.ok) {
      const blob = await response.blob();
      await cacheImage(fileId, blob);
      return URL.createObjectURL(blob);
    }
  } catch {
    // fall through
  }
  return src;
}
