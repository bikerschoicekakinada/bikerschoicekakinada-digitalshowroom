// ============================================================
// BCK Design Explorer — Persistence Layer
// ============================================================
// Architecture: Working Configurations are isolated by:
//   sessionId + modelId + activeIdx
//
// Every unique combination of browser/tab session, bike model,
// and gallery image index has its own independent working config.
//
// Saved Configurations (favorites) are stored separately in
// localStorage and are NEVER auto-updated during editing.
// ============================================================

const DB_NAME = "bck_showroom_db";
const STORE_NAME = "customizations";
const DB_VERSION = 3; // v3: composite key sessionId::modelId::activeIdx

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
      // Drop any older store versions and recreate with new composite key
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }
      db.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
  });
}

// ============================================================
// Session ID — one stable anonymous ID per browser
// ============================================================
const SESSION_KEY = "bck.session_id";

export function getSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  let sid = localStorage.getItem(SESSION_KEY);
  if (!sid) {
    sid = `anon_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    localStorage.setItem(SESSION_KEY, sid);
  }
  return sid;
}

// ============================================================
// Working Configuration Schema
// ============================================================
export interface WorkingConfiguration {
  /** Composite primary key: `${sessionId}::${modelId}::${activeIdx}` */
  id: string;
  sessionId: string;
  modelId: string;
  activeIdx: number;
  selectedItemIds: string[];
  total: number;
  updatedAt: number;
}

// Legacy alias so older imports still compile
export type CustomizationData = WorkingConfiguration;

// ============================================================
// Working Configuration CRUD
// ============================================================

/** Persist the working configuration for this session + bike + image. */
export async function saveWorkingConfig(
  modelId: string,
  activeIdx: number,
  selectedItemIds: string[],
  total: number,
): Promise<void> {
  try {
    const sessionId = getSessionId();
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const record: WorkingConfiguration = {
        id: `${sessionId}::${modelId}::${activeIdx}`,
        sessionId,
        modelId,
        activeIdx,
        selectedItemIds,
        total,
        updatedAt: Date.now(),
      };
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error("[BCK] saveWorkingConfig error:", err);
  }
}

/** Retrieve the working configuration for this session + bike + image. */
export async function getWorkingConfig(
  modelId: string,
  activeIdx: number,
): Promise<WorkingConfiguration | null> {
  try {
    const sessionId = getSessionId();
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(`${sessionId}::${modelId}::${activeIdx}`);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error("[BCK] getWorkingConfig error:", err);
    return null;
  }
}

/** Clear all working configurations. */
export async function clearAllWorkingConfigs(): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error("[BCK] clearAllWorkingConfigs error:", err);
  }
}

// Legacy shims — keep old call-sites compiling
/** @deprecated Use saveWorkingConfig instead */
export const saveCustomization = saveWorkingConfig;
/** @deprecated Use getWorkingConfig instead */
export const getCustomization = getWorkingConfig;
/** @deprecated Use clearAllWorkingConfigs instead */
export const clearAllCustomizations = clearAllWorkingConfigs;

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
