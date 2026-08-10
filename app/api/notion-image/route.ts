import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase";

const CACHE_DIR = path.join(
  /*turbopackIgnore: true*/ process.cwd(),
  ".next",
  "cache",
  "notion-images",
);
const MAX_FILE_AGE_MS = 1000 * 60 * 60 * 24 * 14; // 14 days
const STORAGE_BUCKET =
  process.env.SUPABASE_NOTION_IMAGE_BUCKET ?? "notion-images";

const warnedStorageMessages = new Set<string>();

function hashKey(value: string): string {
  return createHash("sha1").update(value).digest("hex");
}

function safeContentType(input: string | null): string {
  if (!input) return "application/octet-stream";
  if (input.includes("\n") || input.includes("\r")) {
    return "application/octet-stream";
  }
  return input;
}

/**
 * Sniff image content-type from magic bytes (file signature).
 * Falls back to the hint (e.g. from HTTP Content-Type) when unrecognised.
 * This avoids relying on Supabase Blob.type which may return empty string or
 * 'application/octet-stream', causing browsers to skip ICC color-profile
 * management and rendering wide-gamut (Display P3) images with washed-out colors.
 */
function sniffContentTypeFromBytes(
  buf: Buffer,
  hint = "application/octet-stream",
): string {
  if (buf.length < 4) return hint;

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return "image/jpeg";

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    return "image/png";

  // GIF: 47 49 46 38
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38)
    return "image/gif";

  // WebP: 52 49 46 46 ?? ?? ?? ?? 57 45 42 50
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  )
    return "image/webp";

  // AVIF / HEIF: ftyp box at offset 4
  if (
    buf.length >= 12 &&
    buf[4] === 0x66 &&
    buf[5] === 0x74 &&
    buf[6] === 0x79 &&
    buf[7] === 0x70
  ) {
    const brand = buf.toString("ascii", 8, 12);
    if (brand.startsWith("avif") || brand.startsWith("avis"))
      return "image/avif";
    if (brand.startsWith("heic") || brand.startsWith("mif1"))
      return "image/heic";
  }

  // SVG: starts with '<' (text)
  if (buf[0] === 0x3c) return "image/svg+xml";

  // Fall back to the hint provided (e.g. upstream Content-Type)
  return hint;
}

function warnStorageOnce(message: string, details?: unknown) {
  if (warnedStorageMessages.has(message)) return;
  warnedStorageMessages.add(message);
  console.warn(message, details);
}

function buildCachePaths(cacheKey: string) {
  const hashed = hashKey(cacheKey);
  return {
    dataPath: path.join(CACHE_DIR, `${hashed}.bin`),
    metaPath: path.join(CACHE_DIR, `${hashed}.json`),
  };
}

function buildStoragePath(cacheKey: string): string {
  const hashed = hashKey(cacheKey);
  return `${hashed.slice(0, 2)}/${hashed}`;
}

