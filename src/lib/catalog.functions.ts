import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

// ============================================================
// Rate Limiter (in-memory, per-process)
// ============================================================
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function rateLimit(key: string, maxAttempts: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count++;
  return entry.count <= maxAttempts;
}

function getClientIp(): string {
  try {
    const request = getRequest();
    const forwarded = request?.headers?.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0].trim();
    const realIp = request?.headers?.get("x-real-ip");
    if (realIp) return realIp;
    return "unknown";
  } catch {
    return "unknown";
  }
}

// ============================================================
// Row Types
// ============================================================

export type CategoryRow = {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  sort_order: number;
  description: string | null;
  is_active: boolean;
};

export type BrandRow = {
  id: string;
  slug: string;
  name: string;
  logo_path: string | null;
  sort_order: number;
  designs_count?: number;
};

export type ModelRow = {
  id: string;
  brand_id: string;
  slug: string;
  name: string;
  designs_count?: number;
};

/** A single uploaded image tagged to a bike model */
export type ImageRow = {
  id: string;
  title: string;
  brand_id: string | null;
  model_id: string | null;
  thumbnail_path: string;
  original_path: string | null;
  small_path: string | null;
  medium_path: string | null;
  large_path: string | null;
  image_paths: string[];
  sort_order: number;
  created_at: string;
  brand?: { id: string; slug: string; name: string } | null;
  model?: { id: string; slug: string; name: string } | null;
  description: string | null;
  tags: string[];
  file_hash: string | null;
  file_size: number | null;
};

/** Kept for backwards compat within remaining routes */
export type DesignRow = ImageRow;

export type CategoryItemRow = {
  id: string;
  category_id: string;
  name: string;
  price: number; // integer rupees
  description: string | null;
  is_active: boolean;
  is_recommended: boolean;
  sort_order: number;
  created_at: string;
};

/** One category with its items — used for the configurator */
export type ConfiguratorCategoryRow = {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  sort_order: number;
  items: CategoryItemRow[];
};

/** Category header without items — used for lazy-loading configurator */
export type ConfiguratorCategoryMeta = {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  sort_order: number;
  itemCount: number;
};

/** Model with its brand + optional thumbnail for search/listing */
export type ModelSearchResult = {
  id: string;
  slug: string;
  name: string;
  brand_id: string;
  brand: { id: string; slug: string; name: string };
  thumbnail_path: string | null;
  designs_count?: number;
};

// ============================================================
// Core Catalog Read Operations
// ============================================================

export const listCategories = createServerFn({ method: "GET" }).handler(async () => {
  const { getPublicServerClient } = await import("./supabase-public.server");
  const supabase = getPublicServerClient();
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as CategoryRow[];
});

export const listBrands = createServerFn({ method: "GET" }).handler(async () => {
  const { getPublicServerClient } = await import("./supabase-public.server");
  const supabase = getPublicServerClient();
  const { data, error } = await supabase
    .from("brands")
    .select(
      `
      id,
      slug,
      name,
      logo_path,
      sort_order,
      designs(count)
    `,
    )
    .order("sort_order", { ascending: true });
  if (error) throw error;

  const mapped = (data ?? []).map((b: any) => ({
    id: b.id,
    slug: b.slug,
    name: b.name,
    logo_path: b.logo_path,
    sort_order: b.sort_order,
    designs_count: b.designs?.[0]?.count ?? 0,
  }));

  return mapped as BrandRow[];
});

export const listModels = createServerFn({ method: "GET" })
  .validator((d: { brandId?: string } | undefined) => d ?? {})
  .handler(async ({ data }) => {
    const { getPublicServerClient } = await import("./supabase-public.server");
    const supabase = getPublicServerClient();
    let q = supabase.from("models").select("*, designs(count)").order("name");
    if (data.brandId) q = q.eq("brand_id", data.brandId);
    const { data: rows, error } = await q;
    if (error) throw error;

    const mapped = (rows ?? []).map((m: any) => ({
      id: m.id,
      brand_id: m.brand_id,
      slug: m.slug,
      name: m.name,
      designs_count: m.designs?.[0]?.count ?? 0,
    }));
    return mapped as (ModelRow & { designs_count: number })[];
  });

