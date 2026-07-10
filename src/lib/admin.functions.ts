import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import bcrypt from "bcryptjs";

// ============================================================
// Rate Limiter (in-memory, per-process)
// ============================================================
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function rateLimit(key: string, maxAttempts: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return true; // allowed
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
// Auth
// ============================================================

export const adminStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdminSession } = await import("./admin-session.server");
  const session = await getAdminSession();
  const unlocked = session.data.unlocked === true;
  const issuedAt = session.data.issuedAt ?? 0;
  const now = Date.now();
  if (unlocked && now - issuedAt > 1000 * 60 * 60 * 24) {
    await session.clear();
    return { unlocked: false };
  }
  return { unlocked };
});

export const adminLogin = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ pin: z.string().min(4).max(12) }).parse(d))
  .handler(async ({ data }) => {
    // Rate limit: max 5 login attempts per IP in 15 minutes (in-memory fast-pass rate limit)
    const ip = getClientIp();
    if (!rateLimit(`login:${ip}`, 10, 15 * 60 * 1000)) {
      return {
        ok: false as const,
        reason: "Too many attempts from this IP. Please wait 15 minutes.",
      };
    }

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      // Fetch hashed PIN and lockout details from admin_settings (only service role client has access)
      const { data: settings, error } = await (supabaseAdmin as any)
        .from("admin_settings")
        .select("admin_pin_hash, failed_attempts, locked_until")
        .eq("id", "00000000-0000-0000-0000-000000000001")
        .maybeSingle();

      if (error) {
        console.error("[adminLogin] Database error:", error.message);
        return { ok: false as const, reason: "Database connection error. Contact the developer." };
      }
      if (!settings) {
        console.error("[adminLogin] admin_settings row not found.");
        return { ok: false as const, reason: "Admin settings not configured. Run the migration." };
      }

      // Check lockout status
      if (settings.locked_until) {
        const lockedUntil = new Date(settings.locked_until).getTime();
        const now = Date.now();
        if (lockedUntil > now) {
          const waitMinutes = Math.ceil((lockedUntil - now) / 1000 / 60);
          return {
            ok: false as const,
            reason: `Too many failed attempts. Account locked. Please wait ${waitMinutes} minute(s).`,
          };
        }
      }

      if (!settings.admin_pin_hash || settings.admin_pin_hash.length < 10) {
        console.error("[adminLogin] admin_pin_hash is empty or too short.");
        return { ok: false as const, reason: "Admin PIN not set. Contact the developer." };
      }

      // Verify PIN using bcrypt
      const match = await bcrypt.compare(data.pin, settings.admin_pin_hash);

      if (!match) {
        // Increment failed attempts and lock if >= 5
        const nextFailed = (settings.failed_attempts ?? 0) + 1;
        let lockedUntil: string | null = null;
        if (nextFailed >= 5) {
          lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 mins lockout
        }

        await (supabaseAdmin as any)
          .from("admin_settings")
          .update({
            failed_attempts: nextFailed,
            locked_until: lockedUntil,
          })
          .eq("id", "00000000-0000-0000-0000-000000000001");

        if (nextFailed >= 5) {
          return {
            ok: false as const,
            reason: "Too many failed attempts. Account locked for 15 minutes.",
          };
        }
        return {
          ok: false as const,
          reason: `Incorrect PIN. ${5 - nextFailed} attempt(s) remaining.`,
        };
      }

      // Reset failed attempts on success
      await (supabaseAdmin as any)
        .from("admin_settings")
        .update({
          failed_attempts: 0,
          locked_until: null,
        })
        .eq("id", "00000000-0000-0000-0000-000000000001");

      const { getAdminSession } = await import("./admin-session.server");
      const session = await getAdminSession();
      await session.update({ unlocked: true, issuedAt: Date.now() });
      return { ok: true as const };
    } catch (err: any) {
      console.error("[adminLogin] Unexpected error:", err);
      const msg = err?.message ?? "";
      let safeReason = "Server configuration error. Please contact the administrator.";
      if (
        msg.includes("Server configuration error") ||
        msg.includes("Incorrect PIN") ||
        msg.includes("Rate limit exceeded") ||
        msg.includes("not configured") ||
        msg.includes("not set") ||
        msg.includes("remaining") ||
        msg.includes("locked")
      ) {
        safeReason = msg;
      } else if (process.env.NODE_ENV !== "production") {
        safeReason = msg || "Unexpected server error";
      }
      return { ok: false as const, reason: safeReason };
    }
  });

