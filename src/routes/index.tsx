import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ChevronRight, Flame, Sparkles, ArrowRight } from "lucide-react";
import { Suspense, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { CategoryChip } from "@/components/CategoryChip";
import { DesignCard, DesignCardSkeleton } from "@/components/DesignCard";
import { SearchBar } from "@/components/SearchBar";
import { EmptyState } from "@/components/EmptyState";
import heroBike from "@/assets/hero-bike.jpg";
import {
  listBrands,
  listCategories,
  listDesigns,
} from "@/lib/catalog.functions";

const categoriesQuery = queryOptions({
  queryKey: ["categories"],
  queryFn: () => listCategories(),
  staleTime: 1000 * 60 * 30,
});
const brandsQuery = queryOptions({
  queryKey: ["brands"],
  queryFn: () => listBrands(),
  staleTime: 1000 * 60 * 30,
});
const trendingQuery = queryOptions({
  queryKey: ["designs", "trending"],
  queryFn: () => listDesigns({ data: { trending: true, limit: 8, sort: "trending" } }),
  staleTime: 1000 * 60 * 5,
});
const recentQuery = queryOptions({
  queryKey: ["designs", "recent"],
  queryFn: () => listDesigns({ data: { limit: 8, sort: "newest" } }),
  staleTime: 1000 * 60 * 5,
});

export const Route = createFileRoute("/")({
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(categoriesQuery);
    context.queryClient.ensureQueryData(brandsQuery);
    context.queryClient.ensureQueryData(trendingQuery);
    context.queryClient.ensureQueryData(recentQuery);
  },
  component: HomePage,
});

function HomePage() {
  return (
    <AppShell>
      <Hero />
      <Suspense fallback={<CategoryRailSkeleton />}>
        <CategoryRail />
      </Suspense>
      <Suspense fallback={<GridSkeleton title="Trending" />}>
        <TrendingSection />
      </Suspense>
      <Suspense fallback={<GridSkeleton title="Recently added" />}>
        <RecentSection />
      </Suspense>
      <Suspense fallback={null}>
        <BrandStrip />
      </Suspense>
    </AppShell>
  );
}

function Hero() {
  const [q, setQ] = useState("");
  const navigate = useNavigate();
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
          <div className="inline-flex items-center gap-2 rounded-full border border-neon/40 bg-neon/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-neon">
            <Sparkles className="h-3 w-3" /> Digital Showroom
          </div>
          <h1 className="mt-4 font-display text-3xl font-bold leading-[1.05] md:text-5xl">
            Scan. <span className="neon-text">Explore.</span>{" "}
            <br className="hidden md:block" />
            Style your ride.
          </h1>
          <p className="mt-3 max-w-md text-sm text-muted-foreground md:text-base">
            The complete design catalog of Bikers Choice Kakinada — wraps, paint,
            hydro dipping, PPF, graphics and more. Browse on your phone, decide in
            the shop.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              navigate({ to: "/search", search: { q } });
            }}
            className="mt-6"
          >
            <SearchBar
              variant="lg"
              placeholder="Search Duke wraps, matte black, hydro dip…"
              value={q}
              onChange={(e) => setQ(e.currentTarget.value)}
            />
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

function CategoryRail() {
  const { data: cats } = useSuspenseQuery(categoriesQuery);
  return (
    <section className="mt-10">
      <SectionHeader title="Categories" href="/search" />
      <div className="-mx-4 mt-4 flex gap-3 overflow-x-auto scrollbar-none px-4 pb-2 md:mx-0 md:px-0">
        {cats.map((c) => (
          <CategoryChip key={c.id} category={c} />
        ))}
      </div>
    </section>
  );
}

function CategoryRailSkeleton() {
  return (
    <div className="mt-10 flex gap-3 overflow-hidden">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-24 w-28 animate-pulse rounded-2xl surface-panel" />
      ))}
    </div>
  );
}

function TrendingSection() {
  const { data } = useSuspenseQuery(trendingQuery);
  if (data.rows.length === 0) {
    return (
      <section className="mt-12">
        <SectionHeader title="Trending designs" icon={<Flame className="h-4 w-4" />} />
        <div className="mt-4">
          <EmptyState
            title="No trending designs yet"
            description="The owner hasn't marked any designs as trending. Explore the full catalog instead."
            icon={<Flame className="h-6 w-6" />}
            action={
              <Link
                to="/search"
                className="rounded-full bg-neon px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-neon-foreground shadow-neon"
              >
                Browse all
              </Link>
            }
          />
        </div>
      </section>
    );
  }
  return (
    <section className="mt-12">
      <SectionHeader title="Trending designs" icon={<Flame className="h-4 w-4" />} href="/search" />
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
        {data.rows.slice(0, 8).map((d, i) => (
          <DesignCard key={d.id} design={d} priority={i < 2} />
        ))}
      </div>
    </section>
  );
}

function RecentSection() {
  const { data } = useSuspenseQuery(recentQuery);
  if (data.rows.length === 0) return null;
  return (
    <section className="mt-12">
      <SectionHeader title="Recently added" href="/search" />
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
        {data.rows.map((d) => (
          <DesignCard key={d.id} design={d} />
        ))}
      </div>
    </section>
  );
}

function BrandStrip() {
  const { data } = useSuspenseQuery(brandsQuery);
  return (
    <section className="mt-14">
      <SectionHeader title="Bike brands" href="/brands" />
      <div className="-mx-4 mt-4 flex gap-3 overflow-x-auto scrollbar-none px-4 pb-2 md:mx-0 md:px-0">
        {data.map((b) => (
          <Link
            key={b.id}
            to="/search"
            search={{ q: "", category: "", brand: b.slug, sort: "newest" }}
            className="flex min-w-[120px] items-center justify-center rounded-2xl border border-border bg-surface px-5 py-4 font-display text-sm font-semibold uppercase tracking-widest transition hover:neon-ring"
          >
            {b.name}
          </Link>
        ))}
      </div>
    </section>
  );
}

function SectionHeader({
  title,
  href,
  icon,
}: {
  title: string;
  href?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold uppercase tracking-[0.14em]">
        {icon ? <span className="text-neon">{icon}</span> : null} {title}
      </h2>
      {href ? (
        <Link
          to={href as "/search"}
          className="flex items-center gap-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground transition hover:text-neon"
        >
          View all <ChevronRight className="h-4 w-4" />
        </Link>
      ) : null}
    </div>
  );
}

function GridSkeleton({ title }: { title: string }) {
  return (
    <section className="mt-12">
      <h2 className="font-display text-lg font-semibold uppercase tracking-[0.14em]">{title}</h2>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <DesignCardSkeleton key={i} />
        ))}
      </div>
    </section>
  );
}
