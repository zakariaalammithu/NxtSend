/**
 * Browser-local persistence for the DEMO backend of the data layer.
 *
 * In demo mode there is no database, but user actions (adding leads,
 * importing a CSV, pausing a campaign, suspending a demo user) should still
 * behave like a real product within the browser: they persist across page
 * reloads via localStorage. Everything stored here is demo data only — the
 * storage keys are namespaced `nxtsend_demo_*` and the UI labels it as such.
 *
 * The storage backend is abstracted behind StorageLike so unit tests can
 * inject an in-memory implementation (see createMemoryStorage /
 * setDemoStorage). Outside the browser (SSR, tests) an in-memory fallback
 * is used, which simply means demo state does not persist across processes.
 */

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

class MemoryStorage implements StorageLike {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

export function createMemoryStorage(): StorageLike {
  return new MemoryStorage();
}

let storageOverride: StorageLike | null = null;
let memoryFallback: StorageLike | null = null;

/** Test hook: force the demo store to use the given storage backend. */
export function setDemoStorage(storage: StorageLike | null): void {
  storageOverride = storage;
}

export function getDemoStorage(): StorageLike {
  if (storageOverride) return storageOverride;
  if (typeof window !== "undefined") {
    try {
      const ls = window.localStorage;
      const probe = "__nxtsend_probe__";
      ls.setItem(probe, "1");
      ls.removeItem(probe);
      return ls;
    } catch {
      // localStorage blocked (private mode, policy) — fall through to memory.
    }
  }
  if (!memoryFallback) memoryFallback = new MemoryStorage();
  return memoryFallback;
}

/**
 * Loads a JSON collection from the demo store, seeding it on first use.
 * A corrupted or non-array payload is treated as "not seeded" and replaced
 * with the seed value rather than crashing the page.
 */
export function loadDemoCollection<T>(key: string, seed: () => T[]): T[] {
  const storage = getDemoStorage();
  try {
    const raw = storage.getItem(key);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed as T[];
      }
    }
  } catch {
    // fall through to seeding
  }
  const seeded = seed();
  saveDemoCollection(key, seeded);
  return seeded;
}

export function saveDemoCollection<T>(key: string, items: T[]): void {
  try {
    getDemoStorage().setItem(key, JSON.stringify(items));
  } catch {
    // Storage full/blocked: the caller's in-memory state is still correct
    // for this session; persistence is best-effort in demo mode.
  }
}

export function clearDemoCollection(key: string): void {
  try {
    getDemoStorage().removeItem(key);
  } catch {
    // ignore
  }
}
