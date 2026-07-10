import { Search } from "lucide-react";
import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & { variant?: "lg" | "md" };

export const SearchBar = forwardRef<HTMLInputElement, Props>(function SearchBar(
  { className, variant = "md", ...rest },
  ref,
) {
  return (
    <label
      className={cn(
        "group flex items-center gap-3 rounded-full border border-border bg-surface/80 backdrop-blur transition focus-within:neon-ring",
        variant === "lg" ? "h-14 px-5" : "h-12 px-4",
        className,
      )}
    >
      <Search
        className={cn("shrink-0 text-muted-foreground", variant === "lg" ? "h-5 w-5" : "h-4 w-4")}
      />
      <input
        ref={ref}
        type="search"
        {...rest}
        className={cn(
          "min-w-0 flex-1 bg-transparent placeholder:text-muted-foreground/70 focus:outline-none",
          variant === "lg" ? "text-base" : "text-sm",
        )}
      />
    </label>
  );
});
