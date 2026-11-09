import type { MetadataRoute } from "next";
import { sitemapUrls } from "@/lib/seo";

// Served at /sitemap.xml. The middleware matcher excludes this path, so the
// file reaches crawlers instead of redirecting them to /login.
export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapUrls();
}
