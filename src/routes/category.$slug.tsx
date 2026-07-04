import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { DesignCard, DesignCardSkeleton } from "@/components/DesignCard";
import { EmptyState } from "@/components/EmptyState";
import { listCategories, listDesigns } from "@/lib/catalog.functions";
import { Suspense } from "react";

export const Route = createFileRoute("/category/$slug")({
  loader: async ({ params, context }) => {
    const cats = await context.queryClient.ensureQueryData(
      queryOptions({ queryKey: ["categories"], queryFn: () => listCategories(), staleTime: 1000 * 60 * 30 }),
    );
    const cat = cats.find((c) => c.slug === params.slug);
    if (!cat) throw notFound();
    return { cat };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.cat.name} — Bikers Choice Kakinada` },
          {
            name: "description",
            content: `${loaderData.cat.name} designs at Bikers Choice Kakinada — premium bike customization.`,
          },
        ]
      : [{ title: "Category — Bikers Choice Kakinada" }, { name: "robots", content: "noindex" }],
  }),
  component: CategoryPage,
});

function CategoryPage() {
  const { cat } = Route.useLoaderData();
  return (
    <AppShell>
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            Category
          </div>
          <h1 className="mt-1 font-display text-3xl font-bold uppercase tracking-wider md:text-4xl">
            {cat.name}
          </h1>
        </div>
        <Link
          to="/search"
          search={{ category: cat.slug }}
          className="rounded-full border border-neon/40 bg-neon/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-neon"
        >
          Refine
        </Link>
      </header>
      <Suspense
        fallback={
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <DesignCardSkeleton key={i} />
            ))}
          </div>
        }
      >
        <CategoryGrid slug={cat.slug} />
      </Suspense>
    </AppShell>
  );
}

function CategoryGrid({ slug }: { slug: string }) {
  const { data } = useSuspenseQuery(
    queryOptions({
      queryKey: ["designs", "category", slug],
      queryFn: () => listDesigns({ data: { categorySlug: slug, limit: 48 } }),
      staleTime: 1000 * 60 * 5,
    }),
  );
  if (data.rows.length === 0) {
    return (
      <EmptyState
        title="Nothing here yet"
        description="This category will be updated soon with new designs. Try browsing all or ask us in the shop."
      />
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
      {data.rows.map((d, i) => (
        <DesignCard key={d.id} design={d} priority={i < 2} />
      ))}
    </div>
  );
}
