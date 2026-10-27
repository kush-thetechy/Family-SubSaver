import { CatalogService } from "@/types";

export const INDIAN_SUBSCRIPTION_CATALOG: CatalogService[] = [
  {
    id: "spotify",
    name: "Spotify",
    category: "music",
    icon: "music",
    official_website: "https://www.spotify.com/in-en/family/",
    terms_url: "https://www.spotify.com/in-en/legal/premium-family-terms/",
    verified_on: "2026-10-27",
    plans: [
      {
        name: "Family",
        billing_cycle: "monthly",
        amount_paise: 17900,
        user_limit: 6,
        verified: true,
        notes: "Up to 6 accounts. Family members must live at the same address. Price read from spotify.com/in-en/family on 27 Oct 2026.",
      },
    ],
    sharing_policy_notes:
      "All members of the Family plan must reside at the same physical address. Spotify periodically verifies residential address.",
  },
  {
    id: "youtube_premium",
    name: "YouTube Premium",
    category: "music",
    icon: "video",
    official_website: "https://www.youtube.com/premium",
    terms_url: "https://support.google.com/youtube/answer/7507349",
    verified_on: "2026-01-15 (not rechecked)",
    plans: [
      {
        name: "Individual",
        billing_cycle: "monthly",
        amount_paise: 14900,
        user_limit: 1,
        notes: "Ad-free YouTube & YouTube Music for 1 user",
      },
      {
        name: "Family",
        billing_cycle: "monthly",
        amount_paise: 29900,
        user_limit: 5,
        notes: "Up to 5 family members (ages 13+) living in the same household",
      },
    ],
    sharing_policy_notes:
      "Google requires family group members to live in the same household. Electronic check-ins every 30 days.",
  },
  {
    id: "netflix",
    name: "Netflix",
    category: "ott",
    icon: "tv",
    official_website: "https://help.netflix.com/en/node/24926",
    terms_url: "https://help.netflix.com/en/node/123277",
    verified_on: "2026-01-15 (not rechecked)",
    plans: [
      {
        name: "Mobile",
        billing_cycle: "monthly",
        amount_paise: 14900,
        user_limit: 1,
        notes: "1 phone/tablet at a time, 480p",
      },
      {
        name: "Basic",
        billing_cycle: "monthly",
        amount_paise: 19900,
        user_limit: 1,
        notes: "1 supported device at a time, 720p HD",
      },
      {
        name: "Standard",
        billing_cycle: "monthly",
        amount_paise: 49900,
        user_limit: 2,
        notes: "2 supported devices at a time, 1080p Full HD",
      },
      {
        name: "Premium",
        billing_cycle: "monthly",
        amount_paise: 64900,
        user_limit: 4,
        notes: "4 supported devices at a time, 4K Ultra HD + HDR, spatial audio",
      },
    ],
    sharing_policy_notes:
      "A Netflix account is for use by one household (people who live in the same location). Primary location Wi-Fi verification enforced.",
  },
  {
    id: "disney_hotstar",
    name: "Disney+ Hotstar",
    category: "ott",
    icon: "film",
    official_website: "https://www.hotstar.com/in/subscribe/get-started",
    terms_url: "https://www.hotstar.com/in/terms-of-use",
    verified_on: "2026-01-15 (not rechecked)",
    plans: [
      {
        name: "Super (Annual)",
        billing_cycle: "annual",
        amount_paise: 89900,
        user_limit: 2,
        notes: "2 devices concurrent, Full HD 1080p, with ads",
      },
      {
        name: "Premium (Annual)",
        billing_cycle: "annual",
        amount_paise: 149900,
        user_limit: 4,
        notes: "4 devices concurrent, 4K 2160p + Dolby Vision, ad-free (except live sports)",
      },
    ],
    sharing_policy_notes:
      "Concurrent streams are strictly limited per plan (2 for Super, 4 for Premium).",
  },
  {
    id: "google_one",
    name: "Google One",
    category: "cloud",
    icon: "cloud",
    official_website: "https://one.google.com/about/plans",
    terms_url: "https://support.google.com/googleone/answer/9004014",
    verified_on: "2026-01-15 (not rechecked)",
    plans: [
      {
        name: "Basic 100GB (Annual)",
        billing_cycle: "annual",
        amount_paise: 130000,
        user_limit: 5,
        notes: "Shareable with up to 5 family members. Each gets private space.",
      },
      {
        name: "Standard 200GB (Annual)",
        billing_cycle: "annual",
        amount_paise: 210000,
        user_limit: 5,
        notes: "Shareable with up to 5 family members.",
      },
      {
        name: "Premium 2TB (Annual)",
        billing_cycle: "annual",
        amount_paise: 650000,
        user_limit: 5,
        notes: "Shareable with up to 5 family members + Google Workspace premium features.",
      },
    ],
    sharing_policy_notes:
      "Can be shared with up to 5 additional family members via Google Family Group without sharing personal files.",
  },
  {
    id: "chatgpt_plus",
    name: "ChatGPT Plus",
    category: "ai",
    icon: "bot",
    official_website: "https://openai.com/chatgpt/pricing/",
    terms_url: "https://openai.com/policies/terms-of-use/",
    verified_on: "2026-01-15 (not rechecked)",
    plans: [
      {
        name: "Plus (Monthly)",
        billing_cycle: "monthly",
        amount_paise: 199900, // $20 + GST approx ₹1,999 in India
        user_limit: 1,
        notes: "Single user personal subscription",
      },
      {
        name: "Team (Monthly per seat)",
        billing_cycle: "monthly",
        amount_paise: 250000, // $25/seat min 2 users
        user_limit: 1,
        notes: "Team workspace, min 2 users, centralized billing",
      },
    ],
    sharing_policy_notes:
      "OpenAI personal accounts are strictly single-user. Account sharing can result in suspension or rate limit throttling.",
  },
];

