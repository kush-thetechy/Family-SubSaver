import { PUBLIC_LEGAL_PATHS } from "./legal";

/**
 * Canonical origin for production. Every public metadata value points here so
 * crawlers consolidate http/https and bare/www variants onto one host
 * (Search Console flagged "Duplicate without user-selected canonical" while
 * no page emitted a rel=canonical).
 */
export const SITE_ORIGIN = "https://www.familysubsaver.live";

/** Routes a signed-out crawler can fetch: the homepage, the login page and
 * the public legal pages (see isPublicPath in ./legal plus /login, which the
 * middleware lets through on its own). */
export const CRAWLABLE_PATHS: readonly string[] = [
  "/",
  "/login",
  ...PUBLIC_LEGAL_PATHS,
];

/**
 * Self-referencing canonical for a public route, or null when the route must
 * not emit one. Signed-in app surfaces return null: crawlers are redirected
 * to /login before seeing them, so a canonical would never apply.
 */
export function canonicalPath(pathname: string): string | null {
  return CRAWLABLE_PATHS.includes(pathname) ? pathname : null;
}

/** Prefixes crawlers must not fetch: auth flows and signed-in app surfaces. */
export const ROBOTS_DISALLOW: readonly string[] = [
  "/admin",
  "/api",
  "/auth",
  "/household",
  "/import",
  "/join",
  "/reset-password",
  "/savings",
  "/settings",
  "/subscriptions",
];

/** Absolute sitemap entries for the crawlable marketing/legal pages. */
export function sitemapUrls(now: Date = new Date()): { url: string; lastModified: Date }[] {
  return ["/", ...PUBLIC_LEGAL_PATHS].map((p) => ({
    url: `${SITE_ORIGIN}${p}`,
    lastModified: now,
  }));
}
