import { useEffect, useState, useMemo } from "react";
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { useSignedUrls } from "@/hooks/use-signed-urls";
import { cn } from "@/lib/utils";

type ImageMeta = {
  id: string;
  original_path?: string | null;
  thumbnail_path: string;
  small_path?: string | null;
  medium_path?: string | null;
  large_path?: string | null;
  description?: string | null;
};

export function ImageViewer({
  images,
  initialIndex = 0,
  onClose,
}: {
  images: ImageMeta[];
  initialIndex?: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [zoomLoaded, setZoomLoaded] = useState(false);

  // Close on Escape, navigate on Arrow keys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") {
        setIdx((i) => Math.min(images.length - 1, i + 1));
        setZoomed(false);
        setPreviewLoaded(false);
        setZoomLoaded(false);
      }
      if (e.key === "ArrowLeft") {
        setIdx((i) => Math.max(0, i - 1));
        setZoomed(false);
        setPreviewLoaded(false);
        setZoomLoaded(false);
      }
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, images.length]);

  // Network speed detection
  const isConnectionSlow = useMemo(() => {
    if (typeof navigator !== "undefined" && (navigator as any).connection) {
      const conn = (navigator as any).connection;
      if (conn.saveData) return true;
      if (["2g", "3g"].includes(conn.effectiveType)) return true;
      if (conn.downlink && conn.downlink < 2.0) return true;
    }
    return false;
  }, []);

  const activeImg = images[idx];

  // Resolve target paths for progressive levels
  const thumbPath = activeImg?.thumbnail_path;
  const previewPath = isConnectionSlow 
    ? (activeImg?.medium_path ?? activeImg?.thumbnail_path)
    : (activeImg?.large_path ?? activeImg?.thumbnail_path);
  const zoomPath = activeImg?.original_path ?? activeImg?.thumbnail_path;

  // Smart Preloading: gather paths for current, previous, and next images
  const pathsToRequest = useMemo(() => {
    const arr: string[] = [];
    
    // Current image paths
    if (thumbPath) arr.push(thumbPath);
    if (previewPath) arr.push(previewPath);
    if (zoomPath) arr.push(zoomPath);

    // Previous image paths (large preview + thumb)
    if (idx > 0) {
      const prev = images[idx - 1];
      if (prev.thumbnail_path) arr.push(prev.thumbnail_path);
      const prevLarge = isConnectionSlow ? prev.medium_path : prev.large_path;
      if (prevLarge) arr.push(prevLarge);
    }

    // Next image paths (large preview + thumb)
    if (idx < images.length - 1) {
      const next = images[idx + 1];
      if (next.thumbnail_path) arr.push(next.thumbnail_path);
      const nextLarge = isConnectionSlow ? next.medium_path : next.large_path;
      if (nextLarge) arr.push(nextLarge);
    }

    return [...new Set(arr)];
  }, [images, idx, isConnectionSlow, thumbPath, previewPath, zoomPath]);

  const { urls } = useSignedUrls(pathsToRequest);

  const thumbUrl = thumbPath ? urls[thumbPath] : null;
  const previewUrl = previewPath ? urls[previewPath] : null;
  const zoomUrl = zoomPath ? urls[zoomPath] : null;

  // Background Image Preloader
  useEffect(() => {
    const urlsToPreload: string[] = [];
    if (idx > 0) {
      const prev = images[idx - 1];
      const prevLarge = isConnectionSlow ? prev.medium_path : prev.large_path;
      if (prevLarge && urls[prevLarge]) urlsToPreload.push(urls[prevLarge]);
    }
    if (idx < images.length - 1) {
      const next = images[idx + 1];
      const nextLarge = isConnectionSlow ? next.medium_path : next.large_path;
      if (nextLarge && urls[nextLarge]) urlsToPreload.push(urls[nextLarge]);
    }
    for (const u of urlsToPreload) {
      const img = new Image();
      img.src = u;
    }
  }, [idx, urls, images, isConnectionSlow]);

  const handleNext = () => {
    if (idx < images.length - 1) {
      setIdx((i) => i + 1);
      setZoomed(false);
      setPreviewLoaded(false);
      setZoomLoaded(false);
    }
  };

  const handlePrev = () => {
    if (idx > 0) {
      setIdx((i) => i - 1);
      setZoomed(false);
      setPreviewLoaded(false);
      setZoomLoaded(false);
    }
  };

  const handleDoubleTap = (e: React.MouseEvent) => {
    e.preventDefault();
    setZoomed((z) => !z);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/98 backdrop-blur-xl font-sans select-none">
      {/* Top action bar */}
      <div className="flex items-center justify-between px-4 py-4 md:px-8 z-25">
        <div className="flex flex-col">
          <span className="font-display text-sm font-semibold text-foreground">
            {idx + 1} / {images.length}
          </span>
          {isConnectionSlow && (
            <span className="text-[10px] text-amber-500 font-medium">Lite Mode (Slow Connection)</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Zoom Toggle Button */}
          <button
            type="button"
            onClick={() => setZoomed(!zoomed)}
            title={zoomed ? "Zoom Out" : "Zoom In (Original Resolution)"}
            className="grid h-10 w-10 place-items-center rounded-full border border-border bg-surface hover:neon-ring transition cursor-pointer text-foreground"
          >
            {zoomed ? <ZoomOut className="h-4.5 w-4.5 text-neon" /> : <ZoomIn className="h-4.5 w-4.5" />}
          </button>
          
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-10 w-10 place-items-center rounded-full border border-border bg-surface hover:neon-ring transition cursor-pointer text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Main viewer viewport */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4 pb-4">
        <div 
          className={cn(
            "relative w-full h-full max-h-full max-w-full flex items-center justify-center transition-all duration-300",
            zoomed ? "scale-150 overflow-auto cursor-zoom-out" : "cursor-zoom-in"
          )}
          onDoubleClick={handleDoubleTap}
        >
          {/* 1. Low-res blur thumbnail background loaded instantly */}
          {thumbUrl && (
            <img
              src={thumbUrl}
              alt=""
              className="absolute max-h-full max-w-full rounded-2xl object-contain filter blur-md opacity-40 scale-105"
            />
          )}

          {/* 2. High-quality preview layer (Large/Medium) */}
          {previewUrl && (
            <img
              src={previewUrl}
              alt=""
              onLoad={() => setPreviewLoaded(true)}
              className={cn(
                "absolute max-h-full max-w-full rounded-2xl object-contain shadow-2xl transition-opacity duration-500",
                previewLoaded ? "opacity-100" : "opacity-0"
              )}
            />
          )}

          {/* 3. Original HD Image Layer for Zooming */}
          {zoomed && zoomUrl && (
            <img
              src={zoomUrl}
              alt={activeImg?.description ?? "Bike"}
              onLoad={() => setZoomLoaded(true)}
              className={cn(
                "absolute max-h-full max-w-full rounded-2xl object-contain shadow-2xl transition-opacity duration-500",
                zoomLoaded ? "opacity-100" : "opacity-0"
              )}
            />
          )}

          {/* Fallback spinner if not loaded */}
          {!previewUrl && (
            <div className="h-2/3 w-2/3 animate-pulse rounded-2xl bg-surface" />
          )}
        </div>

        {/* Previous / Next buttons */}
        {!zoomed && images.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous"
              onClick={handlePrev}
              disabled={idx === 0}
              className={cn(
                "absolute left-3 grid h-11 w-11 place-items-center rounded-full border border-border bg-surface/70 backdrop-blur transition cursor-pointer text-foreground",
                idx === 0 ? "opacity-30 pointer-events-none" : "hover:neon-ring",
              )}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Next"
              onClick={handleNext}
              disabled={idx === images.length - 1}
              className={cn(
                "absolute right-3 grid h-11 w-11 place-items-center rounded-full border border-border bg-surface/70 backdrop-blur transition cursor-pointer text-foreground",
                idx === images.length - 1 ? "opacity-30 pointer-events-none" : "hover:neon-ring",
              )}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {/* Description caption */}
      {activeImg?.description && (
        <div className="px-6 py-2 text-center text-xs text-muted-foreground italic max-w-2xl mx-auto z-10 bg-black/40 rounded-full mb-2">
          {activeImg.description}
        </div>
      )}

      {/* Slide selector strip */}
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-none px-4 pb-4 justify-start md:justify-center z-10">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => {
                setIdx(i);
                setZoomed(false);
                setPreviewLoaded(false);
                setZoomLoaded(false);
              }}
              className={cn(
                "shrink-0 overflow-hidden rounded-xl border transition cursor-pointer",
                i === idx ? "border-neon neon-ring" : "border-border opacity-60 hover:opacity-100",
              )}
              style={{ width: 64, height: 80 }}
            >
              {urls[img.thumbnail_path] ? (
                <img src={urls[img.thumbnail_path]} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full animate-pulse bg-surface" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
