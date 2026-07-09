import { createFileRoute, Link } from "@tanstack/react-router";
import { Heart, Search } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { useFavorites } from "@/hooks/use-favorites";
import { useQuery } from "@tanstack/react-query";
import { getModelsByIds, type ModelSearchResult } from "@/lib/catalog.functions";
import { SignedImage } from "@/components/SignedImage";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/favorites")({
  head: () => ({
    meta: [
      { title: "Your favorites — Bikers Choice Kakinada" },
      { name: "description", content: "Bike models you've saved from the Bikers Choice Kakinada catalog." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FavoritesPage,
});

function FavoritesPage() {
  const { list, toggle } = useFavorites();

  // Query actual model details for all favorited IDs
  const { data: models, isLoading } = useQuery({
    queryKey: ["favorite-models", list],
    queryFn: () => getModelsByIds({ data: { ids: list } }),
    enabled: list.length > 0,
  });

  return (
    <AppShell>
      <header className="mb-6">
        <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">Saved</div>
        <h1 className="mt-1 font-display text-3xl font-bold uppercase tracking-wider md:text-4xl">Your favorites</h1>
      </header>

      {list.length === 0 ? (
        <EmptyState
          title="No favorites yet"
          description="Tap the heart on any bike card or configurator page to save it here for quick access — no login required."
          icon={<Heart className="h-6 w-6" />}
          action={
            <Link to="/" className="rounded-full bg-neon px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-neon-foreground shadow-neon">
              Explore catalog
            </Link>
          }
        />
      ) : isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-5">
          {Array.from({ length: Math.max(list.length, 2) }).map((_, i) => (
            <div key={i} className="flex flex-col overflow-hidden rounded-2xl surface-panel h-48 animate-pulse">
              <div className="aspect-[4/3] bg-surface-elevated" />
            </div>
          ))}
        </div>
      ) : !models || models.length === 0 ? (
        <EmptyState
          title="No favorites yet"
          description="Tap the heart on any bike card or configurator page to save it here for quick access — no login required."
          icon={<Heart className="h-6 w-6" />}
          action={
            <Link to="/" className="rounded-full bg-neon px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-neon-foreground shadow-neon">
              Explore catalog
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-5">
          {models.map((model) => (
            <div key={model.id} className="group relative flex flex-col overflow-hidden rounded-2xl surface-panel transition-all duration-300 hover:-translate-y-0.5 hover:neon-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon">
              <Link
                to="/model/$modelId"
                params={{ modelId: model.id }}
                className="flex flex-col flex-1"
              >
                {model.thumbnail_path ? (
                  <SignedImage path={model.thumbnail_path} alt={(model as any).name} aspect="4/3" className="rounded-b-none" />
                ) : (
                  <div className="aspect-[4/3] flex items-center justify-center bg-gradient-to-br from-surface-elevated via-surface to-background">
                    <Search className="h-8 w-8 text-muted-foreground/30" />
                  </div>
                )}
                <div className="p-3">
                  <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{(model as any).brand?.name ?? ""}</div>
                  <div className="mt-0.5 font-display text-sm font-semibold">{(model as any).name}</div>
                  <div className="mt-1 text-[10px] text-neon uppercase tracking-widest">Configure →</div>
                </div>
              </Link>

              {/* Remove Favorite Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggle(model.id);
                }}
                className="absolute top-2.5 right-2.5 grid h-8 w-8 place-items-center rounded-full border border-border bg-black/60 text-red-500 hover:text-red-600 transition-all cursor-pointer z-10 animate-pulse"
                title="Remove from favorites"
              >
                <Heart className="h-3.5 w-3.5 fill-red-500 text-red-500" />
              </button>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
