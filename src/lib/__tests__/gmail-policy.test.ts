import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GMAIL_CONSENT_VERSION,
  getGmailMode,
  isGmailEnabledForUser,
} from "../connectors/gmail-policy";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Gmail release controls", () => {
  it("requires the updated consent version for the expanded history window", () => {
    expect(GMAIL_CONSENT_VERSION).toBe("gmail-discovery-v3-batched");
  });

  it("fails closed when the mode is missing or invalid", () => {
    vi.stubEnv("GMAIL_MODE", "");
    expect(getGmailMode()).toBe("disabled");
    expect(isGmailEnabledForUser("tester")).toBe(false);

    vi.stubEnv("GMAIL_MODE", "preview");
    expect(getGmailMode()).toBe("disabled");
  });

  it("allows only the server-allowlisted test account", () => {
    vi.stubEnv("GMAIL_MODE", "test");
    vi.stubEnv("GMAIL_TESTER_USER_IDS", "user-1, user-2");

    expect(isGmailEnabledForUser("user-1")).toBe(true);
    expect(isGmailEnabledForUser("user-3")).toBe(false);
  });

  it("keeps public mode disabled until every owner release gate is true", () => {
    vi.stubEnv("GMAIL_MODE", "public");
    vi.stubEnv("GMAIL_PUBLIC_LAUNCH_APPROVED", "true");
    vi.stubEnv("GMAIL_GOOGLE_VERIFICATION_CONFIRMED", "true");
    vi.stubEnv("GMAIL_SECURITY_ASSESSMENT_CONFIRMED", "true");
    vi.stubEnv("GMAIL_PRIVACY_REVIEW_CONFIRMED", "false");

    expect(isGmailEnabledForUser("any-user")).toBe(false);
    vi.stubEnv("GMAIL_PRIVACY_REVIEW_CONFIRMED", "true");
    expect(isGmailEnabledForUser("any-user")).toBe(true);
  });
});
