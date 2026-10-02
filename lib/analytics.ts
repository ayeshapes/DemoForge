import { PostHog } from "posthog-node";
import { logger } from "./logger.ts";

/**
 * DF-22: server-side PostHog client, used from route handlers and the
 * Inngest export worker.
 *
 * Safe no-op when POSTHOG_KEY isn't set (local dev, CI, this sandbox) so
 * nothing about analytics being unconfigured ever surfaces as a user-facing
 * error or a failed request — capture() below always resolves.
 */

let client: PostHog | null = null;

function getClient(): PostHog | null {
  if (client) return client;
  const key = process.env.POSTHOG_KEY || process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;

  client = new PostHog(key, {
    host: process.env.POSTHOG_HOST || process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
    // Server-side requests are short-lived (route handlers, Inngest steps),
    // so flush eagerly rather than batching and risking events getting
    // dropped when the process/function exits.
    flushAt: 1,
    flushInterval: 0,
  });

  return client;
}

export type AnalyticsEvent =
  | "project_created"
  | "recording_started"
  | "recording_stopped"
  | "export_requested"
  | "export_completed"
  | "export_failed";

/**
 * Fire-and-forget event capture. Never throws — a PostHog outage or missing
 * config must never fail the request it's attached to. Errors are logged at
 * debug level only, since a dropped analytics event isn't actionable.
 */
export function capture(
  distinctId: string,
  event: AnalyticsEvent,
  properties?: Record<string, unknown>
) {
  const ph = getClient();
  if (!ph) return;

  try {
    ph.capture({ distinctId, event, properties });
  } catch (err) {
    logger.debug("analytics capture failed", { event, error: String(err) });
  }
}

/**
 * Call at the end of a short-lived server context (route handler, Inngest
 * step) to make sure the event above is actually sent before the process/
 * function is frozen or torn down, since flushInterval is disabled above.
 */
export async function flushAnalytics() {
  if (!client) return;
  try {
    await client.flush();
  } catch (err) {
    logger.debug("analytics flush failed", { error: String(err) });
  }
}
