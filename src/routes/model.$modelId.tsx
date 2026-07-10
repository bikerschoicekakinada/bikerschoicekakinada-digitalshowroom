import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Suspense, useState, useMemo, useCallback, useEffect, useRef, memo } from "react";
import { ArrowLeft, Share2, ShoppingCart, Star, ChevronDown, ChevronUp, Phone, MessageCircle, X, Check, Heart, Copy } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { SignedImage } from "@/components/SignedImage";
import { ImageViewer } from "@/components/ImageViewer";
import { getConfiguratorCategoryMeta, getConfiguratorCategoryItems, listImagesByModel, getImageDetail, type ConfiguratorCategoryMeta, type CategoryItemRow } from "@/lib/catalog.functions";
import { useSignedUrls } from "@/hooks/use-signed-urls";
import { cn } from "@/lib/utils";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import {
  saveCustomization,
  getCustomization,
  saveSelectedBike,
  addRecentlyViewed,
} from "@/lib/persistence";
import { useFavorites } from "@/hooks/use-favorites";

// ============================================================
// Route
// ============================================================
const configuratorSearchSchema = z.object({
  items: fallback(z.string().optional(), "").default(""),
  img: fallback(z.string().optional(), "").default(""),
});

const categoryMetaQuery = (modelId: string) =>
  queryOptions({
    queryKey: ["configurator-meta", modelId],
    queryFn: () => getConfiguratorCategoryMeta({ data: { modelId } }),
    staleTime: 1000 * 60 * 10,
  });

const imagesQuery = (modelId: string) =>
  queryOptions({
    queryKey: ["model-images", modelId],
    queryFn: () => listImagesByModel({ data: { modelId, limit: 24, offset: 0 } }),
    staleTime: 1000 * 60 * 5,
  });

const imageDetailQuery = (designId: string | undefined) =>
  queryOptions({
    queryKey: ["image-detail", designId],
    queryFn: () => getImageDetail({ data: { designId: designId! } }),
    enabled: !!designId,
    staleTime: 1000 * 60 * 10,
  });

