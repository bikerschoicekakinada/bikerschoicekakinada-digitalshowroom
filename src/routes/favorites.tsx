import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { DesignCard, DesignCardSkeleton } from "@/components/DesignCard";
import { EmptyState } from "@/components/EmptyState";
import { useFavorites } from "@/hooks/use-favorites";
import { getDesign, type DesignRow } from "@/lib/catalog.functions";

export const Route = createFileRoute("/favorites")({
  head: () => ({
    meta: [
      { title: "Your favorites — Bikers Choice Kakinada" },
      { name: "description", content: "Designs you've saved from the Bikers Choice Kakinada catalog." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FavoritesPage,
});

function FavoritesPage() {
  const { list } = useFavorites();

  const query = useQuery({
    queryKey: ["favorites", list],
    queryFn: async () => {
      const results = await Promise.all(list.map((id) => getDesign({ data: { id } }).catch(() => null)));
      return results.filter(Boolean) as DesignRow[];
    },
    enabled: list.length > 0,
    staleTime: 1000 * 60,
  });

  return (
    <AppShell>
      <header className="mb-6">
        <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
          Saved
        </div>
        <h1 className="mt-1 font-display text-3xl font-bold uppercase tracking-wider md:text-4xl">
          Your favorites
        </h1>
      </header>

      {list.length === 0 ? (
        <EmptyState
          title="No favorites yet"
          description="Tap the heart on any design to save it here for later — no login required."
          icon={<Heart className="h-6 w-6" />}
          action={
            <Link
              to="/"
              className="rounded-full bg-neon px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-neon-foreground shadow-neon"
            >
              Explore catalog
            </Link>
          }
        />
      ) : query.isLoading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
          {Array.from({ length: Math.min(list.length, 6) }).map((_, i) => (
            <DesignCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
          {(query.data ?? []).map((d) => (
            <DesignCard key={d.id} design={d} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
