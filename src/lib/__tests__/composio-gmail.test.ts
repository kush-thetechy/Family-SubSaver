import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  composioGmailRequest,
  isComposioGmailProvider,
  normalizeComposioMessage,
  COMPOSIO_API_BASE,
} from "../connectors/composio-gmail";
import { getBodyText, getHeader, GmailMessage } from "../connectors/gmail-service";

const ENV = { GMAIL_PROVIDER: "composio", COMPOSIO_API_KEY: "ck_test" };

describe("isComposioGmailProvider", () => {
  it("is on only with the flag and an API key", () => {
    expect(isComposioGmailProvider(ENV)).toBe(true);
    expect(isComposioGmailProvider({ ...ENV, GMAIL_PROVIDER: "direct" })).toBe(false);
    expect(isComposioGmailProvider({ GMAIL_PROVIDER: "composio" })).toBe(false);
    expect(isComposioGmailProvider({})).toBe(false);
  });
});

describe("normalizeComposioMessage", () => {
  it("maps flat Composio fields into the Gmail message shape the parser reads", () => {
    const msg = normalizeComposioMessage({
      message_id: "18f",
      sender: "Google Play <googleplay-noreply@google.com>",
      subject: "Your Google Play order receipt",
      date: "2026-10-01T05:30:00Z",
      message_text: "Order number GPA.1234\nYou paid Rs 149.00",
    }) as unknown as GmailMessage;
    expect(msg.id).toBe("18f");
    expect(msg.internalDate).toBe(String(Date.parse("2026-10-01T05:30:00Z")));
    expect(getHeader(msg.payload?.headers, "Subject")).toContain("Google Play");
    expect(getHeader(msg.payload?.headers, "From")).toContain("googleplay");
    const body = getBodyText(msg.payload!).join("\n");
    expect(body).toContain("Rs 149.00");
  });

  it("passes through an already Gmail-shaped payload", () => {
    const payload = { mimeType: "text/plain", headers: [{ name: "Subject", value: "Hi" }] };
    const msg = normalizeComposioMessage({
      id: "abc",
      internalDate: "1760000000000",
      payload,
    }) as { id: string; internalDate: string; payload: unknown };
    expect(msg.id).toBe("abc");
    expect(msg.internalDate).toBe("1760000000000");
    expect(msg.payload).toBe(payload);
  });
});

describe("composioGmailRequest", () => {
  beforeEach(() => {
    process.env.GMAIL_PROVIDER = ENV.GMAIL_PROVIDER;
    process.env.COMPOSIO_API_KEY = ENV.COMPOSIO_API_KEY;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GMAIL_PROVIDER;
    delete process.env.COMPOSIO_API_KEY;
  });

  it("translates message LIST into GMAIL_FETCH_EMAILS and normalizes ids + page token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          successful: true,
          data: {
            messages: [{ message_id: "m1" }, { id: "m2" }, { nope: true }],
            nextPageToken: "tok2",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const out = await composioGmailRequest<{ messages: { id: string }[]; nextPageToken?: string }>(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?q=receipt&maxResults=100&pageToken=tok1",
      "composio:user-1:ca_1"
    );
    expect(out).toEqual({ messages: [{ id: "m1" }, { id: "m2" }], nextPageToken: "tok2" });
    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe(`${COMPOSIO_API_BASE}/tools/execute/GMAIL_FETCH_EMAILS`);
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("ck_test");
    const body = JSON.parse(init.body as string);
    expect(body.user_id).toBe("user-1");
    expect(body.arguments).toMatchObject({
      query: "receipt",
      max_results: 100,
      page_token: "tok1",
      include_payload: false,
    });
  });

  it("translates message GET into GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID and unwraps envelopes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            message: {
              message_id: "zz9",
              sender: "Apple <no_reply@email.apple.com>",
              subject: "Your receipt from Apple",
              date: "Wed, 1 Oct 2026 10:00:00 +0530",
              message_text: "Apple Music Rs 99.00 /mo",
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const msg = await composioGmailRequest<GmailMessage>(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/zz9?format=full",
      "composio:user-1:ca_1"
    );
    expect(msg.id).toBe("zz9");
    expect(getHeader(msg.payload?.headers, "Subject")).toContain("Apple");
    const body = getBodyText(msg.payload!).join("\n");
    expect(body).toContain("Rs 99.00");
    const body0 = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body0.arguments).toEqual({ message_id: "zz9", format: "full" });
  });

  it("maps HTTP failures to GmailApiError with the status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 401 })));
    await expect(
      composioGmailRequest("https://gmail.googleapis.com/gmail/v1/users/me/messages?q=x", "composio:user-1:ca_1")
    ).rejects.toMatchObject({ status: 401 });
  });

  it("rejects unsupported Gmail paths", async () => {
    await expect(
      composioGmailRequest("https://gmail.googleapis.com/gmail/v1/users/me/labels", "composio:user-1:ca_1")
    ).rejects.toThrow(/Unsupported Gmail path/);
  });
});
