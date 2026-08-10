import { notFound } from "next/navigation";
import React from "react";

import { PageBuilder } from "@/components/builder/PageBuilder";
import { PreviewBar } from "@/components/preview/PreviewBar";
import { getIsPreviewMode } from "@/lib/cms-route";
import { fetchDocBySlug } from "@/lib/notion";

interface DocRouteProps {
  params: Promise<{ slug: string }>;
}

export default async function DocRoutePage({ params }: DocRouteProps) {
  const [{ slug }, isPreview] = await Promise.all([params, getIsPreviewMode()]);
  const result = await fetchDocBySlug(slug);

  if (!result) return notFound();

  return (
    <>
      <PageBuilder
        pathname={`/sekretariat/${slug}`}
        overrideComponent="Doc Page"
        injectedProps={{
          "Doc Page": { doc: result.meta, blocks: result.blocks },
        }}
      />
      {isPreview && <PreviewBar />}
    </>
  );
}
