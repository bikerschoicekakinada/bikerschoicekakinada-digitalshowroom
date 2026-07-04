import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// ---------- Types ----------
export type CategoryRow = {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  sort_order: number;
};

export type BrandRow = {
  id: string;
  slug: string;
  name: string;
  logo_path: string | null;
  sort_order: number;
};

export type ModelRow = {
  id: string;
  brand_id: string;
  slug: string;
  name: string;
};

export type DesignRow = {
  id: string;
  title: string;
  description: string | null;
  category_id: string | null;
  brand_id: string | null;
  model_id: string | null;
  price_min: number | null;
  price_max: number | null;
  estimated_days: number | null;
  required_parts: string[];
  theme: string | null;
  color: string | null;
  thumbnail_path: string;
  image_paths: string[];
  is_trending: boolean;
  is_featured: boolean;
  view_count: number;
  created_at: string;
  category?: { slug: string; name: string } | null;
  brand?: { slug: string; name: string } | null;
  model?: { slug: string; name: string } | null;
};

// ---------- Server functions ----------
export const listCategories = createServerFn({ method: "GET" }).handler(async () => {
  const { getPublicServerClient } = await import("./supabase-public.server");
  const supabase = getPublicServerClient();
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as CategoryRow[];
});

export const listBrands = createServerFn({ method: "GET" }).handler(async () => {
  const { getPublicServerClient } = await import("./supabase-public.server");
  const supabase = getPublicServerClient();
  const { data, error } = await supabase
    .from("brands")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as BrandRow[];
});

export const listModels = createServerFn({ method: "GET" })
  .inputValidator((d: { brandId?: string } | undefined) => d ?? {})
  .handler(async ({ data }) => {
    const { getPublicServerClient } = await import("./supabase-public.server");
    const supabase = getPublicServerClient();
    let q = supabase.from("models").select("*").order("name");
    if (data.brandId) q = q.eq("brand_id", data.brandId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return (rows ?? []) as ModelRow[];
  });

const listInput = z.object({
  categorySlug: z.string().optional(),
  brandSlug: z.string().optional(),
  modelSlug: z.string().optional(),
  q: z.string().optional(),
  trending: z.boolean().optional(),
  featured: z.boolean().optional(),
  limit: z.number().min(1).max(60).default(24),
  offset: z.number().min(0).default(0),
  sort: z.enum(["newest", "trending", "priceAsc", "priceDesc"]).default("newest"),
});

export const listDesigns = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => listInput.parse(d ?? {}))
  .handler(async ({ data }) => {
    const { getPublicServerClient } = await import("./supabase-public.server");
    const supabase = getPublicServerClient();

    let query = supabase
      .from("designs")
      .select(
        `id,title,description,category_id,brand_id,model_id,price_min,price_max,estimated_days,
         required_parts,theme,color,thumbnail_path,image_paths,is_trending,is_featured,view_count,created_at,
         category:categories(slug,name),brand:brands(slug,name),model:models(slug,name)`,
        { count: "exact" },
      )
      .range(data.offset, data.offset + data.limit - 1);

    if (data.categorySlug) {
      const { data: cat } = await supabase.from("categories").select("id").eq("slug", data.categorySlug).maybeSingle();
      if (cat?.id) query = query.eq("category_id", cat.id);
      else return { rows: [] as DesignRow[], count: 0 };
    }
    if (data.brandSlug) {
      const { data: b } = await supabase.from("brands").select("id").eq("slug", data.brandSlug).maybeSingle();
      if (b?.id) query = query.eq("brand_id", b.id);
      else return { rows: [] as DesignRow[], count: 0 };
    }
    if (data.trending) query = query.eq("is_trending", true);
    if (data.featured) query = query.eq("is_featured", true);
    if (data.q && data.q.trim()) query = query.ilike("title", `%${data.q.trim()}%`);

    if (data.sort === "trending") query = query.order("view_count", { ascending: false });
    else if (data.sort === "priceAsc") query = query.order("price_min", { ascending: true, nullsFirst: false });
    else if (data.sort === "priceDesc") query = query.order("price_max", { ascending: false, nullsFirst: false });
    else query = query.order("created_at", { ascending: false });

    const { data: rows, error, count } = await query;
    if (error) throw error;
    return { rows: (rows ?? []) as unknown as DesignRow[], count: count ?? 0 };
  });

export const getDesign = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { getPublicServerClient } = await import("./supabase-public.server");
    const supabase = getPublicServerClient();
    const { data: row, error } = await supabase
      .from("designs")
      .select(
        `*, category:categories(slug,name), brand:brands(slug,name), model:models(slug,name)`,
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    return row as DesignRow | null;
  });

// Signed URLs for images (bucket is private).
export const signImageUrls = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ paths: z.array(z.string()).max(120), expiresIn: z.number().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    if (data.paths.length === 0) return {} as Record<string, string>;
    const { getPublicServerClient } = await import("./supabase-public.server");
    const supabase = getPublicServerClient();
    const { data: signed, error } = await supabase.storage
      .from("catalog")
      .createSignedUrls(data.paths, data.expiresIn ?? 60 * 60 * 6); // 6h
    if (error) throw error;
    const map: Record<string, string> = {};
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) map[s.path] = s.signedUrl;
    }
    return map;
  });
