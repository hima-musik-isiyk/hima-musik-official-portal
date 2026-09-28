"use client";

import Link from "next/link";
import React, { useMemo, useRef } from "react";

import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { FEATURES } from "@/lib/feature-flags";
import type { DocMeta, SekretariatCategory } from "@/lib/notion";
import { useCachedFetch } from "@/lib/useCachedFetch";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Category metadata                                                  */
/* ------------------------------------------------------------------ */

const FOCUSED_SECTIONS = [
  {
    key: "Pedoman",
    title: "Pedoman & SOP",
    description:
      "Panduan inti untuk alur administrasi, prosedur surat-menyurat, dan standar kerja sekretariat.",
    aliases: ["pedoman", "panduan", "sop", "prosedur"],
  },
  {
    key: "FAQ",
    title: "FAQ Sekretariat",
    description:
      "Jawaban cepat untuk pertanyaan yang paling sering diajukan terkait dokumen, layanan, dan birokrasi.",
    aliases: ["faq", "tanya", "pertanyaan", "qna"],
  },
  {
    key: "Laporan Kinerja",
    title: "Laporan Kinerja Bulanan",
    description:
      "Ringkasan eksekutif bulanan berisi capaian, progres program, dan update transparansi organisasi.",
    aliases: [
      "laporan kinerja",
      "executive",
      "eksekutif",
      "monthly",
      "bulanan",
      "summary",
      "ringkasan",
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface DocsPortalViewProps {
  docs?: DocMeta[];
  initialCategories?: SekretariatCategory[];
  value1?: string;
  value2?: string;
  value3?: string;
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function SekretariatGridSkeleton() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="rounded-2xl border border-white/5 bg-stone-900/10 p-6"
        >
          <LoadingSkeleton className="mb-4 h-7 w-2/3 rounded" />
          <div className="mb-6 space-y-2">
            <LoadingSkeleton className="h-3 w-full rounded" />
            <LoadingSkeleton className="h-3 w-4/5 rounded" />
          </div>
          <div className="space-y-2">
            <LoadingSkeleton className="h-9 rounded-xl" />
            <LoadingSkeleton className="h-9 rounded-xl" />
            <LoadingSkeleton className="h-9 rounded-xl" />
          </div>
        </div>
      ))}
    </>
  );
}

