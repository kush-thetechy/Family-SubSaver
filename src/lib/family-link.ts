import { getSupabaseBrowserClient } from "@/lib/supabase";

export const FAMILY_LINK_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_FAMILY_LINK === "true";

export const PENDING_JOIN_KEY = "fss_pending_join_v1";

export function generateInviteToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Token lives in the URL fragment so it never reaches server logs. */
export function buildInviteUrl(origin: string, token: string): string {
  return `${origin}/join#t=${token}`;
}

export function parseInviteToken(hash: string): string | null {
  const match = /^#?t=([0-9a-f]{64})$/.exec(hash);
  return match ? match[1] : null;
}

function client() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error("Sign-in is not configured.");
  return supabase;
}

export async function createInvite(label?: string): Promise<string> {
  const token = generateInviteToken();
  const { error } = await client().rpc("create_household_invitation", {
    invitation_token_hash: await sha256Hex(token),
    invitation_label: label?.trim() || null,
  });
  if (error) throw new Error(error.message);
  return token;
}

export interface OpenInvite {
  id: string;
  label: string | null;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}

export async function listInvites(): Promise<OpenInvite[]> {
  const { data, error } = await client()
    .from("household_invitations")
    .select("id,label,created_at,expires_at,accepted_at,revoked_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as OpenInvite[];
}

export async function revokeInvite(id: string): Promise<void> {
  const { error } = await client().rpc("revoke_household_invitation", { invitation_id: id });
  if (error) throw new Error(error.message);
}

export async function previewInvite(token: string): Promise<{ household_name: string; owner_name: string }> {
  const { data, error } = await client().rpc("preview_household_invitation", {
    invitation_token_hash: await sha256Hex(token),
  });
  if (error) throw new Error("This link is not valid. It may have expired, been used, or been revoked.");
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("This link is not valid. It may have expired, been used, or been revoked.");
  return row;
}

export async function acceptInvite(token: string): Promise<void> {
  const { error } = await client().rpc("accept_household_invitation", {
    invitation_token_hash: await sha256Hex(token),
    consent: true,
  });
  if (error) throw new Error("Could not join. The link may be invalid, or your email is not verified yet.");
}

export async function leaveHousehold(householdId: string): Promise<void> {
  const { error } = await client().rpc("leave_household", { h: householdId });
  if (error) throw new Error(error.message);
}

export async function removeMemberRemote(householdId: string, userId: string): Promise<void> {
  const { error } = await client().rpc("remove_household_member", { h: householdId, member: userId });
  if (error) throw new Error(error.message);
}

export interface LinkedHousehold {
  household_id: string;
  household_name: string;
  owner_name: string;
  joined_at: string;
}

export async function myLinkedHouseholds(): Promise<LinkedHousehold[]> {
  const { data, error } = await client().rpc("my_linked_households");
  if (error) throw new Error(error.message);
  return (data ?? []) as LinkedHousehold[];
}