export const Route = createFileRoute("/model/$modelId")({
  validateSearch: zodValidator(configuratorSearchSchema),
  loader: async ({ params, context }) => {
    const data = await context.queryClient.ensureQueryData(categoryMetaQuery(params.modelId));
    if (!data) throw notFound();
    context.queryClient.ensureQueryData(imagesQuery(params.modelId));
    return { model: data.model };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${(loaderData.model as any)?.name ?? "Bike"} Configurator — Bikers Choice Kakinada` },
          { name: "description", content: `Customize your ${(loaderData.model as any)?.name}. Choose accessories, wraps, and more at Bikers Choice Kakinada.` },
        ]
      : [{ title: "Configurator — Bikers Choice Kakinada" }],
  }),
  component: ConfiguratorPage,
});

// ============================================================
// Types
// ============================================================
type SelectedItem = {
  categoryId: string;
  categoryName: string;
  itemId: string;
  itemName: string;
  price: number;
};

// ============================================================
// Page
// ============================================================
function ConfiguratorPage() {
  const { modelId } = Route.useParams();
  const { items, img } = Route.useSearch();
  
  // 1. Suspense-load configurator category metadata and images list
  const { data } = useSuspenseQuery(categoryMetaQuery(modelId));
  const { data: imagesData } = useSuspenseQuery(imagesQuery(modelId));
  const images = imagesData.rows;

  const [viewerAt, setViewerAt] = useState<number | null>(null);
  const [selectedItems, setSelectedItems] = useState<Map<string, SelectedItem>>(new Map());
  const [activeIdx, setActiveIdx] = useState(0);
  const [loadedFromStorage, setLoadedFromStorage] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Gallery view mode & columns configuration
  const [viewMode, setViewMode] = useState<"gallery" | "detail">(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("img")) return "detail";
    }
    return "gallery";
  });

  const [gridCols, setGridCols] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("bck-gallery-cols");
      if (saved) return Math.max(1, Math.min(6, parseInt(saved, 10)));
    }
    return 3;
  });

  const [gridPinchStartDist, setGridPinchStartDist] = useState<number | null>(null);

  useEffect(() => {
    localStorage.setItem("bck-gallery-cols", String(gridCols));
  }, [gridCols]);

  const model = data!.model;
  const categoryMetas = data!.categories;

  const restoredItemIdsRef = useRef<string[] | null>(null);

  // Initialize recently viewed, selected bike, and restore session indices from URL or IndexedDB
  useEffect(() => {
    addRecentlyViewed(modelId);
    saveSelectedBike(modelId);

    const restoreSession = async () => {
      let restoredItems: string[] = [];
      let restoredIdx = 0;
      let usedSharedUrl = false;

      // 1. Restore from URL Search parameters (Share Build)
      if (items) {
        restoredItems = items.split(",").filter(Boolean);
        usedSharedUrl = true;
      }
      if (img) {
        const parsed = parseInt(img, 10);
        if (!isNaN(parsed)) {
          restoredIdx = parsed;
          usedSharedUrl = true;
        }
      }

      // 2. Restore from local IndexedDB if not a shared URL
      if (!usedSharedUrl) {
        const saved = await getCustomization(modelId);
        if (saved) {
          restoredItems = saved.selectedItemIds;
          restoredIdx = saved.activeIdx;
        }
      }

      restoredItemIdsRef.current = restoredItems;
      setActiveIdx(restoredIdx);
      setLoadedFromStorage(true);
    };

    restoreSession();
  }, [modelId, items, img]);

  // With lazy-loading, session restore happens within each CategorySection
  // when items are fetched. We just mark that storage is loaded so
  // CategorySections can begin restoring.
  // No need to iterate merged categories here.

  const toggleItem = useCallback((categoryId: string, categoryName: string, item: CategoryItemRow) => {
    setInteracted(true);
    setSelectedItems((prev) => {
      const next = new Map(prev);
      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.set(item.id, {
          categoryId,
          categoryName,
          itemId: item.id,
          itemName: item.name,
          price: item.price,
        });
      }
      return next;
    });
  }, []);

  const grandTotal = useMemo(
    () => Array.from(selectedItems.values()).reduce((sum, i) => sum + i.price, 0),
    [selectedItems],
  );

  // Auto-save selections to IndexedDB on any selection change (only after initial load resolves)
  useEffect(() => {
    if (!loadedFromStorage) return;
    const itemIds = Array.from(selectedItems.keys());
    saveCustomization(modelId, itemIds, activeIdx, grandTotal);
  }, [selectedItems, activeIdx, grandTotal, modelId, loadedFromStorage]);

  const clearSelections = useCallback(() => {
    setInteracted(true);
    setSelectedItems(new Map());
  }, []);

  const shareBuildUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const base = `${window.location.protocol}//${window.location.host}${window.location.pathname}`;
    const selectedIds = Array.from(selectedItems.keys()).join(",");
    const params = new URLSearchParams();
    if (selectedIds) params.set("items", selectedIds);
    params.set("img", String(activeIdx));
    return `${base}?${params.toString()}`;
  }, [selectedItems, activeIdx]);

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${(model as any).name} Configuration — Bikers Choice`,
          url: shareBuildUrl,
        });
      } catch {
        /* cancelled */
      }
    } else {
      await navigator.clipboard.writeText(shareBuildUrl);
      import("sonner").then(({ toast }) => {
        toast.success("Build link copied to clipboard!");
      }).catch(() => {
        alert("Build link copied to clipboard!");
      });
    }
  };

  const whatsappMessage = useMemo(() => {
    const items = Array.from(selectedItems.values());
    let msg = `Hi! I'm interested in customizing my ${(model as any).name ?? "bike"} at Bikers Choice Kakinada.\n\n`;
    if (items.length > 0) {
      msg += `Selected customizations:\n`;
      const byCategory = new Map<string, SelectedItem[]>();
      for (const it of items) {
        if (!byCategory.has(it.categoryName)) byCategory.set(it.categoryName, []);
        byCategory.get(it.categoryName)!.push(it);
      }
      for (const [catName, catItems] of byCategory) {
        msg += `\n${catName}:\n`;
        for (const it of catItems) msg += `  • ${it.itemName} — ₹${it.price.toLocaleString("en-IN")}\n`;
      }
      msg += `\nEstimated Total: ₹${grandTotal.toLocaleString("en-IN")}\n`;
    }
    msg += `\nPage: ${shareBuildUrl}`;
    return encodeURIComponent(msg);
  }, [selectedItems, grandTotal, model, shareBuildUrl]);

  const { toggle: toggleFav, has: isFav } = useFavorites();
  const isFavorited = isFav(modelId);
  const [shareOpen, setShareOpen] = useState(false);

  const handleSelectImage = (idx: number) => {
    setActiveIdx(idx);
    setViewMode("detail");
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      params.set("img", String(idx));
      window.history.replaceState(null, "", `?${params.toString()}`);
    }
  };

  const handleBackToGallery = () => {
    setViewMode("gallery");
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      params.delete("img");
      window.history.replaceState(null, "", `?${params.toString()}`);
    }
  };

  const handleGridTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      setGridPinchStartDist(dist);
    }
  };

  const handleGridTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && gridPinchStartDist) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const diff = dist - gridPinchStartDist;
      if (Math.abs(diff) > 40) {
        if (diff > 0) {
          // Pinch Out (Zoom In) -> Increase columns (4 -> 5 -> 6)
          setGridCols((c) => Math.min(6, c + 1));
        } else {
          // Pinch In (Zoom Out) -> Decrease columns (2 -> 1)
          setGridCols((c) => Math.max(1, c - 1));
        }
        setGridPinchStartDist(dist);
      }
    }
  };

  const handleGridTouchEnd = () => {
    setGridPinchStartDist(null);
  };

  const totalImageCount = imagesData.count;
  const hasMoreImages = images.length < totalImageCount;
  const qc = useQueryClient();
  const [loadingMoreImages, setLoadingMoreImages] = useState(false);

  const loadMoreGridImages = async () => {
    setLoadingMoreImages(true);
    try {
      const next = await listImagesByModel({ data: { modelId, limit: 20, offset: images.length } });
      qc.setQueryData(["model-images", modelId], {
        rows: [...images, ...next.rows],
        count: next.count,
      });
    } finally {
      setLoadingMoreImages(false);
    }
  };

  return (
    <AppShell>
      {viewMode === "gallery" ? (
        <div className="space-y-6">
          {/* Header controls for grid view */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-4">
            <div className="flex items-center gap-3">
              <Link to="/" className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-widest transition hover:neon-ring">
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </Link>
              <div className="flex flex-col">
                <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  {(model as any).brand?.name ?? ""}
                </div>
                <h1 className="font-display text-lg font-bold uppercase tracking-wider">
                  {(model as any).name} Gallery
                </h1>
              </div>
            </div>
            
            {/* Column controller slider */}
            <div className="flex items-center justify-between sm:justify-end gap-3 bg-surface/30 px-4 py-2 rounded-2xl border border-border/40">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Columns: {gridCols}
              </span>
              <input 
                type="range" 
                min="1" 
                max="6" 
                value={gridCols} 
                onChange={(e) => setGridCols(parseInt(e.target.value, 10))}
                className="w-24 h-1 bg-surface-elevated rounded-lg appearance-none cursor-pointer accent-neon focus:outline-none"
              />
            </div>
          </div>

          <Suspense fallback={<RecentGridSkeleton />}>
            <MobileGalleryGrid
              images={images}
              gridCols={gridCols}
              onSelectImage={handleSelectImage}
              hasMore={hasMoreImages}
              loadingMore={loadingMoreImages}
              loadMore={loadMoreGridImages}
              totalCount={totalImageCount}
              onTouchStart={handleGridTouchStart}
              onTouchMove={handleGridTouchMove}
              onTouchEnd={handleGridTouchEnd}
            />
          </Suspense>
        </div>
      ) : (
        <div>
          {/* Back to Gallery Header */}
          <div className="mb-4 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={handleBackToGallery}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-semibold uppercase tracking-widest transition hover:neon-ring cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Gallery
            </button>
            <div className="text-right">
              <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {(model as any).brand?.name ?? ""}
              </div>
              <div className="font-display text-sm font-bold uppercase tracking-wider">
                {(model as any).name}
              </div>
            </div>
          </div>

          {/* Main Interactive Gallery Viewer */}
          <Suspense fallback={<GallerySkeleton />}>
            <Gallery
              modelId={modelId}
              activeIdx={activeIdx}
              setActiveIdx={setActiveIdx}
              onImageClick={(i) => setViewerAt(i)}
              isFavorited={isFavorited}
              onToggleFavorite={() => toggleFav(modelId)}
              onShareClick={() => setShareOpen(true)}
            />
          </Suspense>

          {/* Configurator details below */}
          {categoryMetas.length > 0 ? (
            <section className="mt-10">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-2">
                <div>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">Customise your bike</div>
                  <h2 className="font-display text-lg font-semibold uppercase tracking-widest">Pick your options</h2>
                </div>
                {selectedItems.size > 0 && (
                  <button
                    type="button"
                    onClick={clearSelections}
                    className="self-start sm:self-auto rounded-full border border-red-500/30 bg-red-950/20 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-red-400 hover:bg-red-500 hover:text-white transition-all cursor-pointer"
                  >
                    Clear My Selections
                  </button>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Select items below. Starred items are popular choices pre-selected for you.</p>
              <div className="mt-5 space-y-3">
                {categoryMetas.map((catMeta) => (
                  <CategorySection
                    key={catMeta.id}
                    modelId={modelId}
                    categoryMeta={catMeta}
                    selectedIds={selectedItems}
                    onToggle={toggleItem}
                  />
                ))}
              </div>
            </section>
          ) : (
            <div className="mt-10 rounded-2xl surface-panel p-6 text-center text-sm text-muted-foreground">
              No customization options configured yet for this model. Contact the shop for a custom quote.
            </div>
          )}

          {/* Bottom spacer to clear sticky bar */}
          <div className="h-32" />

          {/* Sticky Price Bar */}
          <PriceBar
            total={grandTotal}
            selectedCount={selectedItems.size}
            whatsappMessage={whatsappMessage}
            onViewBreakdown={() => setDrawerOpen(true)}
          />

          {/* Breakdown Drawer with Like to Save option */}
          {drawerOpen && (
            <BreakdownDrawer
              selectedItems={Array.from(selectedItems.values())}
              total={grandTotal}
              whatsappMessage={whatsappMessage}
              isFavorited={isFavorited}
              onToggleFavorite={() => toggleFav(modelId)}
              onClose={() => setDrawerOpen(false)}
            />
          )}

          {/* Share Drawer */}
          {shareOpen && (
            <ShareDrawer
              shareUrl={shareBuildUrl}
              whatsappMessage={whatsappMessage}
              onClose={() => setShareOpen(false)}
            />
          )}

          {/* Full-screen image viewer (optional/zoom fallback) */}
          <Suspense fallback={null}>
            {viewerAt !== null && (
              <GalleryViewer modelId={modelId} initialIndex={viewerAt} onClose={() => setViewerAt(null)} />
            )}
          </Suspense>
        </div>
      )}
    </AppShell>
  );
}

// ============================================================
// Gallery
// ============================================================
function Gallery({
  modelId,
  activeIdx,
  setActiveIdx,
  onImageClick,
  isFavorited,
  onToggleFavorite,
  onShareClick,
}: {
  modelId: string;
  activeIdx: number;
  setActiveIdx: (i: number) => void;
  onImageClick: (i: number) => void;
  isFavorited: boolean;
  onToggleFavorite: () => void;
  onShareClick: () => void;
}) {
  const { data } = useSuspenseQuery(imagesQuery(modelId));
  const images = data.rows;
  const totalCount = data.count;
  const qc = useQueryClient();
  const [loadingMore, setLoadingMore] = useState(false);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const next = await listImagesByModel({ data: { modelId, limit: 24, offset: images.length } });
      qc.setQueryData(["model-images", modelId], {
        rows: [...images, ...next.rows],
        count: next.count,
      });
    } finally {
      setLoadingMore(false);
    }
  };

  if (images.length === 0) {
    return (
      <div className="mt-6 flex h-48 items-center justify-center rounded-3xl surface-panel text-sm text-muted-foreground">
        No images uploaded yet for this model
      </div>
    );
  }

  const activeImgMeta = images[activeIdx];
  const prevImgMeta = activeIdx > 0 ? images[activeIdx - 1] : null;
  const nextImgMeta = activeIdx < images.length - 1 ? images[activeIdx + 1] : null;

  // 1. Fetch full details for the active image dynamically on-demand
  const { data: activeDetails } = useQuery(imageDetailQuery(activeImgMeta?.id));

  // 2. Fetch full details for previous & next images for instant transitions
  const { data: prevDetails } = useQuery(imageDetailQuery(prevImgMeta?.id));
  const { data: nextDetails } = useQuery(imageDetailQuery(nextImgMeta?.id));

  // 3. Prefetch metadata of adjacent images in query cache
  useEffect(() => {
    if (prevImgMeta?.id) {
      qc.prefetchQuery(imageDetailQuery(prevImgMeta.id));
    }
    if (nextImgMeta?.id) {
      qc.prefetchQuery(imageDetailQuery(nextImgMeta.id));
    }
  }, [prevImgMeta?.id, nextImgMeta?.id, qc]);

  const mainPath = activeDetails?.medium_path ?? activeImgMeta?.thumbnail_path;
  const previewPath = activeImgMeta?.thumbnail_path ?? null;
  const originalPath = activeDetails?.original_path ?? null;
  const hasMore = images.length < totalCount;

  // Gather paths to sign for active, prev, and next images
  const pathsToSign = useMemo(() => {
    const arr: string[] = [];
    if (mainPath) arr.push(mainPath);
    if (previewPath) arr.push(previewPath);
    if (originalPath) arr.push(originalPath);

    // Include adjacent images medium paths for browser cache preloading
    if (prevDetails?.medium_path) arr.push(prevDetails.medium_path);
    if (nextDetails?.medium_path) arr.push(nextDetails.medium_path);

    // Include strip thumbnails
    for (const img of images) {
      if (img.thumbnail_path) arr.push(img.thumbnail_path);
    }
    return [...new Set(arr)];
  }, [mainPath, previewPath, originalPath, prevDetails?.medium_path, nextDetails?.medium_path, images]);

  const { urls } = useSignedUrls(pathsToSign);
  const prevMediumUrl = prevDetails?.medium_path ? urls[prevDetails.medium_path] : null;
  const nextMediumUrl = nextDetails?.medium_path ? urls[nextDetails.medium_path] : null;

  return (
    <div className="mt-6">
      {/* Invisible preload images for browser cache preloading */}
      {prevMediumUrl && <img src={prevMediumUrl} className="hidden" aria-hidden="true" alt="" />}
      {nextMediumUrl && <img src={nextMediumUrl} className="hidden" aria-hidden="true" alt="" />}

      {/* Main image container */}
      <div className="relative overflow-hidden rounded-3xl border border-border neon-ring bg-surface/30">
        <InteractiveImage
          path={mainPath ?? ""}
          previewPath={previewPath ?? undefined}
          originalPath={originalPath ?? undefined}
          alt={activeDetails?.title ?? "Bike"}
          onNext={() => setActiveIdx(Math.min(images.length - 1, activeIdx + 1))}
          onPrev={() => setActiveIdx(Math.max(0, activeIdx - 1))}
        />

        {/* Floating actions overlay (bottom-right corner) */}
        <div className="absolute bottom-3 right-3 flex flex-col gap-2 z-10 font-sans">
          {/* Like Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onToggleFavorite();
            }}
            className="grid h-11 w-11 place-items-center rounded-full bg-black/60 hover:bg-black/80 border border-border/40 text-foreground transition duration-300 hover:scale-105 active:scale-95 shadow-lg cursor-pointer"
            title={isFavorited ? "Remove from Favorites" : "Save to Favorites"}
          >
            <Heart className={cn("h-4.5 w-4.5 transition-all duration-300", isFavorited ? "fill-red-500 text-red-500 scale-110" : "text-white")} />
          </button>

          {/* Share Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onShareClick();
            }}
            className="grid h-11 w-11 place-items-center rounded-full bg-black/60 hover:bg-black/80 border border-border/40 text-foreground transition duration-300 hover:scale-105 active:scale-95 shadow-lg cursor-pointer"
            title="Share Build"
          >
            <Share2 className="h-4.5 w-4.5 text-white" />
          </button>
        </div>
      </div>

      {images.length > 1 && (
        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto scrollbar-none px-4 pb-2">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setActiveIdx(i)}
              className={cn(
                "shrink-0 overflow-hidden rounded-xl border transition",
                i === activeIdx ? "border-neon neon-ring" : "border-border opacity-60 hover:opacity-100",
              )}
              style={{ width: 72, height: 60 }}
            >
              <SignedImage path={img.thumbnail_path} alt="" aspect="6/5" />
            </button>
          ))}
          {hasMore && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="shrink-0 grid place-items-center rounded-xl border border-dashed border-border bg-surface/50 text-muted-foreground hover:border-neon hover:text-neon transition text-[10px] font-bold uppercase tracking-wider disabled:opacity-50"
              style={{ width: 72, height: 60 }}
            >
              {loadingMore ? "…" : `+${totalCount - images.length}`}
            </button>
          )}
        </div>
      )}

      {/* Description & tags for active image */}
      {activeDetails?.description && (
        <p className="mt-3 text-xs text-muted-foreground px-1 italic">
          {activeDetails.description}
        </p>
      )}
      {activeDetails?.tags && activeDetails.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2 px-1">
          {activeDetails.tags.map((tag: string) => (
            <span key={tag} className="bg-neon/10 border border-neon/20 text-neon text-[9px] px-2 py-0.5 rounded-full">
              #{tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function GalleryViewer({ modelId, initialIndex, onClose }: { modelId: string; initialIndex: number; onClose: () => void }) {
  const { data } = useSuspenseQuery(imagesQuery(modelId));
  const images = data.rows;
  if (images.length === 0) return null;
  return <ImageViewer images={images as any} initialIndex={initialIndex} onClose={onClose} />;
}

function GallerySkeleton() {
  return (
    <div className="mt-6">
      <div className="aspect-[16/10] animate-pulse rounded-3xl bg-gradient-to-br from-surface-elevated via-surface to-background" />
      <div className="mt-3 flex gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 w-[72px] shrink-0 animate-pulse rounded-xl bg-surface" />
        ))}
      </div>
    </div>
  );
}

function RecentGridSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="aspect-square animate-pulse rounded-2xl bg-gradient-to-br from-surface-elevated via-surface to-background" />
      ))}
    </div>
  );
}