export const adminLogout = createServerFn({ method: "POST" }).handler(async () => {
  const { getAdminSession } = await import("./admin-session.server");
  const session = await getAdminSession();
  await session.clear();
  return { ok: true as const };
});

// ============================================================
// Stats
// ============================================================

export const adminStats = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin } = await import("./admin-session.server");
  await requireAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const [images, categories, brands, models, items, assignments] = await Promise.all([
    db.from("designs").select("id", { count: "exact", head: true }),
    db.from("categories").select("id", { count: "exact", head: true }),
    db.from("brands").select("id", { count: "exact", head: true }),
    db.from("models").select("id", { count: "exact", head: true }),
    db.from("category_items").select("id", { count: "exact", head: true }),
    db.from("category_model_assignments").select("id", { count: "exact", head: true }),
  ]);
  return {
    images: images.count ?? 0,
    categories: categories.count ?? 0,
    brands: brands.count ?? 0,
    models: models.count ?? 0,
    items: items.count ?? 0,
    assignments: assignments.count ?? 0,
  };
});

// ============================================================
// Image Upload
// ============================================================

const uploadDesignInput = z.object({
  id: z.string().uuid().optional(),
  brand_id: z.string().uuid().nullable().optional(),
  model_id: z.string().uuid().nullable().optional(),
  title: z.string().max(160).default(""),
  thumbnail_path: z.string().min(1),
  image_paths: z.array(z.string()).default([]),
  sort_order: z.number().int().default(0),
  description: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  file_hash: z.string().nullable().optional(),
  file_size: z.number().int().nullable().optional(),
});

export const adminUpsertDesign = createServerFn({ method: "POST" })
  .validator((d: unknown) => uploadDesignInput.parse(d))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    if (data.id) {
      const { data: row, error } = await db
        .from("designs")
        .update({ ...data, id: undefined })
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw error;
      return row;
    }
    const { data: row, error } = await db.from("designs").insert(data).select().single();
    if (error) throw error;
    return row;
  });

export const adminDeleteDesign = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("designs")
      .select("thumbnail_path,image_paths")
      .eq("id", data.id)
      .maybeSingle();
    const paths = new Set<string>();
    if (row?.thumbnail_path) paths.add(row.thumbnail_path);
    for (const p of (row as any)?.image_paths ?? []) paths.add(p);
    if (paths.size > 0) {
      await supabaseAdmin.storage.from("catalog").remove([...paths]);
    }
    const { error } = await supabaseAdmin.from("designs").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });

/** Check if an image with the same hash exists for the same model_id */
export const adminCheckDuplicate = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        model_id: z.string().uuid(),
        file_hash: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: existing, error } = await db
      .from("designs")
      .select("id, thumbnail_path, title")
      .eq("model_id", data.model_id)
      .eq("file_hash", data.file_hash)
      .maybeSingle();
    if (error) throw error;
    return existing;
  });

/** Edit metadata for a design (image row) */
export const adminUpdateDesignMeta = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        brand_id: z.string().uuid().nullable().optional(),
        model_id: z.string().uuid().nullable().optional(),
        description: z.string().nullable().optional(),
        tags: z.array(z.string()).default([]),
        sort_order: z.number().int().default(0),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await (supabaseAdmin as any)
      .from("designs")
      .update({
        brand_id: data.brand_id,
        model_id: data.model_id,
        description: data.description,
        tags: data.tags,
        sort_order: data.sort_order,
      })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

