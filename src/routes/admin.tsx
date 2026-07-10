import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import {
  Lock,
  LogOut,
  Upload,
  Trash2,
  Plus,
  Loader2,
  X,
  ChevronDown,
  ChevronUp,
  Star,
  Eye,
  EyeOff,
  Check,
  Search,
  ImageIcon,
  Tag,
  Settings,
  Image as ImageIcon2,
  AlertTriangle,
  RefreshCw,
  Edit2,
  Sparkles,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { SignedImage } from "@/components/SignedImage";
import {
  adminDeleteCategory,
  adminDeleteCategoryItem,
  adminDeleteDesign,
  adminGetItemAssignments,
  adminListCategoryItems,
  adminListImages,
  adminLogin,
  adminLogout,
  adminReorderCategoryItems,
  adminSaveItemAssignments,
  adminStats,
  adminStatus,
  adminUploadImage,
  adminUpsertBrand,
  adminResetCatalog,
  adminUpsertCategory,
  adminUpsertCategoryItem,
  adminUpsertDesign,
  adminUpsertModel,
  adminCheckDuplicate,
  adminUpdateDesignMeta,
  adminReplaceDesignImage,
  adminListAllCatalogItems,
  adminSaveImageOverrides,
  adminOptimizeImage,
  adminReorderBrands,
} from "@/lib/admin.functions";
import {
  listBrands,
  listCategories,
  listModels,
  getImageOverrides,
  getConfiguratorData,
  type BrandRow,
  type CategoryRow,
  type ModelRow,
} from "@/lib/catalog.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Admin Control Panel — Bikers Choice Kakinada" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatRupees(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

async function computeHash(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ============================================================
// Top-level: auth gate
// ============================================================
function AdminPage() {
  const status = useServerFn(adminStatus);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "status"],
    queryFn: () => status(),
    staleTime: 1000 * 30,
  });

  return (
    <AppShell>
      {isLoading ? (
        <div className="grid min-h-[40vh] place-items-center">
          <Loader2 className="h-6 w-6 animate-spin text-neon" />
        </div>
      ) : data?.unlocked ? (
        <Dashboard />
      ) : (
        <LoginCard />
      )}
    </AppShell>
  );
}

// ============================================================
// Login Card
// ============================================================
function LoginCard() {
  const login = useServerFn(adminLogin);
  const qc = useQueryClient();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutate = useMutation({
    mutationFn: async () => login({ data: { pin } }),
    onSuccess: (res) => {
      if (!res.ok) {
        setError((res as any).reason ?? "Incorrect PIN");
        return;
      }
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (err: any) => setError(err?.message ?? "Login failed — check connection"),
  });

  return (
    <div className="mx-auto max-w-sm rounded-3xl surface-panel p-8 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-neon/15 text-neon">
        <Lock className="h-6 w-6" />
      </div>
      <h1 className="mt-4 font-display text-xl font-bold uppercase tracking-widest">Owner login</h1>
      <p className="mt-1 text-sm text-muted-foreground">Enter shop PIN to access admin panel.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          mutate.mutate();
        }}
        className="mt-6 space-y-3"
      >
        <input
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.currentTarget.value)}
          placeholder="••••••"
          className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-center font-display text-2xl tracking-[0.5em] outline-none focus:neon-ring"
        />
        {error ? <p className="text-xs text-crimson">{error}</p> : null}
        <button
          type="submit"
          disabled={mutate.isPending || pin.length < 4}
          className="w-full rounded-full bg-neon px-5 py-3 text-xs font-bold uppercase tracking-widest text-neon-foreground shadow-neon disabled:opacity-50"
        >
          {mutate.isPending ? "Unlocking…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}

// ============================================================
// Dashboard Tabs Configuration
// ============================================================
type AdminTab = "upload" | "library" | "images" | "taxonomy" | "settings";

function Dashboard() {
  const [tab, setTab] = useState<AdminTab>("upload");
  const logout = useServerFn(adminLogout);
  const qc = useQueryClient();
  const stats = useServerFn(adminStats);
  const statsQ = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => stats(),
    staleTime: 1000 * 30,
  });

  const tabs: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
    { id: "upload", label: "Upload", icon: <Upload className="h-3.5 w-3.5" /> },
    { id: "library", label: "Library", icon: <Tag className="h-3.5 w-3.5" /> },
    { id: "images", label: "Images", icon: <ImageIcon2 className="h-3.5 w-3.5" /> },
    { id: "taxonomy", label: "Brands & Models", icon: <Plus className="h-3.5 w-3.5" /> },
    { id: "settings", label: "Settings", icon: <Settings className="h-3.5 w-3.5" /> },
  ];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            Shop Admin
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold uppercase tracking-wider md:text-3xl">
            Catalog Control
          </h1>
        </div>
        <button
          onClick={async () => {
            await logout();
            qc.invalidateQueries({ queryKey: ["admin"] });
          }}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-widest hover:text-crimson"
        >
          <LogOut className="h-3.5 w-3.5" /> Logout
        </button>
      </div>

      {/* Stats tiles */}
      <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
        <StatTile label="Images" value={statsQ.data?.images} />
        <StatTile label="Categories" value={statsQ.data?.categories} />
        <StatTile label="Items" value={statsQ.data?.items} />
        <StatTile label="Brands" value={statsQ.data?.brands} />
        <StatTile label="Models" value={statsQ.data?.models} />
        <StatTile label="Assignments" value={statsQ.data?.assignments} />
      </div>

      {/* Admin Nav Tabs */}
      <div className="mt-6 flex gap-2 overflow-x-auto scrollbar-none">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "shrink-0 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-widest transition",
              tab === t.id
                ? "border-neon bg-neon/15 text-neon neon-ring"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "upload" && <UploadTab />}
        {tab === "library" && <LibraryTab />}
        {tab === "images" && <ImagesTab />}
        {tab === "taxonomy" && <TaxonomyTab />}
        {tab === "settings" && <SettingsTab />}
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-2xl surface-panel px-3 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-display text-xl font-bold neon-text">
        {value?.toLocaleString("en-IN") ?? "—"}
      </div>
    </div>
  );
}

// ============================================================
// Tab 1: Upload (with Duplicate Image Detection & Queue)
// ============================================================
type UploadQueueItem = {
  id: string;
  file: File;
  hash: string;
  size: number;
  status:
    | "pending"
    | "checking"
    | "duplicate"
    | "uploading"
    | "processing"
    | "optimizing"
    | "done"
    | "error";
  error?: string;
  existingDesign?: { id: string; thumbnail_path: string; title: string } | null;
  objectUrl: string;
};

