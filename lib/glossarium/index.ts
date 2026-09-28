/**
 * Notion CMS Glossarium
 * =======================
 * The central developer contract between the Notion CMS (A layer)
 * and the Next.js page builder (C layer).
 *
 * This layer (B) provides typed constants for database names,
 * property names, component types, and relations to eliminate
 * magic strings and improve discoverability.
 */

export * from "./components";
export * from "./databases";
export * from "./properties";
export * from "./relations";

/**
 * Notion API version used for all calls.
 * Must stay in sync with AGENTS.md.
 */
export const NOTION_API_VERSION = "2026-03-11";
