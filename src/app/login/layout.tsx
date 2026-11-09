import type { Metadata } from "next";
import type { ReactNode } from "react";

// The login page is a client component and cannot export metadata itself,
// so its self-referencing canonical lives in this route layout.
export const metadata: Metadata = {
  alternates: { canonical: "/login" },
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}
