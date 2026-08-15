"use client";

import { useEffect } from "react";

interface LocatorInitializerProps {
  projectPath?: string;
}

export default function LocatorInitializer({
  projectPath,
}: LocatorInitializerProps) {
  const resolvedPath = projectPath || process.env.NEXT_PUBLIC_PROJECT_PATH;
  const locatorOverride =
    process.env.ENABLE_LOCATOR ?? process.env.NEXT_PUBLIC_ENABLE_LOCATOR;
  const locatorEnabled =
    process.env.NODE_ENV === "development" && locatorOverride !== "false";

  useEffect(() => {
    if (locatorEnabled && resolvedPath) {
      import("@locator/runtime")
        .then(({ default: setupLocatorUI }) => {
          setupLocatorUI({ projectPath: resolvedPath });
        })
        .catch(() => undefined);
    }
  }, [locatorEnabled, resolvedPath]);

  return null;
}
