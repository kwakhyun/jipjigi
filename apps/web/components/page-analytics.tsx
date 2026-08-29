"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { track } from "@/lib/analytics/client";

export function PageAnalytics() {
  const pathname = usePathname();
  useEffect(() => {
    try {
      const key = "jipjigi:v1:last-page-view";
      const previous = window.sessionStorage.getItem(key);
      const now = Date.now();
      if (previous) {
        const [lastPath, lastTime] = previous.split("|");
        if (lastPath === pathname && now - Number(lastTime) < 1_500) return;
      }
      window.sessionStorage.setItem(key, `${pathname}|${now}`);
    } catch {
      // Storage may be unavailable in hardened browser contexts.
    }
    track("page_viewed", {}, pathname);
  }, [pathname]);
  return null;
}
