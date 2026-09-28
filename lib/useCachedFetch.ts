"use client";

import { useEffect, useState } from "react";

type CachedFetchOptions<T> = {
  /** Endpoint to fetch fresh data from. */
  url: string;
  /** localStorage key used to bootstrap the UI before the fetch resolves. */
  cacheKey: string;
  /** Initial state (usually server-provided props or an empty shape). */
  initialData: T;
  /** When true, server data was provided and no client fetch happens. */
  hasInitialData: boolean;
  /**
   * Maps the API JSON response to state. Return `null` to ignore the
   * response. Defaults to `result.success && result.data`.
   */
  select?: (result: any) => T | null;
};

function defaultSelect<T>(result: any): T | null {
  return result?.success && result.data ? (result.data as T) : null;
}

/**
 * Client-side stale-while-revalidate helper used by CMS grids/lists:
 * 1. If the server already provided data, do nothing.
 * 2. Otherwise hydrate from localStorage, then fetch fresh data and cache it.
 */
export function useCachedFetch<T>({
  url,
  cacheKey,
  initialData,
  hasInitialData,
  select = defaultSelect,
}: CachedFetchOptions<T>) {
  const [data, setData] = useState<T>(initialData);
  const [isLoading, setIsLoading] = useState(!hasInitialData);

  useEffect(() => {
    if (hasInitialData) return;

    let isMounted = true;

    try {
      const cached = window.localStorage.getItem(cacheKey);
      if (cached) setData(JSON.parse(cached) as T);
    } catch {}

    (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) return;
        const next = select(await response.json());
        if (!next || !isMounted) return;
        setData(next);
        window.localStorage.setItem(cacheKey, JSON.stringify(next));
      } catch (error) {
        console.error(`Failed to fetch fresh data from ${url}:`, error);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
    // select is expected to be stable per component; url/cacheKey drive refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasInitialData, url, cacheKey]);

  return { data, isLoading };
}
