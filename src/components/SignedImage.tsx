import { useState } from "react";
import { useSignedUrls } from "@/hooks/use-signed-urls";
import { cn } from "@/lib/utils";

type Props = {
  path: string;
  alt: string;
  className?: string;
  imgClassName?: string;
  aspect?: string; // e.g. "4/5"
  priority?: boolean;
  sizes?: string;
};

/**
 * Loads a signed image URL for a private storage path with a blurred
 * skeleton fallback and lazy loading. Safe for large lists.
 */
export function SignedImage({
  path,
  alt,
  className,
  imgClassName,
  aspect = "4/5",
  priority = false,
  sizes,
}: Props) {
  const { urls } = useSignedUrls([path]);
  const url = urls[path];
  const [loaded, setLoaded] = useState(false);

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-surface",
        className,
      )}
      style={{ aspectRatio: aspect }}
    >
      <div
        className={cn(
          "absolute inset-0 bg-gradient-to-br from-surface-elevated via-surface to-background",
          "animate-pulse",
          loaded && "opacity-0 transition-opacity duration-500",
        )}
      />
      {url ? (
        <img
          src={url}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          sizes={sizes}
          onLoad={() => setLoaded(true)}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-[opacity,transform] duration-700 ease-out",
            loaded ? "opacity-100 scale-100" : "opacity-0 scale-105",
            imgClassName,
          )}
        />
      ) : null}
    </div>
  );
}