/** Replace an image on a design row with a new file path (and clean up old storage path) */
export const adminReplaceDesignImage = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        new_thumbnail_path: z.string().min(1),
        file_hash: z.string().nullable().optional(),
        file_size: z.number().int().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Fetch the old image path first
    const { data: oldRow, error: fetchErr } = await supabaseAdmin
      .from("designs")
      .select("thumbnail_path")
      .eq("id", data.id)
      .single();
    if (fetchErr) throw fetchErr;

    // Update with new path, hash, size
    const { data: row, error } = await (supabaseAdmin as any)
      .from("designs")
      .update({
        thumbnail_path: data.new_thumbnail_path,
        file_hash: data.file_hash,
        file_size: data.file_size,
      })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw error;

    // Delete old image from storage bucket
    if (oldRow?.thumbnail_path && oldRow.thumbnail_path !== data.new_thumbnail_path) {
      await supabaseAdmin.storage.from("catalog").remove([oldRow.thumbnail_path]);
    }

    return row;
  });

function validateImageSignature(bytes: Uint8Array, mimeType: string): boolean {
  if (bytes.length < 4) return false;

  // JPEG: FF D8 FF
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  // PNG: 89 50 4E 47
  if (mimeType === "image/png") {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }
  // WebP: RIFF (bytes 0-3) and WEBP (bytes 8-11)
  if (mimeType === "image/webp") {
    return (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 && // RIFF
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50 // WEBP
    );
  }
  // GIF: GIF87a or GIF89a
  if (mimeType === "image/gif") {
    return (
      bytes[0] === 0x47 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 && // GIF
      bytes[3] === 0x38 &&
      (bytes[4] === 0x37 || bytes[4] === 0x39) &&
      bytes[5] === 0x61 // 87a or 89a
    );
  }
  // SVG: Starts with XML header or '<svg'
  if (mimeType === "image/svg+xml") {
    try {
      const decoder = new TextDecoder("utf-8", { fatal: false });
      const text = decoder.decode(bytes.slice(0, 200)).trim();
      return text.includes("<?xml") || text.includes("<svg");
    } catch {
      return false;
    }
  }
  return false;
}

/** Upload a single image (base64) — returns storage path */
export const adminUploadImage = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
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

    // 1. Validate MIME type against whitelist
    const allowedMimes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/svg+xml",
    ];
    const mime = data.contentType.toLowerCase().trim();
    if (!allowedMimes.includes(mime)) {
      throw new Error("Invalid file type. Only JPEG, PNG, WebP, GIF, and SVG images are allowed.");
    }

    // 2. Decode base64 to binary bytes and check size limit (15MB)
    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    } catch {
      throw new Error("Invalid base64 payload. Failed to decode image.");
    }

    const maxBytes = 15 * 1024 * 1024; // 15MB
    if (bytes.length > maxBytes) {
      throw new Error("File size is too large. Maximum allowed size is 15MB.");
    }

    // 3. Verify file signature / magic numbers
    if (!validateImageSignature(bytes, mime)) {
      throw new Error(
        "Security verification failed. File contents do not match the expected image signature.",
      );
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 4. Sanitize and generate safe filename to prevent path traversal
    const extMap: Record<string, string> = {
      "image/jpeg": ".jpg",
      "image/jpg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
      "image/gif": ".gif",
      "image/svg+xml": ".svg",
    };
    const safeExt = extMap[mime] || ".jpg";
    const cleanBase = data.filename
      .replace(/\.[^/.]+$/, "") // strip existing extension
      .replace(/[^a-zA-Z0-9_-]/g, "_") // only letters, digits, underscores, hyphens
      .slice(0, 50); // prevent oversized name headers

    const path = `designs/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${cleanBase}${safeExt}`;

    const { error } = await supabaseAdmin.storage.from("catalog").upload(path, bytes, {
      contentType: mime,
      upsert: false,
    });
    if (error) throw error;
    return { path };
  });

// ============================================================
// Category CRUD
// ============================================================

