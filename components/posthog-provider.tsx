"use client";

import { useEffect } from "react";
import { initAnalytics } from "@/lib/analytics-client";

/** Initializes browser-side PostHog once on mount. Renders nothing. */
export function PostHogProvider() {
  useEffect(() => {
    initAnalytics();
  }, []);

  return null;
}
