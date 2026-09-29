"use client";

import useIsomorphicLayoutEffect from "@/lib/useIsomorphicLayoutEffect";

export default function ScrollToTopOnMount() {
  useIsomorphicLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, []);

  return null;
}
