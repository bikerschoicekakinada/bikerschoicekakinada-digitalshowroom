import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { SlidersHorizontal, X } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { SearchBar } from "@/components/SearchBar";
import { DesignCard, DesignCardSkeleton } from "@/components/DesignCard";
import { EmptyState } from "@/components/EmptyState";
import {
  listBrands,
  listCategories,
  listDesigns,
} from "@/lib/catalog.functions";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  category: fallback(z.string(), "").default(""),
  brand: fallback(z.string(), "").default(""),
  sort: fallback(z.enum(["newest", "trending", "priceAsc", "priceDesc"]), "newest").default("newest"),
});

const catsQ = queryOptions({ queryKey: ["categories"], queryFn: () => listCategories(), staleTime: 1000 * 60 * 30 });
const brandsQ = queryOptions({ queryKey: ["brands"], queryFn: () => listBrands(), staleTime: 1000 * 60 * 30 });

export const Route = createFileRoute("/search")({
  validateSearch: zodValidator(searchSchema),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(catsQ);
    context.queryClient.ensureQueryData(brandsQ);
  },
  component: SearchPage,
});

function SearchPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [text, setText] = useState(search.q);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => setText(search.q), [search.q]);

  const onType = (v: string) => {
    setText(v);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      navigate({ search: (prev) => ({ ...prev, q: v }) });
    }, 250);
  };

  return (
    <AppShell>
      <div className="flex items-center gap-3">
        <SearchBar
          size="lg"
          autoFocus
          placeholder="Search designs, models, themes…"
          value={text}
          onChange={(e) => onType(e.currentTarget.value)}
          className="flex-1"
        />
        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-border bg-surface hover:neon-ring"
          aria-label="Filters"
        >
          <SlidersHorizontal className="h-5 w-5" />
        </button>
      </div>

      <ActiveFilterChips />

      <Results />

      {filtersOpen ? <FilterDrawer onClose={() => setFiltersOpen(false)} /> : null}
    </AppShell>
  );
}

function ActiveFilterChips() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: cats } = useSuspenseQuery(catsQ);
  const { data: brands } = useSuspenseQuery(brandsQ);
  const cat = cats.find((c) => c.slug === search.category);
  const brand = brands.find((b) => b.slug === search.brand);
  const active = [
    cat ? { key: "category", label: cat.name } : null,
    brand ? { key: "brand", label: brand.name } : null,
    search.sort !== "newest" ? { key: "sort", label: sortLabel(search.sort) } : null,
  ].filter(Boolean) as { key: "category" | "brand" | "sort"; label: string }[];

  if (active.length === 0) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {active.map((a) => (
        <button
          key={a.key}
          type="button"
          onClick={() =>
            navigate({
              search: (prev) => ({
                ...prev,
                [a.key]: a.key === "sort" ? "newest" : "",
              }),
            })
          }
          className="inline-flex items-center gap-1.5 rounded-full border border-neon/40 bg-neon/10 px-3 py-1 text-xs font-semibold text-neon"
        >
          {a.label}
          <X className="h-3 w-3" />
        </button>
      ))}
    </div>
  );
}

function sortLabel(s: string) {
  return s === "trending"
    ? "Trending"
    : s === "priceAsc"
      ? "Price ↑"
      : s === "priceDesc"
        ? "Price ↓"
        : "Newest";
}

function Results() {
  const search = Route.useSearch();
  const pageSize = 24;
  const [pages, setPages] = useState(1);
  useEffect(() => setPages(1), [search.q, search.category, search.brand, search.sort]);

  const results = useQuery({
    queryKey: ["search", search, pages],
    queryFn: () =>
      listDesigns({
        data: {
          q: search.q || undefined,
          categorySlug: search.category || undefined,
          brandSlug: search.brand || undefined,
          sort: search.sort,
          limit: pageSize * pages,
          offset: 0,
        },
      }),
    staleTime: 1000 * 60,
    placeholderData: (prev) => prev,
  });

  if (results.isLoading) {
    return (
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
        {Array.from({ length: 8 }).map((_, i) => (
          <DesignCardSkeleton key={i} />
        ))}
      </div>
    );
  }
  const rows = results.data?.rows ?? [];
  const total = results.data?.count ?? 0;
  if (rows.length === 0) {
    return (
      <div className="mt-10">
        <EmptyState
          title="No matches"
          description="Try clearing filters or searching a different keyword."
        />
      </div>
    );
  }
  return (
    <>
      <div className="mt-6 flex items-center justify-between text-xs uppercase tracking-widest text-muted-foreground">
        <span>{total.toLocaleString("en-IN")} designs</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
        {rows.map((d) => (
          <DesignCard key={d.id} design={d} />
        ))}
      </div>
      {rows.length < total ? (
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={() => setPages((p) => p + 1)}
            className="rounded-full border border-neon/50 bg-neon/10 px-6 py-3 text-xs font-bold uppercase tracking-widest text-neon hover:neon-ring"
          >
            Load more
          </button>
        </div>
      ) : null}
    </>
  );
}

function FilterDrawer({ onClose }: { onClose: () => void }) {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: cats } = useSuspenseQuery(catsQ);
  const { data: brands } = useSuspenseQuery(brandsQ);

  const set = (patch: Partial<z.infer<typeof searchSchema>>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }) });

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-background/70 backdrop-blur md:items-center md:justify-center">
      <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl border border-border bg-surface p-6 md:max-w-lg md:rounded-3xl">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold uppercase tracking-widest">Filters</h2>
          <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full border border-border">
            <X className="h-4 w-4" />
          </button>
        </div>
        <FilterGroup title="Sort by">
          <ChipRow
            options={[
              { v: "newest", label: "Newest" },
              { v: "trending", label: "Trending" },
              { v: "priceAsc", label: "Price ↑" },
              { v: "priceDesc", label: "Price ↓" },
            ]}
            value={search.sort}
            onChange={(v) => set({ sort: v as never })}
          />
        </FilterGroup>
        <FilterGroup title="Category">
          <ChipRow
            options={[{ v: "", label: "All" }, ...cats.map((c) => ({ v: c.slug, label: c.name }))]}
            value={search.category}
            onChange={(v) => set({ category: v })}
          />
        </FilterGroup>
        <FilterGroup title="Brand">
          <ChipRow
            options={[{ v: "", label: "All" }, ...brands.map((b) => ({ v: b.slug, label: b.name }))]}
            value={search.brand}
            onChange={(v) => set({ brand: v })}
          />
        </FilterGroup>
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => navigate({ search: { q: search.q, category: "", brand: "", sort: "newest" } })}
            className="flex-1 rounded-full border border-border px-4 py-3 text-xs font-bold uppercase tracking-widest"
          >
            Reset
          </button>
          <button
            onClick={onClose}
            className="flex-1 rounded-full bg-neon px-4 py-3 text-xs font-bold uppercase tracking-widest text-neon-foreground shadow-neon"
          >
            Show results
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
        {title}
      </div>
      {children}
    </div>
  );
}

function ChipRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { v: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={cn(
            "rounded-full border px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider transition",
            value === o.v
              ? "border-neon bg-neon/15 text-neon"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
