import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { CMS_PATHNAME_HEADER } from "@/lib/cms-route";

type RedirectEntry = {
  sourcePath: string;
  destinationUrl: string;
};

const REDIRECTS_CACHE_TTL_MS = 60_000;
let redirectsCache: {
  data: RedirectEntry[];
  expiresAt: number;
} | null = null;
let redirectsFetchPromise: Promise<RedirectEntry[]> | null = null;

async function fetchRedirectsCached(apiUrl: URL): Promise<RedirectEntry[]> {
  const now = Date.now();
  if (redirectsCache && redirectsCache.expiresAt > now) {
    return redirectsCache.data;
  }

  if (redirectsFetchPromise) return redirectsFetchPromise;

  redirectsFetchPromise = fetch(apiUrl)
    .then(async (res) => {
      if (!res.ok) return [];

      const payload = await res.json();
      if (!payload.success || !Array.isArray(payload.data)) return [];

      redirectsCache = {
        data: payload.data,
        expiresAt: Date.now() + REDIRECTS_CACHE_TTL_MS,
      };
      return payload.data;
    })
    .finally(() => {
      redirectsFetchPromise = null;
    });

  return redirectsFetchPromise;
}

const STATIC_REDIRECT_FALLBACKS: Record<string, string> = {
  "/agenda/submit":
    "https://pengajuan-himamusik.notion.site/36e3b26dc3be80a8955bcbf8933c8cdb",
  "/agenda/submit/":
    "https://pengajuan-himamusik.notion.site/36e3b26dc3be80a8955bcbf8933c8cdb",
  "/karya/submit":
    "https://pengajuan-himamusik.notion.site/36e3b26dc3be8006bcd0c2dc60ff54f2",
  "/karya/submit/":
    "https://pengajuan-himamusik.notion.site/36e3b26dc3be8006bcd0c2dc60ff54f2",
};

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  try {
    const apiUrl = new URL("/api/redirects", request.url);
    const redirects = await fetchRedirectsCached(apiUrl);

    const match = redirects.find((entry) => {
      let normalizedSource = entry.sourcePath.trim().toLowerCase();
      if (normalizedSource && !normalizedSource.startsWith("/")) {
        normalizedSource = `/${normalizedSource}`;
      }
      const normalizedPath = pathname.trim().toLowerCase();

      return (
        normalizedSource === normalizedPath ||
        normalizedSource === `${normalizedPath}/` ||
        `${normalizedSource}/` === normalizedPath
      );
    });

    if (match) {
      const destination = match.destinationUrl.startsWith("http")
        ? match.destinationUrl
        : new URL(match.destinationUrl, request.url).toString();

      return NextResponse.redirect(destination, 307);
    }
  } catch (error) {
    // Fail-safe: log the error and allow the request to proceed without blocking
    console.error("[Proxy Redirects Error]:", error);
  }

  // Static fallback redirects check for core form submission endpoints
  const fallbackDestination =
    STATIC_REDIRECT_FALLBACKS[pathname.trim().toLowerCase()];
  if (fallbackDestination) {
    return NextResponse.redirect(fallbackDestination, 307);
  }

  const requestHeaders = new Headers(request.headers);

  // Preview mode: strip trailing /prev suffix so the CMS resolves the real path,
  // but set a header so server components can render the PreviewBar.
  const isPreview = pathname.endsWith("/prev");
  const canonicalPath = isPreview
    ? pathname.slice(0, -"/prev".length) || "/"
    : pathname;
  requestHeaders.set(CMS_PATHNAME_HEADER, canonicalPath);
  if (isPreview) requestHeaders.set("x-preview-mode", "1");

  if (isPreview) {
    return NextResponse.rewrite(new URL(canonicalPath, request.url), {
      request: { headers: requestHeaders },
    });
  }

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - All files with extension (e.g. .svg, .png, .jpg, .css)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)",
  ],
};
