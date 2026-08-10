import { Client } from "@notionhq/client";
import type { BlockObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { cache } from "react";

import { unstable_cache } from "./cache";
import { classifyEventLifecycle, getEventDateSortValue } from "./event-dates";
import {
  DB_ADUAN_STORAGE,
  DB_AGENDA_FORM_STORAGE,
  DB_BATCH_PENDAFTARAN,
  DB_BERANDA_HERO,
  DB_BERANDA_JELAJAHI,
  DB_DOKUMEN_SEKRETARIAT,
  DB_FAQ_STORAGE,
  DB_KARYA_FORM_STORAGE,
  DB_KATEGORI_DOKUMEN,
  DB_KKM,
  DB_KKM_HERO,
  DB_REDIRECT,
  DB_SDM_EVALUASI,
  DB_STRUKTUR_ORGANISASI,
  DB_TAHAPAN_REKRUTMEN,
  DB_TUGAS_UTAMA_DIVISI,
  PROP_KKM,
} from "./glossarium";
import type { KKMGroup } from "./kkm-data";
import {
  buildAnchorMap,
  DocMeta,
  NotionBlock,
  NotionPage,
  stripCustomTags,
} from "./notion-shared";

export * from "./notion-shared";

export type NotionContentScope =
  | "sekretariat"
  | "kkm"
  | "events"
  | "beranda"
  | "profil"
  | "karya";

export type EventLifecycle =
  | "upcoming"
  | "ongoing"
  | "past"
  | "timeless"
  | "announcement";

export interface EventEntryMeta extends DocMeta {
  summary: string;
  ownerUnit: string;
  entryKind: string;
  eventDate: string;
  eventDateEnd: string;
  location: string;
  registrationLink: string;
  sourceLink: string;
  sourceName: string;
  isRepost: boolean;
  coverImageUrl: string | null;
  lifecycle: EventLifecycle;
}

export interface EventsCollection {
  upcoming: EventEntryMeta[];
  ongoing: EventEntryMeta[];
  past: EventEntryMeta[];
  announcements: EventEntryMeta[];
}

export interface BerandaEntry {
  id: string;
  title: string;
  slug: string;
  blockType: "Hero" | "Banner Pengumuman" | "CTA Rekrutmen" | "Highlight Acara";
  status: string;
  lastModified: string;
  blocks: NotionBlock[];
}

export interface ProfilEntry {
  id: string;
  title: string;
  slug: string;
  order: number;
  status: string;
  lastModified: string;
  blocks: NotionBlock[];
}

export interface KaryaEntryMeta {
  id: string;
  slug: string;
  title: string;
  creator: string;
  genres: string[];
  platform: string;
  platforms: string[];
  embedLink: string;
  embedUrl: string;
  artworkUrl: string | null;
  nim: number;
  email: string;
  submissionDate: string;
  lastEdited: string;
}

/* ------------------------------------------------------------------ */
/*  Singleton client                                                   */
/* ------------------------------------------------------------------ */

const globalForNotion = globalThis as unknown as {
  notion: Client | undefined;
};

function createNotionClient() {
  const token = process.env.NOTION_INTEGRATION_TOKEN;
  if (!token) {
    console.warn("Missing NOTION_INTEGRATION_TOKEN environment variable");
    return null;
  }
  return new Client({
    auth: token,
    notionVersion: "2026-03-11",
    fetch: (url, init) => {
      return fetch(url, {
        ...init,
        cache: "no-store",
      });
    },
  });
}

export function getNotionClient(): Client {
  if (globalForNotion.notion) {
    return globalForNotion.notion;
  }

  const client = createNotionClient();

  if (client && process.env.NODE_ENV !== "production") {
    globalForNotion.notion = client;
  }

  return client as Client;
}

function getNotionClientAny(): ReturnType<typeof getNotionClient> {
  return getNotionClient();
}

/* ------------------------------------------------------------------ */
/*  Custom linking – anchor extraction & resolution                    */
/* ------------------------------------------------------------------ */

/**
 * Resolve a `cite://doc-slug#anchor-id` reference.
 * Returns the target block so the renderer can inline its content.
 */
export async function resolveCitation(
  scope: NotionContentScope,
  slug: string,
  anchorId: string,
): Promise<{
  blocks: NotionBlock[];
  sourceSlug: string;
  sourceTitle: string;
} | null> {
  const doc =
    scope === "kkm"
      ? await fetchKKMEntryBySlug(slug)
      : scope === "events"
        ? await fetchEventBySlug(slug)
        : await fetchDocBySlug(slug);
  if (!doc) return null;

  const anchorMap = buildAnchorMap(doc.blocks);
  const blocks = anchorMap.get(anchorId);
  if (!blocks || blocks.length === 0) return null;

  return { blocks, sourceSlug: doc.meta.slug, sourceTitle: doc.meta.title };
}

/* ------------------------------------------------------------------ */
/*  Notion property helpers                                            */
/* ------------------------------------------------------------------ */
const propertyNameMapCache = new WeakMap<
  NotionPage["properties"],
  Map<string, keyof NotionPage["properties"]>
>();

function normalizePropertyName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

function getProperty(
  page: NotionPage,
  name: string,
): NotionPage["properties"][string] | undefined {
  const properties = page.properties;
  const normalizedName = normalizePropertyName(name);

  let propertyNameMap = propertyNameMapCache.get(properties);
  if (!propertyNameMap) {
    propertyNameMap = new Map();
    for (const key of Object.keys(properties)) {
      propertyNameMap.set(normalizePropertyName(key), key);
    }
    propertyNameMapCache.set(properties, propertyNameMap);
  }

  const matchedKey = propertyNameMap.get(normalizedName);
  if (matchedKey) return properties[matchedKey];

  // Try partial match if exact fails
  const target = normalizedName.replace(/[^a-z0-9]/g, "");
  for (const [normKey, actualKey] of propertyNameMap.entries()) {
    const strippedKey = normKey.replace(/[^a-z0-9]/g, "");
    if (strippedKey.includes(target) || target.includes(strippedKey)) {
      return properties[actualKey];
    }
  }

  return undefined;
}

function getTitle(page: NotionPage): string {
  for (const prop of Object.values(page.properties)) {
    if (prop.type === "title" && prop.title.length > 0) {
      return stripCustomTags(prop.title.map((t) => t.plain_text).join(""));
    }
  }
  return "Untitled";
}

function getTitleProperty(page: NotionPage, name: string): string {
  const prop = getProperty(page, name);
  if (prop?.type === "title" && prop.title.length > 0) {
    return stripCustomTags(prop.title.map((t) => t.plain_text).join(""));
  }
  return "";
}

function getRichText(page: NotionPage, name: string): string {
  const prop = getProperty(page, name);
  if (prop?.type === "rich_text") {
    return stripCustomTags(prop.rich_text.map((t) => t.plain_text).join(""));
  }
  return "";
}

function getSelect(page: NotionPage, name: string): string {
  const prop = getProperty(page, name);
  if (prop?.type === "select" && prop.select) {
    return prop.select.name;
  }
  return "";
}

function getStatus(page: NotionPage, name: string): string {
  const prop = getProperty(page, name);
  if (prop?.type === "status" && prop.status) {
    return prop.status.name;
  }
  return "";
}

function getMultiSelect(page: NotionPage, name: string): string[] {
  const prop = getProperty(page, name);
  if (prop?.type === "multi_select") {
    return prop.multi_select.map((s) => s.name);
  }
  return [];
}

function getNumber(page: NotionPage, name: string): number {
  const prop = getProperty(page, name);
  if (prop?.type === "number" && prop.number !== null) {
    return prop.number;
  }
  return 999;
}

function getCheckbox(
  page: NotionPage,
  name: string,
  defaultValue = false,
): boolean {
  const prop = getProperty(page, name);
  if (prop?.type === "checkbox") {
    return prop.checkbox;
  }
  return defaultValue;
}

function getDate(page: NotionPage, name: string): string {
  const prop = getProperty(page, name);
  if (prop?.type === "date" && prop.date) {
    return prop.date.start;
  }
  return "";
}

function getDateEnd(page: NotionPage, name: string): string {
  const prop = getProperty(page, name);
  if (prop?.type === "date" && prop.date?.end) {
    return prop.date.end;
  }
  return "";
}

function getUrl(page: NotionPage, name: string): string {
  const prop = getProperty(page, name);
  if (prop?.type === "url" && prop.url) {
    return prop.url.trim();
  }
  return "";
}

function getFormulaString(page: NotionPage, name: string): string {
  const prop = getProperty(page, name);
  if (prop?.type === "formula") {
    if (prop.formula.type === "string" && prop.formula.string) {
      return prop.formula.string.trim();
    }
    if (prop.formula.type === "date" && prop.formula.date?.start) {
      return prop.formula.date.start;
    }
  }
  return "";
}

function getFiles(page: NotionPage, name: string): string[] {
  const prop = getProperty(page, name);
  if (prop?.type !== "files") return [];
  return prop.files
    .map((file) => {
      if (file.type === "external") return file.external.url;
      if (file.type === "file") return file.file.url;
      return "";
    })
    .filter(Boolean);
}

function getCoverUrl(page: NotionPage, name = "Cover Image"): string | null {
  return getFiles(page, name)[0] ?? null;
}

function getChildPageTitle(block: NotionBlock): string {
  if (block.type !== "child_page") return "";
  const typed = block.child_page as { title?: string } | undefined;
  return (typed?.title ?? "").trim();
}

function isPreferredEventChildPage(title: string): boolean {
  const normalized = title.trim().toLowerCase();
  return /shared|share|draft|publish|published|konten|content|public|umum/.test(
    normalized,
  );
}

function findPreferredChildPage(blocks: NotionBlock[]): NotionBlock | null {
  let firstChildPage: NotionBlock | null = null;

  for (const block of blocks) {
    if (block.type === "child_page") {
      if (!firstChildPage) {
        firstChildPage = block;
      }

      if (isPreferredEventChildPage(getChildPageTitle(block))) {
        return block;
      }
    }

    if (block.children?.length) {
      const nested = findPreferredChildPage(block.children);
      if (nested) {
        return nested;
      }
    }
  }

  return firstChildPage;
}

function selectEventContentBlocks(blocks: NotionBlock[]): NotionBlock[] {
  const dropUntilAfterFirstTopLevelTable = (
    items: NotionBlock[],
  ): NotionBlock[] => {
    const firstTableIndex = items.findIndex((block) => block.type === "table");
    if (firstTableIndex < 0) return items;
    return items.slice(firstTableIndex + 1);
  };

  const preferredChildPage = findPreferredChildPage(blocks);
  if (preferredChildPage?.children?.length) {
    // Shared subpages may include internal briefing blocks before the
    // admin/KKM communication table. Hide everything up to and including
    // that first top-level table from public event rendering.
    return dropUntilAfterFirstTopLevelTable(preferredChildPage.children);
  }

  return blocks;
}

function getSlugValue(page: NotionPage, fallbackText: string): string {
  return (
    getRichText(page, "Slug") ||
    getFormulaString(page, "Slug") ||
    slugify(fallbackText)
  );
}

function getTodayInJakarta(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function isEventPublished(page: NotionPage): boolean {
  const status = getStatus(page, "Status");
  if (status) {
    return status === "Published";
  }
  const statusCms = getStatus(page, "Status Konten CMS");
  if (statusCms) {
    return statusCms === "Live";
  }
  return getCheckbox(page, "Publish", true);
}

function isEventPreviewable(page: NotionPage): boolean {
  const status = getStatus(page, "Status");
  if (status) {
    return status === "Diedit KKM";
  }
  return false;
}

function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* ------------------------------------------------------------------ */
/*  Docs database queries                                              */
/* ------------------------------------------------------------------ */

/*
const DOCS_DB_ID =
  process.env.NOTION_SEKRETARIAT_DATABASE_ID ??
  process.env.NOTION_PROJECT_DATABASE_ID ??
  "";
*/

const dataSourceIdCache = new Map<string, string>();
const childDatabaseIdCache = new Map<string, string | null>();
const warnedDatabaseIds = new Set<string>();
const registryIdCache = new Map<string, string>();
const shouldLogNotionRegistryKeys = process.env.DEBUG_NOTION_REGISTRY === "1";
let registryWarmPromise: Promise<void> | null = null;

async function warmRegistryIdCache(registryDbId: string): Promise<void> {
  if (registryIdCache.size > 0) return;
  if (registryWarmPromise) return registryWarmPromise;

  registryWarmPromise = (async () => {
    const client = getNotionClient();
    const dsId = await resolveDataSourceIdSafe(registryDbId);
    if (!dsId) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (client as any).dataSources.query({
      data_source_id: dsId,
    });

    const titles: string[] = [];
    for (const page of response.results) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const properties = (page as any).properties;
      let title = "";
      let targetId = page.id;
      const titleProp = properties["Link"] || properties["Name"];

      if (titleProp?.type === "title") {
        title = titleProp.title
          .map((t: { plain_text: string }) => t.plain_text)
          .join("")
          .trim();

        for (const t of titleProp.title) {
          if (t.type === "mention" && t.mention) {
            if (t.mention.database?.id) {
              targetId = t.mention.database.id;
              break;
            } else if (t.mention.page?.id) {
              targetId = t.mention.page.id;
              break;
            }
          }
        }
      }

      if (title) {
        titles.push(title);
        const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, "");
        registryIdCache.set(normalizedTitle, targetId);
      }
    }

    if (shouldLogNotionRegistryKeys) {
      // eslint-disable-next-line no-console
      console.log("[Notion Registry DB Keys]:", titles);
    }
  })().finally(() => {
    registryWarmPromise = null;
  });

  return registryWarmPromise;
}

