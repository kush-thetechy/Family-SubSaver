import { describe, expect, it } from "vitest";
import { createTestDb } from "./harness";

describe("security definer functions", () => {
  it("all pin search_path", async () => {
    const db = await createTestDb();
    const r = await db.query<{ proname: string; proconfig: string[] | null }>(
      `select proname, proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.prosecdef`);
    const bad = r.rows.filter((x) => !(x.proconfig ?? []).some((c) => c.startsWith("search_path=")));
    expect(bad.map((b) => b.proname)).toEqual([]);
    expect(r.rows.length).toBeGreaterThan(0);
  });
  it("anon cannot execute any security definer function", async () => {
    const db = await createTestDb();
    const r = await db.query<{ proname: string; ok: boolean }>(
      `select proname, has_function_privilege('anon', p.oid, 'execute') as ok
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.prosecdef and p.prorettype <> 'trigger'::regtype`);
    // Trigger functions cannot be invoked directly, so they are excluded.
    expect(r.rows.filter((x) => x.ok).map((x) => x.proname)).toEqual([]);
  });
});
