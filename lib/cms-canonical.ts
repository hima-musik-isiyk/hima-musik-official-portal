/** Strip preview suffix (/prev) from client pathname if present. Client-safe module. */
export function getCanonicalClientPath(
  pathname: string | null | undefined,
): string {
  if (!pathname) return "/";
  if (pathname.endsWith("/prev")) {
    return pathname.slice(0, -5) || "/";
  }
  return pathname;
}