function normalizeNotionId(id: string): string {
  const compact = id.replace(/-/g, "").trim();
  if (!/^[0-9a-fA-F]{32}$/.test(compact)) return id;
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

export async function resolveDatabaseId(idOrName: string): Promise<string> {
  if (!idOrName) return "";

  const cleanId = idOrName.replace(/-/g, "").trim();
  if (/^[0-9a-fA-F]{32}$/.test(cleanId)) {
    return idOrName;
  }

  const registryDbId = process.env.NOTION_DATABASE_REGISTRY_ID;
  if (!registryDbId) {
    console.error("Missing NOTION_DATABASE_REGISTRY_ID environment variable");
    return idOrName;
  }

  const normalizedSearch = idOrName.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (registryIdCache.has(normalizedSearch)) {
    return registryIdCache.get(normalizedSearch)!;
  }

  try {
    await warmRegistryIdCache(registryDbId);
    const resolved = registryIdCache.get(normalizedSearch);
    if (!resolved) {
      console.warn(
        `Database name "${idOrName}" not found in Notion Database Registry.`,
      );
      return idOrName;
    }
    return resolved;
  } catch (error) {
    console.error(
      `Error resolving database "${idOrName}" from registry:`,
      error,
    );
    return idOrName;
  }
}

const dataSourceIdPromises = new Map<string, Promise<string>>();

export async function resolveDataSourceId(id: string): Promise<string> {
  const resolvedId = await resolveDatabaseId(id);
  const normalizedId = normalizeNotionId(resolvedId);
  const compact = normalizedId.replace(/-/g, "").trim();
  if (!/^[0-9a-fA-F]{32}$/.test(compact)) {
    throw new Error(`Invalid Notion database identifier: ${id}`);
  }
  const cached = dataSourceIdCache.get(normalizedId);
  if (cached) return cached;

  if (dataSourceIdPromises.has(normalizedId)) {
    return dataSourceIdPromises.get(normalizedId)!;
  }

  const promise = (async () => {
    try {
      let database: unknown;
      let retries = 3;
      while (retries > 0) {
        try {
          database = await getNotionClient().databases.retrieve({
            database_id: normalizedId,
          });
          break; // Success
        } catch (err) {
          const isFetchFailed =
            err instanceof Error
              ? err.message.includes("fetch failed")
              : String(err).includes("fetch failed");
          if (isFetchFailed && retries > 1) {
            retries--;
            await new Promise((r) => setTimeout(r, 1000));
            continue;
          }
          throw err;
        }
      }

      const dataSourceId = (
        database as { data_sources?: Array<{ id: string }> }
      ).data_sources?.[0]?.id;

      if (!dataSourceId) {
        throw new Error(
          `Database ${normalizedId} has no queryable data source. Check integration access in Notion.`,
        );
      }

      dataSourceIdCache.set(normalizedId, dataSourceId);
      return dataSourceId;
    } catch (err) {
      const isFetchFailed =
        err instanceof Error
          ? err.message.includes("fetch failed")
          : String(err).includes("fetch failed");
      if (isFetchFailed) {
        throw err;
      }

      try {
        const dataSource = await (
          getNotionClient() as ReturnType<typeof getNotionClient>
        ).dataSources.retrieve({
          data_source_id: normalizedId,
        });
        dataSourceIdCache.set(normalizedId, dataSource.id);
        return dataSource.id;
      } catch {
        throw err;
      }
    } finally {
      dataSourceIdPromises.delete(normalizedId);
    }
  })();

  dataSourceIdPromises.set(normalizedId, promise);
  return promise;
}

export async function resolveDataSourceIdSafe(
  id: string,
): Promise<string | null> {
  try {
    return await resolveDataSourceId(id);
  } catch (error) {
    const normalizedId = normalizeNotionId(id);
    if (!warnedDatabaseIds.has(normalizedId)) {
      warnedDatabaseIds.add(normalizedId);
      console.error(
        `Notion database ${normalizedId} is unavailable. Check integration access/sharing.`,
        error,
      );
    }
    return null;
  }
}

export interface ChildDatabaseRef {
  id: string;
  title: string;
}

const KKM_PAGE_ID = process.env.NOTION_KKM_PAGE_ID ?? "";
const KKM_HERO_DATABASE_ID = process.env.NOTION_KKM_HERO_DATABASE_ID ?? "";

async function resolveChildDatabaseId(
  parentPageId: string,
  title: string,
): Promise<string | null> {
  if (!parentPageId || !title) return null;

  const cacheKey = `${normalizeNotionId(parentPageId)}:${title.toLowerCase()}`;
  if (childDatabaseIdCache.has(cacheKey)) {
    return childDatabaseIdCache.get(cacheKey) ?? null;
  }

  let cursor: string | undefined;
  try {
    do {
      const response = await getNotionClient().blocks.children.list({
        block_id: parentPageId,
        start_cursor: cursor,
        page_size: 100,
      });

      const childDatabase = (response.results as BlockObjectResponse[]).find(
        (block) => {
          return (
            block.type === "child_database" &&
            block.child_database.title.trim().toLowerCase() ===
              title.trim().toLowerCase()
          );
        },
      );

      if (childDatabase) {
        childDatabaseIdCache.set(cacheKey, childDatabase.id);
        return childDatabase.id;
      }

      cursor = response.has_more
        ? (response.next_cursor ?? undefined)
        : undefined;
    } while (cursor);
  } catch (error) {
    console.error(
      `[Notion resolveChildDatabaseId] Failed to find child database "${title}" on page ${parentPageId}:`,
      error,
    );
  }

  childDatabaseIdCache.set(cacheKey, null);
  return null;
}

function getRelationIds(page: NotionPage, name: string): string[] {
  const prop = getProperty(page, name);
  if (prop?.type === "relation" && Array.isArray(prop.relation)) {
    return prop.relation.map((r) => r.id);
  }
  return [];
}

export interface SekretariatCategory {
  id: string;
  name: string;
  description: string;
}

export const fetchSekretariatCategories = unstable_cache(
  async (categoriesDbId: string): Promise<SekretariatCategory[]> => {
    if (!categoriesDbId) return [];
    const results: NotionPage[] = [];
    let cursor: string | undefined;

    try {
      const dataSourceId = await resolveDataSourceIdSafe(categoriesDbId);
      if (!dataSourceId) throw new Error("Missing data source ID");

      do {
        const response = await getNotionClientAny().dataSources.query({
          data_source_id: dataSourceId,
          start_cursor: cursor,
        });
        results.push(...(response.results as NotionPage[]));
        cursor = response.has_more
          ? (response.next_cursor ?? undefined)
          : undefined;
      } while (cursor);
    } catch (error) {
      console.error("[Notion fetchSekretariatCategories] Query failed:", error);
      throw error;
    }

    return results.map((page) => {
      const name = getTitleProperty(page, "Name") || getTitle(page);
      const description = getRichText(page, "Deskripsi");
      return {
        id: page.id,
        name,
        description,
      };
    });
  },
  ["notion-sekretariat-categories-data"],
  { revalidate: 60, tags: ["notion-docs"] },
);

export interface SekretariatPortalData {
  docs: DocMeta[];
  categories: SekretariatCategory[];
}

export const fetchSekretariatPortalData = unstable_cache(
  async (): Promise<SekretariatPortalData> => {
    const docsDbId = DB_DOKUMEN_SEKRETARIAT;
    const categoriesDbId = DB_KATEGORI_DOKUMEN;

    if (!docsDbId) {
      return { docs: [], categories: [] };
    }

    const categories = categoriesDbId
      ? await fetchSekretariatCategories(categoriesDbId)
      : [];

    const categoryMap = new Map<string, SekretariatCategory>(
      categories.map((c) => [normalizeNotionId(c.id), c]),
    );

    const results: NotionPage[] = [];
    let cursor: string | undefined;

    try {
      const dataSourceId = await resolveDataSourceIdSafe(docsDbId);
      if (!dataSourceId) return { docs: [], categories };

      do {
        const response = await getNotionClientAny().dataSources.query({
          data_source_id: dataSourceId,
          start_cursor: cursor,
        });
        results.push(...(response.results as NotionPage[]));
        cursor = response.has_more
          ? (response.next_cursor ?? undefined)
          : undefined;
      } while (cursor);
    } catch (error) {
      console.error("[Notion fetchAllDocs] Query failed:", error);
      return { docs: [], categories };
    }

    const docs = results
      .map((page) => {
        const title =
          getTitleProperty(page, "Nama Dokumen") ||
          getTitleProperty(page, "Name") ||
          getTitle(page);

        const relationIds = getRelationIds(page, "Kategori");
        let category = "";
        if (relationIds.length > 0) {
          category =
            relationIds
              .map((id) => categoryMap.get(normalizeNotionId(id))?.name)
              .filter(Boolean)[0] || "";
        }
        if (!category) {
          category =
            getSelect(page, "Kategori") ||
            getSelect(page, "Category") ||
            "Umum";
        }

        const status =
          getStatus(page, "Status") || getStatus(page, "Status Konten CMS");
        const isPublished = status
          ? status === "Publish" || status === "Live"
          : getCheckbox(page, "Publish", true);

        return {
          id: page.id,
          slug: getRichText(page, "Slug") || page.id,
          title,
          category,
          icon: page.icon?.type === "emoji" ? page.icon.emoji : null,
          order:
            getNumber(page, "Urutan Tampil") ?? getNumber(page, "Order") ?? 999,
          createdAt: page.created_time,
          lastEdited: page.last_edited_time,
          published: isPublished,
        };
      })
      .filter((doc) => doc.published)
      .sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        const categoryCompare = (a.category || "").localeCompare(
          b.category || "",
          "id",
          {
            sensitivity: "base",
          },
        );
        if (categoryCompare !== 0) return categoryCompare;
        return a.title.localeCompare(b.title, "id", { sensitivity: "base" });
      });

    return { docs, categories };
  },
  ["notion-sekretariat-portal-data"],
  { revalidate: 60, tags: ["notion-docs"] },
);

