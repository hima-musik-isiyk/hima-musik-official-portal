import { createClient } from "@supabase/supabase-js";

let supabaseBrowserInstance: ReturnType<typeof createClient> | null = null;

/**
 * Returns a singleton instance of the Supabase client for browser usage.
 * In a server context (SSR), it returns a fresh instance per invocation to prevent cross-request state pollution.
 */
export function getSupabaseBrowserClient() {
  // Return a stateless client if executed on the server side (SSR)
  if (typeof window === "undefined") {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
      return null;
    }

    return createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  // Return the cached browser singleton instance
  if (!supabaseBrowserInstance) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
      console.warn("Supabase credentials missing on the browser.");
      return null;
    }

    supabaseBrowserInstance = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
  }

  return supabaseBrowserInstance;
}

/**
 * Returns a stateless, request-scoped Supabase client for Server Components, Server Actions, or Route Handlers.
 * Avoids any state leakage between concurrent incoming HTTP requests.
 */
export function getSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase server-side environment variables.");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Returns a service-role Supabase client. Throws when the service role key
 * is missing (never falls back to the anon key). Server-only.
 */
export function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// Legacy Admin Client with Service Role Key (Node.js environments only)
const adminUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (typeof window === "undefined" && (!adminUrl || !adminKey)) {
  console.warn(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. admin features will be disabled.",
  );
}

export const supabaseAdmin =
  adminUrl && adminKey
    ? createClient(adminUrl, adminKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })
    : null;
