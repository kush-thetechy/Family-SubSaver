"use client";

import { recordUsageMilestone } from "@/lib/usage-milestone";
import { planBulkUndo } from "@/lib/bulk-undo";
import { AlreadyImportedError } from "@/lib/already-imported";
import { consolidateEvidenceToCandidates } from "@/lib/connectors/gmail-service";
import { sha256Hex } from "@/lib/family-link";
import React, { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useApp } from "@/context/AppContext";
import {
  BillingCycle,
  SubscriptionCategory,
  ConsolidatedSubscriptionCandidate,
  DiscoveryEvidence,
  GmailHistoryRange,
  GmailScanCoverage,
} from "@/types";
import { formatINR, rupeesToPaise } from "@/lib/calculations";
import { parseSubscriptionScreenshotText } from "@/lib/connectors/subscription-screenshot-parser";
import {
  FileUp,
  ShieldCheck,
  AlertTriangle,
  Check,
  ArrowRight,
  AlertCircle,
  Mail,
  Sparkles,
  RefreshCw,
  Plus,
  ChevronDown,
  ChevronUp,
  X,
  Clock,
  CreditCard,
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

const MAX_SCREENSHOTS_PER_IMPORT = 5;
const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;

function canBulkAddGmailCandidate(
  candidate: ConsolidatedSubscriptionCandidate
): candidate is ConsolidatedSubscriptionCandidate & {
  status: "likely_active" | "needs_confirmation";
  amount_rupees: number;
  billing_cycle: BillingCycle;
} {
  return (
    (candidate.status === "likely_active" ||
      candidate.status === "needs_confirmation") &&
    !candidate.is_possible_duplicate &&
    typeof candidate.amount_rupees === "number" &&
    candidate.amount_rupees > 0 &&
    candidate.billing_cycle !== "unknown"
  );
}

function ImportContent() {
  const searchParams = useSearchParams();
  const { currentProfile, household, subscriptions, addSubscription, deleteSubscription } = useApp();

  const [hasConsented, setHasConsented] = useState(false);
  // Soft trial gate (server-flagged): when set, NEW scans/imports are blocked with this
  // message. Existing data, export and deletion stay available. Empty while gate is off.
  const [captureBlock, setCaptureBlock] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/billing/entitlement", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!cancelled && body?.newCaptureBlocked && typeof body.message === "string") {
          setCaptureBlock(body.message);
        }
      })
      .catch(() => {
        // Gate status is best-effort; a fetch failure must never block an import.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatus, setOcrStatus] = useState("");
  const [screenshotItems, setScreenshotItems] = useState<
    ScreenshotReviewItem[]
  >([]);
  const [screenshotSavedCount, setScreenshotSavedCount] = useState(0);

  // Gmail Scanner state
  const [gmailScanning, setGmailScanning] = useState(false);
  const [gmailProgress, setGmailProgress] = useState<{ checked: number; found: number; lane: string } | null>(null);
  const [gmailResumeCursor, setGmailResumeCursor] = useState<string | null>(null);
  const scanAbortRef = useRef<AbortController | null>(null);
  const scanEvidenceRef = useRef<Map<string, DiscoveryEvidence>>(new Map());
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailConfigured, setGmailConfigured] = useState(false);
  const [gmailTokenAvailable, setGmailTokenAvailable] = useState(false);
  const [gmailStatusLoaded, setGmailStatusLoaded] = useState(false);
  const [gmailSetupMessage, setGmailSetupMessage] = useState("");
  const [gmailEmail, setGmailEmail] = useState<string | null>(null);
  const [gmailConnectionId, setGmailConnectionId] = useState<string | null>(null);
  const [isGmailModalOpen, setIsGmailModalOpen] = useState(false);
  const [modalConsent, setModalConsent] = useState(false);
  const [gmailMessage, setGmailMessage] = useState("");
  const [selectedHistoryRange, setSelectedHistoryRange] =
    useState<GmailHistoryRange>("13m");
  const [gmailCoverage, setGmailCoverage] =
    useState<GmailScanCoverage | null>(null);
  const [gmailCoverageHistoryAvailable, setGmailCoverageHistoryAvailable] =
    useState(true);
  const [gmailCandidates, setGmailCandidates] = useState<
    ConsolidatedSubscriptionCandidate[]
  >([]);
  const [selectedGmailCandidateIds, setSelectedGmailCandidateIds] = useState<
    Set<string>
  >(new Set());
  const [bulkGmailSaving, setBulkGmailSaving] = useState(false);
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
  // Last bulk add, kept so it can be undone: created subscription ids + the candidates they came from.
  const [lastBulk, setLastBulk] = useState<{
    ids: string[];
    candidates: ConsolidatedSubscriptionCandidate[];
  } | null>(null);
  const [undoing, setUndoing] = useState(false);
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
          tokenAvailable?: boolean;
          email?: string | null;
          connectionId?: string | null;
          message?: string;
          latestCoverage?: GmailScanCoverage | null;
          coverageHistoryAvailable?: boolean;
        };
      })
      .then((status) => {
        if (!isCurrent || !status) return;
        setGmailConfigured(status.configured);
        setGmailTokenAvailable(Boolean(status.tokenAvailable));
        setGmailConnected(status.connected);
        setGmailStatusLoaded(true);
        setGmailCoverage(status.latestCoverage ?? null);
        setGmailCoverageHistoryAvailable(
          status.coverageHistoryAvailable !== false
        );
        setGmailSetupMessage(status.message ?? "");
        if (status.email) setGmailEmail(status.email);
        setGmailConnectionId(status.connectionId ?? null);
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
      setGmailTokenAvailable(true);
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
    const selectedFiles = Array.from(e.currentTarget.files ?? []);
    e.currentTarget.value = "";
    setErrorMessage("");
    setSavedSuccess(false);
    setScreenshotItems([]);
    setScreenshotSavedCount(0);

    if (selectedFiles.length === 0) return;
    if (!hasConsented) {
      setErrorMessage("Please accept the privacy consent before importing data.");
      return;
    }
    if (captureBlock) {
      setErrorMessage(captureBlock);
      return;
    }
    if (selectedFiles.length > MAX_SCREENSHOTS_PER_IMPORT) {
      setErrorMessage(
        `Choose no more than ${MAX_SCREENSHOTS_PER_IMPORT} screenshots per import.`
      );
      return;
    }

    const invalidFile = selectedFiles.find(
      (file) =>
        !file.type.match(/^image\/(jpeg|png|webp)$/) ||
        file.size > MAX_SCREENSHOT_BYTES
    );
    if (invalidFile) {
      setErrorMessage(
        invalidFile.size > MAX_SCREENSHOT_BYTES
          ? `${invalidFile.name} exceeds the 10MB limit. Please choose a smaller screenshot.`
          : `Please select PNG, JPEG, or WEBP screenshots. ${invalidFile.name} is not a supported image.`
      );
      return;
    }

    for (const file of selectedFiles) {
      await processScreenshot(file);
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

      void recordUsageMilestone("ocr_import_viewed", parsed.length);
      setScreenshotItems((current) => {
        const seenServices = new Set(
          current.map((existing) => existing.service_name.trim().toLowerCase())
        );
        const newItems = parsed.map((item, index) => {
          const serviceKey = item.service_name.trim().toLowerCase();
          const isDuplicate =
            checkDuplicate(item.service_name) || seenServices.has(serviceKey);
          seenServices.add(serviceKey);

          return {
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
            is_duplicate: isDuplicate,
            selected: !isDuplicate,
          };
        });

        return [...current, ...newItems];
      });
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

  // 2. Connect to Gmail
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
      const consentResponse = await fetch("/api/connectors/gmail/consent", {
        method: "POST",
      });
      const consentData = (await consentResponse.json()) as { error?: string };
      if (!consentResponse.ok) {
        throw new Error(
          consentData.error || "Could not record your Gmail consent."
        );
      }

      if (gmailTokenAvailable) {
        setGmailConnected(true);
        setIsGmailModalOpen(false);
        setModalConsent(false);
        setGmailMessage(
          "Updated 13-month Gmail consent saved. Your existing Gmail connection is ready to scan; Google authorization was not repeated."
        );
        return;
      }

      const response = await fetch("/api/connectors/gmail/auth", {
        method: "POST",
      });
      const data = (await response.json()) as {
        configured?: boolean;
        authUrl?: string | null;
        message?: string;
      };

      if (data.configured && data.authUrl) {
        window.location.assign(data.authUrl);
      } else {
        setErrorMessage(
          data.message ||
            "Google OAuth is not configured on the server. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local."
        );
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to initiate Google OAuth."
      );
    }
  };

  /**
   * Live scan in server-timed batches. Candidates are rebuilt from all evidence after every batch,
   * so they are reconciled and de-duplicated before anything can be saved. Saving is locked while
   * the scan runs. When the scan ends (done, stopped or failed) the server issues the import keys
   * from the evidence it proved, so one source email can only be imported once.
   */
  const handleBatchedLiveScan = async (resumeCursor?: string) => {
    if (captureBlock) {
      setErrorMessage(captureBlock);
      return;
    }
    setGmailScanning(true);
    setErrorMessage("");
    setGmailMessage("");
    setGmailCoverage(null);
    setGmailResumeCursor(null);
    if (!resumeCursor) {
      setGmailCandidates([]);
      setSelectedGmailCandidateIds(new Set());
      setDismissedCandidateIds(new Set());
      scanEvidenceRef.current = new Map();
    }
    setGmailProgress({ checked: 0, found: 0, lane: "Starting" });
    const controller = new AbortController();
    scanAbortRef.current = controller;
    const warnBeforeLeave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeLeave);

    const evidenceNow = () => Array.from(scanEvidenceRef.current.values());
    const finalize = async (): Promise<ConsolidatedSubscriptionCandidate[]> => {
      const built = consolidateEvidenceToCandidates(evidenceNow(), subscriptions);
      let keys: (string | null)[] | null = null;
      try {
        const res = await fetch("/api/connectors/gmail/import-keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            groups: built.map((c) => ({
              evidence: c.evidence.map((e) => ({
                key: e.message_id,
                proof: scanEvidenceRef.current.get(e.message_id ?? "")?.key_proof,
              })),
            })),
          }),
        });
        const data = (await res.json()) as { success: boolean; keys?: (string | null)[] };
        if (res.ok && data.success && data.keys?.length === built.length) keys = data.keys;
      } catch {
        keys = null;
      }
      const withKeys = built.map((c, i) => ({ ...c, import_key: keys?.[i] ?? undefined }));
      setGmailCandidates(withKeys);
      if (!keys) {
        setErrorMessage(
          "Candidates were found but could not be verified for duplicate protection. Run the scan again before saving."
        );
        setSelectedGmailCandidateIds(new Set());
      } else {
        setSelectedGmailCandidateIds(
          new Set(
            withKeys
              .filter(
                (c) =>
                  c.status === "likely_active" &&
                  c.renewal_state !== "cancelled" &&
                  canBulkAddGmailCandidate(c)
              )
              .map((c) => c.id)
          )
        );
      }
      return withKeys;
    };

    let cursor: string | undefined = resumeCursor;
    let resume = Boolean(resumeCursor);
    let lastGoodCursor: string | undefined = resumeCursor;
    let checkedTotal = 0;
    try {
      for (let batch = 0; batch < 400; batch += 1) {
        const response = await fetch("/api/connectors/gmail/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            mode: "live",
            batch: true,
            cursor,
            resume,
            historyRange: selectedHistoryRange,
          }),
        });
        resume = false;
        const data = (await response.json()) as {
          success: boolean;
          error?: string;
          done?: boolean;
          resumable?: boolean;
          cursor?: string;
          evidence?: DiscoveryEvidence[];
          progress?: { messagesChecked: number; lanes: { label: string; status: string }[] };
          coverage?: GmailScanCoverage;
          warnings?: string[];
        };
        if (!response.ok || !data.success) {
          if (response.status === 401) {
            setGmailConnected(false);
            setGmailTokenAvailable(false);
          }
          const err = new Error(data.error || "Could not scan Gmail.") as Error & { status?: number };
          err.status = response.status;
          throw err;
        }
        for (const ev of data.evidence ?? []) {
          scanEvidenceRef.current.set(ev.message_id ?? ev.id, ev);
        }
        checkedTotal = data.progress?.messagesChecked ?? checkedTotal;
        const interim = consolidateEvidenceToCandidates(evidenceNow(), subscriptions);
        setGmailCandidates(interim.map((c) => ({ ...c, import_key: undefined })));
        const openLane = data.progress?.lanes.find((l) => l.status === "not_started")?.label ?? "Finishing";
        setGmailProgress({ checked: checkedTotal, found: interim.length, lane: openLane });
        cursor = data.cursor;
        lastGoodCursor = data.cursor ?? lastGoodCursor;
        if (data.done) {
          const finalCandidates = await finalize();
          setGmailCoverage(data.coverage ?? null);
          if (data.resumable && data.cursor) setGmailResumeCursor(data.cursor);
          setGmailMessage(
            [
              finalCandidates.length > 0
                ? `Found ${finalCandidates.length} likely subscription candidates from ${checkedTotal} unique emails read (each email is counted once, even if it matched several search categories). Review each before saving.`
                : `Read ${checkedTotal} unique emails but found no recurring subscription receipts.`,
              ...(data.warnings ?? []),
            ].join(" ")
          );
          requestAnimationFrame(() => {
            gmailResultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          });
          return;
        }
      }
      throw new Error("The scan took too many steps and was stopped. Start a new scan.");
    } catch (error) {
      const partial = scanEvidenceRef.current.size > 0;
      if (partial) await finalize();
      if ((error as Error)?.name === "AbortError") {
        // The batch in flight was abandoned; the last completed batch's position is still valid,
        // so Continue re-reads from there and nothing is skipped.
        if (lastGoodCursor) setGmailResumeCursor(lastGoodCursor);
        setGmailMessage(
          `Scan stopped. Results below are partial: only the ${scanEvidenceRef.current.size} matching emails read so far are included.` +
            (lastGoodCursor ? " You can continue from where it stopped (within 30 minutes)." : " Start a new scan to read the rest.")
        );
      } else {
        const status = (error as { status?: number })?.status;
        const base = error instanceof Error ? error.message : "Network error scanning Gmail.";
        setErrorMessage(
          partial
            ? `${base} The results below are partial (${scanEvidenceRef.current.size} matching emails read before the scan stopped).` +
                (status === 400 ? " Starting a new scan uses one of today's scans." : "")
            : base
        );
      }
    } finally {
      window.removeEventListener("beforeunload", warnBeforeLeave);
      scanAbortRef.current = null;
      setGmailScanning(false);
      setGmailProgress(null);
    }
  };

  // 3. Scan Gmail (keyword-matched, recent messages only)
  const handleScanGmail = async (mode: "live" | "sandbox") => {
    if (mode === "live") return handleBatchedLiveScan();
    setGmailScanning(true);
    setErrorMessage("");
    setGmailMessage("");
    setGmailCandidates([]);
    setSelectedGmailCandidateIds(new Set());
    setGmailCoverage(null);
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
        warnings?: string[];
        coverage?: GmailScanCoverage;
        error?: string;
        message?: string;
      };

      if (!response.ok || !data.success) {
        if (data.coverage) setGmailCoverage(data.coverage);
        if (response.status === 401) {
          setGmailConnected(false);
          setGmailTokenAvailable(false);
        }
        throw new Error(data.error || "Could not scan Gmail.");
      }

      const candidates = data.candidates ?? [];
      void recordUsageMilestone("gmail_scan_viewed", candidates.length);
      setGmailCandidates(candidates);
      setSelectedGmailCandidateIds(
        new Set(
          candidates
            .filter(
              (candidate) =>
                candidate.status === "likely_active" &&
                // Cancelled-with-access items are not pre-selected: the user opts in.
                candidate.renewal_state !== "cancelled" &&
                canBulkAddGmailCandidate(candidate)
            )
            .map((candidate) => candidate.id)
        )
      );
      setGmailCoverage(data.coverage ?? null);
      setGmailMessage(
        [data.message || "Gmail scan complete.", ...(data.warnings ?? [])].join(
          " "
        )
      );
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
        message?: string;
      };
      if (!response.ok || !data.connected) {
        throw new Error(
          data.error || data.message || "Could not disconnect Gmail."
        );
      }
      setGmailConnected(false);
      setGmailTokenAvailable(false);
      setGmailEmail(null);
      setGmailConnectionId(null);
      setGmailCandidates([]);
      setGmailMessage("Gmail disconnected and stored server session deleted.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not disconnect Gmail."
      );
    }
  };

  const handleDeleteGmailImports = async () => {
    if (
      !window.confirm(
        "Permanently delete subscriptions previously confirmed and imported from Gmail? Manual and screenshot records will remain."
      )
    ) {
      return;
    }
    setErrorMessage("");
    try {
      const response = await fetch("/api/connectors/gmail/imports", {
        method: "DELETE",
      });
      const result = (await response.json()) as {
        deletedCount?: number;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(result.error || "Could not delete Gmail imports.");
      }
      setGmailMessage(
        `${result.deletedCount ?? 0} Gmail-imported subscription record(s) deleted.`
      );
      window.location.assign("/import?gmail=imports-deleted");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not delete Gmail imports."
      );
    }
  };

  // Select Candidate for Review-Before-Save
  const handleReviewCandidate = (cand: ConsolidatedSubscriptionCandidate) => {
    if (gmailScanning) return;
    setExtractedData({
      service_name: cand.service_name,
      plan_name: cand.plan_name || "Standard Plan",
      amountRupees: cand.amount_rupees?.toString() ?? "",
      billing_cycle: cand.billing_cycle,
      category: cand.category,
      renewal_date: cand.renewal_date || "",
      billing_channel: cand.billing_channel,
      confidence: cand.confidence,
      source_label: "Gmail",
      is_duplicate: Boolean(cand.is_possible_duplicate),
    });
  };

  /** Fill a missing price or interval in place, then make the row bulk-selectable. */
  const handleQuickFillCandidate = (
    id: string,
    patch: { amount_rupees?: number; billing_cycle?: BillingCycle }
  ) => {
    setGmailCandidates((current) =>
      current.map((candidate) =>
        candidate.id === id
          ? {
              ...candidate,
              ...patch,
              needs_review_reasons: candidate.needs_review_reasons.filter((reason) => {
                if (patch.amount_rupees && /price is unknown/i.test(reason)) return false;
                if (patch.billing_cycle && /cycle is unknown/i.test(reason)) return false;
                return true;
              }),
            }
          : candidate
      )
    );
    setSelectedGmailCandidateIds((current) => {
      const target = gmailCandidates.find((candidate) => candidate.id === id);
      if (!target || target.status !== "likely_active") return current;
      const merged = { ...target, ...patch };
      if (!canBulkAddGmailCandidate(merged)) return current;
      return new Set(current).add(id);
    });
  };

  const handleDismissUnselected = () => {
    setDismissedCandidateIds((prev) => {
      const next = new Set(prev);
      for (const candidate of gmailCandidates) {
        if (!selectedGmailCandidateIds.has(candidate.id)) next.add(candidate.id);
      }
      return next;
    });
  };

  const handleDismissCandidate = (id: string) => {
    setDismissedCandidateIds((prev) => new Set([...prev, id]));
    setSelectedGmailCandidateIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleSaveSelectedGmailCandidates = async () => {
    if (gmailScanning) return;
    if (!hasConsented) {
      setErrorMessage("Please accept the privacy consent before saving imported data.");
      return;
    }

    const selected = activeCandidates
      .filter(canBulkAddGmailCandidate)
      .filter((candidate) => selectedGmailCandidateIds.has(candidate.id));
    if (selected.length === 0) {
      setErrorMessage("Select at least one likely active candidate to add.");
      return;
    }

    const savedIds: string[] = [];
    const createdSubIds: string[] = [];
    const createdCandidates: ConsolidatedSubscriptionCandidate[] = [];
    let alreadyAdded = 0;
    setBulkGmailSaving(true);
    setErrorMessage("");

    try {
      for (const candidate of selected) {
        try {
        const createdId = await addSubscription({
          import_key: candidate.import_key,
          household_id: household.id,
          service_name: candidate.service_name,
          plan_name: candidate.plan_name,
          amount_paise: rupeesToPaise(candidate.amount_rupees),
          billing_cycle: candidate.billing_cycle,
          category: candidate.category,
          payer_id: currentProfile.id,
          user_ids: [currentProfile.id],
          billing_channel: candidate.billing_channel,
          // A cancelled subscription is not renewing, so no future renewal date is recorded.
          renewal_date:
            candidate.renewal_state === "cancelled"
              ? undefined
              : candidate.renewal_date || undefined,
          visibility: "full_details",
          source: "import",
          source_type: "gmail",
          source_connection_id: gmailConnectionId ?? undefined,
          imported_at: new Date().toISOString(),
          is_active: true,
          notes: `Imported via Gmail. Verified by ${currentProfile.name}.${
            candidate.renewal_state === "cancelled"
              ? ` Cancelled; access until ${candidate.access_end_date ?? "period end"}.`
              : ""
          }`,
        });
        createdSubIds.push(createdId);
        createdCandidates.push(candidate);
        } catch (err) {
          // Same import saved earlier (retry or double click): not an error, not a new row.
          if (!(err instanceof AlreadyImportedError)) throw err;
          alreadyAdded += 1;
        }
        savedIds.push(candidate.id);
      }
    } catch (error) {
      if (createdSubIds.length > 0) {
        setLastBulk({ ids: createdSubIds, candidates: createdCandidates });
      }
      if (savedIds.length > 0) {
        const savedIdSet = new Set(savedIds);
        setGmailCandidates((current) =>
          current.filter((candidate) => !savedIdSet.has(candidate.id))
        );
        setSelectedGmailCandidateIds((current) =>
          new Set(Array.from(current).filter((id) => !savedIdSet.has(id)))
        );
      }
      setErrorMessage(
        savedIds.length > 0
          ? `Added ${savedIds.length} of ${selected.length} selected subscriptions. The remaining candidates are still available to review. ${
              error instanceof Error ? error.message : "Check your subscription list before retrying."
            }`
          : error instanceof Error
            ? error.message
            : "Could not add the selected Gmail candidates."
      );
      return;
    } finally {
      setBulkGmailSaving(false);
    }

    const savedIdSet = new Set(savedIds);
    setGmailCandidates((current) =>
      current.filter((candidate) => !savedIdSet.has(candidate.id))
    );
    setSelectedGmailCandidateIds(new Set());
    setScreenshotSavedCount(savedIds.length);
    setLastBulk(createdSubIds.length ? { ids: createdSubIds, candidates: createdCandidates } : null);
    if (alreadyAdded > 0) {
      setErrorMessage(`${alreadyAdded} item(s) were already added earlier and were skipped.`);
    }
    setSavedSuccess(true);
  };

  const handleUndoBulk = async () => {
    if (!lastBulk) return;
    setUndoing(true);
    const failed = new Set<string>();
    for (const id of lastBulk.ids) {
      try {
        await deleteSubscription(id);
      } catch {
        failed.add(id);
      }
    }
    const plan = planBulkUndo(lastBulk, failed);
    // Put back candidates only for rows that were really removed.
    setGmailCandidates((current) => [...plan.restored, ...current]);
    setLastBulk(plan.remaining);
    if (!plan.remaining) {
      setSavedSuccess(false);
      setScreenshotSavedCount(0);
    }
    setErrorMessage(
      plan.remaining
        ? `Undid ${plan.undoneCount}, but ${plan.remaining.ids.length} could not be removed. Try Undo again or delete them from the Subscriptions page.`
        : ""
    );
    setUndoing(false);
  };

  // 5. Confirm and save the selected screenshot entries.
  const handleSaveScreenshotItems = async () => {
    if (!hasConsented) {
      setErrorMessage("Please accept the privacy consent before saving imported data.");
      return;
    }

    const selectedItems = screenshotItems.filter((item) => item.selected);
    if (selectedItems.length === 0) {
      setErrorMessage("Select at least one recognized subscription to save.");
      return;
    }
    if (selectedItems.some((item) => item.billing_cycle === "unknown")) {
      setErrorMessage(
        "Confirm a billing cycle for every selected screenshot item before saving."
      );
      return;
    }

    try {
      for (const item of selectedItems) {
        const billingCycle = item.billing_cycle;
        if (billingCycle === "unknown") {
          throw new Error("Confirm a billing cycle for each selected screenshot item.");
        }
        await addSubscription({
          household_id: household.id,
          service_name: item.service_name.trim(),
          plan_name: item.plan_name.trim() || undefined,
          amount_paise: rupeesToPaise(item.amountRupees),
          billing_cycle: billingCycle,
          category: item.category,
          payer_id: currentProfile.id,
          user_ids: [currentProfile.id],
          billing_channel: item.billing_channel,
          renewal_date: item.renewal_date || undefined,
          visibility: "full_details",
          source: "import",
          source_type: "screenshot",
          imported_at: new Date().toISOString(),
          is_active: true,
          notes: `Imported via ${item.source_label}. Verified by ${currentProfile.name}.`,
        });
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? `Some subscriptions may not have been saved: ${error.message}`
          : "Some subscriptions may not have been saved. Refresh and check your list."
      );
      return;
    }

    setScreenshotSavedCount(selectedItems.length);
    setScreenshotItems([]);
    setErrorMessage("");
    setSavedSuccess(true);
  };

  // 6. Confirm & Save Subscription from Unified Review Form
  const handleConfirmSave = async (e: React.FormEvent) => {
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

    try {
      await addSubscription({
        household_id: household.id,
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
        source_type:
          extractedData.source_label === "Gmail" ? "gmail" : "screenshot",
        source_connection_id:
          extractedData.source_label === "Gmail"
            ? gmailConnectionId ?? undefined
            : undefined,
        imported_at: new Date().toISOString(),
        is_active: true,
        notes: `Imported via ${extractedData.source_label}. Verified by ${currentProfile.name}.`,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not save this subscription."
      );
      return;
    }

    setSavedSuccess(true);
    setExtractedData(null);
    setScreenshotSavedCount(1);
  };

  const activeCandidates = gmailCandidates.filter(
    (c) => !dismissedCandidateIds.has(c.id)
  );
  const selectableGmailCandidates = activeCandidates.filter(
    canBulkAddGmailCandidate
  );
  const selectedGmailCandidateCount = selectableGmailCandidates.filter(
    (candidate) => selectedGmailCandidateIds.has(candidate.id)
  ).length;
  const gmailCandidateGroups = [
    {
      title: "Likely active",
      description:
        "Receipt-backed candidates with a known price and billing interval. Ready items are selected by default; uncheck anything no longer active.",
      candidates: activeCandidates.filter(
        (candidate) => candidate.status === "likely_active"
      ),
      className:
        "border-emerald-200 dark:border-emerald-900/70 bg-emerald-50/30 dark:bg-emerald-950/10",
    },
    {
      title: "Needs confirmation",
      description:
        "Not preselected. Confirm the evidence and current status first; items with a known price and interval can then be selected, while incomplete items need individual review.",
      candidates: activeCandidates.filter(
        (candidate) => candidate.status === "needs_confirmation"
      ),
      className:
        "border-amber-200 dark:border-amber-900/70 bg-amber-50/30 dark:bg-amber-950/10",
    },
    {
      title: "Cancelled, expired, or payment failed",
      description:
        "Not selected for bulk import. Check for later renewals or reactivation before adding.",
      candidates: activeCandidates.filter(
        (candidate) =>
          candidate.status === "cancelled_or_expired" ||
          candidate.status === "payment_failed"
      ),
      className:
        "border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/30",
    },
  ].filter((group) => group.candidates.length > 0);

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
          <div className="rounded-2xl border border-indigo-200 dark:border-indigo-900/70 bg-indigo-50/70 dark:bg-indigo-950/30 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <span className="inline-flex items-center rounded-full bg-indigo-100 dark:bg-indigo-900/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
                Recommended
              </span>
              <h2 className="mt-2 text-sm font-bold text-slate-900 dark:text-white">
                Connect Gmail for the broadest subscription scan
              </h2>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                We search matching subscription, renewal, receipt, payment, membership, and mandate emails within a selected window of up to 13 months. This can find services billed directly to a card as well as store receipts; scan coverage is shown for review.
              </p>
            </div>
            <button
              type="button"
              onClick={gmailConnected ? () => handleScanGmail("live") : handleOpenConnectModal}
              disabled={
                gmailScanning ||
                (!gmailConnected && gmailStatusLoaded && !gmailConfigured)
              }
              className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60"
            >
              {gmailScanning ? "Scanning matching emails..." : gmailConnected ? "Scan Gmail" : "Connect Gmail"}
            </button>
          </div>

          {(gmailScanning || gmailResumeCursor) && (
            <div
              role="status"
              aria-live="polite"
              className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-xs text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-100"
            >
              {gmailScanning && gmailProgress ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Scanning in batches: {gmailProgress.checked} unique emails read, {gmailProgress.found} candidates so far. Candidates may merge or change until the scan finishes, so saving is locked until then.
                  </span>
                  <button
                    type="button"
                    onClick={() => scanAbortRef.current?.abort()}
                    className="rounded-lg border border-indigo-300 px-3 py-1.5 font-semibold hover:bg-white dark:border-indigo-700"
                  >
                    Stop scan
                  </button>
                </div>
              ) : (
                gmailResumeCursor && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      This scan stopped before reading all matching mail, so results are partial. Continue to keep scanning from where it stopped; leaving or refreshing this page loses the results shown here.
                    </span>
                    <button
                      type="button"
                      onClick={() => handleBatchedLiveScan(gmailResumeCursor)}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-700"
                    >
                      Continue scanning
                    </button>
                  </div>
                )
              )}
            </div>
          )}

          {captureBlock ? (
            <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 p-4 text-sm text-amber-900 dark:text-amber-200">
              <p>{captureBlock}</p>
              <Link href="/pricing" className="font-semibold underline">Pay Rs 60</Link>
            </div>
          ) : null}
          {/* Main Visual Dropzone (Screenshot OCR) */}
          <div className="bg-white dark:bg-slate-900 border-2 border-dashed border-slate-300 dark:border-slate-800 rounded-3xl p-8 text-center transition hover:border-indigo-400 dark:hover:border-indigo-600 shadow-sm relative overflow-hidden group">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto shadow-sm group-hover:scale-105 transition-transform duration-200">
              <FileUp className="w-7 h-7" />
            </div>

            <h2 className="font-bold text-base text-slate-900 dark:text-white mt-3">
              Prefer not to connect Gmail? Upload store screenshots
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
              Screenshots can capture subscriptions listed in Google Play or Apple settings. Scroll through the list and select multiple screenshots if needed; direct-billed subscriptions may not appear there.
            </p>

            <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
              Android: Play Store → profile picture → Payments &amp; subscriptions → Subscriptions. iPhone: Settings → your name → Subscriptions.
            </p>

            <div className="mt-5 flex justify-center">
              <label className="cursor-pointer px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-sm transition inline-flex items-center gap-2">
                <span>Select Screenshot(s)</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
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
              Process up to 5 PNG, JPEG, or WEBP screenshots (10MB each). OCR runs locally in this browser; images are never uploaded. Always verify results before saving.
            </p>
          </div>

          {/* Quick Connectors Deck */}
          <div className="grid grid-cols-1 gap-4">
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
                        ? gmailConfigured || gmailTokenAvailable
                          ? "Not connected"
                          : "Setup required"
                        : "Checking setup"}
                  </span>
                </div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Gmail Subscription Scan
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  A scan you start searches five subscription-related lanes, matching emails from the selected window of up to 13 months, read in batches, each email counted once. A run reads up to 2,000 emails and a whole scan up to 10,000. If a limit is reached the scan tells you coverage is partial and, for the per-run limit, lets you continue; you can stop at any time. Gmail grants read access more broadly than those app-side filters; a matched message may contain unrelated content that is processed transiently for extraction.
                </p>
              </div>

              <div className="space-y-2">
                {!gmailConnected &&
                  gmailStatusLoaded &&
                  !gmailConfigured &&
                  !gmailTokenAvailable && (
                  <p
                    role="status"
                    className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-2.5 py-2 text-[10px] leading-relaxed text-amber-800 dark:text-amber-200"
                  >
                    {gmailSetupMessage ||
                      "Live Gmail linking needs server settings. You can preview sample results without connecting an inbox."}
                  </p>
                )}
                {gmailConnected && (
                  <div className="space-y-1.5 pb-1">
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      Search timeframe (maximum 13 months):
                    </label>
                    <select
                      value={selectedHistoryRange}
                      onChange={(e) =>
                        setSelectedHistoryRange(
                          e.target.value as GmailHistoryRange
                        )
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200"
                    >
                      <option value="30d">Past 30 days</option>
                      <option value="45d">Past 45 days</option>
                      <option value="13m">Past 13 months</option>
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
                  disabled={
                    gmailScanning ||
                    (!gmailConnected &&
                      gmailStatusLoaded &&
                      !gmailConfigured &&
                      !gmailTokenAvailable)
                  }
                  className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-semibold transition flex items-center justify-center gap-1.5"
                >
                  {gmailScanning ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 text-white" />
                  )}
                  {gmailScanning
                    ? "Searching matching emails..."
                    : gmailConnected
                      ? "Scan Gmail Inbox"
                      : gmailTokenAvailable
                        ? "Review Updated Consent"
                        : "Connect Gmail"}
                </button>

                <button
                  type="button"
                  onClick={() => handleScanGmail("sandbox")}
                  disabled={gmailScanning}
                  className="w-full py-1.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-[11px] font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 transition"
                >
                  Preview sample results (no inbox access)
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
                <button
                  type="button"
                  onClick={handleDeleteGmailImports}
                  className="w-full py-1 text-[11px] text-slate-500 hover:text-rose-600 transition"
                >
                  Delete saved Gmail-imported records
                </button>
              </div>
            </div>

          </div>

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

          {!gmailCoverageHistoryAvailable && (
            <p
              role="status"
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
            >
              Previous Gmail scan coverage could not be loaded. New results will
              show whether their coverage was recorded.
            </p>
          )}

          {gmailCoverage && (
            <section
              aria-label="Gmail scan coverage"
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Gmail scan coverage
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {new Date(gmailCoverage.windowStart).toLocaleDateString()}–
                    {new Date(gmailCoverage.windowEnd).toLocaleDateString()} ·{" "}
                    {gmailCoverage.historyRange === "13m"
                      ? "13 months"
                      : gmailCoverage.historyRange === "30d"
                        ? "30 days"
                        : "45 days"}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                    gmailCoverage.paginationComplete
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  }`}
                >
                  {gmailCoverage.paginationComplete
                    ? "Search completed"
                    : "Partial coverage"}
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                {gmailCoverage.pagesFetched} pages ·{" "}
                {gmailCoverage.messagesMatched} search matches ·{" "}
                {gmailCoverage.uniqueMessagesSelected} unique messages selected ·{" "}
                {gmailCoverage.messagesFetched} fetched for processing
                {gmailCoverage.messageFetchFailures > 0 &&
                  ` · ${gmailCoverage.messageFetchFailures} fetch failures`}
              </p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {gmailCoverage.laneCoverage.map((lane) => (
                  <div
                    key={lane.key}
                    className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 dark:bg-slate-800 px-2.5 py-2 text-[10px]"
                  >
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {lane.label}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      {lane.status.replace("_", " ")} · {lane.pagesFetched}{" "}
                      {lane.pagesFetched === 1 ? "page" : "pages"}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Coverage is recorded without message bodies or IDs. Attachments
                are not searched or processed.
                {gmailCoverage.recorded === false &&
                  " This scan's coverage could not be saved."}
              </p>
            </section>
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
                    Consolidated across Google Play, Apple, merchant invoices, and bank e-mandates. Add ready, likely active items together; review uncertain or inactive items individually.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-slate-400">
                    {selectedGmailCandidateCount} selected
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedGmailCandidateIds(
                        new Set(
                          selectableGmailCandidates
                            .filter((candidate) => candidate.status === "likely_active")
                            .map((candidate) => candidate.id)
                        )
                      )
                    }
                    disabled={
                      !selectableGmailCandidates.some(
                        (candidate) => candidate.status === "likely_active"
                      ) || bulkGmailSaving
                    }
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                  >
                    Select likely active
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedGmailCandidateIds(new Set())}
                    disabled={selectedGmailCandidateCount === 0 || bulkGmailSaving || gmailScanning}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                  >
                    Clear selection
                  </button>
                  <button
                    type="button"
                    onClick={handleDismissUnselected}
                    disabled={
                      bulkGmailSaving ||
                      activeCandidates.every((candidate) => selectedGmailCandidateIds.has(candidate.id))
                    }
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                  >
                    Dismiss everything not selected
                  </button>
                </div>
              </div>

              {/* Discovery Limitations Notice */}
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300 flex items-start gap-2">
                <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                <span>
                  <strong>Discovery limitations:</strong> Mailbox scans find likely subscriptions from receipts and bank alerts in this account. Some emails may be missing, use unfamiliar merchant names, or reside in another family member&apos;s account.
                </span>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-300">
                Ready likely-active candidates are selected by default. Uncheck
                anything that is no longer active. Uncertain candidates are
                unselected; checking one with complete details confirms that
                you reviewed its evidence and consider it active. Cancelled or
                failed candidates stay out of bulk import.
              </p>

              <div className="space-y-5">
                {gmailCandidateGroups.map((group) => (
                  <section key={group.title} className="space-y-3">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        {group.title} ({group.candidates.length})
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {group.description}
                      </p>
                    </div>
                    <div className="space-y-3">
                {group.candidates.map((cand) => {
                  const isExpanded = expandedCandidateId === cand.id;
                  const hasUnknownCycle = cand.billing_cycle === "unknown";
                  const canBulkAdd = canBulkAddGmailCandidate(cand);

                  return (
                    <article
                      key={cand.id}
                      className={`bg-white dark:bg-slate-900 border rounded-2xl p-5 shadow-sm space-y-3 transition ${group.className}`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 mb-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-md">
                              {cand.category}
                            </span>

                            {/* Status Badge */}
                            {cand.status === "likely_active" &&
                              cand.renewal_state === "cancelled" && (
                              <span className="text-[10px] font-bold uppercase tracking-wider bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300 px-2 py-0.5 rounded-md">
                                Access active, not renewing
                              </span>
                            )}
                            {cand.status === "likely_active" &&
                              cand.renewal_state !== "cancelled" && (
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

                            {cand.access_state === "active_until_period_end" && (
                              <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">
                                {cand.access_end_date ? `Cancelled, access until ${cand.access_end_date}` : "Cancelled, access until period end"}
                              </span>
                            )}
                            {cand.mandate_state === "revoked" && (
                              <span className="text-[10px] font-bold uppercase tracking-wider bg-violet-100 text-violet-800 px-2 py-0.5 rounded-md">
                                Autopay mandate revoked
                              </span>
                            )}
                            {cand.price_known === false && (
                              <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">
                                Price unknown
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
                            {cand.amount_rupees && cand.amount_rupees > 0 ? (
                              <>
                                ₹{cand.amount_rupees}
                                <span className="text-xs font-medium text-slate-500 ml-1">
                                  /{cand.billing_cycle}
                                </span>
                              </>
                            ) : (
                              <span className="text-sm text-slate-500">
                                {cand.mandate_details?.max_amount_rupees
                                  ? "Variable / Cap only"
                                  : "Price unknown"}
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

                      {/* Quick fill: finish an incomplete candidate without opening the full form */}
                      {!canBulkAdd &&
                        !cand.is_possible_duplicate &&
                        (cand.status === "likely_active" || cand.status === "needs_confirmation") && (
                          <div
                            className="flex flex-wrap items-end gap-3 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 text-xs dark:border-indigo-900 dark:bg-indigo-950/20"
                            data-testid="quick-fill"
                          >
                            <label className="flex flex-col gap-1 font-semibold text-slate-700 dark:text-slate-200">
                              Price (₹)
                              <input
                                type="number"
                                min={1}
                                inputMode="decimal"
                                defaultValue={cand.amount_rupees ?? ""}
                                onBlur={(event) => {
                                  const value = Number(event.target.value);
                                  if (value > 0) handleQuickFillCandidate(cand.id, { amount_rupees: value });
                                }}
                                className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-800"
                              />
                            </label>
                            <label className="flex flex-col gap-1 font-semibold text-slate-700 dark:text-slate-200">
                              Billed
                              <select
                                value={cand.billing_cycle}
                                onChange={(event) => {
                                  if (event.target.value !== "unknown") {
                                    handleQuickFillCandidate(cand.id, {
                                      billing_cycle: event.target.value as BillingCycle,
                                    });
                                  }
                                }}
                                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-800"
                              >
                                <option value="unknown">Choose...</option>
                                <option value="monthly">Monthly</option>
                                <option value="quarterly">Quarterly</option>
                                <option value="half_yearly">Every 6 months</option>
                                <option value="annual">Yearly</option>
                              </select>
                            </label>
                            <span className="pb-1.5 text-slate-500">Fill both and this row can be added in bulk.</span>
                          </div>
                        )}

                      {/* Card Action Buttons */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                        <div>
                          {canBulkAdd ? (
                            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={selectedGmailCandidateIds.has(cand.id)}
                                disabled={bulkGmailSaving}
                                onChange={(event) =>
                                  setSelectedGmailCandidateIds((current) => {
                                    const next = new Set(current);
                                    if (event.target.checked) next.add(cand.id);
                                    else next.delete(cand.id);
                                    return next;
                                  })
                                }
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              {cand.status === "needs_confirmation"
                                ? "I confirmed this is active"
                                : "Add in bulk"}
                            </label>
                          ) : cand.status === "likely_active" ? (
                            <span className="text-[11px] text-amber-700 dark:text-amber-300">
                              {cand.is_possible_duplicate
                                ? "Possible household duplicate — review before adding"
                                : "Confirm price and interval before adding"}
                            </span>
                          ) : null}
                        </div>
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
                          disabled={bulkGmailSaving || gmailScanning}
                          className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <span>Review & Add</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </article>
                  );
                })}
                    </div>
                  </section>
                ))}
              </div>

              <div className="sticky bottom-20 md:bottom-4 z-10 flex justify-end rounded-2xl bg-white/90 p-2 backdrop-blur dark:bg-slate-900/90">
                <button
                  type="button"
                  onClick={handleSaveSelectedGmailCandidates}
                  disabled={selectedGmailCandidateCount === 0 || bulkGmailSaving || gmailScanning}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition disabled:opacity-50"
                >
                  {bulkGmailSaving
                    ? "Adding selected subscriptions..."
                    : `Add ${selectedGmailCandidateCount} selected subscription${selectedGmailCandidateCount === 1 ? "" : "s"}`}
                </button>
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
                                  billing_cycle: event.target.value as
                                    | BillingCycle
                                    | "unknown",
                                }
                              : candidate
                          )
                        )
                      }
                      className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                    >
                      <option value="unknown">Confirm billing cycle</option>
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
            {lastBulk && lastBulk.ids.length > 0 && (
              <button
                onClick={() => void handleUndoBulk()}
                disabled={undoing}
                className="px-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-rose-300 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
              >
                {undoing ? "Undoing..." : `Undo (remove ${lastBulk.ids.length} just added)`}
              </button>
            )}
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
        <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto overscroll-contain p-3 sm:items-center sm:p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150">
          <div role="dialog" aria-modal="true" aria-label="Connect Gmail" className="my-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-lg space-y-5 overflow-y-auto overscroll-contain rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl relative dark:border-slate-800 dark:bg-slate-900 sm:max-h-[calc(100dvh-2rem)] sm:p-7">
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
                  Read-only keyword search, limited by the app to a maximum of 13 months
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
                  <strong>Read access and app-side limits:</strong> Google grants read-only access to Gmail messages; it does not restrict access to these results. With your updated consent, each scan you start searches up to 13 months across five subscription-related search categories, skips spam and trash, and processes matching messages in batches, up to 2,000 per run and 10,000 per scan, then stops and says coverage is partial. Results are never described as the whole inbox. A match may contain unrelated text.
                </li>
                <li>
                  <strong>Server processing:</strong> Matched message content is sent to our server for deterministic extraction. We do not intentionally persist raw message bodies; aggregate scan coverage is saved to your account and retained until you delete your account. Withdrawing consent stops future scans but does not delete prior coverage. This does not mean message data never leaves your device or that Google limits the scope to recent messages.
                </li>
                <li>
                  <strong>Manual scans only:</strong> We do not run background scans. The app requests only Gmail read-only scope and does not send, alter, or delete email.
                </li>
                <li>
                  <strong>Review and control:</strong> Extracted structured candidates are shown for your review; only confirmed records are saved. Imports are private to your account, and Settings/Import controls separately withdraw consent, disconnect Gmail, and delete Gmail-tagged records.
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
                I understand and consent to server-side processing of read-only Gmail message data for the subscription discovery described above, including the 13-month search window and aggregate coverage recording.
              </span>
            </label>

            {/* Connection Options */}
            <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              {gmailConfigured || gmailTokenAvailable ? (
                <button
                  type="button"
                  onClick={handleStartGoogleOAuth}
                  disabled={!modalConsent}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-black dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold text-xs shadow-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Mail className="w-4 h-4" />
                  <span>
                    {gmailTokenAvailable
                      ? "Accept Updated Consent"
                      : "Authorize with Google Account"}
                  </span>
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
