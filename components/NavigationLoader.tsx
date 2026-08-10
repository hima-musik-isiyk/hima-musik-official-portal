"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { getCanonicalClientPath } from "@/lib/cms-canonical";

/**
 * Full-screen navigation loading overlay.
 *
 * - Fades IN when a same-page anchor click is detected (navigation start).
 * - Fades OUT as soon as the pathname changes (navigation complete).
 * - No minimum visible duration — disappears the instant the next page is ready.
 * - Renders nothing in the DOM when fully hidden (pointer-events: none always).
 */
export default function NavigationLoader() {
  const rawPathname = usePathname();
  const pathname = getCanonicalClientPath(rawPathname);
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const prevPathname = useRef(pathname);
  const pendingNav = useRef(false);

  // Avoid SSR mismatch
  useEffect(() => setMounted(true), []);

  // Detect navigation start: intercept clicks on internal <a> elements
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = (e.target as HTMLElement).closest("a");
      if (!target) return;

      const href = target.getAttribute("href");
      if (!href) return;

      // Only intercept same-origin internal navigation (not hash-only, not external)
      const isSameOrigin = href.startsWith("/") && !href.startsWith("//");
      const isHashOnly = href.startsWith("#");
      const hasModifier = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
      const opensNewTab = target.getAttribute("target") === "_blank";

      if (isSameOrigin && !isHashOnly && !hasModifier && !opensNewTab) {
        // Only show loader if we're actually navigating to a different path
        const targetPath = getCanonicalClientPath(
          href.split("?")[0].split("#")[0],
        );
        const currentPath = getCanonicalClientPath(window.location.pathname);
        if (targetPath !== currentPath) {
          pendingNav.current = true;
          setVisible(true);
        }
      }
    }

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  // Detect navigation complete: pathname changed → hide
  useEffect(() => {
    if (!pendingNav.current) return;
    if (pathname !== prevPathname.current) {
      prevPathname.current = pathname;
      pendingNav.current = false;
      setVisible(false);
    }
  }, [pathname]);

  if (!mounted) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        opacity: visible ? 1 : 0,
        transition: "opacity 180ms ease",
      }}
    >
      {/* Backdrop */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(10, 10, 10, 0.65)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
        }}
      />

      {/* Loading card */}
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "14px",
          padding: "28px 36px",
          background: "rgba(18, 18, 18, 0.92)",
          border: "1px solid rgba(255, 255, 255, 0.07)",
          borderRadius: "var(--radius-action, 0.5rem)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
          transform: visible
            ? "translateY(0) scale(1)"
            : "translateY(6px) scale(0.97)",
          transition: "transform 200ms ease, opacity 180ms ease",
        }}
      >
        {/* Spinning arc SVG — gold accent, no icon lib */}
        <svg
          width="32"
          height="32"
          viewBox="0 0 32 32"
          fill="none"
          style={{
            animation: "nav-spin 0.9s linear infinite",
          }}
        >
          <circle
            cx="16"
            cy="16"
            r="13"
            stroke="rgba(255,255,255,0.07)"
            strokeWidth="2.5"
          />
          <path
            d="M16 3 A13 13 0 0 1 29 16"
            stroke="#ff6501"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>

        <span
          style={{
            fontFamily: "var(--font-sans, Inter, sans-serif)",
            fontSize: "11px",
            fontWeight: 500,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.35)",
          }}
        >
          Memuat
        </span>
      </div>

      {/* Keyframe injected inline — avoids any CSS file dependency */}
      <style>{`
        @keyframes nav-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