export const adminUpsertCategory = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        slug: z.string().min(1),
        name: z.string().min(1),
        icon: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        is_active: z.boolean().default(true),
        sort_order: z.number().int().default(100),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    if (data.id) {
      const { data: row, error } = await db
        .from("categories")
        .update({ ...data, id: undefined })
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw error;
      return row;
    }
    const { data: row, error } = await db.from("categories").insert(data).select().single();
    if (error) throw error;
    return row;
  });

export const adminDeleteCategory = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("categories").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });

// ============================================================
// Category Item CRUD
// ============================================================

export const adminUpsertCategoryItem = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        category_id: z.string().uuid(),
        name: z.string().min(1).max(200),
        price: z.number().int().min(0),
        description: z.string().nullable().optional(),
        is_active: z.boolean().default(true),
        is_recommended: z.boolean().default(false),
        sort_order: z.number().int().default(0),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    if (data.id) {
      const { data: row, error } = await db
        .from("category_items")
        .update({ ...data, id: undefined })
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw error;
      return row;
    }
    const { data: row, error } = await db.from("category_items").insert(data).select().single();
    if (error) throw error;
    return row;
  });

export const adminDeleteCategoryItem = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("category_items")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });

/** Bulk update sort_order for items within a category */
export const adminReorderCategoryItems = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        items: z.array(z.object({ id: z.string().uuid(), sort_order: z.number().int() })),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    await Promise.all(
      data.items.map((item) =>
        db.from("category_items").update({ sort_order: item.sort_order }).eq("id", item.id),
      ),
    );
    return { ok: true as const };
  });

// ============================================================
// Item–Model Assignments (per individual option)
// ============================================================

/** Get all model IDs assigned to a specific category item (option) */
export const adminGetItemAssignments = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ item_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await (supabaseAdmin as any)
      .from("category_item_model_assignments")
      .select("model_id")
      .eq("item_id", data.item_id);
    if (error) throw error;
    return (rows ?? []).map((r: any) => r.model_id as string);
  });

/** Replace ALL model assignments for a category item (bulk save) */
export const adminSaveItemAssignments = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        item_id: z.string().uuid(),
        model_ids: z.array(z.string().uuid()),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    // Delete all existing assignments for this item
    await db.from("category_item_model_assignments").delete().eq("item_id", data.item_id);

    // Insert new assignments (if any)
    if (data.model_ids.length > 0) {
      const rows = data.model_ids.map((model_id) => ({
        item_id: data.item_id,
        model_id,
      }));
      const { error } = await db.from("category_item_model_assignments").insert(rows);
      if (error) throw error;
    }
    return { ok: true as const };
  });

/** Get category items with counts for a category (admin use) */
export const adminListCategoryItems = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ category_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await (supabaseAdmin as any)
      .from("category_items")
      .select("*")
      .eq("category_id", data.category_id)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (rows ?? []) as any[];
  });