/**
 * Search models by name (trigram) or brand name.
 * Returns model + brand info + the thumbnail of the most recent image.
 */
export const searchModels = createServerFn({ method: "GET" })
  .validator((d: unknown) =>
    z
      .object({ q: z.string().default(""), limit: z.number().min(1).max(60).default(24) })
      .parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const { getPublicServerClient } = await import("./supabase-public.server");
    const supabase = getPublicServerClient();

    let q = supabase
      .from("models")
      .select("id,slug,name,brand_id,brand:brands(id,slug,name),designs(count)")
      .order("name")
      .limit(data.limit);

    if (data.q.trim()) {
      q = q.ilike("name", `%${data.q.trim()}%`);
    }

    const { data: models, error } = await q;
    if (error) throw error;

    const results = (models ?? []).map((m: any) => ({
      id: m.id,
      slug: m.slug,
      name: m.name,
      brand_id: m.brand_id,
      brand: m.brand,
      designs_count: m.designs?.[0]?.count ?? 0,
      thumbnail_path: null as string | null,
    })) as unknown as ModelSearchResult[];

    // Attach thumbnail (most recent image per model)
    if (results.length > 0) {
      const ids = results.map((m) => m.id);
      const { data: imgs } = await supabase
        .from("designs")
        .select("model_id, thumbnail_path")
        .in("model_id", ids)
        .order("created_at", { ascending: false });

      const thumbMap: Record<string, string> = {};
      for (const img of imgs ?? []) {
        if (img.model_id && !thumbMap[img.model_id]) {
          thumbMap[img.model_id] = img.thumbnail_path;
        }
      }
      for (const m of results) {
        m.thumbnail_path = thumbMap[m.id] ?? null;
      }
    }

    return results;
  });

export const listImagesByModel = createServerFn({ method: "GET" })
  .validator((d: unknown) =>
    z
      .object({
        modelId: z.string().uuid(),
        limit: z.number().min(1).max(500).default(24),
        offset: z.number().min(0).default(0),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const { getPublicServerClient } = await import("./supabase-public.server");
    const supabase = getPublicServerClient();

    // Query ONLY minimal fields required for thumbnails rendering:
    // id, thumbnail_path, model_id, sort_order
    const {
      data: rows,
      count,
      error,
    } = await supabase
      .from("designs")
      .select("id,thumbnail_path,model_id,sort_order", { count: "exact" })
      .eq("model_id", data.modelId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);

    if (error) throw error;

    return {
      rows: (rows ?? []) as any[],
      count: count ?? 0,
    };
  });

/**
 * Fetch full details for a single opened image, including high-res original, medium paths, description, tags.
 */
export const getImageDetail = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ designId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { getPublicServerClient } = await import("./supabase-public.server");
    const supabase = getPublicServerClient();

    // 1. Try to query with full columns (in case migrations are fully applied)
    try {
      const { data: row, error } = await supabase
        .from("designs")
        .select(
          "id,title,brand_id,model_id,thumbnail_path,original_path,small_path,medium_path,large_path,sort_order,created_at,description,tags",
        )
        .eq("id", data.designId)
        .maybeSingle();

      if (!error && row) {
        const r = row as any;
        return {
          ...r,
          original_path: r.original_path ?? null,
          small_path: r.small_path ?? null,
          medium_path: r.medium_path ?? null,
          large_path: r.large_path ?? null,
        };
      }
    } catch (e) {
      console.warn("getImageDetail: failed full select, falling back to basic columns:", e);
    }

    // 2. Fallback to basic columns that are guaranteed to exist
    const { data: row, error } = await supabase
      .from("designs")
      .select("id,title,brand_id,model_id,thumbnail_path,sort_order,created_at,description,tags")
      .eq("id", data.designId)
      .maybeSingle();

    if (error) throw error;
    if (!row) return null;

    const r = row as any;
    return {
      ...r,
      original_path: r.thumbnail_path,
      small_path: r.thumbnail_path,
      medium_path: r.thumbnail_path,
      large_path: r.thumbnail_path,
    };
  });

