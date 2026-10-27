import { describe, it, expect } from "vitest";
import { generateSavingsRecommendations } from "../recommendations";
import { Subscription } from "@/types";

describe("Savings Recommendations & Conservative Checks", () => {
  it("flags duplicate Spotify subscriptions with potential savings based on verified catalog", () => {
    const subs: Subscription[] = [
      {
        id: "sub-spotify-1",
        household_id: "h-1",
        service_name: "Spotify",
        category: "music",
        billing_cycle: "monthly",
        amount_paise: 11900, // ₹119
        payer_id: "user-1",
        user_ids: ["user-1"],
        is_active: true,
        visibility: "full_details",
        source: "manual",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "sub-spotify-2",
        household_id: "h-1",
        service_name: "Spotify",
        category: "music",
        billing_cycle: "monthly",
        amount_paise: 11900, // ₹119
        payer_id: "user-2",
        user_ids: ["user-2"],
        is_active: true,
        visibility: "full_details",
        source: "manual",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const recs = generateSavingsRecommendations(subs);
    expect(recs.length).toBeGreaterThan(0);

    const spotifyRec = recs.find((r) => r.id === "rec-family-spotify");
    expect(spotifyRec).toBeDefined();
    // State must be potential_saving because family residency verification is required
    expect(spotifyRec?.state).toBe("potential_saving");
    // Only the provider-verified Family plan (Rs179, up to 6) is used. Spend Rs238, saving Rs59.
    expect(spotifyRec?.potential_monthly_savings_paise).toBe(5900);
    expect(spotifyRec?.assumptions).toContain(
      "All members must meet the provider's residency policy (residing at the same physical household)."
    );
  });

  it("produces compare_only with 0 definitive savings for services without verified catalog family tier", () => {
    const subs: Subscription[] = [
      {
        id: "sub-custom-1",
        household_id: "h-1",
        service_name: "Niche Yoga App",
        category: "fitness",
        billing_cycle: "monthly",
        amount_paise: 50000,
        payer_id: "user-1",
        user_ids: ["user-1"],
        is_active: true,
        visibility: "full_details",
        source: "manual",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "sub-custom-2",
        household_id: "h-1",
        service_name: "Niche Yoga App",
        category: "fitness",
        billing_cycle: "monthly",
        amount_paise: 50000,
        payer_id: "user-2",
        user_ids: ["user-2"],
        is_active: true,
        visibility: "full_details",
        source: "manual",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const recs = generateSavingsRecommendations(subs);
    const yogaRec = recs.find((r) => r.category === "fitness");
    expect(yogaRec).toBeDefined();
    expect(yogaRec?.state).toBe("compare_only");
    // Conservative rule: Do NOT invent a savings number when catalog or family eligibility is unknown!
    expect(yogaRec?.potential_monthly_savings_paise).toBe(0);
  });

  it("treats multiple AI tools as compare_only with 0 savings", () => {
    const subs: Subscription[] = [
      {
        id: "sub-gpt",
        household_id: "h-1",
        service_name: "ChatGPT Plus",
        category: "ai",
        billing_cycle: "monthly",
        amount_paise: 199900,
        payer_id: "user-1",
        user_ids: ["user-1"],
        is_active: true,
        visibility: "full_details",
        source: "manual",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "sub-claude",
        household_id: "h-1",
        service_name: "Claude Pro",
        category: "ai",
        billing_cycle: "monthly",
        amount_paise: 199900,
        payer_id: "user-2",
        user_ids: ["user-2"],
        is_active: true,
        visibility: "full_details",
        source: "manual",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const recs = generateSavingsRecommendations(subs);
    const aiRec = recs.find((r) => r.id === "rec-ai-overlap");
    expect(aiRec).toBeDefined();
    expect(aiRec?.state).toBe("compare_only");
    expect(aiRec?.potential_monthly_savings_paise).toBe(0);
    expect(aiRec?.assumptions[0]).toContain(
      "AI tools have differing models, context lengths, and coding/writing capabilities"
    );
  });
});

describe("plan capacity", () => {
  it("does not propose a 2-seat Duo plan for 3 Spotify accounts", () => {
    const mk = (id: string) => ({
      id, household_id: "h", service_name: "Spotify", plan_name: "Individual", category: "music",
      billing_cycle: "monthly", amount_paise: 11900, validity_days: null, payer_id: "u1",
      user_ids: ["u1"], billing_channel: "UPI AutoPay", renewal_date: null, is_active: true,
      visibility: "full_details", source: "manual", notes: null, created_at: "", updated_at: "",
    }) as never;
    const recs = generateSavingsRecommendations([mk("1"), mk("2"), mk("3")]);
    const rec = recs.find((r) => r.state === "potential_saving");
    expect(rec?.title).toContain("Family");
    expect(rec?.potential_monthly_savings_paise).toBe(35700 - 17900);
  });
});

describe("unverified prices", () => {
  it("never claims savings from a catalog plan that was not verified", () => {
    const mk = (id: string) => ({
      id, household_id: "h", service_name: "YouTube Premium", plan_name: "Individual", category: "music",
      billing_cycle: "monthly", amount_paise: 29900, validity_days: null, payer_id: "u1",
      user_ids: ["u1"], billing_channel: "UPI AutoPay", renewal_date: null, is_active: true,
      visibility: "full_details", source: "manual", notes: null, created_at: "", updated_at: "",
    }) as never;
    const recs = generateSavingsRecommendations([mk("1"), mk("2")]);
    expect(recs.some((r) => r.state === "potential_saving")).toBe(false);
  });
});