/** Admin: list all designs grouped by model for the Images tab */
/** Admin: list all designs grouped by model for the Images tab with search & filters */
export const adminListImages = createServerFn({ method: "GET" })
  .validator((d: unknown) =>
    z
      .object({
        limit: z.number().min(1).max(500).default(100),
        offset: z.number().min(0).default(0),
        search: z.string().optional(),
        brandId: z.string().uuid().optional().nullable(),
        modelId: z.string().uuid().optional().nullable(),
        sortBy: z
          .enum(["recently_uploaded", "recently_edited", "sort_order"])
          .default("recently_uploaded"),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let matchingBrandIds: string[] = [];
    let matchingModelIds: string[] = [];

    if (data.search && data.search.trim()) {
      const clean = data.search.trim();
      const { data: matchedB } = await supabaseAdmin
        .from("brands")
        .select("id")
        .ilike("name", `%${clean}%`);
      if (matchedB) matchingBrandIds = matchedB.map((b) => b.id);

      const { data: matchedM } = await supabaseAdmin
        .from("models")
        .select("id")
        .ilike("name", `%${clean}%`);
      if (matchedM) matchingModelIds = matchedM.map((m) => m.id);
    }

    const selectStrAll =
      "id,title,thumbnail_path,image_paths,original_path,small_path,medium_path,large_path,sort_order,created_at,updated_at,brand_id,model_id,description,tags,file_hash,file_size,brand:brands(id,slug,name),model:models(id,slug,name,designs(count)),overrides:image_configuration_overrides(id)";
    const selectStrNoOverrides =
      "id,title,thumbnail_path,image_paths,original_path,small_path,medium_path,large_path,sort_order,created_at,updated_at,brand_id,model_id,description,tags,file_hash,file_size,brand:brands(id,slug,name),model:models(id,slug,name,designs(count))";
    const selectStrSafeAll =
      "id,title,thumbnail_path,image_paths,sort_order,created_at,brand_id,model_id,description,tags,file_hash,file_size,brand:brands(id,slug,name),model:models(id,slug,name,designs(count)),overrides:image_configuration_overrides(id)";
    const selectStrSafeNoOverrides =
      "id,title,thumbnail_path,image_paths,sort_order,created_at,brand_id,model_id,description,tags,file_hash,file_size,brand:brands(id,slug,name),model:models(id,slug,name,designs(count))";

    const executeQuery = async (columnsStr: string) => {
      let q = supabaseAdmin.from("designs").select(columnsStr, { count: "exact" });

      if (data.brandId) {
        q = q.eq("brand_id", data.brandId);
      }
      if (data.modelId) {
        q = q.eq("model_id", data.modelId);
      }

      if (data.search && data.search.trim()) {
        const clean = data.search.trim();
        const orConditions: string[] = [`title.ilike.%${clean}%`, `description.ilike.%${clean}%`];
        if (matchingBrandIds.length > 0) {
          orConditions.push(`brand_id.in.(${matchingBrandIds.join(",")})`);
        }
        if (matchingModelIds.length > 0) {
          orConditions.push(`model_id.in.(${matchingModelIds.join(",")})`);
        }
        q = q.or(orConditions.join(","));
      }

      if (data.sortBy === "recently_uploaded") {
        q = q.order("created_at", { ascending: false });
      } else if (data.sortBy === "recently_edited") {
        q = q.order("updated_at", { ascending: false });
      } else if (data.sortBy === "sort_order") {
        q = q.order("sort_order", { ascending: true });
      }

      const { data: rows, error, count } = await q.range(data.offset, data.offset + data.limit - 1);
      return { rows, error, count };
    };

    let result = await executeQuery(selectStrAll);

    if (result.error) {
      console.warn("[adminListImages] Query 1 failed, trying without overrides:", result.error);
      result = await executeQuery(selectStrNoOverrides);

      if (result.error) {
        console.warn(
          "[adminListImages] Query 2 failed, trying safe columns + overrides:",
          result.error,
        );
        result = await executeQuery(selectStrSafeAll);

        if (result.error) {
          console.warn(
            "[adminListImages] Query 3 failed, trying safe columns (no overrides):",
            result.error,
          );
          result = await executeQuery(selectStrSafeNoOverrides);

          if (result.error) {
            throw result.error;
          }
        }
      }
    }

    const rows = (result.rows ?? []).map((r: any) => ({
      ...r,
      original_path: r.original_path ?? null,
      small_path: r.small_path ?? null,
      medium_path: r.medium_path ?? null,
      large_path: r.large_path ?? null,
      overrides: r.overrides ?? [],
    }));

    return { rows, count: result.count ?? 0 };
  });

// ============================================================
// Brand & Model CRUD (unchanged from original)
// ============================================================

export const adminUpsertBrand = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
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
  .validator((d: unknown) =>
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

export const adminResetCatalog = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        pin: z.string().min(4).max(12),
        confirmText: z.string(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Fetch hashed PIN from admin_settings (only service role client has access)
    const { data: settings, error: settingsErr } = await (supabaseAdmin as any)
      .from("admin_settings")
      .select("admin_pin_hash")
      .eq("id", "00000000-0000-0000-0000-000000000001")
      .maybeSingle();

    if (settingsErr || !settings) {
      throw new Error("Failed to retrieve admin verification details");
    }

    // Verify PIN using bcrypt
    const match = await bcrypt.compare(data.pin, settings.admin_pin_hash);
    if (!match || data.confirmText !== "RESET CATALOG") {
      throw new Error("Invalid verification data");
    }

    // Order of deletes:
    // 1. Assignments
    // 2. Category Items
    // 3. Designs (images metadata)
    // 4. Models
    // 5. Brands
    // 6. Categories
    const tables = [
      "category_item_model_assignments",
      "category_items",
      "designs",
      "models",
      "brands",
      "categories",
    ];

    for (const table of tables) {
      const { error } = await supabaseAdmin
        .from(table as any)
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) {
        throw new Error(`Failed to clear table ${table}: ${error.message}`);
      }
    }

    // Clean up storage bucket catalog designs/ prefix
    try {
      const { data: files, error: listError } = await supabaseAdmin.storage
        .from("catalog")
        .list("designs", { limit: 1000 });

      if (listError) throw listError;

      if (files && files.length > 0) {
        const filePaths = files.map((f) => `designs/${f.name}`);
        const { error: removeError } = await supabaseAdmin.storage
          .from("catalog")
          .remove(filePaths);
        if (removeError) throw removeError;
      }
    } catch (storageErr) {
      console.error("Storage reset cleanup error (ignored):", storageErr);
    }

    // Log event with Date, Time and Admin User info
    const now = new Date();
    console.log(
      `[CATALOG_RESET] Catalog cleared at ${now.toISOString()} by authenticated Admin user.`,
    );

    return { success: true };
  });

