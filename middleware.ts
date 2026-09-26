import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Everything except the marketing home page, Clerk's own auth pages,
// static assets, and the Inngest webhook endpoint requires a signed-in user.
// The Inngest endpoint is excluded because it is called by Inngest's
// infrastructure, not by a browser session, and has its own signing-key
// verification handled by the `inngest` package.
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/inngest(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
