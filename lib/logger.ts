/**
 * DF-24: minimal structured logger.
 *
 * Every route was doing `console.error(e)` on failure, which prints an
 * unstructured object with no request context and no distinction between
 * "expected, user-facing" failures (bad input, not found) and genuine
 * server faults (DB down, storage down, uncaught exception). That makes
 * these logs hard to search or alert on once they leave a terminal and go
 * into an actual log aggregator (Vercel/Railway logs, Datadog, etc).
 *
 * This intentionally does NOT pull in a logging library (pino/winston) —
 * the app has no log-shipping destination configured yet (see DF-23), so a
 * dependency buys nothing over structured `console.*` calls that already
 * emit valid JSON lines. Swapping the internals for pino later is a
 * one-file change since every call site goes through this module.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = Record<string, unknown>;

interface LogEntry {
  level: LogLevel;
  message: string;
  time: string;
  [key: string]: unknown;
}

function serializeError(err: unknown): Record<string, unknown> | undefined {
  if (err == null) return undefined;
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
    };
  }
  return { message: String(err) };
}

function write(level: LogLevel, message: string, context?: LogContext, err?: unknown) {
  const entry: LogEntry = {
    level,
    message,
    time: new Date().toISOString(),
    ...context,
  };
  const error = serializeError(err);
  if (error) entry.error = error;

  const line = JSON.stringify(entry);
  // eslint-disable-next-line no-console
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, context?: LogContext) => write("debug", message, context),
  info: (message: string, context?: LogContext) => write("info", message, context),
  warn: (message: string, context?: LogContext, err?: unknown) =>
    write("warn", message, context, err),
  /**
   * `err` is the caught exception (or any thrown value); `context` is
   * structured metadata to make the entry searchable — route name, resource
   * id, user id, etc. Never put PII beyond ids in here.
   */
  error: (message: string, err?: unknown, context?: LogContext) =>
    write("error", message, context, err),
};
