import { PrismaClient } from "@prisma/client";
import { validateEnv } from "./env.ts";

// Fail fast and legibly on a misconfigured deploy, before any route
// handler gets a chance to hit a bad/missing value on its own -- see
// lib/env.ts for exactly what's validated and why this lives here rather
// than in a dedicated `instrumentation.ts`: Next's instrumentation hook
// needs `experimental.instrumentationHook` on this Next 14.2 version (it's
// on by default from Next 15), which would mean adding a next.config.js
// this project doesn't otherwise need. lib/prisma.ts, on the other hand,
// is already imported by every route/page in the app before it does
// anything else, making it the same universal chokepoint without the
// extra config.
validateEnv();

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