export const adminSaveImageOverrides = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        designId: z.string().uuid(),
        overrides: z.array(
          z.object({
            item_id: z.string().nullable().optional(),
            category_id: z.string().uuid().nullable().optional(),
            is_removed: z.boolean().optional(),
            is_added: z.boolean().optional(),
            price_override: z.number().nullable().optional(),
            name_override: z.string().nullable().optional(),
            description_override: z.string().nullable().optional(),
            is_recommended: z.boolean().nullable().optional(),
            is_active: z.boolean().nullable().optional(),
            sort_order: z.number().nullable().optional(),
            category_hidden: z.boolean().optional(),
            new_item_fields: z
              .object({
                name: z.string(),
                price: z.number(),
                description: z.string().nullable().optional(),
                category_id: z.string().uuid(),
              })
              .optional(),
          }),
        ),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const resolvedOverrides = [];

    for (const o of data.overrides) {
      let resolvedItemId = o.item_id || null;

      // If it's a new inline-created item
      if (resolvedItemId && resolvedItemId.startsWith("temp_") && o.new_item_fields) {
        const { data: newItem, error: err } = await (supabaseAdmin as any)
          .from("category_items")
          .insert({
            name: o.new_item_fields.name,
            price: o.new_item_fields.price,
            description: o.new_item_fields.description || null,
            category_id: o.new_item_fields.category_id,
            is_active: true,
            is_recommended: false,
          })
          .select("id")
          .single();

        if (err) throw err;
        resolvedItemId = newItem.id;
      }

      resolvedOverrides.push({
        ...o,
        item_id: resolvedItemId,
      });
    }

    // Delete existing overrides for this design
    const { error: delErr } = await (supabaseAdmin as any)
      .from("image_configuration_overrides")
      .delete()
      .eq("design_id", data.designId);
    if (delErr) throw delErr;

    // Insert new overrides if any
    if (resolvedOverrides.length > 0) {
      const rows = resolvedOverrides.map((o) => ({
        design_id: data.designId,
        item_id: o.item_id,
        category_id: o.category_id,
        is_removed: o.is_removed ?? false,
        is_added: o.is_added ?? false,
        price_override: o.price_override !== undefined ? o.price_override : null,
        name_override: o.name_override !== undefined ? o.name_override : null,
        description_override: o.description_override !== undefined ? o.description_override : null,
        is_recommended: o.is_recommended !== undefined ? o.is_recommended : null,
        is_active: o.is_active !== undefined ? o.is_active : null,
        sort_order: o.sort_order !== undefined ? o.sort_order : null,
        category_hidden: o.category_hidden ?? false,
      }));

      const { error: insErr } = await (supabaseAdmin as any)
        .from("image_configuration_overrides")
        .insert(rows);
      if (insErr) throw insErr;
    }

    return { success: true };
  });

