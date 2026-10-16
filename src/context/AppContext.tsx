"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
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

interface AuditProgress {
  score: number; // 0 to 100
  label: string;
  isComplete: boolean;
  missingPayerCount: number;
  missingUsersCount: number;
  unconfirmedCount: number;
}

interface AppContextType {
  isDemoMode: boolean;
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
  ) => void;
  updateSubscription: (id: string, updates: Partial<Subscription>) => void;
  deleteSubscription: (id: string) => void;
  inviteMember: (name: string, email: string, role: MemberRole) => void;
  removeMember: (memberId: string) => void;
  resetDemoData: () => void;
  exportDataJson: () => string;
  deleteAllHouseholdData: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEY_SUBS = "fss_subscriptions_v1";
const STORAGE_KEY_MEMBERS = "fss_members_v1";
const STORAGE_KEY_USER = "fss_active_user_v1";
const STORAGE_KEY_FAMILY_VIEW = "fss_family_view_v1";

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [isDemoMode] = useState(true);
  const [allProfiles, setAllProfiles] = useState<Profile[]>(DEMO_PROFILES);
  const [household, setHousehold] = useState<Household>(DEMO_HOUSEHOLD);
  const [members, setMembers] = useState<HouseholdMember[]>(DEMO_MEMBERS);
  const [subscriptions, setSubscriptions] =
    useState<Subscription[]>(DEMO_SUBSCRIPTIONS);
  const [currentProfile, setCurrentProfile] = useState<Profile>(
    DEMO_PROFILES[0]
  );
  const [isFamilyView, setIsFamilyView] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from local storage on initial mount if available
  useEffect(() => {
    try {
      const savedSubs = localStorage.getItem(STORAGE_KEY_SUBS);
      const savedMembers = localStorage.getItem(STORAGE_KEY_MEMBERS);
      const savedUserId = localStorage.getItem(STORAGE_KEY_USER);
      const savedFamilyView = localStorage.getItem(STORAGE_KEY_FAMILY_VIEW);

      if (savedSubs) {
        setSubscriptions(JSON.parse(savedSubs));
      }
      if (savedMembers) {
        setMembers(JSON.parse(savedMembers));
      }
      if (savedUserId) {
        const found = DEMO_PROFILES.find((p) => p.id === savedUserId);
        if (found) setCurrentProfile(found);
      }
      setIsFamilyView(savedFamilyView === "true");
    } catch {
      // Local storage fallback
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Sync to local storage
  useEffect(() => {
    if (!isLoaded) return;
    try {
      localStorage.setItem(STORAGE_KEY_SUBS, JSON.stringify(subscriptions));
      localStorage.setItem(STORAGE_KEY_MEMBERS, JSON.stringify(members));
      localStorage.setItem(STORAGE_KEY_USER, currentProfile.id);
      localStorage.setItem(STORAGE_KEY_FAMILY_VIEW, String(isFamilyView));
    } catch {
      // Ignore write errors
    }
  }, [subscriptions, members, currentProfile, isFamilyView, isLoaded]);

  const switchActiveProfile = (userId: string) => {
    if (userId === "family") {
      setIsFamilyView(true);
      return;
    }

    const user = allProfiles.find((p) => p.id === userId);
    if (user) {
      setCurrentProfile(user);
      setIsFamilyView(false);
    }
  };

  const addSubscription = (
    sub: Omit<Subscription, "id" | "created_at" | "updated_at">
  ) => {
    const newSub: Subscription = {
      ...sub,
      id: `sub-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setSubscriptions((prev) => [newSub, ...prev]);
  };

  const updateSubscription = (id: string, updates: Partial<Subscription>) => {
    setSubscriptions((prev) =>
      prev.map((sub) =>
        sub.id === id
          ? { ...sub, ...updates, updated_at: new Date().toISOString() }
          : sub
      )
    );
  };

  const deleteSubscription = (id: string) => {
    setSubscriptions((prev) => prev.filter((sub) => sub.id !== id));
  };

  const inviteMember = (name: string, email: string, role: MemberRole) => {
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
    setAllProfiles((prev) => [...prev, newProfile]);
    setMembers((prev) => [...prev, newMember]);
  };

  const removeMember = (memberId: string) => {
    setMembers((prev) => prev.filter((m) => m.id !== memberId));
  };

  const resetDemoData = () => {
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
      // Ignore
    }
  };

  const exportDataJson = () => {
    const exportPayload = {
      app: "Family Subscription Saver",
      exported_at: new Date().toISOString(),
      viewer: isFamilyView ? "Whole family" : currentProfile.name,
      household,
      members,
      subscriptions: subscriptions.filter((s) => {
        if (isFamilyView) return s.visibility === "full_details";
        // Enforce privacy during export: hidden subs of others are never exported!
        if (s.payer_id !== currentProfile.id && s.visibility === "hidden") {
          return false;
        }
        return true;
      }),
    };
    return JSON.stringify(exportPayload, null, 2);
  };

  const deleteAllHouseholdData = () => {
    setSubscriptions([]);
    setMembers((prev) => prev.filter((m) => m.user_id === currentProfile.id));
    try {
      localStorage.clear();
    } catch {
      // Ignore
    }
  };

  // Dynamically compute summary according to current viewer's visibility permissions
  const summary = isFamilyView
    ? calculateHouseholdSummary(subscriptions)
    : calculateHouseholdSummary(subscriptions, currentProfile.id);

  // Hidden records remain excluded from household-wide recommendations.
  const recommendations = isFamilyView
    ? generateSavingsRecommendations(
        subscriptions.filter((sub) => sub.visibility === "full_details")
      )
    : generateSavingsRecommendations(subscriptions, currentProfile.id);

  // Compute honest audit progress: how thoroughly configured is this household?
  const visibleSubs = subscriptions.filter((s) => {
    if (isFamilyView) return s.visibility !== "hidden";
    if (s.payer_id !== currentProfile.id && s.visibility === "hidden") {
      return false;
    }
    return true;
  });

  const missingPayerCount = visibleSubs.filter((s) => !s.payer_id).length;
  const missingUsersCount = visibleSubs.filter(
    (s) => !s.user_ids || s.user_ids.length === 0
  ).length;
  const unconfirmedCount = visibleSubs.filter(
    (s) => !s.renewal_date || !s.billing_channel
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
        ? "Comprehensive Inventory"
        : score >= 60
        ? "Partial Audit in Progress"
        : "Initial Setup",
    isComplete: score >= 90 && unconfirmedCount === 0,
    missingPayerCount,
    missingUsersCount,
    unconfirmedCount,
  };

  return (
    <AppContext.Provider
      value={{
        isDemoMode,
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
