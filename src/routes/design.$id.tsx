import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Heart, Share2, ArrowLeft, Clock, Wrench, Palette } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { SignedImage } from "@/components/SignedImage";
import { DesignCard } from "@/components/DesignCard";
import { ImageViewer } from "@/components/ImageViewer";
import { useFavorites } from "@/hooks/use-favorites";
import { getDesign, listDesigns } from "@/lib/catalog.functions";
import { cn } from "@/lib/utils";

const detailQuery = (id: string) =>
  queryOptions({
    queryKey: ["design", id],
    queryFn: () => getDesign({ data: { id } }),
    staleTime: 1000 * 60 * 5,
  });

export const Route = createFileRoute("/design/$id")({
  loader: async ({ params, context }) => {
    const row = await context.queryClient.ensureQueryData(detailQuery(params.id));
    if (!row) throw notFound();
    return { design: row };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.design.title} — Bikers Choice Kakinada` },
          {
            name: "description",
            content:
              loaderData.design.description?.slice(0, 155) ||
              `Custom design by Bikers Choice Kakinada.`,
          },
        ]
      : [{ title: "Design" }, { name: "robots", content: "noindex" }],
  }),
  component: DesignPage,
});

function DesignPage() {
  const { design } = Route.useLoaderData();
  const { has, toggle } = useFavorites();
  const [viewerAt, setViewerAt] = useState<number | null>(null);
  const fav = has(design.id);

  const gallery = [design.thumbnail_path, ...(design.image_paths ?? [])].filter(
    (v, i, a) => v && a.indexOf(v) === i,
  );
  const price = formatPrice(design.price_min, design.price_max);

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: design.title, url });
      } catch {
        /* cancelled */
      }
    } else {
      await navigator.clipboard.writeText(url);
    }
  };

  return (
    <AppShell>
      <div className="mb-4 flex items-center justify-between">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-widest"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Link>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={share}
            aria-label="Share"
            className="grid h-10 w-10 place-items-center rounded-full border border-border bg-surface hover:neon-ring"
          >
            <Share2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => toggle(design.id)}
            aria-label="Favorite"
            className={cn(
              "grid h-10 w-10 place-items-center rounded-full border border-border bg-surface transition",
              fav ? "text-crimson crimson-glow" : "hover:neon-ring",
            )}
          >
            <Heart className="h-4 w-4" fill={fav ? "currentColor" : "none"} />
          </button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[1.2fr_1fr] md:gap-10">
        <div>
          <button
            type="button"
            onClick={() => setViewerAt(0)}
            className="block w-full overflow-hidden rounded-3xl border border-border neon-ring"
          >
            <SignedImage
              path={gallery[0]}
              alt={design.title}
              aspect="4/5"
              priority
              className="rounded-3xl"
            />
          </button>
          {gallery.length > 1 ? (
            <div className="mt-3 grid grid-cols-4 gap-2">
              {gallery.slice(0, 8).map((p, i) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setViewerAt(i)}
                  className="overflow-hidden rounded-xl border border-border transition hover:neon-ring"
                >
                  <SignedImage path={p} alt="" aspect="1/1" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div>
          <div className="flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {design.category?.name ? (
              <Link
                to="/category/$slug"
                params={{ slug: design.category.slug }}
                className="rounded-full border border-border bg-surface px-2.5 py-1 hover:text-neon"
              >
                {design.category.name}
              </Link>
            ) : null}
            {design.brand?.name ? (
              <Link
                to="/search"
                search={{ brand: design.brand.slug }}
                className="rounded-full border border-border bg-surface px-2.5 py-1 hover:text-neon"
              >
                {design.brand.name}
              </Link>
            ) : null}
            {design.model?.name ? (
              <span className="rounded-full border border-border bg-surface px-2.5 py-1">
                {design.model.name}
              </span>
            ) : null}
          </div>
          <h1 className="mt-4 font-display text-3xl font-bold leading-tight md:text-4xl">
            {design.title}
          </h1>
          {price ? (
            <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-neon/40 bg-neon/10 px-4 py-2 font-display text-lg font-semibold text-neon">
              {price}
            </div>
          ) : null}
          {design.description ? (
            <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {design.description}
            </p>
          ) : null}

          <dl className="mt-6 grid grid-cols-2 gap-3">
            {design.estimated_days ? (
              <InfoTile
                icon={<Clock className="h-4 w-4" />}
                label="Estimated time"
                value={`${design.estimated_days} day${design.estimated_days > 1 ? "s" : ""}`}
              />
            ) : null}
            {design.theme ? (
              <InfoTile icon={<Palette className="h-4 w-4" />} label="Theme" value={design.theme} />
            ) : null}
            {design.color ? (
              <InfoTile icon={<Palette className="h-4 w-4" />} label="Color" value={design.color} />
            ) : null}
          </dl>

          {design.required_parts?.length ? (
            <div className="mt-6">
              <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                <Wrench className="h-3 w-3" /> Required parts
              </div>
              <ul className="flex flex-wrap gap-2">
                {design.required_parts.map((p) => (
                  <li key={p} className="rounded-full border border-border bg-surface px-3 py-1 text-xs">
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href={`https://wa.me/918523876978?text=${encodeURIComponent(
                `Hi! I like this design at Bikers Choice: ${design.title} — ${typeof window !== "undefined" ? window.location.href : ""}`,
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex flex-1 items-center justify-center rounded-full bg-neon px-5 py-3 text-xs font-bold uppercase tracking-widest text-neon-foreground shadow-neon"
            >
              Enquire on WhatsApp
            </a>
            <a
              href="tel:+918523876978"
              className="inline-flex flex-1 items-center justify-center rounded-full border border-border bg-surface px-5 py-3 text-xs font-bold uppercase tracking-widest hover:neon-ring"
            >
              Call the shop
            </a>
          </div>
        </div>
      </div>

      <Related design={design} />

      {viewerAt !== null ? (
        <ImageViewer paths={gallery} initialIndex={viewerAt} onClose={() => setViewerAt(null)} />
      ) : null}
    </AppShell>
  );
}

function InfoTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-3">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        <span className="text-neon">{icon}</span> {label}
      </div>
      <div className="mt-1 font-display text-base font-semibold">{value}</div>
    </div>
  );
}

function Related({ design }: { design: ReturnType<typeof Route.useLoaderData>["design"] }) {
  const { data } = useSuspenseQuery(
    queryOptions({
      queryKey: ["related", design.id],
      queryFn: () =>
        listDesigns({
          data: {
            categorySlug: design.category?.slug,
            limit: 8,
          },
        }),
      staleTime: 1000 * 60 * 5,
    }),
  );
  const rows = data.rows.filter((r) => r.id !== design.id).slice(0, 4);
  if (rows.length === 0) return null;
  return (
    <section className="mt-14">
      <h2 className="font-display text-lg font-semibold uppercase tracking-[0.14em]">Related designs</h2>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
        {rows.map((d) => (
          <DesignCard key={d.id} design={d} />
        ))}
      </div>
    </section>
  );
}

function formatPrice(min: number | null, max: number | null) {
  if (min == null && max == null) return null;
  const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;
  if (min != null && max != null && min !== max) return `${fmt(min)} – ${fmt(max)}`;
  return fmt((min ?? max)!);
}
