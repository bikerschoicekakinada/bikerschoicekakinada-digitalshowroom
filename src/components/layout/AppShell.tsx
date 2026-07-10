import { Link, useRouterState } from "@tanstack/react-router";
import { Compass, Heart, Home, Search, Shield, WifiOff } from "lucide-react";
import type { ReactNode } from "react";
import { BottomNav } from "@/components/BottomNav";
import { useOnlineStatus } from "@/hooks/use-favorites";
import logoImg from "@/assets/logo.jpeg";
import { cn } from "@/lib/utils";

const desktopNav = [
  { to: "/", label: "Home", icon: Home },
  { to: "/search", label: "Search", icon: Search },
  { to: "/brands", label: "Brands", icon: Compass },
  { to: "/favorites", label: "Favorites", icon: Heart },
] as const;

export function AppShell({ children, hideBottomNav }: { children: ReactNode; hideBottomNav?: boolean }) {
  const online = useOnlineStatus();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top nav */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <img
              src={logoImg}
              width={36}
              height={36}
              alt=""
              className="h-9 w-9 rounded-full ring-1 ring-neon/40"
            />
            <div className="flex flex-col leading-none">
              <span className="font-display text-[11px] font-bold uppercase tracking-[0.25em] text-neon">
                Bikers Choice
              </span>
              <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                Kakinada · Catalog
              </span>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {desktopNav.map(({ to, label, icon: Icon }) => {
              const active =
                to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(to + "/");
              return (
                <Link
                  key={to}
                  to={to}
                  className={cn(
                    "flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wider transition",
                    active
                      ? "bg-neon/10 text-neon neon-ring"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              );
            })}
          </nav>

          <a
            href="https://wa.me/918523876978"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden rounded-full bg-neon px-4 py-2 text-xs font-bold uppercase tracking-wider text-neon-foreground shadow-neon transition hover:opacity-90 md:inline-flex"
          >
            WhatsApp Us
          </a>
        </div>
        {!online ? (
          <div className="flex items-center justify-center gap-2 bg-crimson/15 py-1.5 text-[11px] font-medium text-crimson">
            <WifiOff className="h-3.5 w-3.5" />
            You are offline — showing cached designs
          </div>
        ) : null}
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 md:px-8 md:pb-16">{children}</main>

      {!hideBottomNav && <BottomNav />}
    </div>
  );
}
