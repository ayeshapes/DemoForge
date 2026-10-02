"use client";

import posthog from "posthog-js";

/**
 * DF-22: browser-side PostHog. `init()` is called once from
 * `components/posthog-provider.tsx`. `capture()` is safe to call even if
 * init hasn't run yet (e.g. `NEXT_PUBLIC_POSTHOG_KEY` unset in dev) — it
 * just becomes a no-op rather than throwing, matching the server-side
 * `lib/analytics.ts` behavior.
 */

let initialized = false;

export function initAnalytics() {
  if (initialized) return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;

  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
    person_profiles: "identified_only",
    capture_pageview: true,
  });
  initialized = true;
}

export type ClientAnalyticsEvent = "recording_started" | "recording_stopped";

export function captureClient(
  event: ClientAnalyticsEvent,
  properties?: Record<string, unknown>
) {
  if (!initialized) return;
  try {
    posthog.capture(event, properties);
  } catch {
    // Analytics must never break the feature it's attached to.
  }
}
