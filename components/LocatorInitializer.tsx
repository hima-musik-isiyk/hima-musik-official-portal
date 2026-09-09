"use client";

import { useEffect } from "react";

interface LocatorInitializerProps {
  projectPath?: string;
}

export default function LocatorInitializer({
  projectPath,
}: LocatorInitializerProps) {
  const resolvedPath = projectPath || process.env.NEXT_PUBLIC_PROJECT_PATH;
  const locatorEnabled =
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_LOCATOR_ENABLED === "true";

  useEffect(() => {
    if (locatorEnabled && resolvedPath) {
      import("@locator/runtime")
        .then(({ default: setupLocatorUI }) => {
          setupLocatorUI({
            projectPath: resolvedPath,
            targets: {
              antigravity: {
                url: "antigravity-ide://file/${projectPath}${filePath}:${line}:${column}",
                label: "Antigravity IDE",
              },
              zed: {
                url: "zed://file/${projectPath}${filePath}:${line}:${column}",
                label: "Zed",
              },
            },
          });
        })
        .catch(() => undefined);
    }
  }, [locatorEnabled, resolvedPath]);

  return null;
}
