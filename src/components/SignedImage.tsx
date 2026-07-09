import { useState } from "react";
import { useSignedUrls } from "@/hooks/use-signed-urls";
import { cn } from "@/lib/utils";

type Props = {
  path: string;
  previewPath?: string;
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
 * Supports progressive loading when previewPath (e.g. thumbnail) is provided.
 */
export function SignedImage({
  path,
  previewPath,
  alt,
  className,
  imgClassName,
  aspect = "4/5",
  priority = false,
  sizes,
}: Props) {
  const paths = [path, previewPath].filter((p): p is string => !!p);
  const { urls } = useSignedUrls(paths);
  const url = urls[path];
  const previewUrl = previewPath ? urls[previewPath] : null;

  const [loaded, setLoaded] = useState(false);
  const [previewLoaded, setPreviewLoaded] = useState(false);

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
          (loaded || previewLoaded) && "opacity-0 transition-opacity duration-500",
        )}
      />

      {/* Blurred preview thumbnail while main loads */}
      {previewUrl && !loaded ? (
        <img
          src={previewUrl}
          alt=""
          aria-hidden="true"
          onLoad={() => setPreviewLoaded(true)}
          className={cn(
            "absolute inset-0 h-full w-full object-cover filter blur-md transition-all duration-500 scale-105",
            previewLoaded ? "opacity-75" : "opacity-0",
            imgClassName,
          )}
        />
      ) : null}

      {/* Main High-res Image */}
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

