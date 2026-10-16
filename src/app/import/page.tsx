"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useApp } from "@/context/AppContext";
import {
  BillingCycle,
  SubscriptionCategory,
  ConsolidatedSubscriptionCandidate,
} from "@/types";
import { formatINR, rupeesToPaise } from "@/lib/calculations";
import { parseBankSms } from "@/lib/connectors/sms-parser";
import { parseSubscriptionScreenshotText } from "@/lib/connectors/subscription-screenshot-parser";
import {
  FileUp,
  ShieldCheck,
  AlertTriangle,
  Check,
  ArrowRight,
  FileText,
  AlertCircle,
  Mail,
  MessageSquare,
  Sparkles,
  Inbox,
  RefreshCw,
  Plus,
  Layers,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Scan,
  X,
  Clock,
  CreditCard,
  ExternalLink,
  Info,
} from "lucide-react";

interface ExtractedItem {
  service_name: string;
  plan_name: string;
  amountRupees: string;
  billing_cycle: BillingCycle | "unknown";
  category: SubscriptionCategory;
  renewal_date: string;
  billing_channel: string;
  confidence: number;
  source_label: string;
  is_duplicate: boolean;
}

interface ScreenshotReviewItem extends ExtractedItem {
  id: string;
  selected: boolean;
}