export const fetchAllDocs = unstable_cache(
  async (): Promise<DocMeta[]> => {
    const data = await fetchSekretariatPortalData();
    return data.docs;
  },
  ["notion-all-docs"],
  { revalidate: 60, tags: ["notion-docs"] },
);

/* ------------------------------------------------------------------ */
/*  KKM database queries                                               */
/* ------------------------------------------------------------------ */

export async function resolveKKMDatabases(
  _pageId: string,
): Promise<{ heroDbId: string; groupsDbId: string }> {
  return {
    heroDbId: DB_KKM_HERO,
    groupsDbId: DB_KKM,
  };
}

export async function fetchKKMDatabaseId(_pageId: string): Promise<string> {
  return DB_KKM;
}

export const fetchKKMDatabaseIdCached = unstable_cache(
  async (_pageId: string): Promise<string> => {
    return fetchKKMDatabaseId(_pageId);
  },
  ["notion-kkm-database-id"],
  { revalidate: 60, tags: ["notion-kkm"] },
);

export async function resolveFAQDatabase(_pageId: string): Promise<string> {
  return DB_FAQ_STORAGE;
}

export const resolveFAQDatabaseCached = unstable_cache(
  async (_pageId: string): Promise<string> => {
    return resolveFAQDatabase(_pageId);
  },
  ["notion-faq-database-id"],
  { revalidate: 60, tags: ["notion-faq"] },
);

export const fetchKKMGroups = unstable_cache(
  async (): Promise<KKMGroup[]> => {
    const activeDbId = KKM_PAGE_ID
      ? await fetchKKMDatabaseIdCached(KKM_PAGE_ID)
      : "36e3b26d-c3be-8065-94be-f94365699c8d";

    if (!activeDbId) throw new Error("Missing active DB ID");

    const results: NotionPage[] = [];
    let cursor: string | undefined;

    try {
      const dataSourceId = await resolveDataSourceIdSafe(activeDbId);
      if (!dataSourceId) throw new Error("Missing data source ID");

      do {
        const response = await getNotionClientAny().dataSources.query({
          data_source_id: dataSourceId,
          start_cursor: cursor,
        });
        results.push(...(response.results as NotionPage[]));
        cursor = response.has_more
          ? (response.next_cursor ?? undefined)
          : undefined;
      } while (cursor);
    } catch (error) {
      console.error("[Notion fetchKKMGroups] Query failed:", error);
      throw error;
    }

    const groups: KKMGroup[] = [];

    for (const page of results) {
      const name = (
        getTitleProperty(page, "Name") ||
        getTitleProperty(page, "Nama Unit KKM") ||
        getTitle(page)
      ).trim();
      if (!name) {
        continue;
      }

      const status = getStatus(page, "Status Konten CMS");
      if (status && status !== "Live") continue;

      const tagline = getRichText(page, "Jargon") || "";
      const description = getRichText(page, "Deskripsi Singkat") || "";

      const logoUrl = getFiles(page, "Logo")[0] || null;
      const fotoUrl = getFiles(page, PROP_KKM.FOTO_KKM)[0] || null;
      const instagram = getUrl(page, "Instagram") || "";
      const tiktok = getUrl(page, "TikTok") || "";
      const youtube = getUrl(page, "YouTube") || "";
      const lainnya = getUrl(page, PROP_KKM.LAINNYA) || "";

      let socialLinks = [instagram, tiktok, youtube, lainnya].filter(Boolean);
      if (socialLinks.length === 0) {
        const contacts =
          getRichText(page, "Kontak Unit") ||
          getRichText(page, "Link Sosmed") ||
          getUrl(page, "Link Sosmed");
        socialLinks = contacts
          .split(/\r?\n/)
          .map((item) => item.trim())
          .filter(Boolean);
      }

      const order =
        getNumber(page, "Urutan") ??
        getNumber(page, "Urutan Tampil") ??
        getNumber(page, "Order") ??
        999;

      groups.push({
        id: page.id,
        slug: getRichText(page, "Slug") || slugify(name),
        name,
        tagline,
        description,
        logoUrl,
        fotoUrl,
        instagram,
        tiktok,
        youtube,
        lainnya,
        socialLinks,
        order,
      });
    }

    groups.sort((a, b) => {
      const orderA = a.order ?? 999;
      const orderB = b.order ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name, "id", { sensitivity: "base" });
    });

    return groups;
  },
  ["notion-kkm-groups"],
  { revalidate: 60, tags: ["notion-kkm"] },
);

export interface KKMHeroData {
  title: string;
  description: string;
}

export interface KKMModularData {
  hero: KKMHeroData;
  groups: KKMGroup[];
}

export async function fetchKKMModularData(
  _pageId: string,
): Promise<KKMModularData> {
  const data: KKMModularData = {
    hero: {
      title: "KKM HIMA MUSIK",
      description:
        "Delapan komunitas kreatif di bawah naungan HIMA MUSIK ISI Yogyakarta. Temukan keluarga bermusikmu, kembangkan potensi, dan ciptakan karya bersama.",
    },
    groups: [],
  };

  const heroDbId =
    KKM_HERO_DATABASE_ID ||
    (KKM_PAGE_ID ? await resolveChildDatabaseId(KKM_PAGE_ID, DB_KKM_HERO) : "");

  // 1. Fetch KKM: Hero Section if found
  if (heroDbId) {
    try {
      const dataSourceId = await resolveDataSourceIdSafe(heroDbId);
      if (dataSourceId) {
        const response = await getNotionClientAny().dataSources.query({
          data_source_id: dataSourceId,
        });

        for (const page of response.results as NotionPage[]) {
          const name = (getTitleProperty(page, "Name") || getTitle(page))
            .trim()
            .toLowerCase();
          const value = getRichText(page, "Value");
          if (name.includes("title")) {
            data.hero.title = value;
          } else if (name.includes("desc")) {
            data.hero.description = value;
          }
        }
      }
    } catch (error) {
      console.warn(
        "[Notion fetchKKMModularData] Failed to fetch KKM Hero Section, using default",
        error,
      );
    }
  }

  // 2. Fetch KKM Groups
  data.groups = await fetchKKMGroups();

  return data;
}

export const fetchKKMModularDataCached = unstable_cache(
  async (pageId: string): Promise<KKMModularData> => {
    return fetchKKMModularData(pageId);
  },
  ["notion-kkm-modular-data"],
  { revalidate: 60, tags: ["notion-kkm"] },
);

