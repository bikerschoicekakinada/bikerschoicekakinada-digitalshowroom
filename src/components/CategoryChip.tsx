import { Link } from "@tanstack/react-router";
import * as Icons from "lucide-react";
import type { CategoryRow } from "@/lib/catalog.functions";
import { cn } from "@/lib/utils";

export function CategoryChip({
  category,
  compact = false,
}: {
  category: CategoryRow;
  compact?: boolean;
}) {
  const Icon =
    (category.icon && (Icons as unknown as Record<string, Icons.LucideIcon | undefined>)[category.icon]) ||
    Icons.Sparkles;
  return (
    <Link
      to="/category/$slug"
      params={{ slug: category.slug }}
      className={cn(
        "group flex shrink-0 flex-col items-center gap-2 rounded-2xl surface-panel px-4 py-4 transition hover:-translate-y-0.5 hover:neon-ring",
        compact ? "min-w-[92px]" : "min-w-[110px]",
      )}
    >
      <span className="grid h-11 w-11 place-items-center rounded-full bg-neon/10 text-neon transition group-hover:bg-neon/20">
        <Icon className="h-5 w-5" strokeWidth={2} />
      </span>
      <span className="text-center text-[11px] font-semibold uppercase tracking-wider">
        {category.name}
      </span>
    </Link>
  );
}
