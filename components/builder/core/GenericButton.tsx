"use client";

import Link from "next/link";
import React from "react";

interface GenericButtonProps {
  value1: string; // Button Title
  value2: string; // Button Description
  value3?: string; // Raw CMS link target
  href?: string; // Resolved path from Master Page / Section slug
  variation1?: string; // "Description on Right", "Just Button", "1", "2"
  className?: string;
}

export const GenericButton: React.FC<GenericButtonProps> = ({
  value1,
  value2,
  value3,
  href,
  variation1,
  className = "",
}) => {
  const isDescOnRight =
    variation1 === "1" || variation1?.toLowerCase().includes("description");
  const labelKey = value1.trim().toLowerCase();
  const rawHref = href?.trim() ?? "";
  const rawValue3 = value3?.trim() ?? "";

  let resolvedTarget = rawHref;
  if (!resolvedTarget || resolvedTarget === "#") {
    if (
      rawValue3.startsWith("/") ||
      rawValue3.startsWith("http://") ||
      rawValue3.startsWith("https://") ||
      rawValue3.startsWith("mailto:")
    ) {
      resolvedTarget = rawValue3;
    } else if (rawValue3.startsWith("www.")) {
      resolvedTarget = `https://${rawValue3}`;
    } else if (
      /^(?:[a-zA-Z0-9-]+\.)+(?:com|org|net|io|co|gle|id|me|app|dev|link|site|gov|edu|gg|form)(?:\/[^\s]*)?$/i.test(
        rawValue3,
      )
    ) {
      resolvedTarget = `https://${rawValue3}`;
    } else if (rawValue3) {
      resolvedTarget = rawValue3.startsWith("#")
        ? rawValue3
        : rawValue3.startsWith("/")
          ? rawValue3
          : `/${rawValue3}`;
    }
  }

  const fallbackHref = labelKey.includes("formulir pendaftaran")
    ? "/pendaftaran/form"
    : "#";
  const linkHref = resolvedTarget || fallbackHref;
  const isExternal =
    linkHref.startsWith("http://") ||
    linkHref.startsWith("https://") ||
    linkHref.startsWith("mailto:");

  const btn = (
    <Link
      href={linkHref}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noopener noreferrer" : undefined}
      className="btn-primary inline-flex shrink-0"
      data-animate="up"
    >
      <span className="btn-primary-label">{value1}</span>
      <div className="btn-primary-overlay"></div>
    </Link>
  );

  if (isDescOnRight && value2) {
    return (
      <div
        className={`flex flex-col items-start gap-8 md:flex-row md:items-center md:gap-12 ${className}`}
      >
        {btn}
        <p
          data-animate="up"
          className="max-w-sm border-stone-800 text-[0.8125rem] leading-[1.7] font-light text-stone-500 md:border-l md:pl-12"
        >
          {value2}
        </p>
      </div>
    );
  }

  return (
    <div data-animate="up" className={`inline-block ${className}`}>
      {btn}
    </div>
  );
};
