"use client";

import { useEffect, useState } from "react";

const CONSENT_KEY = "fss_clarity_consent_v1";
const CONSENT_EVENT = "fss-clarity-consent-change";
const CLARITY_ID = "z4ao34d8al";

declare global {
  interface Window {
    clarity?: ((...args: unknown[]) => void) & { q?: unknown[][] };
  }
}

function loadClarity() {
  const clarity =
    window.clarity ||
    Object.assign(
      (...args: unknown[]) => {
        const queue = window.clarity?.q ?? [];
        queue.push(args);
        if (window.clarity) window.clarity.q = queue;
      },
      { q: [] as unknown[][] }
    );
  window.clarity = clarity;

  if (!document.getElementById("fss-clarity-loader")) {
    const script = document.createElement("script");
    script.id = "fss-clarity-loader";
    script.async = true;
    script.src = `https://www.clarity.ms/tag/${CLARITY_ID}`;
    document.head.appendChild(script);
  }
  clarity("consent", true);
}

export function ClarityAnalytics() {
  const [consent, setConsent] = useState<"accepted" | "rejected" | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(CONSENT_KEY);
    if (stored === "accepted" || stored === "rejected") {
      setConsent(stored);
      if (stored === "accepted") loadClarity();
    }

    const handleConsentChange = (event: Event) => {
      const accepted = (event as CustomEvent<boolean>).detail;
      const choice = accepted ? "accepted" : "rejected";
      localStorage.setItem(CONSENT_KEY, choice);
      setConsent(choice);
      if (accepted) {
        loadClarity();
      } else {
        window.clarity?.("consent", false);
      }
    };
    window.addEventListener(CONSENT_EVENT, handleConsentChange);
    return () => window.removeEventListener(CONSENT_EVENT, handleConsentChange);
  }, []);

  const chooseConsent = (accepted: boolean) => {
    window.dispatchEvent(
      new CustomEvent(CONSENT_EVENT, { detail: accepted })
    );
  };

  if (consent !== null) return null;

  return (
    <aside
      aria-label="Analytics privacy choices"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-3xl flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl sm:p-4 sm:gap-3 dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
        <span className="sm:hidden">
          Allow Microsoft Clarity usage analytics? Text and your email are
          masked. Change anytime in Settings.
        </span>
        <span className="hidden sm:inline">
          Allow Microsoft Clarity to collect usage and interaction analytics to
          improve the app? Application text and your account email are masked.
          You can change this choice in Settings.
        </span>
      </p>
      <div className="flex shrink-0 items-center gap-2 [&>button]:flex-1 sm:[&>button]:flex-none">
        <button
          type="button"
          onClick={() => chooseConsent(false)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Reject
        </button>
        <button
          type="button"
          onClick={() => chooseConsent(true)}
          className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
        >
          Allow analytics
        </button>
      </div>
    </aside>
  );
}
