import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { ArrowRight, Search, Sparkles } from "lucide-react";
import { Suspense, useState, useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { SearchBar } from "@/components/SearchBar";
import { SignedImage } from "@/components/SignedImage";
import heroBike from "@/assets/hero-bike.jpg";
import logoImg from "@/assets/logo.jpeg";
import {
  listBrands,
  listRecentModelThumbnails,
  getModelsByIds,
  type ModelSearchResult,
} from "@/lib/catalog.functions";
import {
  getRecentlyViewed,
  getSelectedBike,
  clearRecentlyViewed,
  clearAllCustomizations,
} from "@/lib/persistence";
import { cn } from "@/lib/utils";

const brandsQuery = queryOptions({
  queryKey: ["brands"],
  queryFn: () => listBrands(),
  staleTime: 1000 * 60 * 30,
});

const recentModelsQuery = queryOptions({
  queryKey: ["recent-models"],
  queryFn: () => listRecentModelThumbnails({ data: { limit: 12 } }),
  staleTime: 1000 * 60 * 5,
});

export const Route = createFileRoute("/")({
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(brandsQuery);
    context.queryClient.ensureQueryData(recentModelsQuery);
  },
  component: HomePage,
});

function HomePage() {
  return (
    <AppShell>
      <Hero />

      {/* Session Persistence Section */}
      <RecentlyViewed />

      <Suspense fallback={<BrandStripSkeleton />}>
        <BrandStrip />
      </Suspense>
      <Suspense fallback={<RecentGridSkeleton />}>
        <RecentModels />
      </Suspense>
    </AppShell>
  );
}

// ============================================================
// Hero
// ============================================================
function Hero() {
  const [q, setQ] = useState("");
  const [selectedBikeId, setSelectedBikeId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    setSelectedBikeId(getSelectedBike());
  }, []);

  const { data: lastBike } = useQuery({
    queryKey: ["last-selected-bike", selectedBikeId],
    queryFn: async () => {
      if (!selectedBikeId) return null;
      const res = await getModelsByIds({ data: { ids: [selectedBikeId] } });
      return res?.[0] ?? null;
    },
    enabled: !!selectedBikeId,
  });

  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-border"
      style={{ background: "var(--gradient-hero)" }}
    >
      <img
        src={heroBike}
        alt=""
        width={1600}
        height={1200}
        className="absolute inset-0 h-full w-full object-cover opacity-40 mix-blend-screen"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-transparent" />
      <div className="relative flex flex-col gap-6 p-6 md:flex-row md:items-end md:justify-between md:p-12">
        <div className="max-w-xl">
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <div className="absolute -inset-1 rounded-full bg-neon/40 blur-md" aria-hidden />
              <img
                src={logoImg}
                alt="Bikers Choice Kakinada"
                width={72}
                height={72}
                className="relative h-16 w-16 rounded-full object-cover ring-2 ring-neon md:h-20 md:w-20"
              />
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-neon/40 bg-neon/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-neon">
              <Sparkles className="h-3 w-3" /> Design Explorer
            </div>
          </div>
          <h1 className="mt-5 font-display text-3xl font-bold leading-[1.05] md:text-5xl">
            Search your bike.
            <br className="hidden md:block" />
            <span className="neon-text"> Build your dream.</span>
          </h1>
          <p className="mt-3 max-w-md text-sm text-muted-foreground md:text-base">
            Explore hundreds of bike customization ideas, compare designs, estimate pricing, and
            plan your perfect bike customization.
          </p>

          {lastBike && (
            <Link
              to="/model/$modelId"
              params={{ modelId: lastBike.id }}
              className="inline-flex items-center gap-2 mt-4 rounded-full border border-neon/40 bg-neon/10 px-4 py-2 text-xs font-bold text-neon hover:bg-neon hover:text-neon-foreground transition-all duration-300 shadow-neon"
            >
              Resume configuring: {lastBike.name} &rarr;
            </Link>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              navigate({ to: "/search", search: { q } });
            }}
            className="mt-6"
          >
            <SearchBar
              variant="lg"
              placeholder="Search your bike — Duke 200, R15, Apache…"
              value={q}
              onChange={(e) => setQ(e.currentTarget.value)}
            />
            <p className="mt-2 text-[11px] text-muted-foreground">
              <Search className="inline h-3 w-3 mr-1" />
              Type your bike model to see photos and customization options
            </p>
          </form>
        </div>
        <div className="hidden shrink-0 flex-col gap-2 text-right md:flex">
          <a
            href="https://wa.me/918523876978"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-end gap-2 rounded-full bg-neon px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-neon-foreground shadow-neon"
          >
            WhatsApp us <ArrowRight className="h-4 w-4" />
          </a>
          <a
            href="tel:+918523876978"
            className="text-xs font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            +91 85238 76978
          </a>
        </div>
      </div>
    </section>
  );
}

