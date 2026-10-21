"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const AUTH_MESSAGES: Record<string, string> = {
  account_created:
    "Account created successfully. You’re signed in to your private account.",
  account_confirmed:
    "Email confirmed successfully. You’re signed in to your private account.",
  signed_in: "Signed in successfully. You’re now in your private account.",
  account_deleted:
    "Your account and associated subscription records were deleted.",
  gmail_imports_deleted: "Gmail-imported subscription records were deleted.",
};

export function AuthStatusNotice() {
  const pathname = usePathname();
  const [message, setMessage] = useState("");

  useEffect(() => {
    const url = new URL(window.location.href);
    const authStatus = url.searchParams.get("auth");
    const accountStatus = url.searchParams.get("account");
    const warning = url.searchParams.get("warning");
    const gmailStatus = url.searchParams.get("gmail");
    if (!authStatus && accountStatus !== "deleted" && !gmailStatus) return;

    const statusMessage =
      gmailStatus === "imports-deleted"
        ? AUTH_MESSAGES.gmail_imports_deleted
        : accountStatus === "deleted"
          ? warning === "google-revoke"
            ? "Your account was deleted, but Google could not confirm Gmail access revocation. Remove Family SubSaver in your Google Account security settings."
            : AUTH_MESSAGES.account_deleted
          : authStatus
            ? AUTH_MESSAGES[authStatus]
            : undefined;
    if (statusMessage) setMessage(statusMessage);

    url.searchParams.delete("auth");
    url.searchParams.delete("account");
    url.searchParams.delete("warning");
    url.searchParams.delete("gmail");
    window.history.replaceState(
      window.history.state,
      "",
      `${pathname}${url.search}${url.hash}`
    );
  }, [pathname]);

  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-5 flex items-start justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
    >
      <p>{message}</p>
      <button
        type="button"
        onClick={() => setMessage("")}
        className="shrink-0 font-semibold underline underline-offset-2"
      >
        Dismiss
      </button>
    </div>
  );
}
