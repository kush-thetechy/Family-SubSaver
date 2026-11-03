import { describe, expect, it } from "vitest";
import { asUser, createTestDb, createUser } from "./harness";

const A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-cccc-cccc-cccccccccccc";

describe("gmail message quota (reserve then settle actual emails processed)", () => {
  it("reserves atomically, settles to actual usage, and full-refunds cancelled scans", async () => {
    const db = await createTestDb();
    await createUser(db, A, "a@example.com");
    const call = (sql: string, p: unknown[] = []) => asUser(db, A, () => db.query(sql, p));

    // Reserve worst-case 200 for a scan: allowed, 11,800 left.
    let r = await call("select allowed, messages_remaining from public.reserve_gmail_message_quota(200)");
    expect(r.rows[0]).toMatchObject({ allowed: true, messages_remaining: 11800 });

    // Scan actually processed 150: settle 150 - 200 = -50 refund -> daily total 150.
    r = await call("select messages_used, messages_remaining from public.record_gmail_messages_processed(-50)");
    expect(r.rows[0]).toMatchObject({ messages_used: 150, messages_remaining: 11850 });

    // A cancelled scan: reserve 200, then full refund -200 -> back to 150 total.
    await call("select public.reserve_gmail_message_quota(200)");
    r = await call("select messages_used from public.record_gmail_messages_processed(-200)");
    expect(r.rows[0]).toMatchObject({ messages_used: 150 });

    // Refunds never drive the total below zero.
    await call("select public.record_gmail_messages_processed(-99999)");
    r = await call("select messages_used from public.record_gmail_messages_processed(0)");
    expect(r.rows[0]).toMatchObject({ messages_used: 0 });
  });

  it("blocks the reservation that would cross the daily cap (no double-spend) and resets on a new UTC day", async () => {
    const db = await createTestDb();
    await createUser(db, B, "b@example.com");
    const call = (sql: string, p: unknown[] = []) => asUser(db, B, () => db.query(sql, p));

    // Fill to the cap with worst-case batch reservations (6 x 2000).
    for (let i = 0; i < 6; i += 1) {
      const r = await call("select allowed from public.reserve_gmail_message_quota(2000)");
      expect(r.rows[0]).toMatchObject({ allowed: true });
    }
    // The next reservation would cross 12,000: denied, nothing added.
    let r = await call("select allowed, messages_remaining from public.reserve_gmail_message_quota(2000)");
    expect(r.rows[0]).toMatchObject({ allowed: false, messages_remaining: 0 });
    r = await call("select messages_used from public.record_gmail_messages_processed(0)");
    expect(r.rows[0]).toMatchObject({ messages_used: 12000 });

    // Settling real usage frees capacity: refund 11,800 -> one more small reserve fits.
    await call("select public.record_gmail_messages_processed(-11800)");
    r = await call("select allowed from public.reserve_gmail_message_quota(200)");
    expect(r.rows[0]).toMatchObject({ allowed: true });

    // A row dated yesterday no longer counts (admin role: table is not user-readable).
    await db.query("update public.gmail_scan_usage set usage_date = (now() at time zone 'UTC')::date - 1");
    r = await call("select allowed, messages_remaining from public.reserve_gmail_message_quota(2000)");
    expect(r.rows[0]).toMatchObject({ allowed: true, messages_remaining: 10000 });
  });

  it("legacy consume shim still works during rolling deploys and costs one email", async () => {
    const db = await createTestDb();
    await createUser(db, C, "c@example.com");
    const call = (sql: string) => asUser(db, C, () => db.query(sql));
    const r = await call("select allowed from public.consume_gmail_scan_quota()");
    expect(r.rows[0]).toMatchObject({ allowed: true });
    const used = await db.query("select messages_processed from public.gmail_scan_usage");
    expect(used.rows[0]).toMatchObject({ messages_processed: 1 });
  });
});
