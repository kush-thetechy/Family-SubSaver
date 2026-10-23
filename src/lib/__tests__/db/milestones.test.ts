import { describe, expect, it } from "vitest";
import { asUser, createTestDb, createUser } from "./harness";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

describe("usage milestones (RLS)", () => {
  it("records only the first qualifying event, ignores zero, and isolates users", async () => {
    const db = await createTestDb();
    await createUser(db, A, "a@example.com");
    await createUser(db, B, "b@example.com");
    const call = (u: string, sql: string, p: unknown[] = []) => asUser(db, u, () => db.query(sql, p));
    await call(A, "select public.record_usage_milestone('gmail_scan_viewed', 0)");
    expect((await call(A, "select * from public.usage_milestones")).rows).toHaveLength(0);
    await call(A, "select public.record_usage_milestone('gmail_scan_viewed', 4)");
    const first = (await call(A, "select first_at from public.usage_milestones")).rows[0] as any;
    await call(A, "select public.record_usage_milestone('gmail_scan_viewed', 9)");
    const rows = (await call(A, "select * from public.usage_milestones")).rows as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].live_subscriptions_seen).toBe(4);
    expect(rows[0].first_at).toEqual(first.first_at);
    expect((await call(B, "select * from public.usage_milestones")).rows).toHaveLength(0);
    await expect(call(A, "insert into public.usage_milestones (user_id,kind,live_subscriptions_seen) values ($1,'ocr_import_viewed',1)", [A])).rejects.toThrow();
  });
});
