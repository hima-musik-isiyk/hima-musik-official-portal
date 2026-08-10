import { headers } from "next/headers";
import { connection } from "next/server";

export const CMS_PATHNAME_HEADER = "x-pathname";
export const CMS_PREVIEW_HEADER = "x-preview-mode";

/** Strip preview suffix (/prev) from client pathname if present. */
export function getCanonicalClientPath(
  pathname: string | null | undefined,
): string {
  if (!pathname) return "/";
  if (pathname.endsWith("/prev")) {
    return pathname.slice(0, -5) || "/";
  }
  return pathname;
}

/** Returns true when the request URL ends with /prev (preview mode). */
export async function getIsPreviewMode(): Promise<boolean> {
  await connection();
  const headerStore = await headers();
  return headerStore.get(CMS_PREVIEW_HEADER) === "1";
}

/** Current request pathname from proxy (no hardcoded route slugs). */
export async function getRequestPathname(): Promise<string> {
  await connection();
  const headerStore = await headers();
  const fromProxy = headerStore.get(CMS_PATHNAME_HEADER);
  if (fromProxy) {
    const trimmed = fromProxy.trim();
    return trimmed || "/";
  }

  const nextUrl = headerStore.get("x-url") ?? headerStore.get("next-url");
  if (nextUrl) {
    try {
      const pathname = new URL(nextUrl, "http://localhost").pathname;
      return pathname || "/";
    } catch {
      // ignore malformed header
    }
  }

  return "/";
}
