import { useEffect, useState, useMemo, useRef } from "react";
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { useSignedUrls } from "@/hooks/use-signed-urls";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { getImageDetail } from "@/lib/catalog.functions";

type ImageMeta = {
  id: string;
  thumbnail_path: string;
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
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [pinchStartDist, setPinchStartDist] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [lastTap, setLastTap] = useState<number>(0);
  const [originalLoaded, setOriginalLoaded] = useState(false);

  // Active, Prev, Next image references
  const activeImgMeta = images[idx];
  const prevImgMeta = idx > 0 ? images[idx - 1] : null;
  const nextImgMeta = idx < images.length - 1 ? images[idx + 1] : null;

  // 1. Fetch full details on-demand for active, prev, and next images
  const { data: activeDetails } = useQuery({
    queryKey: ["image-detail", activeImgMeta?.id],
    queryFn: () => getImageDetail({ data: { designId: activeImgMeta!.id } }),
    enabled: !!activeImgMeta?.id,
    staleTime: 1000 * 60 * 10,
  });

  const { data: prevDetails } = useQuery({
    queryKey: ["image-detail", prevImgMeta?.id],
    queryFn: () => getImageDetail({ data: { designId: prevImgMeta!.id } }),
    enabled: !!prevImgMeta?.id,
    staleTime: 1000 * 60 * 10,
  });

  const { data: nextDetails } = useQuery({
    queryKey: ["image-detail", nextImgMeta?.id],
    queryFn: () => getImageDetail({ data: { designId: nextImgMeta!.id } }),
    enabled: !!nextImgMeta?.id,
    staleTime: 1000 * 60 * 10,
  });

  // Reset zoom, panning, and loaded flags on image navigation
  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setOriginalLoaded(false);
  }, [idx]);

  // Navigate next/prev keyboard controls
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") handleNext();
      if (e.key === "ArrowLeft") handlePrev();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, images.length, idx]);

  // Gather paths to sign (Thumb, Medium, Original)
  const pathsToRequest = useMemo(() => {
    const arr: string[] = [];

    // Current active image paths
    if (activeImgMeta?.thumbnail_path) arr.push(activeImgMeta.thumbnail_path);
    if (activeDetails?.medium_path) arr.push(activeDetails.medium_path);
    if (activeDetails?.original_path) arr.push(activeDetails.original_path);

    // Adjacent images original + medium paths for preloading!
    if (prevImgMeta?.thumbnail_path) arr.push(prevImgMeta.thumbnail_path);
    if (prevDetails?.original_path) arr.push(prevDetails.original_path);
    if (prevDetails?.medium_path) arr.push(prevDetails.medium_path);

    if (nextImgMeta?.thumbnail_path) arr.push(nextImgMeta.thumbnail_path);
    if (nextDetails?.original_path) arr.push(nextDetails.original_path);
    if (nextDetails?.medium_path) arr.push(nextDetails.medium_path);

    return [...new Set(arr)];
  }, [activeImgMeta, activeDetails, prevImgMeta, prevDetails, nextImgMeta, nextDetails]);

  const { urls } = useSignedUrls(pathsToRequest);

  // Background Image File Preloader for adjacent original HD files
  const prevOriginalUrl = prevDetails?.original_path ? urls[prevDetails.original_path] : null;
  const nextOriginalUrl = nextDetails?.original_path ? urls[nextDetails.original_path] : null;

  const handleNext = () => {
    if (idx < images.length - 1) {
      setIdx((i) => i + 1);
    }
  };

  const handlePrev = () => {
    if (idx > 0) {
      setIdx((i) => i - 1);
    }
  };

  const handleDoubleTap = (e: React.MouseEvent) => {
    e.preventDefault();
    const now = Date.now();
    if (now - lastTap < 300) {
      if (scale > 1) {
        setScale(1);
        setPosition({ x: 0, y: 0 });
      } else {
        setScale(2.5);
      }
    }
    setLastTap(now);
  };

  // Mobile Touch Gestures
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      setTouchStart({ x: t.clientX, y: t.clientY });
      if (scale > 1) {
        setIsDragging(true);
        setDragStart({ x: t.clientX - position.x, y: t.clientY - position.y });
      }
    } else if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      setPinchStartDist(dist);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && touchStart) {
      const t = e.touches[0];
      if (scale > 1 && isDragging) {
        const newX = t.clientX - dragStart.x;
        const newY = t.clientY - dragStart.y;
        
        // Lock panning limits relative to scale zoom level
        const maxPanX = (scale - 1) * window.innerWidth / 2;
        const maxPanY = (scale - 1) * window.innerHeight / 2;
        setPosition({
          x: Math.max(-maxPanX, Math.min(maxPanX, newX)),
          y: Math.max(-maxPanY, Math.min(maxPanY, newY))
        });
      }
    } else if (e.touches.length === 2 && pinchStartDist) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const zoomFactor = dist / pinchStartDist;
      const nextScale = Math.max(1, Math.min(4, scale * zoomFactor));
      setScale(nextScale);
      setPinchStartDist(dist);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    setIsDragging(false);
    setPinchStartDist(null);

    // Swipe trigger at normal scale (1x)
    if (scale === 1 && touchStart && e.changedTouches.length === 1) {
      const t = e.changedTouches[0];
      const deltaX = t.clientX - touchStart.x;
      const deltaY = t.clientY - touchStart.y;

      if (Math.abs(deltaX) > 60 && Math.abs(deltaY) < 60) {
        if (deltaX < 0) {
          handleNext();
        } else {
          handlePrev();
        }
      }
    }
    setTouchStart(null);
  };

  const thumbUrl = activeImgMeta?.thumbnail_path ? urls[activeImgMeta.thumbnail_path] : null;
  const mediumUrl = activeDetails?.medium_path ? urls[activeDetails.medium_path] : null;
  const originalUrl = activeDetails?.original_path ? urls[activeDetails.original_path] : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/98 backdrop-blur-xl font-sans select-none">
      {/* Invisible preload images for browser background cache */}
      {prevOriginalUrl && <img src={prevOriginalUrl} className="hidden" aria-hidden="true" alt="" />}
      {nextOriginalUrl && <img src={nextOriginalUrl} className="hidden" aria-hidden="true" alt="" />}

      {/* Top action bar */}
      <div className="flex items-center justify-between px-4 py-4 md:px-8 z-20">
        <span className="font-display text-sm font-semibold text-foreground">
          {idx + 1} / {images.length}
        </span>
        <div className="flex items-center gap-2">
          {/* Zoom Toggle Button */}
          <button
            type="button"
            onClick={() => {
              if (scale > 1) {
                setScale(1);
                setPosition({ x: 0, y: 0 });
              } else {
                setScale(2.5);
              }
            }}
            title={scale > 1 ? "Zoom Out" : "Zoom In (Original Resolution)"}
            className="grid h-10 w-10 place-items-center rounded-full border border-border bg-surface hover:neon-ring transition cursor-pointer text-foreground"
          >
            {scale > 1 ? <ZoomOut className="h-4.5 w-4.5 text-neon" /> : <ZoomIn className="h-4.5 w-4.5" />}
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
      <div 
        className="relative flex flex-1 items-center justify-center overflow-hidden px-4 pb-4"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div 
          className="relative w-full h-full max-h-full max-w-full flex items-center justify-center transition-transform duration-100 ease-out"
          style={{
            transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`,
            transformOrigin: "center center"
          }}
          onClick={handleDoubleTap}
        >
          {/* 1. Low-res blurred background thumbnail loaded instantly */}
          {thumbUrl && (
            <img
              src={thumbUrl}
              alt=""
              className="absolute max-h-full max-w-full rounded-2xl object-contain filter blur-md opacity-40 scale-105"
            />
          )}

          {/* 2. Optimized transition image */}
          {mediumUrl && !originalLoaded && (
            <img
              src={mediumUrl}
              alt=""
              className="absolute max-h-full max-w-full rounded-2xl object-contain shadow-2xl transition-opacity duration-300"
            />
          )}

          {/* 3. Original HD Image Layer */}
          {originalUrl && (
            <img
              src={originalUrl}
              alt={activeDetails?.title ?? "Bike"}
              onLoad={() => setOriginalLoaded(true)}
              className={cn(
                "absolute max-h-full max-w-full rounded-2xl object-contain shadow-2xl transition-opacity duration-500",
                originalLoaded ? "opacity-100" : "opacity-0"
              )}
            />
          )}

          {/* Fallback spinner if not loaded */}
          {!mediumUrl && !originalUrl && (
            <div className="h-2/3 w-2/3 animate-pulse rounded-2xl bg-surface" />
          )}
        </div>

        {/* Previous / Next click buttons for desktop */}
        {scale === 1 && images.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous"
              onClick={handlePrev}
              disabled={idx === 0}
              className={cn(
                "absolute left-3 grid h-11 w-11 place-items-center rounded-full border border-border bg-surface/70 backdrop-blur transition cursor-pointer text-foreground z-30",
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
                "absolute right-3 grid h-11 w-11 place-items-center rounded-full border border-border bg-surface/70 backdrop-blur transition cursor-pointer text-foreground z-30",
                idx === images.length - 1 ? "opacity-30 pointer-events-none" : "hover:neon-ring",
              )}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {/* Description caption */}
      {activeDetails?.description && (
        <div className="px-6 py-2 text-center text-xs text-muted-foreground italic max-w-2xl mx-auto z-10 bg-black/40 rounded-full mb-6">
          {activeDetails.description}
        </div>
      )}
    </div>
  );
}
