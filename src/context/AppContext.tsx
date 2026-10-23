"use client";

import { AlreadyImportedError } from "@/lib/already-imported";
import React, { createContext, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  Household,
  HouseholdMember,
  MemberRole,
  Profile,
  SavingsRecommendation,
  Subscription,
} from "@/types";
import {
  DEMO_HOUSEHOLD,
  DEMO_MEMBERS,
  DEMO_PROFILES,
  DEMO_SUBSCRIPTIONS,
} from "@/lib/demo-data";
import {
  calculateHouseholdSummary,
  SpendingSummary,
} from "@/lib/calculations";
import { generateSavingsRecommendations } from "@/lib/recommendations";
import { FAMILY_LINK_ENABLED } from "@/lib/family-link";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

interface AuditProgress {
  score: number;
  label: string;
  isComplete: boolean;
  missingPayerCount: number;
  missingUsersCount: number;
  unconfirmedCount: number;
}

interface AppContextType {
  isDemoMode: boolean;
  authUser: User | null;
  accountError: string;
  isFamilyView: boolean;
  currentProfile: Profile;
  allProfiles: Profile[];
  household: Household;
  members: HouseholdMember[];
  subscriptions: Subscription[];
  summary: SpendingSummary;
  recommendations: SavingsRecommendation[];
  auditProgress: AuditProgress;
  switchActiveProfile: (userId: string) => void;
  addSubscription: (
    sub: Omit<Subscription, "id" | "created_at" | "updated_at">
  ) => Promise<string>;
  updateSubscription: (
    id: string,
    updates: Partial<Subscription>
  ) => Promise<void>;
  deleteSubscription: (id: string) => Promise<void>;
  inviteMember: (name: string, email: string, role: MemberRole) => void;
  removeMember: (memberId: string) => void;
  resetDemoData: () => void;
  exportDataJson: () => string;
  deleteAllHouseholdData: () => Promise<void>;
  signOut: () => Promise<string | null>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEY_SUBS = "fss_subscriptions_v1";
const STORAGE_KEY_MEMBERS = "fss_members_v1";
const STORAGE_KEY_USER = "fss_active_user_v1";
const STORAGE_KEY_FAMILY_VIEW = "fss_family_view_v1";

const EMPTY_PROFILE: Profile = {
  id: "",
  name: "Your account",
  email: "",
  created_at: "",
};
const EMPTY_HOUSEHOLD: Household = {
  id: "",
  name: "Your household",
  created_by: "",
  created_at: "",
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const isDemoMode =
    !isSupabaseConfigured &&
    process.env.NEXT_PUBLIC_ENABLE_DEMO_MODE === "true";
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [accountError, setAccountError] = useState("");
  const [allProfiles, setAllProfiles] = useState<Profile[]>(
    isDemoMode ? DEMO_PROFILES : []
  );
  const [household, setHousehold] = useState<Household>(
    isDemoMode ? DEMO_HOUSEHOLD : EMPTY_HOUSEHOLD
  );
  const [members, setMembers] = useState<HouseholdMember[]>(
    isDemoMode ? DEMO_MEMBERS : []
  );
  const [subscriptions, setSubscriptions] = useState<Subscription[]>(
    isDemoMode ? DEMO_SUBSCRIPTIONS : []
  );
  const [currentProfile, setCurrentProfile] = useState<Profile>(
    isDemoMode ? DEMO_PROFILES[0] : EMPTY_PROFILE
  );
  const [isFamilyView, setIsFamilyView] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (isDemoMode) {
      try {
        const savedSubs = localStorage.getItem(STORAGE_KEY_SUBS);
        const savedMembers = localStorage.getItem(STORAGE_KEY_MEMBERS);
        const savedUserId = localStorage.getItem(STORAGE_KEY_USER);
        const savedFamilyView = localStorage.getItem(STORAGE_KEY_FAMILY_VIEW);

        if (savedSubs) setSubscriptions(JSON.parse(savedSubs));
        if (savedMembers) setMembers(JSON.parse(savedMembers));
        if (savedUserId) {
          const found = DEMO_PROFILES.find((profile) => profile.id === savedUserId);
          if (found) setCurrentProfile(found);
        }
        setIsFamilyView(savedFamilyView === "true");
      } catch {
        setAccountError("Could not load demo data from this browser.");
      } finally {
        setIsLoaded(true);
      }
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setIsLoaded(true);
      return;
    }

    let isActive = true;
    let loadRevision = 0;
    let authEventReceived = false;
    const clearAccountData = () => {
      loadRevision += 1;
      setAuthUser(null);
      setCurrentProfile(EMPTY_PROFILE);
      setAllProfiles([]);
      setHousehold(EMPTY_HOUSEHOLD);
      setMembers([]);
      setSubscriptions([]);
      setIsFamilyView(false);
    };

    const loadAccountData = async (user: User) => {
      const revision = ++loadRevision;
      setAuthUser(user);
      setAccountError("");
      setCurrentProfile({
        id: user.id,
        name:
          user.user_metadata?.name || user.email?.split("@")[0] || "Account holder",
        email: user.email ?? "",
        created_at: user.created_at,
      });
      setAllProfiles([]);
      setHousehold(EMPTY_HOUSEHOLD);
      setMembers([]);
      setSubscriptions([]);
      setIsFamilyView(false);

      try {
        const { data: profileRow, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();
        if (profileError) throw profileError;

        const { data: memberRow, error: memberError } = await supabase
          .from("household_members")
          .select("*")
          .eq("user_id", user.id)
          .eq("status", "active")
          .eq("role", "owner")
          .maybeSingle();
        if (memberError) throw memberError;
        if (!memberRow) {
          throw new Error(
            "Your household is not set up yet. Apply the latest Supabase database migration and sign in again."
          );
        }

        const { data: householdRow, error: householdError } = await supabase
          .from("households")
          .select("*")
          .eq("id", memberRow.household_id)
          .maybeSingle();
        if (householdError) throw householdError;
        if (!householdRow) {
          throw new Error(
            "Your household could not be loaded. Check its membership and database access policies."
          );
        }

        const { data: subscriptionRows, error: subscriptionsError } =
          await supabase
            .from("subscriptions")
            .select("*")
            .eq("household_id", householdRow.id)
            .order("created_at", { ascending: false });
        if (subscriptionsError) throw subscriptionsError;
        if (!isActive || revision !== loadRevision) return;

        const profile: Profile = profileRow
          ? (profileRow as Profile)
          : {
              id: user.id,
              name:
                user.user_metadata?.name ||
                user.email?.split("@")[0] ||
                "Account holder",
              email: user.email ?? "",
              created_at: user.created_at,
            };
        setCurrentProfile(profile);
        setAllProfiles([profile]);
        let loadedMembers: HouseholdMember[] = [memberRow as HouseholdMember];
        let loadedSubs = (subscriptionRows ?? []) as Subscription[];
        const loadedProfiles: Profile[] = [profile];

        if (FAMILY_LINK_ENABLED) {
          // Linked family members: consent-scoped roster and metadata-only shared rows.
          const [rosterRes, sharedRes] = await Promise.all([
            supabase.rpc("household_roster", { h: householdRow.id }),
            supabase.rpc("household_shared_subscriptions", { h: householdRow.id }),
          ]);
          if (rosterRes.error) throw rosterRes.error;
          if (sharedRes.error) throw sharedRes.error;
          const roster = (rosterRes.data ?? []) as {
            user_id: string; name: string; role: MemberRole; joined_at: string;
          }[];
          loadedMembers = roster.map((r) => ({
            id: `${householdRow.id}:${r.user_id}`,
            household_id: householdRow.id,
            user_id: r.user_id,
            role: r.role,
            name: r.name,
            email: r.user_id === user.id ? profile.email : "",
            joined_at: r.joined_at,
            status: "active" as const,
          }));
          for (const r of roster) {
            if (r.user_id !== user.id) {
              loadedProfiles.push({ id: r.user_id, name: r.name, email: "", created_at: r.joined_at });
            }
          }
          const shared = (sharedRes.data ?? []) as {
            id: string; payer_id: string | null; service_name: string; plan_name: string | null;
            category: Subscription["category"]; billing_cycle: Subscription["billing_cycle"];
            amount_paise: number | string; renewal_date: string | null; is_active: boolean;
            visibility: Subscription["visibility"];
          }[];
          const mine = new Set(loadedSubs.map((x) => x.id));
          const others: Subscription[] = shared
            .filter((x) => !mine.has(x.id) && x.payer_id !== user.id)
            .map((x) => ({
              id: x.id,
              household_id: householdRow.id,
              service_name: x.service_name,
              plan_name: x.plan_name ?? undefined,
              category: x.category,
              billing_cycle: x.billing_cycle,
              amount_paise: Number(x.amount_paise),
              payer_id: x.payer_id ?? "",
              user_ids: x.payer_id ? [x.payer_id] : [],
              renewal_date: x.renewal_date ?? undefined,
              is_active: x.is_active,
              visibility: x.visibility,
              source: "import" as const,
              created_at: "",
              updated_at: "",
            }));
          loadedSubs = [...loadedSubs, ...others];
        }

        setAllProfiles(loadedProfiles);
        setHousehold(householdRow as Household);
        setMembers(loadedMembers);
        setSubscriptions(loadedSubs);
      } catch (error) {
        if (!isActive || revision !== loadRevision) return;
        setAccountError(
          error instanceof Error
            ? error.message
            : "Could not load your household data."
        );
        setSubscriptions([]);
      } finally {
        if (isActive && revision === loadRevision) setIsLoaded(true);
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      authEventReceived = true;
      if (session?.user) {
        void loadAccountData(session.user);
      } else {
        clearAccountData();
        setAccountError("");
        setIsLoaded(true);
      }
    });

    void supabase.auth.getUser().then(({ data, error }) => {
      if (!isActive || authEventReceived) return;
      if (error) {
        setAccountError(error.message);
        setIsLoaded(true);
      } else if (data.user) {
        void loadAccountData(data.user);
      } else {
        clearAccountData();
        setIsLoaded(true);
      }
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, [isDemoMode]);

  useEffect(() => {
    if (!isDemoMode || !isLoaded) return;
    try {
      localStorage.setItem(STORAGE_KEY_SUBS, JSON.stringify(subscriptions));
      localStorage.setItem(STORAGE_KEY_MEMBERS, JSON.stringify(members));
      localStorage.setItem(STORAGE_KEY_USER, currentProfile.id);
      localStorage.setItem(STORAGE_KEY_FAMILY_VIEW, String(isFamilyView));
    } catch {
      setAccountError("Could not save demo data to this browser.");
    }
  }, [subscriptions, members, currentProfile, isFamilyView, isLoaded, isDemoMode]);

  const switchActiveProfile = (userId: string) => {
    if (!isDemoMode) return;
    if (userId === "family") {
      setIsFamilyView(true);
      return;
    }

    const user = allProfiles.find((profile) => profile.id === userId);
    if (user) {
      setCurrentProfile(user);
      setIsFamilyView(false);
    }
  };

  const addSubscription = async (
    sub: Omit<Subscription, "id" | "created_at" | "updated_at">
  ) => {
    if (isDemoMode) {
      const newSub: Subscription = {
        ...sub,
        id: `sub-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setSubscriptions((previous) => [newSub, ...previous]);
      return newSub.id;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase || !authUser || !household.id) {
      throw new Error("Your account or household is not ready to save subscriptions.");
    }
    const { data, error } = await supabase
      .from("subscriptions")
      .insert({
        ...sub,
        household_id: household.id,
        payer_id: authUser.id,
        user_ids: [authUser.id],
      })
      .select("*")
      .single();
    if (error) {
      if (sub.import_key && (error as { code?: string }).code === "23505") {
        throw new AlreadyImportedError();
      }
      throw error;
    }
    setSubscriptions((previous) => [data as Subscription, ...previous]);
    return (data as Subscription).id;
  };

  const updateSubscription = async (
    id: string,
    updates: Partial<Subscription>
  ) => {
    if (isDemoMode) {
      setSubscriptions((previous) =>
        previous.map((sub) =>
          sub.id === id
            ? { ...sub, ...updates, updated_at: new Date().toISOString() }
            : sub
        )
      );
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase || !authUser) {
      throw new Error("Your account is not ready to update subscriptions.");
    }
    const { data, error } = await supabase
      .from("subscriptions")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("payer_id", authUser.id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Subscription not found or access was denied.");
    setSubscriptions((previous) =>
      previous.map((sub) => (sub.id === id ? (data as Subscription) : sub))
    );
  };

  const deleteSubscription = async (id: string) => {
    if (isDemoMode) {
      setSubscriptions((previous) => previous.filter((sub) => sub.id !== id));
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase || !authUser) {
      throw new Error("Your account is not ready to delete subscriptions.");
    }
    const { data, error } = await supabase
      .from("subscriptions")
      .delete()
      .eq("id", id)
      .eq("payer_id", authUser.id)
      .select("id");
    if (error) throw error;
    if (!data?.length) throw new Error("Subscription not found or access was denied.");
    setSubscriptions((previous) => previous.filter((sub) => sub.id !== id));
  };

  const inviteMember = (name: string, email: string, role: MemberRole) => {
    if (!isDemoMode) return;
    const newUserId = `user-${Date.now()}`;
    const newProfile: Profile = {
      id: newUserId,
      name,
      email,
      created_at: new Date().toISOString(),
    };
    const newMember: HouseholdMember = {
      id: `mem-${Date.now()}`,
      household_id: household.id,
      user_id: newUserId,
      role,
      name,
      email,
      status: "active",
      joined_at: new Date().toISOString(),
    };
    setAllProfiles((previous) => [...previous, newProfile]);
    setMembers((previous) => [...previous, newMember]);
  };

  const removeMember = (memberId: string) => {
    if (isDemoMode) {
      setMembers((previous) => previous.filter((member) => member.id !== memberId));
    }
  };

  const resetDemoData = () => {
    if (!isDemoMode) return;
    setSubscriptions(DEMO_SUBSCRIPTIONS);
    setMembers(DEMO_MEMBERS);
    setAllProfiles(DEMO_PROFILES);
    setCurrentProfile(DEMO_PROFILES[0]);
    setIsFamilyView(false);
    try {
      localStorage.removeItem(STORAGE_KEY_SUBS);
      localStorage.removeItem(STORAGE_KEY_MEMBERS);
      localStorage.removeItem(STORAGE_KEY_USER);
      localStorage.removeItem(STORAGE_KEY_FAMILY_VIEW);
    } catch {
      setAccountError("Could not reset demo data in this browser.");
    }
  };

  const exportDataJson = () => {
    const exportPayload = {
      app: "Family Subscription Saver",
      exported_at: new Date().toISOString(),
      viewer: isFamilyView ? "Whole family" : currentProfile.name,
      household,
      members,
      subscriptions: subscriptions
        .filter((sub) => {
          if (sub.payer_id === currentProfile.id) return true;
          if (isFamilyView) return sub.visibility === "full_details";
          return sub.visibility !== "hidden";
        })
        .map((sub) =>
          sub.payer_id !== currentProfile.id && sub.visibility === "totals_only"
            ? {
                id: sub.id,
                service_name: "Private subscription",
                category: "other",
                billing_cycle: sub.billing_cycle,
                amount_paise: sub.amount_paise,
                is_active: sub.is_active,
                visibility: sub.visibility,
              }
            : sub
        ),
    };
    return JSON.stringify(exportPayload, null, 2);
  };

  const deleteAllHouseholdData = async () => {
    if (isDemoMode) {
      setSubscriptions([]);
      setMembers((previous) =>
        previous.filter((member) => member.user_id === currentProfile.id)
      );
      try {
        localStorage.clear();
      } catch {
        setAccountError("Could not clear demo data from this browser.");
      }
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase || !authUser || !household.id) {
      throw new Error("Your account or household is not ready to delete data.");
    }
    const { error } = await supabase
      .from("subscriptions")
      .delete()
      .eq("household_id", household.id)
      .eq("payer_id", authUser.id);
    if (error) throw error;
    setSubscriptions([]);
  };

  const signOut = async () => {
    if (isDemoMode) return null;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) throw new Error("Supabase authentication is unavailable.");
    let gmailDisconnectWarning = "";
    try {
      const response = await fetch("/api/connectors/gmail/scan", {
        method: "DELETE",
      });
      if (!response.ok) {
        gmailDisconnectWarning =
          "You signed out, but Google may not have confirmed Gmail access revocation. Review connected apps in your Google Account.";
      }
    } catch {
      gmailDisconnectWarning =
        "You signed out, but Gmail could not be disconnected. Review connected apps in your Google Account.";
    }
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return gmailDisconnectWarning || null;
  };

  const summary = isFamilyView
    ? calculateHouseholdSummary(subscriptions)
    : calculateHouseholdSummary(subscriptions, currentProfile.id);

  const recommendations = isFamilyView
    ? generateSavingsRecommendations(
        subscriptions.filter((sub) => sub.visibility === "full_details")
      )
    : generateSavingsRecommendations(subscriptions, currentProfile.id);

  // The audit scores the viewer's own inventory. Rows other members share are
  // metadata-only (no channel, no renewal for totals-only) and must not lower it.
  const visibleSubs = subscriptions.filter(
    (sub) => sub.payer_id === currentProfile.id
  );
  const missingPayerCount = visibleSubs.filter((sub) => !sub.payer_id).length;
  const missingUsersCount = visibleSubs.filter(
    (sub) => !sub.user_ids || sub.user_ids.length === 0
  ).length;
  const unconfirmedCount = visibleSubs.filter(
    (sub) => !sub.renewal_date || !sub.billing_channel
  ).length;

  let score = 100;
  if (visibleSubs.length === 0) {
    score = 0;
  } else {
    const penalty =
      missingPayerCount * 20 + missingUsersCount * 10 + unconfirmedCount * 8;
    score = Math.max(25, 100 - penalty);
  }

  const auditProgress: AuditProgress = {
    score,
    label:
      score >= 85
        ? "Recorded entries look complete"
        : score >= 60
          ? "Some recorded entries are incomplete"
          : "Few or no entries recorded",
    isComplete: score >= 90 && unconfirmedCount === 0,
    missingPayerCount,
    missingUsersCount,
    unconfirmedCount,
  };

  return (
    <AppContext.Provider
      value={{
        isDemoMode,
        authUser,
        accountError,
        isFamilyView,
        currentProfile,
        allProfiles,
        household,
        members,
        subscriptions,
        summary,
        recommendations,
        auditProgress,
        switchActiveProfile,
        addSubscription,
        updateSubscription,
        deleteSubscription,
        inviteMember,
        removeMember,
        resetDemoData,
        exportDataJson,
        deleteAllHouseholdData,
        signOut,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
}
