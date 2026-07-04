import { useEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { useSignedUrls } from "@/hooks/use-signed-urls";
import { cn } from "@/lib/utils";

export function ImageViewer({
  paths,
  initialIndex = 0,
  onClose,
}: {
  paths: string[];
  initialIndex?: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(initialIndex);
  const { urls } = useSignedUrls(paths);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIdx((i) => Math.min(paths.length - 1, i + 1));
      if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, paths.length]);

  const path = paths[idx];
  const url = urls[path];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/98 backdrop-blur-xl">
      <div className="flex items-center justify-between px-4 py-4 md:px-8">
        <span className="font-display text-sm text-muted-foreground">
          {idx + 1} / {paths.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid h-10 w-10 place-items-center rounded-full border border-border bg-surface hover:neon-ring"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4 pb-4">
        {url ? (
          <img
            src={url}
            alt=""
            className="max-h-full max-w-full select-none rounded-2xl object-contain shadow-2xl"
            style={{ touchAction: "pan-x pan-y pinch-zoom" }}
          />
        ) : (
          <div className="h-2/3 w-2/3 animate-pulse rounded-2xl bg-surface" />
        )}

        {paths.length > 1 ? (
          <>
            <button
              type="button"
              aria-label="Previous"
              onClick={() => setIdx((i) => Math.max(0, i - 1))}
              disabled={idx === 0}
              className={cn(
                "absolute left-3 grid h-11 w-11 place-items-center rounded-full border border-border bg-surface/70 backdrop-blur transition",
                idx === 0 ? "opacity-30" : "hover:neon-ring",
              )}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Next"
              onClick={() => setIdx((i) => Math.min(paths.length - 1, i + 1))}
              disabled={idx === paths.length - 1}
              className={cn(
                "absolute right-3 grid h-11 w-11 place-items-center rounded-full border border-border bg-surface/70 backdrop-blur transition",
                idx === paths.length - 1 ? "opacity-30" : "hover:neon-ring",
              )}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        ) : null}
      </div>
      {paths.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto scrollbar-none px-4 pb-4">
          {paths.map((p, i) => (
            <button
              key={p}
              type="button"
              onClick={() => setIdx(i)}
              className={cn(
                "shrink-0 overflow-hidden rounded-xl border transition",
                i === idx ? "border-neon neon-ring" : "border-border opacity-60 hover:opacity-100",
              )}
              style={{ width: 64, height: 80 }}
            >
              {urls[p] ? (
                <img src={urls[p]} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full animate-pulse bg-surface" />
              )}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
