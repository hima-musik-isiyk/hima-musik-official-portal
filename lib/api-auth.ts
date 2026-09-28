import { timingSafeEqual } from "node:crypto";

/**
 * Shared secret-based authorization for API route handlers.
 *
 * Accepted credential locations:
 * - `Authorization: Bearer <secret>` (Vercel Cron style)
 * - `Authorization: <secret>` (raw, used by Notion automations)
 * - `x-sync-secret: <secret>` / `x-admin-key: <secret>`
 * - `?secret=<secret>` (only when `allowQuery` is true)
 *
 * Fails closed: when no secret is configured, requests are rejected,
 * except in local development (`NODE_ENV=development`).
 */

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

type AuthOptions = {
  allowQuery?: boolean;
  allowRawAuthorization?: boolean;
};

function collectCandidates(request: Request, options: AuthOptions): string[] {
  const candidates: string[] = [];
  const authorization = request.headers.get("authorization");

  if (authorization) {
    if (authorization.startsWith("Bearer ")) {
      candidates.push(authorization.slice("Bearer ".length));
    } else if (options.allowRawAuthorization) {
      candidates.push(authorization);
    }
  }

  const syncSecret = request.headers.get("x-sync-secret");
  if (syncSecret) candidates.push(syncSecret);

  const adminKey = request.headers.get("x-admin-key");
  if (adminKey) candidates.push(adminKey);

  if (options.allowQuery) {
    const querySecret = new URL(request.url).searchParams.get("secret");
    if (querySecret) candidates.push(querySecret);
  }

  return candidates;
}

export function isAuthorizedRequest(
  request: Request,
  secrets: Array<string | undefined>,
  options: AuthOptions = {},
): boolean {
  const configured = secrets.filter((secret): secret is string =>
    Boolean(secret),
  );

  if (!configured.length) {
    return process.env.NODE_ENV === "development";
  }

  const candidates = collectCandidates(request, options);

  return candidates.some((candidate) =>
    configured.some((secret) => safeEqual(candidate, secret)),
  );
}
