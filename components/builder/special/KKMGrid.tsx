"use client";
import Image from "next/image";
import Link from "next/link";
import React, { useEffect, useState } from "react";

import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import type { KKMGroup } from "@/lib/kkm-data";
import { toCachedImageUrl } from "@/lib/notion-image";

const ACTION_RADIUS = { borderRadius: "var(--radius-action)" } as const;
const passthroughLoader = ({ src }: { src: string }) => src;

function KKMGridSkeleton() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="rounded-[var(--radius-action)] border border-white/5 p-7"
        >
          <div className="mb-8 flex gap-5">
            <LoadingSkeleton className="h-14 w-14 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-4">
              <LoadingSkeleton className="h-7 w-3/5 rounded" />
              <LoadingSkeleton className="h-4 w-2/5 rounded" />
              <div className="space-y-2">
                <LoadingSkeleton className="h-3 w-full rounded" />
                <LoadingSkeleton className="h-3 w-4/5 rounded" />
              </div>
            </div>
          </div>
          <div className="border-t border-white/5 pt-5">
            <LoadingSkeleton className="h-4 w-1/2 rounded" />
          </div>
        </div>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  KKM Card                                                           */
/* ------------------------------------------------------------------ */

type SocialMeta = {
  href: string;
  label: string;
  platform: "instagram" | "tiktok" | "youtube" | "link";
};