export default function SekretariatGrid({
  docs: initialDocs,
  initialCategories = [],
  value1: _value1,
  value2: _value2,
  value3: _value3,
}: DocsPortalViewProps) {
  const hasInitialData =
    initialDocs !== undefined || initialCategories.length > 0;
  const { data, isLoading } = useCachedFetch({
    url: "/api/sekretariat",
    cacheKey: "hima_sekretariat_cache",
    hasInitialData,
    initialData: {
      docs: initialDocs || [],
      categories: initialCategories || [],
    },
    select: (result) =>
      result?.success && result.data
        ? { docs: result.data, categories: result.categories || [] }
        : null,
  });

  const docs = data.docs;
  const cardsRef = useRef<HTMLDivElement>(null);

  // Grouping & Recently Updated calculations
  const { groupedDocs, recentlyUpdated, focusedSections } = useMemo(() => {
    const grouped: Record<string, DocMeta[]> = {};

    for (const doc of docs) {
      const cat = doc.category || "Umum";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(doc);
    }

    const sortedUpdated = [...docs]
      .sort(
        (a, b) =>
          new Date(b.lastEdited).getTime() - new Date(a.lastEdited).getTime(),
      )
      .slice(0, 3);

    const resolvedFocusedSections =
      data.categories.length > 0
        ? data.categories.map((category) => {
            const matchedDocs = (grouped[category.name] ?? []).sort(
              (a, b) => a.order - b.order,
            );
            return {
              key: category.id,
              title: category.name,
              description: category.description,
              docs: matchedDocs,
            };
          })
        : FOCUSED_SECTIONS.map((section) => {
            const aliases = section.aliases.map(normalize);
            const matchedDocs = docs
              .filter((doc) => {
                const haystack = [doc.category, doc.title, doc.slug]
                  .filter(Boolean)
                  .map(normalize)
                  .join(" ");
                return aliases.some((alias) => haystack.includes(alias));
              })
              .sort((a, b) => a.order - b.order);
            return {
              ...section,
              docs: matchedDocs,
            };
          });

    return {
      groupedDocs: grouped,
      recentlyUpdated: sortedUpdated,
      focusedSections: resolvedFocusedSections,
    };
  }, [docs, data.categories]);

  return (
    <div className="relative flex-1">
      {/* Main Grid: Categories & Recent */}
      <div className="grid gap-10 lg:grid-cols-3">
        {/* Left Columns: Category Cards */}
        <div
          ref={cardsRef}
          className={cn(
            "grid gap-6 md:grid-cols-2",
            FEATURES.SHOW_DOCS_SIDEBAR ? "lg:col-span-2" : "lg:col-span-3",
          )}
        >
          {isLoading && docs.length === 0 ? (
            <SekretariatGridSkeleton />
          ) : (
            focusedSections.map((section) => {
              const sectionDocs =
                section.docs.length > 0
                  ? section.docs
                  : (groupedDocs[section.key] ?? []);
              return (
                <div
                  key={section.key}
                  className="group relative flex flex-col rounded-2xl border border-white/5 bg-stone-900/10 p-6 transition-all duration-300 hover:border-stone-800/80 hover:bg-stone-900/20"
                  data-animate="up"
                >
                  <div className="relative mb-3">
                    <h2 className="group-hover:text-gold-400 font-serif text-xl text-white transition-colors">
                      {section.title}
                    </h2>
                  </div>

                  <p className="mb-6 text-[0.8125rem] leading-relaxed text-stone-500 transition-colors group-hover:text-stone-400">
                    {section.description}
                  </p>

                  <div className="mt-auto">
                    {sectionDocs.length > 0 ? (
                      <div className="space-y-2">
                        {sectionDocs.slice(0, 3).map((doc) => (
                          <Link
                            key={doc.id}
                            href={`/sekretariat/${doc.slug}`}
                            className="group/link flex items-center gap-2.5 rounded-xl border border-transparent px-3.5 py-2 text-xs text-stone-400 transition-colors hover:border-stone-800/50 hover:bg-stone-900/30 hover:text-white"
                          >
                            <span className="group-hover/link:text-gold-400 text-stone-600 transition-colors">
                              {doc.icon || (
                                <svg
                                  className="h-3 w-3"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M9 5l7 7-7 7"
                                  />
                                </svg>
                              )}
                            </span>
                            <span className="flex-1 truncate">{doc.title}</span>
                          </Link>
                        ))}
                        {sectionDocs.length > 3 && (
                          <p className="mt-2 text-center text-[0.65rem] font-medium tracking-wide text-stone-600">
                            +{sectionDocs.length - 3} DOKUMEN LAINNYA
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="border-t border-dashed border-stone-800/50 py-8 text-center text-stone-600">
                        <p className="text-[0.65rem] tracking-wider italic">
                          Dokumen belum ditambahkan untuk bagian ini.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Sidebar (Recently Updated & Forms) */}
        {FEATURES.SHOW_DOCS_SIDEBAR && (
          <div className="space-y-6">
            {/* Recently Updated */}
            <div
              data-animate="left"
              className="border border-white/5 p-8 transition-colors hover:bg-stone-900/10"
            >
              <div className="mb-6 flex items-center gap-4">
                <span
                  className="bg-gold-500/40 block h-px w-6"
                  aria-hidden="true"
                />
                <h3 className="font-serif text-xl text-white">
                  Update Terbaru
                </h3>
              </div>
              <div className="space-y-6">
                {recentlyUpdated.length > 0 ? (
                  recentlyUpdated.map((doc) => (
                    <Link
                      key={doc.id}
                      href={`/sekretariat/${doc.slug}`}
                      className="group block"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h4 className="group-hover:text-gold-400 truncate text-sm font-medium text-stone-300 transition-colors">
                          {doc.title}
                        </h4>
                        <span className="shrink-0 text-[10px] text-stone-600 uppercase">
                          {new Date(doc.lastEdited).toLocaleDateString(
                            "id-ID",
                            {
                              day: "numeric",
                              month: "short",
                            },
                          )}
                        </span>
                      </div>
                      <p className="mt-1 text-[10px] tracking-wider text-stone-500">
                        {doc.category}
                      </p>
                    </Link>
                  ))
                ) : (
                  <p className="text-xs text-stone-600">Belum ada aktivitas.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
