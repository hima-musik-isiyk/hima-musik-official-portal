import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageBuilder } from "@/components/builder/PageBuilder";
import PageEntranceWrapper from "@/components/builder/PageEntranceWrapper";
import { getRequestPathname } from "@/lib/cms-route";
import {
  fetchFAQCategoriesCached,
  fetchFAQEntries,
  filterFAQVisibility,
} from "@/lib/faq";
import { FEATURES } from "@/lib/feature-flags";
import {
  fetchCurrentRecruitmentTimelineCached,
  fetchEventsCollection,
  fetchKaryaEntries,
  fetchKKMGroups,
  fetchKKMModularDataCached,
  fetchSekretariatPortalData,
} from "@/lib/notion";
import {
  fetchContainerCMSCached,
  findCmsPageForPath,
} from "@/lib/notion-builder";

interface CatchAllProps {
  params: Promise<{ slug?: string[] }>;
}

export async function generateMetadata({
  params: _params,
}: CatchAllProps): Promise<Metadata> {
  await _params;
  const path = await getRequestPathname();

  try {
    const cmsData = await fetchContainerCMSCached();
    const page = findCmsPageForPath(cmsData.pages, path);

    if (page && (page.seoTitle || page.seoDescription || page.seoKeywords)) {
      const title = page.seoTitle;
      const description = page.seoDescription || undefined;
      const keywords = page.seoKeywords
        ? page.seoKeywords.split(",").map((k) => k.trim())
        : undefined;

      return {
        title,
        description,
        keywords,
        openGraph: {
          title,
          description,
          type: "website",
        },
      };
    }
  } catch (error) {
    console.error("Error generating metadata:", error);
  }

  return {};
}

export default async function CatchAllPage({ params: _params }: CatchAllProps) {
  const path = await getRequestPathname();

  // Check feature flags first
  if (path.startsWith("/pendaftaran")) {
    if (!FEATURES.ALLOW_PENDAFTARAN) {
      redirect("/");
    }
  }

  const cmsData = await fetchContainerCMSCached();

  // Route matches and injectedProps
  let injectedProps: Record<string, unknown> | undefined = undefined;

  if (path === "/kkm") {
    const pageId = "02 KKM";
    const data = await fetchKKMModularDataCached(pageId);
    injectedProps = {
      "KKM Grid": { hero: data.hero, groups: data.groups },
    };
  } else if (path === "/sekretariat") {
    const { docs, categories } = await fetchSekretariatPortalData();
    injectedProps = {
      "Sekretariat Grid": { docs, initialCategories: categories },
      "Sekretariat Sidebar": { docs },
    };
  } else if (path === "/agenda") {
    const [collection, kkmGroups] = await Promise.all([
      fetchEventsCollection(),
      fetchKKMGroups(),
    ]);
    injectedProps = {
      "Agenda List": { collection, kkmGroups },
    };
  } else if (path === "/karya") {
    const entries = await fetchKaryaEntries();
    injectedProps = {
      "Karya Grid": { entries },
    };
  } else if (path === "/pendaftaran") {
    const timeline = await fetchCurrentRecruitmentTimelineCached();
    injectedProps = {
      "Timeline Seleksi": { timeline },
    };
  } else if (path === "/faq") {
    const [rawEntries, categories] = await Promise.all([
      fetchFAQEntries(),
      fetchFAQCategoriesCached(),
    ]);
    const entries = filterFAQVisibility(rawEntries);
    injectedProps = {
      "FAQ List": {
        initialEntries: entries,
        initialCategories: categories,
      },
    };
  }

  return (
    <>
      <PageEntranceWrapper route={path}>
        <PageBuilder
          pathname={path}
          pageData={cmsData}
          injectedProps={injectedProps}
        />
      </PageEntranceWrapper>
    </>
  );
}

export async function generateStaticParams() {
  try {
    const cmsData = await fetchContainerCMSCached();
    const params: Array<{ slug: string[] }> = [{ slug: [] }];

    if (cmsData?.pages) {
      cmsData.pages
        .filter((page) => page.type !== "Redirect")
        .forEach((page) => {
          const slug =
            page.slug?.trim().replace(/^\//, "").split("/").filter(Boolean) ||
            [];
          if (slug.length > 0) {
            params.push({ slug });
          }
        });
    }
    return params;
  } catch (error) {
    console.error("Error generating static params:", error);
    return [{ slug: [] }];
  }
}
