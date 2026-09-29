const CANVA_API_BASE = "https://api.canva.com/rest/v1";

export interface CanvaPage {
  index: number;
  name?: string;
}

export async function resolveCanvaLink(url: string): Promise<string> {
  if (url.includes("canva.link")) {
    try {
      const response = await fetch(url, { method: "HEAD", redirect: "manual" });
      const location = response.headers.get("location");
      if (location) return location;
    } catch (e) {
      console.error("[Canva] Failed to resolve short link:", e);
    }
  }
  return url;
}

export function extractDesignId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/");
    const designIndex = parts.indexOf("design");
    if (designIndex !== -1 && parts[designIndex + 1]) {
      return parts[designIndex + 1];
    }
    return null;
  } catch {
    return null;
  }
}

import fs from "fs";
import path from "path";

import { supabaseAdmin } from "./supabase";

const SESSION_FILE = path.join(process.cwd(), ".canva_session.json");
const BUCKET_NAME =
  process.env.INSTAGRAM_SECRET_PAGE_BUCKET ?? "instagram-secret-page";
const SESSION_PATH = "canva-session.json";

export async function saveSession(data: {
  access_token: string;
  refresh_token?: string;
}) {
  try {
    const current = (await loadSession()) || {};
    const updated = { ...current, ...data };

    // Save to local FS for dev convenience
    if (process.env.NODE_ENV !== "production") {
      fs.writeFileSync(SESSION_FILE, JSON.stringify(updated, null, 2));
    }

    // Save to Supabase Storage for Vercel persistence
    if (supabaseAdmin) {
      const { error } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .upload(SESSION_PATH, JSON.stringify(updated), {
          contentType: "application/json",
          upsert: true,
        });
      if (error) console.error("[Canva] Supabase Save Error:", error);
    }
  } catch {
    console.error("[Canva] Failed to save session:");
  }
}

async function loadSession(): Promise<{
  access_token: string;
  refresh_token: string;
} | null> {
  // 1. Try Supabase first (source of truth for production)
  if (supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .download(SESSION_PATH);
      if (!error && data) {
        return JSON.parse(await data.text());
      }
    } catch {
      console.warn("[Canva] Supabase load skipped/failed.");
    }
  }

  // 2. Fallback to local FS
  try {
    if (fs.existsSync(SESSION_FILE)) {
      return JSON.parse(fs.readFileSync(SESSION_FILE, "utf-8"));
    }
  } catch (e) {
    console.error("[Canva] Failed to load local session:", e);
  }
  return null;
}

let cachedToken: string | null = null;

async function refreshCanvaToken(): Promise<string> {
  const session = await loadSession();
  const clientId = process.env.CANVA_CLIENT_ID;
  const clientSecret = process.env.CANVA_CLIENT_SECRET;
  const refreshToken =
    session?.refresh_token || process.env.CANVA_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Missing CANVA_CLIENT_ID, CANVA_CLIENT_SECRET, or CANVA_REFRESH_TOKEN.",
    );
  }

  console.warn("[Canva] Refreshing access token...");

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch("https://api.canva.com/rest/v1/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    console.error("[Canva] Refresh Error:", error);
    throw new Error(
      `Failed to refresh Canva token: ${error.error_description || response.statusText}`,
    );
  }

  const data = await response.json();
  cachedToken = data.access_token;

  await saveSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken,
  });

  console.warn("[Canva] Token refreshed and saved successfully.");
  return data.access_token;
}

async function canvaFetch(endpoint: string, options: RequestInit = {}) {
  const session = await loadSession();
  let token =
    cachedToken || session?.access_token || process.env.CANVA_ACCESS_TOKEN;

  if (!token) {
    throw new Error("Missing CANVA_ACCESS_TOKEN environment variable.");
  }

  const makeRequest = async (authToken: string) => {
    return fetch(`${CANVA_API_BASE}${endpoint}`, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
    });
  };

  let response = await makeRequest(token);

  if (response.status === 401) {
    console.warn("[Canva] 401 Unauthorized. Attempting refresh...");
    try {
      token = await refreshCanvaToken();
      response = await makeRequest(token);
    } catch (e) {
      console.error("[Canva] Token refresh failed:", e);
      throw new Error(
        "Canva session expired. Reconnect Canva at /api/canva/auth.",
      );
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    console.error(`[Canva] API Error: ${response.status}`, error);
    throw new Error(error.message || `Canva API error: ${response.status}`);
  }

  return response.json();
}

export async function getDesignPages(designId: string): Promise<CanvaPage[]> {
  const data = await canvaFetch(`/designs/${designId}/pages`);
  const pages = data.items || [];
  console.warn(`[Canva] Found ${pages.length} pages for design ${designId}`);
  console.warn(
    `[Canva] Page Names:`,
    pages.map((p) => `"${p.name}"`).join(", "),
  );
  return pages;
}

export async function exportPagesAsPng(
  designId: string,
  pageIndices: number[],
): Promise<string[]> {
  if (pageIndices.length === 0) return [];

  const body = {
    design_id: designId,
    format: {
      type: "png",
      pages: pageIndices, // directly use the 1-based indices from the API
    },
  };
  console.warn(`[Canva] Creating Export Job:`, JSON.stringify(body, null, 2));

  // Create export job
  const job = await canvaFetch("/exports", {
    method: "POST",
    body: JSON.stringify(body),
  });

  const exportId = job.job.id;

  // Poll for completion
  let status = job.job.status;
  let resultJob = job.job;

  while (status === "in_progress") {
    console.warn(`[Canva] Export ${exportId} in progress...`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const poll = await canvaFetch(`/exports/${exportId}`);
    resultJob = poll.job;
    status = resultJob.status;
  }

  console.warn(`[Canva] Export ${exportId} finished with status: ${status}`);

  if (status === "failed") {
    throw new Error("Canva export job failed.");
  }

  return resultJob.urls || [];
}

export function filterPagesForColumn(
  pages: CanvaPage[],
  column: number,
  totalColumns: number = 3,
  customMapping?: string,
): number[] {
  if (customMapping && customMapping.trim() !== "") {
    const specifiedIndices = customMapping
      .split(/[,\s]+/)
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));
    if (specifiedIndices.length > 0) {
      const filtered = pages
        .filter((p) => specifiedIndices.includes(p.index))
        .sort(
          (a, b) =>
            specifiedIndices.indexOf(a.index) -
            specifiedIndices.indexOf(b.index),
        )
        .map((p) => p.index);
      console.warn(
        `[Canva] Column ${column} mapped by Custom Config to ${filtered.length} pages`,
      );
      return filtered;
    }
  }

  // Since Canva API doesn't support page names, we use Index-based mapping.
  // Column 0 (Left): Pages 1, 4, 7...
  // Column 1 (Center): Pages 2, 5, 8...
  // Column 2 (Right): Pages 3, 6, 9...

  // If we are doing a single cell fetch (totalColumns = 1), we just take everything.
  if (totalColumns === 1) {
    return pages.map((p) => p.index);
  }

  const filtered = pages
    .filter((p) => (p.index - 1) % totalColumns === column)
    .sort((a, b) => a.index - b.index)
    .map((p) => p.index);

  console.warn(
    `[Canva] Column ${column} mapped by Index to ${filtered.length} pages`,
  );
  return filtered;
}

export function filterPagesForRow(
  pages: CanvaPage[],
): Record<number, number[]> {
  const result: Record<number, number[]> = {
    0: filterPagesForColumn(pages, 0),
    1: filterPagesForColumn(pages, 1),
    2: filterPagesForColumn(pages, 2),
  };
  return result;
}
