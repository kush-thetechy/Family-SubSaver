import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createTestDb, createUser } from "./harness";

const OWNER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const MEMBER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const STRANGER = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const UNVERIFIED = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const sha = (t: string) => createHash("sha256").update(t).digest("hex");

let db: PGlite;
let ownerHh: string;
let memberHh: string;

const hh = async (u: string) =>
  (await db.query<{ id: string }>("select id from public.households where created_by=$1", [u])).rows[0].id;

async function addSub(user: string, household: string, name: string, extra = "'full_details'") {
  await asUser(db, user, async () => {
    await db.query(
      `insert into public.subscriptions (household_id, service_name, category, billing_cycle, amount_paise, payer_id, user_ids, source, notes, billing_channel, visibility)
       values ($1,$2,'ott','monthly',19900,$3,array[$3::uuid],'import','private note','HDFC card',${extra})`,
      [household, name, user],
    );
  });
}

beforeAll(async () => {
  db = await createTestDb();
  await createUser(db, OWNER, "owner@example.com");
  await createUser(db, MEMBER, "member@example.com");
  await createUser(db, STRANGER, "stranger@example.com");
  await createUser(db, UNVERIFIED, "unverified@example.com", false);
  ownerHh = await hh(OWNER);
  memberHh = await hh(MEMBER);
  await addSub(OWNER, ownerHh, "OwnerNetflix");
  await addSub(MEMBER, memberHh, "MemberSpotify");
  await addSub(MEMBER, memberHh, "MemberHidden", "'hidden'");
  await addSub(STRANGER, await hh(STRANGER), "StrangerSecret");
});

const call = (u: string, sql: string, params: unknown[] = []) =>
  asUser(db, u, async () => db.query(sql, params));

