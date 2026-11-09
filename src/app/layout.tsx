import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { PendingJoinRedirect } from "@/components/PendingJoinRedirect";
import { SITE_ORIGIN } from "@/lib/seo";
import { AppProvider } from "@/context/AppContext";
import { AuthStatusNotice } from "@/components/AuthStatusNotice";
import { Navigation } from "@/components/Navigation";

export const metadata: Metadata = {
  // Absolute base so relative canonicals resolve onto the production www host.
  // Each crawlable route sets its own self-referencing canonical (see
  // src/lib/seo.ts); authed app routes deliberately emit none.
  metadataBase: new URL(SITE_ORIGIN),
  title: "Family Subscription Saver | Indian Household Subscription Hub",
  description:
    "A mobile-first subscription management app for Indian families to understand household spending, identify duplicate services, and review legitimate savings opportunities.",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#4f46e5",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased pb-20 lg:pb-8">
        <AppProvider>
          <Navigation />
          <main
            data-clarity-mask="true"
            className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6"
          >
            <AuthStatusNotice />
            <PendingJoinRedirect />
            {children}
          </main>
          <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 lg:pb-10 text-xs text-slate-500 dark:text-slate-400">
            <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-slate-200 dark:border-slate-800 pt-4">
              <Link href="/privacy" className="hover:text-slate-900 dark:hover:text-white">Privacy</Link>
              <Link href="/terms" className="hover:text-slate-900 dark:hover:text-white">Terms</Link>
              <Link href="/pricing" className="hover:text-slate-900 dark:hover:text-white">Pricing</Link>
              <Link href="/refunds" className="hover:text-slate-900 dark:hover:text-white">Refunds</Link>
              <Link href="/contact" className="hover:text-slate-900 dark:hover:text-white">Contact</Link>
            </nav>
          </footer>
        </AppProvider>
      </body>
    </html>
  );
}