function getHostname(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function getPathLabel(link: string): string {
  try {
    const pathname = new URL(link).pathname.split("/").filter(Boolean)[0];
    return pathname ? `@${pathname}` : link;
  } catch {
    return link;
  }
}

function getSocialMeta(link: string): SocialMeta {
  const hostname = getHostname(link);

  if (hostname.includes("instagram.com")) {
    return {
      href: link,
      label: getPathLabel(link),
      platform: "instagram",
    };
  }

  if (hostname.includes("tiktok.com")) {
    return {
      href: link,
      label: getPathLabel(link),
      platform: "tiktok",
    };
  }

  if (hostname.includes("youtube.com") || hostname.includes("youtu.be")) {
    return {
      href: link,
      label: getPathLabel(link),
      platform: "youtube",
    };
  }

  return {
    href: link,
    label: hostname || "External Link",
    platform: "link",
  };
}

function SocialIcon({ platform }: { platform: SocialMeta["platform"] }) {
  if (platform === "instagram") {
    return (
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24">
        <path
          fill="currentColor"
          fillRule="evenodd"
          d="M7.465 1.066C8.638 1.012 9.012 1 12 1s3.362.013 4.534.066s1.972.24 2.672.511c.733.277 1.398.71 1.948 1.27c.56.549.992 1.213 1.268 1.947c.272.7.458 1.5.512 2.67C22.988 8.639 23 9.013 23 12s-.013 3.362-.066 4.535c-.053 1.17-.24 1.97-.512 2.67a5.4 5.4 0 0 1-1.268 1.949c-.55.56-1.215.992-1.948 1.268c-.7.272-1.5.458-2.67.512c-1.174.054-1.548.066-4.536.066s-3.362-.013-4.535-.066c-1.17-.053-1.97-.24-2.67-.512a5.4 5.4 0 0 1-1.949-1.268a5.4 5.4 0 0 1-1.269-1.948c-.271-.7-.457-1.5-.511-2.67C1.012 15.361 1 14.987 1 12s.013-3.362.066-4.534s.24-1.972.511-2.672a5.4 5.4 0 0 1 1.27-1.948a5.4 5.4 0 0 1 1.947-1.269c.7-.271 1.5-.457 2.67-.511m8.98 1.98c-1.16-.053-1.508-.064-4.445-.064s-3.285.011-4.445.064c-1.073.049-1.655.228-2.043.379c-.513.2-.88.437-1.265.822a3.4 3.4 0 0 0-.822 1.265c-.151.388-.33.97-.379 2.043c-.053 1.16-.064 1.508-.064 4.445s.011 3.285.064 4.445c.049 1.073.228 1.655.379 2.043c.176.477.457.91.822 1.265c.355.365.788.646 1.265.822c.388.151.97.33 2.043.379c1.16.053 1.507.064 4.445.064s3.285-.011 4.445-.064c1.073-.049 1.655-.228 2.043-.379c.513-.2.88-.437 1.265-.822c.365-.355.646-.788.822-1.265c.151-.388.33-.97.379-2.043c.053-1.16.064-1.508.064-4.445s-.011-3.285-.064-4.445c-.049-1.073-.228-1.655-.379-2.043c-.2-.513-.437-.88-.822-1.265a3.4 3.4 0 0 0-1.265-.822c-.388-.151-.97-.33-2.043-.379m-5.85 12.345a3.669 3.669 0 0 0 4-5.986a3.67 3.67 0 1 0-4 5.986M8.002 8.002a5.654 5.654 0 1 1 7.996 7.996a5.654 5.654 0 0 1-7.996-7.996m10.906-.814a1.337 1.337 0 1 0-1.89-1.89a1.337 1.337 0 0 0 1.89 1.89"
          clipRule="evenodd"
        />
      </svg>
    );
  }

  if (platform === "tiktok") {
    return (
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24">
        <path
          fill="currentColor"
          d="M19.321 5.562a5 5 0 0 1-.443-.258a6.2 6.2 0 0 1-1.137-.966c-.849-.971-1.166-1.956-1.282-2.645h.004c-.097-.573-.057-.943-.05-.943h-3.865v14.943q.002.3-.008.595l-.004.073q0 .016-.003.033v.009a3.28 3.28 0 0 1-1.65 2.604a3.2 3.2 0 0 1-1.6.422c-1.8 0-3.26-1.468-3.26-3.281s1.46-3.282 3.26-3.282c.341 0 .68.054 1.004.16l.005-3.936a7.18 7.18 0 0 0-5.532 1.62a7.6 7.6 0 0 0-1.655 2.04c-.163.281-.779 1.412-.853 3.246c-.047 1.04.266 2.12.415 2.565v.01c.093.262.457 1.158 1.049 1.913a7.9 7.9 0 0 0 1.674 1.58v-.01l.009.01c1.87 1.27 3.945 1.187 3.945 1.187c.359-.015 1.562 0 2.928-.647c1.515-.718 2.377-1.787 2.377-1.787a7.4 7.4 0 0 0 1.296-2.153c.35-.92.466-2.022.466-2.462V8.273c.047.028.672.441.672.441s.9.577 2.303.952c1.006.267 2.363.324 2.363.324V6.153c-.475.052-1.44-.098-2.429-.59"
        />
      </svg>
    );
  }

  if (platform === "youtube") {
    return (
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24">
        <path
          fill="currentColor"
          d="M12.006 19.012h-.02c-.062 0-6.265-.012-7.83-.437a2.5 2.5 0 0 1-1.764-1.765A26.494 26.494 0 0 1 1.986 12a26.646 26.646 0 0 1 .417-4.817A2.564 2.564 0 0 1 4.169 5.4c1.522-.4 7.554-.4 7.81-.4H12c.063 0 6.282.012 7.831.437c.859.233 1.53.904 1.762 1.763c.29 1.594.427 3.211.407 4.831a26.568 26.568 0 0 1-.418 4.811a2.51 2.51 0 0 1-1.767 1.763c-1.52.403-7.553.407-7.809.407Zm-2-10.007l-.005 6l5.212-3l-5.207-3Z"
        />
      </svg>
    );
  }

  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function KKMCard({ group }: { group: KKMGroup }) {
  const [isLogoLoading, setIsLogoLoading] = useState(Boolean(group.logoUrl));

  return (
    <div
      className="group relative flex flex-col overflow-hidden rounded-[var(--radius-action)] border border-white/5 p-7 transition-colors duration-500 hover:bg-stone-900/10"
      style={ACTION_RADIUS}
      data-animate="up"
      data-animate-duration="0.82"
    >
      <Link
        href={`/kkm/${group.slug}`}
        aria-label={`Buka ${group.name}`}
        className="absolute inset-0 z-10"
      />

      <div className="relative z-0 mb-8 flex flex-1 flex-col">
        <div className="mb-5 flex items-start gap-5">
          {group.logoUrl && (
            <div className="relative shrink-0">
              {isLogoLoading && (
                <LoadingSkeleton className="absolute inset-0 z-10 h-14 w-14 rounded-lg" />
              )}
              <Image
                src={toCachedImageUrl(group.logoUrl)}
                alt={`${group.name} logo`}
                loader={passthroughLoader}
                width={56}
                height={56}
                unoptimized
                className={`h-14 w-14 rounded-lg border border-white/10 object-cover transition-opacity duration-300 ${
                  isLogoLoading ? "opacity-0" : "opacity-100"
                }`}
                onLoad={() => setIsLogoLoading(false)}
                onError={() => setIsLogoLoading(false)}
              />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="group-hover:text-gold-400 font-serif text-xl text-white transition-colors md:text-2xl">
              {group.name}
            </h2>
            {group.tagline && (
              <p className="text-gold-500/80 mt-1 mb-3 text-xs font-medium tracking-wide italic">
                &ldquo;{group.tagline}&rdquo;
              </p>
            )}
          </div>
        </div>

        {/* Description */}
        <p className="text-[0.8125rem] leading-relaxed text-stone-500 transition-colors group-hover:text-stone-400">
          {group.description}
        </p>
      </div>

      {/* Footer: Social + Foto */}
      <div className="relative z-10 -mx-7 mt-auto -mb-7 aspect-video border-t border-white/5">
        {group.fotoUrl && (
          <div
            className="pointer-events-none absolute -top-[100px] right-0 bottom-0 left-0 z-[-1]"
            style={{
              WebkitMaskImage:
                "linear-gradient(to bottom, transparent 0px, transparent 20px, rgba(0,0,0,0.05) 50px, rgba(0,0,0,0.3) 80px, black 100px, black 100%)",
              maskImage:
                "linear-gradient(to bottom, transparent 0px, transparent 20px, rgba(0,0,0,0.05) 50px, rgba(0,0,0,0.3) 80px, black 100px, black 100%)",
            }}
          >
            <Image
              src={toCachedImageUrl(group.fotoUrl)}
              alt={`${group.name} photo`}
              loader={passthroughLoader}
              fill
              unoptimized
              className="object-cover opacity-50 transition-opacity duration-500 group-hover:opacity-80"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a]/90 via-[#0a0a0a]/50 to-transparent" />
          </div>
        )}
        <div className="relative z-20 flex h-full w-full flex-col justify-end p-7 pt-5">
          {group.socialLinks.length > 0 && (
            <div className="space-y-2">
              {group.socialLinks.map((link) => {
                const social = getSocialMeta(link);

                return (
                  <a
                    key={link}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group/social relative z-20 flex items-center gap-2 text-xs text-stone-300 transition-colors hover:text-white"
                  >
                    <span className="text-gold-500/80 group-hover/social:text-gold-400 transition-colors">
                      <SocialIcon platform={social.platform} />
                    </span>
                    <span className="drop-shadow-md group-hover/social:text-stone-100">
                      {social.label}
                    </span>
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main View                                                          */
/* ------------------------------------------------------------------ */

export default function KKMGrid({
  hero,
  groups: initialGroups,
  value1: _value1,
  value2: _value2,
  value3: _value3,
}: {
  hero?: { title: string; description: string };
  groups: KKMGroup[];
  value1?: string;
  value2?: string;
  value3?: string;
}) {
  const [data, setData] = useState({
    hero: hero || { title: "", description: "" },
    groups: initialGroups || [],
  });
  const hasInitialData = hero !== undefined || initialGroups !== undefined;
  const [isLoading, setIsLoading] = useState(!hasInitialData);

  useEffect(() => {
    if (hasInitialData) return;

    // Try to load from localStorage cache first to bootstrap client-side SWR
    try {
      const cached = window.localStorage.getItem("hima_kkm_cache");
      if (cached) {
        const parsed = JSON.parse(cached);
        setData((prev) => ({
          hero: prev.hero.title ? prev.hero : parsed.hero || prev.hero,
          groups:
            prev.groups && prev.groups.length > 0
              ? prev.groups
              : parsed.groups || [],
        }));
      }
    } catch {}

    const fetchKKMData = async () => {
      try {
        const res = await fetch("/api/kkm");
        if (res.ok) {
          const result = await res.json();
          if (result.success && result.data) {
            setData(result.data);
            if (typeof window !== "undefined") {
              window.localStorage.setItem(
                "hima_kkm_cache",
                JSON.stringify(result.data),
              );
            }
          }
        }
      } catch (err) {
        console.error("Failed to fetch fresh kkm data:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchKKMData();
  }, [hasInitialData]);

  const groups = data.groups;

  return (
    <div className="relative flex-1">
      {/* KKM Grid */}
      <div
        data-animate-stagger="0.1"
        className="mb-12 grid gap-6 md:mb-14 md:grid-cols-2 xl:grid-cols-3"
      >
        {isLoading && groups.length === 0 ? (
          <KKMGridSkeleton />
        ) : (
          groups.map((group) => <KKMCard key={group.slug} group={group} />)
        )}
      </div>
    </div>
  );
}
