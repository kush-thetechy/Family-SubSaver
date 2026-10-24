"use client";

import { useState } from "react";

export default function PayButton({ label }: { label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function start() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const body = (await res.json()) as { checkoutUrl?: string; error?: string };
      if (!res.ok || !body.checkoutUrl) throw new Error(body.error || "Checkout is unavailable.");
      window.location.href = body.checkoutUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout is unavailable.");
      setBusy(false);
    }
  }
  return (
    <div>
      <button type="button" onClick={start} disabled={busy} className="rounded bg-black px-4 py-2 text-white disabled:opacity-60">
        {busy ? "Opening checkout..." : label}
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
