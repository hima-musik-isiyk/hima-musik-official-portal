import { notFound } from "next/navigation";
import React from "react";

import { PageBuilder } from "@/components/builder/PageBuilder";
import { PreviewBar } from "@/components/preview/PreviewBar";
import { getIsPreviewMode } from "@/lib/cms-route";
import { fetchKKMEntryBySlug } from "@/lib/notion";

interface KKMDetailProps {
  params: Promise<{ slug: string }>;
}

export default async function KKMDetailPage({ params }: KKMDetailProps) {
  const [{ slug }, isPreview] = await Promise.all([params, getIsPreviewMode()]);
  const result = await fetchKKMEntryBySlug(slug);

  if (!result) return notFound();

  return (
    <>
      <PageBuilder
        pathname={`/kkm/${slug}`}
        overrideComponent="Doc Page"
        injectedProps={{
          "Doc Page": {
            doc: result.meta,
            blocks: result.blocks,
            sectionHref: "/kkm",
            sectionLabel: "KKM",
            showCategory: false,
            contentBasePath: "/kkm",
            citationScope: "kkm",
          },
        }}
      />
      {isPreview && <PreviewBar />}
    </>
  );
}
