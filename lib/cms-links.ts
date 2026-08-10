import type { CMSPage, CMSSection, ContainerCMSData } from "./notion-builder";

function normalizePagePath(slug: string): string {
  const trimmed = slug.trim();
  if (trimmed === "/") return "/";
  if (!trimmed) return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function normalizeSectionHash(slug: string): string {
  const trimmed = slug.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

type SectionWithPage = CMSSection & { pageSlug: string };

function flattenSections(pages: CMSPage[]): SectionWithPage[] {
  return pages.flatMap((page) => {
    const pageSlug = normalizePagePath(page.slug || "");
    return page.sections.map((section) => ({ ...section, pageSlug }));
  });
}

function matchKey(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeNotionId(id: string): string {
  const compact = id.replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/i.test(compact)) return id.trim();
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

/**
 * Resolve Master Component Value 3 to a navigable href.
 * Value 3 may be a Master Page name/slug, Master Section name/slug,
 * or an already-resolved path (#anchor, /path, URL).
 */
export function resolveCmsHref(
  value3: string,
  cmsData: ContainerCMSData,
  contextPageId?: string,
): string {
  const raw = value3?.trim() ?? "";
  if (!raw) return "";

  if (
    raw.startsWith("/") ||
    raw.startsWith("http://") ||
    raw.startsWith("https://") ||
    raw.startsWith("mailto:") ||
    raw.startsWith("tel:")
  ) {
    return raw;
  }

  if (raw.startsWith("www.")) {
    return `https://${raw}`;
  }

  // Handle Notion URLs (e.g. https://www.notion.so/Page-Name-1a2b3c4d5e...)
  if (raw.includes("notion.so/")) {
    const hexMatch = raw.match(
      /([0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
    );
    if (hexMatch) {
      const extractedId = normalizeNotionId(hexMatch[1]);
      const contentPagesForNotion = cmsData.pages.filter(
        (p) => p.type !== "Redirect",
      );
      const pageMatch = contentPagesForNotion.find((p) => p.id === extractedId);
      if (pageMatch) {
        return normalizePagePath(pageMatch.slug || "/");
      }
      const allSectionsForNotion = flattenSections(contentPagesForNotion);
      const sectionMatch = allSectionsForNotion.find(
        (s) => s.id === extractedId,
      );
      if (sectionMatch && sectionMatch.pageSlug) {
        return `${sectionMatch.pageSlug}${normalizeSectionHash(sectionMatch.slug || "")}`;
      }
    }
  }

  // Handle bare domain links (e.g. forms.gle/xyz, docs.google.com/forms/...)
  if (
    /^(?:[a-zA-Z0-9-]+\.)+(?:com|org|net|io|co|gle|id|me|app|dev|link|site|gov|edu|gg|form)(?:\/[^\s]*)?$/i.test(
      raw,
    )
  ) {
    return `https://${raw}`;
  }

  if (raw.startsWith("#")) {
    if (contextPageId) {
      const page = cmsData.pages.find((p) => p.id === contextPageId);
      if (page) {
        return `${normalizePagePath(page.slug || "/")}${normalizeSectionHash(raw)}`;
      }
    }
    return normalizeSectionHash(raw);
  }

  const key = matchKey(raw);

  // Check explicit submission redirects
  if (
    key.includes("formulir agenda") ||
    key.includes("submit agenda") ||
    key.includes("36e3b26dc3be80a8955bcbf8933c8cdb")
  ) {
    return "/agenda/submit";
  }
  if (
    key.includes("formulir karya") ||
    key.includes("submit karya") ||
    key.includes("36e3b26dc3be8006bcd0c2dc60ff54f2")
  ) {
    return "/karya/submit";
  }

  // Check CMS Redirects database entries
  if (cmsData?.redirects && cmsData.redirects.length > 0) {
    const redirectMatch = cmsData.redirects.find((r) => {
      const rName = matchKey(r.name || "");
      const rSource = matchKey(r.destinationUrl ? r.id : "");
      return rName === key || rSource === key;
    });

    if (redirectMatch?.destinationUrl) {
      // Return source path if present, otherwise direct destination
      return redirectMatch.name.toLowerCase().includes("agenda")
        ? "/agenda/submit"
        : redirectMatch.name.toLowerCase().includes("karya")
          ? "/karya/submit"
          : redirectMatch.destinationUrl;
    }
  }
  const contentPages = cmsData.pages.filter((p) => p.type !== "Redirect");

  const normalizedId = normalizeNotionId(raw);

  const pageMatch = contentPages.find((p) => {
    const pageSlug = normalizePagePath(p.slug || "");
    return (
      p.id === normalizedId ||
      matchKey(p.name) === key ||
      matchKey(pageSlug) === key ||
      matchKey(pageSlug.replace(/^\//, "")) === key
    );
  });

  if (pageMatch) {
    return normalizePagePath(pageMatch.slug || "/");
  }

  const allSections = flattenSections(contentPages);
  const contextSections = contextPageId
    ? allSections.filter((s) => s.pageId === contextPageId)
    : [];
  const pool = [...contextSections, ...allSections];

  const sectionMatch = pool.find((s) => {
    const hash = normalizeSectionHash(s.slug || "");
    return (
      s.id === normalizedId ||
      matchKey(s.sectionName) === key ||
      matchKey(hash) === key ||
      matchKey(hash.replace(/^#/, "")) === key
    );
  });

  if (sectionMatch && sectionMatch.pageSlug) {
    return `${sectionMatch.pageSlug}${normalizeSectionHash(sectionMatch.slug || "")}`;
  }

  // If raw contains slashes or looks like a URL/path fallback, preserve it
  if (raw.includes("/")) {
    return raw.startsWith("http") || raw.startsWith("/")
      ? raw
      : `https://${raw}`;
  }

  return "";
}
