import { unstable_cache } from "./cache";
import { cleanCmsValue } from "./cms-placeholders";
import {
  readContainerCMSSnapshot,
  writeContainerCMSSnapshot,
} from "./cms-snapshot";
import {
  DB_COMPONENT_TYPES,
  DB_CONTENT_COMPONENT,
  DB_FOOTER,
  DB_GROUP_DIV_CATEGORY,
  DB_PAGES,
  DB_REDIRECT,
  DB_SECTIONS,
  DB_VARIABLES,
  PROP,
  PROP_COMPONENT_TYPES,
  PROP_CONTENT_COMPONENT,
  PROP_FOOTER,
  PROP_PAGES,
  PROP_REDIRECT,
  PROP_SECTIONS,
  PROP_VARIABLES,
} from "./glossarium";
import { getNotionClient, NotionPage, resolveDataSourceIdSafe } from "./notion";

export interface CMSVariable {
  variable: string;
  value: string;
}

export interface CMSGroupCategory {
  id: string;
  name: string;
  type: string;
}

export interface CMSFooterComponent {
  id: string;
  name: string;
  show: boolean;
  group: string;
}

export interface CMSComponentRegistry {
  id: string;
  type: string;
  name: string;
  variation1: string;
  variation2: string;
  variation3: string;
  value1: string;
  value2: string;
  value3: string;
}

export interface CMSComponent {
  id: string;
  typeId: string;
  variation: string;
  groupId: string;
  show: boolean;
  orderOrGroup: string;
  value: string;
  value2: string;
  value3: string;
}

export interface CMSSection {
  id: string;
  pageId: string;
  sectionName: string;
  slug: string;
  order: string;
  show: boolean;
  height: string;
  components: CMSComponent[];
}

export interface CMSPage {
  id: string;
  name: string;
  slug: string;
  type: string;
  showInNav: boolean;
  urutan: string;
  showFooter: boolean;
  sections: CMSSection[];
  maxWidth?: string;
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string;
}

export interface CMSRedirect {
  id: string;
  name: string;
  modified: string;
  destinationUrl: string;
}

export interface ContainerCMSData {
  pages: CMSPage[];
  variables: Record<string, string>;
  groupCategories: Record<string, CMSGroupCategory>;
  componentRegistry: Record<string, CMSComponentRegistry>;
  footer: CMSFooterComponent[];
  redirects: CMSRedirect[];
}

// Property helpers
type RichTextFragment = { plain_text: string };
type RelationFragment = { id: string };

