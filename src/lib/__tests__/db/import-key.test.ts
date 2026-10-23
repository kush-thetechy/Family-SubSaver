import { describe, expect, it } from "vitest";
import { asUser, createTestDb, createUser } from "./harness";

const A = "11111111-1111-1111-1111-111111111111";

describe("import_key idempotency", () => {
  it("blocks a retry of the same import but not legitimate duplicates", async () => {
    const db = await createTestDb();
    await createUser(db, A, "a@example.com");
    const hh = (await db.query<{ id: string }>("select id from public.households where created_by=$1", [A])).rows[0].id;
    const ins = (key: string | null, name = "Netflix") =>
      asUser(db, A, () =>
        db.query(
          `insert into public.subscriptions (household_id, service_name, category, billing_cycle, amount_paise, payer_id, user_ids, source, import_key)
           values ($1,$2,'ott','monthly',19900,$3,array[$3::uuid],'import',$4)`,
          [hh, name, A, key],
        ),
      );
    await ins("k1");
    await expect(ins("k1")).rejects.toMatchObject({ code: "23505" });
    // Same service, different import evidence (second plan/account): allowed.
    await ins("k2");
    // Manual rows without a key: duplicates allowed.
    await ins(null);
    await ins(null);
    const n = (await asUser(db, A, () => db.query("select count(*)::int c from public.subscriptions"))).rows[0] as { c: number };
    expect(n.c).toBe(4);
  });
});