describe("family link flow", () => {
  const token = "token-one";

  it("only the owner can create links; strangers cannot read them", async () => {
    await call(OWNER, "select public.create_household_invitation($1,'Mum')", [sha(token)]);
    await call(MEMBER, "select public.create_household_invitation($1)", [sha("x")]);
    const own = await call(MEMBER, "select household_id from public.household_invitations where token_hash=$1", [sha("x")]);
    expect((own.rows[0] as any).household_id).toBe(memberHh);
    expect((await call(OWNER, "select * from public.household_invitations where token_hash=$1", [sha("x")])).rows).toHaveLength(0);
    expect((await call(STRANGER, "select * from public.household_invitations")).rows).toHaveLength(0);
    expect((await call(OWNER, "select * from public.household_invitations")).rows).toHaveLength(1);
  });

  it("requires consent, verified email and a valid token", async () => {
    await expect(call(MEMBER, "select public.accept_household_invitation($1,false)", [sha(token)])).rejects.toThrow(/consent/i);
    await expect(call(UNVERIFIED, "select public.accept_household_invitation($1,true)", [sha(token)])).rejects.toThrow(/Verified/);
    await expect(call(MEMBER, "select public.accept_household_invitation($1,true)", [sha("wrong")])).rejects.toThrow(/not valid/);
    await expect(call(OWNER, "select public.accept_household_invitation($1,true)", [sha(token)])).rejects.toThrow(/not valid/);
  });

  it("before accepting, nothing is shared", async () => {
    const r = await call(OWNER, "select * from public.household_shared_subscriptions($1)", [ownerHh]);
    expect(r.rows.map((x: any) => x.service_name)).toEqual(["OwnerNetflix"]);
  });

  it("member accepts with consent; link is single use", async () => {
    await call(MEMBER, "select public.accept_household_invitation($1,true)", [sha(token)]);
    await expect(call(STRANGER, "select public.accept_household_invitation($1,true)", [sha(token)])).rejects.toThrow(/not valid/);
  });

  it("owner sees member's non-hidden metadata only, no notes or channel", async () => {
    const r = await call(OWNER, "select * from public.household_shared_subscriptions($1)", [ownerHh]);
    const names = r.rows.map((x: any) => x.service_name).sort();
    expect(names).toEqual(["MemberSpotify", "OwnerNetflix"]);
    expect(Object.keys(r.rows[0] as object)).not.toContain("notes");
    expect(Object.keys(r.rows[0] as object)).not.toContain("billing_channel");
  });

  it("totals_only rows are redacted to amount and category", async () => {
    await addSub(MEMBER, memberHh, "SecretStreaming", "'totals_only'");
    const r = await call(OWNER, "select * from public.household_shared_subscriptions($1)", [ownerHh]);
    const names = r.rows.map((x: any) => x.service_name);
    expect(names).not.toContain("SecretStreaming");
    expect(names).toContain("Private subscription");
    const row = r.rows.find((x: any) => x.service_name === "Private subscription") as any;
    expect(row.plan_name).toBeNull();
    expect(Number(row.amount_paise)).toBe(19900);
    expect(row.renewal_date).toBeNull();
    expect(row.category).toBe('other');
    await db.query("delete from public.subscriptions where service_name='SecretStreaming'");
  });

  it("owner cannot read member's raw rows, and cannot see unrelated users", async () => {
    const raw = await call(OWNER, "select service_name from public.subscriptions order by 1");
    expect(raw.rows.map((x: any) => x.service_name)).toEqual(["OwnerNetflix"]);
    const stranger = await call(STRANGER, "select * from public.household_shared_subscriptions($1)", [ownerHh]);
    expect(stranger.rows).toHaveLength(0);
    const roster = await call(STRANGER, "select * from public.household_roster($1)", [ownerHh]);
    expect(roster.rows).toHaveLength(0);
  });

  it("member cannot write to owner's data or manage the household", async () => {
    await expect(call(MEMBER,
      `insert into public.subscriptions (household_id, service_name, category, billing_cycle, amount_paise, payer_id, user_ids, source)
       values ($1,'Injected','ott','monthly',1,$2,array[$2::uuid],'manual')`, [ownerHh, OWNER])).rejects.toThrow();
    await expect(call(MEMBER, "select public.remove_household_member($1,$2)", [ownerHh, OWNER])).rejects.toThrow();
    await call(MEMBER, "select public.create_household_invitation($1)", [sha("y")]);
    const y = await call(OWNER, "select * from public.household_invitations where token_hash=$1", [sha("y")]);
    expect(y.rows).toHaveLength(0);
  });

  it("leaving stops sharing instantly and leaves member data intact", async () => {
    await call(MEMBER, "select public.leave_household($1)", [ownerHh]);
    const r = await call(OWNER, "select * from public.household_shared_subscriptions($1)", [ownerHh]);
    expect(r.rows.map((x: any) => x.service_name)).toEqual(["OwnerNetflix"]);
    const mine = await call(MEMBER, "select service_name from public.subscriptions order by 1");
    expect(mine.rows).toHaveLength(2);
  });

  it("owner can remove a member and revoke a link; revoked links fail", async () => {
    await call(OWNER, "select public.create_household_invitation($1)", [sha("t2")]);
    const inv = (await call(OWNER, "select id from public.household_invitations where token_hash=$1", [sha("t2")])).rows[0] as any;
    await call(OWNER, "select public.revoke_household_invitation($1)", [inv.id]);
    await expect(call(MEMBER, "select public.accept_household_invitation($1,true)", [sha("t2")])).rejects.toThrow(/not valid/);
    await call(OWNER, "select public.create_household_invitation($1)", [sha("t3")]);
    await call(MEMBER, "select public.accept_household_invitation($1,true)", [sha("t3")]);
    await call(OWNER, "select public.remove_household_member($1,$2)", [ownerHh, MEMBER]);
    const r = await call(OWNER, "select * from public.household_shared_subscriptions($1)", [ownerHh]);
    expect(r.rows).toHaveLength(1);
  });

  it("expired links are rejected", async () => {
    await call(OWNER, "select public.create_household_invitation($1)", [sha("t4")]);
    await db.query("update public.household_invitations set expires_at = now() - interval '1 minute' where token_hash=$1", [sha("t4")]);
    await expect(call(MEMBER, "select public.accept_household_invitation($1,true)", [sha("t4")])).rejects.toThrow(/not valid/);
  });

  it("my_linked_households lists only memberships the caller joined", async () => {
    await call(OWNER, "select public.create_household_invitation($1)", [sha("t5")]);
    await call(MEMBER, "select public.accept_household_invitation($1,true)", [sha("t5")]);
    const mine = await call(MEMBER, "select * from public.my_linked_households()");
    expect(mine.rows).toHaveLength(1);
    expect((await call(OWNER, "select * from public.my_linked_households()")).rows).toHaveLength(0);
    expect((await call(STRANGER, "select * from public.my_linked_households()")).rows).toHaveLength(0);
  });

  it("anon cannot call any family function", async () => {
    await db.exec("set role anon");
    await expect(db.query("select public.accept_household_invitation($1,true)", [sha("t4")])).rejects.toThrow();
    await db.exec("reset role");
  });
});