function findProp(page: NotionPage, name: string) {
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

function getTitle(page: NotionPage, name: string): string {
  const prop = findProp(page, name);
  if (prop?.type === "title" && prop.title.length > 0) {
    return prop.title
      .map((t: RichTextFragment) => t.plain_text)
      .join("")
      .trim();
  }
  return "";
}

function getRichText(page: NotionPage, name: string): string {
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

function getRichTextOrMentionId(page: NotionPage, name: string): string {
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

function getSelect(page: NotionPage, name: string): string {
  const prop = findProp(page, name);
  if (prop?.type === "select" && prop.select) {
    return prop.select.name;
  }
  return "";
}

function getCheckbox(
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

function getUrl(page: NotionPage, name: string): string {
  const prop = findProp(page, name);
  if (prop?.type === "url" && prop.url) {
    return prop.url;
  }
  return "";
}

function getRelationIds(page: NotionPage, name: string): string[] {
  const prop = findProp(page, name);
  if (prop?.type === "relation" && Array.isArray(prop.relation)) {
    return prop.relation.map((r: RelationFragment) => r.id);
  }
  return [];
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function queryNotionDataSource(
  dataSourceId: string,
  cursor: string | undefined,
) {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < 3) {
    try {
      return await getNotionClient().dataSources.query({
        data_source_id: dataSourceId,
        start_cursor: cursor,
      });
    } catch (error) {
      lastError = error;
      attempt += 1;
      if (attempt < 3) {
        await delay(350 * attempt);
      }
    }
  }

  throw lastError;
}

async function queryAll(databaseId: string): Promise<NotionPage[]> {
  const dataSourceId = await resolveDataSourceIdSafe(databaseId);
  if (!dataSourceId) return [];

  const results: NotionPage[] = [];
  let cursor: string | undefined;

  do {
    const response = await queryNotionDataSource(dataSourceId, cursor);
    results.push(...(response.results as NotionPage[]));
    cursor = response.has_more
      ? (response.next_cursor ?? undefined)
      : undefined;
  } while (cursor);

  return results;
}

export async function fetchContainerCMS(): Promise<ContainerCMSData> {
  const masterPageDbId = DB_PAGES;
  const masterSectionsDbId = DB_SECTIONS;
  const masterComponentDbId = DB_CONTENT_COMPONENT;
  const masterVariableDbId = DB_VARIABLES;
  const masterGroupDivCategoryDbId = DB_GROUP_DIV_CATEGORY;
  const masterRedirectDbId = DB_REDIRECT;
  const footerDbId = DB_FOOTER;
  const componentsDbId = DB_COMPONENT_TYPES;

  const [
    rawPages,
    rawSections,
    rawComponents,
    rawVariables,
    rawGroups,
    rawRedirects,
    rawFooter,
    rawRegistry,
  ] = await Promise.all([
    queryAll(masterPageDbId),
    queryAll(masterSectionsDbId),
    queryAll(masterComponentDbId),
    queryAll(masterVariableDbId),
    queryAll(masterGroupDivCategoryDbId),
    queryAll(masterRedirectDbId),
    queryAll(footerDbId),
    queryAll(componentsDbId),
  ]);

  // Variables
  const variables: Record<string, string> = {};
  for (const p of rawVariables) {
    variables[getTitle(p, PROP_VARIABLES.VARIABLE)] = getRichTextOrMentionId(
      p,
      PROP.VALUE,
    );
  }

  // Helper for applying variables
  const applyVariables = (text: string) => {
    if (!text) return text;
    let res = text;
    for (const [v, val] of Object.entries(variables)) {
      res = res.replaceAll(`$${v}$`, val);
      const asNumber = Number.parseInt(val, 10);
      if (!Number.isNaN(asNumber)) {
        res = res.replaceAll(`$${v}+1$`, String(asNumber + 1));
      }
    }
    return res;
  };

  // Group Categories
  const groupCategories: Record<string, CMSGroupCategory> = {};
  for (const p of rawGroups) {
    groupCategories[p.id] = {
      id: p.id,
      name: getTitle(p, PROP.NAME),
      type: getSelect(p, "Type"),
    };
  }

  // Component Registry
  const componentRegistry: Record<string, CMSComponentRegistry> = {};
  for (const p of rawRegistry) {
    componentRegistry[p.id] = {
      id: p.id,
      type: getSelect(p, "Type"),
      name: getTitle(p, PROP.NAME),
      variation1: getRichText(p, PROP_COMPONENT_TYPES.VARIATION_1),
      variation2: getRichText(p, PROP_COMPONENT_TYPES.VARIATION_2),
      variation3: getRichText(p, PROP_COMPONENT_TYPES.VARIATION_3),
      value1: getRichText(p, PROP_COMPONENT_TYPES.VALUE_1),
      value2: getRichText(p, PROP_COMPONENT_TYPES.VALUE_2),
      value3: getRichText(p, PROP_COMPONENT_TYPES.VALUE_3),
    };
  }

  // Footer
  const footer: CMSFooterComponent[] = rawFooter.map((p) => ({
    id: p.id,
    name: getTitle(p, PROP.NAME),
    show: getCheckbox(p, PROP.SHOW, true),
    group: getSelect(p, PROP_FOOTER.GROUP),
  }));

  // Redirects
  const redirects: CMSRedirect[] = rawRedirects.map((p) => ({
    id: p.id,
    name: getTitle(p, PROP.NAME),
    modified: getRichText(p, "Modified"),
    destinationUrl:
      getUrl(p, PROP_REDIRECT.DESTINATION_URL) ||
      getRichText(p, PROP_REDIRECT.DESTINATION_URL),
  }));

  // Master Components
  const componentsList: CMSComponent[] = rawComponents.map((p) => ({
    id: p.id,
    typeId: getRelationIds(p, PROP_CONTENT_COMPONENT.COMPONENT_TYPES)[0] || "",
    variation: getTitle(p, PROP_CONTENT_COMPONENT.COMPONENT_VARIATION),
    groupId:
      getRelationIds(p, PROP_CONTENT_COMPONENT.GROUP_DIV_CATEGORY)[0] || "",
    show: getCheckbox(p, PROP.SHOW, true),
    orderOrGroup: getRichText(p, PROP_CONTENT_COMPONENT.ORDER_OR_GROUP),
    value: applyVariables(getRichTextOrMentionId(p, PROP.VALUE)),
    value2: applyVariables(getRichTextOrMentionId(p, PROP.VALUE_2)),
    value3: applyVariables(getRichTextOrMentionId(p, PROP.VALUE_3)),
  }));

  // Link components to sections
  const sectionIdToComponents: Record<string, CMSComponent[]> = {};
  for (const c of componentsList) {
    const rawP = rawComponents.find((rc) => rc.id === c.id);
    if (!rawP) continue;
    const sectionIds = getRelationIds(rawP, PROP_CONTENT_COMPONENT.SECTIONS);
    if (sectionIds.length > 0) {
      const sectionId = sectionIds[0];
      if (!sectionIdToComponents[sectionId])
        sectionIdToComponents[sectionId] = [];
      sectionIdToComponents[sectionId].push(c);
    }
  }

  // Master Sections
  const sectionsList: CMSSection[] = rawSections.map((p) => {
    const sectionComps = sectionIdToComponents[p.id] || [];
    sectionComps.sort((a, b) => a.orderOrGroup.localeCompare(b.orderOrGroup));
    return {
      id: p.id,
      pageId: getRelationIds(p, PROP_SECTIONS.PAGE)[0] || "",
      sectionName: getTitle(p, PROP_SECTIONS.SECTION),
      slug: getRichText(p, PROP.SLUG),
      order: getRichText(p, PROP.ORDER),
      show: getCheckbox(p, PROP.SHOW, true),
      height: getSelect(p, PROP_SECTIONS.HEIGHT),
      components: sectionComps,
    };
  });

  // Link sections to pages
  const pageIdToSections: Record<string, CMSSection[]> = {};
  for (const s of sectionsList) {
    if (!pageIdToSections[s.pageId]) pageIdToSections[s.pageId] = [];
    pageIdToSections[s.pageId].push(s);
  }

  // Pages
  const pages: CMSPage[] = rawPages.map((p) => {
    const pSections = pageIdToSections[p.id] || [];
    pSections.sort((a, b) => a.order.localeCompare(b.order));
    return {
      id: p.id,
      name: getTitle(p, PROP.NAME),
      slug: getRichText(p, PROP.SLUG),
      type: getSelect(p, PROP_PAGES.TIPE),
      showInNav:
        getCheckbox(p, PROP_PAGES.SHOW_IN_NAV, true) &&
        getCheckbox(p, PROP_PAGES.TAMPILKAN_DI_NAVBAR, true),
      urutan: getRichText(p, PROP_PAGES.URUTAN),
      showFooter: getCheckbox(p, PROP_PAGES.SHOW_FOOTER, true),
      sections: pSections,
      maxWidth: getRichText(p, PROP_PAGES.MAX_WIDTH) || "7xl",
      seoTitle: getRichText(p, PROP_PAGES.SEO_TITLE) || undefined,
      seoDescription: getRichText(p, PROP_PAGES.SEO_DESCRIPTION) || undefined,
      seoKeywords: getRichText(p, PROP_PAGES.SEO_KEYWORDS) || undefined,
    };
  });

  return {
    pages,
    variables,
    groupCategories,
    componentRegistry,
    footer,
    redirects,
  };
}

export function normalizeCmsSlug(slug: string): string {
  const trimmed = slug.trim();
  if (trimmed === "/") return "/";
  if (!trimmed) return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

/** Resolve a CMS page from the request path (exact match, then longest prefix). */
export function findCmsPageForPath(
  pages: CMSPage[],
  path: string,
): CMSPage | undefined {
  const target = normalizeCmsSlug(path) || "/";
  const contentPages = pages.filter((p) => p.type !== "Redirect");

  if (target === "/") {
    return (
      contentPages.find((p) => p.name.trim().toLowerCase() === "beranda") ||
      contentPages.find((p) => normalizeCmsSlug(p.slug || "") === "/")
    );
  }

  const exact = contentPages.find(
    (p) => normalizeCmsSlug(p.slug || "") === target,
  );
  if (exact) return exact;

  const prefixMatches = contentPages
    .filter((p) => {
      const slug = normalizeCmsSlug(p.slug || "");
      if (!slug || slug === "/") return false;
      return target === slug || target.startsWith(`${slug}/`);
    })
    .sort(
      (a, b) =>
        normalizeCmsSlug(b.slug || "").length -
        normalizeCmsSlug(a.slug || "").length,
    );

  return prefixMatches[0];
}

export async function fetchContainerCMSReadThrough(): Promise<ContainerCMSData> {
  if (process.env.NODE_ENV !== "production") {
    // In development, bypass the Supabase snapshot to load live data directly from Notion
    return await fetchContainerCMS();
  }

  const snapshot = await readContainerCMSSnapshot();
  if (snapshot) return snapshot;

  const cms = await fetchContainerCMS();
  const snapshotResult = await writeContainerCMSSnapshot(cms);
  if (!snapshotResult.ok) {
    console.warn(
      "[CMS Snapshot] Notion fallback worked, snapshot not stored:",
      {
        table: snapshotResult.table,
        key: snapshotResult.key,
        error: snapshotResult.error,
      },
    );
  }

  return cms;
}

export async function syncContainerCMSSnapshot() {
  const data = await fetchContainerCMS();
  const snapshot = await writeContainerCMSSnapshot(data);
  return {
    data,
    snapshot,
  };
}

export const fetchContainerCMSCached = unstable_cache(
  async () => {
    try {
      return await fetchContainerCMSReadThrough();
    } catch (error) {
      console.error(
        "fetchContainerCMSCached failed, returning fallback:",
        error,
      );
      return {
        pages: [],
        variables: {},
        groupCategories: {},
        componentRegistry: {},
        footer: [],
        redirects: [],
      };
    }
  },
  ["notion-container"],
  { revalidate: 60, tags: ["notion-container"] },
);

/**
 * Get the Master Page database ID from Container CMS
 */
async function getMasterPageDatabaseId(): Promise<string> {
  return DB_PAGES;
}

/**
 * Resolve a page from Master Page database by name
 */
export async function resolvePageIdFromMasterPage(
  pageName: string,
): Promise<string> {
  const masterPageDbId = await getMasterPageDatabaseId();
  if (!masterPageDbId) return "";

  const pages = await queryAll(masterPageDbId);
  const page = pages.find(
    (p) => getTitle(p, PROP.NAME).toLowerCase() === pageName.toLowerCase(),
  );

  return page?.id || "";
}

/**
 * Get FAQ page ID by querying Master Page database
 */
export async function resolveFAQPageId(): Promise<string> {
  return resolvePageIdFromMasterPage("FAQ");
}

/**
 * Get Karya page ID by querying Master Page database
 */
export async function resolveKaryaPageId(): Promise<string> {
  return resolvePageIdFromMasterPage("Karya");
}

/**
 * Cached version of resolveFAQPageId
 */
export const resolveFAQPageIdCached = unstable_cache(
  async () => {
    return await resolveFAQPageId();
  },
  ["notion-faq"],
  { revalidate: 3600, tags: ["notion-faq"] },
);

export const resolveKaryaPageIdCached = unstable_cache(
  async () => {
    return await resolveKaryaPageId();
  },
  ["notion-karya"],
  { revalidate: 3600, tags: ["notion-karya"] },
);

export type CmsValueField = "value" | "value2" | "value3";

function registryFieldToCmsValue(
  registry: CMSComponentRegistry,
  field: CmsValueField,
): string {
  if (field === "value") return registry.value1;
  if (field === "value2") return registry.value2;
  return registry.value3;
}

/** Map Components DB Value 1/2/3 labels to instance fields via registry metadata. */
export function resolveCmsComponentFieldValue(
  cms: ContainerCMSData,
  componentName: string,
  fieldLabel: string,
): string | null {
  for (const page of cms.pages) {
    for (const section of page.sections) {
      for (const comp of section.components) {
        const registry = cms.componentRegistry[comp.typeId];
        if (!registry || registry.name !== componentName) continue;

        const v1Label = registry.value1.trim().toLowerCase();
        const v2Label = registry.value2.trim().toLowerCase();
        const v3Label = registry.value3.trim().toLowerCase();
        const target = fieldLabel.trim().toLowerCase();

        if (v1Label === target)
          return cleanCmsValue(comp.value, [registry.value1]) || null;
        if (v2Label === target)
          return cleanCmsValue(comp.value2, [registry.value2]) || null;
        if (v3Label === target)
          return cleanCmsValue(comp.value3, [registry.value3]) || null;
      }
    }
  }
  return null;
}

export function findCmsComponentInstances(
  cms: ContainerCMSData,
  componentName: string,
): CMSComponent[] {
  const matches: CMSComponent[] = [];
  for (const page of cms.pages) {
    for (const section of page.sections) {
      for (const comp of section.components) {
        const registry = cms.componentRegistry[comp.typeId];
        if (registry?.name === componentName) {
          matches.push(comp);
        }
      }
    }
  }
  return matches;
}

/** Database ID from Master Component (default: Value 2 / "Database ID"). */
export function resolveCmsComponentDatabaseId(
  cms: ContainerCMSData,
  componentName: string,
  field: CmsValueField = "value2",
): string | null {
  const instances = findCmsComponentInstances(cms, componentName);
  if (!instances.length) return null;

  for (const comp of instances) {
    const registry = cms.componentRegistry[comp.typeId];
    if (registry) {
      const byLabel = resolveCmsComponentFieldValue(
        cms,
        componentName,
        registryFieldToCmsValue(registry, field),
      );
      if (byLabel) return byLabel;
    }

    const raw =
      field === "value"
        ? comp.value
        : field === "value2"
          ? comp.value2
          : comp.value3;

    const registryLabel =
      field === "value"
        ? registry?.value1
        : field === "value2"
          ? registry?.value2
          : registry?.value3;

    const cleanValue = cleanCmsValue(raw, [registryLabel || ""]);
    if (cleanValue) return cleanValue;
  }

  return null;
}

export async function resolveProfilSdmDatabaseIdFromCms(): Promise<
  string | null
> {
  const cms = await fetchContainerCMSCached();
  return resolveCmsComponentDatabaseId(
    cms,
    "Struktur Organisasi Graph",
    "value2",
  );
}

export async function resolveKaryaDatabaseIdFromCms(): Promise<string | null> {
  const cms = await fetchContainerCMSCached();
  return resolveCmsComponentDatabaseId(cms, "Karya Grid", "value");
}

export function resolveProfilMaxBatchFromCms(cms: ContainerCMSData): number {
  const batchRaw =
    resolveCmsComponentFieldValue(
      cms,
      "Struktur Organisasi Graph",
      "Tampilkan Batch dari 1 Sampai",
    ) ??
    findCmsComponentInstances(cms, "Struktur Organisasi Graph")[0]?.value ??
    "";

  const cleaned = cleanCmsValue(batchRaw, ["Tampilkan Batch dari 1 Sampai"]);
  const batchToUse = cleaned || cms.variables.CURRENT_BATCH || "";
  const parsed = Number.parseInt(batchToUse, 10);
  return Number.isNaN(parsed) ? 999 : parsed;
}

export const createMockPage = (
  slug: string,
  componentTypeId: string,
): CMSPage => ({
  id: `mock-page-${componentTypeId}`,
  name: componentTypeId,
  slug,
  type: "Page",
  showInNav: false,
  urutan: "",
  showFooter: false,
  sections: [
    {
      id: `mock-section-${componentTypeId}`,
      pageId: `mock-page-${componentTypeId}`,
      sectionName: "Main",
      slug: "",
      order: "0",
      height: "Fit Content",
      show: true,
      components: [
        {
          id: `mock-comp-${componentTypeId}`,
          typeId: componentTypeId,
          groupId: "",
          orderOrGroup: "0",
          show: true,
          variation: "",
          value: "",
          value2: "",
          value3: "",
        },
      ],
    },
  ],
});

export interface NavItemDto {
  label: string;
  href?: string;
  isAnchor?: boolean;
}

export function getNavigationData(pages: CMSPage[]): {
  navItems: NavItemDto[];
  mobileNavItems: NavItemDto[];
  highlightItem: NavItemDto | null;
} {
  const getUrutanValue = (u: string) => {
    const val = Number.parseInt(u, 10);
    return Number.isNaN(val) ? 99999 : val;
  };

  // 1. Regular items
  const standardPages = pages
    .filter(
      (p) =>
        p.showInNav &&
        p.urutan?.toLowerCase() !== "logo" &&
        p.urutan?.toLowerCase() !== "highlight" &&
        p.urutan?.toLowerCase() !== "hidden",
    )
    .sort((a, b) => getUrutanValue(a.urutan) - getUrutanValue(b.urutan));

  const navItems: NavItemDto[] = standardPages.map((p) => {
    const isAnchor = p.name.toLowerCase() === "kontak";
    return {
      label: p.name,
      href: isAnchor ? undefined : p.slug,
      isAnchor,
    };
  });

  // 2. Highlight item
  const highlightPage = pages.find(
    (p) => p.urutan?.toLowerCase() === "highlight" && p.showInNav,
  );
  const highlightItem: NavItemDto | null = highlightPage
    ? { label: highlightPage.name, href: highlightPage.slug }
    : null;

  // 3. Logo/Beranda
  const logoPage = pages.find((p) => p.urutan?.toLowerCase() === "logo");
  const logoHref = logoPage?.slug || "/";
  const logoLabel = logoPage?.name || "Beranda";

  // 4. Mobile nav items
  const mobileNavItems: NavItemDto[] = [];
  mobileNavItems.push({ label: logoLabel, href: logoHref });

  // Non-anchor standard items
  const regularNonAnchor = navItems.filter((item) => !item.isAnchor);
  mobileNavItems.push(...regularNonAnchor);

  // Add highlight before Kontak anchor
  if (highlightItem) {
    mobileNavItems.push(highlightItem);
  }

  // Anchor items (like Kontak) at the end
  const anchorItems = navItems.filter((item) => item.isAnchor);
  mobileNavItems.push(...anchorItems);

  return {
    navItems,
    mobileNavItems,
    highlightItem,
  };
}
