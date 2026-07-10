import { useCallback, useEffect, useSyncExternalStore, useState } from "react";

const KEY = "bck.favorites.v1";
type Listener = () => void;
const listeners = new Set<Listener>();

const EMPTY_ARRAY: string[] = [];
let cachedList: string[] = EMPTY_ARRAY;
let lastRaw: string | null = null;

function read(): string[] {
  if (typeof window === "undefined") return EMPTY_ARRAY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === lastRaw) return cachedList;
    lastRaw = raw;
    cachedList = raw ? (JSON.parse(raw) as string[]) : EMPTY_ARRAY;
    return cachedList;
  } catch {
    return EMPTY_ARRAY;
  }
}

function write(values: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(values));
  for (const l of listeners) l();
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useFavorites() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const list = useSyncExternalStore(subscribe, read, () => EMPTY_ARRAY);
  const activeList = mounted ? list : EMPTY_ARRAY;

  const toggle = useCallback((id: string) => {
    const cur = read();
    write(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  }, []);
  const has = useCallback((id: string) => activeList.includes(id), [activeList]);
  return { list: activeList, toggle, has };
}

export function useOnlineStatus() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const online = useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => (typeof navigator !== "undefined" ? navigator.onLine : true),
    () => true,
  );
  return mounted ? online : true;
}
