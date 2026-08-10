"use client";

import { useState } from "react";

type RefreshState = "idle" | "loading" | "success" | "cooldown" | "error";

export function PreviewBar() {
  const [state, setState] = useState<RefreshState>("idle");
  const [cooldownSecs, setCooldownSecs] = useState(0);

  async function handleRefresh() {
    if (state === "loading") return;
    setState("loading");

    try {
      const res = await fetch("/api/notion/revalidate", { method: "POST" });
      const json = await res.json();

      if (json.status === "cooldown") {
        setCooldownSecs(json.secondsLeft ?? 10);
        setState("cooldown");
        return;
      }

      if (!res.ok || !json.ok) {
        setState("error");
        setTimeout(() => setState("idle"), 3000);
        return;
      }

      setState("success");
      // Give a moment for the user to see "Berhasil" before reload
      setTimeout(() => window.location.reload(), 800);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 3000);
    }
  }

  const labelMap: Record<RefreshState, string> = {
    idle: "Refresh Konten",
    loading: "Menyinkronkan…",
    success: "Berhasil! Memuat ulang…",
    cooldown: `Tunggu ${cooldownSecs}s`,
    error: "Gagal — coba lagi",
  };

  const isDisabled =
    state === "loading" || state === "success" || state === "cooldown";

  return (
    <div
      className="border-gold-500/30 fixed right-5 bottom-5 z-50 flex items-center gap-3 border bg-[#0f0f0f]/95 px-4 py-3 shadow-xl backdrop-blur-sm"
      style={{ borderRadius: "var(--radius-action)" }}
      role="status"
      aria-live="polite"
    >
      {/* Preview badge */}
      <span className="flex items-center gap-1.5">
        {/* Animated dot */}
        <span className="relative flex size-2" aria-hidden="true">
          <span className="bg-gold-500 absolute inline-flex size-full animate-ping rounded-full opacity-50" />
          <span className="bg-gold-500 relative inline-flex size-2 rounded-full" />
        </span>
        <span className="text-gold-500 font-sans text-xs font-semibold tracking-widest uppercase">
          Preview
        </span>
      </span>

      {/* Divider */}
      <span className="h-4 w-px bg-white/10" aria-hidden="true" />

      {/* Refresh button */}
      <button
        id="preview-bar-refresh-btn"
        onClick={handleRefresh}
        disabled={isDisabled}
        className="flex items-center gap-2 font-sans text-xs font-medium text-neutral-300 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Refresh konten dari Notion"
      >
        {/* Inline SVG: rotate-cw icon */}
        <svg
          width="13"
          height="13"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={state === "loading" ? "animate-spin" : ""}
        >
          <path d="M13.5 2.5v4h-4" />
          <path d="M2 8a6 6 0 0 1 10.31-4.17L13.5 6.5" />
          <path d="M2.5 13.5v-4h4" />
          <path d="M14 8a6 6 0 0 1-10.31 4.17L2.5 9.5" />
        </svg>
        {labelMap[state]}
      </button>
    </div>
  );
}