function UploadTab() {
  const qc = useQueryClient();
  const uploadFn = useServerFn(adminUploadImage);
  const checkDuplicateFn = useServerFn(adminCheckDuplicate);
  const replaceImageFn = useServerFn(adminReplaceDesignImage);
  const upsertFn = useServerFn(adminUpsertDesign);
  const optimizeFn = useServerFn(adminOptimizeImage);

  const brands = useQuery({
    queryKey: ["brands"],
    queryFn: () => listBrands(),
    staleTime: 1000 * 60 * 5,
  });
  const [brandId, setBrandId] = useState("");
  const [modelId, setModelId] = useState("");
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [currentDuplicate, setCurrentDuplicate] = useState<UploadQueueItem | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const models = useQuery({
    queryKey: ["models", brandId],
    queryFn: () => listModels({ data: { brandId } }),
    enabled: !!brandId,
    staleTime: 1000 * 60 * 5,
  });

  // Drag & drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleAddFiles(e.dataTransfer.files);
    }
  };

  const fileInputHandler = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      await handleAddFiles(e.target.files);
    }
  };

  // Convert files list, hash them, and add to queue
  const handleAddFiles = async (fileList: FileList) => {
    if (!modelId) {
      alert("Please select Brand and Model first!");
      return;
    }
    const list: UploadQueueItem[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      const hash = await computeHash(f);
      list.push({
        id: crypto.randomUUID(),
        file: f,
        hash,
        size: f.size,
        status: "pending",
        objectUrl: URL.createObjectURL(f),
      });
    }
    setQueue((prev) => [...prev, ...list]);
  };

  // Process the queue item by item
  const processQueue = async () => {
    const nextItem = queue.find((q) => q.status === "pending");
    if (!nextItem) return;

    // 1. Check duplicate
    setQueue((prev) => prev.map((i) => (i.id === nextItem.id ? { ...i, status: "checking" } : i)));

    try {
      const existing = await checkDuplicateFn({
        data: { model_id: modelId, file_hash: nextItem.hash },
      });

      if (existing) {
        // Trigger Duplicate Resolution Dialog
        setQueue((prev) =>
          prev.map((i) =>
            i.id === nextItem.id ? { ...i, status: "duplicate", existingDesign: existing } : i,
          ),
        );
        setCurrentDuplicate({ ...nextItem, status: "duplicate", existingDesign: existing });
      } else {
        // Safe to upload
        await performUpload(nextItem);
      }
    } catch (err: any) {
      setQueue((prev) =>
        prev.map((i) => ({
          ...i,
          status: i.id === nextItem.id ? "error" : i.status,
          error: err.message,
        })),
      );
    }
  };

  useEffect(() => {
    // Process queue whenever there's a pending item and no modal is active
    if (!currentDuplicate) {
      processQueue();
    }
  }, [queue, currentDuplicate]);

  // Actual upload and database entry creation
  const performUpload = async (item: UploadQueueItem) => {
    setQueue((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: "uploading" } : i)));

    try {
      const base64 = await toBase64(item.file);
      const res = await uploadFn({
        data: { filename: item.file.name, contentType: item.file.type, base64 },
      });

      // Update to processing
      setQueue((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: "processing" } : i)));

      const brand = brands.data?.find((b) => b.id === brandId);
      const model = models.data?.find((m) => m.id === modelId);
      const title = `${brand?.name ?? ""} ${model?.name ?? ""}`.trim();

      const designRow = await upsertFn({
        data: {
          brand_id: brandId,
          model_id: modelId,
          title,
          thumbnail_path: res.path,
          file_hash: item.hash,
          file_size: item.size,
        },
      });

      // Update to optimizing
      setQueue((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: "optimizing" } : i)));

      // Trigger CDN optimization process
      await optimizeFn({
        data: {
          designId: designRow.id,
          originalPath: res.path,
        },
      });

      setQueue((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: "done" } : i)));
      qc.invalidateQueries({ queryKey: ["admin"] });
    } catch (err: any) {
      setQueue((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: "error", error: err.message } : i)),
      );
    }
  };

  // Duplicate resolutions
  const handleSkip = () => {
    if (!currentDuplicate) return;
    setQueue((prev) =>
      prev.map((i) => (i.id === currentDuplicate.id ? { ...i, status: "done" } : i)),
    );
    setCurrentDuplicate(null);
  };

  const handleReplace = async () => {
    if (!currentDuplicate || !currentDuplicate.existingDesign) return;
    const item = currentDuplicate;
    setCurrentDuplicate(null); // Close dialog

    setQueue((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: "uploading" } : i)));

    try {
      const base64 = await toBase64(item.file);
      const res = await uploadFn({
        data: { filename: item.file.name, contentType: item.file.type, base64 },
      });

      // Update to processing
      setQueue((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: "processing" } : i)));

      // Call replace function to update design row and delete old path from storage
      const designRow = await replaceImageFn({
        data: {
          id: item.existingDesign!.id,
          new_thumbnail_path: res.path,
          file_hash: item.hash,
          file_size: item.size,
        },
      });

      // Update to optimizing
      setQueue((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: "optimizing" } : i)));

      // Trigger CDN optimization process
      await optimizeFn({
        data: {
          designId: designRow.id,
          originalPath: res.path,
        },
      });

      setQueue((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: "done" } : i)));
      qc.invalidateQueries({ queryKey: ["admin"] });
    } catch (err: any) {
      setQueue((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: "error", error: err.message } : i)),
      );
    }
  };

  const handleCancelDuplicate = () => {
    if (!currentDuplicate) return;
    setQueue((prev) => prev.filter((i) => i.id !== currentDuplicate.id));
    setCurrentDuplicate(null);
  };

  return (
    <div className="space-y-5 rounded-3xl surface-panel p-5">
      <div>
        <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
          Step 1 — Tag the bike
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Brand</Label>
            <Select
              value={brandId}
              onChange={(v) => {
                setBrandId(v);
                setModelId("");
              }}
            >
              <option value="">Select brand…</option>
              {(brands.data ?? []).map((b: BrandRow) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Model *</Label>
            <Select value={modelId} onChange={setModelId} disabled={!brandId}>
              <option value="">Select model…</option>
              {(models.data ?? []).map((m: ModelRow & { designs_count?: number }) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.designs_count ?? 0} design{m.designs_count !== 1 ? "s" : ""})
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
          Step 2 — Upload images
        </div>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*"
          onChange={fileInputHandler}
          className="hidden"
          id="admin-file"
          disabled={!modelId}
        />
        <label
          htmlFor="admin-file"
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-8 text-center text-sm transition-all",
            !modelId
              ? "border-border/30 bg-surface opacity-40 cursor-not-allowed"
              : isDragActive
                ? "border-neon bg-neon/10 neon-ring"
                : "border-neon/40 bg-neon/5 text-muted-foreground hover:neon-ring",
          )}
        >
          <Upload className="h-5 w-5 text-neon" />
          <span>Drag & Drop photos here or Tap to browse</span>
          <span className="text-[11px] opacity-60">JPG, PNG, WebP supported</span>
        </label>

        {/* Upload Queue Grid */}
        {queue.length > 0 && (
          <div className="mt-4 border-t border-border/30 pt-3">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>Queue: {queue.length} items</span>
              <button
                type="button"
                onClick={() => setQueue([])}
                className="text-crimson hover:opacity-70 text-[11px] font-bold uppercase tracking-wider"
              >
                Clear list
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
              {queue.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "relative overflow-hidden rounded-xl border aspect-square flex flex-col justify-between p-1.5 transition",
                    item.status === "done"
                      ? "border-neon/40 bg-neon/5"
                      : item.status === "duplicate"
                        ? "border-yellow-400 bg-yellow-400/5"
                        : item.status === "error"
                          ? "border-crimson/40 bg-crimson/5"
                          : "border-border bg-surface",
                  )}
                >
                  <img
                    src={item.objectUrl}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover opacity-50 z-0"
                  />

                  {/* Status indicator badge */}
                  <div className="z-10 self-start">
                    {item.status === "checking" && (
                      <span className="bg-yellow-400/20 text-yellow-400 text-[9px] px-1 py-0.5 rounded font-medium">
                        Checking...
                      </span>
                    )}
                    {item.status === "uploading" && (
                      <span className="bg-neon/20 text-neon text-[9px] px-1 py-0.5 rounded font-medium animate-pulse">
                        Uploading...
                      </span>
                    )}
                    {item.status === "processing" && (
                      <span className="bg-indigo-400/20 text-indigo-400 text-[9px] px-1 py-0.5 rounded font-medium animate-pulse">
                        Processing Image...
                      </span>
                    )}
                    {item.status === "optimizing" && (
                      <span className="bg-cyan-400/20 text-cyan-400 text-[9px] px-1 py-0.5 rounded font-medium animate-pulse font-sans">
                        Generating Optimized Versions...
                      </span>
                    )}
                    {item.status === "duplicate" && (
                      <span className="bg-yellow-400 text-black text-[9px] px-1 py-0.5 rounded font-bold uppercase flex items-center gap-0.5">
                        <AlertTriangle className="h-2 w-2" /> Duplicate
                      </span>
                    )}
                    {item.status === "done" && (
                      <span className="bg-neon text-black text-[9px] px-1 py-0.5 rounded font-bold">
                        ✓ Completed.
                      </span>
                    )}
                    {item.status === "error" && (
                      <span className="bg-crimson text-white text-[9px] px-1 py-0.5 rounded font-bold">
                        Error
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setQueue((prev) => prev.filter((i) => i.id !== item.id))}
                    className="absolute right-1 top-1 z-20 grid h-5 w-5 place-items-center rounded-full bg-background/80 text-muted-foreground hover:text-crimson"
                  >
                    <X className="h-3 w-3" />
                  </button>
                  <span className="z-10 text-[9px] text-muted-foreground truncate w-full self-end bg-background/70 px-1 py-0.5 rounded">
                    {item.file.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Duplicate Dialog Modal */}
      {currentDuplicate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="max-w-md w-full rounded-3xl surface-panel border border-yellow-400/30 p-6 space-y-4">
            <div className="flex items-center gap-2.5 text-yellow-400">
              <AlertTriangle className="h-6 w-6" />
              <h3 className="font-display text-base font-bold uppercase tracking-wider">
                Image already exists
              </h3>
            </div>
            <p className="text-xs text-muted-foreground">
              An identical image was found in this model library:
              <br />
              <strong className="text-foreground">{currentDuplicate.file.name}</strong>
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleSkip}
                className="flex-1 rounded-full border border-border py-2 text-xs font-semibold uppercase hover:neon-ring"
              >
                Skip Upload
              </button>
              <button
                onClick={handleReplace}
                className="flex-1 rounded-full bg-neon text-black py-2 text-xs font-bold uppercase shadow-neon"
              >
                Replace Existing
              </button>
              <button
                onClick={handleCancelDuplicate}
                className="rounded-full border border-crimson/50 text-crimson px-3 py-2 text-xs font-semibold uppercase"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Tab 2: Category Library (Assignments managed INLINE)
// ============================================================
function LibraryTab() {
  const qc = useQueryClient();
  const upsertCat = useServerFn(adminUpsertCategory);
  const deleteCat = useServerFn(adminDeleteCategory);
  const cats = useQuery({
    queryKey: ["categories"],
    queryFn: () => listCategories(),
    staleTime: 1000 * 60 * 5,
  });
  const [newCatName, setNewCatName] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const inv = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["categories"] });
    qc.invalidateQueries({ queryKey: ["admin"] });
  }, [qc]);

  const handleCreateCat = async () => {
    if (!newCatName.trim()) return;
    setCreating(true);
    await upsertCat({
      data: {
        name: newCatName.trim(),
        slug: slugify(newCatName),
        sort_order: (cats.data?.length ?? 0) + 1,
      },
    });
    setNewCatName("");
    inv();
    setCreating(false);
  };

  return (
    <div className="space-y-4">
      {/* Create new category */}
      <div className="rounded-3xl surface-panel p-5">
        <h3 className="font-display text-sm font-bold uppercase tracking-widest text-neon">
          Category Library
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Manage your custom configuration library and bike model linkings.
        </p>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            handleCreateCat();
          }}
        >
          <input
            value={newCatName}
            onChange={(e) => setNewCatName(e.currentTarget.value)}
            placeholder="New category name (e.g. Wrap Styles)"
            disabled={creating}
            className="flex-1 rounded-full border border-border bg-surface px-4 py-2 text-sm outline-none focus:neon-ring disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!newCatName.trim() || creating}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-neon text-neon-foreground shadow-neon disabled:opacity-40"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </button>
        </form>
      </div>

      {/* Categories listing */}
      {cats.isError ? (
        <div className="rounded-3xl border border-crimson/50 bg-crimson/5 p-6 text-center">
          <AlertTriangle className="h-6 w-6 text-crimson mx-auto mb-2" />
          <p className="text-xs text-crimson font-medium mb-3">Failed to load categories</p>
          <button
            type="button"
            onClick={() => cats.refetch()}
            className="rounded-full border border-neon/50 bg-neon/10 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-neon hover:bg-neon hover:text-black"
          >
            Retry
          </button>
        </div>
      ) : cats.isLoading ? (
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-neon" />
      ) : cats.data?.length === 0 ? (
        <div className="rounded-3xl surface-panel p-6 text-center text-xs text-muted-foreground">
          No categories created yet. Add your first category above!
        </div>
      ) : (
        (cats.data ?? []).map((cat: CategoryRow) => (
          <CategoryLibraryCard
            key={cat.id}
            category={cat}
            expanded={expandedId === cat.id}
            onToggle={() => setExpandedId(expandedId === cat.id ? null : cat.id)}
            onDelete={async () => {
              if (
                window.confirm(
                  `Are you sure you want to delete "${cat.name}"? This removes all items inside too.`,
                )
              ) {
                await deleteCat({ data: { id: cat.id } });
                inv();
              }
            }}
            onRename={async (name) => {
              await upsertCat({
                data: {
                  id: cat.id,
                  name,
                  slug: slugify(name),
                  sort_order: cat.sort_order,
                  is_active: cat.is_active,
                },
              });
              inv();
            }}
            onToggleActive={async () => {
              await upsertCat({
                data: {
                  id: cat.id,
                  name: cat.name,
                  slug: cat.slug,
                  sort_order: cat.sort_order,
                  is_active: !cat.is_active,
                },
              });
              inv();
            }}
          />
        ))
      )}
    </div>
  );
}

