import { notFound } from "next/navigation";
import React from "react";

import { PageBuilder } from "@/components/builder/PageBuilder";
import { fetchEventBySlug, fetchKKMGroups } from "@/lib/notion";

interface EventDetailRouteProps {
  params: Promise<{ slug: string }>;
}

export default async function EventDetailRepostRoute({
  params,
}: EventDetailRouteProps) {
  const { slug } = await params;
  const result = await fetchEventBySlug(slug, { allowPreview: true }); // Allow draft/active

  if (!result) return notFound();

  let kkmHref = "/agenda";
  if (result.meta.ownerUnit) {
    const kkmGroups = await fetchKKMGroups();
    const matched = kkmGroups.find(
      (g) => g.name.toLowerCase() === result.meta.ownerUnit?.toLowerCase(),
    );
    if (matched) {
      kkmHref = `/kkm/${matched.slug}`;
    }
  }

  // Treat as active for the repost view to bypass draft indicators
  const forcedMeta = { ...result.meta, status: "Active" };

  return (
    <>
      <PageBuilder
        pathname={`/agenda/repost/${slug}`}
        overrideComponent="Event Detail"
        injectedProps={{
          "Event Detail": {
            meta: forcedMeta,
            blocks: result.blocks,
            kkmHref,
          },
        }}
      />
    </>
  );
}
