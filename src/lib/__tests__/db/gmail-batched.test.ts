import { describe, expect, it } from "vitest";
import { asUser, createTestDb, createUser } from "./harness";

const A = "11111111-1111-1111-1111-111111111111";
const lanes = (unique: number) =>
  JSON.stringify(
    ["store_receipts", "direct_billing", "known_merchant_payments", "merchant_lifecycle", "bank_mandates"].map((key, i) => ({
      key,
      label: "x",
      status: i === 0 ? "truncated" : "complete",
      pagesFetched: i === 0 ? 10 : 1,
      messagesMatched: i === 0 ? unique : 5,
      uniqueMessagesSelected: i === 0 ? unique : 5,
    }))
  );

describe("batched scan consent v3 and coverage bounds", () => {
  it("accepts v3 only, and records coverage above the old 200 cap", async () => {
    const db = await createTestDb();
    await createUser(db, A, "a@example.com");
    const call = (sql: string, p: unknown[] = []) => asUser(db, A, () => db.query(sql, p));
    await expect(call("select public.grant_own_gmail_consent('gmail-discovery-v2-13m')")).rejects.toThrow();
    await call("select public.grant_own_gmail_consent('gmail-discovery-v3-batched')");
    const unique = 1000;
    const total = unique + 20;
    const id = await call(
      `select public.record_own_gmail_scan_coverage('13m', now() - interval '13 months', now(), 14, $1, $1, $1, $1, 0, false, true, $2::jsonb) as id`,
      [total, lanes(unique)]
    );
    expect((id.rows[0] as { id: string }).id).toBeTruthy();
    const row = (await call("select consent_version, unique_messages_selected, scan_status from public.gmail_scan_coverage")).rows[0] as any;
    expect(row).toMatchObject({ consent_version: "gmail-discovery-v3-batched", unique_messages_selected: total, scan_status: "partial" });
    // Still rejects nonsense.
    await expect(
      call(`select public.record_own_gmail_scan_coverage('13m', now() - interval '13 months', now(), 14, 99999, 99999, 99999, 99999, 0, false, true, $1::jsonb)`, [lanes(1000)])
    ).rejects.toThrow();
  });
  it("withdrawing v3 consent removes it", async () => {
    const db = await createTestDb();
    await createUser(db, A, "a@example.com");
    const call = (sql: string) => asUser(db, A, () => db.query(sql));
    await call("select public.grant_own_gmail_consent('gmail-discovery-v3-batched')");
    await call("select public.withdraw_own_gmail_consent('gmail-discovery-v3-batched')");
    expect((await call("select * from public.gmail_consents")).rows).toHaveLength(0);
  });
  it("records coverage once per (scan_id, run_no) even when replayed", async () => {
    const db = await createTestDb();
    await createUser(db, A, "a@example.com");
    const call = (sql: string, p: unknown[] = []) => asUser(db, A, () => db.query(sql, p));
    await call("select public.grant_own_gmail_consent('gmail-discovery-v3-batched')");
    const q = `select public.record_own_gmail_scan_coverage_once($1::uuid, $2, '13m', now() - interval '13 months', now(), 14, 1020, 1000, 1000, 1000, 0, false, true, $3::jsonb) as id`;
    const sid = "22222222-2222-2222-2222-222222222222";
    const a = (await call(q, [sid, 1, lanes(1000)])).rows[0] as { id: string };
    const b = (await call(q, [sid, 1, lanes(1000)])).rows[0] as { id: string };
    expect(b.id).toBe(a.id);
    await call(q, [sid, 2, lanes(1000)]);
    expect((await call("select count(*)::int as n from public.gmail_scan_coverage")).rows[0]).toMatchObject({ n: 2 });
  });
});
