import Link from "next/link";

/**
 * Public homepage for signed-out visitors.
 * Google OAuth app verification requires a homepage that is visible without login,
 * describes the app's functionality and the purpose for requesting Google user data,
 * and links the privacy policy (support.google.com/cloud/answer/13807376).
 * Copy reuses the existing approved privacy policy wording; no new policy claims.
 */
export function PublicLanding() {
  return (
    <div className="mx-auto max-w-3xl py-10 sm:py-16">
      <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
        Indian Household Subscription Hub
      </p>
      <h1 className="mt-2 text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white">
        Family SubSaver
      </h1>
      <p className="mt-4 text-base sm:text-lg text-slate-600 dark:text-slate-300">
        A mobile-first subscription management app for Indian families to
        understand household spending, identify duplicate services, and review
        legitimate savings opportunities.
      </p>

      <h2 className="mt-10 text-lg font-semibold text-slate-900 dark:text-white">
        Add subscriptions your way
      </h2>
      <ul className="mt-3 list-disc pl-5 space-y-2 text-slate-600 dark:text-slate-300">
        <li>By hand, in a few taps.</li>
        <li>
          From screenshots, which are read in your browser and are not uploaded.
        </li>
        <li>From a Gmail scan you start yourself.</li>
      </ul>

      <h2 className="mt-10 text-lg font-semibold text-slate-900 dark:text-white">
        Gmail, only if you connect it
      </h2>
      <ul className="mt-3 list-disc pl-5 space-y-2 text-slate-600 dark:text-slate-300">
        <li>Read-only access. Scans run only when you click. No background scanning.</li>
        <li>
          When you start a scan, our server searches Gmail for matching
          subscription receipts, renewals and payment mandate messages. It
          processes matched message text in memory to extract subscription
          details and show suggestions. Attachments are not fetched. The app
          does not intentionally write message bodies or access tokens to its
          database or application logs. Subscription records are saved only
          after you confirm them.
        </li>
        <li>
          Gmail data is not sold, not used for advertising, and not used to
          train AI models.
        </li>
      </ul>
      <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
        Read the full{" "}
        <Link href="/privacy" className="font-semibold text-indigo-600 underline dark:text-indigo-400">
          privacy policy
        </Link>
        .
      </p>

      <div className="mt-10">
        <Link
          href="/login"
          className="inline-flex items-center rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-600/20 hover:bg-indigo-700"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}
