import type { Division } from "./pendaftaran-data";

const STORAGE_KEY = "hima_divisions_cache";

export interface DivisionsResponse {
  divisions: Division[];
  angkatanList: string[];
  juniorAngkatan?: string | null;
}

let inMemoryDivisions: DivisionsResponse | null = null;
let pendingDivisionsFetch: Promise<DivisionsResponse> | null = null;

export function readCachedDivisions(): DivisionsResponse | null {
  if (inMemoryDivisions) return inMemoryDivisions;
  if (typeof window === "undefined") return null;

  try {
    const cached = window.localStorage.getItem(STORAGE_KEY);
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    if (!parsed.divisions || !Array.isArray(parsed.divisions)) return null;
    inMemoryDivisions = parsed;
    return parsed;
  } catch {
    return null;
  }
}

export function fetchDivisionsOnce(): Promise<DivisionsResponse> {
  // Always fetch fresh data to sync with Notion, do not early return just because inMemory exists
  // if (inMemoryDivisions) return Promise.resolve(inMemoryDivisions);
  if (pendingDivisionsFetch) return pendingDivisionsFetch;

  pendingDivisionsFetch = fetch("/api/divisions")
    .then((res) => {
      if (!res.ok) throw new Error("Failed to fetch divisions");
      return res.json();
    })
    .then((res) => {
      if (!res.success || !res.data || !Array.isArray(res.data.divisions)) {
        throw new Error("Invalid divisions response");
      }
      inMemoryDivisions = res.data;
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(res.data));
      } catch {}
      return res.data;
    })
    .finally(() => {
      pendingDivisionsFetch = null;
    });

  return pendingDivisionsFetch;
}
