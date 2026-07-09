const DB_NAME = "bck_showroom_db";
const STORE_NAME = "customizations";
const DB_VERSION = 1;

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB is not supported"));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "modelId" });
      }
    };
  });
}

export interface CustomizationData {
  modelId: string;
  selectedItemIds: string[];
  activeIdx: number;
  total: number;
  updatedAt: number;
}

export async function saveCustomization(
  modelId: string,
  selectedItemIds: string[],
  activeIdx: number,
  total: number
): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const data: CustomizationData = {
        modelId,
        selectedItemIds,
        activeIdx,
        total,
        updatedAt: Date.now(),
      };
      const request = store.put(data);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("IndexedDB save error:", err);
  }
}

export async function getCustomization(modelId: string): Promise<CustomizationData | null> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(modelId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("IndexedDB read error:", err);
    return null;
  }
}

export async function clearAllCustomizations(): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("IndexedDB clear error:", err);
  }
}

// Lightweight localStorage preferences
const BIKE_KEY = "bck.selected_bike";
const RECENT_KEY = "bck.recent_models";

export function saveSelectedBike(modelId: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(BIKE_KEY, modelId);
}

export function getSelectedBike(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(BIKE_KEY);
}

export function addRecentlyViewed(modelId: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    let list: string[] = raw ? JSON.parse(raw) : [];
    list = [modelId, ...list.filter((id) => id !== modelId)].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch (err) {
    console.error("Recently viewed save error:", err);
  }
}

export function getRecentlyViewed(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearRecentlyViewed() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(RECENT_KEY);
}
