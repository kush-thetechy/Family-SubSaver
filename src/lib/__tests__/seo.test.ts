import { describe, expect, it } from "vitest";
import {
  CRAWLABLE_PATHS,
  ROBOTS_DISALLOW,
  SITE_ORIGIN,
  canonicalPath,
  sitemapUrls,
} from "../seo";
import { PUBLIC_LEGAL_PATHS } from "../legal";
import { config as middlewareConfig } from "../../middleware";

describe("SITE_ORIGIN", () => {
  it("is the production www https origin", () => {
    expect(SITE_ORIGIN).toBe("https://www.familysubsaver.live");
  });
});

describe("canonicalPath", () => {
  it("self-canonicalizes every crawlable public route", () => {
    expect(canonicalPath("/")).toBe("/");
    expect(canonicalPath("/login")).toBe("/login");
    for (const p of PUBLIC_LEGAL_PATHS) {
      expect(canonicalPath(p)).toBe(p);
    }
  });

  it("emits no canonical on signed-in app surfaces or auth flows", () => {
    for (const p of [
      "/subscriptions",
      "/settings",
      "/savings",
      "/import",
      "/household",
      "/admin/billing",
      "/join",
      "/reset-password",
      "/auth/callback",
    ]) {
      expect(canonicalPath(p)).toBeNull();
    }
  });
});

describe("ROBOTS_DISALLOW", () => {
  it("covers auth flows and every signed-in surface", () => {
    for (const p of [
      "/subscriptions",
      "/settings",
      "/savings",
      "/import",
      "/household",
      "/admin/billing",
      "/api/gmail/scan",
      "/auth/callback",
      "/join",
      "/reset-password",
    ]) {
      expect(ROBOTS_DISALLOW.some((d) => p === d || p.startsWith(`${d}/`))).toBe(true);
    }
  });

  it("never blocks a crawlable public route", () => {
    for (const p of CRAWLABLE_PATHS) {
      expect(ROBOTS_DISALLOW.some((d) => p === d || p.startsWith(`${d}/`))).toBe(false);
    }
  });
});

describe("sitemapUrls", () => {
  it("lists the homepage and every legal page as absolute www URLs", () => {
    const urls = sitemapUrls(new Date("2026-11-09T00:00:00Z")).map((e) => e.url);
    expect(urls).toContain(`${SITE_ORIGIN}/`);
    for (const p of PUBLIC_LEGAL_PATHS) {
      expect(urls).toContain(`${SITE_ORIGIN}${p}`);
    }
    expect(urls.every((u) => u.startsWith(`${SITE_ORIGIN}/`))).toBe(true);
  });

  it("keeps login, auth and app routes out of the sitemap", () => {
    const urls = sitemapUrls().map((e) => e.url);
    for (const p of ["/login", "/subscriptions", "/settings", "/join", "/reset-password"]) {
      expect(urls).not.toContain(`${SITE_ORIGIN}${p}`);
    }
  });
});

describe("middleware matcher", () => {
  const patterns = middlewareConfig.matcher.map((p) => new RegExp(`^${p}$`));
  const matched = (path: string) => patterns.some((re) => re.test(path));

  it("lets crawler files bypass the auth middleware", () => {
    for (const p of [
      "/robots.txt",
      "/sitemap.xml",
      "/favicon.ico",
      "/manifest.json",
      "/google6d9b01e9061e6473.html",
    ]) {
      expect(matched(p)).toBe(false);
    }
  });

  it("still guards app, auth and public pages", () => {
    for (const p of [
      "/",
      "/login",
      "/privacy",
      "/subscriptions",
      "/settings",
      "/api/gmail/scan",
      "/auth/callback",
    ]) {
      expect(matched(p)).toBe(true);
    }
  });
});
