import { useState, useEffect, useRef } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { extractFileId, getImageUrl } from "@/lib/image-cache";

interface CachedAvatarProps {
  src?: string | null;
  fallback?: string;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
  "data-testid"?: string;
}

function isBlobUrl(url: string): boolean {
  return url.startsWith("blob:");
}

export function CachedAvatar({
  src,
  fallback = "?",
  className,
  imageClassName,
  fallbackClassName,
  "data-testid": testId,
}: CachedAvatarProps) {
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const prevBlobRef = useRef<string | null>(null);

  useEffect(() => {
    if (prevBlobRef.current && isBlobUrl(prevBlobRef.current)) {
      URL.revokeObjectURL(prevBlobRef.current);
      prevBlobRef.current = null;
    }

    if (!src) {
      setResolvedSrc(null);
      setLoading(false);
      return;
    }

    const fileId = extractFileId(src);
    if (!fileId) {
      setResolvedSrc(src);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    getImageUrl(src)
      .then((url) => {
        if (!cancelled) {
          if (isBlobUrl(url)) {
            prevBlobRef.current = url;
          }
          setResolvedSrc(url);
          setLoading(false);
        } else if (isBlobUrl(url)) {
          URL.revokeObjectURL(url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedSrc(null);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [src]);

  useEffect(() => {
    return () => {
      if (prevBlobRef.current && isBlobUrl(prevBlobRef.current)) {
        URL.revokeObjectURL(prevBlobRef.current);
      }
    };
  }, []);

  return (
    <Avatar className={className} data-testid={testId}>
      {resolvedSrc && !loading && (
        <AvatarImage src={resolvedSrc} className={imageClassName} />
      )}
      <AvatarFallback className={fallbackClassName}>
        {fallback}
      </AvatarFallback>
    </Avatar>
  );
}