/**
 * Returns the model row with brand info, plus all categories and their items
 * that are individually assigned to this specific model.
 * Uses item-level assignments: category_item_model_assignments(item_id, model_id).
 * Single round-trip — no N+1.
 */
export const getConfiguratorData = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ modelId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { getPublicServerClient } = await import("./supabase-public.server");
    const supabase = getPublicServerClient();

    // 1. Fetch model info
    const { data: model, error: modelErr } = await supabase
      .from("models")
      .select("id,slug,name,brand_id,brand:brands(id,slug,name)")
      .eq("id", data.modelId)
      .maybeSingle();
    if (modelErr) throw modelErr;
    if (!model) return null;

    // 2. Fetch item IDs assigned to this model
    const { data: itemAssignments, error: assignErr } = await (supabase as any)
      .from("category_item_model_assignments")
      .select("item_id")
      .eq("model_id", data.modelId);
    if (assignErr) throw assignErr;

    const itemIds = (itemAssignments ?? []).map((a: any) => a.item_id as string);

    // 3. Fetch active items + their parent category in one query, grouped by category
    let categories: ConfiguratorCategoryRow[] = [];
    if (itemIds.length > 0) {
      const { data: items, error: itemErr } = await (supabase as any)
        .from("category_items")
        .select(
          "id,category_id,name,price,description,is_active,is_recommended,sort_order,created_at," +
            "category:categories(id,slug,name,icon,sort_order,is_active)",
        )
        .in("id", itemIds)
        .eq("is_active", true);
      if (itemErr) throw itemErr;

      // Group items by their parent category, skip inactive categories
      const catMap = new Map<string, ConfiguratorCategoryRow>();
      for (const item of items ?? []) {
        const cat = item.category;
        if (!cat || !cat.is_active) continue;
        if (!catMap.has(cat.id)) {
          catMap.set(cat.id, {
            id: cat.id,
            slug: cat.slug,
            name: cat.name,
            icon: cat.icon,
            sort_order: cat.sort_order,
            items: [],
          });
        }
        // Destructure category join out of item before pushing
        const { category: _cat, ...itemFields } = item;
        catMap.get(cat.id)!.items.push(itemFields as CategoryItemRow);
      }

      // Sort categories by sort_order, items within each category by sort_order
      categories = Array.from(catMap.values())
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((cat) => ({
          ...cat,
          items: cat.items.sort((a, b) => a.sort_order - b.sort_order),
        }));
    }

    return {
      model: model as unknown as ModelSearchResult,
      categories,
    };
  });

/**
 * Lightweight version: returns model + category headers (no items).
 * Each category includes the count of active assigned items.
 * Items are loaded on-demand via getConfiguratorCategoryItems.
 */
export const getConfiguratorCategoryMeta = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ modelId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { getPublicServerClient } = await import("./supabase-public.server");
    const supabase = getPublicServerClient();

    // 1. Model info
    const { data: model, error: modelErr } = await supabase
      .from("models")
      .select("id,slug,name,brand_id,brand:brands(id,slug,name)")
      .eq("id", data.modelId)
      .maybeSingle();
    if (modelErr) throw modelErr;
    if (!model) return null;

    // 2. Item IDs assigned to this model
    const { data: itemAssignments, error: assignErr } = await (supabase as any)
      .from("category_item_model_assignments")
      .select("item_id")
      .eq("model_id", data.modelId);
    if (assignErr) throw assignErr;

    const itemIds = (itemAssignments ?? []).map((a: any) => a.item_id as string);

    let categories: ConfiguratorCategoryMeta[] = [];
    if (itemIds.length > 0) {
      // 3. Fetch items' category_id only (lightweight)
      const { data: items, error: itemErr } = await (supabase as any)
        .from("category_items")
        .select("id,category_id,category:categories(id,slug,name,icon,sort_order,is_active)")
        .in("id", itemIds)
        .eq("is_active", true);
      if (itemErr) throw itemErr;

      // Group and count by category
      const catMap = new Map<string, ConfiguratorCategoryMeta>();
      for (const item of items ?? []) {
        const cat = item.category;
        if (!cat || !cat.is_active) continue;
        if (!catMap.has(cat.id)) {
          catMap.set(cat.id, {
            id: cat.id,
            slug: cat.slug,
            name: cat.name,
            icon: cat.icon,
            sort_order: cat.sort_order,
            itemCount: 0,
          });
        }
        catMap.get(cat.id)!.itemCount++;
      }

      categories = Array.from(catMap.values()).sort((a, b) => a.sort_order - b.sort_order);
    }

    return {
      model: model as unknown as ModelSearchResult,
      categories,
    };
  });

