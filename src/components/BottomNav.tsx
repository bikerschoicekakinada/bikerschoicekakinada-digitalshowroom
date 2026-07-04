import { Link, useRouterState } from "@tanstack/react-router";
import { Compass, Heart, Home, Search, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/", label: "Home", icon: Home },
  { to: "/search", label: "Search", icon: Search },
  { to: "/brands", label: "Brands", icon: Compass },
  { to: "/favorites", label: "Saved", icon: Heart },
  { to: "/admin", label: "Admin", icon: Shield },
] as const;

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/85 backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-between px-2">
        {items.map(({ to, label, icon: Icon }) => {
          const active =
            to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(to + "/");
          return (
            <li key={to} className="flex-1">
              <Link
                to={to}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium tracking-wide",
                  active ? "text-neon" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "grid h-9 w-9 place-items-center rounded-full transition",
                    active
                      ? "bg-neon/15 neon-ring"
                      : "bg-transparent",
                  )}
                >
                  <Icon className="h-4.5 w-4.5" strokeWidth={active ? 2.5 : 2} />
                </span>
                {label.toUpperCase()}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
