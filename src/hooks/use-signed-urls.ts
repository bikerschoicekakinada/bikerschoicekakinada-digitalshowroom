import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo } from "react";
import { signImageUrls } from "@/lib/catalog.functions";

const memo = new Map<string, { url: string; expires: number }>();

/**
 * Batch-signs image storage paths and returns a lookup map path -> URL.
 * Cached in-memory for 5h so grids don't hammer the server on scroll.
 */
export function useSignedUrls(paths: string[]) {
  const sign = useServerFn(signImageUrls);
  const key = useMemo(() => [...new Set(paths.filter(Boolean))].sort(), [paths]);
  const need = useMemo(() => {
    const now = Date.now();
    return key.filter((p) => !memo.get(p) || memo.get(p)!.expires < now + 60_000);
  }, [key]);

  const query = useQuery({
    queryKey: ["sign", need],
    enabled: need.length > 0,
    staleTime: 1000 * 60 * 60 * 4,
    queryFn: async () => {
      const res = await sign({ data: { paths: need, expiresIn: 60 * 60 * 6 } });
      const expires = Date.now() + 1000 * 60 * 60 * 5;
      for (const [p, url] of Object.entries(res)) memo.set(p, { url, expires });
      return res;
    },
  });

  const map = useMemo(() => {
    const out: Record<string, string> = {};
    for (const p of key) {
      const hit = memo.get(p);
      if (hit) out[p] = hit.url;
    }
    return out;
  }, [key, query.data]);

  return { urls: map, loading: query.isFetching && need.length > 0 };
}

export function useQueryClientInvalidator() {
  const qc = useQueryClient();
  useEffect(() => {
    // noop, exported for consistency
  }, [qc]);
  return qc;
}
