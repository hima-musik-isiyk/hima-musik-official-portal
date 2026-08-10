import "../index.css";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Fraunces } from "next/font/google";
import React, { Suspense } from "react";

import CmsLiveRefresh from "../components/CmsLiveRefresh";
import CommandPalette from "../components/CommandPalette";
import Footer from "../components/Footer";
import LegacyHashRedirectWrapper from "../components/LegacyHashRedirectWrapper";
import LocatorInitializer from "../components/LocatorInitializer";
import Navigation from "../components/Navigation";
import NavigationLoader from "../components/NavigationLoader";
import RouteEntranceAnimator from "../components/RouteEntranceAnimator";
import {
  fetchContainerCMSCached,
  getNavigationData,
  NavItemDto,
} from "../lib/notion-builder";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif",
});

export const metadata = {
  title: "HIMA Musik Official Portal",
  description:
    "Portal resmi Himpunan Mahasiswa Musik (HIMA MUSIK) Institut Seni Indonesia Yogyakarta. Informasi organisasi, acara, galeri, dan layanan mahasiswa.",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

type RootLayoutProps = {
  children: React.ReactNode;
};

export default async function RootLayout({ children }: RootLayoutProps) {
  let navItems: NavItemDto[] | undefined = undefined;
  let mobileNavItems: NavItemDto[] | undefined = undefined;
  let highlightItem: NavItemDto | null | undefined = undefined;
  let gsapEasing = "power3.out";
  let entranceAnimate = "true";
  let hiddenFooterPaths: string[] = [];

  try {
    const cmsData = await fetchContainerCMSCached();
    if (cmsData?.pages) {
      const navData = getNavigationData(cmsData.pages);
      navItems = navData.navItems;
      mobileNavItems = navData.mobileNavItems;
      highlightItem = navData.highlightItem;

      hiddenFooterPaths = cmsData.pages
        .filter((p) => p.showFooter === false)
        .map((p) => {
          const s = p.slug?.trim() || "";
          return s.startsWith("/") ? s : `/${s}`;
        });
    }
    gsapEasing = cmsData?.variables?.GSAP_EASING?.trim() || gsapEasing;
    const cmsEntrance =
      cmsData?.variables?.ENTRANCE_ANIMATE?.trim()?.toLowerCase();
    if (cmsEntrance === "false") {
      entranceAnimate = "false";
    }
  } catch (error) {
    console.error("Failed to load navigation from Notion CMS:", error);
  }

  return (
    <html
      lang="id"
      data-gsap-easing={gsapEasing}
      data-entrance-animate={entranceAnimate}
    >
      <body
        className={`${fraunces.variable} selection:bg-gold-300/30 selection:text-gold-500 flex min-h-screen flex-col bg-transparent font-sans text-neutral-200`}
      >
        <LocatorInitializer />
        <LegacyHashRedirectWrapper />
        <div className="fixed inset-0 z-1 bg-[#0a0a0a]" aria-hidden="true" />
        <Suspense>
          <Navigation
            navItems={navItems}
            mobileNavItems={mobileNavItems}
            highlightItem={highlightItem}
          />
        </Suspense>
        <CommandPalette />
        <Suspense fallback={null}>
          <CmsLiveRefresh />
        </Suspense>
        <Suspense fallback={null}>
          <NavigationLoader />
        </Suspense>
        <main className="relative z-3 grow pt-20 pb-12 md:pb-16">
          <Suspense>
            <RouteEntranceAnimator>{children}</RouteEntranceAnimator>
          </Suspense>
        </main>
        <Suspense>
          <Footer hiddenFooterPaths={hiddenFooterPaths} />
        </Suspense>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