/**
 * Fetch the active items for a single category assigned to a model.
 * Used for lazy-loading category contents when the user expands an accordion.
 */
export const getConfiguratorCategoryItems = createServerFn({ method: "GET" })
  .validator((d: unknown) =>
    z.object({ modelId: z.string().uuid(), categoryId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { getPublicServerClient } = await import("./supabase-public.server");
    const supabase = getPublicServerClient();

    // 1. Get item IDs assigned to this model
    const { data: assignments, error: assignErr } = await (supabase as any)
      .from("category_item_model_assignments")
      .select("item_id")
      .eq("model_id", data.modelId);
    if (assignErr) throw assignErr;

    const itemIds = (assignments ?? []).map((a: any) => a.item_id as string);
    if (itemIds.length === 0) return [];

    // 2. Fetch items belonging to this category
    const { data: items, error: itemErr } = await (supabase as any)
      .from("category_items")
      .select(
        "id,category_id,name,price,description,is_active,is_recommended,sort_order,created_at",
      )
      .in("id", itemIds)
      .eq("category_id", data.categoryId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (itemErr) throw itemErr;

    return (items ?? []) as CategoryItemRow[];
  });

/**
 * Signed URLs for images (bucket is private).
 * Rate-limited: 60 requests per IP per minute.
 * Path validation: only allows paths under "designs/" prefix.
 */
export const signImageUrls = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ paths: z.array(z.string()).max(120), expiresIn: z.number().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    // Rate limit: max 60 sign requests per IP per minute
    const ip = getClientIp();
    if (!rateLimit(`sign:${ip}`, 60, 60 * 1000)) {
      throw new Error("Too many requests. Please try again later.");
    }

    // Path validation: reject traversal attacks and non-catalog paths
    for (const p of data.paths) {
      if (p.includes("..") || p.startsWith("/") || !p.startsWith("designs/")) {
        throw new Error("Invalid image path.");
      }
    }

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

/**
 * Get a single model by ID (for configurator metadata).
 */
export const getModel = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { getPublicServerClient } = await import("./supabase-public.server");
    const supabase = getPublicServerClient();
    const { data: row, error } = await supabase
      .from("models")
      .select("id,slug,name,brand_id,brand:brands(id,slug,name),designs(count)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!row) return null;
    const m = row as any;
    return {
      id: m.id,
      slug: m.slug,
      name: m.name,
      brand_id: m.brand_id,
      brand: m.brand,
      designs_count: m.designs?.[0]?.count ?? 0,
      thumbnail_path: null,
    } as ModelSearchResult;
  });

/**
 * List most recently active models (models that have at least one image),
 * used on the homepage.
 */
export const listRecentModelThumbnails = createServerFn({ method: "GET" })
  .validator((d: unknown) =>
    z.object({ limit: z.number().min(1).max(24).default(12) }).parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const { getPublicServerClient } = await import("./supabase-public.server");
    const supabase = getPublicServerClient();

    // Get the most recently uploaded images, deduplicated by model
    const { data: rows, error } = await supabase
      .from("designs")
      .select(
        "model_id,thumbnail_path,model:models(id,slug,name,brand_id,brand:brands(id,slug,name),designs(count))",
      )
      .not("model_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(data.limit * 3); // over-fetch to account for model dedup

    if (error) throw error;

    const seen = new Set<string>();
    const deduped: ModelSearchResult[] = [];
    for (const row of rows ?? []) {
      if (!row.model_id || seen.has(row.model_id)) continue;
      seen.add(row.model_id);
      const m = row.model as any;
      deduped.push({
        id: m.id,
        slug: m.slug,
        name: m.name,
        brand_id: m.brand_id,
        brand: m.brand,
        thumbnail_path: row.thumbnail_path,
        designs_count: m.designs?.[0]?.count ?? 0,
      });
      if (deduped.length >= data.limit) break;
    }
    return deduped;
  });

/**
 * Fetch models by their IDs, attaching their latest thumbnail.
 * Used for the customer's local session "Recently Configured" list.
 */
export const getModelsByIds = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ ids: z.array(z.string().uuid()) }).parse(d ?? {}))
  .handler(async ({ data }) => {
    if (data.ids.length === 0) return [];
    const { getPublicServerClient } = await import("./supabase-public.server");
    const supabase = getPublicServerClient();

    const { data: models, error } = await supabase
      .from("models")
      .select("id,slug,name,brand_id,brand:brands(id,slug,name),designs(count)")
      .in("id", data.ids);
    if (error) throw error;

    const results = (models ?? []).map((m: any) => ({
      id: m.id,
      slug: m.slug,
      name: m.name,
      brand_id: m.brand_id,
      brand: m.brand,
      designs_count: m.designs?.[0]?.count ?? 0,
      thumbnail_path: null as string | null,
    })) as unknown as ModelSearchResult[];

    if (results.length > 0) {
      const { data: imgs } = await supabase
        .from("designs")
        .select("model_id, thumbnail_path")
        .in("model_id", data.ids)
        .order("created_at", { ascending: false });

      const thumbMap: Record<string, string> = {};
      for (const img of imgs ?? []) {
        if (img.model_id && !thumbMap[img.model_id]) {
          thumbMap[img.model_id] = img.thumbnail_path;
        }
      }
      for (const m of results) {
        m.thumbnail_path = thumbMap[m.id] ?? null;
      }
    }

    // Sort to match the input order of ids
    return results.sort((a, b) => data.ids.indexOf(a.id) - data.ids.indexOf(b.id));
  });

