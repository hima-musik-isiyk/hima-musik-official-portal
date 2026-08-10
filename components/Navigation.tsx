"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { getCanonicalClientPath } from "@/lib/cms-canonical";
import { FEATURES } from "@/lib/feature-flags";
import { getCmsGsapEasing, gsap } from "@/lib/gsap";
import {
  createCommandPaletteShortcutEvent,
  SHORTCUT_SYMBOL_CLASS,
  tokenizeShortcutLabel,
  useCommandPaletteShortcutLabel,
} from "@/lib/shortcut";
import {
  flagViewEntranceForNextRoute,
  isEntranceAnimateEnabled,
} from "@/lib/view-entrance";

import LogoHima from "./LogoHima";

/* ------------------------------------------------------------------ */
/*  Menu data                                                          */
/* ------------------------------------------------------------------ */

interface NavItem {
  label: string;
  href?: string;
  isAnchor?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Profil", href: "/profil" },
  { label: "KKM", href: "/kkm" },
  { label: "Agenda", href: "/agenda" },
  { label: "Karya", href: "/karya" },
  { label: "FAQ", href: "/faq" },
  { label: "Sekretariat", href: "/sekretariat" },
  { label: "Aduan", href: "/aduan" },
  { label: "Kontak", isAnchor: true },
];

