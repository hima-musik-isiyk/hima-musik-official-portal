#!/usr/bin/env npx tsx
/**
 * Notion CMS Registry Roaming Fetcher & Glossary Generator
 * =========================================================
 * One-off script that:
 *  1. Fetches ALL databases from NOTION_DATABASE_REGISTRY_ID
 *  2. Crawls each database schema (properties, types, options, relations)
 *  3. Cross-references with lib/notion-db-ids.ts for audit
 *  4. Generates JSON dump + Markdown glossary into scratch/
 *
 * Usage:
 *   npx tsx scripts/notion-roaming-fetcher.ts
 *
 * Requires: NOTION_INTEGRATION_TOKEN & NOTION_DATABASE_REGISTRY_ID in .env.local
 */

import fs from "fs";
import path from "path";

// ──────────────────────────────────────────────────────────────
//  Inline .env.local parser (zero external deps)
// ──────────────────────────────────────────────────────────────

function loadEnv(): void {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    console.error("❌ .env.local not found at", envPath);
    process.exit(1);
  }
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadEnv();

// ──────────────────────────────────────────────────────────────
//  Config & Validation
// ──────────────────────────────────────────────────────────────

const NOTION_TOKEN = process.env.NOTION_INTEGRATION_TOKEN;
const REGISTRY_ID = process.env.NOTION_DATABASE_REGISTRY_ID;

if (!NOTION_TOKEN) {
  console.error("❌ NOTION_INTEGRATION_TOKEN is not set in .env.local");
  process.exit(1);
}
if (!REGISTRY_ID) {
  console.error("❌ NOTION_DATABASE_REGISTRY_ID is not set in .env.local");
  process.exit(1);
}

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2026-03-11";
const CONCURRENCY = 3; // parallel requests to avoid rate limits
const SAMPLE_ROWS = 2; // number of rows to sample per database

// ──────────────────────────────────────────────────────────────
//  Types
// ──────────────────────────────────────────────────────────────

interface RegistryEntry {
  id: string;
  name: string;
  teamspace: string;
  cmsStatus: string;
  syncMode: string;
  /** The actual database ID (resolved from title mention) */
  resolvedDbId: string;
}

interface PropertySchema {
  name: string;
  type: string;
  propertyId: string;
  options?: string[];
  relationDatabaseId?: string;
  relationDatabaseName?: string;
  description?: string;
}

interface DatabaseSchema {
  registryEntry: RegistryEntry;
  actualTitle: string;
  actualId: string;
  dataSourceId?: string;
  properties: PropertySchema[];
  rowCount: number;
  sampleRows: Record<string, string>[];
  relations: {
    propertyName: string;
    targetDbId: string;
    targetDbName?: string;
  }[];
  rowTitles?: string[];
  crawledRows?: Record<string, string>[];
  error?: string;
}

interface AuditResult {
  status: "matched" | "missing_in_repo" | "orphan_in_repo" | "name_mismatch";
  notionName: string;
  repoConstant?: string;
  repoValue?: string;
  notionId?: string;
}

// ──────────────────────────────────────────────────────────────
//  Notion API helpers
// ──────────────────────────────────────────────────────────────

let requestCount = 0;
let rateLimitHits = 0;

