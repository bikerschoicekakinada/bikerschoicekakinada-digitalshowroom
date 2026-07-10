import { createFileRoute, Link } from "@tanstack/react-router";
import { Heart, Search, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { useFavorites } from "@/hooks/use-favorites";
import { SignedImage } from "@/components/SignedImage";

export const Route = createFileRoute("/favorites")({
  head: () => ({
    meta: [
      { title: "Your Saved Configurations — Bikers Choice Kakinada" },
      {
        name: "description",
        content:
          "Explore hundreds of bike customization ideas, compare designs, estimate costs, and plan your bike customization with Bikers Choice Kakinada.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FavoritesPage,
});

function FavoritesPage() {
  const { list, remove } = useFavorites();

  return (
    <AppShell>
      <header className="mb-6">
        <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
          Saved Builds
        </div>
        <h1 className="mt-1 font-display text-3xl font-bold uppercase tracking-wider md:text-4xl">
          Your Configurations
        </h1>
      </header>

      {list.length === 0 ? (
        <EmptyState
          title="No configurations saved yet"
          description="Explore hundreds of bike customization ideas, compare designs, estimate pricing, and plan your perfect bike customization."
          icon={<Heart className="h-6 w-6" />}
          action={
            <Link
              to="/"
              className="rounded-full bg-neon px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-neon-foreground shadow-neon"
            >
              Explore designs
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-5">
          {list.map((config) => (
            <div
              key={config.id}
              className="group relative flex flex-col overflow-hidden rounded-2xl surface-panel transition-all duration-300 hover:-translate-y-0.5 hover:neon-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon"
            >
              <Link
                to="/model/$modelId"
                params={{ modelId: config.modelId }}
                search={{
                  items:
                    config.selectedItemIds.length > 0
                      ? config.selectedItemIds.join(",")
                      : undefined,
                  img: String(config.activeIdx),
                }}
                className="flex flex-col flex-1"
              >
                {config.thumbnailPath ? (
                  <SignedImage
                    path={config.thumbnailPath}
                    alt={config.modelName}
                    aspect="4/3"
                    className="rounded-b-none"
                  />
                ) : (
                  <div className="aspect-[4/3] flex items-center justify-center bg-gradient-to-br from-surface-elevated via-surface to-background">
                    <Search className="h-8 w-8 text-muted-foreground/30" />
                  </div>
                )}
                <div className="p-3 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      {config.brandName}
                    </div>
                    <div className="mt-0.5 font-display text-sm font-semibold truncate">
                      {config.modelName}
                    </div>
                    <div className="mt-1 text-[9px] font-mono text-neon/90 uppercase tracking-widest">
                      Design #{config.activeIdx + 1}
                    </div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-border/40 flex items-center justify-between gap-1 text-[10px] uppercase tracking-wider">
                    <span className="text-muted-foreground font-mono text-[9px] font-semibold">
                      ₹{config.total.toLocaleString("en-IN")}
                    </span>
                    <span className="text-neon font-bold flex items-center gap-0.5">Resume →</span>
                  </div>
                </div>
              </Link>

              {/* Remove Favorite Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  remove(config.id);
                }}
                className="absolute top-2.5 right-2.5 grid h-8 w-8 place-items-center rounded-full border border-border bg-black/60 text-red-500 hover:text-red-600 transition-all cursor-pointer z-10 hover:scale-105 active:scale-95"
                title="Remove configuration"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
