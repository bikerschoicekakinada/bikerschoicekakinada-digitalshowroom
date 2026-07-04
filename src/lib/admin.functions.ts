import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash, timingSafeEqual } from "node:crypto";

function pinMatches(input: string, expected: string): boolean {
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

export const adminStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdminSession } = await import("./admin-session.server");
  const session = await getAdminSession();
  return { unlocked: !!session.data.unlocked };
});

export const adminLogin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ pin: z.string().min(4).max(12) }).parse(d))
  .handler(async ({ data }) => {
    const expected = process.env.ADMIN_PIN;
    if (!expected) throw new Error("ADMIN_PIN is not configured");
    if (!pinMatches(data.pin, expected)) return { ok: false as const };
    const { getAdminSession } = await import("./admin-session.server");
    const session = await getAdminSession();
    await session.update({ unlocked: true, issuedAt: Date.now() });
    return { ok: true as const };
  });

export const adminLogout = createServerFn({ method: "POST" }).handler(async () => {
  const { getAdminSession } = await import("./admin-session.server");
  const session = await getAdminSession();
  await session.clear();
  return { ok: true as const };
});

const upsertInput = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(160),
  description: z.string().max(2000).optional().nullable(),
  category_id: z.string().uuid().nullable().optional(),
  brand_id: z.string().uuid().nullable().optional(),
  model_id: z.string().uuid().nullable().optional(),
  price_min: z.number().int().nullable().optional(),
  price_max: z.number().int().nullable().optional(),
  estimated_days: z.number().int().nullable().optional(),
  required_parts: z.array(z.string()).default([]),
  theme: z.string().max(60).nullable().optional(),
  color: z.string().max(60).nullable().optional(),
  thumbnail_path: z.string().min(1),
  image_paths: z.array(z.string()).default([]),
  is_trending: z.boolean().default(false),
  is_featured: z.boolean().default(false),
});

export const adminUpsertDesign = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => upsertInput.parse(d))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.id) {
      const { data: row, error } = await supabaseAdmin
        .from("designs")
        .update({ ...data, id: undefined })
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw error;
      return row;
    }
    const { data: row, error } = await supabaseAdmin.from("designs").insert(data).select().single();
    if (error) throw error;
    return row;
  });

export const adminDeleteDesign = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // fetch paths, delete storage objects, then row
    const { data: row } = await supabaseAdmin
      .from("designs")
      .select("thumbnail_path,image_paths")
      .eq("id", data.id)
      .maybeSingle();
    const paths = new Set<string>();
    if (row?.thumbnail_path) paths.add(row.thumbnail_path);
    for (const p of row?.image_paths ?? []) paths.add(p);
    if (paths.size > 0) {
      await supabaseAdmin.storage.from("catalog").remove([...paths]);
    }
    const { error } = await supabaseAdmin.from("designs").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });

// Upload a single image (base64) — returns storage path
export const adminUploadImage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        filename: z.string().min(1).max(200),
        contentType: z.string().min(1).max(120),
        base64: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    const clean = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `designs/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${clean}`;
    const { error } = await supabaseAdmin.storage.from("catalog").upload(path, bytes, {
      contentType: data.contentType,
      upsert: false,
    });
    if (error) throw error;
    return { path };
  });

// Category / brand / model management
export const adminUpsertCategory = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        slug: z.string().min(1),
        name: z.string().min(1),
        icon: z.string().nullable().optional(),
        sort_order: z.number().int().default(100),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.id) {
      const { data: row, error } = await supabaseAdmin
        .from("categories")
        .update({ ...data, id: undefined })
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw error;
      return row;
    }
    const { data: row, error } = await supabaseAdmin.from("categories").insert(data).select().single();
    if (error) throw error;
    return row;
  });

export const adminDeleteCategory = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("categories").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });

export const adminUpsertBrand = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        slug: z.string().min(1),
        name: z.string().min(1),
        sort_order: z.number().int().default(100),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.id) {
      const { data: row, error } = await supabaseAdmin
        .from("brands")
        .update({ ...data, id: undefined })
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw error;
      return row;
    }
    const { data: row, error } = await supabaseAdmin.from("brands").insert(data).select().single();
    if (error) throw error;
    return row;
  });

export const adminUpsertModel = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        brand_id: z.string().uuid(),
        slug: z.string().min(1),
        name: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.id) {
      const { data: row, error } = await supabaseAdmin
        .from("models")
        .update({ ...data, id: undefined })
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw error;
      return row;
    }
    const { data: row, error } = await supabaseAdmin.from("models").insert(data).select().single();
    if (error) throw error;
    return row;
  });

export const adminStats = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin } = await import("./admin-session.server");
  await requireAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [designs, categories, brands, models] = await Promise.all([
    supabaseAdmin.from("designs").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("categories").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("brands").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("models").select("id", { count: "exact", head: true }),
  ]);
  return {
    designs: designs.count ?? 0,
    categories: categories.count ?? 0,
    brands: brands.count ?? 0,
    models: models.count ?? 0,
  };
});
