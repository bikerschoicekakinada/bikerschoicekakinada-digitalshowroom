import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { Search } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { SearchBar } from "@/components/SearchBar";
import { SignedImage } from "@/components/SignedImage";
import { searchModels, type ModelSearchResult } from "@/lib/catalog.functions";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/search")({
  validateSearch: zodValidator(searchSchema),
  component: SearchPage,
  head: () => ({
    meta: [
      { title: "Search Bike Models — Bikers Choice Kakinada" },
      { name: "description", content: "Search for your bike model and explore customization options at Bikers Choice Kakinada." },
    ],
  }),
});

function SearchPage() {
  const { q } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [text, setText] = useState(q);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => setText(q), [q]);

  const onType = (v: string) => {
    setText(v);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      navigate({ search: () => ({ q: v }) });
    }, 250);
  };

  const results = useQuery({
    queryKey: ["search-models", q],
    queryFn: () => searchModels({ data: { q: q.trim(), limit: 48 } }),
    staleTime: 1000 * 60,
    placeholderData: (prev) => prev,
  });

  const rows = results.data ?? [];

  return (
    <AppShell>
      <div className="flex items-center gap-3">
        <SearchBar
          variant="lg"
          autoFocus
          placeholder="Search your bike model…"
          value={text}
          onChange={(e) => onType(e.currentTarget.value)}
          className="flex-1"
        />
      </div>

      {!q.trim() && !results.isLoading && (
        <div className="mt-8 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-neon/10 text-neon">
            <Search className="h-7 w-7" />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">Type your bike model name to find customization options</p>
          <p className="mt-1 text-xs text-muted-foreground opacity-70">e.g. Duke 200, R15, Apache RTR 160</p>
        </div>
      )}

      {results.isLoading && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-5">
          {Array.from({ length: 8 }).map((_, i) => <ModelCardSkeleton key={i} />)}
        </div>
      )}

      {results.isError && (
        <div className="mt-8 text-center">
          <p className="text-sm text-crimson font-medium">Failed to search bike models</p>
          <p className="mt-2 text-xs text-muted-foreground">Please check your connection and try again.</p>
          <button
            type="button"
            onClick={() => results.refetch()}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-neon/50 bg-neon/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-neon hover:bg-neon hover:text-black"
          >
            Retry
          </button>
        </div>
      )}

      {!results.isLoading && !results.isError && rows.length === 0 && q.trim() && (
        <div className="mt-12 text-center">
          <p className="text-sm text-muted-foreground">No models found for "{q}"</p>
          <p className="mt-2 text-xs text-muted-foreground opacity-70">Try a different spelling, or ask the shop to add this model.</p>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="mt-6 text-xs uppercase tracking-widest text-muted-foreground">
            {rows.length} model{rows.length !== 1 ? "s" : ""} found
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-5">
            {rows.map((model) => <ModelCard key={model.id} model={model} />)}
          </div>
        </>
      )}
    </AppShell>
  );
}

function ModelCard({ model }: { model: ModelSearchResult }) {
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl surface-panel transition-all duration-300 hover:-translate-y-0.5 hover:neon-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon">
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
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {(model as any).brand?.name ?? ""}
          </div>
          <div className="mt-0.5 font-display text-sm font-semibold">{(model as any).name}</div>
          <div className="mt-1 text-[10px] text-neon uppercase tracking-widest">Configure →</div>
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
