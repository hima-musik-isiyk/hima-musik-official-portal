import { notFound } from "next/navigation";
import React from "react";

import { PageBuilder } from "@/components/builder/PageBuilder";
import { fetchKKMEntryBySlug } from "@/lib/notion";

interface KKMDetailProps {
  params: Promise<{ slug: string }>;
}

export default async function KKMDetailPage({ params }: KKMDetailProps) {
  const { slug } = await params;
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
    </>
  );
}
