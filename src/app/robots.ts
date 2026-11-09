import type { MetadataRoute } from "next";
import { ROBOTS_DISALLOW, SITE_ORIGIN } from "@/lib/seo";

// Served at /robots.txt. The middleware matcher excludes this path, so the
// file reaches crawlers instead of redirecting them to /login.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: [...ROBOTS_DISALLOW],
    },
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
