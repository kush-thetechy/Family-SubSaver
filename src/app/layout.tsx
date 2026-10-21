import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProvider } from "@/context/AppContext";
import { Navigation } from "@/components/Navigation";
import { ClarityAnalytics } from "@/components/ClarityAnalytics";

export const metadata: Metadata = {
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
      <body className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased pb-20 md:pb-8">
        <AppProvider>
          <Navigation />
          <main
            data-clarity-mask="true"
            className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6"
          >
            {children}
          </main>
          <ClarityAnalytics />
        </AppProvider>
      </body>
    </html>
  );
}