export const fetchKKMEntryBySlug = cache(
  async (
    slug: string,
  ): Promise<{ meta: DocMeta; blocks: NotionBlock[] } | null> => {
    const activeDbId = DB_KKM;

    if (!activeDbId) return null;

    const normalizedSlug = slug.trim().toLowerCase();
    let matchedPage: NotionPage | undefined;
    let cursor: string | undefined;

    try {
      const dataSourceId = await resolveDataSourceIdSafe(activeDbId);
      if (!dataSourceId) return null;

      do {
        const response = await getNotionClientAny().dataSources.query({
          data_source_id: dataSourceId,
          start_cursor: cursor,
        });

        const page = (response.results as NotionPage[]).find((entry) => {
          const name = (
            getTitleProperty(entry, "Name") ||
            getTitleProperty(entry, "Nama Unit KKM") ||
            getTitle(entry)
          ).trim();
          const entrySlug = (getRichText(entry, "Slug") || slugify(name))
            .trim()
            .toLowerCase();
          return entrySlug === normalizedSlug;
        });

        if (page) {
          matchedPage = page;
          break;
        }

        cursor = response.has_more
          ? (response.next_cursor ?? undefined)
          : undefined;
      } while (cursor);
    } catch (error) {
      console.error("[Notion fetchKKMEntryBySlug] Query failed:", error);
      throw error;
    }

    if (!matchedPage) return null;

    const name = (
      getTitleProperty(matchedPage, "Name") ||
      getTitleProperty(matchedPage, "Nama Unit KKM") ||
      getTitle(matchedPage)
    ).trim();
    const entrySlug = (
      getRichText(matchedPage, "Slug") || slugify(name)
    ).trim();
    const blocks = await fetchAllBlocks(matchedPage.id);

    return {
      meta: {
        id: matchedPage.id,
        slug: entrySlug,
        title: name,
        category: "KKM",
        icon:
          matchedPage.icon?.type === "emoji" ? matchedPage.icon.emoji : null,
        order: 999,
        createdAt: matchedPage.created_time,
        lastEdited: matchedPage.last_edited_time,
        published: true,
      },
      blocks,
    };
  },
);

function mapEventPage(page: NotionPage, today: string): EventEntryMeta {
  const title =
    getTitleProperty(page, "Nama Acara") ||
    getTitleProperty(page, "Judul Tayangan") ||
    getTitleProperty(page, "Name") ||
    getTitle(page);
  const slug =
    getRichText(page, "Request Slug Khusus") || getSlugValue(page, title);
  const eventDate =
    getDate(page, "Tanggal Acara") ||
    getDate(page, "Event Date") ||
    getDate(page, "Date");
  const eventDateEnd =
    getDateEnd(page, "Tanggal Acara") ||
    getDateEnd(page, "Event Date") ||
    getDateEnd(page, "Date");
  const sourceLink = getUrl(page, "Source Link");
  const sourceName = getRichText(page, "Source Name");
  const isRepost = getCheckbox(page, "Repost", false);
  const entryKind =
    getSelect(page, "Tipe Acara") ||
    getSelect(page, "Entry Kind") ||
    (eventDate ? "Event" : "Announcement");
  const lifecycle = classifyEventLifecycle(
    entryKind,
    { start: eventDate, end: eventDateEnd },
    today,
  );
  const ownerUnit =
    getRichText(page, "KKM Pengusul") || getSelect(page, "Owner Unit");

  const createdAt =
    page.properties["Submission time"]?.type === "created_time"
      ? page.properties["Submission time"].created_time
      : page.created_time;

  return {
    id: page.id,
    slug,
    title,
    category: "Events",
    icon: page.icon?.type === "emoji" ? page.icon.emoji : null,
    order: 999,
    createdAt: createdAt,
    lastEdited: page.last_edited_time,
    published: isEventPublished(page),
    summary:
      getRichText(page, "Deskripsi Singkat Acara") ||
      getRichText(page, "Summary"),
    ownerUnit,
    entryKind,
    eventDate,
    eventDateEnd,
    location:
      getRichText(page, "Lokasi Acara") ||
      getRichText(page, "Lokasi") ||
      getRichText(page, "Location"),
    registrationLink: getUrl(page, "Registration Link"),
    sourceLink,
    sourceName,
    isRepost,
    coverImageUrl: getFiles(page, "Gambar")[0] || getCoverUrl(page),
    lifecycle,
  };
}

function sortEventEntries(
  entries: EventEntryMeta[],
  lifecycle: EventLifecycle,
) {
  return [...entries].sort((a, b) => {
    const sortA =
      lifecycle === "announcement" || lifecycle === "timeless"
        ? getEventDateSortValue(a.lastEdited)
        : getEventDateSortValue(
            a.eventDate,
            a.eventDateEnd,
            lifecycle === "past",
          );
    const sortB =
      lifecycle === "announcement" || lifecycle === "timeless"
        ? getEventDateSortValue(b.lastEdited)
        : getEventDateSortValue(
            b.eventDate,
            b.eventDateEnd,
            lifecycle === "past",
          );

    if (sortA !== sortB) {
      return lifecycle === "past" ? sortB - sortA : sortA - sortB;
    }

    return a.title.localeCompare(b.title, "id", { sensitivity: "base" });
  });
}

/* ------------------------------------------------------------------ */
/*  Karya database queries                                              */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Karya database queries                                              */
/* ------------------------------------------------------------------ */

