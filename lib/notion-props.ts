/**
 * Shared Notion property extraction helpers.
 *
 * These use a tolerant matcher (exact, then normalized, then partial) so they
 * work even when Notion prefixes property names (e.g. "(AUT) Daftar Undangan").
 * They intentionally do NOT strip custom tags and, for rich text, prefer link
 * hrefs over plain text. Use these for CMS/builder extraction.
 *
 * lib/notion.ts keeps its own variants that apply `stripCustomTags` — those are
 * used for user-facing content where tag markup must be removed.
 */
import type { NotionPage } from "./notion";

export type RichTextFragment = { plain_text: string };
export type RelationFragment = { id: string };

export function findProp(page: NotionPage, name: string) {
  if (page.properties[name]) return page.properties[name];

  const target = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  // Try exact normalized match first
  for (const [key, value] of Object.entries(page.properties)) {
    if (key.toLowerCase().replace(/[^a-z0-9]/g, "") === target) return value;
  }

  // Try partial match (e.g. "01 Pages" contains "page")
  for (const [key, value] of Object.entries(page.properties)) {
    const normKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (normKey.includes(target) || target.includes(normKey)) return value;
  }

  return undefined;
}

export function getTitle(page: NotionPage, name: string): string {
  const prop = findProp(page, name);
  if (prop?.type === "title" && prop.title.length > 0) {
    return prop.title
      .map((t: RichTextFragment) => t.plain_text)
      .join("")
      .trim();
  }
  return "";
}

export function getRichText(page: NotionPage, name: string): string {
  const prop = findProp(page, name);
  if (prop?.type === "rich_text" && prop.rich_text) {
    return prop.rich_text
      .map((t: any) => {
        if (t.href) return t.href;
        if (t.text?.link?.url) return t.text.link.url;
        return t.plain_text;
      })
      .join("")
      .trim();
  }
  return "";
}

export function getRichTextOrMentionId(page: NotionPage, name: string): string {
  const prop = findProp(page, name);
  if (prop?.type === "rich_text" && prop.rich_text) {
    return prop.rich_text
      .map((t: any) => {
        if (t.type === "mention" && t.mention) {
          if (t.mention.type === "database" && t.mention.database) {
            return t.mention.database.id;
          }
          if (t.mention.type === "page" && t.mention.page) {
            return t.mention.page.id;
          }
        }
        if (t.href) {
          return t.href;
        }
        if (t.text?.link?.url) {
          return t.text.link.url;
        }
        return t.plain_text;
      })
      .join("")
      .trim();
  }
  return "";
}

export function getSelect(page: NotionPage, name: string): string {
  const prop = findProp(page, name);
  if (prop?.type === "select" && prop.select) {
    return prop.select.name;
  }
  return "";
}

export function getCheckbox(
  page: NotionPage,
  name: string,
  defaultValue = false,
): boolean {
  const prop = findProp(page, name);
  if (prop?.type === "checkbox") {
    return prop.checkbox;
  }
  return defaultValue;
}

export function getUrl(page: NotionPage, name: string): string {
  const prop = findProp(page, name);
  if (prop?.type === "url" && prop.url) {
    return prop.url;
  }
  return "";
}

export function getRelationIds(page: NotionPage, name: string): string[] {
  const prop = findProp(page, name);
  if (prop?.type === "relation" && Array.isArray(prop.relation)) {
    return prop.relation.map((r: RelationFragment) => r.id);
  }
  return [];
}