// ============================================================
// Brand Strip
// ============================================================
function BrandStrip() {
  const { data } = useSuspenseQuery(brandsQuery);

  return (
    <section className="mt-10">
      <SectionHeader title="Browse by brand" />
      <div className="-mx-4 mt-4 flex gap-3 overflow-x-auto scrollbar-none px-4 pb-2 md:mx-0 md:px-0">
        {data.map((b) => (
          <Link
            key={b.id}
            to="/search"
            search={{ q: b.name }}
            className="flex min-w-[110px] items-center justify-center rounded-2xl border border-border bg-surface px-4 py-3 font-display text-sm font-semibold uppercase tracking-widest transition hover:neon-ring"
          >
            {b.name}
          </Link>
        ))}
      </div>
    </section>
  );
}

function BrandStripSkeleton() {
  return (
    <div className="mt-10 flex gap-3 overflow-hidden">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-12 w-28 animate-pulse rounded-2xl surface-panel" />
      ))}
    </div>
  );
}

// ============================================================
// Recent Models
// ============================================================
function RecentModels() {
  const { data } = useSuspenseQuery(recentModelsQuery);
  if (data.length === 0) return null;

  return (
    <section className="mt-12">
      <SectionHeader title="Recently uploaded" href="/search" />
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-5">
        {data.map((model) => (
          <ModelCard key={model.id} model={model} />
        ))}
      </div>
    </section>
  );
}

function ModelCard({ model }: { model: ModelSearchResult }) {
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl surface-panel transition-all duration-300 hover:-translate-y-0.5 hover:neon-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon">
      <Link to="/model/$modelId" params={{ modelId: model.id }} className="flex flex-col flex-1">
        {model.thumbnail_path ? (
          <SignedImage
            path={model.thumbnail_path}
            alt={(model as any).name}
            aspect="4/3"
            className="rounded-b-none"
          />
        ) : (
          <div className="aspect-[4/3] bg-gradient-to-br from-surface-elevated via-surface to-background" />
        )}
        <div className="p-3">
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {(model as any).brand?.name ?? ""}
          </div>
          <div className="mt-0.5 font-display text-sm font-semibold">{(model as any).name}</div>
          <div className="mt-1 flex items-center justify-between gap-2 text-[10px] uppercase tracking-widest">
            <span className="text-neon font-semibold whitespace-nowrap">Configure →</span>
            <span className="text-neon/75 font-mono text-[9px] whitespace-nowrap">
              {model.designs_count ?? 0} Design{model.designs_count !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
}

function ModelCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl surface-panel">
      <div className="aspect-[4/3] animate-pulse bg-gradient-to-br from-surface-elevated via-surface to-background" />
      <div className="space-y-2 p-3">
        <div className="h-2.5 w-1/3 animate-pulse rounded bg-surface-elevated" />
        <div className="h-3.5 w-4/5 animate-pulse rounded bg-surface-elevated" />
      </div>
    </div>
  );
}

function RecentGridSkeleton() {
  return (
    <section className="mt-12">
      <div className="h-5 w-40 animate-pulse rounded bg-surface" />
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-5">
        {Array.from({ length: 8 }).map((_, i) => (
          <ModelCardSkeleton key={i} />
        ))}
      </div>
    </section>
  );
}

// ============================================================
// Shared
// ============================================================
function SectionHeader({ title, href }: { title: string; href?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="font-display text-lg font-semibold uppercase tracking-[0.14em]">{title}</h2>
      {href ? (
        <Link
          to={href as "/search"}
          className="flex items-center gap-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground transition hover:text-neon"
        >
          View all <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </div>
  );
}

// ============================================================
// Recently Configured / Viewed
// ============================================================
function RecentlyViewed() {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    setIds(getRecentlyViewed());
  }, []);

  const { data: models, isLoading } = useQuery({
    queryKey: ["recently-viewed-models", ids],
    queryFn: () => getModelsByIds({ data: { ids } }),
    enabled: ids.length > 0,
  });

  const handleClear = async () => {
    if (
      window.confirm(
        "This will clear all your saved selections and configuration history. Continue?",
      )
    ) {
      clearRecentlyViewed();
      await clearAllCustomizations();
      setIds([]);
      // Reload page to clear any other context
      window.location.reload();
    }
  };

  if (ids.length === 0) return null;
  if (isLoading || !models || models.length === 0) return null;

  return (
    <section className="mt-10 border-b border-border/40 pb-10">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
            Welcome back
          </div>
          <h2 className="font-display text-lg font-semibold uppercase tracking-widest">
            Your Recent Configurations
          </h2>
        </div>
        <button
          onClick={handleClear}
          className="rounded-full border border-red-500/25 bg-red-950/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-red-400 hover:bg-red-500 hover:text-white transition-all cursor-pointer"
        >
          Clear History
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-5">
        {models.map((model) => (
          <ModelCard key={model.id} model={model} />
        ))}
      </div>
    </section>
  );
}
