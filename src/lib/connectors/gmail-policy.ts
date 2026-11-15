import type { SupabaseClient } from "@supabase/supabase-js";
import { isComposioGmailProvider } from "./composio-gmail";

export const GMAIL_CONSENT_VERSION = "gmail-discovery-v3-batched";

export type GmailMode = "disabled" | "test" | "public";

export function getGmailMode(): GmailMode {
  const configuredMode = process.env.GMAIL_MODE;
  if (
    configuredMode === "disabled" ||
    configuredMode === "test" ||
    configuredMode === "public"
  ) {
    return configuredMode;
  }
  return "disabled";
}

export function isGmailEnabledForUser(userId: string): boolean {
  const mode = getGmailMode();
  if (mode === "disabled") return false;

  // Composio-managed Gmail connects through Composio's own Google app, so this app's
  // unverified Google OAuth client is not in the path. The owner opts in explicitly.
  if (isComposioGmailProvider() && process.env.GMAIL_COMPOSIO_OPEN_TO_ALL === "true") {
    return true;
  }

  if (mode === "test") {
    const allowedUserIds = new Set(
      (process.env.GMAIL_TESTER_USER_IDS || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    );
    return allowedUserIds.has(userId);
  }

  return (
    process.env.GMAIL_PUBLIC_LAUNCH_APPROVED === "true" &&
    process.env.GMAIL_GOOGLE_VERIFICATION_CONFIRMED === "true" &&
    process.env.GMAIL_SECURITY_ASSESSMENT_CONFIRMED === "true" &&
    process.env.GMAIL_PRIVACY_REVIEW_CONFIRMED === "true"
  );
}

export async function hasCurrentGmailConsent(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("gmail_consents")
    .select("user_id")
    .eq("user_id", userId)
    .eq("version", GMAIL_CONSENT_VERSION)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