async function readSupabaseStorageCache(cacheKey: string): Promise<{
  body: Buffer;
  contentType: string;
} | null> {
  if (!supabaseAdmin) return null;

  const storagePath = buildStoragePath(cacheKey);
  const { data, error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .download(storagePath);

  if (error || !data) return null;

  const body = Buffer.from(await data.arrayBuffer());
  const contentType = sniffContentTypeFromBytes(
    body,
    safeContentType(data.type || null),
  );

  return { body, contentType };
}

async function writeSupabaseStorageCache(
  cacheKey: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  if (!supabaseAdmin) return;

  const storagePath = buildStoragePath(cacheKey);
  const { error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, body, {
      cacheControl: "31536000",
      contentType: safeContentType(contentType),
      upsert: true,
    });

  if (error) {
    warnStorageOnce("[Notion Image] Failed to write Supabase cache:", error);
  }
}

async function readFreshCache(cacheKey: string): Promise<{
  body: Buffer;
  contentType: string;
} | null> {
  const { dataPath, metaPath } = buildCachePaths(cacheKey);

  try {
    const [dataBuffer, metaRaw] = await Promise.all([
      fs.readFile(dataPath),
      fs.readFile(metaPath, "utf8"),
    ]);

    const meta = JSON.parse(metaRaw) as {
      savedAt: number;
      contentType: string;
    };

    if (Date.now() - meta.savedAt > MAX_FILE_AGE_MS) {
      return null;
    }

    return {
      body: dataBuffer,
      contentType: safeContentType(meta.contentType),
    };
  } catch {
    return null;
  }
}

async function writeCache(
  cacheKey: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const { dataPath, metaPath } = buildCachePaths(cacheKey);

  await fs.mkdir(CACHE_DIR, { recursive: true });
  await Promise.all([
    fs.writeFile(dataPath, body),
    fs.writeFile(
      metaPath,
      JSON.stringify({
        savedAt: Date.now(),
        contentType,
      }),
    ),
  ]);
}

function makeImageResponse(
  body: Buffer,
  contentType: string,
  cacheStatus = "miss",
): NextResponse {
  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "X-Image-Cache": cacheStatus,
      // Browser cache for repeated page visits.
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}

function makeUpstreamErrorResponse(status = 502): NextResponse {
  return new NextResponse(null, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function makeRedirectResponse(sourceUrl: URL): NextResponse {
  // Use Next.js redirect signature: (url, status). Then set headers.
  const response = NextResponse.redirect(sourceUrl, 307);
  // Keep redirects short-lived because Notion signed URLs rotate.
  response.headers.set(
    "Cache-Control",
    "public, max-age=60, stale-while-revalidate=300",
  );
  return response;
}

export async function GET(request: NextRequest) {
  const src = request.nextUrl.searchParams.get("src");
  const cacheKeyParam = request.nextUrl.searchParams.get("key");

  if (!src) {
    return NextResponse.json({ error: "Missing src" }, { status: 400 });
  }

  let sourceUrl: URL;
  try {
    sourceUrl = new URL(src);
  } catch {
    return NextResponse.json({ error: "Invalid src" }, { status: 400 });
  }

  if (!["http:", "https:"].includes(sourceUrl.protocol)) {
    return NextResponse.json(
      { error: "Unsupported protocol" },
      { status: 400 },
    );
  }

  const cacheKey =
    cacheKeyParam ||
    `${sourceUrl.protocol}//${sourceUrl.host}${sourceUrl.pathname}`;

  const isVercel = Boolean(process.env.VERCEL);

  const storageCached = await readSupabaseStorageCache(cacheKey);
  if (storageCached) {
    return makeImageResponse(
      storageCached.body,
      storageCached.contentType,
      "supabase",
    );
  }

  if (!isVercel) {
    const cached = await readFreshCache(cacheKey);
    if (cached) {
      writeSupabaseStorageCache(
        cacheKey,
        cached.body,
        cached.contentType,
      ).catch(() => {});
      return makeImageResponse(cached.body, cached.contentType, "disk");
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(sourceUrl.toString(), {
      headers: {
        "User-Agent": "HIMA-Portal-Image-Cache/1.0",
      },
      cache: "no-store",
    });
  } catch {
    if (isVercel) {
      return makeUpstreamErrorResponse(502);
    }
    return makeRedirectResponse(sourceUrl);
  }

  if (!upstream.ok) {
    if (isVercel) {
      return makeUpstreamErrorResponse(upstream.status);
    }
    return makeRedirectResponse(sourceUrl);
  }

  // Vercel can choke on extremely long redirect Location headers for Notion's
  // signed asset URLs. Stream the upstream image instead and skip disk cache.
  if (isVercel) {
    const body = Buffer.from(await upstream.arrayBuffer());
    const contentType = safeContentType(
      upstream.headers.get("content-type") || "application/octet-stream",
    );
    writeSupabaseStorageCache(cacheKey, body, contentType).catch(() => {});
    return makeImageResponse(body, contentType, "upstream");
  }

  const body = Buffer.from(await upstream.arrayBuffer());
  const contentType = safeContentType(
    upstream.headers.get("content-type") || "application/octet-stream",
  );

  // Best-effort cache persistence.
  writeCache(cacheKey, body, contentType).catch(() => {});
  writeSupabaseStorageCache(cacheKey, body, contentType).catch(() => {});

  return makeImageResponse(body, contentType, "upstream");
}
