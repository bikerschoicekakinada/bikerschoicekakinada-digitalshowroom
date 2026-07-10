import { useEffect, useState, useMemo, useRef, useCallback } from "react";
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
  onChangeIndex,
}: {
  images: ImageMeta[];
  initialIndex?: number;
  onClose: () => void;
  onChangeIndex?: (index: number) => void;
}) {
  const [idx, setIdx] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [pinchStartDist, setPinchStartDist] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [lastTap, setLastTap] = useState<number>(0);
  const [imageStatus, setImageStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [retryCount, setRetryCount] = useState(0);
  const [animateActive, setAnimateActive] = useState(false);
  const [slideDirection, setSlideDirection] = useState<"left" | "right" | null>(null);

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

  // Entrance transition trigger
  useEffect(() => {
    setAnimateActive(true);
  }, []);

  // Sync index change with parent in real-time
  useEffect(() => {
    onChangeIndex?.(idx);
  }, [idx, onChangeIndex]);

  // Reset zoom, panning, and loaded flags on image navigation
  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setImageStatus("loading");
    setRetryCount(0);
  }, [idx]);

  // Handle closing with fade-out/scale-out transition
  const handleClose = useCallback(() => {
    setAnimateActive(false);
    setTimeout(onClose, 250);
  }, [onClose]);

  // Navigate next/prev keyboard controls
  const handleNext = useCallback(() => {
    if (idx < images.length - 1) {
      setSlideDirection("right");
      setIdx((i) => i + 1);
    }
  }, [idx, images.length]);

  const handlePrev = useCallback(() => {
    if (idx > 0) {
      setSlideDirection("left");
      setIdx((i) => i - 1);
    }
  }, [idx]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
      if (e.key === "ArrowRight") handleNext();
      if (e.key === "ArrowLeft") handlePrev();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [handleClose, handleNext, handlePrev]);

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
        e.touches[0].clientY - e.touches[1].clientY,
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
        const maxPanX = ((scale - 1) * window.innerWidth) / 2;
        const maxPanY = ((scale - 1) * window.innerHeight) / 2;
        setPosition({
          x: Math.max(-maxPanX, Math.min(maxPanX, newX)),
          y: Math.max(-maxPanY, Math.min(maxPanY, newY)),
        });
      }
    } else if (e.touches.length === 2 && pinchStartDist) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
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

  // Desktop Mouse Drag to Pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1) {
      e.preventDefault();
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (scale > 1 && isDragging) {
      e.preventDefault();
      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;

      const maxPanX = ((scale - 1) * window.innerWidth) / 2;
      const maxPanY = ((scale - 1) * window.innerHeight) / 2;
      setPosition({
        x: Math.max(-maxPanX, Math.min(maxPanX, newX)),
        y: Math.max(-maxPanY, Math.min(maxPanY, newY)),
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const thumbUrl = activeImgMeta?.thumbnail_path ? urls[activeImgMeta.thumbnail_path] : null;
  const mediumUrl = activeDetails?.medium_path ? urls[activeDetails.medium_path] : null;
  const originalUrl = useMemo(() => {
    if (!activeDetails) return null;
    const path =
      activeDetails.original_path || activeDetails.medium_path || activeImgMeta?.thumbnail_path;
    return path ? urls[path] : null;
  }, [activeDetails, activeImgMeta, urls]);

  const viewportRef = useRef<HTMLDivElement>(null);
  const handlersRef = useRef({ handleTouchStart, handleTouchMove, handleTouchEnd, scale });

  useEffect(() => {
    handlersRef.current = { handleTouchStart, handleTouchMove, handleTouchEnd, scale };
  });

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const onTouchStartImpl = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
      }
      handlersRef.current.handleTouchStart(e as any);
    };

    const onTouchMoveImpl = (e: TouchEvent) => {
      if (handlersRef.current.scale > 1 || e.touches.length === 2) {
        e.preventDefault();
      }
      handlersRef.current.handleTouchMove(e as any);
    };

    const onTouchEndImpl = (e: TouchEvent) => {
      handlersRef.current.handleTouchEnd(e as any);
    };

    // Imperative Wheel event to zoom towards center
    const onWheelImpl = (e: WheelEvent) => {
      e.preventDefault();
      const zoomIntensity = 0.05;
      const delta = -e.deltaY;
      const factor = delta > 0 ? 1 + zoomIntensity : 1 - zoomIntensity;

      setScale((prevScale) => {
        const nextScale = Math.max(1, Math.min(4, prevScale * factor));
        if (nextScale === 1) {
          setPosition({ x: 0, y: 0 });
        }
        return nextScale;
      });
    };

    el.addEventListener("touchstart", onTouchStartImpl, { passive: false });
    el.addEventListener("touchmove", onTouchMoveImpl, { passive: false });
    el.addEventListener("touchend", onTouchEndImpl, { passive: true });
    el.addEventListener("wheel", onWheelImpl, { passive: false });

    return () => {
      el.removeEventListener("touchstart", onTouchStartImpl);
      el.removeEventListener("touchmove", onTouchMoveImpl);
      el.removeEventListener("touchend", onTouchEndImpl);
      el.removeEventListener("wheel", onWheelImpl);
    };
  }, []);

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex flex-col bg-black/98 backdrop-blur-xl font-sans select-none transition-all duration-300 ease-out",
        animateActive ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none",
      )}
    >
      <style>{`
        @keyframes slide-right {
          from { transform: translate3d(60px, 0, 0); opacity: 0; }
          to { transform: translate3d(0, 0, 0); opacity: 1; }
        }
        @keyframes slide-left {
          from { transform: translate3d(-60px, 0, 0); opacity: 0; }
          to { transform: translate3d(0, 0, 0); opacity: 1; }
        }
        .animate-slide-right {
          animation: slide-right 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-slide-left {
          animation: slide-left 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>

      {/* Invisible preload images for browser background cache */}
      {prevOriginalUrl && (
        <img src={prevOriginalUrl} className="hidden" aria-hidden="true" alt="" />
      )}
      {nextOriginalUrl && (
        <img src={nextOriginalUrl} className="hidden" aria-hidden="true" alt="" />
      )}

      {/* Top action bar */}
      <div className="flex items-center justify-between px-4 py-4 md:px-8 z-20">
        <span className="font-display text-xs font-semibold uppercase tracking-widest text-muted-foreground bg-black/40 px-3 py-1.5 rounded-full border border-border/20">
          Image {idx + 1} of {images.length}
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
            {scale > 1 ? (
              <ZoomOut className="h-4.5 w-4.5 text-neon" />
            ) : (
              <ZoomIn className="h-4.5 w-4.5" />
            )}
          </button>

          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="grid h-10 w-10 place-items-center rounded-full border border-border bg-surface hover:neon-ring transition cursor-pointer text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Main viewer viewport */}
      <div
        ref={viewportRef}
        className="relative flex flex-1 items-center justify-center overflow-hidden px-4 pb-4"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          key={idx}
          className={cn(
            "relative w-full h-full max-h-full max-w-full flex items-center justify-center transition-transform duration-100 ease-out",
            slideDirection === "right" && "animate-slide-right",
            slideDirection === "left" && "animate-slide-left",
          )}
          style={{
            transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`,
            transformOrigin: "center center",
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
          {mediumUrl && imageStatus !== "loaded" && (
            <img
              src={mediumUrl}
              alt=""
              className="absolute max-h-full max-w-full rounded-2xl object-contain shadow-2xl transition-opacity duration-300"
            />
          )}

          {/* 3. Original HD Image Layer */}
          {originalUrl && (
            <img
              key={`${originalUrl}-${retryCount}`}
              src={originalUrl}
              alt={activeDetails?.title ?? "Bike"}
              onLoad={() => setImageStatus("loaded")}
              onError={(e) => {
                console.error("ImageViewer: Failed to load original image:", originalUrl, e);
                setImageStatus("error");
              }}
              className={cn(
                "absolute max-h-full max-w-full rounded-2xl object-contain shadow-2xl transition-opacity duration-500",
                imageStatus === "loaded" ? "opacity-100" : "opacity-0",
              )}
            />
          )}

          {/* Dynamic center spinner while original HD loads */}
          {imageStatus === "loading" && originalUrl && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/10 backdrop-blur-[1px] pointer-events-none">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-neon/20 border-t-neon" />
            </div>
          )}

          {/* Error & Retry Panel */}
          {imageStatus === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/50 backdrop-blur-md rounded-2xl p-4">
              <p className="text-sm font-medium text-red-400">Failed to load original image</p>
              <button
                type="button"
                onClick={() => {
                  setImageStatus("loading");
                  setRetryCount((c) => c + 1);
                }}
                className="rounded-full border border-red-500/30 bg-red-950/20 px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-red-400 hover:bg-red-900/30 transition cursor-pointer z-30"
              >
                Retry Loading
              </button>
            </div>
          )}

          {/* Fallback spinner if no images load */}
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
