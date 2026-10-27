"use client";

import { useEffect, useState } from "react";

const CONSENT_KEY = "fss_clarity_consent_v1";
const CONSENT_EVENT = "fss-clarity-consent-change";

type Choice = "accepted" | "rejected" | null;

export function AnalyticsSettings() {
  const [choice, setChoice] = useState<Choice>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(CONSENT_KEY);
    setChoice(
      stored === "accepted" || stored === "rejected" ? stored : null
    );
    setLoaded(true);

    const handleConsentChange = (event: Event) => {
      setChoice((event as CustomEvent<boolean>).detail ? "accepted" : "rejected");
    };
    window.addEventListener(CONSENT_EVENT, handleConsentChange);
    return () => window.removeEventListener(CONSENT_EVENT, handleConsentChange);
  }, []);

  const updateChoice = (accepted: boolean) => {
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: accepted }));
  };

  if (!loaded) return null;

  return (
    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
      <h3 className="font-bold text-sm text-slate-900 dark:text-white">
        Usage analytics (Microsoft Clarity)
      </h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
        {choice === "accepted" &&
          "Analytics is on. Clarity records usage and interaction analytics with all text masked."}
        {choice === "rejected" &&
          "Analytics is off. No usage analytics is sent."}
        {choice === null &&
          "You have not chosen yet. The app asks on your next visit; nothing is sent until you choose Allow."}
      </p>
      <div className="flex gap-2 pt-3">
        {choice !== "accepted" ? (
          <button
            type="button"
            onClick={() => updateChoice(true)}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            Turn analytics on
          </button>
        ) : (
          <button
            type="button"
            onClick={() => updateChoice(false)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-white dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Turn analytics off
          </button>
        )}
      </div>
    </div>
  );
}
