"use client";

import { usePathname } from "next/navigation";
import React, { useRef } from "react";

import { getCanonicalClientPath } from "@/lib/cms-route";
import { getCmsGsapEasing, gsap } from "@/lib/gsap";
import useIsomorphicLayoutEffect from "@/lib/useIsomorphicLayoutEffect";
import {
  isEntranceAnimateEnabled,
  shouldRunViewEntrance,
} from "@/lib/view-entrance";

type RouteEntranceAnimatorProps = {
  children: React.ReactNode;
};

const shouldSkipAutoRouteAnimation = (pathname: string) => {
  // Every route under these prefixes has its own custom GSAP entrance.
  // RouteEntranceAnimator only covers future routes that lack one.
  if (pathname === "/") return true;
  const manualPrefixes = [
    "/profil",
    "/agenda",
    "/faq",
    "/aduan",
    "/kkm",
    "/sekretariat",
  ];
  return manualPrefixes.some((prefix) => pathname.startsWith(prefix));
};

const isDecorativeNode = (element: HTMLElement) => {
  const className = element.className;
  if (typeof className !== "string") return false;
  return (
    className.includes("absolute") ||
    className.includes("pointer-events-none") ||
    className.includes("sr-only")
  );
};

export default function RouteEntranceAnimator({
  children,
}: RouteEntranceAnimatorProps) {
  const rawPathname = usePathname();
  const pathname = getCanonicalClientPath(rawPathname);
  const scopeRef = useRef<HTMLDivElement | null>(null);

  useIsomorphicLayoutEffect(() => {
    if (!scopeRef.current) return;
    if (shouldSkipAutoRouteAnimation(pathname)) return;
    if (!shouldRunViewEntrance(pathname)) return;
    if (!isEntranceAnimateEnabled()) return;

    const routeRoot = scopeRef.current.firstElementChild as HTMLElement | null;
    if (!routeRoot) return;

    const levelOne = Array.from(routeRoot.children) as HTMLElement[];
    const levelTwo = levelOne.flatMap((child) =>
      Array.from(child.children),
    ) as HTMLElement[];

    const uniqueTargets = Array.from(new Set([...levelOne, ...levelTwo]));
    const targets = uniqueTargets.filter(
      (element) => !isDecorativeNode(element),
    );

    if (targets.length === 0) return;

    const ctx = gsap.context(() => {
      const ease = getCmsGsapEasing();

      gsap.fromTo(
        targets,
        { autoAlpha: 0, y: 14 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.7,
          ease,
          stagger: 0.06,
          clearProps: "opacity,visibility,transform",
        },
      );
    }, scopeRef);

    return () => ctx.revert();
  }, [pathname]);

  return <div ref={scopeRef}>{children}</div>;
}
