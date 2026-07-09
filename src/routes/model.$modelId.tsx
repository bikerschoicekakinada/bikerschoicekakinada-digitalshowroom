import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { Suspense, useState, useMemo, useCallback, useEffect, useRef } from "react";
import { ArrowLeft, Share2, ShoppingCart, Star, ChevronDown, ChevronUp, Phone, MessageCircle, X, Check, Heart, Copy } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { SignedImage } from "@/components/SignedImage";
import { ImageViewer } from "@/components/ImageViewer";
import { getConfiguratorData, listImagesByModel, getImageOverrides, mergeConfiguratorData, type ConfiguratorCategoryRow, type CategoryItemRow } from "@/lib/catalog.functions";
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

const configuratorQuery = (modelId: string) =>
  queryOptions({
    queryKey: ["configurator", modelId],
    queryFn: () => getConfiguratorData({ data: { modelId } }),
    staleTime: 1000 * 60 * 10,
  });

const imagesQuery = (modelId: string) =>
  queryOptions({
    queryKey: ["model-images", modelId],
    queryFn: () => listImagesByModel({ data: { modelId, limit: 40, offset: 0 } }),
    staleTime: 1000 * 60 * 5,
  });

export const Route = createFileRoute("/model/$modelId")({
  validateSearch: zodValidator(configuratorSearchSchema),
  loader: async ({ params, context }) => {
    const data = await context.queryClient.ensureQueryData(configuratorQuery(params.modelId));
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
  
  // 1. Suspense-load configurator model defaults and images list
  const { data } = useSuspenseQuery(configuratorQuery(modelId));
  const { data: imagesData } = useSuspenseQuery(imagesQuery(modelId));
  const images = imagesData.rows;

  const [viewerAt, setViewerAt] = useState<number | null>(null);
  const [selectedItems, setSelectedItems] = useState<Map<string, SelectedItem>>(new Map());
  const [activeIdx, setActiveIdx] = useState(0);
  const [loadedFromStorage, setLoadedFromStorage] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const model = data!.model;
  const categories = data!.categories;

  // 2. Fetch overrides for the active design image dynamically
  const activeDesignId = images[activeIdx]?.id;
  const { data: overrides } = useQuery({
    queryKey: ["image-overrides", activeDesignId],
    queryFn: () => getImageOverrides({ data: { designId: activeDesignId } }),
    enabled: !!activeDesignId,
    staleTime: 1000 * 60 * 5,
  });

  // 3. Compute merged categories options
  const mergedCategories = useMemo(() => {
    if (!overrides || overrides.length === 0) return categories;
    return mergeConfiguratorData(categories, overrides);
  }, [categories, overrides]);

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

  // Synchronize selections with current merged configurator options and session data
  useEffect(() => {
    if (!loadedFromStorage) return;
    if (interacted) return;

    const restoredIds = restoredItemIdsRef.current;
    const initial = new Map<string, SelectedItem>();

    if (restoredIds && restoredIds.length > 0) {
      for (const cat of mergedCategories) {
        for (const item of cat.items) {
          if (restoredIds.includes(item.id)) {
            initial.set(item.id, {
              categoryId: cat.id,
              categoryName: cat.name,
              itemId: item.id,
              itemName: item.name,
              price: item.price,
            });
          }
        }
      }
    } else {
      // Default pre-select recommended options
      for (const cat of mergedCategories) {
        for (const item of cat.items) {
          if (item.is_recommended) {
            initial.set(item.id, {
              categoryId: cat.id,
              categoryName: cat.name,
              itemId: item.id,
              itemName: item.name,
              price: item.price,
            });
          }
        }
      }
    }

    setSelectedItems(initial);
  }, [mergedCategories, loadedFromStorage, interacted]);

  const toggleItem = useCallback((cat: ConfiguratorCategoryRow, item: CategoryItemRow) => {
    setInteracted(true);
    setSelectedItems((prev) => {
      const next = new Map(prev);
      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.set(item.id, {
          categoryId: cat.id,
          categoryName: cat.name,
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

  return (
    <AppShell>
      {/* Back Button */}
      <div className="mb-4">
        <Link to="/" className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-widest">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Link>
      </div>

      {/* Model name */}
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
        {(model as any).brand?.name ?? ""}
      </div>
      <h1 className="font-display text-2xl font-bold uppercase tracking-wider md:text-3xl">
        {(model as any).name}
      </h1>

      {/* Image Gallery with floating Like & Share */}
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

      {/* Configurator */}
      {mergedCategories.length > 0 ? (
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
            {mergedCategories.map((cat) => (
              <CategorySection
                key={cat.id}
                category={cat}
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

      {/* Full-screen image viewer */}
      <Suspense fallback={null}>
        {viewerAt !== null && (
          <GalleryViewer modelId={modelId} initialIndex={viewerAt} onClose={() => setViewerAt(null)} />
        )}
      </Suspense>
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
  const allPaths = images.flatMap((img) => [img.thumbnail_path, ...img.image_paths].filter(Boolean));

  if (images.length === 0) {
    return (
      <div className="mt-6 flex h-48 items-center justify-center rounded-3xl surface-panel text-sm text-muted-foreground">
        No images uploaded yet for this model
      </div>
    );
  }

  const mainPath = images[0]?.thumbnail_path;
  const activeImg = images[activeIdx];
  const mainImgPath = activeImg?.medium_path ?? activeImg?.thumbnail_path ?? mainPath;
  const previewImgPath = activeImg?.thumbnail_path ?? null;

  return (
    <div className="mt-6">
      {/* Main image container */}
      <div className="relative overflow-hidden rounded-3xl border border-border neon-ring bg-surface/30">
        <button
          type="button"
          onClick={() => onImageClick(activeIdx)}
          className="block w-full cursor-pointer"
        >
          <SignedImage
            path={mainImgPath}
            previewPath={previewImgPath ?? undefined}
            alt={(images[activeIdx] as any)?.model?.name ?? "Bike"}
            aspect="16/10"
            priority
            className="rounded-3xl"
          />
        </button>

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
        </div>
      )}

      {/* Description & tags for active image */}
      {images[activeIdx]?.description && (
        <p className="mt-3 text-xs text-muted-foreground px-1 italic">
          {images[activeIdx].description}
        </p>
      )}
      {images[activeIdx]?.tags && images[activeIdx].tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2 px-1">
          {images[activeIdx].tags.map((tag: string) => (
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

// ============================================================
// Category Section (Accordion)
// ============================================================
function CategorySection({
  category,
  selectedIds,
  onToggle,
}: {
  category: ConfiguratorCategoryRow;
  selectedIds: Map<string, SelectedItem>;
  onToggle: (cat: ConfiguratorCategoryRow, item: CategoryItemRow) => void;
}) {
  const [open, setOpen] = useState(true);
  const selectedCount = category.items.filter((i) => selectedIds.has(i.id)).length;
  const categoryTotal = category.items
    .filter((i) => selectedIds.has(i.id))
    .reduce((sum, i) => sum + i.price, 0);

  if (category.items.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-2xl surface-panel">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3.5"
      >
        <div className="flex items-center gap-3">
          <span className="font-display text-sm font-semibold uppercase tracking-wider">{category.name}</span>
          {selectedCount > 0 && (
            <span className="rounded-full bg-neon/15 px-2 py-0.5 text-[10px] font-bold text-neon">
              {selectedCount} · ₹{categoryTotal.toLocaleString("en-IN")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{category.items.length} options</span>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-border/50 px-4 pb-4">
          <div className="mt-3 space-y-2">
            {category.items.map((item) => {
              const selected = selectedIds.has(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onToggle(category, item)}
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
        </div>
      )}
    </div>
  );
}

// ============================================================
// Sticky Price Bar
// ============================================================
function PriceBar({
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
}

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
