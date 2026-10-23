import { describe, expect, it } from "vitest";
import { asUser, createTestDb, createUser } from "./harness";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

describe("baseline RLS (existing migrations)", () => {
  it("creates a private household per user and isolates subscriptions", async () => {
    const db = await createTestDb();
    await createUser(db, A, "a@example.com");
    await createUser(db, B, "b@example.com");
    const hhA = (await db.query<{ id: string }>("select id from public.households where created_by=$1", [A])).rows[0].id;
    await asUser(db, A, async () => {
      await db.query(
        `insert into public.subscriptions (household_id, service_name, category, billing_cycle, amount_paise, payer_id, user_ids, source)
         values ($1,'Netflix','ott','monthly',19900,$2,array[$2::uuid],'manual')`,
        [hhA, A],
      );
    });
    const seenByB = await asUser(db, B, async () => (await db.query("select * from public.subscriptions")).rows);
    expect(seenByB).toHaveLength(0);
    const seenByA = await asUser(db, A, async () => (await db.query("select * from public.subscriptions")).rows);
    expect(seenByA).toHaveLength(1);
  });
});