async function notionFetch<T>(
  endpoint: string,
  method: "GET" | "POST" | "PATCH" = "GET",
  body?: unknown,
  retries = 3,
): Promise<T> {
  const url = `${NOTION_API}${endpoint}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${NOTION_TOKEN}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      requestCount++;
      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (res.status === 429) {
        rateLimitHits++;
        const retryAfter = parseInt(res.headers.get("retry-after") || "1", 10);
        const waitMs = Math.max(retryAfter * 1000, 1000);
        process.stdout.write(`⏳ Rate limited, waiting ${waitMs / 1000}s...\r`);
        await sleep(waitMs);
        continue;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Notion API ${res.status}: ${text.slice(0, 200)}`);
      }

      return (await res.json()) as T;
    } catch (err) {
      if (attempt === retries) throw err;
      await sleep(500 * (attempt + 1));
    }
  }

  throw new Error("Unreachable");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function formatId(id: string): string {
  const clean = id.replace(/-/g, "");
  if (clean.length !== 32) return id;
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20)}`;
}

// ──────────────────────────────────────────────────────────────
//  Concurrency limiter
// ──────────────────────────────────────────────────────────────

async function parallelMap<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx], idx);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

// ──────────────────────────────────────────────────────────────
//  Phase 1: Fetch Registry
// ──────────────────────────────────────────────────────────────

async function fetchRegistry(): Promise<RegistryEntry[]> {
  console.log("\n🔍 Phase 1: Fetching Database Registry...");

  // First, we need to resolve the data_source for the registry database
  const db = await notionFetch<any>(`/databases/${formatId(REGISTRY_ID!)}`);
  const dataSources = db.data_sources || [];
  const dsId = dataSources[0]?.id;

  const results: any[] = [];

  if (dsId) {
    // Use data_sources query (newer API)
    let hasMore = true;
    let startCursor: string | undefined;

    while (hasMore) {
      const queryBody: any = { page_size: 100 };
      if (startCursor) queryBody.start_cursor = startCursor;

      const response = await notionFetch<any>(
        `/data_sources/${dsId}/query`,
        "POST",
        queryBody,
      );
      results.push(...response.results);
      hasMore = response.has_more;
      startCursor = response.next_cursor || undefined;
    }
  } else {
    // Fallback: use databases query
    let hasMore = true;
    let startCursor: string | undefined;

    while (hasMore) {
      const queryBody: any = { page_size: 100 };
      if (startCursor) queryBody.start_cursor = startCursor;

      const response = await notionFetch<any>(
        `/databases/${formatId(REGISTRY_ID!)}/query`,
        "POST",
        queryBody,
      );
      results.push(...response.results);
      hasMore = response.has_more;
      startCursor = response.next_cursor || undefined;
    }
  }

  const entries: RegistryEntry[] = [];

  for (const page of results) {
    const props = page.properties || {};

    // Extract title (Link property) – may contain database mentions
    let name = "";
    let resolvedDbId = page.id;
    const titleProp = props["Link"] || props["Name"];
    if (titleProp?.type === "title" && titleProp.title) {
      name = titleProp.title
        .map((t: any) => t.plain_text || "")
        .join("")
        .trim();

      // Check for database/page mentions in the title
      for (const t of titleProp.title) {
        if (t.type === "mention" && t.mention) {
          if (t.mention.database?.id) {
            resolvedDbId = t.mention.database.id;
            break;
          } else if (t.mention.page?.id) {
            resolvedDbId = t.mention.page.id;
            break;
          }
        }
      }
    }

    // Extract Teamspace (people property → display as text)
    let teamspace = "";
    const teamProp = props["Teamspace"];
    if (teamProp?.type === "people" && teamProp.people) {
      teamspace = teamProp.people.map((p: any) => p.name || "").join(", ");
    } else if (teamProp?.type === "rich_text" && teamProp.rich_text) {
      teamspace = teamProp.rich_text
        .map((t: any) => t.plain_text || "")
        .join("")
        .trim();
    }

    // Extract CMS Status
    let cmsStatus = "";
    const cmsProp = props["CMS Status"];
    if (cmsProp?.type === "select" && cmsProp.select) {
      cmsStatus = cmsProp.select.name || "";
    }

    // Extract Sync Mode
    let syncMode = "Schema Only";
    const syncModeProp = props["Sync Mode"];
    if (syncModeProp?.type === "select" && syncModeProp.select) {
      syncMode = syncModeProp.select.name || "Schema Only";
    }

    if (name) {
      entries.push({
        id: page.id,
        name,
        teamspace,
        cmsStatus,
        syncMode,
        resolvedDbId: formatId(resolvedDbId),
      });
    }
  }

  console.log(`   ✅ Found ${entries.length} databases in registry`);
  console.log(
    `      CMS: ${entries.filter((e) => e.cmsStatus === "CMS").length}`,
  );
  console.log(
    `      CMS but not used: ${entries.filter((e) => e.cmsStatus === "CMS but not used").length}`,
  );
  console.log(
    `      not CMS: ${entries.filter((e) => e.cmsStatus === "not CMS").length}`,
  );

  return entries;
}

// ──────────────────────────────────────────────────────────────
//  Phase 2: Crawl Schema
// ──────────────────────────────────────────────────────────────

function extractPropertySchema(name: string, prop: any): PropertySchema {
  const schema: PropertySchema = {
    name,
    type: prop.type || "unknown",
    propertyId: prop.id || "",
  };

  // Extract select/multi_select/status options
  if (prop.type === "select" && prop.select?.options) {
    schema.options = prop.select.options.map((o: any) => o.name);
  } else if (prop.type === "multi_select" && prop.multi_select?.options) {
    schema.options = prop.multi_select.options.map((o: any) => o.name);
  } else if (prop.type === "status" && prop.status?.options) {
    schema.options = prop.status.options.map((o: any) => o.name);
  }

  // Extract relation target
  if (prop.type === "relation" && prop.relation) {
    schema.relationDatabaseId = prop.relation.database_id
      ? formatId(prop.relation.database_id)
      : undefined;
  }

  // Extract description if present
  if (prop.description) {
    schema.description = prop.description;
  }

  return schema;
}

function extractPlainValue(prop: any): string {
  if (!prop) return "";
  switch (prop.type) {
    case "title":
      return prop.title?.map((t: any) => t.plain_text || "").join("") || "";
    case "rich_text":
      return prop.rich_text?.map((t: any) => t.plain_text || "").join("") || "";
    case "number":
      return prop.number != null ? String(prop.number) : "";
    case "select":
      return prop.select?.name || "";
    case "multi_select":
      return (prop.multi_select || []).map((s: any) => s.name).join(", ");
    case "status":
      return prop.status?.name || "";
    case "date":
      return prop.date?.start || "";
    case "checkbox":
      return String(prop.checkbox ?? "");
    case "url":
      return prop.url || "";
    case "email":
      return prop.email || "";
    case "phone_number":
      return prop.phone_number || "";
    case "people":
      return (prop.people || []).map((p: any) => p.name || p.id).join(", ");
    case "relation":
      return (prop.relation || []).map((r: any) => r.id).join(", ");
    case "formula":
      if (prop.formula?.type === "string") return prop.formula.string || "";
      if (prop.formula?.type === "number")
        return String(prop.formula.number ?? "");
      if (prop.formula?.type === "boolean")
        return String(prop.formula.boolean ?? "");
      return "";
    case "rollup":
      if (prop.rollup?.type === "number")
        return String(prop.rollup.number ?? "");
      if (prop.rollup?.type === "array")
        return (prop.rollup.array || [])
          .map((a: any) => extractPlainValue(a))
          .join(", ");
      return "";
    case "created_time":
      return prop.created_time || "";
    case "last_edited_time":
      return prop.last_edited_time || "";
    case "created_by":
      return prop.created_by?.name || prop.created_by?.id || "";
    case "files":
      return (prop.files || [])
        .map((f: any) => f.name || f.external?.url || "")
        .join(", ");
    default:
      return JSON.stringify(prop).slice(0, 100);
  }
}

async function crawlDatabase(
  entry: RegistryEntry,
  idx: number,
  total: number,
): Promise<DatabaseSchema> {
  const label = `[${idx + 1}/${total}]`;
  process.stdout.write(`   ${label} 📊 ${entry.name}...\r`);

  const schema: DatabaseSchema = {
    registryEntry: entry,
    actualTitle: entry.name,
    actualId: entry.resolvedDbId,
    properties: [],
    rowCount: 0,
    sampleRows: [],
    relations: [],
  };

  try {
    // 1. Fetch the database object to get schema
    const db = await notionFetch<any>(`/databases/${entry.resolvedDbId}`);
    schema.actualTitle =
      db.title
        ?.map((t: any) => t.plain_text || "")
        .join("")
        .trim() || entry.name;
    schema.actualId = formatId(db.id);

    // Resolve data_source ID if available
    if (db.data_sources?.length) {
      schema.dataSourceId = db.data_sources[0].id;
    }

    // 2. Extract property schemas (Support Notion API 2026-03-11 where properties are in data_sources)
    let rawProperties = db.properties;
    if (!rawProperties && schema.dataSourceId) {
      try {
        const ds = await notionFetch<any>(
          `/data_sources/${schema.dataSourceId}`,
        );
        rawProperties = ds.properties;
      } catch {
        // fallback
      }
    }

    if (rawProperties) {
      for (const [propName, propValue] of Object.entries(rawProperties)) {
        const propSchema = extractPropertySchema(propName, propValue);
        schema.properties.push(propSchema);

        // Track relations
        if (propSchema.relationDatabaseId) {
          schema.relations.push({
            propertyName: propName,
            targetDbId: propSchema.relationDatabaseId,
          });
        }
      }
    }

    // 3. Query for row count + sample rows
    const queryEndpoint = schema.dataSourceId
      ? `/data_sources/${schema.dataSourceId}/query`
      : `/databases/${entry.resolvedDbId}/query`;

    try {
      const queryResult = await notionFetch<any>(queryEndpoint, "POST", {
        page_size: SAMPLE_ROWS,
      });

      // The total count isn't directly available, but we can check
      // has_more to know if there are more than our sample
      const sampleResults = queryResult.results || [];
      schema.rowCount = sampleResults.length;
      if (queryResult.has_more) {
        schema.rowCount = sampleResults.length; // at least this many, mark it
      }

      // Extract sample rows
      for (const row of sampleResults) {
        const rowData: Record<string, string> = {};
        if (row.properties) {
          for (const [propName, propValue] of Object.entries(row.properties)) {
            rowData[propName] = extractPlainValue(propValue);
          }
        }
        schema.sampleRows.push(rowData);
      }

      // If has_more, do a second query to get full count (fast, just count via pagination)
      if (queryResult.has_more) {
        try {
          // Use a minimal query to estimate count
          let totalCount = sampleResults.length;
          let cursor = queryResult.next_cursor;
          let iterations = 0;
          const MAX_COUNT_PAGES = 10; // max 1000 rows count

          while (cursor && iterations < MAX_COUNT_PAGES) {
            const countResult = await notionFetch<any>(queryEndpoint, "POST", {
              page_size: 100,
              start_cursor: cursor,
            });
            totalCount += (countResult.results || []).length;
            cursor = countResult.has_more ? countResult.next_cursor : null;
            iterations++;
          }
          schema.rowCount = totalCount;
          if (cursor) {
            // Still more pages, just mark it as 1000+
            schema.rowCount = totalCount;
          }
        } catch {
          // If count fails, keep the sample count and mark as approximate
        }
      }

      // 3.5. Crawl all row titles and properties if Sync Mode is "Crawl Rows"
      if (entry.syncMode === "Crawl Rows" && !schema.error) {
        schema.rowTitles = [];
        schema.crawledRows = [];
        try {
          let hasMore = true;
          let cursor: string | undefined;
          while (hasMore) {
            const body: any = { page_size: 100 };
            if (cursor) body.start_cursor = cursor;
            const queryResult = await notionFetch<any>(
              queryEndpoint,
              "POST",
              body,
            );
            const results = queryResult.results || [];
            for (const row of results) {
              const props = row.properties || {};
              let titleVal = "";
              const rowData: Record<string, string> = {};
              for (const [propName, propValue] of Object.entries(props)) {
                const plainVal = extractPlainValue(propValue);
                rowData[propName] = plainVal;
                if ((propValue as any).type === "title") {
                  titleVal = plainVal;
                }
              }
              if (titleVal) {
                schema.rowTitles.push(titleVal);
              }
              schema.crawledRows.push(rowData);
            }
            hasMore = queryResult.has_more;
            cursor = queryResult.next_cursor || undefined;
          }
        } catch (crawlErr: any) {
          console.warn(
            `   ⚠️ Failed to crawl row titles for ${entry.name}: ${crawlErr.message}`,
          );
        }
      }
    } catch (queryErr: any) {
      // Query might fail for certain database types, that's ok
      schema.error = `Query failed: ${queryErr.message?.slice(0, 100)}`;
    }

    console.log(
      `   ${label} ✅ ${entry.name} (${schema.properties.length} props, ${schema.rowCount} rows)`,
    );
  } catch (err: any) {
    schema.error = err.message?.slice(0, 200);
    console.log(`   ${label} ❌ ${entry.name}: ${schema.error}`);
  }

  return schema;
}

async function crawlAllSchemas(
  entries: RegistryEntry[],
): Promise<DatabaseSchema[]> {
  console.log(`\n🔬 Phase 2: Crawling ${entries.length} database schemas...`);

  const schemas = await parallelMap(entries, CONCURRENCY, (entry, idx) =>
    crawlDatabase(entry, idx, entries.length),
  );

  const successCount = schemas.filter((s) => !s.error).length;
  console.log(
    `   ✅ Successfully crawled ${successCount}/${entries.length} databases`,
  );

  return schemas;
}

// ──────────────────────────────────────────────────────────────
//  Phase 3: Cross-Reference Audit
// ──────────────────────────────────────────────────────────────

function parseNotionDbIds(): Map<string, { constant: string; value: string }> {
  const filePath = path.resolve(process.cwd(), "lib/glossarium/databases.ts");
  if (!fs.existsSync(filePath)) {
    console.warn("⚠️ lib/glossarium/databases.ts not found, skipping audit");
    return new Map();
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const map = new Map<string, { constant: string; value: string }>();

  // Match: export const DB_XXX = "value";
  const re =
    /export\s+const\s+(DB_\w+)\s*=\s*(?:process\.env\.\w+\s*\?\?\s*)?["']([^"']+)["']/g;
  let match;
  while ((match = re.exec(content)) !== null) {
    const constant = match[1];
    const value = match[2];
    map.set(value.toLowerCase().replace(/[^a-z0-9]/g, ""), { constant, value });
  }

  return map;
}

function auditRegistry(
  schemas: DatabaseSchema[],
  repoConstants: Map<string, { constant: string; value: string }>,
): AuditResult[] {
  console.log(
    "\n🔎 Phase 3: Cross-referencing with lib/glossarium/databases.ts...",
  );

  const results: AuditResult[] = [];
  const matchedRepoKeys = new Set<string>();

  for (const schema of schemas) {
    const normalizedName = schema.registryEntry.name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const repoEntry = repoConstants.get(normalizedName);

    if (repoEntry) {
      results.push({
        status: "matched",
        notionName: schema.registryEntry.name,
        repoConstant: repoEntry.constant,
        repoValue: repoEntry.value,
        notionId: schema.actualId,
      });
      matchedRepoKeys.add(normalizedName);
    } else {
      // Check for fuzzy matches
      let fuzzyMatch: { constant: string; value: string; key: string } | null =
        null;
      for (const [key, entry] of repoConstants) {
        if (
          normalizedName.includes(key) ||
          key.includes(normalizedName) ||
          levenshteinRatio(normalizedName, key) > 0.7
        ) {
          fuzzyMatch = { ...entry, key };
          break;
        }
      }

      if (fuzzyMatch) {
        results.push({
          status: "name_mismatch",
          notionName: schema.registryEntry.name,
          repoConstant: fuzzyMatch.constant,
          repoValue: fuzzyMatch.value,
          notionId: schema.actualId,
        });
        matchedRepoKeys.add(fuzzyMatch.key);
      } else {
        results.push({
          status: "missing_in_repo",
          notionName: schema.registryEntry.name,
          notionId: schema.actualId,
        });
      }
    }
  }

  // Find orphans (in repo but not in Notion)
  for (const [key, entry] of repoConstants) {
    if (!matchedRepoKeys.has(key)) {
      results.push({
        status: "orphan_in_repo",
        notionName: entry.value,
        repoConstant: entry.constant,
        repoValue: entry.value,
      });
    }
  }

  const matched = results.filter((r) => r.status === "matched").length;
  const missing = results.filter((r) => r.status === "missing_in_repo").length;
  const orphan = results.filter((r) => r.status === "orphan_in_repo").length;
  const mismatch = results.filter((r) => r.status === "name_mismatch").length;

  console.log(`   ✅ Matched: ${matched}`);
  console.log(`   ⚠️ Missing in repo: ${missing}`);
  console.log(`   ❌ Orphan in repo: ${orphan}`);
  console.log(`   🔄 Name mismatch: ${mismatch}`);

  return results;
}

function levenshteinRatio(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - matrix[a.length][b.length] / maxLen;
}

// ──────────────────────────────────────────────────────────────
//  Phase 4: Output Generation
// ──────────────────────────────────────────────────────────────

function resolveRelationNames(schemas: DatabaseSchema[]): void {
  // Build ID → name map
  const idToName = new Map<string, string>();
  for (const s of schemas) {
    idToName.set(s.actualId, s.registryEntry.name);
    // Also map without hyphens
    idToName.set(s.actualId.replace(/-/g, ""), s.registryEntry.name);
  }

  // Fill in relation target names
  for (const s of schemas) {
    for (const rel of s.relations) {
      rel.targetDbName =
        idToName.get(rel.targetDbId) ||
        idToName.get(rel.targetDbId.replace(/-/g, "")) ||
        undefined;
    }
    for (const prop of s.properties) {
      if (prop.relationDatabaseId) {
        prop.relationDatabaseName =
          idToName.get(prop.relationDatabaseId) ||
          idToName.get(prop.relationDatabaseId.replace(/-/g, "")) ||
          undefined;
      }
    }
  }
}

function generateJsonDump(
  schemas: DatabaseSchema[],
  auditResults: AuditResult[],
): object {
  return {
    generatedAt: new Date().toISOString(),
    stats: {
      totalDatabases: schemas.length,
      cms: schemas.filter((s) => s.registryEntry.cmsStatus === "CMS").length,
      cmsNotUsed: schemas.filter(
        (s) => s.registryEntry.cmsStatus === "CMS but not used",
      ).length,
      notCms: schemas.filter((s) => s.registryEntry.cmsStatus === "not CMS")
        .length,
      successfulCrawls: schemas.filter((s) => !s.error).length,
      totalRows: schemas.reduce((sum, s) => sum + s.rowCount, 0),
      totalProperties: schemas.reduce((sum, s) => sum + s.properties.length, 0),
      totalRelations: schemas.reduce((sum, s) => sum + s.relations.length, 0),
      apiRequests: requestCount,
      rateLimitHits,
    },
    audit: {
      matched: auditResults.filter((r) => r.status === "matched").length,
      missingInRepo: auditResults.filter((r) => r.status === "missing_in_repo")
        .length,
      orphanInRepo: auditResults.filter((r) => r.status === "orphan_in_repo")
        .length,
      nameMismatch: auditResults.filter((r) => r.status === "name_mismatch")
        .length,
      details: auditResults,
    },
    databases: schemas.map((s) => ({
      name: s.registryEntry.name,
      actualTitle: s.actualTitle,
      id: s.actualId,
      dataSourceId: s.dataSourceId || null,
      registryPageId: s.registryEntry.id,
      teamspace: s.registryEntry.teamspace,
      cmsStatus: s.registryEntry.cmsStatus,
      rowCount: s.rowCount,
      error: s.error || null,
      properties: s.properties.map((p) => ({
        name: p.name,
        type: p.type,
        propertyId: p.propertyId,
        options: p.options || null,
        relationTarget: p.relationDatabaseId
          ? {
              id: p.relationDatabaseId,
              name: p.relationDatabaseName || null,
            }
          : null,
        description: p.description || null,
      })),
      relations: s.relations.map((r) => ({
        property: r.propertyName,
        targetId: r.targetDbId,
        targetName: r.targetDbName || null,
      })),
      sampleRows: s.sampleRows,
      rowTitles: s.rowTitles || null,
    })),
  };
}

function generateGlossaryMarkdown(
  schemas: DatabaseSchema[],
  auditResults: AuditResult[],
): string {
  const now = new Date().toISOString();
  const lines: string[] = [];

  lines.push("# 📋 Notion Registry Glossary");
  lines.push(`> Auto-generated on: ${now}`);
  lines.push(`> Registry ID: \`${REGISTRY_ID}\``);
  lines.push("");

  // ── Audit Summary ──
  const matched = auditResults.filter((r) => r.status === "matched");
  const missing = auditResults.filter((r) => r.status === "missing_in_repo");
  const orphan = auditResults.filter((r) => r.status === "orphan_in_repo");
  const mismatch = auditResults.filter((r) => r.status === "name_mismatch");

  const dbFileUrl = `file://${path.resolve(process.cwd(), "lib/glossarium/databases.ts")}`;
  const propsFileUrl = `file://${path.resolve(process.cwd(), "lib/glossarium/properties.ts")}`;
  const relsFileUrl = `file://${path.resolve(process.cwd(), "lib/glossarium/relations.ts")}`;
  const compsFileUrl = `file://${path.resolve(process.cwd(), "lib/glossarium/components.ts")}`;

  lines.push("## 📊 Audit Summary");
  lines.push("");
  lines.push(`| Metric | Count |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total databases in Notion | ${schemas.length} |`);
  lines.push(`| ✅ Matched in repo | ${matched.length} |`);
  lines.push(`| ⚠️ Missing from repo | ${missing.length} |`);
  lines.push(`| ❌ Orphan in repo (not in Notion) | ${orphan.length} |`);
  lines.push(`| 🔄 Name mismatch | ${mismatch.length} |`);
  lines.push(
    `| Total properties crawled | ${schemas.reduce((s, d) => s + d.properties.length, 0)} |`,
  );
  lines.push(
    `| Total relations found | ${schemas.reduce((s, d) => s + d.relations.length, 0)} |`,
  );
  lines.push(
    `| Total rows counted | ${schemas.reduce((s, d) => s + d.rowCount, 0)} |`,
  );
  lines.push(`| API requests made | ${requestCount} |`);
  lines.push("");
  lines.push("### 📂 Developer Contracts (Glossarium)");
  lines.push(`- Databases: [databases.ts](${dbFileUrl})`);
  lines.push(`- Properties: [properties.ts](${propsFileUrl})`);
  lines.push(`- Relations: [relations.ts](${relsFileUrl})`);
  lines.push(`- Components: [components.ts](${compsFileUrl})`);
  lines.push("");

  // ── Missing from repo ──
  if (missing.length > 0) {
    lines.push("## ⚠️ Missing from Repo");
    lines.push("");
    lines.push(
      `These databases exist in Notion but have **no constant** in [databases.ts](${dbFileUrl}):`,
    );
    lines.push("");
    for (const m of missing) {
      lines.push(`- **${m.notionName}** → \`${m.notionId}\``);
    }
    lines.push("");
  }

  // ── Orphans in repo ──
  if (orphan.length > 0) {
    lines.push("## ❌ Orphan in Repo");
    lines.push("");
    lines.push(
      `These constants exist in [databases.ts](${dbFileUrl}) but were **not found** in Notion registry:`,
    );
    lines.push("");
    for (const o of orphan) {
      lines.push(`- \`${o.repoConstant}\` = \`"${o.repoValue}"\``);
    }
    lines.push("");
  }

  // ── Name mismatches ──
  if (mismatch.length > 0) {
    lines.push("## 🔄 Name Mismatches");
    lines.push("");
    for (const m of mismatch) {
      lines.push(
        `- Notion: **${m.notionName}** ↔ Repo: \`${m.repoConstant}\` = \`"${m.repoValue}"\``,
      );
    }
    lines.push("");
  }

  // ── Relation Graph ──
  lines.push("## 🔗 Relation Graph");
  lines.push("");
  lines.push("```mermaid");
  lines.push("graph LR");
  const addedEdges = new Set<string>();
  for (const s of schemas) {
    if (s.relations.length === 0) continue;
    const srcLabel = sanitizeMermaid(s.registryEntry.name);
    for (const rel of s.relations) {
      const targetLabel = sanitizeMermaid(
        rel.targetDbName || rel.targetDbId.slice(0, 8),
      );
      const edgeKey = `${srcLabel}-->${targetLabel}`;
      if (addedEdges.has(edgeKey)) continue;
      addedEdges.add(edgeKey);
      lines.push(
        `  ${srcLabel}["${s.registryEntry.name}"] -->|${rel.propertyName}| ${targetLabel}["${rel.targetDbName || rel.targetDbId.slice(0, 8)}"]`,
      );
    }
  }
  lines.push("```");
  lines.push("");

  // ── CMS Status Groups ──
  const statusGroups: Record<string, DatabaseSchema[]> = {
    CMS: [],
    "CMS but not used": [],
    "not CMS": [],
    "": [],
  };
  for (const s of schemas) {
    const group = statusGroups[s.registryEntry.cmsStatus] || statusGroups[""];
    group.push(s);
  }

  // ── Database Details ──
  lines.push("---");
  lines.push("");
  lines.push("## 📚 Database Details");
  lines.push("");

  for (const [statusLabel, group] of Object.entries(statusGroups)) {
    if (group.length === 0) continue;

    lines.push(
      `### ${getStatusEmoji(statusLabel)} ${statusLabel || "Unknown Status"} (${group.length})`,
    );
    lines.push("");

    // Sort by name
    group.sort((a, b) =>
      a.registryEntry.name.localeCompare(b.registryEntry.name),
    );

    for (const schema of group) {
      const audit = auditResults.find(
        (a) =>
          a.notionName === schema.registryEntry.name &&
          a.status !== "orphan_in_repo",
      );
      const statusIcon =
        audit?.status === "matched"
          ? "✅"
          : audit?.status === "missing_in_repo"
            ? "⚠️"
            : audit?.status === "name_mismatch"
              ? "🔄"
              : "❔";

      lines.push(`#### ${statusIcon} ${schema.registryEntry.name}`);
      lines.push("");
      lines.push(`| Key | Value |`);
      lines.push(`|-----|-------|`);
      lines.push(`| Notion ID | \`${schema.actualId}\` |`);
      if (schema.dataSourceId) {
        lines.push(`| Data Source ID | \`${schema.dataSourceId}\` |`);
      }
      if (audit?.repoConstant) {
        lines.push(`| Repo Constant | \`${audit.repoConstant}\` |`);
      }
      lines.push(`| CMS Status | ${schema.registryEntry.cmsStatus || "–"} |`);
      lines.push(`| Teamspace | ${schema.registryEntry.teamspace || "–"} |`);
      lines.push(`| Row Count | ${schema.rowCount} |`);
      if (schema.error) {
        lines.push(`| Error | ${schema.error} |`);
      }
      lines.push("");

      // Properties table
      if (schema.properties.length > 0) {
        lines.push(
          `<details><summary>Properties (${schema.properties.length})</summary>`,
        );
        lines.push("");
        lines.push(`| Property | Type | Options / Relation |`);
        lines.push(`|----------|------|--------------------|`);
        for (const prop of schema.properties) {
          let extra = "";
          if (prop.options?.length) {
            extra = prop.options.map((o) => `\`${o}\``).join(", ");
          } else if (prop.relationDatabaseId) {
            extra = `→ ${prop.relationDatabaseName || prop.relationDatabaseId}`;
          }
          lines.push(`| ${prop.name} | \`${prop.type}\` | ${extra || "–"} |`);
        }
        lines.push("");
        lines.push(`</details>`);
        lines.push("");
      }

      // Sample row (just first one)
      if (schema.sampleRows.length > 0) {
        lines.push(`<details><summary>Sample Row</summary>`);
        lines.push("");
        const firstRow = schema.sampleRows[0];
        lines.push(`| Property | Value |`);
        lines.push(`|----------|-------|`);
        for (const [key, val] of Object.entries(firstRow)) {
          const truncated = val.length > 80 ? val.slice(0, 80) + "…" : val;
          lines.push(`| ${key} | ${escapeMarkdownTable(truncated)} |`);
        }
        lines.push("");
        lines.push(`</details>`);
        lines.push("");
      }

      // Crawled row titles and properties table
      if (schema.crawledRows && schema.crawledRows.length > 0) {
        lines.push(
          `<details><summary>Crawled Rows (${schema.crawledRows.length})</summary>`,
        );
        lines.push("");
        const headers = schema.properties.map((p) => p.name);
        lines.push(`| ${headers.join(" | ")} |`);
        lines.push(`| ${headers.map(() => "---").join(" | ")} |`);
        for (const row of schema.crawledRows) {
          const rowVals = headers.map((h) => {
            const propSchema = schema.properties.find((p) => p.name === h);
            const val = row[h] || "";
            if (propSchema?.type === "relation") {
              const relCount = val
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean).length;
              return `[${relCount} relation${relCount !== 1 ? "s" : ""}]`;
            }
            const truncated = val.length > 60 ? val.slice(0, 60) + "…" : val;
            return escapeMarkdownTable(truncated);
          });
          lines.push(`| ${rowVals.join(" | ")} |`);
        }
        lines.push("");
        lines.push(`</details>`);
        lines.push("");
      }
    }
  }

  // ── Teamspace Summary ──
  lines.push("---");
  lines.push("");
  lines.push("## 🏢 Teamspace Summary");
  lines.push("");
  const teamspaceMap = new Map<string, string[]>();
  for (const s of schemas) {
    const ts = s.registryEntry.teamspace || "(none)";
    if (!teamspaceMap.has(ts)) teamspaceMap.set(ts, []);
    teamspaceMap.get(ts)!.push(s.registryEntry.name);
  }
  for (const [ts, dbs] of teamspaceMap) {
    lines.push(`### ${ts}`);
    for (const db of dbs.sort()) {
      lines.push(`- ${db}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function sanitizeMermaid(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/__+/g, "_")
    .slice(0, 30);
}

function getStatusEmoji(status: string): string {
  switch (status) {
    case "CMS":
      return "🟢";
    case "CMS but not used":
      return "🟡";
    case "not CMS":
      return "🔴";
    default:
      return "⚪";
  }
}

function escapeMarkdownTable(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ").replace(/\r/g, "");
}

// ──────────────────────────────────────────────────────────────
//  Phase 5: Glossarium Scaffold Generation
// ──────────────────────────────────────────────────────────────

function generateGlossariumScaffold(schemas: DatabaseSchema[]): void {
  const scaffoldDir = path.resolve(
    process.cwd(),
    "scratch/glossarium-scaffold",
  );
  if (!fs.existsSync(scaffoldDir)) {
    fs.mkdirSync(scaffoldDir, { recursive: true });
  }

  // 1. databases.ts scaffold
  const dbLines: string[] = [];
  dbLines.push(`// Auto-generated scaffold for lib/glossarium/databases.ts`);
  dbLines.push(
    `export const DATABASE_META: Record<string, { name: string; cmsStatus: string; teamspace: string }> = {`,
  );
  for (const s of schemas) {
    dbLines.push(`  // ${s.registryEntry.name}`);
    dbLines.push(`  "TODO_CONSTANT_NAME": {`);
    dbLines.push(`    name: "${s.registryEntry.name}",`);
    dbLines.push(`    cmsStatus: "${s.registryEntry.cmsStatus}",`);
    dbLines.push(`    teamspace: "${s.registryEntry.teamspace}"`);
    dbLines.push(`  },`);
  }
  dbLines.push(`};`);
  fs.writeFileSync(
    path.join(scaffoldDir, "databases.ts"),
    dbLines.join("\n"),
    "utf-8",
  );

  // 2. properties.ts scaffold
  const propLines: string[] = [];
  propLines.push(`// Auto-generated scaffold for lib/glossarium/properties.ts`);
  for (const s of schemas) {
    const safeName = s.registryEntry.name
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "_");
    propLines.push(`\nexport const PROP_${safeName} = {`);
    for (const p of s.properties) {
      const safeProp = p.name.toUpperCase().replace(/[^A-Z0-9]/g, "_");
      propLines.push(`  "${safeProp}": "${p.name}",`);
    }
    propLines.push(`} as const;`);
  }
  fs.writeFileSync(
    path.join(scaffoldDir, "properties.ts"),
    propLines.join("\n"),
    "utf-8",
  );

  // 3. relations.ts scaffold
  const relLines: string[] = [];
  relLines.push(`// Auto-generated scaffold for lib/glossarium/relations.ts`);
  relLines.push(`export const RELATION_MAP = {`);
  for (const s of schemas) {
    if (s.relations.length === 0) continue;
    relLines.push(`  "${s.registryEntry.name}": {`);
    for (const r of s.relations) {
      const safeProp = r.propertyName.toUpperCase().replace(/[^A-Z0-9]/g, "_");
      relLines.push(`    "${safeProp}": "${r.targetDbName || r.targetDbId}",`);
    }
    relLines.push(`  },`);
  }
  relLines.push(`} as const;`);
  fs.writeFileSync(
    path.join(scaffoldDir, "relations.ts"),
    relLines.join("\n"),
    "utf-8",
  );

  // 4. components.ts scaffold
  const compLines: string[] = [];
  compLines.push(`// Auto-generated scaffold for lib/glossarium/components.ts`);
  for (const s of schemas) {
    if (
      s.registryEntry.syncMode === "Crawl Rows" &&
      s.rowTitles &&
      s.rowTitles.length > 0
    ) {
      const safeName = s.registryEntry.name
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "_");
      compLines.push(
        `\n// Sourced from dynamic rows of database: ${s.registryEntry.name}`,
      );
      compLines.push(`export const ROW_TITLES_${safeName} = [`);
      // Remove duplicate names if any and sort them
      const uniqueTitles = Array.from(new Set(s.rowTitles)).sort();
      for (const title of uniqueTitles) {
        const escapedTitle = title.replace(/"/g, '\\"');
        compLines.push(`  "${escapedTitle}",`);
      }
      compLines.push(`] as const;`);

      // Export full rows list
      if (s.crawledRows && s.crawledRows.length > 0) {
        compLines.push(`\nexport const ROWS_${safeName} = [`);
        for (const row of s.crawledRows) {
          compLines.push(`  {`);
          for (const [key, val] of Object.entries(row)) {
            const escapedKey = key.replace(/"/g, '\\"');
            const escapedVal = val
              .replace(/"/g, '\\"')
              .replace(/\n/g, "\\n")
              .replace(/\r/g, "");
            compLines.push(`    "${escapedKey}": "${escapedVal}",`);
          }
          compLines.push(`  },`);
        }
        compLines.push(`] as const;`);
      }
    }
  }
  fs.writeFileSync(
    path.join(scaffoldDir, "components.ts"),
    compLines.join("\n"),
    "utf-8",
  );
}

// ──────────────────────────────────────────────────────────────
//  Main
// ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startTime = Date.now();
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  Notion CMS Registry Roaming Fetcher v1.0       ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log(
    `🔑 Token: ${NOTION_TOKEN!.slice(0, 10)}...${NOTION_TOKEN!.slice(-4)}`,
  );
  console.log(`📋 Registry: ${REGISTRY_ID}`);

  // Phase 1: Registry
  const entries = await fetchRegistry();

  // Phase 2: Schema Crawl
  const schemas = await crawlAllSchemas(entries);

  // Resolve relation names
  resolveRelationNames(schemas);

  // Phase 3: Audit
  const repoConstants = parseNotionDbIds();
  const auditResults = auditRegistry(schemas, repoConstants);

  // Phase 4: Output
  console.log("\n📝 Phase 4: Generating outputs...");

  const scratchDir = path.resolve(process.cwd(), "scratch");
  if (!fs.existsSync(scratchDir)) {
    fs.mkdirSync(scratchDir, { recursive: true });
  }

  // JSON dump
  const jsonOutput = generateJsonDump(schemas, auditResults);
  const jsonPath = path.join(scratchDir, "notion-registry-dump.json");
  fs.writeFileSync(jsonPath, JSON.stringify(jsonOutput, null, 2), "utf-8");
  console.log(`   ✅ JSON dump → ${jsonPath}`);

  // Markdown glossary
  const mdOutput = generateGlossaryMarkdown(schemas, auditResults);
  const mdPath = path.join(scratchDir, "notion-registry-glossary.md");
  fs.writeFileSync(mdPath, mdOutput, "utf-8");
  console.log(`   ✅ Glossary   → ${mdPath}`);

  // Phase 5: Glossarium Scaffold
  console.log("\n📝 Phase 5: Generating glossarium scaffold...");
  generateGlossariumScaffold(schemas);
  console.log(`   ✅ Scaffold   → scratch/glossarium-scaffold/`);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(
    `\n🏁 Done in ${elapsed}s (${requestCount} API calls, ${rateLimitHits} rate limits)`,
  );
}

main().catch((err) => {
  console.error("\n💥 Fatal error:", err);
  process.exit(1);
});
