import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import {
  Lock,
  LogOut,
  Upload,
  Trash2,
  Plus,
  ImageIcon,
  Sparkles,
  ChevronRight,
  X,
  Loader2,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { SignedImage } from "@/components/SignedImage";
import {
  adminDeleteCategory,
  adminDeleteDesign,
  adminLogin,
  adminLogout,
  adminStats,
  adminStatus,
  adminUploadImage,
  adminUpsertBrand,
  adminUpsertCategory,
  adminUpsertDesign,
  adminUpsertModel,
} from "@/lib/admin.functions";
import {
  listBrands,
  listCategories,
  listDesigns,
  listModels,
  type BrandRow,
  type CategoryRow,
  type DesignRow,
  type ModelRow,
} from "@/lib/catalog.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Admin — Bikers Choice Kakinada" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

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

function LoginCard() {
  const login = useServerFn(adminLogin);
  const qc = useQueryClient();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutate = useMutation({
    mutationFn: async () => login({ data: { pin } }),
    onSuccess: (res) => {
      if (!res.ok) {
        setError("Incorrect PIN");
        return;
      }
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: () => setError("Login failed"),
  });

  return (
    <div className="mx-auto max-w-sm rounded-3xl surface-panel p-8 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-neon/15 text-neon">
        <Lock className="h-6 w-6" />
      </div>
      <h1 className="mt-4 font-display text-xl font-bold uppercase tracking-widest">Owner login</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Enter your shop PIN to manage the catalog.
      </p>
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

type Tab = "designs" | "upload" | "taxonomy";

function Dashboard() {
  const [tab, setTab] = useState<Tab>("designs");
  const logout = useServerFn(adminLogout);
  const qc = useQueryClient();
  const stats = useServerFn(adminStats);
  const statsQ = useQuery({ queryKey: ["admin", "stats"], queryFn: () => stats(), staleTime: 1000 * 30 });

  const doLogout = async () => {
    await logout();
    qc.invalidateQueries({ queryKey: ["admin"] });
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            Admin
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold uppercase tracking-wider md:text-3xl">
            Catalog control
          </h1>
        </div>
        <button
          onClick={doLogout}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-widest hover:text-crimson"
        >
          <LogOut className="h-3.5 w-3.5" /> Logout
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Designs" value={statsQ.data?.designs} />
        <StatTile label="Categories" value={statsQ.data?.categories} />
        <StatTile label="Brands" value={statsQ.data?.brands} />
        <StatTile label="Models" value={statsQ.data?.models} />
      </div>

      <div className="mt-6 flex gap-2 overflow-x-auto scrollbar-none">
        {(["designs", "upload", "taxonomy"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "shrink-0 rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-widest transition",
              tab === t
                ? "border-neon bg-neon/15 text-neon neon-ring"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {t === "upload" ? "Add design" : t === "taxonomy" ? "Taxonomy" : "All designs"}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "designs" ? <DesignList /> : tab === "upload" ? <UploadForm /> : <TaxonomyPanel />}
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-2xl surface-panel px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-display text-2xl font-bold neon-text">
        {value?.toLocaleString("en-IN") ?? "—"}
      </div>
    </div>
  );
}

function DesignList() {
  const qc = useQueryClient();
  const del = useServerFn(adminDeleteDesign);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "designs"],
    queryFn: () => listDesigns({ data: { limit: 60, sort: "newest" } }),
    staleTime: 1000 * 30,
  });
  const remove = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "designs"] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
      qc.invalidateQueries({ queryKey: ["designs"] });
    },
  });
  if (isLoading) return <Loader2 className="mx-auto h-5 w-5 animate-spin text-neon" />;
  const rows = data?.rows ?? [];
  if (rows.length === 0)
    return (
      <p className="rounded-2xl surface-panel p-6 text-center text-sm text-muted-foreground">
        No designs yet. Head to <span className="text-neon">Add design</span> to create your first.
      </p>
    );
  return (
    <ul className="space-y-3">
      {rows.map((d: DesignRow) => (
        <li
          key={d.id}
          className="flex items-center gap-3 rounded-2xl surface-panel p-3"
        >
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl">
            <SignedImage path={d.thumbnail_path} alt={d.title} aspect="1/1" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-display font-semibold">{d.title}</div>
            <div className="text-xs text-muted-foreground">
              {d.category?.name ?? "—"} · {d.brand?.name ?? "—"}
            </div>
          </div>
          <button
            onClick={() => {
              if (window.confirm(`Delete "${d.title}"?`)) remove.mutate(d.id);
            }}
            className="grid h-10 w-10 place-items-center rounded-full border border-border text-muted-foreground hover:text-crimson"
            aria-label="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function UploadForm() {
  const qc = useQueryClient();
  const upload = useServerFn(adminUploadImage);
  const upsert = useServerFn(adminUpsertDesign);
  const cats = useQuery({ queryKey: ["categories"], queryFn: () => listCategories() });
  const brands = useQuery({ queryKey: ["brands"], queryFn: () => listBrands() });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [modelId, setModelId] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [days, setDays] = useState("");
  const [theme, setTheme] = useState("");
  const [color, setColor] = useState("");
  const [parts, setParts] = useState("");
  const [trending, setTrending] = useState(false);
  const [featured, setFeatured] = useState(false);
  const [images, setImages] = useState<{ path: string; url: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const models = useQuery({
    queryKey: ["models", brandId],
    queryFn: () => listModels({ data: { brandId } }),
    enabled: !!brandId,
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (!title || images.length === 0) throw new Error("Title and at least one image required.");
      const [first, ...rest] = images.map((i) => i.path);
      return upsert({
        data: {
          title,
          description: description || null,
          category_id: categoryId || null,
          brand_id: brandId || null,
          model_id: modelId || null,
          price_min: priceMin ? Number(priceMin) : null,
          price_max: priceMax ? Number(priceMax) : null,
          estimated_days: days ? Number(days) : null,
          theme: theme || null,
          color: color || null,
          required_parts: parts
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          thumbnail_path: first,
          image_paths: rest,
          is_trending: trending,
          is_featured: featured,
        },
      });
    },
    onSuccess: () => {
      setMessage("Design published ✓");
      setTitle("");
      setDescription("");
      setPriceMin("");
      setPriceMax("");
      setDays("");
      setTheme("");
      setColor("");
      setParts("");
      setTrending(false);
      setFeatured(false);
      setImages([]);
      qc.invalidateQueries({ queryKey: ["admin"] });
      qc.invalidateQueries({ queryKey: ["designs"] });
      setTimeout(() => setMessage(null), 3000);
    },
    onError: (e: Error) => setMessage(e.message),
  });

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    setUploading(true);
    try {
      const uploads: { path: string; url: string }[] = [];
      for (const f of Array.from(files)) {
        const base64 = await toBase64(f);
        const res = await upload({
          data: { filename: f.name, contentType: f.type || "image/jpeg", base64 },
        });
        uploads.push({ path: res.path, url: URL.createObjectURL(f) });
      }
      setImages((prev) => [...prev, ...uploads]);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit.mutate();
      }}
      className="space-y-5 rounded-3xl surface-panel p-5"
    >
      <div>
        <Label>Design title *</Label>
        <Input value={title} onChange={(e) => setTitle(e.currentTarget.value)} placeholder="Duke 390 Neon Hydro Dip" />
      </div>
      <div>
        <Label>Description</Label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          rows={3}
          className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:neon-ring"
          placeholder="Full tank, side panels & rims in hydro carbon…"
        />
      </div>

      <div>
        <Label>Images * (first image is the cover)</Label>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*"
          onChange={(e) => onFiles(e.currentTarget.files)}
          className="hidden"
          id="admin-file"
        />
        <label
          htmlFor="admin-file"
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-neon/40 bg-neon/5 px-4 py-8 text-center text-sm text-muted-foreground hover:neon-ring"
        >
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin text-neon" />
          ) : (
            <>
              <Upload className="h-5 w-5 text-neon" />
              <span>Tap to upload photos (multiple allowed)</span>
            </>
          )}
        </label>
        {images.length > 0 ? (
          <div className="mt-3 grid grid-cols-4 gap-2">
            {images.map((img, i) => (
              <div key={img.path} className="relative overflow-hidden rounded-xl border border-border">
                <img src={img.url} alt="" className="aspect-square w-full object-cover" />
                {i === 0 ? (
                  <span className="absolute left-1 top-1 rounded-full bg-neon px-1.5 py-0.5 text-[9px] font-bold uppercase text-neon-foreground">
                    Cover
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                  className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-background/80 text-crimson"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Category</Label>
          <Select value={categoryId} onChange={setCategoryId}>
            <option value="">—</option>
            {(cats.data ?? []).map((c: CategoryRow) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Brand</Label>
          <Select
            value={brandId}
            onChange={(v) => {
              setBrandId(v);
              setModelId("");
            }}
          >
            <option value="">—</option>
            {(brands.data ?? []).map((b: BrandRow) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {brandId ? (
        <div>
          <Label>Model</Label>
          <Select value={modelId} onChange={setModelId}>
            <option value="">—</option>
            {(models.data ?? []).map((m: ModelRow) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label>Price min ₹</Label>
          <Input type="number" value={priceMin} onChange={(e) => setPriceMin(e.currentTarget.value)} />
        </div>
        <div>
          <Label>Price max ₹</Label>
          <Input type="number" value={priceMax} onChange={(e) => setPriceMax(e.currentTarget.value)} />
        </div>
        <div>
          <Label>Days</Label>
          <Input type="number" value={days} onChange={(e) => setDays(e.currentTarget.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Theme</Label>
          <Input value={theme} onChange={(e) => setTheme(e.currentTarget.value)} placeholder="Racing, Stealth…" />
        </div>
        <div>
          <Label>Color</Label>
          <Input value={color} onChange={(e) => setColor(e.currentTarget.value)} placeholder="Matte black" />
        </div>
      </div>
      <div>
        <Label>Required parts (comma separated)</Label>
        <Input
          value={parts}
          onChange={(e) => setParts(e.currentTarget.value)}
          placeholder="Fuel tank, Side panels, Rims"
        />
      </div>
      <div className="flex flex-wrap gap-4">
        <Toggle label="Trending" checked={trending} onChange={setTrending} />
        <Toggle label="Featured" checked={featured} onChange={setFeatured} />
      </div>
      {message ? (
        <div
          className={cn(
            "rounded-2xl border px-4 py-3 text-sm",
            message.includes("✓")
              ? "border-neon/40 bg-neon/10 text-neon"
              : "border-crimson/40 bg-crimson/10 text-crimson",
          )}
        >
          {message}
        </div>
      ) : null}
      <button
        type="submit"
        disabled={submit.isPending}
        className="w-full rounded-full bg-neon px-5 py-3 font-display text-sm font-bold uppercase tracking-widest text-neon-foreground shadow-neon disabled:opacity-50"
      >
        {submit.isPending ? "Publishing…" : "Publish design"}
      </button>
    </form>
  );
}

function TaxonomyPanel() {
  const qc = useQueryClient();
  const upsertCat = useServerFn(adminUpsertCategory);
  const deleteCat = useServerFn(adminDeleteCategory);
  const upsertBrand = useServerFn(adminUpsertBrand);
  const upsertModel = useServerFn(adminUpsertModel);

  const cats = useQuery({ queryKey: ["categories"], queryFn: () => listCategories() });
  const brands = useQuery({ queryKey: ["brands"], queryFn: () => listBrands() });

  const [newCat, setNewCat] = useState("");
  const [newBrand, setNewBrand] = useState("");
  const [modelBrandId, setModelBrandId] = useState("");
  const [newModel, setNewModel] = useState("");
  const models = useQuery({
    queryKey: ["models", modelBrandId],
    queryFn: () => listModels({ data: { brandId: modelBrandId } }),
    enabled: !!modelBrandId,
  });

  const inv = () => {
    qc.invalidateQueries({ queryKey: ["categories"] });
    qc.invalidateQueries({ queryKey: ["brands"] });
    qc.invalidateQueries({ queryKey: ["models"] });
    qc.invalidateQueries({ queryKey: ["admin"] });
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Categories">
        <AddInline
          placeholder="New category name"
          value={newCat}
          onChange={setNewCat}
          onSubmit={async () => {
            if (!newCat.trim()) return;
            await upsertCat({
              data: {
                name: newCat.trim(),
                slug: slugify(newCat),
                sort_order: (cats.data?.length ?? 0) + 1,
              },
            });
            setNewCat("");
            inv();
          }}
        />
        <ul className="mt-3 space-y-2">
          {(cats.data ?? []).map((c: CategoryRow) => (
            <TaxRow
              key={c.id}
              label={c.name}
              onDelete={async () => {
                if (window.confirm(`Delete ${c.name}?`)) {
                  await deleteCat({ data: { id: c.id } });
                  inv();
                }
              }}
            />
          ))}
        </ul>
      </Card>

      <Card title="Brands">
        <AddInline
          placeholder="New brand name"
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
        <ul className="mt-3 space-y-2">
          {(brands.data ?? []).map((b: BrandRow) => (
            <TaxRow key={b.id} label={b.name} />
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
            <Input value={newModel} onChange={(e) => setNewModel(e.currentTarget.value)} placeholder="Duke 200" />
          </div>
          <button
            type="button"
            onClick={async () => {
              if (!modelBrandId || !newModel.trim()) return;
              await upsertModel({
                data: { brand_id: modelBrandId, name: newModel.trim(), slug: slugify(newModel) },
              });
              setNewModel("");
              inv();
            }}
            className="rounded-full bg-neon px-4 py-2 text-xs font-bold uppercase tracking-widest text-neon-foreground shadow-neon"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        {modelBrandId ? (
          <ul className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3">
            {(models.data ?? []).map((m: ModelRow) => (
              <li key={m.id} className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs">
                {m.name}
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </div>
  );
}

/* ---------------- UI primitives ---------------- */

function Card({ title, wide = false, children }: { title: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-3xl surface-panel p-5", wide && "md:col-span-2")}>
      <h3 className="font-display text-sm font-bold uppercase tracking-widest text-neon">{title}</h3>
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
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      className="w-full rounded-2xl border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:neon-ring"
    >
      {children}
    </select>
  );
}
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-widest transition",
        checked ? "border-neon bg-neon/15 text-neon" : "border-border text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          checked ? "bg-neon" : "bg-muted-foreground/50",
        )}
      />
      {label}
    </button>
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
        <Plus className="h-4 w-4" />
      </button>
    </form>
  );
}
function TaxRow({ label, onDelete }: { label: string; onDelete?: () => void | Promise<void> }) {
  return (
    <li className="flex items-center justify-between rounded-2xl border border-border bg-surface px-3 py-2">
      <span className="text-sm">{label}</span>
      {onDelete ? (
        <button
          type="button"
          onClick={onDelete}
          className="text-muted-foreground hover:text-crimson"
          aria-label={`Delete ${label}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ) : null}
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
    reader.onerror = () => rej(reader.error);
    reader.readAsDataURL(file);
  });
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