function ImportContent() {
  const searchParams = useSearchParams();
  const { currentProfile, subscriptions, addSubscription } = useApp();

  const [hasConsented, setHasConsented] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatus, setOcrStatus] = useState("");
  const [screenshotItems, setScreenshotItems] = useState<
    ScreenshotReviewItem[]
  >([]);
  const [screenshotSavedCount, setScreenshotSavedCount] = useState(0);

  // SMS Parser state
  const [isSmsOpen, setIsSmsOpen] = useState(false);
  const [smsText, setSmsText] = useState("");
  const [smsError, setSmsError] = useState("");

  // Gmail Scanner state
  const [gmailScanning, setGmailScanning] = useState(false);
  const [gmailScanAborted, setGmailScanAborted] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailConfigured, setGmailConfigured] = useState(false);
  const [gmailStatusLoaded, setGmailStatusLoaded] = useState(false);
  const [gmailEmail, setGmailEmail] = useState<string | null>(null);
  const [isGmailModalOpen, setIsGmailModalOpen] = useState(false);
  const [modalConsent, setModalConsent] = useState(false);
  const [isConnectingDemo, setIsConnectingDemo] = useState(false);
  const [gmailMessage, setGmailMessage] = useState("");
  const [selectedHistoryRange, setSelectedHistoryRange] = useState<
    "30d" | "90d" | "180d" | "1y" | "2y" | "all"
  >("2y");
  const [gmailCandidates, setGmailCandidates] = useState<
    ConsolidatedSubscriptionCandidate[]
  >([]);
  const [expandedCandidateId, setExpandedCandidateId] = useState<string | null>(
    null
  );
  const [dismissedCandidateIds, setDismissedCandidateIds] = useState<
    Set<string>
  >(new Set());
  const gmailResultsRef = useRef<HTMLDivElement>(null);

  // Unified Review Form State
  const [extractedData, setExtractedData] = useState<ExtractedItem | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Check initial connection status
  useEffect(() => {
    let isCurrent = true;

    fetch("/api/connectors/gmail/scan")
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as {
          configured: boolean;
          connected: boolean;
          email?: string | null;
        };
      })
      .then((status) => {
        if (!isCurrent || !status) return;
        setGmailConfigured(status.configured);
        setGmailConnected(status.connected);
        setGmailStatusLoaded(true);
        if (status.email) setGmailEmail(status.email);
      })
      .catch(() => {
        // Non-blocking status check
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    const oauthError = searchParams.get("error");
    if (oauthError) setErrorMessage(oauthError);
    if (searchParams.get("status") === "connected") {
      setGmailConnected(true);
      setHasConsented(true);
      setGmailMessage(
        "Gmail successfully connected! Choose your scan timeframe below and click 'Scan Gmail Inbox'."
      );
    }
  }, [searchParams]);

  // Check for duplicate service helper
  const checkDuplicate = (serviceName: string) => {
    return subscriptions.some(
      (s) =>
        s.is_active &&
        s.service_name.toLowerCase() === serviceName.toLowerCase()
    );
  };

  // 1. OCR a subscription screenshot locally in the browser.
  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const selected = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    setErrorMessage("");
    setSavedSuccess(false);
    setScreenshotItems([]);
    setScreenshotSavedCount(0);

    if (selected) {
      if (!hasConsented) {
        setErrorMessage("Please accept the privacy consent before importing data.");
        return;
      }
      if (!selected.type.match(/image\/(jpeg|png|webp)/)) {
        setErrorMessage("Please select a PNG, JPEG, or WEBP subscription screenshot.");
        return;
      }
      if (selected.size > 10 * 1024 * 1024) {
        setErrorMessage("Image exceeds the 10MB limit. Please choose a smaller screenshot.");
        return;
      }
      await processScreenshot(selected);
    }
  };

  const processScreenshot = async (image: File) => {
    setIsProcessing(true);
    setOcrProgress(0);
    setOcrStatus("Loading on-device text recognition...");
    setErrorMessage("");
    let imageUrl: string | undefined;
    let terminateWorker: (() => Promise<unknown>) | undefined;

    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng", 1, {
        logger: (message) => {
          if (message.status === "recognizing text") {
            setOcrProgress(Math.round(message.progress * 100));
          } else if (message.status === "loading language traineddata") {
            setOcrStatus("Downloading English OCR data...");
          } else if (message.status === "initializing tesseract") {
            setOcrStatus("Starting OCR engine...");
          }
        },
      });
      terminateWorker = () => worker.terminate();
      imageUrl = URL.createObjectURL(image);
      setOcrStatus("Reading screenshot...");
      const {
        data: { text },
      } = await worker.recognize(imageUrl);
      const parsed = parseSubscriptionScreenshotText(text);

      if (parsed.length === 0) {
        setErrorMessage(
          "No subscription payments were recognized. Try a clearer screenshot showing each service name and its price or next payment."
        );
        return;
      }

      setScreenshotItems(
        parsed.map((item, index) => ({
          id: `${Date.now()}-${index}`,
          service_name: item.service_name,
          plan_name: item.plan_name,
          amountRupees: item.amount_rupees.toString(),
          billing_cycle: item.billing_cycle,
          category: item.category,
          renewal_date: item.renewal_date,
          billing_channel: "Screenshot",
          confidence: item.confidence,
          source_label: `Screenshot (${image.name})`,
          is_duplicate: checkDuplicate(item.service_name),
          selected: !checkDuplicate(item.service_name),
        }))
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? `Could not read this screenshot: ${error.message}`
          : "Could not read this screenshot. Please try another image."
      );
    } finally {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      if (terminateWorker) await terminateWorker();
      setIsProcessing(false);
      setOcrStatus("");
    }
  };

  // 2. Handle Bank / UPI SMS Parsing
  const handleParseSms = (textToParse: string) => {
    setSmsError("");
    if (!hasConsented) {
      setSmsError("Please accept the privacy consent before importing personal data.");
      return;
    }
    if (!textToParse.trim()) {
      setSmsError("Please paste an SMS message.");
      return;
    }

    const result = parseBankSms(textToParse);
    if (!result) {
      setSmsError(
        "Could not detect a debit amount or merchant name from this text. Ensure it contains an amount (e.g. Rs. 649) and service name."
      );
      return;
    }

    setExtractedData({
      service_name: result.service_name,
      plan_name: "Standard Plan",
      amountRupees: result.amount_rupees.toString(),
      billing_cycle: result.billing_cycle,
      category: result.category,
      renewal_date: "",
      billing_channel: result.billing_channel,
      confidence: result.confidence,
      source_label: result.source_bank ? `${result.source_bank} SMS` : "Bank SMS",
      is_duplicate: checkDuplicate(result.service_name),
    });
    setIsSmsOpen(false);
  };

  // 3. Connect to Gmail
  const handleOpenConnectModal = () => {
    setErrorMessage("");
    setIsGmailModalOpen(true);
  };

  const handleStartGoogleOAuth = async () => {
    if (!modalConsent) {
      setErrorMessage("Please check the consent box to proceed with Gmail connection.");
      return;
    }

    try {
      const response = await fetch("/api/connectors/gmail/auth");
      const data = (await response.json()) as {
        configured?: boolean;
        authUrl?: string | null;
        message?: string;
      };

      if (data.configured && data.authUrl) {
        setHasConsented(true);
        window.location.assign(data.authUrl);
      } else {
        setErrorMessage(
          data.message ||
            "Google OAuth is not configured on the server. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local."
        );
      }
    } catch {
      setErrorMessage("Failed to initiate Google OAuth.");
    }
  };

  const handleConnectDemoGmail = async () => {
    setIsConnectingDemo(true);
    setErrorMessage("");
    try {
      const res = await fetch("/api/connectors/gmail/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "demo_connect" }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        email?: string;
        error?: string;
      };
      if (data.success) {
        setGmailConnected(true);
        setHasConsented(true);
        setGmailEmail(data.email || "rahul.sharma@gmail.com");
        setIsGmailModalOpen(false);
        setGmailMessage(
          "Connected to demo Gmail account (rahul.sharma@gmail.com). Click 'Scan Gmail Inbox' to run multi-lane discovery."
        );
      } else {
        setErrorMessage(data.error || "Failed to connect demo Gmail.");
      }
    } catch {
      setErrorMessage("Network error connecting demo Gmail.");
    } finally {
      setIsConnectingDemo(false);
    }
  };

  // 4. Scan Gmail (Paginated Multi-lane Search)
  const handleScanGmail = async (mode: "live" | "sandbox") => {
    setGmailScanning(true);
    setGmailScanAborted(false);
    setErrorMessage("");
    setGmailMessage("");
    setGmailCandidates([]);
    setDismissedCandidateIds(new Set());

    try {
      const response = await fetch("/api/connectors/gmail/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: mode === "sandbox" ? "sandbox" : "live",
          historyRange: selectedHistoryRange,
          existingSubscriptions: subscriptions,
        }),
      });

      const data = (await response.json()) as {
        success: boolean;
        count?: number;
        candidates?: ConsolidatedSubscriptionCandidate[];
        totalMessagesScanned?: number;
        historyRange?: string;
        lanesScanned?: string[];
        error?: string;
        message?: string;
      };

      if (!response.ok || !data.success) {
        if (response.status === 401 && mode === "live") {
          setGmailConnected(false);
        }
        throw new Error(data.error || "Could not scan Gmail.");
      }

      setGmailCandidates(data.candidates ?? []);
      setGmailMessage(data.message || "Gmail scan complete.");
      requestAnimationFrame(() => {
        gmailResultsRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Network error scanning Gmail."
      );
    } finally {
      setGmailScanning(false);
    }
  };

  const handleDisconnectGmail = async () => {
    setErrorMessage("");
    try {
      const response = await fetch("/api/connectors/gmail/scan", {
        method: "DELETE",
      });
      const data = (await response.json()) as {
        connected: boolean;
        error?: string;
      };
      setGmailConnected(false);
      setGmailEmail(null);
      setGmailCandidates([]);
      setGmailMessage("Gmail disconnected and stored server session deleted.");
    } catch (error) {
      setErrorMessage("Could not disconnect Gmail.");
    }
  };

  // Select Candidate for Review-Before-Save
  const handleReviewCandidate = (cand: ConsolidatedSubscriptionCandidate) => {
    setExtractedData({
      service_name: cand.service_name,
      plan_name: cand.plan_name || "Standard Plan",
      amountRupees: cand.amount_rupees.toString(),
      billing_cycle: cand.billing_cycle,
      category: cand.category,
      renewal_date: cand.renewal_date || "",
      billing_channel: cand.billing_channel,
      confidence: cand.confidence,
      source_label: cand.billing_channel,
      is_duplicate: Boolean(cand.is_possible_duplicate),
    });
  };

  const handleDismissCandidate = (id: string) => {
    setDismissedCandidateIds((prev) => new Set([...prev, id]));
  };

  // 5. Confirm and save the selected screenshot entries.
  const handleSaveScreenshotItems = () => {
    if (!hasConsented) {
      setErrorMessage("Please accept the privacy consent before saving imported data.");
      return;
    }

    const selectedItems = screenshotItems.filter((item) => item.selected);
    if (selectedItems.length === 0) {
      setErrorMessage("Select at least one recognized subscription to save.");
      return;
    }

    for (const item of selectedItems) {
      addSubscription({
        household_id: "hh-demo-sharma",
        service_name: item.service_name.trim(),
        plan_name: item.plan_name.trim() || undefined,
        amount_paise: rupeesToPaise(item.amountRupees),
        billing_cycle: item.billing_cycle === "unknown" ? "monthly" : item.billing_cycle,
        category: item.category,
        payer_id: currentProfile.id,
        user_ids: [currentProfile.id],
        billing_channel: item.billing_channel,
        renewal_date: item.renewal_date || undefined,
        visibility: "full_details",
        source: "import",
        is_active: true,
        notes: `Imported via ${item.source_label}. Verified by ${currentProfile.name}.`,
      });
    }

    setScreenshotSavedCount(selectedItems.length);
    setScreenshotItems([]);
    setErrorMessage("");
    setSavedSuccess(true);
  };

  // 6. Confirm & Save Subscription from Unified Review Form
  const handleConfirmSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!extractedData) return;
    if (!hasConsented) {
      setErrorMessage("Please accept the privacy consent before saving imported data.");
      return;
    }

    const amountNum = parseFloat(extractedData.amountRupees);
    if (isNaN(amountNum) || amountNum <= 0) {
      setErrorMessage("Please enter a valid positive amount.");
      return;
    }

    if (extractedData.billing_cycle === "unknown") {
      setErrorMessage("Please select a valid billing cycle before saving.");
      return;
    }

    addSubscription({
      household_id: "hh-demo-sharma",
      service_name: extractedData.service_name,
      plan_name: extractedData.plan_name,
      amount_paise: rupeesToPaise(amountNum),
      billing_cycle: extractedData.billing_cycle,
      category: extractedData.category,
      payer_id: currentProfile.id,
      user_ids: [currentProfile.id],
      billing_channel: extractedData.billing_channel,
      renewal_date: extractedData.renewal_date || undefined,
      visibility: "full_details",
      source: "import",
      is_active: true,
      notes: `Imported via ${extractedData.source_label}. Verified by ${currentProfile.name}.`,
    });

    setSavedSuccess(true);
    setExtractedData(null);
    setScreenshotSavedCount(1);
  };

  const activeCandidates = gmailCandidates.filter(
    (c) => !dismissedCandidateIds.has(c.id)
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Import Subscriptions
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Discover subscriptions across Google Play, Apple receipts, merchant invoices, and bank e-mandates.
          </p>
        </div>
        <Link
          href="/subscriptions?action=add"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 text-xs font-semibold shadow-sm transition self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          Manual Entry
        </Link>
      </div>

      {/* Privacy Guarantee Banner */}
      <div className="p-3.5 rounded-2xl bg-slate-100/90 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-300">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>
            <strong>Read-only discovery with human verification:</strong> Message bodies are parsed in memory and immediately discarded. Nothing is saved until you review and confirm it.
          </span>
        </div>
        <label className="flex items-center gap-1.5 font-medium cursor-pointer shrink-0 text-slate-800 dark:text-slate-200">
          <input
            type="checkbox"
            checked={hasConsented}
            onChange={(e) => setHasConsented(e.target.checked)}
            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
          />
          <span>I consent</span>
        </label>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Connectors Hub */}
      {!extractedData && !savedSuccess && screenshotItems.length === 0 && (
        <div className="space-y-5">
          {/* Main Visual Dropzone (Screenshot OCR) */}
          <div className="bg-white dark:bg-slate-900 border-2 border-dashed border-slate-300 dark:border-slate-800 rounded-3xl p-8 text-center transition hover:border-indigo-400 dark:hover:border-indigo-600 shadow-sm relative overflow-hidden group">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto shadow-sm group-hover:scale-105 transition-transform duration-200">
              <FileUp className="w-7 h-7" />
            </div>

            <h2 className="font-bold text-base text-slate-900 dark:text-white mt-3">
              Upload a Subscription Screenshot
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
              Select a screenshot of your active subscriptions. On-device OCR reads visible service names, plans, prices, and payment dates in this browser.
            </p>

            <div className="mt-5 flex justify-center">
              <label className="cursor-pointer px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-sm transition inline-flex items-center gap-2">
                <span>Select Screenshot</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>

            {isProcessing && (
              <div className="mt-4 flex items-center justify-center gap-2 text-xs font-semibold text-indigo-600">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>
                  {ocrProgress > 0
                    ? `${ocrStatus} ${ocrProgress}%`
                    : ocrStatus}
                </span>
              </div>
            )}
            <p className="mt-3 text-[11px] text-slate-400">
              Your screenshot is processed locally in this browser and never uploaded. Always verify results before saving.
            </p>
          </div>

          {/* Quick Connectors Deck */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 1. Gmail Subscription Discovery Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between space-y-4 hover:border-slate-300 dark:hover:border-slate-700 transition">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                    <Mail className="w-5 h-5" />
                  </div>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      gmailConnected
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                        : "bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300"
                    }`}
                  >
                    {gmailConnected
                      ? gmailEmail
                        ? `Connected (${gmailEmail})`
                        : "Connected"
                      : gmailStatusLoaded
                        ? gmailConfigured
                          ? "Not connected"
                          : "Setup required"
                        : "Checking setup"}
                  </span>
                </div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Gmail Discovery
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Scans Google Play, Apple receipts, merchant invoices, and bank e-mandates.
                </p>
              </div>

              <div className="space-y-2">
                {!gmailConnected && gmailStatusLoaded && !gmailConfigured && (
                  <p
                    role="status"
                    className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-2.5 py-2 text-[10px] leading-relaxed text-amber-800 dark:text-amber-200"
                  >
                    Live Gmail linking needs server OAuth settings. The sample scan works now; choose Connect Gmail to see the setup details.
                  </p>
                )}
                {gmailConnected && (
                  <div className="space-y-1.5 pb-1">
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      Search timeframe:
                    </label>
                    <select
                      value={selectedHistoryRange}
                      onChange={(e) =>
                        setSelectedHistoryRange(
                          e.target.value as "30d" | "90d" | "180d" | "1y" | "2y" | "all"
                        )
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200"
                    >
                      <option value="30d">Past 30 days</option>
                      <option value="90d">Past 90 days</option>
                      <option value="180d">Past 6 months</option>
                      <option value="1y">Past 1 year</option>
                      <option value="2y">Past 2 years (Recommended)</option>
                      <option value="all">All mailbox history</option>
                    </select>
                  </div>
                )}

                <button
                  type="button"
                  onClick={
                    gmailConnected
                      ? () => handleScanGmail("live")
                      : handleOpenConnectModal
                  }
                  disabled={gmailScanning}
                  className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-semibold transition flex items-center justify-center gap-1.5"
                >
                  {gmailScanning ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 text-white" />
                  )}
                  {gmailScanning
                    ? "Searching evidence lanes..."
                    : gmailConnected
                      ? "Scan Gmail Inbox"
                      : "Connect Gmail"}
                </button>

                {!gmailConnected && (
                  <button
                    type="button"
                    onClick={handleConnectDemoGmail}
                    disabled={isConnectingDemo}
                    className="w-full py-1.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-[11px] font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 transition"
                  >
                    {isConnectingDemo ? "Connecting..." : "Connect Demo Account (Instant)"}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleScanGmail("sandbox")}
                  disabled={gmailScanning}
                  className="w-full py-1.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-[11px] font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 transition"
                >
                  Preview with sample evidence
                </button>

                {gmailConnected && (
                  <button
                    type="button"
                    onClick={handleDisconnectGmail}
                    className="w-full py-1 text-[11px] text-slate-500 hover:text-rose-600 transition"
                  >
                    Disconnect & Revoke
                  </button>
                )}
              </div>
            </div>

            {/* 2. Bank SMS Parser Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between space-y-4 hover:border-slate-300 dark:hover:border-slate-700 transition">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full">
                    UPI AutoPay
                  </span>
                </div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Bank SMS / UPI Parser
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Paste bank debit or AutoPay mandate texts from HDFC, ICICI, SBI, Axis.
                </p>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setIsSmsOpen(!isSmsOpen)}
                  className="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-800 dark:text-slate-200 text-xs font-semibold transition flex items-center justify-center gap-1.5"
                >
                  <Scan className="w-3.5 h-3.5 text-indigo-500" />
                  {isSmsOpen ? "Close SMS Drawer" : "Paste SMS Notification"}
                </button>
              </div>
            </div>

            {/* 3. Inbound Forwarding Webhook Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between space-y-4 hover:border-slate-300 dark:hover:border-slate-700 transition">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                    <Inbox className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                    Demo only
                  </span>
                </div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Email Forwarding
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Forward receipts to a dedicated inbound address (demo configuration).
                </p>
              </div>

              <div>
                <button
                  type="button"
                  disabled
                  className="w-full py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-not-allowed"
                >
                  <Inbox className="w-3.5 h-3.5" />
                  Not configured in demo
                </button>
              </div>
            </div>
          </div>

          {/* Expandable Bank SMS Parser Drawer */}
          {isSmsOpen && (
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900/60 shadow-md space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  Paste Transactional Bank SMS:
                </span>
                <span className="text-[11px] text-slate-400">
                  Quick test templates:
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    handleParseSms(
                      "Dear Customer, Rs. 649.00 has been debited from account **1234 towards NETFLIX on 15-OCT-26 via UPI Ref 4293847291 - HDFC Bank"
                    )
                  }
                  className="px-2.5 py-1 text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 rounded-lg border border-slate-200 dark:border-slate-700 transition"
                >
                  HDFC (Netflix ₹649)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleParseSms(
                      "ICICI Bank Acct XX567 debited for Rs 119.00 on 10-Oct-26. Info: BIL*SPOTIFY INDIA*AUTOPAY."
                    )
                  }
                  className="px-2.5 py-1 text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 rounded-lg border border-slate-200 dark:border-slate-700 transition"
                >
                  ICICI (Spotify ₹119)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleParseSms(
                      "Your a/c no. XXXXXXXX1234 is debited by Rs.899.00 on 05/10/26 by transfer to Disney Star Hotstar UPI Ref no 428192849 - State Bank of India (SBI)"
                    )
                  }
                  className="px-2.5 py-1 text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 rounded-lg border border-slate-200 dark:border-slate-700 transition"
                >
                  SBI (Hotstar ₹899)
                </button>
              </div>

              <textarea
                rows={2}
                placeholder="Or paste your own SMS debit message..."
                value={smsText}
                onChange={(e) => setSmsText(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />

              {smsError && (
                <div className="p-2 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{smsError}</span>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsSmsOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleParseSms(smsText)}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition"
                >
                  Parse SMS
                </button>
              </div>
            </div>
          )}

          {gmailMessage && (
            <div
              ref={gmailResultsRef}
              role="status"
              aria-live="polite"
              className="p-3.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900 text-xs text-indigo-800 dark:text-indigo-200 flex items-start gap-2"
            >
              <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <span>{gmailMessage}</span>
            </div>
          )}

          {/* Multi-Lane Discovery Candidates Deck */}
          {activeCandidates.length > 0 && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-1">
                <div>
                  <h3 className="font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    Subscription Candidates ({activeCandidates.length})
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Consolidated across Google Play, Apple, merchant invoices, and bank e-mandates. Review and confirm before adding.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400">
                    Source evidence attached to each candidate
                  </span>
                </div>
              </div>

              {/* Discovery Limitations Notice */}
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300 flex items-start gap-2">
                <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                <span>
                  <strong>Discovery limitations:</strong> Mailbox scans find likely subscriptions from receipts and bank alerts in this account. Some emails may be missing, use unfamiliar merchant names, or reside in another family member&apos;s account.
                </span>
              </div>

              <div className="space-y-3">
                {activeCandidates.map((cand) => {
                  const isExpanded = expandedCandidateId === cand.id;
                  const hasUnknownCycle = cand.billing_cycle === "unknown";

                  return (
                    <article
                      key={cand.id}
                      className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-3 hover:border-slate-300 dark:hover:border-slate-700 transition"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 mb-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-md">
                              {cand.category}
                            </span>

                            {/* Status Badge */}
                            {cand.status === "likely_active" && (
                              <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded-md">
                                Likely Active
                              </span>
                            )}
                            {cand.status === "needs_confirmation" && (
                              <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-md">
                                Needs Confirmation
                              </span>
                            )}
                            {cand.status === "cancelled_or_expired" && (
                              <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-md">
                                Cancelled / Expired
                              </span>
                            )}
                            {cand.status === "payment_failed" && (
                              <span className="text-[10px] font-bold uppercase tracking-wider bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 px-2 py-0.5 rounded-md">
                                Payment Failed
                              </span>
                            )}

                            {/* Duplicate Warning */}
                            {cand.is_possible_duplicate && (
                              <span className="text-[10px] font-bold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-md">
                                Possible Duplicate in Household
                              </span>
                            )}
                          </div>

                          <h4 className="font-bold text-base text-slate-900 dark:text-white">
                            {cand.service_name}
                            {cand.plan_name && (
                              <span className="text-sm font-normal text-slate-500 dark:text-slate-400 ml-2">
                                ({cand.plan_name})
                              </span>
                            )}
                          </h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Billing channel: <strong>{cand.billing_channel}</strong>
                          </p>
                        </div>

                        <div className="text-left sm:text-right">
                          <div className="text-lg font-black text-slate-900 dark:text-white">
                            {cand.amount_rupees > 0 ? (
                              <>
                                ₹{cand.amount_rupees}
                                <span className="text-xs font-medium text-slate-500 ml-1">
                                  /{cand.billing_cycle}
                                </span>
                              </>
                            ) : (
                              <span className="text-sm text-slate-500">
                                Variable / Cap only
                              </span>
                            )}
                          </div>
                          {hasUnknownCycle && (
                            <span className="text-[11px] font-semibold text-amber-600 flex items-center sm:justify-end gap-1">
                              <AlertCircle className="w-3 h-3" /> Interval unconfirmed
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Mandate & Date Details */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                        {cand.renewal_date && (
                          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                            <Clock className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                            <span>
                              Renewal: <strong>{cand.renewal_date}</strong>
                              {cand.renewal_date_inferred && (
                                <span className="text-[10px] text-slate-400 ml-1">
                                  (Inferred)
                                </span>
                              )}
                            </span>
                          </div>
                        )}
                        {cand.charge_date && (
                          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                            <CreditCard className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            <span>
                              Charge date: <strong>{cand.charge_date}</strong>
                            </span>
                          </div>
                        )}
                        {cand.mandate_details?.max_amount_rupees && (
                          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                            <ShieldCheck className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                            <span>
                              Mandate Cap: <strong>₹{cand.mandate_details.max_amount_rupees}</strong>
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Review alerts / reasons */}
                      {cand.needs_review_reasons.length > 0 && (
                        <div className="p-2.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/40 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                          {cand.needs_review_reasons.map((reason, idx) => (
                            <div key={idx} className="flex items-center gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              <span>{reason}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Supporting Evidence Toggle */}
                      <div>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedCandidateId(isExpanded ? null : cand.id)
                          }
                          className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 flex items-center gap-1"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="w-3.5 h-3.5" />
                              Hide source evidence ({cand.evidence.length} message{cand.evidence.length === 1 ? "" : "s"})
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-3.5 h-3.5" />
                              View source evidence ({cand.evidence.length} message{cand.evidence.length === 1 ? "" : "s"})
                            </>
                          )}
                        </button>

                        {/* Evidence Drawer */}
                        {isExpanded && (
                          <div className="mt-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5 animate-in fade-in duration-150">
                            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                              Attached Supporting Messages:
                            </div>
                            {cand.evidence.map((ev, evIdx) => (
                              <div
                                key={ev.id || evIdx}
                                className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs space-y-1"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                                    {ev.subject || "Email notice"}
                                  </span>
                                  <span className="text-[10px] font-mono text-slate-400">
                                    {ev.date || "Date unknown"}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
                                  <span>From: {ev.sender || "Unknown sender"}</span>
                                  {ev.amount_rupees && (
                                    <span>Amount: ₹{ev.amount_rupees}</span>
                                  )}
                                  {ev.order_id && <span>Order: {ev.order_id}</span>}
                                  {ev.mandate_id && (
                                    <span>Mandate ID: {ev.mandate_id}</span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-600 dark:text-slate-300 pt-0.5">
                                  {ev.summary}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Card Action Buttons */}
                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => handleDismissCandidate(cand.id)}
                          className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
                        >
                          Dismiss
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReviewCandidate(cand)}
                          className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition flex items-center gap-1.5"
                        >
                          <span>Review & Add</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Screenshot Batch Review Deck */}
      {screenshotItems.length > 0 && !savedSuccess && (
        <section className="space-y-4" aria-label="Review screenshot subscriptions">
          <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Review {screenshotItems.length} detected subscription
                  {screenshotItems.length === 1 ? "" : "s"}
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Check every field. Uncheck entries you don’t want to add.
                </p>
              </div>
              <span className="self-start sm:self-auto text-[10px] font-bold uppercase tracking-wider bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 px-2.5 py-1 rounded-full">
                OCR review
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {screenshotItems.map((item) => (
              <article
                key={item.id}
                className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-md">
                        {item.category}
                      </span>
                    </div>
                    {item.is_duplicate && (
                      <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
                        Possible duplicate already in your subscriptions.
                      </p>
                    )}
                  </div>
                  <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={(event) =>
                        setScreenshotItems((current) =>
                          current.map((candidate) =>
                            candidate.id === item.id
                              ? { ...candidate, selected: event.target.checked }
                              : candidate
                          )
                        )
                      }
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    Import
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    Service name
                    <input
                      value={item.service_name}
                      onChange={(event) =>
                        setScreenshotItems((current) =>
                          current.map((candidate) =>
                            candidate.id === item.id
                              ? { ...candidate, service_name: event.target.value }
                              : candidate
                          )
                        )
                      }
                      className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                    />
                  </label>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    Plan
                    <input
                      value={item.plan_name}
                      onChange={(event) =>
                        setScreenshotItems((current) =>
                          current.map((candidate) =>
                            candidate.id === item.id
                              ? { ...candidate, plan_name: event.target.value }
                              : candidate
                          )
                        )
                      }
                      className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                    />
                  </label>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    Amount (₹)
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={item.amountRupees}
                      onChange={(event) =>
                        setScreenshotItems((current) =>
                          current.map((candidate) =>
                            candidate.id === item.id
                              ? { ...candidate, amountRupees: event.target.value }
                              : candidate
                          )
                        )
                      }
                      className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                    />
                  </label>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    Billing cycle
                    <select
                      value={item.billing_cycle}
                      onChange={(event) =>
                        setScreenshotItems((current) =>
                          current.map((candidate) =>
                            candidate.id === item.id
                              ? {
                                  ...candidate,
                                  billing_cycle: event.target.value as BillingCycle,
                                }
                              : candidate
                          )
                        )
                      }
                      className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                    >
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="half_yearly">Half-Yearly</option>
                      <option value="annual">Annual</option>
                      <option value="prepaid">Prepaid</option>
                      <option value="one_time">One-Time</option>
                    </select>
                  </label>
                </div>
              </article>
            ))}
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setScreenshotItems([]);
                setErrorMessage("");
              }}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              Discard screenshot
            </button>
            <button
              type="button"
              onClick={handleSaveScreenshotItems}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition"
            >
              Add {screenshotItems.filter((item) => item.selected).length} selected subscription
              {screenshotItems.filter((item) => item.selected).length === 1
                ? ""
                : "s"}
            </button>
          </div>
        </section>
      )}

      {/* UNIFIED REVIEW-BEFORE-SAVE FORM */}
      {extractedData && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl p-6 sm:p-7 shadow-md space-y-5 animate-in fade-in duration-200">
          <div className="flex items-start justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full">
                  {extractedData.source_label}
                </span>
                <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded-full">
                  {(extractedData.confidence * 100).toFixed(0)}% AI Confidence
                </span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Review & Confirm Subscription
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Inspect and edit fields before committing to your household.
              </p>
            </div>
            <button
              onClick={() => setExtractedData(null)}
              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-medium px-2 py-1"
            >
              Discard
            </button>
          </div>

          {/* Duplicate warning if service exists */}
          {extractedData.is_duplicate && (
            <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-semibold">Possible Duplicate Service Alert</strong>
                <span>
                  The household already has an active subscription for &ldquo;{extractedData.service_name}&rdquo;.
                  Check whether this is an extra plan or a duplicate record.
                </span>
              </div>
            </div>
          )}

          <form onSubmit={handleConfirmSave} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Service Name *
                </label>
                <input
                  type="text"
                  required
                  value={extractedData.service_name}
                  onChange={(e) =>
                    setExtractedData({
                      ...extractedData,
                      service_name: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Plan / Tier
                </label>
                <input
                  type="text"
                  value={extractedData.plan_name}
                  onChange={(e) =>
                    setExtractedData({
                      ...extractedData,
                      plan_name: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Amount in INR (₹) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                    ₹
                  </span>
                  <input
                    type="number"
                    step="any"
                    required
                    value={extractedData.amountRupees}
                    onChange={(e) =>
                      setExtractedData({
                        ...extractedData,
                        amountRupees: e.target.value,
                      })
                    }
                    className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Billing Cycle *
                </label>
                <select
                  value={extractedData.billing_cycle}
                  onChange={(e) =>
                    setExtractedData({
                      ...extractedData,
                      billing_cycle: e.target.value as BillingCycle | "unknown",
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="unknown">Select Billing Cycle (Unconfirmed)</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="half_yearly">Half-Yearly</option>
                  <option value="annual">Annual</option>
                  <option value="prepaid">Prepaid</option>
                  <option value="one_time">One-Time</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Next Renewal Date
                </label>
                <input
                  type="date"
                  value={extractedData.renewal_date}
                  onChange={(e) =>
                    setExtractedData({
                      ...extractedData,
                      renewal_date: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3">
              <button
                type="button"
                onClick={() => setExtractedData(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition"
              >
                Confirm & Add to Household
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Success Notification */}
      {savedSuccess && (
        <div className="p-6 rounded-3xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-center space-y-3 shadow-sm animate-in fade-in duration-200">
          <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center font-bold">
            <Check className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-base text-emerald-900 dark:text-emerald-200">
              {screenshotSavedCount > 1
                ? `${screenshotSavedCount} Subscriptions Added to Household`
                : "Subscription Successfully Added to Household"}
            </h3>
            <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">
              Your dashboard, monthly totals, and renewal alerts have been updated.
            </p>
          </div>
          <div className="pt-2 flex justify-center gap-3">
            <button
              onClick={() => {
                setSavedSuccess(false);
                setScreenshotSavedCount(0);
                setErrorMessage("");
              }}
              className="px-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 text-xs font-semibold text-emerald-800 dark:text-emerald-200 hover:bg-emerald-50"
            >
              Import Another
            </button>
            <Link
              href="/subscriptions"
              className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 shadow-sm"
            >
              View Subscriptions
            </Link>
          </div>
        </div>
      )}

      {/* Connect Gmail & Consent Modal */}
      {isGmailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl relative space-y-5">
            <button
              onClick={() => setIsGmailModalOpen(false)}
              className="absolute right-4 top-4 p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <Mail className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                  Connect Gmail for Subscription Discovery
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Read-only search across store receipts, invoices, and bank e-mandates
                </p>
              </div>
            </div>

            {/* Privacy & Scope Disclosure */}
            <div className="space-y-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs">
              <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>What Gmail data is accessed and how it is protected:</span>
              </div>
              <ul className="space-y-2 text-slate-600 dark:text-slate-300 leading-relaxed list-disc pl-4 text-[11px]">
                <li>
                  <strong>Read-only scope:</strong> The app only requests <code className="text-indigo-600">gmail.readonly</code> to search for invoices, receipts, and recurring e-mandates.
                </li>
                <li>
                  <strong>Zero email body retention:</strong> Message bodies are parsed in memory on the server and immediately discarded. No full emails or personal messages are ever stored or logged.
                </li>
                <li>
                  <strong>No passwords or banking credentials:</strong> Card CVVs, banking passwords, and OTPs are never accessed or stored.
                </li>
                <li>
                  <strong>Human confirmation required:</strong> Discovery findings appear in a review queue. Nothing is added to your household without your explicit confirmation.
                </li>
              </ul>
            </div>

            {/* Explicit Consent Checkbox */}
            <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={modalConsent}
                onChange={(e) => setModalConsent(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
              />
              <span>
                I understand and consent to a read-only search of my Gmail receipts and recurring invoice notices.
              </span>
            </label>

            {/* Connection Options */}
            <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              {gmailConfigured ? (
                <button
                  type="button"
                  onClick={handleStartGoogleOAuth}
                  disabled={!modalConsent}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-black dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold text-xs shadow-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Mail className="w-4 h-4" />
                  <span>Authorize with Google Account</span>
                </button>
              ) : (
                <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-200 space-y-1.5">
                  <div className="font-semibold flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-amber-600" />
                    <span>Live Google OAuth Credentials Not Configured</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
                    To connect a live Google account, configure <code className="bg-amber-100 dark:bg-amber-900 px-1 py-0.5 rounded">GOOGLE_CLIENT_ID</code> and <code className="bg-amber-100 dark:bg-amber-900 px-1 py-0.5 rounded">GOOGLE_CLIENT_SECRET</code> on the server. Production also needs <code className="bg-amber-100 dark:bg-amber-900 px-1 py-0.5 rounded">FSS_GMAIL_SESSION_SECRET</code> so Gmail linking survives serverless requests.
                  </p>
                </div>
              )}

              {/* Instant Demo Option */}
              <button
                type="button"
                onClick={handleConnectDemoGmail}
                disabled={isConnectingDemo}
                className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-sm transition disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>
                  {isConnectingDemo
                    ? "Connecting Demo Mailbox..."
                    : "Connect Demo Mailbox (Instant — Zero Setup)"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ImportPage() {
  return (
    <Suspense
      fallback={
        <div className="py-12 text-center text-sm text-slate-500">
          Loading import connectors...
        </div>
      }
    >
      <ImportContent />
    </Suspense>
  );
}
