import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { listBrands } from "@/lib/catalog.functions";

export const Route = createFileRoute("/brands")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(
      queryOptions({ queryKey: ["brands"], queryFn: () => listBrands(), staleTime: 1000 * 60 * 30 }),
    ),
  head: () => ({
    meta: [
      { title: "Bike brands — Bikers Choice Kakinada" },
      { name: "description", content: "Browse designs by bike brand — KTM, Royal Enfield, Yamaha, Bajaj and more." },
    ],
  }),
  component: BrandsPage,
});

function BrandsPage() {
  const { data } = useSuspenseQuery(
    queryOptions({ queryKey: ["brands"], queryFn: () => listBrands(), staleTime: 1000 * 60 * 30 }),
  );
  return (
    <AppShell>
      <header className="mb-6">
        <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">Explore</div>
        <h1 className="mt-1 font-display text-3xl font-bold uppercase tracking-wider md:text-4xl">Bike brands</h1>
      </header>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-5">
        {data.map((b) => (
          <Link
            key={b.id}
            to="/search"
            search={{ brand: b.slug }}
            className="flex h-28 items-center justify-center rounded-2xl surface-panel px-4 text-center font-display text-base font-semibold uppercase tracking-widest transition hover:-translate-y-0.5 hover:neon-ring"
          >
            {b.name}
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