async function resolveKaryaMediaDetails(
  platformSelects: string[],
  embedLink: string,
): Promise<{ embedUrl: string; artworkUrl: string | null }> {
  const details = {
    embedUrl: embedLink,
    artworkUrl: null as string | null,
  };

  if (!embedLink) return details;

  const url = embedLink.trim();

  // Match platform from URL
  const isYouTube = /youtube\.com|youtu\.be/i.test(url);
  const isSpotify = /spotify\.com/i.test(url);
  const isSoundCloud = /soundcloud\.com/i.test(url);
  const isAppleMusic = /music\.apple\.com/i.test(url);

  if (isYouTube) {
    const ytRegex =
      /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(ytRegex);
    const videoId = match ? match[1] : null;
    if (videoId) {
      details.embedUrl = `https://www.youtube.com/embed/${videoId}`;
      details.artworkUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    }
  } else if (isSpotify) {
    if (url.includes("open.spotify.com/")) {
      details.embedUrl = url.replace(
        "open.spotify.com/",
        "open.spotify.com/embed/",
      );
    }
    try {
      const res = await fetch(
        `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`,
      );
      if (res.ok) {
        const data = await res.json();
        details.artworkUrl = data.thumbnail_url || null;
      }
    } catch (err) {
      console.error(
        "[Notion resolveKaryaMediaDetails] Spotify oEmbed error:",
        err,
      );
    }
  } else if (isSoundCloud) {
    details.embedUrl = `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%23d4a64d&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=true`;
    try {
      const res = await fetch(
        `https://soundcloud.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      );
      if (res.ok) {
        const data = await res.json();
        details.artworkUrl = data.thumbnail_url || null;
      }
    } catch (err) {
      console.error(
        "[Notion resolveKaryaMediaDetails] SoundCloud oEmbed error:",
        err,
      );
    }
  } else if (isAppleMusic) {
    if (url.includes("music.apple.com/")) {
      details.embedUrl = url.replace(
        "music.apple.com/",
        "embed.music.apple.com/",
      );
    }
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (res.ok) {
        const html = await res.text();
        const match =
          html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) ||
          html.match(/<meta\s+content="([^"]+)"\s+property="og:image"/i);
        if (match) {
          details.artworkUrl = match[1];
        }
      }
    } catch (err) {
      console.error(
        "[Notion resolveKaryaMediaDetails] Apple Music error:",
        err,
      );
    }
  }

  return details;
}

export async function fetchKaryaDatabaseId(_pageId: string): Promise<string> {
  return DB_KARYA_FORM_STORAGE;
}

export const fetchKaryaDatabaseIdCached = unstable_cache(
  async (_pageId: string): Promise<string> => {
    return fetchKaryaDatabaseId(_pageId);
  },
  ["notion-karya-database-id"],
  { revalidate: 60, tags: ["notion-karya"] },
);

export async function fetchAduanDatabaseId(_pageId: string): Promise<string> {
  return DB_ADUAN_STORAGE;
}

export const fetchAduanDatabaseIdCached = unstable_cache(
  async (_pageId: string): Promise<string> => {
    return fetchAduanDatabaseId(_pageId);
  },
  ["notion-aduan-database-id"],
  { revalidate: 60, tags: ["notion-aduan"] },
);

export const fetchKaryaEntries = unstable_cache(
  async (): Promise<KaryaEntryMeta[]> => {
    const { resolveKaryaDatabaseIdFromCms } = await import("./notion-builder");
    const karyaDbId = await resolveKaryaDatabaseIdFromCms();
    if (!karyaDbId) {
      console.warn(
        "[Notion fetchKaryaEntries] Could not resolve Karya database ID from Container CMS",
      );
      return [];
    }

    const results: NotionPage[] = [];
    let cursor: string | undefined;

    try {
      const dataSourceId = await resolveDataSourceIdSafe(karyaDbId);
      if (!dataSourceId) throw new Error("Missing data source ID");

      do {
        const response = await getNotionClientAny().dataSources.query({
          data_source_id: dataSourceId,
          start_cursor: cursor,
        });
        results.push(...(response.results as NotionPage[]));
        cursor = response.has_more
          ? (response.next_cursor ?? undefined)
          : undefined;
      } while (cursor);
    } catch (error) {
      console.error("[Notion fetchKaryaEntries] Query failed:", error);
      throw error;
    }

    const filteredPages = results.filter((page) => {
      const status =
        getStatus(page, "Status") || getStatus(page, "Status Konten CMS");
      return status
        ? status === "Published" || status === "Publish" || status === "Live"
        : true;
    });

    const parsedEntries = await Promise.all(
      filteredPages.map(async (page) => {
        const title =
          getTitleProperty(page, "Band/Artist dan Judul Karya / Tayangan") ||
          getTitleProperty(page, "Judul Karya / Tayangan") ||
          getTitle(page);
        const slug = getSlugValue(page, title);
        const creator = getRichText(page, "Pencipta / Penampil");
        const genres = getMultiSelect(page, "Genre / Jenis Karya");
        const platforms = getMultiSelect(page, "Platform Utama");
        const embedLink = getUrl(page, "Link Embed Utama (Full URL)");
        const nim = getNumber(page, "NIM Penanggung Jawab");

        const emailProp = page.properties["Email"];
        const email =
          emailProp?.type === "email" && emailProp.email ? emailProp.email : "";

        const submissionTimeProp = page.properties["Submission time"];
        const submissionDate =
          submissionTimeProp?.type === "created_time"
            ? submissionTimeProp.created_time.split("T")[0]
            : page.created_time.split("T")[0];

        // Resolve media player details (embed and artwork)
        const media = await resolveKaryaMediaDetails(platforms, embedLink);

        return {
          id: page.id,
          slug,
          title,
          creator,
          genres,
          platform: platforms[0] || "",
          platforms,
          embedLink,
          embedUrl: media.embedUrl,
          artworkUrl: media.artworkUrl,
          nim,
          email,
          submissionDate,
          lastEdited: page.last_edited_time,
        };
      }),
    );

    return parsedEntries.sort(
      (a, b) =>
        new Date(b.submissionDate).getTime() -
        new Date(a.submissionDate).getTime(),
    );
  },
  ["notion-karya-entries"],
  { revalidate: 60, tags: ["notion-karya"] },
);

async function getActiveAgendaDbId(): Promise<string> {
  return DB_AGENDA_FORM_STORAGE;
}

export const fetchEventsCollection = unstable_cache(
  async (): Promise<EventsCollection> => {
    const emptyCollection: EventsCollection = {
      upcoming: [],
      ongoing: [],
      past: [],
      announcements: [],
    };

    const activeDbId = await getActiveAgendaDbId();
    if (!activeDbId) return emptyCollection;

    const today = getTodayInJakarta();
    const results: NotionPage[] = [];
    let cursor: string | undefined;

    try {
      const dataSourceId = await resolveDataSourceIdSafe(activeDbId);
      if (!dataSourceId) return emptyCollection;

      do {
        const response = await getNotionClientAny().dataSources.query({
          data_source_id: dataSourceId,
          start_cursor: cursor,
        });
        results.push(...(response.results as NotionPage[]));
        cursor = response.has_more
          ? (response.next_cursor ?? undefined)
          : undefined;
      } while (cursor);
    } catch (error) {
      console.error("[Notion fetchEventsCollection] Query failed:", error);
      return emptyCollection;
    }

    const entries = results
      .filter((page) => isEventPublished(page))
      .map((page) => mapEventPage(page, today));

    return {
      upcoming: sortEventEntries(
        entries.filter((entry) => entry.lifecycle === "upcoming"),
        "upcoming",
      ),
      ongoing: sortEventEntries(
        entries.filter((entry) => entry.lifecycle === "ongoing"),
        "ongoing",
      ),
      past: sortEventEntries(
        entries.filter((entry) => entry.lifecycle === "past"),
        "past",
      ),
      announcements: sortEventEntries(
        entries.filter((entry) => entry.lifecycle === "announcement"),
        "announcement",
      ),
    };
  },
  ["notion-events-collection"],
  { revalidate: 60, tags: ["notion-events"] },
);

export const fetchAllEventEntries = unstable_cache(
  async (): Promise<EventEntryMeta[]> => {
    const collection = await fetchEventsCollection();
    return [
      ...collection.upcoming,
      ...collection.ongoing,
      ...collection.past,
      ...collection.announcements,
    ];
  },
  ["notion-events-all"],
  { revalidate: 60, tags: ["notion-events"] },
);

export const fetchEventBySlug = cache(
  async (
    slug: string,
    options?: { allowPreview?: boolean },
  ): Promise<{ meta: EventEntryMeta; blocks: NotionBlock[] } | null> => {
    const activeDbId = await getActiveAgendaDbId();
    if (!activeDbId) return null;

    const normalizedSlug = slug.trim().toLowerCase();
    const today = getTodayInJakarta();

    let matchedPage: NotionPage | undefined;
    let cursor: string | undefined;

    try {
      const dataSourceId = await resolveDataSourceIdSafe(activeDbId);
      if (!dataSourceId) return null;

      do {
        const response = await getNotionClientAny().dataSources.query({
          data_source_id: dataSourceId,
          start_cursor: cursor,
        });

        const page = (response.results as NotionPage[]).find((entry) => {
          const title =
            getTitleProperty(entry, "Nama Acara") ||
            getTitleProperty(entry, "Judul Tayangan") ||
            getTitleProperty(entry, "Name") ||
            getTitle(entry);
          const entrySlug = (
            getRichText(entry, "Request Slug Khusus") ||
            getSlugValue(entry, title)
          )
            .trim()
            .toLowerCase();

          const isPublished = isEventPublished(entry);
          const isPreviewable = options?.allowPreview
            ? isEventPreviewable(entry)
            : false;

          return entrySlug === normalizedSlug && (isPublished || isPreviewable);
        });

        if (page) {
          matchedPage = page;
          break;
        }

        cursor = response.has_more
          ? (response.next_cursor ?? undefined)
          : undefined;
      } while (cursor);
    } catch (error) {
      console.error("[Notion fetchEventBySlug] Query failed:", error);
      throw error;
    }

    if (!matchedPage) return null;

    const rootBlocks = await fetchAllBlocks(matchedPage.id);
    const blocks = selectEventContentBlocks(rootBlocks);

    return {
      meta: mapEventPage(matchedPage, today),
      blocks,
    };
  },
);

export async function fetchEventCoverUrlBySlug(
  slug: string,
): Promise<string | null> {
  const activeDbId = await getActiveAgendaDbId();
  if (!activeDbId) return null;

  const normalizedSlug = slug.trim().toLowerCase();
  let cursor: string | undefined;

  try {
    const dataSourceId = await resolveDataSourceIdSafe(activeDbId);
    if (!dataSourceId) return null;

    do {
      const response = await getNotionClientAny().dataSources.query({
        data_source_id: dataSourceId,
        start_cursor: cursor,
      });

      const page = (response.results as NotionPage[]).find((entry) => {
        const title =
          getTitleProperty(entry, "Nama Acara") ||
          getTitleProperty(entry, "Judul Tayangan") ||
          getTitleProperty(entry, "Name") ||
          getTitle(entry);
        const entrySlug = (
          getRichText(entry, "Request Slug Khusus") ||
          getSlugValue(entry, title)
        )
          .trim()
          .toLowerCase();
        return entrySlug === normalizedSlug && isEventPublished(entry);
      });

      if (page) {
        return getFiles(page, "Gambar")[0] || getCoverUrl(page);
      }

      cursor = response.has_more
        ? (response.next_cursor ?? undefined)
        : undefined;
    } while (cursor);
  } catch (error) {
    console.error("[Notion fetchEventCoverUrlBySlug] Query failed:", error);
  }

  return null;
}

export const fetchDocBySlug = cache(
  async (
    slug: string,
  ): Promise<{ meta: DocMeta; blocks: NotionBlock[] } | null> => {
    const docsDbId = DB_DOKUMEN_SEKRETARIAT;
    const categoriesDbId = DB_KATEGORI_DOKUMEN;

    if (!docsDbId) return null;

    const categories = categoriesDbId
      ? await fetchSekretariatCategories(categoriesDbId)
      : [];

    const categoryMap = new Map<string, SekretariatCategory>(
      categories.map((c) => [normalizeNotionId(c.id), c]),
    );

    const normalizedSlug = slug.trim().toLowerCase();
    let matchedPage: NotionPage | undefined;
    let cursor: string | undefined;

    try {
      const dataSourceId = await resolveDataSourceIdSafe(docsDbId);
      if (!dataSourceId) return null;

      do {
        const response = await getNotionClientAny().dataSources.query({
          data_source_id: dataSourceId,
          start_cursor: cursor,
        });

        const page = (response.results as NotionPage[]).find((entry) => {
          const entrySlug = (getRichText(entry, "Slug") || entry.id)
            .trim()
            .toLowerCase();
          const status =
            getStatus(entry, "Status") || getStatus(entry, "Status Konten CMS");
          const published = status
            ? status === "Publish" || status === "Live"
            : getCheckbox(entry, "Publish", true);
          return entrySlug === normalizedSlug && published;
        });

        if (page) {
          matchedPage = page;
          break;
        }

        cursor = response.has_more
          ? (response.next_cursor ?? undefined)
          : undefined;
      } while (cursor);
    } catch (error) {
      console.error("[Notion fetchDocBySlug] Query failed:", error);
      throw error;
    }

    const page = matchedPage;
    if (!page) return null;

    const blocks = await fetchAllBlocks(page.id);
    const title =
      getTitleProperty(page, "Nama Dokumen") ||
      getTitleProperty(page, "Name") ||
      getTitle(page);

    const relationIds = getRelationIds(page, "Kategori");
    let category = "";
    if (relationIds.length > 0) {
      category =
        relationIds
          .map((id) => categoryMap.get(normalizeNotionId(id))?.name)
          .filter(Boolean)[0] || "";
    }
    if (!category) {
      category =
        getSelect(page, "Kategori") || getSelect(page, "Category") || "Umum";
    }

    const status =
      getStatus(page, "Status") || getStatus(page, "Status Konten CMS");
    const isPublished = status
      ? status === "Publish" || status === "Live"
      : getCheckbox(page, "Publish", true);

    return {
      meta: {
        id: page.id,
        slug: getRichText(page, "Slug") || page.id,
        title,
        category,
        icon: page.icon?.type === "emoji" ? page.icon.emoji : null,
        order:
          getNumber(page, "Urutan Tampil") ?? getNumber(page, "Order") ?? 999,
        createdAt: page.created_time,
        lastEdited: page.last_edited_time,
        published: isPublished,
      },
      blocks,
    };
  },
);

/* ------------------------------------------------------------------ */
/*  Block fetching (recursive for children)                            */
/* ------------------------------------------------------------------ */

export const fetchAllBlocks = cache(
  async (blockId: string): Promise<NotionBlock[]> => {
    const blocks: NotionBlock[] = [];
    let cursor: string | undefined;

    try {
      do {
        const response = await getNotionClient().blocks.children.list({
          block_id: blockId,
          start_cursor: cursor,
          page_size: 100,
        });

        for (const rawBlock of response.results as BlockObjectResponse[]) {
          const block: NotionBlock = { ...rawBlock };
          if (block.has_children) {
            block.children = await fetchAllBlocks(block.id);
          }
          blocks.push(block);
        }

        cursor = response.has_more
          ? (response.next_cursor ?? undefined)
          : undefined;
      } while (cursor);
    } catch (error) {
      console.error("[Notion fetchAllBlocks] Query failed:", error);
    }

    return blocks;
  },
);

/* ------------------------------------------------------------------ */
/*  Search across all docs                                             */
/* ------------------------------------------------------------------ */

export async function searchDocs(query: string): Promise<
  Array<{
    id: string;
    title: string;
    slug: string;
    category: string;
    highlight: string;
  }>
> {
  if (!query.trim()) return [];

  try {
    const response = await getNotionClient().search({
      query,
      filter: { value: "page", property: "object" },
      page_size: 10,
    });

    const results: Array<{
      id: string;
      title: string;
      slug: string;
      category: string;
      highlight: string;
    }> = [];

    for (const page of response.results as NotionPage[]) {
      const title =
        getTitleProperty(page, "Nama Dokumen") ||
        getTitleProperty(page, "Name") ||
        getTitle(page);
      const slug = getRichText(page, "Slug") || page.id;
      const category =
        getSelect(page, "Kategori") || getSelect(page, "Category");

      results.push({
        id: page.id,
        title,
        slug,
        category,
        highlight: title,
      });
    }

    return results;
  } catch (error) {
    console.error("[Notion searchDocs] Search failed:", error);
    throw error;
  }
}

/* ------------------------------------------------------------------ */
/*  Beranda & Profil database resolution helpers                       */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Modular Beranda database queries                                  */
/* ------------------------------------------------------------------ */

export interface BerandaModularItem {
  id: string;
  buttonTitle: string;
  description: string;
  visible: boolean;
  redirect: string;
  urutan: number;
}

export interface BerandaModularData {
  heroSection: BerandaModularItem[];
  jelajahi: BerandaModularItem[];
}

export async function fetchModularDatabase(
  dbId: string,
): Promise<BerandaModularItem[]> {
  const dataSourceId = await resolveDataSourceIdSafe(dbId);
  if (!dataSourceId) throw new Error("Missing data source ID");

  const results: NotionPage[] = [];
  let cursor: string | undefined;

  try {
    do {
      const response = await getNotionClientAny().dataSources.query({
        data_source_id: dataSourceId,
        start_cursor: cursor,
      });
      results.push(...(response.results as NotionPage[]));
      cursor = response.has_more
        ? (response.next_cursor ?? undefined)
        : undefined;
    } while (cursor);
  } catch (error) {
    console.error(
      `[Notion fetchModularDatabase] Query failed for ${dbId}:`,
      error,
    );
    throw error;
  }

  return results
    .map((page) => {
      const buttonTitle =
        getTitleProperty(page, "Button Title") ||
        getTitleProperty(page, "Name") ||
        getTitle(page);
      const description = getRichText(page, "Description");
      const visible = getCheckbox(page, "Visible", true);
      const redirect = getRichText(page, "Redirect");
      const urutan =
        getNumber(page, "Urutan") !== 999
          ? getNumber(page, "Urutan")
          : getNumber(page, "Urutan Tampil") !== 999
            ? getNumber(page, "Urutan Tampil")
            : 999;

      return {
        id: page.id,
        buttonTitle,
        description,
        visible,
        redirect,
        urutan,
      };
    })
    .filter((item) => item.visible)
    .sort((a, b) => a.urutan - b.urutan);
}

export async function fetchBerandaModularData(
  _pageId: string,
): Promise<BerandaModularData> {
  const data: BerandaModularData = {
    heroSection: [],
    jelajahi: [],
  };

  const [heroItems, jelajahiItems] = await Promise.all([
    fetchModularDatabase(DB_BERANDA_HERO),
    fetchModularDatabase(DB_BERANDA_JELAJAHI),
  ]);

  data.heroSection = heroItems;
  data.jelajahi = jelajahiItems;

  return data;
}

export const fetchBerandaModularDataCached = unstable_cache(
  async (pageId: string): Promise<BerandaModularData> => {
    return fetchBerandaModularData(pageId);
  },
  ["notion-beranda-modular-data"],
  { revalidate: 60, tags: ["notion-beranda"] },
);

/* ------------------------------------------------------------------ */
/*  Modular Profil database queries                                   */
/* ------------------------------------------------------------------ */

export interface ProfilModularExecutive {
  role: string;
  name: string;
}

export interface ProfilModularDivision {
  name: string;
  members: Array<string | { name: string; isKepala?: boolean }>;
  slots: number;
  openPositions: string[];
}

export interface ProfilModularData {
  paragraph: string;
  cabinetName: string;
  executives: ProfilModularExecutive[];
  divisions: ProfilModularDivision[];
}

export interface ProfilOrgQuery {
  sdmDatabaseId: string;
  maxBatch?: number;
}

export async function fetchProfilOrgStructure(
  query: ProfilOrgQuery,
): Promise<ProfilModularData> {
  const data: ProfilModularData = {
    paragraph: "",
    cabinetName: "",
    executives: [],
    divisions: [],
  };

  const sdmDatabaseId = normalizeNotionId(query.sdmDatabaseId?.trim() ?? "");
  if (!sdmDatabaseId) return data;

  const maxBatch = query.maxBatch ?? 999;

  try {
    const sdmDataSourceId = await resolveDataSourceIdSafe(sdmDatabaseId);
    const sdmPages: NotionPage[] = [];
    if (sdmDataSourceId) {
      let cursor: string | undefined;
      do {
        const response = await getNotionClientAny().dataSources.query({
          data_source_id: sdmDataSourceId,
          start_cursor: cursor,
        });
        sdmPages.push(...(response.results as NotionPage[]));
        cursor = response.has_more
          ? (response.next_cursor ?? undefined)
          : undefined;
      } while (cursor);
    }

    const batchMap = await fetchBatchMap();

    // Filter by Keaktifan and Batch
    const filteredMembers = sdmPages.filter((page) => {
      const status = getSelect(page, "Status Keaktifan");
      if (
        status === "Diberhentikan" ||
        status === "Demisioner" ||
        status === "Cuti"
      ) {
        return false;
      }

      const relatedBatchIds = getRelationIds(page, "03 Batch Pendaftaran");
      const relatedBatch = relatedBatchIds
        .map((id) => batchMap[id])
        .find(Boolean);
      const batchNum = relatedBatch ? relatedBatch.batchNum : 0;
      return batchNum <= maxBatch;
    });

    // Collect all referenced division IDs, role IDs, and job type IDs
    const divIds = new Set<string>();
    const roleIds = new Set<string>();
    const tipeJabatanIds = new Set<string>();
    for (const page of filteredMembers) {
      const propDiv =
        getProperty(page, "02 Struktur Organisasi") ||
        getProperty(page, "Divisi");
      if (propDiv?.type === "relation") {
        propDiv.relation.forEach((r: { id: string }) => divIds.add(r.id));
      }
      const propRole = getProperty(page, "04 Nama Jabatan");
      if (propRole?.type === "relation") {
        propRole.relation.forEach((r: { id: string }) => roleIds.add(r.id));
      }
      const propTipe = getProperty(page, "04 Tipe Jabatan");
      if (propTipe?.type === "relation") {
        propTipe.relation.forEach((r: { id: string }) =>
          tipeJabatanIds.add(r.id),
        );
      }
    }

    // Fetch referenced titles in parallel
    const divisionMap = new Map<string, string>();
    const namaJabatanMap = new Map<string, string>();
    const tipeJabatanMap = new Map<string, string>();

    const fetchTitle = async (id: string, map: Map<string, string>) => {
      try {
        const page = (await getNotionClient().pages.retrieve({
          page_id: id,
        })) as { properties: NotionPage["properties"] };
        const titleProp = Object.values(page.properties).find(
          (p) => p.type === "title",
        ) as { title?: Array<{ plain_text: string }> } | undefined;
        const name = titleProp?.title?.[0]?.plain_text || "Unnamed";
        map.set(id, name);
      } catch (err) {
        console.error(`Failed to fetch title for page ${id}:`, err);
      }
    };

    await Promise.all([
      ...Array.from(divIds).map((id) => fetchTitle(id, divisionMap)),
      ...Array.from(roleIds).map((id) => fetchTitle(id, namaJabatanMap)),
      ...Array.from(tipeJabatanIds).map((id) => fetchTitle(id, tipeJabatanMap)),
    ]);

    // Map members to a clean structure
    const parsedMembers = filteredMembers.map((page) => {
      const name =
        getTitleProperty(page, "Nama Lengkap Staf") || getTitle(page);

      const roleRelationIds = getRelationIds(page, "04 Nama Jabatan");
      const roles = roleRelationIds
        .map((id) => namaJabatanMap.get(id) || "")
        .filter(Boolean);

      const typeRelationIds = getRelationIds(page, "04 Tipe Jabatan");
      const types = typeRelationIds
        .map((id) => tipeJabatanMap.get(id) || "")
        .filter(Boolean);
      const isKepala = types.some((t) =>
        t.toLowerCase().includes("kepala divisi"),
      );

      const status = getSelect(page, "Status Keaktifan");

      const divProp =
        getProperty(page, "02 Struktur Organisasi") ||
        getProperty(page, "Divisi");
      const divPageId =
        divProp?.type === "relation" ? divProp.relation?.[0]?.id : null;
      const divisionName = divPageId ? divisionMap.get(divPageId) || "" : "";

      const isOpen =
        status === "Rekrutmen" ||
        name.toLowerCase().includes("[open position]");

      return {
        id: page.id,
        name,
        roles,
        divisionName,
        isOpen,
        isKepala,
      };
    });

    // Separate BPH vs Divisions
    const bphMembers = parsedMembers.filter(
      (m) =>
        m.divisionName.toLowerCase() === "bph" ||
        m.roles.some((r) => /ketua|wakil|sekretaris|bendahara/i.test(r)),
    );
    const divisionMembers = parsedMembers.filter(
      (m) =>
        m.divisionName.toLowerCase() !== "bph" &&
        !m.roles.some((r) => /ketua|wakil|sekretaris|bendahara/i.test(r)),
    );

    // Map executives for OrgChart
    const execMap = new Map<string, string>();

    // Symmetrically determine BPH role limits by looking at entire sdmPages data structure
    const isRoleInBatchRange = (roleRegex: RegExp) => {
      return sdmPages.some((page) => {
        const roles = getMultiSelect(page, "Jabatan Kabinet");
        const relatedBatchIds = getRelationIds(page, "03 Batch Pendaftaran");
        const relatedBatch = relatedBatchIds
          .map((id) => batchMap[id])
          .find(Boolean);
        const batchNum = relatedBatch ? relatedBatch.batchNum : 999;
        return roles.some((r) => roleRegex.test(r)) && batchNum <= maxBatch;
      });
    };

    if (isRoleInBatchRange(/ketua/i))
      execMap.set("ketua", "[OPEN POSITION] - Ketua");
    if (isRoleInBatchRange(/wakil/i))
      execMap.set("wakil", "[OPEN POSITION] - Wakil Ketua");
    if (isRoleInBatchRange(/sekretaris/i))
      execMap.set("sekretaris", "[OPEN POSITION] - Sekretaris");
    if (isRoleInBatchRange(/sekretaris muda|co-sekretaris/i))
      execMap.set("co-sekretaris", "[OPEN POSITION] - Co-Sekretaris");
    if (isRoleInBatchRange(/bendahara/i))
      execMap.set("bendahara", "[OPEN POSITION] - Bendahara");
    if (isRoleInBatchRange(/bendahara muda|co-bendahara/i))
      execMap.set("co-bendahara", "[OPEN POSITION] - Co-Bendahara");

    // Populate roles
    for (const m of bphMembers) {
      for (const r of m.roles) {
        const lower = r.toLowerCase();
        if (lower === "ketua") {
          execMap.set("ketua", m.name);
        } else if (lower.includes("wakil")) {
          execMap.set("wakil", m.name);
        } else if (lower === "sekretaris") {
          execMap.set("sekretaris", m.name);
        } else if (
          lower.includes("sekretaris muda") ||
          lower.includes("co-sekretaris")
        ) {
          execMap.set("co-sekretaris", m.name);
        } else if (lower === "bendahara") {
          execMap.set("bendahara", m.name);
        } else if (
          lower.includes("bendahara muda") ||
          lower.includes("co-bendahara")
        ) {
          execMap.set("co-bendahara", m.name);
        }
      }
    }

    data.executives = [];
    if (execMap.has("ketua"))
      data.executives.push({
        role: "Ketua Himpunan",
        name: execMap.get("ketua")!,
      });
    if (execMap.has("wakil"))
      data.executives.push({
        role: "Wakil Ketua",
        name: execMap.get("wakil")!,
      });
    if (execMap.has("sekretaris"))
      data.executives.push({
        role: "Sekretaris",
        name: execMap.get("sekretaris")!,
      });
    if (execMap.has("co-sekretaris"))
      data.executives.push({
        role: "Co-Sekretaris",
        name: execMap.get("co-sekretaris")!,
      });
    if (execMap.has("bendahara"))
      data.executives.push({
        role: "Bendahara",
        name: execMap.get("bendahara")!,
      });
    if (execMap.has("co-bendahara"))
      data.executives.push({
        role: "Co-Bendahara",
        name: execMap.get("co-bendahara")!,
      });

    // Group divisions dynamically
    const divGroups = new Map<
      string,
      {
        members: Array<{ name: string; isKepala?: boolean }>;
        slots: number;
        openPositions: string[];
      }
    >();

    // Add all unique referenced non-BPH division names to map
    for (const name of divisionMap.values()) {
      if (name.toLowerCase() !== "bph") {
        divGroups.set(name, { members: [], slots: 0, openPositions: [] });
      }
    }

    for (const m of divisionMembers) {
      if (!m.divisionName || m.divisionName.toLowerCase() === "bph") continue;

      let group = divGroups.get(m.divisionName);
      if (!group) {
        group = { members: [], slots: 0, openPositions: [] };
        divGroups.set(m.divisionName, group);
      }

      if (m.isOpen) {
        group.slots += 1;
        let cleanRole = m.name.replace(/^\[OPEN POSITION\]\s*-\s*/i, "").trim();
        const specificRole = m.roles.find(
          (r) => !/staf penuh|staf muda/i.test(r),
        );
        if (specificRole) {
          cleanRole = specificRole;
        }
        if (cleanRole && !cleanRole.toLowerCase().includes("untitled")) {
          group.openPositions.push(cleanRole);
        }
      } else {
        group.members.push({ name: m.name, isKepala: m.isKepala });
      }
    }

    data.divisions = Array.from(divGroups.entries()).map(([name, group]) => ({
      name,
      members: group.members,
      slots: group.slots,
      openPositions: group.openPositions,
    }));
  } catch (error) {
    console.error(
      "[Notion fetchProfilOrgStructure] Failed to process database content:",
      error,
    );
  }

  return data;
}

/** @deprecated Use fetchProfilOrgStructure with CMS database IDs instead. */
export async function fetchProfilModularData(
  _pageId: string,
): Promise<ProfilModularData> {
  const {
    fetchContainerCMSCached,
    resolveCmsComponentDatabaseId,
    resolveProfilMaxBatchFromCms,
  } = await import("./notion-builder");
  const cms = await fetchContainerCMSCached();
  const sdmDatabaseId = resolveCmsComponentDatabaseId(
    cms,
    "Struktur Organisasi Graph",
    "value2",
  );
  if (!sdmDatabaseId)
    return { paragraph: "", cabinetName: "", executives: [], divisions: [] };
  return fetchProfilOrgStructure({
    sdmDatabaseId,
    maxBatch: resolveProfilMaxBatchFromCms(cms),
  });
}

export const fetchProfilOrgStructureCached = unstable_cache(
  async (query: ProfilOrgQuery): Promise<ProfilModularData> => {
    return fetchProfilOrgStructure(query);
  },
  ["notion-profil-org-structure"],
  { revalidate: 60, tags: ["notion-profil"] },
);

export const fetchProfilModularDataCached = unstable_cache(
  async (pageId: string): Promise<ProfilModularData> => {
    return fetchProfilModularData(pageId);
  },
  ["notion-profil-modular-data"],
  { revalidate: 60, tags: ["notion-profil"] },
);

/* ------------------------------------------------------------------ */
/*  Modular Redirect database queries                                 */
/* ------------------------------------------------------------------ */

export interface RedirectEntry {
  id: string;
  name: string;
  sourcePath: string;
  destinationUrl: string;
}

const DEFAULT_REDIRECT_ENTRIES: RedirectEntry[] = [
  {
    id: "default-agenda-submit",
    name: "Formulir Agenda",
    sourcePath: "/agenda/submit",
    destinationUrl:
      "https://pengajuan-himamusik.notion.site/36e3b26dc3be80a8955bcbf8933c8cdb",
  },
  {
    id: "default-karya-submit",
    name: "Formulir Karya",
    sourcePath: "/karya/submit",
    destinationUrl:
      "https://pengajuan-himamusik.notion.site/36e3b26dc3be8006bcd0c2dc60ff54f2",
  },
];

export const fetchRedirects = unstable_cache(
  async (): Promise<RedirectEntry[]> => {
    try {
      const activeDbId = DB_REDIRECT;
      if (!activeDbId) return DEFAULT_REDIRECT_ENTRIES;

      const dataSourceId = await resolveDataSourceIdSafe(activeDbId);
      if (!dataSourceId) return DEFAULT_REDIRECT_ENTRIES;

      const results: NotionPage[] = [];
      let cursor: string | undefined;

      do {
        const response = await getNotionClientAny().dataSources.query({
          data_source_id: dataSourceId,
          start_cursor: cursor,
        });
        results.push(...(response.results as NotionPage[]));
        cursor = response.has_more
          ? (response.next_cursor ?? undefined)
          : undefined;
      } while (cursor);

      const parsed = results
        .map((page) => {
          const name = getTitleProperty(page, "Name") || getTitle(page);
          const rawSource = getRichText(page, "Modified");
          const destinationUrl = getRichText(page, "Destination URL");

          let sourcePath = rawSource.trim();
          if (sourcePath && !sourcePath.startsWith("/")) {
            sourcePath = `/${sourcePath}`;
          }

          return {
            id: page.id,
            name,
            sourcePath,
            destinationUrl: destinationUrl.trim(),
          };
        })
        .filter((entry) => entry.sourcePath && entry.destinationUrl);

      // Merge defaults if not overridden by Notion entries
      const merged = [...parsed];
      for (const def of DEFAULT_REDIRECT_ENTRIES) {
        if (
          !merged.some(
            (m) => m.sourcePath.toLowerCase() === def.sourcePath.toLowerCase(),
          )
        ) {
          merged.push(def);
        }
      }

      return merged;
    } catch (error) {
      console.error("[Notion fetchRedirects] Query failed:", error);
      return DEFAULT_REDIRECT_ENTRIES;
    }
  },
  ["notion-redirects"],
  { revalidate: 60, tags: ["notion-redirects"] },
);

export interface BatchInfo {
  id: string;
  name: string;
  batchNum: number;
  angkatanIds?: string[];
}

export interface RecruitmentTimelineEvent {
  title: string;
  description: string;
  type:
    | "registration"
    | "interview-announcement"
    | "interview"
    | "final-announcement";
  start: string;
  end: string;
  startTime?: string;
  endTime?: string;
}

export interface RecruitmentTimelineData {
  batch: string;
  year: string;
  events: RecruitmentTimelineEvent[];
}

export const fetchBatchMap = unstable_cache(
  async (): Promise<Record<string, BatchInfo>> => {
    const dbId = DB_BATCH_PENDAFTARAN;
    const batchMap: Record<string, BatchInfo> = {};
    if (!dbId) return batchMap;

    try {
      const client = getNotionClientAny();
      const dataSourceId = await resolveDataSourceIdSafe(dbId);
      if (!dataSourceId) return batchMap;

      const results: NotionPage[] = [];
      let cursor: string | undefined;
      do {
        const response = await client.dataSources.query({
          data_source_id: dataSourceId,
          start_cursor: cursor,
        });
        results.push(...(response.results as NotionPage[]));
        cursor = response.has_more
          ? (response.next_cursor ?? undefined)
          : undefined;
      } while (cursor);

      for (const page of results) {
        const name = getTitleProperty(page, "Name") || getTitle(page) || "";
        const match = name.match(/Batch\s*(\d+)/i) || name.match(/(\d+)/);
        const batchNum = match ? parseInt(match[1], 10) : 0;
        const angkatanRelation = getProperty(page, "04 Tahun Angkatan");
        const angkatanIds =
          angkatanRelation?.type === "relation"
            ? angkatanRelation.relation.map((r: { id: string }) => r.id)
            : [];
        batchMap[page.id] = {
          id: page.id,
          name,
          batchNum,
          angkatanIds,
        };
      }
    } catch (err) {
      console.error("[fetchBatchMap] Error:", err);
    }
    return batchMap;
  },
  ["notion-batch-map"],
  { revalidate: 60, tags: ["notion-batch-map"] },
);

function inferRecruitmentEventType(
  title: string,
): RecruitmentTimelineEvent["type"] {
  const normalized = title.trim().toLowerCase();
  if (normalized.includes("pengumuman") && normalized.includes("wawancara")) {
    return "interview-announcement";
  }
  if (normalized.includes("wawancara")) {
    return "interview";
  }
  if (normalized.includes("akhir")) {
    return "final-announcement";
  }
  return "registration";
}

function inferRecruitmentEventDescription(title: string, batchLabel: string) {
  const normalized = title.trim().toLowerCase();
  if (normalized.includes("pendaftaran")) {
    return `Jadwal pendaftaran untuk ${batchLabel}.`;
  }
  if (normalized.includes("wawancara")) {
    return `Jadwal wawancara untuk ${batchLabel}.`;
  }
  if (normalized.includes("akhir")) {
    return `Jadwal pengumuman akhir untuk ${batchLabel}.`;
  }
  return `Jadwal seleksi untuk ${batchLabel}.`;
}

export const fetchCurrentRecruitmentTimelineCached = unstable_cache(
  async (): Promise<RecruitmentTimelineData | null> => {
    try {
      const { fetchContainerCMS } = await import("./notion-builder");
      const cms = await fetchContainerCMS();
      const currentBatch = cms?.variables?.CURRENT_BATCH?.trim() || "";
      const currentYear = cms?.variables?.CURRENT_YEAR?.trim() || "";
      const currentBatchNum = Number.parseInt(currentBatch, 10);

      const dataSourceId = await resolveDataSourceIdSafe(DB_TAHAPAN_REKRUTMEN);
      if (!dataSourceId) return null;

      const batchMap = await fetchBatchMap();
      const pages: NotionPage[] = [];
      let cursor: string | undefined;

      do {
        const response = await getNotionClientAny().dataSources.query({
          data_source_id: dataSourceId,
          start_cursor: cursor,
        });
        pages.push(...(response.results as NotionPage[]));
        cursor = response.has_more
          ? (response.next_cursor ?? undefined)
          : undefined;
      } while (cursor);

      const events = pages
        .map((page) => {
          const relatedBatch = getRelationIds(page, "03 Batch Pendaftaran")
            .map((id) => batchMap[id])
            .find(Boolean);
          const batchNum = relatedBatch?.batchNum ?? 999;
          const batchLabel = relatedBatch?.name?.trim() || `Batch ${batchNum}`;
          const start = getDate(page, "Date");
          const end = getDateEnd(page, "Date") || start;
          const title = getTitleProperty(page, "Name") || getTitle(page);
          return {
            title,
            batchNum,
            batchLabel,
            start,
            end,
          };
        })
        .filter((item) => {
          if (!item.start) return false;
          if (Number.isNaN(currentBatchNum)) return true;
          return item.batchNum === currentBatchNum;
        })
        .sort((a, b) => {
          const startSort = a.start.localeCompare(b.start);
          if (startSort !== 0) return startSort;
          return a.title.localeCompare(b.title, undefined, { numeric: true });
        })
        .map<RecruitmentTimelineEvent>((item) => ({
          title: item.title,
          description: inferRecruitmentEventDescription(
            item.title,
            item.batchLabel,
          ),
          type: inferRecruitmentEventType(item.title),
          start: item.start,
          end: item.end,
        }));

      if (events.length === 0) return null;

      const fallbackYear = events[0]?.start.slice(0, 4) || "";
      return {
        batch: currentBatch || String(currentBatchNum),
        year: currentYear || fallbackYear,
        events,
      };
    } catch (error) {
      console.error("[fetchCurrentRecruitmentTimelineCached] Error:", error);
      throw error;
    }
  },
  ["notion-current-recruitment-timeline"],
  {
    revalidate: 300,
    tags: ["notion-container", "recruitment"],
  },
);

export type Division = {
  id: string;
  name: string;
  summary: string;
  slots: number;
  focus: string;
  tasks: string[];
  skills: string[];
  commitment: string;
};

export async function fetchDivisionsFromNotion(): Promise<{
  divisions: Division[];
  angkatanList: string[];
}> {
  const structDbId = DB_STRUKTUR_ORGANISASI;
  const sdmDbId = DB_SDM_EVALUASI;
  const tasksDbId = DB_TUGAS_UTAMA_DIVISI;

  if (!structDbId || !sdmDbId) {
    const { divisions: staticDivs } = await import("./pendaftaran-data");
    return { divisions: staticDivs, angkatanList: ["2023", "2024", "2025"] };
  }

  try {
    const client = getNotionClient();
    if (!client) {
      const { divisions: staticDivs } = await import("./pendaftaran-data");
      return { divisions: staticDivs, angkatanList: ["2023", "2024", "2025"] };
    }

    const structDataSourceId = await resolveDataSourceIdSafe(structDbId);
    if (!structDataSourceId) {
      const { divisions: staticDivs } = await import("./pendaftaran-data");
      return { divisions: staticDivs, angkatanList: ["2023", "2024", "2025"] };
    }
    const structResponse = await client.dataSources.query({
      data_source_id: structDataSourceId,
    });
    const structPages = structResponse.results as NotionPage[];

    const sdmDataSourceId = await resolveDataSourceIdSafe(sdmDbId);
    if (!sdmDataSourceId) {
      const { divisions: staticDivs } = await import("./pendaftaran-data");
      return { divisions: staticDivs, angkatanList: ["2023", "2024", "2025"] };
    }
    const sdmResponse = await client.dataSources.query({
      data_source_id: sdmDataSourceId,
    });
    const sdmPages = sdmResponse.results as NotionPage[];

    const { fetchContainerCMS } = await import("./notion-builder");
    const cms = await fetchContainerCMS();
    const currentBatchStr = cms?.variables?.CURRENT_BATCH || "2";
    const currentBatchNum = parseInt(currentBatchStr, 10);

    const batchMap = await fetchBatchMap();

    const recruitmentPages = sdmPages.filter((page) => {
      const status = getSelect(page, "Status Keaktifan");
      if (status !== "Rekrutmen") return false;

      const relatedBatchIds = getRelationIds(page, "03 Batch Pendaftaran");
      const relatedBatch = relatedBatchIds
        .map((id) => batchMap[id])
        .find(Boolean);
      const batchNum = relatedBatch ? relatedBatch.batchNum : 999;
      return Number.isNaN(currentBatchNum)
        ? true
        : batchNum === currentBatchNum;
    });

    let taskPages: NotionPage[] = [];
    if (tasksDbId) {
      const tasksDataSourceId = await resolveDataSourceIdSafe(tasksDbId);
      if (tasksDataSourceId) {
        const tasksResponse = await client.dataSources.query({
          data_source_id: tasksDataSourceId,
        });
        taskPages = tasksResponse.results as NotionPage[];
      }
    }

    const jobdeskIds = new Set<string>();
    recruitmentPages.forEach((page) => {
      const propRole = getProperty(page, "04 Nama Jabatan");
      if (propRole?.type === "relation") {
        propRole.relation.forEach((r: { id: string }) => jobdeskIds.add(r.id));
      }
    });

    const jobdeskMap = new Map<string, string>();
    await Promise.all(
      Array.from(jobdeskIds).map(async (id) => {
        try {
          const page = (await client.pages.retrieve({
            page_id: id,
          })) as { properties: NotionPage["properties"] };
          const titleProp = Object.values(page.properties).find(
            (p) => p.type === "title",
          ) as { title?: Array<{ plain_text: string }> } | undefined;
          const name = titleProp?.title?.[0]?.plain_text || "Untitled Jobdesk";
          jobdeskMap.set(id, name);
        } catch (err) {
          console.error(`Failed to fetch title for jobdesk ${id}:`, err);
        }
      }),
    );

    let angkatanList: string[] = [];
    const currentBatchInfo = Object.values(batchMap).find(
      (b) => b.batchNum === currentBatchNum,
    );
    if (
      currentBatchInfo &&
      currentBatchInfo.angkatanIds &&
      currentBatchInfo.angkatanIds.length > 0
    ) {
      await Promise.all(
        currentBatchInfo.angkatanIds.map(async (id) => {
          try {
            const page = (await client.pages.retrieve({
              page_id: id,
            })) as { properties: NotionPage["properties"] };
            const titleProp = Object.values(page.properties).find(
              (p) => p.type === "title",
            ) as { title?: Array<{ plain_text: string }> } | undefined;
            const name = titleProp?.title?.[0]?.plain_text;
            if (name) angkatanList.push(name.trim());
          } catch (err) {
            console.error(`Failed to fetch title for angkatan ${id}:`, err);
          }
        }),
      );
    }

    angkatanList = angkatanList.sort((a, b) => a.localeCompare(b));
    if (angkatanList.length === 0) {
      angkatanList = ["2023", "2024", "2025"];
    }

    const divisions = structPages.map((page) => {
      const name = getTitleProperty(page, "Nama Divisi") || getTitle(page);
      const id = slugify(name);
      const summary = getRichText(page, "Deskripsi Divisi");
      const skills = getMultiSelect(page, "Skill Unik");

      const divisionRecruitments = recruitmentPages.filter((rp) => {
        const relIds = getRelationIds(rp, "02 Struktur Organisasi");
        return relIds.includes(page.id);
      });
      const slots = divisionRecruitments.length;

      const openPositions = divisionRecruitments
        .flatMap((rp) => {
          const propRole = getProperty(rp, "04 Nama Jabatan");
          if (propRole?.type === "relation") {
            return propRole.relation.map((r: { id: string }) =>
              jobdeskMap.get(r.id),
            );
          }
          return [];
        })
        .filter(Boolean) as string[];

      const divisionTasks = taskPages
        .filter((tp) => {
          const relIds = getRelationIds(tp, "02 Struktur Organisasi");
          return relIds.includes(page.id);
        })
        .map((tp) => getTitleProperty(tp, "Tugas") || getTitle(tp))
        .filter(Boolean);

      return {
        id,
        name,
        summary,
        slots,
        focus: summary.split(".")[0] || "",
        tasks: divisionTasks.length > 0 ? divisionTasks : ["Tugas umum divisi"],
        skills,
        commitment: "Rutin mengikuti rapat dan kegiatan internal",
        openPositions: Array.from(new Set(openPositions)),
      };
    });

    return { divisions, angkatanList };
  } catch (error) {
    console.error("[fetchDivisionsFromNotion] Error:", error);
    const { divisions: staticDivs } = await import("./pendaftaran-data");
    return { divisions: staticDivs, angkatanList: ["2023", "2024", "2025"] };
  }
}