function CategoryLibraryCard({
  category,
  expanded,
  onToggle,
  onDelete,
  onRename,
  onToggleActive,
}: {
  category: CategoryRow;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onRename: (name: string) => Promise<void>;
  onToggleActive: () => Promise<void>;
}) {
  const qc = useQueryClient();
  const upsertItem = useServerFn(adminUpsertCategoryItem);
  const deleteItem = useServerFn(adminDeleteCategoryItem);

  const itemsQ = useQuery({
    queryKey: ["admin-items", category.id],
    queryFn: () => adminListCategoryItems({ data: { category_id: category.id } }),
    enabled: expanded,
  });

  const [newItemName, setNewItemName] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [newItemDesc, setNewItemDesc] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [catNameVal, setCatNameVal] = useState(category.name);
  const [savingItem, setSavingItem] = useState(false);

  const invItems = () => qc.invalidateQueries({ queryKey: ["admin-items", category.id] });

  const handleAddItem = async () => {
    if (!newItemName.trim() || !newItemPrice) return;
    setSavingItem(true);
    await upsertItem({
      data: {
        category_id: category.id,
        name: newItemName.trim(),
        price: parseInt(newItemPrice, 10),
        description: newItemDesc.trim() || null,
        sort_order: (itemsQ.data?.length ?? 0) + 1,
      },
    });
    setNewItemName("");
    setNewItemPrice("");
    setNewItemDesc("");
    invItems();
    setSavingItem(false);
  };

  return (
    <div className="rounded-2xl surface-panel overflow-hidden">
      {/* Category header control bar */}
      <div className="flex items-center gap-3 p-4">
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 flex items-center gap-3 text-left"
        >
          <span
            className={cn(
              "h-2 w-2 rounded-full shrink-0",
              category.is_active ? "bg-neon" : "bg-muted-foreground/40",
            )}
          />
          {editingName ? (
            <input
              autoFocus
              value={catNameVal}
              onChange={(e) => setCatNameVal(e.currentTarget.value)}
              onBlur={async () => {
                setEditingName(false);
                if (catNameVal.trim() !== category.name) await onRename(catNameVal.trim());
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  setEditingName(false);
                  setCatNameVal(category.name);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 rounded-lg border border-neon/50 bg-surface px-2 py-0.5 text-sm font-semibold outline-none"
            />
          ) : (
            <span className="font-display text-sm font-semibold">{category.name}</span>
          )}
          <span className="text-[10px] text-muted-foreground">
            {itemsQ.data ? `${itemsQ.data.length} options` : ""}
          </span>
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleActive}
            title={category.is_active ? "Disable" : "Enable"}
            className="grid h-8 w-8 place-items-center rounded-full border border-border text-muted-foreground hover:text-neon"
          >
            {category.is_active ? (
              <Eye className="h-3.5 w-3.5" />
            ) : (
              <EyeOff className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingName(true);
              setCatNameVal(category.name);
            }}
            className="rounded-full border border-border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-neon"
          >
            Rename
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="grid h-8 w-8 place-items-center rounded-full border border-border text-muted-foreground hover:text-crimson"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onToggle}
            className="grid h-8 w-8 place-items-center rounded-full border border-border text-muted-foreground"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Expanded subparts: Item list and inline model assignments */}
      {expanded && (
        <div className="border-t border-border/50 p-4 space-y-4">
          {/* Options list inside category */}
          <div className="space-y-2">
            <Label>Options List</Label>
            {itemsQ.isError ? (
              <div className="rounded-xl border border-crimson/40 bg-crimson/5 p-4 text-center text-xs text-crimson font-medium">
                Failed to load options
                <button
                  type="button"
                  onClick={() => itemsQ.refetch()}
                  className="ml-2 font-bold text-neon underline"
                >
                  Retry
                </button>
              </div>
            ) : itemsQ.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-neon mx-auto" />
            ) : itemsQ.data?.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-3 bg-surface/10 rounded-xl border border-border/20">
                No options added to this category yet.
              </div>
            ) : (
              (itemsQ.data ?? []).map((item: any) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  onToggleActive={async () => {
                    await upsertItem({
                      data: {
                        id: item.id,
                        category_id: item.category_id,
                        name: item.name,
                        price: item.price,
                        is_active: !item.is_active,
                        is_recommended: item.is_recommended,
                        sort_order: item.sort_order,
                      },
                    });
                    invItems();
                  }}
                  onToggleRecommended={async () => {
                    await upsertItem({
                      data: {
                        id: item.id,
                        category_id: item.category_id,
                        name: item.name,
                        price: item.price,
                        is_active: item.is_active,
                        is_recommended: !item.is_recommended,
                        sort_order: item.sort_order,
                      },
                    });
                    invItems();
                  }}
                  onEditPrice={async (price) => {
                    await upsertItem({
                      data: {
                        id: item.id,
                        category_id: item.category_id,
                        name: item.name,
                        price,
                        is_active: item.is_active,
                        is_recommended: item.is_recommended,
                        sort_order: item.sort_order,
                      },
                    });
                    invItems();
                  }}
                  onEditName={async (name) => {
                    await upsertItem({
                      data: {
                        id: item.id,
                        category_id: item.category_id,
                        name,
                        price: item.price,
                        is_active: item.is_active,
                        is_recommended: item.is_recommended,
                        sort_order: item.sort_order,
                      },
                    });
                    invItems();
                  }}
                  onEditMeta={async (desc, order) => {
                    await upsertItem({
                      data: {
                        id: item.id,
                        category_id: item.category_id,
                        name: item.name,
                        price: item.price,
                        description: desc,
                        sort_order: order,
                        is_active: item.is_active,
                        is_recommended: item.is_recommended,
                      },
                    });
                    invItems();
                  }}
                  onDelete={async () => {
                    await deleteItem({ data: { id: item.id } });
                    invItems();
                  }}
                />
              ))
            )}

            {/* Quick add option */}
            <form
              className="flex flex-col gap-2 mt-3 p-3 bg-surface/30 rounded-xl border border-border/40"
              onSubmit={(e) => {
                e.preventDefault();
                handleAddItem();
              }}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Add Option Item
              </span>
              <div className="flex gap-2">
                <input
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.currentTarget.value)}
                  placeholder="Item name (e.g. Frame Slider)"
                  className="flex-1 rounded-full border border-border bg-background px-3 py-1.5 text-xs outline-none focus:neon-ring"
                />
                <div className="relative flex items-center">
                  <span className="absolute left-3 text-xs text-muted-foreground">₹</span>
                  <input
                    type="number"
                    min={0}
                    value={newItemPrice}
                    onChange={(e) => setNewItemPrice(e.currentTarget.value)}
                    placeholder="Price"
                    className="w-20 rounded-full border border-border bg-background pl-6 pr-3 py-1.5 text-xs outline-none focus:neon-ring"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  value={newItemDesc}
                  onChange={(e) => setNewItemDesc(e.currentTarget.value)}
                  placeholder="Optional description / details..."
                  className="flex-1 rounded-full border border-border bg-background px-3 py-1.5 text-xs outline-none focus:neon-ring"
                />
                <button
                  type="submit"
                  disabled={!newItemName.trim() || !newItemPrice || savingItem}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-neon text-black shadow-neon disabled:opacity-40"
                >
                  {savingItem ? (
                    <Loader2 className="h-4.5 w-4.5 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function ItemRow({
  item,
  onToggleActive,
  onToggleRecommended,
  onEditPrice,
  onEditName,
  onEditMeta,
  onDelete,
}: {
  item: any;
  onToggleActive: () => Promise<void>;
  onToggleRecommended: () => Promise<void>;
  onEditPrice: (p: number) => Promise<void>;
  onEditName: (n: string) => Promise<void>;
  onEditMeta: (desc: string | null, order: number) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const qc = useQueryClient();
  const [editingPrice, setEditingPrice] = useState(false);
  const [priceVal, setPriceVal] = useState(String(item.price));
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(item.name);
  const [showMetaEdit, setShowMetaEdit] = useState(false);
  const [descVal, setDescVal] = useState(item.description ?? "");
  const [orderVal, setOrderVal] = useState(String(item.sort_order ?? 0));
  const [showAssignmentsModal, setShowAssignmentsModal] = useState(false);

  const getAssignmentsFn = useServerFn(adminGetItemAssignments);
  const assignmentsQ = useQuery({
    queryKey: ["item-assignments", item.id],
    queryFn: () => getAssignmentsFn({ data: { item_id: item.id } }),
    enabled: showMetaEdit,
    staleTime: 1000 * 30,
  });

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-xl border px-3 py-2.5 transition bg-surface/50",
        item.is_active ? "border-border" : "border-border/40 opacity-60",
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          {editingName ? (
            <input
              autoFocus
              value={nameVal}
              onChange={(e) => setNameVal(e.currentTarget.value)}
              onBlur={async () => {
                setEditingName(false);
                if (nameVal.trim() !== item.name) await onEditName(nameVal.trim());
              }}
              className="w-full rounded-lg border border-neon/50 bg-background px-2 py-0.5 text-xs outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              className="flex items-center gap-1.5 text-xs font-semibold hover:text-neon text-left"
            >
              {item.name}
              {item.is_recommended && (
                <Star className="h-3 w-3 fill-yellow-400 text-yellow-400 shrink-0" />
              )}
            </button>
          )}

          <div className="flex items-center gap-2 mt-0.5">
            {editingPrice ? (
              <input
                type="number"
                autoFocus
                value={priceVal}
                onChange={(e) => setPriceVal(e.currentTarget.value)}
                onBlur={async () => {
                  setEditingPrice(false);
                  const p = parseInt(priceVal, 10);
                  if (!isNaN(p) && p !== item.price) await onEditPrice(p);
                }}
                className="w-16 rounded border border-neon/50 bg-background px-1 text-[10px] outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingPrice(true)}
                className="text-[10px] text-neon hover:opacity-75 font-mono"
              >
                {formatRupees(item.price)}
              </button>
            )}

            {item.description && (
              <span className="text-[10px] text-muted-foreground truncate">
                · {item.description}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setShowMetaEdit(!showMetaEdit)}
            className="grid h-7 px-2 place-items-center rounded-full border border-border text-[9px] font-bold text-muted-foreground hover:text-neon uppercase tracking-wider"
          >
            Edit Info
          </button>
          <button
            type="button"
            onClick={onToggleRecommended}
            className={cn(
              "grid h-7 w-7 place-items-center rounded-full border transition",
              item.is_recommended
                ? "border-yellow-400/50 bg-yellow-400/10 text-yellow-400"
                : "border-border text-muted-foreground hover:text-yellow-400",
            )}
          >
            <Star className="h-3 w-3" fill={item.is_recommended ? "currentColor" : "none"} />
          </button>
          <button
            type="button"
            onClick={onToggleActive}
            className={cn(
              "grid h-7 w-7 place-items-center rounded-full border transition",
              item.is_active
                ? "border-neon/40 bg-neon/10 text-neon"
                : "border-border text-muted-foreground hover:text-neon",
            )}
          >
            {item.is_active ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="grid h-7 w-7 place-items-center rounded-full border border-border text-muted-foreground hover:text-crimson"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Expanded item details editor */}
      {showMetaEdit && (
        <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-border/10">
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="text-[8px] uppercase tracking-wider text-muted-foreground">
                Item Description
              </label>
              <input
                value={descVal}
                onChange={(e) => setDescVal(e.target.value)}
                placeholder="Details (e.g. Heavy Duty Steel)"
                className="w-full rounded bg-background border border-border/60 px-2 py-1 text-[11px] outline-none focus:neon-ring"
              />
            </div>
            <div>
              <label className="text-[8px] uppercase tracking-wider text-muted-foreground">
                Order Index
              </label>
              <input
                type="number"
                value={orderVal}
                onChange={(e) => setOrderVal(e.target.value)}
                placeholder="0"
                className="w-full rounded bg-background border border-border/60 px-2 py-1 text-[11px] outline-none focus:neon-ring"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              await onEditMeta(descVal.trim() || null, parseInt(orderVal, 10) || 0);
              setShowMetaEdit(false);
            }}
            className="rounded bg-neon/10 border border-neon/30 text-neon font-bold text-[10px] py-1 uppercase tracking-wider hover:bg-neon hover:text-black"
          >
            Save Item Info
          </button>

          {/* Bike Assignments */}
          <div className="mt-3 flex items-center justify-between border-t border-border/20 pt-3">
            <div>
              <div className="text-[8px] uppercase tracking-wider text-muted-foreground">
                Assigned Bikes
              </div>
              <div className="mt-0.5 text-xs font-bold text-neon">
                {assignmentsQ.isLoading
                  ? "…"
                  : `${assignmentsQ.data?.length ?? 0} model${(assignmentsQ.data?.length ?? 0) !== 1 ? "s" : ""}`}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowAssignmentsModal(true)}
              className="rounded-full border border-neon/50 bg-neon/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-neon hover:bg-neon hover:text-black"
            >
              Manage Bikes
            </button>
          </div>
        </div>
      )}

      {showAssignmentsModal && (
        <ItemAssignmentsModal
          itemId={item.id}
          itemName={item.name}
          onClose={() => {
            setShowAssignmentsModal(false);
            qc.invalidateQueries({ queryKey: ["item-assignments", item.id] });
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Item Bike Assignments Modal
// ============================================================
function ItemAssignmentsModal({
  itemId,
  itemName,
  onClose,
}: {
  itemId: string;
  itemName: string;
  onClose: () => void;
}) {
  const saveAssignmentsFn = useServerFn(adminSaveItemAssignments);
  const getAssignmentsFn = useServerFn(adminGetItemAssignments);
  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => listBrands() });
  const allModelsQ = useQuery({
    queryKey: ["models-all"],
    queryFn: () => listModels({ data: {} }),
  });

  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // Load existing assignments on modal open
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    // Timeout protection: 10 seconds
    const timer = setTimeout(() => {
      if (active) {
        setLoading(false);
        setError("Request timed out (10s). Please check your database migrations.");
      }
    }, 10000);

    const loadData = async () => {
      try {
        const ids = await getAssignmentsFn({ data: { item_id: itemId } });
        if (active) {
          setCheckedIds(new Set(ids));
          clearTimeout(timer);
          setLoading(false);
        }
      } catch (err: any) {
        if (active) {
          clearTimeout(timer);
          setLoading(false);
          setError(
            err?.message ||
              "Failed to load bike assignments. Ensure database migrations are applied.",
          );
        }
      }
    };

    loadData();

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [itemId, retryKey]);

  // Close on Escape + lock body scroll
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const brands = brandsQ.data ?? [];
  const allModels = allModelsQ.data ?? [];
  const queryError = brandsQ.error || allModelsQ.error;
  const isQueriesLoading = brandsQ.isLoading || allModelsQ.isLoading;

  const brandMap = useMemo(() => {
    const map = new Map<string, BrandRow>();
    for (const b of brands) map.set(b.id, b);
    return map;
  }, [brands]);

  const filteredModels = useMemo(() => {
    if (!search.trim()) return allModels;
    const q = search.toLowerCase();
    return allModels.filter(
      (m: ModelRow) =>
        m.name.toLowerCase().includes(q) ||
        (brandMap.get(m.brand_id)?.name ?? "").toLowerCase().includes(q),
    );
  }, [allModels, search, brandMap]);

  const grouped = useMemo(() => {
    const map = new Map<string, { brand: BrandRow | undefined; models: ModelRow[] }>();
    for (const m of filteredModels) {
      if (!map.has(m.brand_id))
        map.set(m.brand_id, { brand: brandMap.get(m.brand_id), models: [] });
      map.get(m.brand_id)!.models.push(m);
    }
    return Array.from(map.values()).sort(
      (a, b) => (a.brand?.sort_order ?? 999) - (b.brand?.sort_order ?? 999),
    );
  }, [filteredModels, brandMap]);

  const toggle = (id: string) =>
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveAssignmentsFn({ data: { item_id: itemId, model_ids: Array.from(checkedIds) } });
      onClose();
    } catch (err: any) {
      alert(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[85vh] w-full max-w-md flex-col rounded-3xl border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 p-5">
          <div className="min-w-0 flex-1 pr-3">
            <div className="text-[9px] font-bold uppercase tracking-[0.25em] text-muted-foreground">
              Assign Bike Models
            </div>
            <div className="mt-0.5 truncate font-display text-sm font-bold">{itemName}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border text-muted-foreground hover:text-crimson"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 pt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              placeholder="Search bikes or brands…"
              disabled={loading || isQueriesLoading || !!error || !!queryError}
              className="w-full rounded-full border border-border bg-background pl-9 pr-4 py-2 text-xs outline-none focus:neon-ring disabled:opacity-50"
            />
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-2">
          <span className="text-[10px] text-muted-foreground">
            {checkedIds.size} model{checkedIds.size !== 1 ? "s" : ""} assigned
          </span>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={loading || isQueriesLoading || !!error || !!queryError}
              onClick={() => setCheckedIds(new Set(filteredModels.map((m: ModelRow) => m.id)))}
              className="text-[10px] font-bold uppercase tracking-wider text-neon hover:opacity-75 disabled:opacity-30"
            >
              Select All
            </button>
            <button
              type="button"
              disabled={loading || isQueriesLoading || !!error || !!queryError}
              onClick={() => setCheckedIds(new Set())}
              className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-crimson disabled:opacity-30"
            >
              Clear All
            </button>
          </div>
        </div>

        {/* Model list */}
        <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-2">
          {error || queryError ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <AlertTriangle className="h-8 w-8 text-crimson mb-2" aria-hidden="true" />
              <p className="text-xs text-crimson font-medium mb-4 max-w-xs">
                {error || (queryError as any)?.message || "An error occurred"}
              </p>
              <button
                type="button"
                onClick={() => {
                  setRetryKey((k) => k + 1);
                  brandsQ.refetch();
                  allModelsQ.refetch();
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-neon/50 bg-neon/10 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-neon hover:bg-neon hover:text-black"
              >
                <RefreshCw className="h-3 w-3" /> Retry
              </button>
            </div>
          ) : loading || isQueriesLoading ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-neon mb-2" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Loading bike models...
              </span>
            </div>
          ) : filteredModels.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">No bikes found</div>
          ) : (
            grouped.map(({ brand, models }) => (
              <div key={brand?.id ?? "unknown"}>
                <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.25em] text-muted-foreground">
                  {brand?.name ?? "Unknown Brand"}
                </div>
                <div className="space-y-1">
                  {models.map((m: ModelRow & { designs_count?: number }) => {
                    const checked = checkedIds.has(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggle(m.id)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-all",
                          checked
                            ? "border-neon/50 bg-neon/8 text-foreground neon-ring"
                            : "border-border/50 bg-surface/30 hover:border-border",
                        )}
                      >
                        <span
                          className={cn(
                            "grid h-4 w-4 shrink-0 place-items-center rounded border transition",
                            checked ? "border-neon bg-neon text-black" : "border-border",
                          )}
                        >
                          {checked && <Check className="h-2.5 w-2.5" />}
                        </span>
                        <span className="flex-1 font-medium flex justify-between items-center pr-2">
                          <span>{m.name}</span>
                          <span className="text-[9px] text-muted-foreground font-mono bg-surface-elevated/40 px-2 py-0.5 rounded-full">
                            {m.designs_count ?? 0} design{(m.designs_count ?? 0) !== 1 ? "s" : ""}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 border-t border-border/50 p-5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full border border-border py-2.5 text-xs font-semibold uppercase tracking-widest hover:text-crimson"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading || isQueriesLoading || !!error || !!queryError}
            className="flex-1 rounded-full bg-neon py-2.5 text-xs font-bold uppercase tracking-widest text-neon-foreground shadow-neon disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Tab 3: Images (with View, Edit metadata, Replace, and Delete)
// ============================================================
function ImagesTab() {
  const qc = useQueryClient();
  const del = useServerFn(adminDeleteDesign);
  const listImages = useServerFn(adminListImages);
  const uploadFn = useServerFn(adminUploadImage);
  const replaceImageFn = useServerFn(adminReplaceDesignImage);
  const updateMetaFn = useServerFn(adminUpdateDesignMeta);

  const brands = useQuery({ queryKey: ["brands"], queryFn: () => listBrands() });
  const allModels = useQuery({ queryKey: ["models-all"], queryFn: () => listModels({ data: {} }) });

  // Search & Filter States
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterBrand, setFilterBrand] = useState("");
  const [filterModel, setFilterModel] = useState("");
  const [sortBy, setSortBy] = useState<"recently_uploaded" | "recently_edited" | "sort_order">(
    "recently_uploaded",
  );

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch models for the filter dropdown
  const filterModels = useQuery({
    queryKey: ["models-filter", filterBrand],
    queryFn: () => listModels({ data: { brandId: filterBrand } }),
    enabled: !!filterBrand,
  });

  const imagesQ = useQuery({
    queryKey: ["admin", "images", debouncedSearch, filterBrand, filterModel, sortBy],
    queryFn: () =>
      listImages({
        data: {
          limit: 150,
          offset: 0,
          search: debouncedSearch,
          brandId: filterBrand || null,
          modelId: filterModel || null,
          sortBy,
        },
      }),
    staleTime: 1000 * 10,
  });
  const { data, isLoading, isError } = imagesQ;

  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [configEditTarget, setConfigEditTarget] = useState<any | null>(null);
  const [replacingId, setReplacingId] = useState<string | null>(null);

  // Modal state values
  const [desc, setDesc] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [order, setOrder] = useState("0");
  const [selectedBrand, setSelectedBrand] = useState("");
  const [selectedModel, setSelectedModel] = useState("");

  const editModels = useQuery({
    queryKey: ["models-edit", selectedBrand],
    queryFn: () => listModels({ data: { brandId: selectedBrand } }),
    enabled: !!selectedBrand,
  });

  const remove = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "images"] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });

  // Populate form values when edit target is selected
  const openEdit = (img: any) => {
    setEditTarget(img);
    setDesc(img.description ?? "");
    setTagsInput((img.tags ?? []).join(", "));
    setOrder(String(img.sort_order ?? 0));
    setSelectedBrand(img.brand_id ?? "");
    setSelectedModel(img.model_id ?? "");
  };

  const handleSaveMeta = async () => {
    if (!editTarget) return;
    const tagArray = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    await updateMetaFn({
      data: {
        id: editTarget.id,
        brand_id: selectedBrand || null,
        model_id: selectedModel || null,
        description: desc.trim() || null,
        tags: tagArray,
        sort_order: parseInt(order, 10) || 0,
      },
    });

    setEditTarget(null);
    qc.invalidateQueries({ queryKey: ["admin", "images"] });
  };

  const handleReplaceImage = async (file: File, id: string) => {
    setReplacingId(id);
    try {
      const hash = await computeHash(file);
      const base64 = await toBase64(file);
      const res = await uploadFn({
        data: { filename: file.name, contentType: file.type, base64 },
      });

      await replaceImageFn({
        data: {
          id,
          new_thumbnail_path: res.path,
          file_hash: hash,
          file_size: file.size,
        },
      });

      qc.invalidateQueries({ queryKey: ["admin", "images"] });
      alert("Image replaced successfully!");
    } catch (err: any) {
      alert(`Replace failed: ${err.message}`);
    } finally {
      setReplacingId(null);
    }
  };

  // Group images by model ID
  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; images: any[] }>();
    const rows = (data?.rows ?? []) as any[];

    // Track hash counts to identify duplicates across catalog
    const hashCounts: Record<string, number> = {};
    for (const img of rows) {
      if (img.file_hash) {
        hashCounts[img.file_hash] = (hashCounts[img.file_hash] ?? 0) + 1;
      }
    }

    for (const img of rows) {
      const key = img.model_id ?? "__none__";
      const designsCount = img.model?.designs?.[0]?.count ?? 0;
      const countSuffix = img.model?.name
        ? ` (${designsCount} design${designsCount !== 1 ? "s" : ""})`
        : "";
      const label = img.model?.name
        ? `${img.brand?.name ?? ""} ${img.model.name}${countSuffix}`.trim()
        : "No model";

      const isDuplicateHash = img.file_hash ? (hashCounts[img.file_hash] ?? 0) > 1 : false;

      if (!map.has(key)) map.set(key, { label, images: [] });
      map.get(key)!.images.push({ ...img, isDuplicateHash });
    }
    return Array.from(map.values());
  }, [data]);

  return (
    <div className="space-y-4 pb-20">
      {/* Search & Filters Controls */}
      <div className="grid gap-3 rounded-3xl surface-panel p-5">
        <h3 className="font-display text-sm font-bold uppercase tracking-widest text-neon">
          Search & Filter Library
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 items-end">
          {/* Search bar */}
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Duke, R15, tag..."
              className="w-full rounded-full border border-border bg-surface pl-10 pr-4 py-2.5 text-xs outline-none focus:neon-ring text-foreground"
            />
            <Search className="absolute left-3.5 top-3.5 h-3.5 w-3.5 text-muted-foreground" />
          </div>

          {/* Brand Filter */}
          <div>
            <select
              value={filterBrand}
              onChange={(e) => {
                setFilterBrand(e.target.value);
                setFilterModel("");
              }}
              className="w-full rounded-full border border-border bg-surface px-4 py-2.5 text-xs outline-none focus:neon-ring text-foreground"
            >
              <option value="">All Brands</option>
              {(brands.data ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Model Filter */}
          <div>
            <select
              value={filterModel}
              onChange={(e) => setFilterModel(e.target.value)}
              disabled={!filterBrand}
              className="w-full rounded-full border border-border bg-surface px-4 py-2.5 text-xs outline-none focus:neon-ring text-foreground disabled:opacity-50"
            >
              <option value="">All Models</option>
              {(filterModels.data ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* Sort By Filter */}
          <div>
            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="w-full rounded-full border border-border bg-surface px-4 py-2.5 text-xs outline-none focus:neon-ring text-foreground"
            >
              <option value="recently_uploaded">Recently Uploaded</option>
              <option value="recently_edited">Recently Edited</option>
              <option value="sort_order">Sort Order index</option>
            </select>
          </div>
        </div>
      </div>

      {isError ? (
        <div className="rounded-3xl border border-crimson/50 bg-crimson/5 p-6 text-center">
          <AlertTriangle className="h-6 w-6 text-crimson mx-auto mb-2" />
          <p className="text-xs text-crimson font-medium mb-3">Failed to load catalog images</p>
          <button
            type="button"
            onClick={() => imagesQ.refetch()}
            className="rounded-full border border-neon/50 bg-neon/10 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-neon hover:bg-neon hover:text-black"
          >
            Retry
          </button>
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-neon" />
        </div>
      ) : (
        <>
          <div className="rounded-2xl surface-panel px-4 py-3 text-sm text-muted-foreground flex justify-between items-center">
            <span>{data?.count ?? 0} total matched images</span>
            <span className="text-[10px] bg-neon/15 text-neon font-mono px-2 py-0.5 rounded">
              Grouped by Model
            </span>
          </div>

          {grouped.map(({ label, images }) => (
            <div key={label} className="rounded-3xl surface-panel p-4">
              <div className="mb-3 font-display text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {label}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
                {images.map((img: any, imgIdx: number) => (
                  <div
                    key={img.id}
                    className="relative group overflow-hidden rounded-2xl border border-border/80 flex flex-col bg-background"
                  >
                    <div className="relative aspect-square w-full bg-surface-elevated/20">
                      <SignedImage
                        path={img.thumbnail_path}
                        alt=""
                        aspect="1/1"
                        className="w-full h-full object-cover"
                      />

                      {/* Duplicate warning label */}
                      {img.isDuplicateHash && (
                        <span className="absolute top-1 left-1 bg-yellow-400 text-black text-[8px] px-1 py-0.5 rounded font-bold uppercase flex items-center gap-0.5 z-10">
                          <AlertTriangle className="h-2 w-2" /> Duplicate
                        </span>
                      )}

                      {/* Configuration Override Status Badge */}
                      <div className="absolute top-1 right-1 z-10">
                        {img.overrides && img.overrides.length > 0 ? (
                          <span className="bg-yellow-400 text-black text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider shadow-md">
                            🟡 Custom
                          </span>
                        ) : (
                          <span className="bg-emerald-500 text-white text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider shadow-md">
                            🟢 Default
                          </span>
                        )}
                      </div>

                      {/* Replace indicator */}
                      {replacingId === img.id && (
                        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-10">
                          <Loader2 className="h-5 w-5 animate-spin text-neon" />
                        </div>
                      )}
                    </div>

                    <div className="p-2 flex flex-col gap-1 flex-1">
                      <span className="text-[9px] font-mono text-muted-foreground flex justify-between items-center">
                        <span>Order: {img.sort_order ?? 0}</span>
                        <span>
                          {img.overrides && img.overrides.length > 0 ? (
                            <span className="text-[9px] text-yellow-400 font-semibold">
                              Custom Config
                            </span>
                          ) : (
                            <span className="text-[9px] text-emerald-400 font-semibold">
                              Bike Default
                            </span>
                          )}
                        </span>
                      </span>
                      {img.description && (
                        <p className="text-[10px] text-muted-foreground line-clamp-2">
                          {img.description}
                        </p>
                      )}
                      {img.tags && img.tags.length > 0 && (
                        <div className="flex flex-wrap gap-0.5 mt-0.5">
                          {img.tags.slice(0, 2).map((t: string) => (
                            <span
                              key={t}
                              className="bg-neon/10 border border-neon/20 text-neon text-[8px] px-1 rounded truncate"
                            >
                              #{t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Operations panel */}
                    <div className="border-t border-border/50 p-1.5 flex flex-col gap-1 bg-surface-elevated/40 shrink-0">
                      <div className="flex gap-1">
                        <a
                          href={`/model/${img.model_id}?img=${imgIdx}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-1 inline-flex justify-center items-center rounded-lg border border-border py-1 text-[9px] font-bold uppercase text-muted-foreground hover:text-neon bg-background text-center"
                        >
                          View
                        </a>
                        <button
                          type="button"
                          onClick={() => openEdit(img)}
                          className="flex-1 inline-flex justify-center items-center rounded-lg border border-border py-1 text-[9px] font-bold uppercase text-muted-foreground hover:text-neon bg-background"
                        >
                          Edit Info
                        </button>
                      </div>

                      <div className="flex gap-1 items-center">
                        <button
                          type="button"
                          onClick={() => setConfigEditTarget(img)}
                          className="flex-1 inline-flex justify-center items-center rounded-lg border border-border py-1 text-[9px] font-bold uppercase text-muted-foreground hover:text-neon bg-background"
                        >
                          Edit Config
                        </button>

                        <label className="flex-1 inline-flex justify-center items-center rounded-lg border border-border py-1 text-[9px] font-bold uppercase text-muted-foreground hover:text-neon bg-background cursor-pointer">
                          Replace
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              if (e.target.files?.[0])
                                handleReplaceImage(e.target.files[0], img.id);
                            }}
                          />
                        </label>

                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm("Delete this image permanent?"))
                              remove.mutate(img.id);
                          }}
                          className="grid h-6 w-6 shrink-0 place-items-center rounded-lg border border-border/80 text-muted-foreground hover:text-crimson bg-background"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {grouped.length === 0 && (
            <p className="rounded-2xl surface-panel p-6 text-center text-sm text-muted-foreground">
              No matching images found.
            </p>
          )}
        </>
      )}

      {/* Slide Drawer/Modal for image metadata edit */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-background/85 backdrop-blur-sm md:items-center">
          <div className="max-w-md w-full rounded-t-3xl surface-panel border border-border p-6 space-y-4 md:rounded-3xl shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-bold uppercase tracking-wider text-neon">
                Edit Image Info
              </h3>
              <button
                onClick={() => setEditTarget(null)}
                className="grid h-8 w-8 place-items-center rounded-full border border-border"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <Label>Update Brand tag</Label>
                <Select
                  value={selectedBrand}
                  onChange={(v) => {
                    setSelectedBrand(v);
                    setSelectedModel("");
                  }}
                >
                  <option value="">Select brand…</option>
                  {(brands.data ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <Label>Update Model tag</Label>
                <Select value={selectedModel} onChange={setSelectedModel} disabled={!selectedBrand}>
                  <option value="">Select model…</option>
                  {(editModels.data ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <Label>Sort Order index</Label>
                <input
                  type="number"
                  value={order}
                  onChange={(e) => setOrder(e.target.value)}
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-xs outline-none focus:neon-ring"
                />
              </div>

              <div>
                <Label>Image Description</Label>
                <textarea
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="Optional details, parts, colors, specifications..."
                  className="w-full h-16 rounded-2xl border border-border bg-surface px-3 py-2 text-xs outline-none focus:neon-ring resize-none"
                />
              </div>

              <div>
                <Label>Tags (comma separated)</Label>
                <input
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="wrap, decals, custom, exhaust"
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-xs outline-none focus:neon-ring"
                />
              </div>
            </div>

            <button
              onClick={handleSaveMeta}
              className="w-full rounded-full bg-neon text-black py-2.5 text-xs font-bold uppercase tracking-widest shadow-neon"
            >
              Save Custom Metadata
            </button>
          </div>
        </div>
      )}

      {configEditTarget && (
        <EditConfigurationOverlay
          design={configEditTarget}
          onClose={() => setConfigEditTarget(null)}
        />
      )}
    </div>
  );
}

// ============================================================
// Tab 4: Taxonomy (Brands & Models)
// ============================================================
function TaxonomyTab() {
  const qc = useQueryClient();
  const upsertBrand = useServerFn(adminUpsertBrand);
  const upsertModel = useServerFn(adminUpsertModel);
  const reorderBrands = useServerFn(adminReorderBrands);

  const brands = useQuery({ queryKey: ["brands"], queryFn: () => listBrands() });
  const [newBrand, setNewBrand] = useState("");
  const [modelBrandId, setModelBrandId] = useState("");
  const [newModel, setNewModel] = useState("");

  const models = useQuery({
    queryKey: ["models", modelBrandId],
    queryFn: () => listModels({ data: { brandId: modelBrandId } }),
    enabled: !!modelBrandId,
  });

  const inv = () => {
    qc.invalidateQueries({ queryKey: ["brands"] });
    qc.invalidateQueries({ queryKey: ["models"] });
    qc.invalidateQueries({ queryKey: ["models-all"] });
    qc.invalidateQueries({ queryKey: ["admin"] });
  };

  const handleMoveBrand = async (index: number, direction: "up" | "down") => {
    const list = [...(brands.data ?? [])];
    if (direction === "up" && index > 0) {
      const temp = list[index];
      list[index] = list[index - 1];
      list[index - 1] = temp;
    } else if (direction === "down" && index < list.length - 1) {
      const temp = list[index];
      list[index] = list[index + 1];
      list[index + 1] = temp;
    } else {
      return;
    }

    qc.setQueryData(["brands"], list);

    try {
      await reorderBrands({
        data: list.map((b) => b.id),
      });
      inv();
    } catch (err: any) {
      alert("Failed to reorder brands: " + err.message);
      qc.invalidateQueries({ queryKey: ["brands"] });
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 pb-20">
      <Card title="Brands">
        <AddInline
          placeholder="New brand name (e.g. KTM)"
          value={newBrand}
          onChange={setNewBrand}
          onSubmit={async () => {
            if (!newBrand.trim()) return;
            await upsertBrand({
              data: {
                name: newBrand.trim(),
                slug: slugify(newBrand),
                sort_order: (brands.data?.length ?? 0) + 1,
              },
            });
            setNewBrand("");
            inv();
          }}
        />
        <ul className="mt-3 space-y-2 max-h-80 overflow-y-auto scrollbar-thin">
          {(brands.data ?? []).map((b: BrandRow, index: number) => (
            <TaxRow
              key={b.id}
              label={b.name}
              onMoveUp={index > 0 ? () => handleMoveBrand(index, "up") : undefined}
              onMoveDown={
                index < (brands.data?.length ?? 0) - 1
                  ? () => handleMoveBrand(index, "down")
                  : undefined
              }
            />
          ))}
        </ul>
      </Card>

      <Card title="Models" wide>
        <div className="grid gap-2 md:grid-cols-[1fr_2fr_auto] md:items-end">
          <div>
            <Label>Brand</Label>
            <Select value={modelBrandId} onChange={setModelBrandId}>
              <option value="">Select brand…</option>
              {(brands.data ?? []).map((b: BrandRow) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Model name</Label>
            <Input
              value={newModel}
              onChange={(e) => setNewModel(e.currentTarget.value)}
              placeholder="e.g. Duke 390 Gen 3"
            />
          </div>
          <button
            type="button"
            onClick={async () => {
              if (!modelBrandId || !newModel.trim()) return;
              await upsertModel({
                data: {
                  brand_id: modelBrandId,
                  name: newModel.trim(),
                  slug: slugify(newModel),
                },
              });
              setNewModel("");
              inv();
            }}
            className="rounded-full bg-neon px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-black shadow-neon"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {modelBrandId && (
          <ul className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 max-h-60 overflow-y-auto scrollbar-thin">
            {(models.data ?? []).map((m: ModelRow & { designs_count?: number }) => (
              <li
                key={m.id}
                className="flex justify-between items-center rounded-full border border-border bg-surface pl-3 pr-2 py-1 text-xs font-medium"
              >
                <span className="truncate pr-1">{m.name}</span>
                <span className="shrink-0 text-[9px] text-neon bg-neon/10 px-2 py-0.5 rounded-full font-bold">
                  {m.designs_count ?? 0}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ============================================================
// UI Primitives
// ============================================================
function Card({
  title,
  wide = false,
  children,
}: {
  title: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-3xl surface-panel p-5", wide && "md:col-span-2")}>
      <h3 className="font-display text-sm font-bold uppercase tracking-widest text-neon">
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
      {children}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded-2xl border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:neon-ring"
    />
  );
}

function Select({
  value,
  onChange,
  children,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      disabled={disabled}
      className="w-full rounded-2xl border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:neon-ring disabled:opacity-50"
    >
      {children}
    </select>
  );
}

function AddInline({
  placeholder,
  value,
  onChange,
  onSubmit,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void | Promise<void>;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="flex gap-2"
    >
      <input
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        placeholder={placeholder}
        className="flex-1 rounded-full border border-border bg-surface px-4 py-2 text-sm outline-none focus:neon-ring"
      />
      <button className="grid h-9 w-9 place-items-center rounded-full bg-neon text-neon-foreground shadow-neon">
        <Plus className="h-4 w-4 text-black" />
      </button>
    </form>
  );
}

function TaxRow({
  label,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  label: string;
  onDelete?: () => void | Promise<void>;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  return (
    <li className="flex items-center justify-between rounded-2xl border border-border bg-surface px-3 py-2">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-1.5">
        {onMoveUp && (
          <button
            type="button"
            onClick={onMoveUp}
            className="text-muted-foreground hover:text-neon p-1 transition cursor-pointer"
            title="Move Up"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
        )}
        {onMoveDown && (
          <button
            type="button"
            onClick={onMoveDown}
            className="text-muted-foreground hover:text-neon p-1 transition cursor-pointer"
            title="Move Down"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="text-muted-foreground hover:text-crimson p-1 transition cursor-pointer ml-1"
            aria-label={`Delete ${label}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </li>
  );
}

function toBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = reader.result as string;
      res(s.split(",")[1] ?? "");
    };
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

// ============================================================
// Tab 5: Settings & Reset Catalog
// ============================================================
function SettingsTab() {
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="font-display text-lg font-semibold uppercase tracking-wider text-foreground">
          System Settings
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage system configurations and perform administrative database reset tasks.
        </p>

        <div className="mt-6 border-t border-border pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-md">
              <h3 className="text-sm font-semibold uppercase text-red-500 flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" /> Danger Zone: Reset Catalog Data
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Permanently clear the catalog database. All brands, models, category options,
                assignments, and uploaded images will be deleted. The admin account, DB schema, and
                storage bucket itself are protected.
              </p>
            </div>
            <button
              onClick={() => setResetDialogOpen(true)}
              className="self-start sm:self-auto rounded-full bg-red-950/20 border border-red-500/40 text-red-400 hover:bg-red-500 hover:text-white px-5 py-2.5 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
            >
              Reset Catalog Data
            </button>
          </div>
        </div>
      </div>

      {resetDialogOpen && <ResetCatalogModal onClose={() => setResetDialogOpen(false)} />}
    </div>
  );
}

function ResetCatalogModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(1); // 1 = Warning, 2 = Confirm Input & PIN, 3 = Reset Progress
  const [confirmText, setConfirmText] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [progressIndex, setProgressIndex] = useState(0);
  const [isResetting, setIsResetting] = useState(false);

  const qc = useQueryClient();
  const resetCatalogFn = useServerFn(adminResetCatalog);

  const steps = [
    "Deleting Images...",
    "Deleting Bike Models...",
    "Deleting Categories...",
    "Deleting Assignments...",
    "Cleaning Storage...",
  ];

  // Cycle progress index while resetting
  useEffect(() => {
    if (!isResetting) return;
    const interval = setInterval(() => {
      setProgressIndex((prev) => {
        if (prev < steps.length - 1) return prev + 1;
        return prev;
      });
    }, 1200);
    return () => clearInterval(interval);
  }, [isResetting]);

  const handleStartReset = async () => {
    if (confirmText !== "RESET CATALOG") {
      setError("Please type exactly: RESET CATALOG");
      return;
    }
    if (!pin.trim()) {
      setError("Please enter your Admin PIN");
      return;
    }

    setIsResetting(true);
    setStep(3);
    setError(null);

    try {
      await resetCatalogFn({ data: { pin, confirmText } });
      setProgressIndex(steps.length); // Trigger "Reset Complete" state

      // Delay slightly for visual feedback before refreshing
      setTimeout(() => {
        qc.clear(); // Clear React Query cache
        alert("Catalog reset completed successfully.");
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      setIsResetting(false);
      setStep(2); // Go back to input step
      setError(err?.message || "Failed to reset catalog. Check Admin PIN.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-card">
        {step === 1 && (
          <div>
            <h3 className="font-display text-lg font-bold uppercase tracking-wider text-red-500 flex items-center gap-1.5">
              <AlertTriangle className="h-5 w-5" /> Reset Catalog Data
            </h3>
            <p className="mt-4 text-sm text-foreground leading-relaxed">
              This action will permanently delete all catalog data, uploaded images, bike models,
              categories, assignments and customer saved data. This action cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={onClose}
                className="rounded-full border border-border bg-transparent px-4 py-2 text-xs font-semibold uppercase tracking-widest hover:bg-surface-elevated cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => setStep(2)}
                className="rounded-full bg-red-950/40 border border-red-500/50 text-red-400 hover:bg-red-600 hover:text-white px-5 py-2 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h3 className="font-display text-lg font-bold uppercase tracking-wider text-red-500 flex items-center gap-1.5">
              <AlertTriangle className="h-5 w-5" /> Verification Required
            </h3>
            <p className="mt-3 text-xs text-muted-foreground">
              To proceed, please type <strong className="text-foreground">RESET CATALOG</strong>{" "}
              below and re-enter your Admin PIN.
            </p>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Confirmation Text
                </label>
                <input
                  type="text"
                  placeholder="Type RESET CATALOG"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2 text-sm text-foreground focus:border-red-500/50 focus:outline-none focus:ring-1 focus:ring-red-500/30"
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Admin PIN
                </label>
                <input
                  type="password"
                  placeholder="Enter Admin PIN"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2 text-sm text-foreground focus:border-red-500/50 focus:outline-none focus:ring-1 focus:ring-red-500/30"
                />
              </div>
            </div>

            {error && <p className="mt-3 text-xs text-red-400 font-medium">⚠️ {error}</p>}

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={onClose}
                className="rounded-full border border-border bg-transparent px-4 py-2 text-xs font-semibold uppercase tracking-widest hover:bg-surface-elevated cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleStartReset}
                disabled={confirmText !== "RESET CATALOG" || !pin}
                className="rounded-full bg-red-600 disabled:bg-red-950/40 disabled:border-red-500/10 disabled:text-red-400/50 disabled:cursor-not-allowed text-white border border-red-500 px-5 py-2 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-neon"
              >
                Confirm Reset
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="text-center py-6">
            <Loader2 className="h-10 w-10 animate-spin text-red-500 mx-auto" />
            <h4 className="mt-4 font-display text-sm font-semibold uppercase tracking-wider text-foreground">
              {progressIndex < steps.length ? "Resetting Catalog" : "Reset Complete."}
            </h4>

            <div className="mt-6 max-w-xs mx-auto space-y-1.5 text-left text-xs">
              {steps.map((text, idx) => {
                const done = progressIndex > idx;
                const active = progressIndex === idx;
                return (
                  <div
                    key={text}
                    className={cn(
                      "flex items-center justify-between transition-opacity duration-300",
                      done
                        ? "text-muted-foreground opacity-60"
                        : active
                          ? "text-red-400 font-bold"
                          : "text-muted-foreground/30",
                    )}
                  >
                    <span>{text}</span>
                    <span>{done ? "✓" : active ? "⌛" : ""}</span>
                  </div>
                );
              })}
              <div
                className={cn(
                  "flex items-center justify-between transition-opacity duration-300 mt-2 pt-2 border-t border-border/30",
                  progressIndex === steps.length
                    ? "text-neon font-bold"
                    : "text-muted-foreground/30",
                )}
              >
                <span>Reset Complete.</span>
                <span>{progressIndex === steps.length ? "✓" : ""}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EditConfigurationOverlay({ design, onClose }: { design: any; onClose: () => void }) {
  const qc = useQueryClient();
  const saveOverrides = useServerFn(adminSaveImageOverrides);

  // Queries
  const defaultsQ = useQuery({
    queryKey: ["configurator-data", design.model_id],
    queryFn: () => getConfiguratorData({ data: { modelId: design.model_id } }),
    enabled: !!design.model_id,
  });

  const overridesQ = useQuery({
    queryKey: ["image-overrides", design.id],
    queryFn: () => getImageOverrides({ data: { designId: design.id } }),
  });

  // Local state representing the complete configuration form
  const [localItems, setLocalItems] = useState<any[]>([]);
  const [localCategories, setLocalCategories] = useState<any[]>([]);
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());
  const [hasChanges, setHasChanges] = useState(false);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const defaultCategories = defaultsQ.data?.categories ?? [];
  const hasExistingOverrides = (overridesQ.data ?? []).length > 0;

  // Initialize and populate local form state when query data is loaded
  useEffect(() => {
    if (defaultsQ.data && overridesQ.data) {
      const defaultCats = defaultsQ.data.categories ?? [];
      const overrides = overridesQ.data ?? [];

      const cats = defaultCats.map((cat: any) => ({
        id: cat.id,
        name: cat.name,
      }));
      setLocalCategories(cats);

      if (cats.length > 0) {
        setOpenCategories(new Set([cats[0].id]));
      }

      const itemsList: any[] = [];
      for (const cat of defaultCats) {
        for (const it of cat.items) {
          const ov = overrides.find((o: any) => o.item_id === it.id);
          itemsList.push({
            id: it.id,
            category_id: cat.id,
            name: ov?.name_override ?? it.name,
            price: ov?.price_override ?? it.price,
            description: ov?.description_override ?? it.description ?? "",
            is_removed: ov?.is_removed === true,
            isDefault: true,
            defaultName: it.name,
            defaultPrice: it.price,
            defaultDescription: it.description ?? "",
          });
        }
      }

      const addedOverrides = overrides.filter((o: any) => o.is_added && o.item);
      for (const o of addedOverrides) {
        itemsList.push({
          id: o.item.id,
          category_id: o.item.category_id,
          name: o.name_override ?? o.item.name,
          price: o.price_override ?? o.item.price,
          description: o.description_override ?? o.item.description ?? "",
          is_removed: false,
          isDefault: false,
        });
      }

      setLocalItems(itemsList);
      setHasChanges(false);
    }
  }, [defaultsQ.data, overridesQ.data]);

  const toggleCategoryOpen = (catId: string) => {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) {
        next.delete(catId);
      } else {
        next.add(catId);
      }
      return next;
    });
  };

  const getAddButtonText = (catName: string) => {
    let singular = catName;
    if (catName.endsWith("ies")) {
      singular = catName.slice(0, -3) + "y";
    } else if (catName.endsWith("s") && !catName.endsWith("ing") && !catName.endsWith("ss")) {
      singular = catName.slice(0, -1);
    }
    return `+ Add ${singular}`;
  };

  const handleUpdateItem = (itemId: string, fields: any) => {
    setHasChanges(true);
    setLocalItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, ...fields } : item)),
    );
  };

  const handleRemoveItem = (itemId: string) => {
    setHasChanges(true);
    setLocalItems((prev) =>
      prev
        .map((item) => {
          if (item.id === itemId) {
            if (item.isDefault) {
              return { ...item, is_removed: true };
            }
            return null;
          }
          return item;
        })
        .filter(Boolean),
    );
  };

  const handleCreateCustomOption = (catId: string) => {
    setHasChanges(true);
    const tempId = `temp_${Date.now()}`;
    setLocalItems((prev) => [
      ...prev,
      {
        id: tempId,
        category_id: catId,
        name: "",
        price: 0,
        description: "",
        is_removed: false,
        isDefault: false,
        isNewInline: true,
      },
    ]);
  };

  const handleSave = async () => {
    try {
      const overridesToSave: any[] = [];

      for (const item of localItems) {
        if (item.isDefault) {
          const hasDiff =
            item.name !== item.defaultName ||
            item.price !== item.defaultPrice ||
            item.description !== item.defaultDescription ||
            item.is_removed;

          if (hasDiff) {
            overridesToSave.push({
              item_id: item.id,
              category_id: null,
              is_removed: item.is_removed,
              is_added: false,
              price_override: item.price !== item.defaultPrice ? item.price : null,
              name_override: item.name !== item.defaultName ? item.name : null,
              description_override:
                item.description !== item.defaultDescription ? item.description : null,
              is_recommended: null,
              is_active: null,
            });
          }
        } else {
          const overrideRow: any = {
            item_id: item.id,
            category_id: null,
            is_removed: false,
            is_added: true,
            price_override: item.price,
            name_override: item.name,
            description_override: item.description || null,
          };

          if (item.isNewInline) {
            overrideRow.new_item_fields = {
              name: item.name,
              price: item.price,
              description: item.description || null,
              category_id: item.category_id,
            };
          }

          overridesToSave.push(overrideRow);
        }
      }

      await saveOverrides({
        data: {
          designId: design.id,
          overrides: overridesToSave,
        },
      });

      qc.invalidateQueries({ queryKey: ["admin", "images"] });
      qc.invalidateQueries({ queryKey: ["image-overrides", design.id] });

      setHasChanges(false);
      onClose();
    } catch (err: any) {
      alert(`Save failed: ${err.message}`);
    }
  };

  const handleResetToDefault = async () => {
    try {
      await saveOverrides({
        data: {
          designId: design.id,
          overrides: [],
        },
      });

      qc.invalidateQueries({ queryKey: ["admin", "images"] });
      qc.invalidateQueries({ queryKey: ["image-overrides", design.id] });

      setHasChanges(false);
      setShowResetConfirm(false);
      onClose();
    } catch (err: any) {
      alert(`Reset failed: ${err.message}`);
    }
  };

  const handleCloseAttempt = () => {
    if (hasChanges) {
      setShowUnsavedWarning(true);
    } else {
      onClose();
    }
  };

  const isLoading = defaultsQ.isLoading || overridesQ.isLoading;

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-md flex flex-col h-full overflow-hidden">
      <header className="border-b border-border bg-surface px-4 py-3 flex items-center justify-between shrink-0 font-sans">
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleCloseAttempt}
            className="p-2 -ml-2 rounded-full hover:bg-surface-elevated text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Edit Info
            </div>
            <h1 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">
              {design.title || "Untitled Image"}
            </h1>
          </div>
        </div>
      </header>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-neon" />
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-y-auto p-4 space-y-4 pb-40 max-w-3xl mx-auto w-full font-sans">
          <div className="rounded-2xl overflow-hidden border border-border bg-surface/30 p-2 max-w-md mx-auto w-full">
            <SignedImage
              path={design.thumbnail_path}
              alt=""
              aspect="16/10"
              className="rounded-xl object-cover"
            />
          </div>

          <div className="space-y-3">
            {localCategories.map((cat) => {
              const open = openCategories.has(cat.id);
              const items = localItems.filter((i) => i.category_id === cat.id && !i.is_removed);

              return (
                <div
                  key={cat.id}
                  className="overflow-hidden rounded-2xl border border-border bg-surface/50"
                >
                  <button
                    type="button"
                    onClick={() => toggleCategoryOpen(cat.id)}
                    className="flex w-full items-center justify-between px-4 py-3.5 bg-surface transition-colors hover:bg-surface-elevated"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-display text-sm font-semibold uppercase tracking-wider text-foreground">
                        {cat.name}
                      </span>
                      {items.length > 0 && (
                        <span className="rounded-full bg-neon/15 px-2 py-0.5 text-[10px] font-bold text-neon">
                          {items.length} options
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {open ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </button>

                  {open && (
                    <div className="border-t border-border/50 p-4 space-y-3 bg-background/20">
                      <div className="space-y-2">
                        {items.map((item) => (
                          <div
                            key={item.id}
                            className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface/50 px-3 py-3 text-left transition-all hover:bg-surface"
                          >
                            <span className="grid h-5 w-5 shrink-0 place-items-center rounded border border-neon bg-neon text-neon-foreground">
                              <Check className="h-3 w-3" />
                            </span>

                            <div className="flex-1 min-w-0">
                              <input
                                type="text"
                                placeholder="Item Name"
                                value={item.name}
                                onChange={(e) =>
                                  handleUpdateItem(item.id, { name: e.target.value })
                                }
                                className="w-full bg-transparent border-0 p-0 text-sm font-medium text-foreground focus:ring-1 focus:ring-neon rounded placeholder:text-muted-foreground/30 focus:outline-none"
                              />
                              <input
                                type="text"
                                placeholder="Description (optional)"
                                value={item.description}
                                onChange={(e) =>
                                  handleUpdateItem(item.id, { description: e.target.value })
                                }
                                className="w-full bg-transparent border-0 p-0 text-xs text-muted-foreground focus:ring-1 focus:ring-neon rounded mt-0.5 placeholder:text-muted-foreground/20 focus:outline-none"
                              />
                            </div>

                            <div className="flex items-center text-sm font-semibold font-display text-neon border border-transparent focus-within:border-border/30 rounded px-1 shrink-0">
                              <span className="mr-0.5">₹</span>
                              <input
                                type="number"
                                placeholder="Price"
                                value={item.price}
                                onChange={(e) =>
                                  handleUpdateItem(item.id, {
                                    price: e.target.value === "" ? 0 : parseInt(e.target.value, 10),
                                  })
                                }
                                className="bg-transparent border-0 text-right p-0 text-sm font-semibold font-display text-neon focus:ring-0 focus:outline-none w-16"
                              />
                            </div>

                            <button
                              type="button"
                              onClick={() => handleRemoveItem(item.id)}
                              className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-red-950/20 transition shrink-0 cursor-pointer"
                              title="Delete option"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}

                        {items.length === 0 && (
                          <p className="text-center py-4 text-xs text-muted-foreground">
                            No options configured in this category.
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleCreateCustomOption(cat.id)}
                        className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/60 hover:border-neon/40 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-neon transition cursor-pointer bg-surface/10 mt-3"
                      >
                        <Plus className="h-4 w-4" />
                        {getAddButtonText(cat.name)}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="border-t border-border bg-surface px-4 py-3 flex items-center justify-between shrink-0">
        <button
          onClick={handleCloseAttempt}
          className="rounded-full border border-border/80 bg-transparent text-muted-foreground hover:text-foreground px-5 py-2 text-[10px] font-bold uppercase tracking-widest cursor-pointer transition-all"
        >
          Cancel
        </button>

        <div className="flex items-center gap-2">
          {hasExistingOverrides && (
            <button
              onClick={() => setShowResetConfirm(true)}
              className="rounded-full border border-red-500/30 bg-red-950/20 text-red-400 px-4 py-2 text-[10px] font-bold uppercase tracking-wider hover:bg-red-500 hover:text-white transition-all cursor-pointer"
            >
              Reset to Bike Default
            </button>
          )}

          <button
            onClick={handleSave}
            disabled={!hasChanges}
            className="rounded-full bg-neon disabled:bg-neon/20 disabled:text-neon/40 disabled:cursor-not-allowed text-black px-6 py-2 text-[10px] font-bold uppercase tracking-widest transition-all cursor-pointer shadow-neon"
          >
            Save Changes
          </button>
        </div>
      </div>

      {showUnsavedWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-sans">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 space-y-4">
            <h3 className="font-display text-sm font-bold uppercase tracking-wider text-yellow-400">
              Unsaved Changes
            </h3>
            <p className="text-xs text-foreground">
              You have unsaved changes. Do you want to save them before leaving?
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={handleSave}
                className="w-full rounded-full bg-neon text-black py-2 text-xs font-bold uppercase tracking-widest cursor-pointer shadow-neon"
              >
                Save and Close
              </button>
              <button
                onClick={() => {
                  setHasChanges(false);
                  setShowUnsavedWarning(false);
                  onClose();
                }}
                className="w-full rounded-full border border-border bg-transparent text-muted-foreground hover:text-foreground py-2 text-xs font-bold uppercase tracking-widest cursor-pointer"
              >
                Discard Changes
              </button>
              <button
                onClick={() => setShowUnsavedWarning(false)}
                className="w-full rounded-full border border-border bg-background py-2 text-xs font-bold uppercase tracking-widest cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-sans">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 space-y-4">
            <h3 className="font-display text-sm font-bold uppercase tracking-wider text-red-500">
              Reset Image Configuration
            </h3>
            <p className="text-xs text-foreground">
              This will remove all edits made to this image and restore the Bike Model default
              configuration.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 rounded-full border border-border bg-transparent text-muted-foreground hover:text-foreground py-2 text-xs font-bold uppercase tracking-widest cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleResetToDefault}
                className="flex-1 rounded-full bg-red-600 text-white py-2 text-xs font-bold uppercase tracking-widest cursor-pointer hover:bg-red-700 transition"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