const MOBILE_NAV_ITEMS: NavItem[] = [
  { label: "Beranda", href: "/" },
  { label: "Profil", href: "/profil" },
  { label: "KKM", href: "/kkm" },
  { label: "Agenda", href: "/agenda" },
  { label: "Karya", href: "/karya" },
  { label: "FAQ", href: "/faq" },
  { label: "Sekretariat", href: "/sekretariat" },
  { label: "Aduan", href: "/aduan" },
  { label: "Kontak", isAnchor: true },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export interface NavItemDto {
  label: string;
  href?: string;
  isAnchor?: boolean;
}

interface NavigationProps {
  navItems?: NavItemDto[];
  mobileNavItems?: NavItemDto[];
  highlightItem?: NavItemDto | null;
}

const Navigation: React.FC<NavigationProps> = ({
  navItems: propNavItems,
  mobileNavItems: propMobileNavItems,
  highlightItem: propHighlightItem,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLogoHovered, setIsLogoHovered] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [activeMobileIndex, setActiveMobileIndex] = useState<number | null>(
    null,
  );
  const [isCompactMobileMenu, setIsCompactMobileMenu] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [mobileMenuLayer, setMobileMenuLayer] = useState(40);
  const [circleLayers, setCircleLayers] = useState({ base: 42, top: 44 });
  const [navLayer, setNavLayer] = useState(50);
  const [hasMounted, setHasMounted] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const commandPaletteShortcutLabel = useCommandPaletteShortcutLabel();

  const navBarRef = useRef<HTMLElement | null>(null);
  const mobileLinkRefs = useRef<HTMLAnchorElement[]>([]);
  const mobileRippleRefs = useRef<HTMLSpanElement[]>([]);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);
  const fullscreenCircleBaseRef = useRef<HTMLDivElement | null>(null);
  const fullscreenCircleTopRef = useRef<HTMLDivElement | null>(null);
  const isNavigatingRef = useRef(false);
  const menuLayerCounterRef = useRef(40);
  const mobileMenuTimelineRef = useRef<gsap.core.Timeline | null>(null);
  const mobileMenuAnimationIdRef = useRef(0);
  const menuCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const ease = getCmsGsapEasing();

  const rawPathname = usePathname();
  const currentPath = getCanonicalClientPath(rawPathname);
  const router = useRouter();

  const navItems = React.useMemo(() => {
    return propNavItems || NAV_ITEMS;
  }, [propNavItems]);

  const highlightItem = React.useMemo(() => {
    if (propHighlightItem !== undefined) return propHighlightItem;
    return FEATURES.ALLOW_PENDAFTARAN
      ? { label: "Open Recruitment", href: "/pendaftaran" }
      : null;
  }, [propHighlightItem]);

  const mobileNavItems = React.useMemo(() => {
    if (propMobileNavItems) return propMobileNavItems;
    if (FEATURES.ALLOW_PENDAFTARAN) {
      const items = [...MOBILE_NAV_ITEMS];
      items.splice(items.length - 1, 0, {
        label: "Pendaftaran",
        href: "/pendaftaran",
      });
      return items;
    }
    return MOBILE_NAV_ITEMS;
  }, [propMobileNavItems]);

  useEffect(() => {
    setHasMounted(true);

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduceMotion || !isEntranceAnimateEnabled()) return;

    const context = gsap.context(() => {
      const timeline = gsap.timeline({ defaults: { ease } });
      if (navBarRef.current) {
        timeline.fromTo(
          navBarRef.current,
          { y: -14, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.5,
            clearProps: "transform,opacity",
          },
        );
      }
      if (mobileMenuRef.current) {
        gsap.set(mobileMenuRef.current, { yPercent: -100, autoAlpha: 0 });
      }
    });

    const handleSidebarToggle = () => setIsSidebarOpen((prev) => !prev);
    window.addEventListener("toggleDocsSidebar", handleSidebarToggle);

    return () => {
      context.revert();
      window.removeEventListener("toggleDocsSidebar", handleSidebarToggle);
    };
  }, [currentPath, ease]);

  /* ------ Prefetch all navigation routes on mount ----- */
  useEffect(() => {
    if (!router) return;
    const routes = new Set<string>();
    navItems.forEach((item) => {
      if (item.href && !item.isAnchor) {
        routes.add(item.href);
      }
    });
    mobileNavItems.forEach((item) => {
      if (item.href && !item.isAnchor) {
        routes.add(item.href);
      }
    });
    routes.forEach((route) => {
      router.prefetch(route);
    });
  }, [navItems, mobileNavItems, router]);

  /* ------ Mobile menu open/close ----- */
  useEffect(() => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (!mobileMenuRef.current) return;

    if (mobileMenuTimelineRef.current) {
      mobileMenuTimelineRef.current.kill();
      mobileMenuTimelineRef.current = null;
    }

    const animationId = ++mobileMenuAnimationIdRef.current;
    const activeMobileLinks = mobileLinkRefs.current.filter(Boolean);
    const clickedMobileLink =
      activeMobileIndex !== null
        ? mobileLinkRefs.current[activeMobileIndex]
        : null;
    const nonClickedMobileLinks = clickedMobileLink
      ? activeMobileLinks.filter((link) => link !== clickedMobileLink)
      : activeMobileLinks;

    if (reduceMotion) {
      gsap.set(
        mobileMenuRef.current,
        isMenuOpen
          ? { yPercent: 0, autoAlpha: 1 }
          : { yPercent: -100, autoAlpha: 0 },
      );
      return;
    }

    gsap.killTweensOf([mobileMenuRef.current, ...activeMobileLinks]);

    if (isMenuOpen) {
      gsap.set(mobileMenuRef.current, { autoAlpha: 1 });
      const openTimeline = gsap.timeline();
      mobileMenuTimelineRef.current = openTimeline;
      openTimeline
        .to(mobileMenuRef.current, {
          yPercent: 0,
          duration: 0.2,
          ease,
        })
        .fromTo(
          activeMobileLinks,
          { y: 6, opacity: 1 },
          {
            y: 0,
            duration: 0.16,
            stagger: 0.015,
            ease,
            clearProps: "transform",
          },
          "<",
        );
      return;
    }

    const closeTimeline = gsap.timeline({
      onComplete: () => {
        if (animationId !== mobileMenuAnimationIdRef.current) return;
        isNavigatingRef.current = false;
        setIsNavigating(false);
        setActiveMobileIndex(null);
      },
    });
    mobileMenuTimelineRef.current = closeTimeline;

    if (isNavigatingRef.current) {
      closeTimeline.to(
        nonClickedMobileLinks,
        {
          opacity: 0,
          duration: 0.1,
          stagger: 0.005,
          ease,
        },
        0,
      );
      if (clickedMobileLink) {
        closeTimeline.to(
          clickedMobileLink,
          {
            opacity: 0,
            duration: 0.2,
            ease,
          },
          0.02,
        );
      }
      closeTimeline
        .to(
          mobileMenuRef.current,
          {
            autoAlpha: 0,
            duration: 0.3,
            ease,
            delay: 0.08,
          },
          0,
        )
        .set(mobileMenuRef.current, { yPercent: -100 });
    } else {
      closeTimeline
        .to(activeMobileLinks, {
          y: 6,
          opacity: 0,
          duration: 0.16,
          stagger: 0.015,
          ease,
        })
        .to(
          mobileMenuRef.current,
          {
            yPercent: -100,
            autoAlpha: 0,
            duration: 0.32,
            ease,
          },
          "<0.02",
        );
    }
  }, [activeMobileIndex, isMenuOpen, ease]);

  /* ------ Helpers ----- */
  const clearMenuCloseTimeout = () => {
    if (menuCloseTimeoutRef.current) {
      clearTimeout(menuCloseTimeoutRef.current);
      menuCloseTimeoutRef.current = null;
    }
  };

  const bumpLayerStack = (mode: "menu-open" | "nav-transition") => {
    menuLayerCounterRef.current += 3;
    const nextMenuLayer = menuLayerCounterRef.current;
    if (mode === "menu-open" || mode === "nav-transition") {
      setCircleLayers({ base: nextMenuLayer, top: nextMenuLayer + 1 });
      setMobileMenuLayer(nextMenuLayer + 2);
    }
    setNavLayer(nextMenuLayer + 10);
  };

  const handleMenuToggle = () => {
    clearMenuCloseTimeout();
    setIsMenuOpen((prev) => {
      const next = !prev;
      if (next) {
        bumpLayerStack("menu-open");
        isNavigatingRef.current = false;
        setIsNavigating(false);
        setActiveMobileIndex(null);
        // Close sidebar if opening main menu
        if (isSidebarOpen) {
          window.dispatchEvent(new CustomEvent("toggleDocsSidebar"));
        }
      }
      return next;
    });
  };

  useEffect(() => {
    return () => {
      clearMenuCloseTimeout();
      if (mobileMenuTimelineRef.current) mobileMenuTimelineRef.current.kill();
    };
  }, []);

  const setMobileLinkRef = (el: HTMLAnchorElement | null, index: number) => {
    if (!el) return;
    mobileLinkRefs.current[index] = el;
  };

  const setMobileRippleRef = (el: HTMLSpanElement | null, index: number) => {
    if (!el) return;
    mobileRippleRefs.current[index] = el;
  };

  const animateMobileRipple = (index: number) => {
    if (typeof window === "undefined") return;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduceMotion) return;
    const ripple = mobileRippleRefs.current[index];
    if (!ripple) return;
    gsap.killTweensOf(ripple);
    gsap.fromTo(
      ripple,
      { scale: 0, autoAlpha: 0.6 },
      {
        scale: 2.2,
        autoAlpha: 0,
        duration: 0.45,
        ease,
        clearProps: "transform,opacity",
      },
    );
  };

  const animateFullscreenCircle = (
    event: React.MouseEvent<HTMLAnchorElement>,
  ) => {
    if (typeof window === "undefined") return;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduceMotion) return;

    const circleBase = fullscreenCircleBaseRef.current;
    const circleTop = fullscreenCircleTopRef.current;
    if (!circleBase || !circleTop) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const maxDistance = Math.max(
      Math.hypot(x, y),
      Math.hypot(window.innerWidth - x, y),
      Math.hypot(x, window.innerHeight - y),
      Math.hypot(window.innerWidth - x, window.innerHeight - y),
    );
    const diameter = maxDistance * 2;

    gsap.killTweensOf([circleBase, circleTop]);
    gsap.set([circleBase, circleTop], {
      left: x,
      top: y,
      width: 0,
      height: 0,
      opacity: 1,
      xPercent: -50,
      yPercent: -50,
    });

    const tl = gsap.timeline({ defaults: { ease } });
    tl.to(circleBase, { width: diameter, height: diameter, duration: 0.4 }, 0)
      .to(circleTop, { width: diameter, height: diameter, duration: 0.4 }, 0)
      .to(circleTop, { opacity: 0, duration: 0.2, ease }, 0.1)
      .to(circleBase, { opacity: 0, duration: 0.4, ease }, 0.2)
      .set([circleBase, circleTop], { width: 0, height: 0, opacity: 0 });
  };

  const markIntentionalRouteAnimation = () => {
    if (typeof window === "undefined") return;
    flagViewEntranceForNextRoute();
  };

  const handleNavItemClick = (
    _href: string,
    index: number,
    event: React.MouseEvent<HTMLAnchorElement>,
  ) => {
    clearMenuCloseTimeout();
    bumpLayerStack("nav-transition");
    isNavigatingRef.current = true;
    setIsNavigating(true);
    setActiveMobileIndex(index);
    animateFullscreenCircle(event);
    markIntentionalRouteAnimation();
    menuCloseTimeoutRef.current = setTimeout(() => {
      setIsMenuOpen(false);
    }, 100);
  };

  const handleMobileMenuClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const anchor = target.closest("a");
    if (!anchor) setIsMenuOpen(false);
  };

  useEffect(() => {
    const updateViewportState = () => {
      if (typeof window === "undefined") return;
      setIsCompactMobileMenu(window.innerHeight < 640);
      setIsMobileViewport(window.innerWidth < 1400);
    };
    updateViewportState();
    window.addEventListener("resize", updateViewportState);
    return () => window.removeEventListener("resize", updateViewportState);
  }, []);

  /* ------ Active detection ----- */
  const isPathActive = (href: string) => {
    if (href === "/") return currentPath === "/";
    return currentPath.startsWith(href);
  };

  const shouldHideLogoLines =
    hasMounted && isPathActive("/sekretariat") && isMobileViewport;

  /* ------ Kontak anchor scroll ----- */
  const handleKontakClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const target = document.getElementById("footer-kontak");
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });

      // Fire the highlight AFTER the scroll animation ends.
      // scrollend is natively supported in Chrome 114+ / Firefox 109+.
      // A timeout fallback covers Safari and older browsers.
      let settled = false;
      const dispatchHighlight = () => {
        if (settled) return;
        settled = true;
        window.removeEventListener("scrollend", dispatchHighlight);
        window.dispatchEvent(new CustomEvent("hima:highlight-kontak"));
      };
      window.addEventListener("scrollend", dispatchHighlight, { once: true });
      // Fallback: fire after 650 ms regardless
      setTimeout(dispatchHighlight, 650);
    }
    setIsMenuOpen(false);
  }, []);

  return (
    <>
      {/* Fullscreen circle transition elements */}
      <div
        ref={fullscreenCircleBaseRef}
        className="bg-gold-500 pointer-events-none fixed z-2 rounded-full opacity-0"
        style={{ zIndex: circleLayers.base }}
      />
      <div
        ref={fullscreenCircleTopRef}
        className="bg-gold-500 pointer-events-none fixed z-4 rounded-full opacity-0"
        style={{ zIndex: circleLayers.top }}
      />

      {/* Nav background blur — sibling to <nav> so <nav> contains no backdrop-filter,
          allowing the dropdown's own backdrop-blur-xl to sample page content. */}
      <div
        className={`pointer-events-none fixed top-0 left-0 h-20 w-full transition-all duration-500 ${
          isMenuOpen
            ? "border-transparent bg-transparent"
            : "border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-xl"
        }`}
        style={{ zIndex: navLayer }}
      />

      {/* ====== NAVBAR ====== */}
      <nav
        ref={navBarRef}
        style={{ zIndex: navLayer }}
        className="fixed top-0 left-0 w-full"
      >
        <div className="relative mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
          {/* LEFT: Sidebar toggle (Mobile only, shown in /sekretariat) */}
          <div
            className={`absolute top-1/2 left-6 z-50 -translate-y-1/2 min-[1400px]:hidden ${
              hasMounted ? "transition-all duration-500 ease-in-out" : ""
            } ${
              isPathActive("/sekretariat")
                ? "pointer-events-auto opacity-100"
                : "pointer-events-none opacity-0"
            }`}
          >
            <button
              type="button"
              className="group relative flex h-10 w-10 cursor-pointer touch-manipulation flex-col items-center justify-center space-y-1.5 select-none"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                window.dispatchEvent(new CustomEvent("toggleDocsSidebar"));
                if (isMenuOpen) setIsMenuOpen(false);
              }}
              aria-label="Toggle Sekretariat Sidebar"
            >
              <span
                className={`h-px bg-neutral-300 transition-all duration-300 ${
                  isSidebarOpen ? "w-6 translate-y-1.75 rotate-45" : "w-6"
                }`}
              />
              <span
                className={`h-px w-4 bg-neutral-300 transition-all duration-300 ${
                  isSidebarOpen ? "-translate-x-2 opacity-0" : "-translate-x-1"
                }`}
              />
              <span
                className={`h-px bg-neutral-300 transition-all duration-300 ${
                  isSidebarOpen ? "w-6 -translate-y-1.75 -rotate-45" : "w-6"
                }`}
              />
            </button>
          </div>

          {/* LEFT: Logo */}
          <Link
            href="/"
            className={`relative z-10 cursor-pointer transition-all duration-500 ${
              isPathActive("/sekretariat") ? "ml-20 lg:ml-0" : "ml-0"
            }`}
            onMouseEnter={() => setIsLogoHovered(true)}
            onMouseLeave={() => setIsLogoHovered(false)}
            onClick={() => {
              markIntentionalRouteAnimation();
              setIsMenuOpen(false);
            }}
          >
            <LogoHima
              lineColor={isLogoHovered ? "white" : "white"}
              glyphColor={isLogoHovered ? "white" : "var(--color-gold-500)"}
              textColor={isLogoHovered ? "white" : "white"}
              showLines={!shouldHideLogoLines}
              className="h-32 w-auto transition-colors duration-300"
            />
          </Link>

          {/* CENTER: Desktop Nav */}
          <div className="flex min-w-0 flex-1 items-center justify-center gap-0 max-[1399px]:hidden 2xl:gap-1">
            {navItems.map((item) =>
              item.isAnchor ? (
                <button
                  key={item.label}
                  type="button"
                  onClick={handleKontakClick}
                  className="group relative px-2.5 py-2 text-xs font-medium tracking-[0.14em] whitespace-nowrap text-neutral-500 transition-all duration-500 hover:text-white 2xl:px-4 2xl:text-sm 2xl:tracking-[0.2em]"
                >
                  {item.label}
                  <span className="bg-gold-500 absolute -bottom-0.5 left-1/2 h-px w-0 -translate-x-1/2 opacity-0 transition-all duration-500 group-hover:w-1/2 group-hover:opacity-50" />
                </button>
              ) : (
                <Link
                  key={item.label}
                  href={item.href!}
                  onClick={markIntentionalRouteAnimation}
                  className={`group relative px-2.5 py-2 text-xs font-medium tracking-[0.14em] whitespace-nowrap transition-all duration-500 2xl:px-4 2xl:text-sm 2xl:tracking-[0.2em] ${
                    isPathActive(item.href!)
                      ? "text-gold-500"
                      : "text-neutral-500 hover:text-white"
                  }`}
                >
                  {item.label}
                  <span
                    className={`bg-gold-500 absolute -bottom-0.5 left-1/2 h-px -translate-x-1/2 transition-all duration-500 ${
                      isPathActive(item.href!)
                        ? "w-full opacity-100"
                        : "w-0 opacity-0 group-hover:w-1/2 group-hover:opacity-50"
                    }`}
                  />
                </Link>
              ),
            )}
          </div>

          {/* RIGHT: CTA + Search + Hamburger */}
          <div className="flex items-center gap-4">
            {/* Desktop CTA */}
            {highlightItem && (
              <Link
                href={highlightItem.href!}
                onClick={markIntentionalRouteAnimation}
                className="border-gold-500/40 bg-gold-500/10 text-gold-300 hover:border-gold-500/60 hover:bg-gold-500/20 hover:text-gold-200 hidden rounded-lg border px-5 py-2 text-xs font-semibold tracking-[0.2em] uppercase transition-all duration-300 lg:inline-flex"
              >
                {highlightItem.label}
              </Link>
            )}

            {/* Search trigger */}
            <button
              onClick={() => {
                window.dispatchEvent(createCommandPaletteShortcutEvent());
              }}
              className="hidden items-center gap-2 rounded-lg border border-stone-800 bg-stone-900/50 px-3 py-1.5 text-xs text-stone-500 transition-colors hover:border-stone-700 hover:text-stone-400 lg:flex"
              aria-label="Pencarian"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <kbd className="font-mono text-[10px]">
                {tokenizeShortcutLabel(commandPaletteShortcutLabel).map(
                  (token, index) => (
                    <span
                      key={`${token.char}-${index}`}
                      className={token.isSymbol ? SHORTCUT_SYMBOL_CLASS : ""}
                    >
                      {token.char}
                    </span>
                  ),
                )}
              </kbd>
            </button>

            {/* Mobile hamburger */}
            <button
              type="button"
              className="group relative z-50 flex flex-col space-y-1.5 p-2 min-[1400px]:hidden"
              onClick={handleMenuToggle}
              aria-label="Toggle menu"
              style={{ touchAction: "manipulation" }}
            >
              <span
                className={`h-px bg-neutral-300 transition-all duration-300 ${
                  isMenuOpen ? "w-6 translate-y-1.75 rotate-45" : "w-6"
                }`}
              />
              <span
                className={`h-px w-4 bg-neutral-300 transition-all duration-300 ${
                  isMenuOpen ? "translate-x-3 opacity-0" : "translate-x-2"
                }`}
              />
              <span
                className={`h-px bg-neutral-300 transition-all duration-300 ${
                  isMenuOpen ? "w-6 -translate-y-1.75 -rotate-45" : "w-6"
                }`}
              />
            </button>
          </div>
        </div>
      </nav>

      {/* ====== MOBILE MENU ====== */}
      <div
        ref={mobileMenuRef}
        style={{ zIndex: mobileMenuLayer }}
        className={`fixed inset-0 flex flex-col pt-24 will-change-transform min-[1400px]:hidden ${
          isNavigating ? "bg-transparent" : "bg-[#0a0a0a]"
        } ${
          isMenuOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        onClick={handleMobileMenuClick}
      >
        <div
          className={`relative z-10 flex flex-1 flex-col items-center justify-start overflow-y-auto px-8 pt-4 pb-24 ${
            isCompactMobileMenu ? "space-y-4" : "space-y-6"
          }`}
        >
          {mobileNavItems.map((item, idx) => {
            const isActive = !item.isAnchor && isPathActive(item.href!);
            const isClicked = activeMobileIndex === idx && isNavigating;
            const isRecruitment = !!(
              highlightItem && item.href === highlightItem.href
            );
            const sharedClass = `relative font-serif italic transition-all duration-500 ${
              isCompactMobileMenu ? "text-2xl" : "text-3xl"
            } ${
              isRecruitment
                ? "text-gold-400"
                : isClicked
                  ? "z-20 text-white"
                  : isActive
                    ? "text-gold-500"
                    : "text-neutral-500 hover:text-white"
            } ${activeMobileIndex === idx && !isClicked ? "bg-gold-500/20" : ""}`;

            if (item.isAnchor) {
              return (
                <button
                  key={item.label}
                  type="button"
                  ref={(el) =>
                    setMobileLinkRef(
                      el as unknown as HTMLAnchorElement | null,
                      idx,
                    )
                  }
                  onClick={(e) => {
                    animateMobileRipple(idx);
                    handleKontakClick(e);
                  }}
                  className={sharedClass}
                >
                  <span className="relative z-10">{item.label}</span>
                  <span
                    ref={(el) => setMobileRippleRef(el, idx)}
                    className="bg-gold-500/20 pointer-events-none absolute inset-0 scale-0 rounded-full opacity-0"
                  />
                </button>
              );
            }

            return (
              <Link
                key={item.label}
                href={item.href!}
                ref={(el) => setMobileLinkRef(el, idx)}
                onClick={(e) => {
                  animateMobileRipple(idx);
                  handleNavItemClick(item.href!, idx, e);
                }}
                className={sharedClass}
              >
                <span className="relative z-10">{item.label}</span>
                <span
                  ref={(el) => setMobileRippleRef(el, idx)}
                  className="bg-gold-500/20 pointer-events-none absolute inset-0 scale-0 rounded-full opacity-0"
                />
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
};

export default Navigation;