// ============================================================
// Category Section (Accordion with Lazy Item Loading)
// ============================================================
function CategorySection({
  modelId,
  categoryMeta,
  selectedIds,
  onToggle,
}: {
  modelId: string;
  categoryMeta: ConfiguratorCategoryMeta;
  selectedIds: Map<string, SelectedItem>;
  onToggle: (categoryId: string, categoryName: string, item: CategoryItemRow) => void;
}) {
  const [open, setOpen] = useState(false);

  // Lazy-load items only when the category is expanded
  const { data: items, isLoading } = useQuery({
    queryKey: ["configurator-items", modelId, categoryMeta.id],
    queryFn: () => getConfiguratorCategoryItems({ data: { modelId, categoryId: categoryMeta.id } }),
    enabled: open,
    staleTime: 1000 * 60 * 10,
  });

  const loadedItems = items ?? [];
  const selectedCount = loadedItems.filter((i) => selectedIds.has(i.id)).length;
  const categoryTotal = loadedItems
    .filter((i) => selectedIds.has(i.id))
    .reduce((sum, i) => sum + i.price, 0);

  return (
    <div className="overflow-hidden rounded-2xl surface-panel">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3.5"
      >
        <div className="flex items-center gap-3">
          <span className="font-display text-sm font-semibold uppercase tracking-wider">{categoryMeta.name}</span>
          {selectedCount > 0 && (
            <span className="rounded-full bg-neon/15 px-2 py-0.5 text-[10px] font-bold text-neon">
              {selectedCount} · ₹{categoryTotal.toLocaleString("en-IN")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{categoryMeta.itemCount} options</span>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-border/50 px-4 pb-4">
          {isLoading ? (
            <div className="mt-3 space-y-2">
              {Array.from({ length: Math.min(categoryMeta.itemCount, 4) }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl bg-surface" />
              ))}
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {loadedItems.map((item) => {
                const selected = selectedIds.has(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onToggle(categoryMeta.id, categoryMeta.name, item)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-all",
                      selected
                        ? "border-neon/50 bg-neon/8 neon-ring"
                        : "border-border bg-surface/50 hover:border-border/80 hover:bg-surface",
                    )}
                  >
                    {/* Checkbox */}
                    <span
                      className={cn(
                        "grid h-5 w-5 shrink-0 place-items-center rounded border transition",
                        selected ? "border-neon bg-neon text-neon-foreground" : "border-border",
                      )}
                    >
                      {selected && <Check className="h-3 w-3" />}
                    </span>

                    {/* Item info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium">{item.name}</span>
                        {item.is_recommended && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-yellow-400/15 px-2 py-0.5 text-[10px] font-semibold text-yellow-400">
                            <Star className="h-2.5 w-2.5 fill-yellow-400" /> Popular
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <div className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{item.description}</div>
                      )}
                    </div>

                    {/* Price */}
                    <span className={cn("shrink-0 font-display text-sm font-semibold", selected ? "text-neon" : "text-foreground")}>
                      ₹{item.price.toLocaleString("en-IN")}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Sticky Price Bar
// ============================================================
const PriceBar = memo(function PriceBar({
  total,
  selectedCount,
  whatsappMessage,
  onViewBreakdown,
}: {
  total: number;
  selectedCount: number;
  whatsappMessage: string;
  onViewBreakdown: () => void;
}) {
  return (
    <div className="fixed bottom-0 inset-x-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="mx-auto max-w-7xl px-4 py-3 md:px-8">
        <div className="flex items-center gap-3">
          {/* Total */}
          <button
            type="button"
            onClick={onViewBreakdown}
            className="flex flex-col items-start"
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {selectedCount > 0 ? `${selectedCount} selected` : "Select items above"}
            </span>
            <span className="font-display text-xl font-bold neon-text transition-all">
              {total > 0 ? `₹${total.toLocaleString("en-IN")}` : "₹0"}
            </span>
          </button>

          <div className="flex flex-1 justify-end gap-2">
            {total > 0 && (
              <button
                type="button"
                onClick={onViewBreakdown}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-2 text-xs font-semibold uppercase tracking-widest hover:neon-ring"
              >
                <ShoppingCart className="h-3.5 w-3.5" /> Breakdown
              </button>
            )}
            <a
              href={`https://wa.me/918523876978?text=${whatsappMessage}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-neon px-4 py-2 text-xs font-bold uppercase tracking-widest text-neon-foreground shadow-neon"
            >
              <MessageCircle className="h-3.5 w-3.5" /> Enquire
            </a>
            <a
              href="tel:+918523876978"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-2 text-xs font-semibold uppercase tracking-widest hover:neon-ring"
            >
              <Phone className="h-3.5 w-3.5" /> Call
            </a>
          </div>
        </div>
      </div>
    </div>
  );
});

// ============================================================
// Breakdown Drawer
// ============================================================
function BreakdownDrawer({
  selectedItems,
  total,
  whatsappMessage,
  isFavorited,
  onToggleFavorite,
  onClose,
}: {
  selectedItems: SelectedItem[];
  total: number;
  whatsappMessage: string;
  isFavorited: boolean;
  onToggleFavorite: () => void;
  onClose: () => void;
}) {
  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; items: SelectedItem[] }>();
    for (const it of selectedItems) {
      if (!map.has(it.categoryId)) map.set(it.categoryId, { name: it.categoryName, items: [] });
      map.get(it.categoryId)!.items.push(it);
    }
    return Array.from(map.values());
  }, [selectedItems]);

  // Close on backdrop click
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-background/70 backdrop-blur md:items-center md:justify-center" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl border border-border bg-surface p-6 md:max-w-lg md:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-semibold uppercase tracking-widest">Your selection</h2>
          <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full border border-border cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        {selectedItems.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No items selected yet. Go back and pick some options.</p>
        ) : (
          <div className="space-y-4">
            {grouped.map(({ name, items }) => (
              <div key={name}>
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{name}</div>
                <div className="space-y-1.5">
                  {items.map((it) => (
                    <div key={it.itemId} className="flex justify-between text-sm">
                      <span>{it.itemName}</span>
                      <span className="font-display text-neon">₹{it.price.toLocaleString("en-IN")}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 border-t border-border pt-4">
          <div className="flex justify-between font-display text-lg font-bold">
            <span>Grand Total</span>
            <span className="neon-text">₹{total.toLocaleString("en-IN")}</span>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3">
          {/* Like/Save Button inside Breakdown */}
          <button
            type="button"
            onClick={onToggleFavorite}
            className={cn(
              "flex items-center justify-center gap-2 rounded-full border py-3 text-xs font-bold uppercase tracking-widest transition cursor-pointer",
              isFavorited
                ? "border-red-500/30 bg-red-950/20 text-red-400"
                : "border-border bg-background hover:neon-ring text-foreground"
            )}
          >
            <Heart className={cn("h-4 w-4 transition-all duration-300", isFavorited ? "fill-red-500 text-red-500 scale-110" : "text-white")} />
            {isFavorited ? "Saved to Favorites" : "Save to Favorites"}
          </button>

          <a
            href={`https://wa.me/918523876978?text=${whatsappMessage}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-full bg-neon px-5 py-3 text-xs font-bold uppercase tracking-widest text-neon-foreground shadow-neon"
          >
            <MessageCircle className="h-4 w-4" /> Enquire on WhatsApp
          </a>
          <a
            href="tel:+918523876978"
            className="flex items-center justify-center gap-2 rounded-full border border-border bg-background px-5 py-3 text-xs font-bold uppercase tracking-widest hover:neon-ring"
          >
            <Phone className="h-4 w-4" /> Call the Shop
          </a>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Share Drawer
// ============================================================
function ShareDrawer({
  shareUrl,
  whatsappMessage,
  onClose,
}: {
  shareUrl: string;
  whatsappMessage: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert("Failed to copy link.");
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "My Customized Bike Build",
          url: shareUrl,
        });
      } catch {
        /* Cancelled */
      }
    } else {
      handleCopyLink();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-background/70 backdrop-blur md:items-center md:justify-center" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl border border-border bg-surface p-6 md:max-w-lg md:rounded-3xl font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-semibold uppercase tracking-widest text-foreground">Share this build</h2>
          <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full border border-border cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {/* Copy Link Button */}
          <button
            type="button"
            onClick={handleCopyLink}
            className="w-full flex items-center justify-between gap-3 rounded-xl border border-border bg-background/50 hover:bg-surface px-4 py-3.5 transition cursor-pointer text-left"
          >
            <div className="flex items-center gap-3">
              <Copy className="h-4 w-4 text-neon" />
              <span className="text-sm font-semibold uppercase tracking-wider text-foreground">
                {copied ? "Copied!" : "Copy Link"}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Get build URL</span>
          </button>

          {/* WhatsApp Button */}
          <a
            href={`https://wa.me/?text=${whatsappMessage}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-between gap-3 rounded-xl border border-border bg-background/50 hover:bg-surface px-4 py-3.5 transition cursor-pointer text-left"
          >
            <div className="flex items-center gap-3">
              <MessageCircle className="h-4 w-4 text-emerald-400" />
              <span className="text-sm font-semibold uppercase tracking-wider text-foreground">
                Share on WhatsApp
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Send to a friend</span>
          </a>

          {/* System Share API if supported */}
          {typeof navigator !== "undefined" && typeof navigator.share === "function" && (
            <button
              type="button"
              onClick={handleNativeShare}
              className="w-full flex items-center justify-between gap-3 rounded-xl border border-border bg-background/50 hover:bg-surface px-4 py-3.5 transition cursor-pointer text-left"
            >
              <div className="flex items-center gap-3">
                <Share2 className="h-4 w-4 text-sky-400" />
                <span className="text-sm font-semibold uppercase tracking-wider text-foreground">
                  Other Apps
                </span>
              </div>
              <span className="text-xs text-muted-foreground">Native sharing</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Virtualized Row (Zero Layout Shift Row-level Virtualization)
// ============================================================
function VirtualizedRow({ children, cols }: { children: React.ReactNode; cols: number }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry.isIntersecting);
      },
      { rootMargin: "400px" } // Preload buffer: 400px above and below viewport
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div 
      ref={ref} 
      className="w-full grid gap-2 sm:gap-3"
      style={{ 
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        minHeight: visible ? "auto" : "0px",
        aspectRatio: visible ? "auto" : `${cols}/1`
      }}
    >
      {visible ? children : null}
    </div>
  );
}

// ============================================================
// Lazy Grid Item (Grid Cell Mount Controller)
// ============================================================
function LazyGridItem({ children }: { children: React.ReactNode }) {
  return (
    <div className="aspect-square relative w-full overflow-hidden bg-surface rounded-2xl border border-border/40">
      {children}
    </div>
  );
}

// ============================================================
// Mobile Gallery Grid
// ============================================================
function MobileGalleryGrid({
  images,
  gridCols,
  onSelectImage,
  hasMore,
  loadingMore,
  loadMore,
  totalCount,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
}: {
  images: any[];
  gridCols: number;
  onSelectImage: (idx: number) => void;
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
  totalCount: number;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
}) {
  // Partition images list into rows of size gridCols
  const rows: any[][] = [];
  for (let i = 0; i < images.length; i += gridCols) {
    rows.push(images.slice(i, i + gridCols));
  }

  // Automatic infinite scroll observer
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sentinelRef.current || !hasMore || loadingMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: "250px" } // fetch next batch 250px before screen bottom
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadMore]);

  return (
    <div 
      className="space-y-2 sm:space-y-3"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {rows.map((rowItems, rowIndex) => (
        <VirtualizedRow key={rowIndex} cols={gridCols}>
          {rowItems.map((img, colIndex) => {
            const globalIndex = rowIndex * gridCols + colIndex;
            return (
              <LazyGridItem key={img.id}>
                <button
                  type="button"
                  onClick={() => onSelectImage(globalIndex)}
                  className="w-full h-full block cursor-pointer transition transform hover:scale-[1.02] active:scale-95"
                >
                  <SignedImage
                    path={img.thumbnail_path}
                    alt=""
                    aspect="1/1"
                    className="h-full w-full object-cover rounded-2xl"
                  />
                </button>
              </LazyGridItem>
            );
          })}
          {/* Pad last incomplete row to prevent stretching */}
          {rowItems.length < gridCols && 
            Array.from({ length: gridCols - rowItems.length }).map((_, i) => (
              <div key={`pad-${i}`} className="w-full aspect-square bg-transparent" />
            ))
          }
        </VirtualizedRow>
      ))}

      {/* Invisible sentinel element for automatic scroll trigger */}
      <div ref={sentinelRef} className="h-10 w-full flex items-center justify-center">
        {loadingMore && (
          <div className="text-xs text-muted-foreground animate-pulse">
            Loading next designs...
          </div>
        )}
      </div>

      {hasMore && !loadingMore && (
        <div className="flex justify-center pt-2 pb-6">
          <button
            type="button"
            onClick={loadMore}
            className="rounded-full border border-border bg-surface px-5 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition cursor-pointer"
          >
            Load More (+{totalCount - images.length})
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Interactive Image Component (Touch Gestures: Swipe, Pinch, Drag)
// ============================================================
interface InteractiveImageProps {
  path: string; // medium path
  previewPath?: string; // thumbnail path
  originalPath?: string; // original uploaded path
  alt: string;
  onNext: () => void;
  onPrev: () => void;
}

export function InteractiveImage({ path, previewPath, originalPath, alt, onNext, onPrev }: InteractiveImageProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [pinchStartDist, setPinchStartDist] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [lastTap, setLastTap] = useState<number>(0);

  // Reset zoom and panning coordinates on active image change
  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, [path]);

  // Request original path ONLY when scale > 1 (zoomed in)
  const paths = useMemo(() => {
    const arr = [path];
    if (previewPath) arr.push(previewPath);
    if (scale > 1 && originalPath) arr.push(originalPath);
    return arr;
  }, [path, previewPath, originalPath, scale]);

  const { urls } = useSignedUrls(paths);
  const mainUrl = urls[path];
  const previewUrl = previewPath ? urls[previewPath] : null;
  const originalUrl = scale > 1 && originalPath ? urls[originalPath] : null;

  const [loaded, setLoaded] = useState(false);
  const [zoomLoaded, setZoomLoaded] = useState(false);

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
        
        // Panning bounds based on scale zoom levels
        const maxPanX = (scale - 1) * 150;
        const maxPanY = (scale - 1) * 100;
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

    // Swipe trigger on scale === 1
    if (scale === 1 && touchStart && e.changedTouches.length === 1) {
      const t = e.changedTouches[0];
      const deltaX = t.clientX - touchStart.x;
      const deltaY = t.clientY - touchStart.y;

      if (Math.abs(deltaX) > 60 && Math.abs(deltaY) < 60) {
        if (deltaX < 0) {
          onNext();
        } else {
          onPrev();
        }
      }
    }
    setTouchStart(null);
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

  return (
    <div 
      className="relative overflow-hidden w-full aspect-[16/10] bg-surface/30 rounded-3xl select-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={handleDoubleTap}
    >
      <div 
        className="w-full h-full transition-transform duration-100 ease-out flex items-center justify-center"
        style={{
          transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`,
          transformOrigin: "center center"
        }}
      >
        {/* Preview / Blurred Layer */}
        {previewUrl && !loaded && (
          <img
            src={previewUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover filter blur-md opacity-70 transition-opacity duration-300 rounded-3xl"
          />
        )}

        {/* Medium Res Layer */}
        {mainUrl && (
          <img
            src={mainUrl}
            alt={alt}
            onLoad={() => setLoaded(true)}
            className={cn(
              "absolute inset-0 h-full w-full object-cover rounded-3xl transition-opacity duration-500",
              loaded ? "opacity-100" : "opacity-0"
            )}
          />
        )}

        {/* High Res Original Layer (Loaded ONLY when zoomed in) */}
        {scale > 1 && originalUrl && (
          <img
            src={originalUrl}
            alt={alt}
            onLoad={() => setZoomLoaded(true)}
            className={cn(
              "absolute inset-0 h-full w-full object-cover rounded-3xl transition-opacity duration-300",
              zoomLoaded ? "opacity-100" : "opacity-0"
            )}
          />
        )}
      </div>
    </div>
  );
}

