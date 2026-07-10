import { useCallback, useEffect, useSyncExternalStore, useState } from "react";

const KEY = "bck.favorites.v2";
type Listener = () => void;
const listeners = new Set<Listener>();

export interface SavedConfig {
  id: string;
  modelId: string;
  modelName: string;
  brandName: string;
  designId: string;
  thumbnailPath: string;
  activeIdx: number;
  selectedItemIds: string[];
  total: number;
  savedAt: number;
}

const EMPTY_ARRAY: SavedConfig[] = [];
let cachedList: SavedConfig[] = EMPTY_ARRAY;
let lastRaw: string | null = null;

function read(): SavedConfig[] {
  if (typeof window === "undefined") return EMPTY_ARRAY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === lastRaw) return cachedList;
    lastRaw = raw;
    cachedList = raw ? (JSON.parse(raw) as SavedConfig[]) : EMPTY_ARRAY;
    return cachedList;
  } catch {
    return EMPTY_ARRAY;
  }
}

function write(values: SavedConfig[]) {
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

  const save = useCallback((config: Omit<SavedConfig, "id" | "savedAt">) => {
    const cur = read();
    const exists = cur.some(
      (x) =>
        x.modelId === config.modelId &&
        x.activeIdx === config.activeIdx &&
        x.selectedItemIds.length === config.selectedItemIds.length &&
        x.selectedItemIds.every((id) => config.selectedItemIds.includes(id)),
    );
    if (exists) return;

    const newConfig: SavedConfig = {
      ...config,
      id: `${config.modelId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      savedAt: Date.now(),
    };
    write([newConfig, ...cur]);
  }, []);

  const remove = useCallback((id: string) => {
    const cur = read();
    write(cur.filter((x) => x.id !== id));
  }, []);

  const findSaved = useCallback((modelId: string, activeIdx: number, selectedItemIds: string[]) => {
    const cur = read();
    return cur.find(
      (x) =>
        x.modelId === modelId &&
        x.activeIdx === activeIdx &&
        x.selectedItemIds.length === selectedItemIds.length &&
        x.selectedItemIds.every((id) => selectedItemIds.includes(id)),
    );
  }, []);

  return {
    list: activeList,
    save,
    remove,
    findSaved,
  };
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