export const adminListAllCatalogItems = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin } = await import("./admin-session.server");
  await requireAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Fetch all categories and their items
  const { data: rows, error } = await (supabaseAdmin as any)
    .from("categories")
    .select(
      `
      id,
      name,
      slug,
      icon,
      sort_order,
      is_active,
      items:category_items(
        id,
        category_id,
        name,
        price,
        description,
        is_active,
        is_recommended,
        sort_order,
        created_at
      )
    `,
    )
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return rows ?? [];
});

export const adminOptimizeImage = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        designId: z.string().uuid(),
        originalPath: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const sizes = [
      { name: "thumbnail", width: 400, quality: 80 },
      { name: "small", width: 640, quality: 80 },
      { name: "medium", width: 1024, quality: 85 },
      { name: "large", width: 1600, quality: 85 },
    ];

    const paths: Record<string, string> = {
      original: data.originalPath,
      thumbnail: data.originalPath,
      small: data.originalPath,
      medium: data.originalPath,
      large: data.originalPath,
    };

    for (const size of sizes) {
      try {
        const { data: signed, error: signErr } = await supabaseAdmin.storage
          .from("catalog")
          .createSignedUrl(data.originalPath, 600, {
            transform: {
              width: size.width,
              quality: size.quality,
              format: "webp" as any,
            },
          });

        if (signErr || !signed?.signedUrl) {
          console.warn(
            `[IMAGE_OPTIMIZATION] Signed URL transform failed for size ${size.name}:`,
            signErr,
          );
          continue;
        }

        const imgRes = await fetch(signed.signedUrl);
        if (!imgRes.ok) {
          console.warn(
            `[IMAGE_OPTIMIZATION] Fetch transformed image failed for size ${size.name}: status ${imgRes.status}`,
          );
          continue;
        }

        const buffer = await imgRes.arrayBuffer();
        const bytes = new Uint8Array(buffer);

        const targetPath = `designs/${size.name}/${data.designId}-${size.name}.webp`;
        const { error: uploadErr } = await supabaseAdmin.storage
          .from("catalog")
          .upload(targetPath, bytes, {
            contentType: "image/webp",
            upsert: true,
          });

        if (uploadErr) {
          console.warn(
            `[IMAGE_OPTIMIZATION] Upload optimized size ${size.name} failed:`,
            uploadErr,
          );
          continue;
        }

        paths[size.name] = targetPath;
      } catch (err) {
        console.error(`[IMAGE_OPTIMIZATION] Error processing size ${size.name}:`, err);
      }
    }

    const { error: updateErr } = await supabaseAdmin
      .from("designs")
      .update({
        original_path: paths.original,
        thumbnail_path: paths.thumbnail,
        small_path: paths.small,
        medium_path: paths.medium,
        large_path: paths.large,
        image_paths: [paths.original, paths.small, paths.medium, paths.large],
      })
      .eq("id", data.designId);

    if (updateErr) throw updateErr;

    return { success: true, paths };
  });

export const adminReorderBrands = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.array(z.string().uuid()).parse(d))
  .handler(async ({ data: orderedIds }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const promises = orderedIds.map((id, index) =>
      supabaseAdmin
        .from("brands")
        .update({ sort_order: index + 1 })
        .eq("id", id),
    );
    await Promise.all(promises);
    return { success: true };
  });
