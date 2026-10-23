import { createHash, randomBytes } from "node:crypto";

export const INVITE_TTL_DAYS = 7;
export const INVITES_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_HOUSEHOLD_INVITES === "true";

export type InviteRole = "admin" | "member";

export interface InviteInput {
  email: string;
  role: InviteRole;
  consentAcknowledged: boolean;
}

export type InviteValidation =
  | { ok: true; email: string; role: InviteRole }
  | { ok: false; error: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateInvite(
  input: InviteInput,
  inviterEmail: string,
): InviteValidation {
  const email = normalizeInviteEmail(input.email);
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (email === normalizeInviteEmail(inviterEmail)) {
    return { ok: false, error: "You cannot invite yourself." };
  }
  if (input.role !== "member" && input.role !== "admin") {
    return { ok: false, error: "Invalid role." };
  }
  if (!input.consentAcknowledged) {
    return { ok: false, error: "Confirm the sharing consent notice first." };
  }
  return { ok: true, email, role: input.role };
}

/** The raw token goes only to the invitee; only its SHA-256 hash is stored. */
export function createInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInviteToken(token) };
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
