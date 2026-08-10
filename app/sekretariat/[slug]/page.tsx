import { notFound } from "next/navigation";
import React from "react";

import { PageBuilder } from "@/components/builder/PageBuilder";
import { fetchDocBySlug } from "@/lib/notion";

interface DocRouteProps {
  params: Promise<{ slug: string }>;
}

export default async function DocRoutePage({ params }: DocRouteProps) {
  const { slug } = await params;
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
    </>
  );
}
