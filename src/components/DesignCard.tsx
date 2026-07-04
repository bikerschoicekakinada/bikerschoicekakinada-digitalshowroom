import { Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { SignedImage } from "./SignedImage";
import { useFavorites } from "@/hooks/use-favorites";
import type { DesignRow } from "@/lib/catalog.functions";
import { cn } from "@/lib/utils";

function formatPrice(min: number | null, max: number | null) {
  if (min == null && max == null) return null;
  const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;
  if (min != null && max != null && min !== max) return `${fmt(min)} – ${fmt(max)}`;
  return fmt((min ?? max)!);
}

export function DesignCard({ design, priority = false }: { design: DesignRow; priority?: boolean }) {
  const { has, toggle } = useFavorites();
  const price = formatPrice(design.price_min, design.price_max);
  const fav = has(design.id);

  return (
    <Link
      to="/design/$id"
      params={{ id: design.id }}
      className="group relative flex flex-col overflow-hidden rounded-2xl surface-panel transition-all duration-300 hover:-translate-y-0.5 hover:neon-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon"
    >
      <SignedImage
        path={design.thumbnail_path}
        alt={design.title}
        aspect="4/5"
        priority={priority}
        className="rounded-b-none"
      />
      <button
        type="button"
        aria-label={fav ? "Remove from favorites" : "Add to favorites"}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toggle(design.id);
        }}
        className={cn(
          "absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full backdrop-blur",
          "bg-background/60 border border-border transition",
          fav ? "text-crimson crimson-glow" : "text-foreground/70 hover:text-foreground",
        )}
      >
        <Heart className="h-5 w-5" fill={fav ? "currentColor" : "none"} strokeWidth={2} />
      </button>

      {design.is_trending ? (
        <span className="absolute left-3 top-3 rounded-full bg-neon/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-neon">
          Trending
        </span>
      ) : null}

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {design.category?.name ? <span>{design.category.name}</span> : null}
          {design.brand?.name ? (
            <>
              <span className="opacity-40">·</span>
              <span>{design.brand.name}</span>
            </>
          ) : null}
        </div>
        <h3 className="line-clamp-2 font-display text-base font-semibold leading-tight">
          {design.title}
        </h3>
        <div className="mt-auto flex items-end justify-between pt-2">
          <div>
            {price ? (
              <div className="font-display text-sm text-neon">{price}</div>
            ) : (
              <div className="text-xs text-muted-foreground">Enquire in shop</div>
            )}
            {design.model?.name ? (
              <div className="text-xs text-muted-foreground">{design.model.name}</div>
            ) : null}
          </div>
          {design.estimated_days ? (
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
              {design.estimated_days}d
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

export function DesignCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl surface-panel">
      <div className="aspect-[4/5] animate-pulse bg-gradient-to-br from-surface-elevated via-surface to-background" />
      <div className="space-y-2 p-4">
        <div className="h-3 w-1/2 animate-pulse rounded bg-surface-elevated" />
        <div className="h-4 w-4/5 animate-pulse rounded bg-surface-elevated" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-surface-elevated" />
      </div>
    </div>
  );
}
