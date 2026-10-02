import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

/**
 * Resolves the current Clerk session to our internal Prisma `User` row,
 * creating it on first sight. This is the ONLY place a request's identity
 * should be trusted from — never read `userId` off a request body or query
 * string (that was the Phase 5 development bridge; DF-17 replaces it).
 *
 * Returns `null` if there is no authenticated session.
 */
export async function getAuthedUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  const existing = await prisma.user.findUnique({ where: { clerkId } });
  if (existing) return existing;

  // First request from this Clerk identity: create the matching local user.
  const clerkUser = await currentUser();
  const email =
    clerkUser?.primaryEmailAddress?.emailAddress ??
    clerkUser?.emailAddresses?.[0]?.emailAddress ??
    `${clerkId}@users.demoforge`;

  return prisma.user.create({
    data: {
      clerkId,
      email,
      name: clerkUser
        ? [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null
        : null,
    },
  });
}

/**
 * Same as getAuthedUser(), but throws an AuthError the caller can turn into
 * a 401 in one line. Use this in route handlers that require auth (i.e.
 * nearly all of them — middleware already blocks unauthenticated requests,
 * this is the defense-in-depth check at the data-access layer, since
 * middleware protects *routes*, not the ownership of specific resources).
 */
export class AuthError extends Error {}

export async function requireUser() {
  const user = await getAuthedUser();
  if (!user) throw new AuthError("Not authenticated");
  return user;
}
