"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useApp } from "@/context/AppContext";
import { FAMILY_LINK_ENABLED, PENDING_JOIN_KEY } from "@/lib/family-link";

/** After sign-in or email confirmation, send people with a saved family link to /join. */
export function PendingJoinRedirect() {
  const { authUser } = useApp();
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (!FAMILY_LINK_ENABLED || !authUser || pathname === "/join") return;
    try {
      if (localStorage.getItem(PENDING_JOIN_KEY)) router.replace("/join");
    } catch {
      /* storage unavailable */
    }
  }, [authUser, pathname, router]);
  return null;
}
