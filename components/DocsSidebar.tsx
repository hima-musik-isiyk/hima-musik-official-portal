"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";

import type { DocMeta } from "@/lib/notion";

/* ------------------------------------------------------------------ */
/*  Group docs by category                                             */
/* ------------------------------------------------------------------ */

interface GroupedDocs {
  [category: string]: DocMeta[];
}

function groupByCategory(docs: DocMeta[]): GroupedDocs {
  const groups: GroupedDocs = {};
  for (const doc of docs) {
    const cat = doc.category || "Umum";
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(doc);
  }
  return groups;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

import { getCanonicalClientPath } from "@/lib/cms-route";

interface DocsSidebarProps {
  docs: DocMeta[];
}

export default function DocsSidebar({ docs }: DocsSidebarProps) {
  const rawPathname = usePathname();
  const pathname = getCanonicalClientPath(rawPathname);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const lastPathnameRef = useRef(pathname);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(),
  );

  const grouped = groupByCategory(docs);

  /* Auto-expand category of current active page */
  useEffect(() => {
    const currentSlug = pathname
      ?.replace("/sekretariat/", "")
      .replace("/sekretariat", "");
    for (const [cat, catDocs] of Object.entries(grouped)) {
      if (catDocs.some((d) => d.slug === currentSlug)) {
        setExpandedCategories((prev) => new Set([...prev, cat]));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  /* Close mobile sidebar on nav */
  useEffect(() => {
    const pathChanged = pathname !== lastPathnameRef.current;
    if (pathChanged && isMobileOpen) {
      window.dispatchEvent(new CustomEvent("toggleDocsSidebar"));
    }
    lastPathnameRef.current = pathname;
  }, [pathname, isMobileOpen]);

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  /* Handle external toggle event from Navbar */
  useEffect(() => {
    const handleToggle = () => setIsMobileOpen((prev) => !prev);
    window.addEventListener("toggleDocsSidebar", handleToggle);
    return () => window.removeEventListener("toggleDocsSidebar", handleToggle);
  }, []);

  return (
    <>
      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => {
            window.dispatchEvent(new CustomEvent("toggleDocsSidebar"));
          }}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-20 left-0 z-30 h-[calc(100vh-5rem)] w-72 transform overflow-y-auto border-r border-white/5 bg-[#0a0a0a]/95 px-4 py-6 backdrop-blur-xl transition-transform duration-300 lg:sticky lg:z-0 lg:translate-x-0 lg:bg-transparent lg:backdrop-blur-none ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/sekretariat"
            onClick={() => {
              if (isMobileOpen) {
                window.dispatchEvent(new CustomEvent("toggleDocsSidebar"));
              }
            }}
            className="group flex items-center gap-3 rounded-xl border border-stone-800/80 bg-stone-900/30 px-4 py-3 text-sm font-semibold tracking-[0.2em] uppercase transition-all duration-300 hover:border-stone-700 hover:bg-stone-900/50"
          >
            <span className="group-hover:text-gold-300 text-white transition-colors">
              Sekretariat
            </span>
          </Link>
        </div>

        {/* Navigation tree */}
        <nav className="space-y-1">
          {Object.entries(grouped).map(([category, catDocs]) => {
            const isExpanded = expandedCategories.has(category);

            return (
              <div key={category}>
                <button
                  onClick={() => toggleCategory(category)}
                  className="group flex w-full items-center gap-2 rounded-xl border border-transparent px-3 py-2 text-left text-xs font-semibold tracking-wider text-stone-400 uppercase transition-all duration-300 hover:border-stone-800/50 hover:bg-stone-900/30 hover:text-white"
                >
                  <span className="flex-1">{category}</span>
                  <svg
                    className={`h-3 w-3 transition-transform duration-200 ${
                      isExpanded ? "rotate-90" : ""
                    }`}
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
                </button>

                {isExpanded && (
                  <div className="ml-3 space-y-0.5 border-l border-stone-800 pl-3">
                    {catDocs.map((doc) => {
                      const currentSlug = pathname
                        ?.replace("/sekretariat/", "")
                        .replace("/sekretariat", "");
                      const isActive = currentSlug === doc.slug;

                      return (
                        <Link
                          key={doc.id}
                          href={`/sekretariat/${doc.slug}`}
                          className={`block rounded-xl border px-3 py-2 text-sm transition-all duration-200 ${
                            isActive
                              ? "bg-gold-500/5 border-gold-500/20 text-gold-300 font-medium"
                              : "border-transparent text-stone-500 hover:border-stone-800 hover:bg-stone-900/40 hover:text-white"
                          }`}
                        >
                          {doc.icon && (
                            <span className="mr-1.5">{doc.icon}</span>
                          )}
                          {doc.title}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Empty state */}
        {docs.length === 0 && (
          <div className="mt-8 rounded-lg border border-dashed border-stone-800 p-6 text-center">
            <p className="text-sm text-stone-500">
              Belum ada dokumen terpublikasi.
            </p>
            <p className="mt-2 text-xs text-stone-600">
              Dokumen akan muncul setelah Sekretaris mempublikasi dari Notion.
            </p>
          </div>
        )}
      </aside>
    </>
  );
}