/**
 * Fetch all configuration overrides for a specific design image.
 * Joins category item and parent category information for additions.
 */
export const getImageOverrides = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ designId: z.string().uuid() }).parse(d ?? {}))
  .handler(async ({ data }) => {
    const { getPublicServerClient } = await import("./supabase-public.server");
    const supabase = getPublicServerClient();

    const { data: rows, error } = await (supabase as any)
      .from("image_configuration_overrides")
      .select(
        `
        *,
        item:category_items(
          id,
          category_id,
          name,
          price,
          description,
          is_active,
          is_recommended,
          sort_order,
          created_at,
          category:categories(id,slug,name,icon,sort_order,is_active)
        )
      `,
      )
      .eq("design_id", data.designId);
    if (error) throw error;

    return rows ?? [];
  });

/**
 * Merges a default bike model configuration with image-specific overrides.
 * Returns the final customized list of categories and options.
 */
export function mergeConfiguratorData(
  defaultCategories: ConfiguratorCategoryRow[],
  overrides: any[],
): ConfiguratorCategoryRow[] {
  // 1. Deep copy categories and items
  const catMap = new Map<string, ConfiguratorCategoryRow>();
  for (const cat of defaultCategories) {
    catMap.set(cat.id, {
      ...cat,
      items: cat.items.map((it) => ({ ...it })),
    });
  }

  // 2. Process item overrides
  for (const o of overrides) {
    if (!o.item_id) continue;
    const itemId = o.item_id;

    let foundItem: CategoryItemRow | null = null;

    for (const cat of catMap.values()) {
      const idx = cat.items.findIndex((it) => it.id === itemId);
      if (idx !== -1) {
        foundItem = cat.items[idx];
        if (o.is_removed) {
          // Remove item from this category
          cat.items.splice(idx, 1);
        }
        break;
      }
    }

    // Apply overrides to existing default item
    if (foundItem && !o.is_removed) {
      if (o.price_override !== null && o.price_override !== undefined)
        foundItem.price = o.price_override;
      if (o.name_override !== null && o.name_override !== undefined)
        foundItem.name = o.name_override;
      if (o.description_override !== null && o.description_override !== undefined)
        foundItem.description = o.description_override;
      if (o.is_recommended !== null && o.is_recommended !== undefined)
        foundItem.is_recommended = o.is_recommended;
      if (o.is_active !== null && o.is_active !== undefined) foundItem.is_active = o.is_active;
      if (o.sort_order !== null && o.sort_order !== undefined) foundItem.sort_order = o.sort_order;
    }

    // If this is an added override (item wasn't in default list)
    if (!foundItem && o.is_added && o.item) {
      const rawItem = o.item;
      const catInfo = rawItem.category;
      if (catInfo && catInfo.is_active) {
        if (!catMap.has(catInfo.id)) {
          catMap.set(catInfo.id, {
            id: catInfo.id,
            slug: catInfo.slug,
            name: catInfo.name,
            icon: catInfo.icon,
            sort_order: catInfo.sort_order,
            items: [],
          });
        }

        const targetCat = catMap.get(catInfo.id)!;
        const newItem: CategoryItemRow = {
          id: rawItem.id,
          category_id: rawItem.category_id,
          name:
            o.name_override !== null && o.name_override !== undefined
              ? o.name_override
              : rawItem.name,
          price:
            o.price_override !== null && o.price_override !== undefined
              ? o.price_override
              : rawItem.price,
          description:
            o.description_override !== null && o.description_override !== undefined
              ? o.description_override
              : rawItem.description,
          is_active:
            o.is_active !== null && o.is_active !== undefined ? o.is_active : rawItem.is_active,
          is_recommended:
            o.is_recommended !== null && o.is_recommended !== undefined
              ? o.is_recommended
              : rawItem.is_recommended,
          sort_order:
            o.sort_order !== null && o.sort_order !== undefined ? o.sort_order : rawItem.sort_order,
          created_at: rawItem.created_at,
        };

        targetCat.items.push(newItem);
      }
    }
  }

  // 3. Process category overrides
  for (const o of overrides) {
    if (!o.category_id) continue;
    const catId = o.category_id;

    if (catMap.has(catId)) {
      if (o.category_hidden) {
        catMap.delete(catId);
      } else if (o.sort_order !== null && o.sort_order !== undefined) {
        catMap.get(catId)!.sort_order = o.sort_order;
      }
    }
  }

  // 4. Sort and return
  return Array.from(catMap.values())
    .filter((cat) => cat.items.length > 0)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((cat) => ({
      ...cat,
      items: cat.items.sort((a, b) => a.sort_order - b.sort_order),
    }));
}

const shareConfigInput = z.object({
  modelId: z.string().uuid(),
  activeIdx: z.number().int().min(0),
  selectedItemIds: z.array(z.string().uuid()),
});

export const createShareLink = createServerFn({ method: "POST" })
  .validator((d: unknown) => shareConfigInput.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Generate a secure random alphanumeric token (10 chars)
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let token = "";
    for (let i = 0; i < 10; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // Insert the shared configuration record
    const { error } = await (supabaseAdmin as any).from("shared_configurations").insert({
      id: token,
      model_id: data.modelId,
      active_idx: data.activeIdx,
      selected_item_ids: data.selectedItemIds,
    });

    if (error) {
      console.error("[createShareLink] Database error:", error.message);
      throw new Error("Failed to create shared link configuration.");
    }

    return { token };
  });

export const getSharedConfiguration = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ token: z.string().min(1).max(50) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: config, error } = await (supabaseAdmin as any)
      .from("shared_configurations")
      .select("model_id, active_idx, selected_item_ids")
      .eq("id", data.token)
      .maybeSingle();

    if (error) {
      console.error("[getSharedConfiguration] Database error:", error.message);
      return null;
    }
    return config;
  });
