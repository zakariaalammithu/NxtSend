"use client";

/**
 * Create Campaign wizard — Closely's 4-step flow (P4 Stage 2):
 *
 *   1 Create campaign — name + description, LinkedIn/email account
 *     selects fed by the connected-accounts repository (migration
 *     011; demo mode offers the labelled demo accounts, live mode
 *     only real connected accounts — never invented ones) and the
 *     selected account's warm-up limits card.
 *   2 Audience — six Closely tabs. The two CSV tabs run the real,
 *     shared CSV import pipeline (imported people become leads +
 *     enrollments on this campaign). The four LinkedIn tabs store a
 *     source DEFINITION with the campaign behind an explicit
 *     "provider required" notice — no people are ever fabricated.
 *   3 Sequence — the Closely-style canvas builder (P4 Stage 3):
 *     template gallery, node canvas with condition branches, and the
 *     message editor drawer.
 *   4 Audience & Launch — audience + sequence review, Launch
 *     (status → active through the existing lifecycle) or Save as draft.
 *
 * "Save & Next" persists a draft through the campaigns repository at
 * every step, "Save as draft" is available at every step and lands on
 * the list's Drafts tab, and opening this page with ?campaignId=<id>
 * (the list's Edit action for drafts) resumes the wizard with the
 * campaign's stored data.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Linkedin,
  Mail,
  ArrowRight,
  ArrowLeft,
  X,
  Save,
  Rocket,
  FileSpreadsheet,
  ThumbsUp,
  CalendarDays,
  Users,
  CheckCircle2,
  AlertTriangle,
  Info,
} from "lucide-react";
import { DemoBanner, Modal } from "@/components/ui";
import {
  accountLimits,
  getAccountsRepository,
  getCampaignsRepository,
  getLeadsRepository,
  resolveSenderVars,
  resolveWorkspaceId,
  warmupStateOf,
} from "@/lib/data";
import {
  currentPhase,
  deriveStatus,
  effectiveCaps,
  phaseDay,
} from "@/lib/linkedin";
import { getUserSettingsRepository } from "@/lib/data/user-settings";
import { CsvImport } from "@/components/dashboard/CsvImport";
import type { CsvImportResult } from "@/lib/data/csv";
import { SequenceBuilder } from "@/components/dashboard/sequence/SequenceBuilder";
import {
  campaignStepToDraft,
  collectCustomFieldNames,
  countSteps,
  draftToPayload,
  leadToPreviewContact,
  stepLabel,
  type SequenceStepDraft,
} from "@/lib/sequence";
import { LinkedinSourceForm } from "@/components/dashboard/LinkedinSourceForm";
import {
  DEFAULT_WARMUP_LIMITS,
  WARMUP_LIMIT_ROWS,
  audienceSourceLabel,
  type LinkedinSourceType,
} from "@/lib/data/audience-source";
import type {
  CampaignAudienceSource,
  CampaignStatus,
  CampaignType,
  ConnectedAccount,
  Lead,
} from "@/types";

const STEPS = [
  { num: 1, title: "Create campaign" },
  { num: 2, title: "Audience" },
  { num: 3, title: "Sequence" },
  { num: 4, title: "Audience & Launch" },
] as const;

const STEP_HEADINGS: Record<number, string> = {
  1: "Name your campaign and choose accounts",
  2: "Choose people you would like to reach",
  3: "Build your sequence",
  4: "Review your audience and launch",
};

// A new campaign starts with an EMPTY sequence: Step 3 opens with the
// "Create a sequence" entry modal (template gallery / from scratch).
// Resuming a draft loads its stored steps instead (see the load effect).

type AudienceTabKey =
  | "linkedin_search"
  | "csv"
  | "post_engagement"
  | "event_attendees"
  | "group_members"
  | "my_network";

const AUDIENCE_TABS: Array<{
  key: AudienceTabKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}> = [
  { key: "linkedin_search", label: "LinkedIn Search", icon: Linkedin },
  { key: "csv", label: "Import from CSV", icon: FileSpreadsheet },
  { key: "post_engagement", label: "Post engagement", icon: ThumbsUp },
  { key: "event_attendees", label: "Event attendees", icon: CalendarDays },
  { key: "group_members", label: "Group members", icon: Users },
  { key: "my_network", label: "Import from CSV", icon: FileSpreadsheet, badge: "My Network" },
];

const LINKEDIN_TABS: LinkedinSourceType[] = [
  "linkedin_search",
  "post_engagement",
  "event_attendees",
  "group_members",
];

export default function NewCampaignWizardPage() {
  const router = useRouter();
  const campaignsRepo = React.useMemo(() => getCampaignsRepository(), []);
  const leadsRepo = React.useMemo(() => getLeadsRepository(), []);
  const accountsRepo = React.useMemo(() => getAccountsRepository(), []);
  const isDemo = campaignsRepo.mode === "demo";

  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = React.useState<string | null>(null);

  const [currentStep, setCurrentStep] = React.useState(1);
  const [campaignId, setCampaignId] = React.useState<string | null>(null);
  const [campaignStatus, setCampaignStatus] = React.useState<CampaignStatus>("draft");

  // Step 1
  const [campaignName, setCampaignName] = React.useState("");
  const [campaignDescription, setCampaignDescription] = React.useState("");
  const [linkedinAccount, setLinkedinAccount] = React.useState("");
  const [emailAccount, setEmailAccount] = React.useState("");
  const [accounts, setAccounts] = React.useState<ConnectedAccount[]>([]);
  const [profileName, setProfileName] = React.useState<string | null>(null);

  // Step 2
  const [activeTab, setActiveTab] = React.useState<AudienceTabKey>("linkedin_search");
  const [audienceSource, setAudienceSource] =
    React.useState<CampaignAudienceSource | null>(null);
  const [savedLinkedinSources, setSavedLinkedinSources] = React.useState<
    Partial<Record<LinkedinSourceType, CampaignAudienceSource>>
  >({});
  // The most recently saved LinkedIn source — Step 4 reviews it even
  // when the campaign's primary audience_source is a CSV import (the
  // record keeps one primary source; the review shows both honestly).
  const [lastLinkedinType, setLastLinkedinType] =
    React.useState<LinkedinSourceType | null>(null);
  const [importedLeads, setImportedLeads] = React.useState<Lead[]>([]);
  const [enrolledIds, setEnrolledIds] = React.useState<string[]>([]);
  const [workspaceLeads, setWorkspaceLeads] = React.useState<Lead[]>([]);

  // Step 3
  const [steps, setSteps] = React.useState<SequenceStepDraft[]>([]);

  // Chrome state
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [stepError, setStepError] = React.useState<string | null>(null);
  const [showExitConfirm, setShowExitConfirm] = React.useState(false);
  const baselineRef = React.useRef<string | null>(null);

  // -------------------------------------------------------------------------
  // Account options — the workspace's connected accounts (migration
  // 011), loaded through the accounts repository. Demo mode lists the
  // seeded demo accounts (labelled simulated); live mode lists only
  // accounts an integration actually connected — when none exist the
  // selects render the honest disabled "Not connected" option below.
  // Nothing is invented.
  // -------------------------------------------------------------------------
  const linkedinAccounts = accounts.filter((a) => a.channel === "linkedin");
  const emailAccounts = accounts.filter((a) => a.channel === "email");

  const accountOptionLabel = (a: ConnectedAccount): string =>
    `${a.display_name}${
      a.handle_or_email ? ` (${a.handle_or_email})` : ""
    }${a.status === "demo" ? " — demo account (simulated)" : ""}`;

  const linkedinOptions = linkedinAccounts.map((a) => ({
    value: a.id,
    label: accountOptionLabel(a),
  }));
  const emailOptions = emailAccounts.map((a) => ({
    value: a.id,
    label: accountOptionLabel(a),
  }));

  const selectedLinkedinAccount =
    linkedinAccounts.find((a) => a.id === linkedinAccount) ?? null;
  const selectedEmailAccount =
    emailAccounts.find((a) => a.id === emailAccount) ?? null;
  // The limits card and the persisted campaign snapshot both read the
  // SELECTED account's limits — never hardcoded defaults — when an
  // account is selected. While the account's warm-up PROGRAM binds
  // (warming/paused, migration 020) those are the EFFECTIVE caps —
  // min(stored daily limit, phase cap / override) from the engine —
  // and the snapshot also records the program day. Otherwise the
  // stored limits (merged over the defaults) apply as before.
  const selectedWarmupState = selectedLinkedinAccount
    ? warmupStateOf(selectedLinkedinAccount)
    : null;
  const wizardNow = new Date();
  const selectedWarmupStatus = selectedWarmupState
    ? deriveStatus(selectedWarmupState, wizardNow)
    : null;
  const selectedWarmupDay =
    selectedWarmupState &&
    (selectedWarmupStatus === "warming" || selectedWarmupStatus === "paused")
      ? phaseDay(selectedWarmupState, wizardNow)
      : null;
  const selectedWarmupPhase = selectedWarmupState
    ? currentPhase(selectedWarmupState, wizardNow)
    : null;
  // The program BINDS only with the master switch on (the executor
  // gate requires enabled AND warming) — the card must not present
  // phase caps as in force while the switch is off.
  const selectedWarmupBinds =
    selectedWarmupState !== null &&
    selectedWarmupState.enabled &&
    (selectedWarmupStatus === "warming" || selectedWarmupStatus === "paused");
  const selectedLimits =
    selectedLinkedinAccount && selectedWarmupState
      ? selectedWarmupBinds
        ? effectiveCaps(selectedWarmupState, wizardNow)
        : accountLimits(selectedLinkedinAccount)
      : DEFAULT_WARMUP_LIMITS;
  // The persisted snapshot pairs the effective caps with the program
  // day they came from — null whenever the program is not binding.
  const selectedWarmupSnapshotDay = selectedWarmupBinds
    ? selectedWarmupDay
    : null;

  // -------------------------------------------------------------------------
  // Load: workspace, leads, connected accounts — and resume when
  // ?campaignId= points at an existing campaign (drafts from the
  // list's Edit action).
  // -------------------------------------------------------------------------
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ws = await resolveWorkspaceId();
        if (cancelled) return;
        setWorkspaceId(ws);
        if (!ws) {
          setLoadError(
            "No workspace could be resolved for your account. Please sign in again."
          );
          setIsLoading(false);
          return;
        }
        const [leadRows, accountRows] = await Promise.all([
          leadsRepo.listLeads(ws),
          accountsRepo.listAccounts(ws),
        ]);
        if (cancelled) return;
        setWorkspaceLeads(leadRows);
        setAccounts(accountRows);
        // Default the LinkedIn select to the first LinkedIn account
        // (demo mode: the seeded demo account).
        const firstLinkedin = accountRows.find(
          (a) => a.channel === "linkedin"
        );
        if (firstLinkedin) setLinkedinAccount(firstLinkedin.id);
        // The signed-in profile is the sender-variable fallback when
        // a campaign has no account identity (see senderVars below).
        try {
          const settings = await getUserSettingsRepository().getSettings();
          if (!cancelled) setProfileName(settings.identity.full_name);
        } catch {
          // Profile is only a preview fallback — never block the wizard.
        }

        const resumeId = new URLSearchParams(window.location.search).get(
          "campaignId"
        );
        if (resumeId) {
          const [campaign, storedSteps, enrollments] = await Promise.all([
            campaignsRepo.getCampaign(ws, resumeId),
            campaignsRepo.getCampaignSteps(resumeId),
            campaignsRepo.listEnrollments(resumeId),
          ]);
          if (cancelled) return;
          if (campaign) {
            setCampaignId(campaign.id);
            setCampaignStatus(campaign.status);
            setCampaignName(campaign.name);
            setCampaignDescription(campaign.description ?? "");
            // Restore the campaign's accounts — but only when they
            // still exist (a deleted account leaves a null/stale id,
            // and the select must fall back, not point at a ghost).
            if (
              campaign.sender_account_id &&
              accountRows.some((a) => a.id === campaign.sender_account_id)
            ) {
              setLinkedinAccount(campaign.sender_account_id);
            }
            if (
              campaign.email_account_id &&
              accountRows.some((a) => a.id === campaign.email_account_id)
            ) {
              setEmailAccount(campaign.email_account_id);
            }
            setSteps(storedSteps.map((s) => campaignStepToDraft(s)));
            if (campaign.audience_source) {
              setAudienceSource(campaign.audience_source);
              if (
                LINKEDIN_TABS.includes(
                  campaign.audience_source.type as LinkedinSourceType
                )
              ) {
                const t = campaign.audience_source.type as LinkedinSourceType;
                setSavedLinkedinSources({ [t]: campaign.audience_source });
                setLastLinkedinType(t);
                setActiveTab(t);
              } else {
                setActiveTab(campaign.audience_source.type as AudienceTabKey);
              }
            }
            const leadById = new Map(leadRows.map((l) => [l.id, l]));
            const people = enrollments
              .map((e) => leadById.get(e.lead_id))
              .filter((l): l is Lead => Boolean(l));
            setImportedLeads(people);
            setEnrolledIds(enrollments.map((e) => e.lead_id));
          }
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Failed to load the wizard."
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------------------------------------------------------
  // Dirty tracking for the close-X confirm: a serialization of every
  // user-editable field, baselined after load and after each save.
  // -------------------------------------------------------------------------
  const serializeState = React.useCallback(() => {
    return JSON.stringify({
      name: campaignName,
      description: campaignDescription,
      linkedinAccount,
      emailAccount,
      steps,
      audienceSource,
      importedIds: importedLeads.map((l) => l.id).sort(),
    });
  }, [
    campaignName,
    campaignDescription,
    linkedinAccount,
    emailAccount,
    steps,
    audienceSource,
    importedLeads,
  ]);

  React.useEffect(() => {
    if (!isLoading && baselineRef.current === null) {
      baselineRef.current = serializeState();
    }
  }, [isLoading, serializeState]);

  const isDirty = baselineRef.current !== null && serializeState() !== baselineRef.current;

  // Step 3 canvas: the message editor's live preview cycles the
  // campaign's imported people (the builder falls back to clearly
  // labelled sample contacts when there are none), "My variables"
  // chips come from the custom fields on workspace leads (extra CSV
  // columns), and the {my_*} variables resolve from the SELECTED
  // account's sender identity — falling back to the signed-in user's
  // profile name, then to the templates' {my_*:fallback} syntax.
  const previewContacts = React.useMemo(
    () => importedLeads.map(leadToPreviewContact),
    [importedLeads]
  );
  const customFieldNames = React.useMemo(
    () =>
      collectCustomFieldNames(
        [...importedLeads, ...workspaceLeads].map(leadToPreviewContact)
      ),
    [importedLeads, workspaceLeads]
  );
  const senderVars = React.useMemo(
    () =>
      resolveSenderVars(
        selectedLinkedinAccount ?? selectedEmailAccount,
        profileName
      ),
    [selectedLinkedinAccount, selectedEmailAccount, profileName]
  );

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------
  const deriveType = (): CampaignType => {
    const hasEmail = steps.some((s) => s.step_type === "email");
    const hasLinkedIn = steps.some(
      (s) =>
        s.step_type === "connection_request" ||
        s.step_type === "linkedin_message" ||
        s.step_type === "like_post" ||
        s.step_type === "view_profile" ||
        s.step_type === "endorse_skills"
    );
    if (hasEmail && hasLinkedIn) return "mixed";
    if (hasEmail) return "email";
    if (hasLinkedIn) return "linkedin";
    if (linkedinAccount && emailAccount) return "mixed";
    if (emailAccount) return "email";
    if (linkedinAccount) return "linkedin";
    return "mixed";
  };

  const sourceForPersist = (): CampaignAudienceSource | null => {
    if (!audienceSource) {
      return importedLeads.length > 0
        ? { type: "csv", imported_count: importedLeads.length }
        : null;
    }
    if (audienceSource.type === "csv" || audienceSource.type === "my_network") {
      return { ...audienceSource, imported_count: importedLeads.length };
    }
    return audienceSource;
  };

  const persist = async (target: "draft" | "active"): Promise<string> => {
    if (!workspaceId) {
      throw new Error(
        "No workspace could be resolved for your account. Please sign in again."
      );
    }
    if (!campaignName.trim()) {
      throw new Error("Give your campaign a name first.");
    }
    const type = deriveType();
    // draftToPayload carries each step's config — including a
    // condition step's Yes/No branch step-lists — through to storage.
    const stepsPayload = steps.map((s) => draftToPayload(s));
    const source = sourceForPersist();
    let id = campaignId;

    if (!id) {
      const created = await campaignsRepo.createCampaign(workspaceId, {
        name: campaignName.trim(),
        type,
        status: target,
        steps: stepsPayload,
        description: campaignDescription,
        audience_source: source,
        warmup_limits: selectedLimits,
        warmup_day: selectedWarmupSnapshotDay,
        sender_account_id: linkedinAccount || null,
        email_account_id: emailAccount || null,
      });
      id = created.id;
      setCampaignId(id);
      setCampaignStatus(target);
    } else {
      await campaignsRepo.updateCampaign(id, {
        name: campaignName.trim(),
        type,
        description: campaignDescription,
        audience_source: source,
        warmup_limits: selectedLimits,
        warmup_day: selectedWarmupSnapshotDay,
        sender_account_id: linkedinAccount || null,
        email_account_id: emailAccount || null,
      });
      await campaignsRepo.replaceCampaignSteps(id, stepsPayload);
      if (target === "active" && campaignStatus !== "active") {
        await campaignsRepo.setCampaignStatus(workspaceId, id, "active");
        setCampaignStatus("active");
      }
    }

    // Enroll any imported people not yet enrolled on this campaign.
    const pendingIds = importedLeads
      .map((l) => l.id)
      .filter((leadId) => !enrolledIds.includes(leadId));
    if (pendingIds.length > 0) {
      await campaignsRepo.enrollLeads(workspaceId, id, pendingIds);
      setEnrolledIds((prev) => [...prev, ...pendingIds]);
    }

    // Launching activates the enrollments too (the executor picks up
    // active campaigns; enrollment rows flip pending → active here,
    // exactly as a first executor run would leave them).
    if (target === "active") {
      const enrollments = await campaignsRepo.listEnrollments(id);
      await Promise.all(
        enrollments
          .filter((e) => e.status === "pending")
          .map((e) =>
            campaignsRepo.updateEnrollment(e.id, { status: "active" })
          )
      );
    }

    baselineRef.current = serializeState();
    return id;
  };

  const runSave = async (
    target: "draft" | "active",
    after?: (id: string) => void
  ) => {
    setIsSaving(true);
    setSaveError(null);
    setStepError(null);
    try {
      const id = await persist(target);
      after?.(id);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to save the campaign."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAndNext = () => {
    if (currentStep === 1 && !campaignName.trim()) {
      setStepError("A campaign name is required to continue.");
      return;
    }
    void runSave("draft", () => setCurrentStep((s) => Math.min(4, s + 1)));
  };

  const handleSaveAsDraft = () => {
    if (!campaignName.trim()) {
      setCurrentStep(1);
      setStepError("A campaign name is required to save a draft.");
      return;
    }
    void runSave("draft", () => router.push("/dashboard/campaigns?tab=drafts"));
  };

  const handleLaunch = () => {
    if (!campaignName.trim()) {
      setCurrentStep(1);
      setStepError("A campaign name is required to launch.");
      return;
    }
    if (steps.length < 1) {
      setCurrentStep(3);
      setSaveError(
        "Add at least one sequence step before launching — a draft can be saved with none."
      );
      return;
    }
    void runSave("active", (id) => router.push(`/dashboard/campaigns/${id}`));
  };

  const handleClose = () => {
    if (isDirty) {
      setShowExitConfirm(true);
    } else {
      router.push("/dashboard/campaigns");
    }
  };

  // -------------------------------------------------------------------------
  // Audience handlers
  // -------------------------------------------------------------------------
  const handleCsvImported =
    (variantType: "csv" | "my_network") =>
    (created: Lead[], _result: CsvImportResult, fileName: string) => {
      if (created.length > 0) {
        setImportedLeads((prev) => {
          const known = new Set(prev.map((l) => l.id));
          return [...prev, ...created.filter((l) => !known.has(l.id))];
        });
        setWorkspaceLeads((prev) => {
          const known = new Set(prev.map((l) => l.id));
          return [...created.filter((l) => !known.has(l.id)), ...prev];
        });
      }
      setAudienceSource({
        type: variantType,
        file_name: fileName,
        imported_count: importedLeads.length + created.length,
      });
    };

  const handleLinkedinSourceSave = (source: CampaignAudienceSource) => {
    setSavedLinkedinSources((prev) => ({ ...prev, [source.type]: source }));
    setLastLinkedinType(source.type as LinkedinSourceType);
    setAudienceSource(source);
  };

  const handleRemovePerson = async (lead: Lead) => {
    setImportedLeads((prev) => prev.filter((l) => l.id !== lead.id));
    if (campaignId && enrolledIds.includes(lead.id)) {
      try {
        await campaignsRepo.removeEnrollment(campaignId, lead.id);
        setEnrolledIds((prev) => prev.filter((id) => id !== lead.id));
      } catch (err) {
        setSaveError(
          err instanceof Error
            ? err.message
            : "Failed to remove that person from the campaign."
        );
      }
    }
  };

  const existingForImport = React.useMemo(() => {
    const byId = new Map<string, Lead>();
    for (const l of [...workspaceLeads, ...importedLeads]) byId.set(l.id, l);
    return Array.from(byId.values());
  }, [workspaceLeads, importedLeads]);

  const audienceSummary = importedLeads.length > 0
    ? `${importedLeads.length} ${importedLeads.length === 1 ? "person" : "people"} imported`
    : audienceSource
      ? `Source: ${audienceSourceLabel(audienceSource.type)}`
      : "No audience yet";

  // Step 4's LinkedIn source review: the campaign's primary source when
  // it is a LinkedIn definition, otherwise the most recently saved one.
  const linkedinSourceToShow: CampaignAudienceSource | null =
    audienceSource &&
    LINKEDIN_TABS.includes(audienceSource.type as LinkedinSourceType)
      ? audienceSource
      : lastLinkedinType
        ? (savedLinkedinSources[lastLinkedinType] ?? null)
        : null;

  const personName = (l: Lead) =>
    [l.first_name, l.last_name].filter(Boolean).join(" ") || "Unnamed lead";

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto pb-16">
        <div className="glass-card p-10 text-center text-14 text-black-300">
          Loading the campaign wizard…
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-5xl mx-auto pb-16 space-y-6">
        <DemoBanner feature="Campaign Engine" />
        <div className="glass-card p-8">
          <div className="rounded-xl border border-rose-500/40 bg-rose-950/20 px-4 py-3 text-13 text-rose-200 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{loadError}</span>
          </div>
          <Link
            href="/dashboard/campaigns"
            className="inline-flex items-center gap-2 mt-5 text-13 text-purple-300 hover:text-purple-200"
          >
            <ArrowLeft className="h-4 w-4" /> Back to campaigns
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      <DemoBanner feature="Campaign Engine" />

      {/* Wizard chrome — Closely-style bar: heading + stepper + Save & Next + X */}
      <div className="glass-card px-4 sm:px-5 py-3.5">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="min-w-0 mr-auto">
            <p className="text-12 text-black-400 truncate">
              {campaignName.trim() || "New campaign"}
              {campaignId && (
                <span className="demo-badge ml-2">
                  {campaignStatus === "draft" ? "Draft" : campaignStatus}
                </span>
              )}
            </p>
            <h1 className="text-15 sm:text-16 font-bold text-white truncate">
              {STEP_HEADINGS[currentStep]}
            </h1>
            {currentStep >= 2 && (
              <p className="text-11 text-black-400">{audienceSummary}</p>
            )}
          </div>

          <ol className="flex items-center gap-1 sm:gap-1.5 order-3 sm:order-none w-full sm:w-auto justify-center">
            {STEPS.map((s, idx) => (
              <li key={s.num} className="flex items-center gap-1 sm:gap-1.5">
                <button
                  type="button"
                  disabled={s.num >= currentStep}
                  onClick={() => s.num < currentStep && setCurrentStep(s.num)}
                  className={`flex items-center gap-2 rounded-full py-1 pr-2.5 pl-1 transition-colors ${
                    s.num < currentStep ? "hover:bg-black-700/60 cursor-pointer" : "cursor-default"
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-11 font-bold ${
                      currentStep === s.num
                        ? "bg-purple-600 text-white shadow-glow-purple"
                        : currentStep > s.num
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                          : "bg-black-700 text-black-400"
                    }`}
                  >
                    {currentStep > s.num ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      s.num
                    )}
                  </span>
                  <span
                    className={`text-12 font-medium hidden md:inline ${
                      currentStep === s.num ? "text-white" : "text-black-400"
                    }`}
                  >
                    {s.title}
                  </span>
                </button>
                {idx < STEPS.length - 1 && (
                  <span className="text-black-500 text-12">›</span>
                )}
              </li>
            ))}
          </ol>

          <div className="flex items-center gap-2">
            {currentStep < 4 && (
              <button
                type="button"
                onClick={handleSaveAndNext}
                disabled={isSaving}
                data-testid="wizard-save-next"
                className="inline-flex items-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 px-4 py-2 text-13 font-semibold text-white shadow-glow-purple transition-all disabled:opacity-50"
              >
                <span>
                  {isSaving
                    ? "Saving…"
                    : `Save & Next: ${STEPS[currentStep].title}`}
                </span>
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close wizard"
              data-testid="wizard-close"
              className="h-9 w-9 flex items-center justify-center rounded-xl text-black-300 hover:text-white hover:bg-black-700 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {saveError && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-950/20 px-4 py-3 text-13 text-rose-200 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {/* ============================ STEP 1 ============================ */}
      {currentStep === 1 && (
        <div className="glass-card p-6 sm:p-8 space-y-7">
          <div>
            <label className="block text-14 font-semibold text-white mb-1.5">
              Campaign name <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={campaignName}
              onChange={(e) => {
                setCampaignName(e.target.value);
                setStepError(null);
              }}
              placeholder="Name your campaign"
              className="input-field max-w-xl"
              data-testid="wizard-campaign-name"
            />
            {stepError && (
              <p className="mt-1.5 text-12 text-rose-300">{stepError}</p>
            )}
          </div>

          <div>
            <label className="block text-13 font-medium text-black-200 mb-1.5">
              Description (optional)
            </label>
            <textarea
              value={campaignDescription}
              onChange={(e) => setCampaignDescription(e.target.value)}
              rows={3}
              placeholder="What is this campaign trying to achieve? The description is saved with the campaign."
              className="input-field resize-none max-w-xl"
              data-testid="wizard-campaign-description"
            />
            {!isDemo && (
              <p className="mt-1.5 text-11 text-black-400 flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 shrink-0" />
                The description is saved with the campaign (in the
                campaign&apos;s config, migration 011).
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* LinkedIn account + warm-up limits */}
            <div className="space-y-4">
              <div>
                <h3 className="text-14 font-semibold text-white mb-2">
                  Select LinkedIn account
                </h3>
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0a66c2]/20 border border-[#0a66c2]/40">
                    <Linkedin className="h-5 w-5 text-[#4b9be0]" />
                  </span>
                  <div className="flex-1 space-y-2">
                    {linkedinOptions.length > 0 ? (
                      <select
                        value={linkedinAccount}
                        onChange={(e) => setLinkedinAccount(e.target.value)}
                        className="input-field"
                        data-testid="wizard-linkedin-account"
                      >
                        {linkedinOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <>
                        <select disabled className="input-field opacity-60" data-testid="wizard-linkedin-account">
                          <option>Not connected — connect in Integrations</option>
                        </select>
                        <Link
                          href="/dashboard/integrations"
                          className="text-12 text-purple-300 hover:text-purple-200"
                        >
                          Open the Integration Center →
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Account-limits card — the SELECTED account's stored
                  warm-up state + daily limits (defaults only when no
                  account is selected, e.g. live mode unconnected). */}
              {selectedLinkedinAccount ? (
                <div
                  className="rounded-2xl border border-dashed border-black-600 bg-black-800/50 p-5 space-y-3"
                  data-testid="wizard-account-limits"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-13 font-semibold text-white">
                      LinkedIn account limits
                    </h4>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-11 font-medium border ${
                        selectedLinkedinAccount.warmup_enabled
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                          : "border-black-600 bg-black-800 text-black-300"
                      }`}
                    >
                      {selectedLinkedinAccount.warmup_enabled
                        ? "Warm-up on"
                        : "Warm-up off"}
                    </span>
                    {selectedWarmupBinds && selectedWarmupDay !== null && (
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-11 font-medium border border-purple-500/40 bg-purple-500/10 text-purple-300"
                        data-testid="wizard-warmup-chip"
                      >
                        {selectedWarmupStatus === "paused"
                          ? `Warm-up paused · Day ${selectedWarmupDay}`
                          : `Warming · Day ${selectedWarmupDay}${
                              selectedWarmupPhase
                                ? ` (Phase ${selectedWarmupPhase.index + 1})`
                                : ""
                            }`}
                      </span>
                    )}
                    {selectedLinkedinAccount.status === "demo" && (
                      <span className="demo-badge">Demo account</span>
                    )}
                  </div>
                  <p className="text-12 text-black-300 leading-relaxed">
                    <strong className="text-black-100">
                      {selectedLinkedinAccount.warmup_enabled
                        ? `Warm-up mode is on for ${selectedLinkedinAccount.display_name}.`
                        : `Warm-up mode is off for ${selectedLinkedinAccount.display_name}.`}
                    </strong>{" "}
                    {selectedWarmupBinds ? (
                      <>
                        This account is in a warm-up program, so the
                        numbers below are{" "}
                        <strong className="text-black-100">
                          today&apos;s effective caps
                        </strong>{" "}
                        — the lower of the account&apos;s stored daily
                        limits and the current phase&apos;s caps. Steps
                        beyond today&apos;s cap stay due; they are not
                        dropped.
                      </>
                    ) : (
                      <>
                        We&apos;ll gradually increase the number of daily
                        connections, messages, profiles views, posts likes,
                        skills endorses and find emails. These are the{" "}
                        <strong className="text-black-100">
                          daily limits stored on the selected account
                        </strong>
                        .
                      </>
                    )}
                  </p>
                  <p className="text-12 font-semibold text-black-200">
                    Maximum number of LinkedIn actions per day:
                  </p>
                  <ul className="space-y-1.5">
                    {WARMUP_LIMIT_ROWS.map((row) => (
                      <li key={row.key} className="flex items-baseline gap-3 text-12">
                        <span className="w-6 shrink-0 text-14 font-bold text-purple-300">
                          {selectedLimits[row.key]}
                        </span>
                        <span className="text-black-300">
                          <span className="text-black-100">{row.label}.</span>{" "}
                          {row.growthNote}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/dashboard/accounts"
                    className="inline-block text-12 text-purple-300 hover:text-purple-200"
                    data-testid="wizard-manage-limits"
                  >
                    Manage account limits →
                  </Link>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-black-600 bg-black-800/50 p-5 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-13 font-semibold text-white">
                      LinkedIn account limits
                    </h4>
                    <span className="demo-badge">Defaults</span>
                  </div>
                  <p className="text-12 text-black-300 leading-relaxed">
                    <strong className="text-black-100">Warm-up mode is on.</strong>{" "}
                    We&apos;ll gradually increase the number of daily connections,
                    messages, profiles views, posts likes, skills endorses and find
                    emails. These are the <strong className="text-black-100">default
                    warm-up limits</strong> that will apply once an account is
                    connected — connect an account to store per-account limits
                    on it.
                  </p>
                  <p className="text-12 font-semibold text-black-200">
                    Maximum number of LinkedIn actions per day:
                  </p>
                  <ul className="space-y-1.5">
                    {WARMUP_LIMIT_ROWS.map((row) => (
                      <li key={row.key} className="flex items-baseline gap-3 text-12">
                        <span className="w-6 shrink-0 text-14 font-bold text-purple-300">
                          {DEFAULT_WARMUP_LIMITS[row.key]}
                        </span>
                        <span className="text-black-300">
                          <span className="text-black-100">{row.label}.</span>{" "}
                          {row.growthNote}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Email account */}
            <div className="space-y-4">
              <div>
                <h3 className="text-14 font-semibold text-white mb-2">
                  Select email account to use to send emails
                </h3>
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600/15 border border-emerald-500/30">
                    <Mail className="h-5 w-5 text-emerald-400" />
                  </span>
                  <div className="flex-1 space-y-2">
                    {emailOptions.length > 0 ? (
                      <select
                        value={emailAccount}
                        onChange={(e) => setEmailAccount(e.target.value)}
                        className="input-field"
                        data-testid="wizard-email-account"
                      >
                        <option value="">No account selected</option>
                        {emailOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <>
                        <select disabled className="input-field opacity-60" data-testid="wizard-email-account">
                          <option>Not connected — connect in Integrations</option>
                        </select>
                        <Link
                          href="/dashboard/integrations"
                          className="text-12 text-purple-300 hover:text-purple-200"
                        >
                          Open the Integration Center →
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-dashed border-black-600 bg-black-800/50 p-5">
                <p className="text-12 text-black-300 leading-relaxed">
                  Select an email account if you want to launch an email campaign.
                  Email steps send through the connected provider
                  {isDemo ? " — simulated in Demo Mode" : ""}; LinkedIn steps are
                  recorded, never faked, until an authorized LinkedIn provider is
                  connected.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================ STEP 2 ============================ */}
      {currentStep === 2 && (
        <div className="glass-card overflow-hidden">
          {/* Audience tabs — all panels stay mounted so switching tabs
              never loses typed URLs, counts or CSV progress. */}
          <div
            className="flex overflow-x-auto border-b border-black-700"
            role="tablist"
            aria-label="Audience source"
          >
            {AUDIENCE_TABS.map((tab) => (
              <button
                key={tab.key + (tab.badge ?? "")}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                data-testid={`audience-tab-${tab.key}${tab.badge ? "-network" : ""}`}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 sm:px-5 py-3.5 text-13 font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                  activeTab === tab.key
                    ? "border-purple-500 text-white bg-purple-600/10"
                    : "border-transparent text-black-300 hover:text-white"
                }`}
              >
                <tab.icon className="h-4 w-4 shrink-0" />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className="demo-badge text-10 py-0 px-1.5">{tab.badge}</span>
                )}
              </button>
            ))}
          </div>

          <div className="p-6 sm:p-8">
            {LINKEDIN_TABS.map((t) => (
              <div key={t} className={activeTab === t ? "" : "hidden"}>
                <LinkedinSourceForm
                  type={t}
                  savedSource={savedLinkedinSources[t] ?? null}
                  onSave={handleLinkedinSourceSave}
                />
              </div>
            ))}

            <div className={activeTab === "csv" ? "" : "hidden"}>
              <CsvImport
                workspaceId={workspaceId}
                isDemo={isDemo}
                existingLeads={existingForImport}
                onImported={handleCsvImported("csv")}
                audienceCount={importedLeads.length}
              />
            </div>

            <div className={activeTab === "my_network" ? "" : "hidden"}>
              <CsvImport
                workspaceId={workspaceId}
                isDemo={isDemo}
                existingLeads={existingForImport}
                onImported={handleCsvImported("my_network")}
                variant="my-network"
                audienceCount={importedLeads.length}
              />
            </div>
          </div>
        </div>
      )}

      {/* ============================ STEP 3 ============================ */}
      {currentStep === 3 && (
        <div className="glass-card p-6 sm:p-8">
          <SequenceBuilder
            steps={steps}
            onStepsChange={setSteps}
            campaignName={campaignName}
            campaignDescription={campaignDescription}
            previewContacts={previewContacts}
            customFieldNames={customFieldNames}
            sender={senderVars}
          />
          {steps.length < 1 && (
            <p className="mt-4 text-12 text-amber-300 flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5 shrink-0" />
              This draft has no steps — you can save it, but launching requires
              at least one step.
            </p>
          )}
        </div>
      )}

      {/* ============================ STEP 4 ============================ */}
      {currentStep === 4 && (
        <div className="space-y-6">
          {/* Warm-up disclosure (NOT a block): launching is allowed;
              the sender's program simply paces the sends. */}
          {selectedWarmupBinds &&
            selectedWarmupStatus === "warming" &&
            selectedLinkedinAccount &&
            selectedWarmupDay !== null && (
              <div
                className="rounded-2xl border border-amber-500/40 bg-amber-950/20 px-5 py-4"
                data-testid="wizard-warmup-banner"
              >
                <p className="text-13 text-amber-100 leading-relaxed">
                  <strong>{selectedLinkedinAccount.display_name}</strong>{" "}
                  is on day {selectedWarmupDay} of its warm-up program:
                  at most {selectedLimits.connection_requests} connection
                  requests and {selectedLimits.messages} messages per day
                  will go out from this account; the rest stay due —
                  nothing is dropped. You can launch now and let the
                  program pace the sends, or manage the program on the{" "}
                  <Link
                    href="/dashboard/accounts"
                    className="underline underline-offset-2"
                  >
                    Accounts page
                  </Link>
                  .
                </p>
              </div>
            )}
          <div className="glass-card p-6 sm:p-8 space-y-4">
            <h2 className="text-18 font-bold text-white">Audience</h2>

            {importedLeads.length > 0 && (
              <div className="space-y-3">
                <p className="text-13 text-black-300">
                  <strong className="text-white">{importedLeads.length}</strong>{" "}
                  {importedLeads.length === 1 ? "person" : "people"} imported
                  {audienceSource?.file_name
                    ? ` from ${audienceSource.file_name}`
                    : ""}{" "}
                  — enrolled in this campaign when you save or launch.
                </p>
                <ul
                  className="max-h-80 overflow-y-auto divide-y divide-black-700/60 rounded-xl border border-black-700"
                  data-testid="wizard-audience-list"
                >
                  {importedLeads.map((lead) => (
                    <li
                      key={lead.id}
                      className="flex items-center gap-3 px-4 py-2.5"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-600/20 border border-purple-500/30 text-11 font-bold text-purple-200">
                        {(lead.first_name?.[0] ?? "?").toUpperCase()}
                        {(lead.last_name?.[0] ?? "").toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-13 font-medium text-white truncate">
                          {personName(lead)}
                          {lead.job_title && (
                            <span className="text-black-400 font-normal">
                              {" "}· {lead.job_title}
                            </span>
                          )}
                        </span>
                        <span className="block text-11 text-black-400 truncate">
                          {lead.company ?? ""}
                          {lead.company && (lead.email ?? lead.linkedin_url)
                            ? " · "
                            : ""}
                          {lead.email ?? lead.linkedin_url ?? ""}
                        </span>
                      </span>
                      {enrolledIds.includes(lead.id) && (
                        <span className="demo-badge shrink-0">Enrolled</span>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleRemovePerson(lead)}
                        aria-label={`Remove ${personName(lead)}`}
                        data-testid={`remove-person-${lead.id}`}
                        className="h-7 w-7 shrink-0 flex items-center justify-center rounded-lg text-black-400 hover:text-rose-400 hover:bg-rose-950/20"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {linkedinSourceToShow && (
              <div className="rounded-2xl border border-black-700 bg-black-800/60 p-4 space-y-1.5">
                <p className="text-13 font-semibold text-white">
                  {audienceSourceLabel(linkedinSourceToShow.type)} source saved
                </p>
                <p className="text-12 text-black-300 break-all">{linkedinSourceToShow.url}</p>
                <p className="text-12 text-black-300">
                  Up to {linkedinSourceToShow.requested_count?.toLocaleString()} people
                  requested.
                </p>
                <p className="text-12 text-amber-300 flex items-start gap-1.5">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  Collection starts when an authorized LinkedIn provider is
                  connected — no people have been collected from this link yet.
                </p>
              </div>
            )}

            {importedLeads.length === 0 && !audienceSource && !linkedinSourceToShow && (
              <div className="rounded-2xl border border-dashed border-black-600 bg-black-800/50 p-5 space-y-2">
                <p className="text-13 text-black-300">
                  No audience added yet. You can launch with an empty audience
                  and enroll people later from the Leads page, or go back and
                  add people now.
                </p>
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="text-13 text-purple-300 hover:text-purple-200"
                >
                  ← Add an audience
                </button>
              </div>
            )}
          </div>

          <div className="glass-card p-6 sm:p-8 space-y-4">
            <h2 className="text-18 font-bold text-white">Sequence</h2>
            {steps.length === 0 ? (
              <p className="text-13 text-rose-300">
                No steps — launching is blocked until you add at least one step
                in Step 3.
              </p>
            ) : (
              <>
                <p className="text-13 text-black-300">
                  <strong className="text-white">{countSteps(steps)}</strong>{" "}
                  {countSteps(steps) === 1 ? "step" : "steps"} in the main
                  flow and its branches:
                </p>
                <ol className="space-y-2">
                  {steps.map((s, i) => (
                    <li
                      key={s.id}
                      className="flex items-center gap-3 rounded-xl border border-black-700 bg-black-800/60 px-4 py-2.5"
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-black-700 text-11 font-bold text-white">
                        {i + 1}
                      </span>
                      <span className="text-13 text-white capitalize">
                        {s.step_type.replace("_", " ")}
                      </span>
                      <span className="text-12 text-black-400 truncate">
                        {s.subject || stepLabel(s)}
                      </span>
                      <span className="ml-auto text-11 text-black-400 shrink-0">
                        {s.delay_hours > 0 ? `after ${s.delay_hours}h` : "immediately"}
                      </span>
                    </li>
                  ))}
                </ol>
              </>
            )}
            <p className="text-12 text-black-400 flex items-start gap-1.5">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              On launch the campaign becomes active and its enrollments
              activate. Email steps send for real through the connected
              provider{isDemo ? " (simulated in Demo Mode)" : ""}; LinkedIn
              steps are recorded as skipped — never faked — until an
              authorized LinkedIn provider is connected.
            </p>
          </div>
        </div>
      )}

      {/* Footer navigation — present on every step */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          {currentStep > 1 && (
            <button
              type="button"
              onClick={() => setCurrentStep((s) => Math.max(1, s - 1))}
              data-testid="wizard-back"
              className="inline-flex items-center gap-2 rounded-xl bg-black-800 hover:bg-black-700 border border-black-600 px-5 py-2.5 text-13 font-medium text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSaveAsDraft}
            disabled={isSaving}
            data-testid="wizard-save-draft"
            className="inline-flex items-center gap-2 rounded-xl bg-black-800 hover:bg-black-700 border border-black-600 px-5 py-2.5 text-13 font-medium text-white transition-colors disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            <span>{isSaving ? "Saving…" : "Save as draft"}</span>
          </button>
          {currentStep < 4 ? (
            <button
              type="button"
              onClick={handleSaveAndNext}
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 px-6 py-2.5 text-14 font-semibold text-white shadow-glow-purple transition-all disabled:opacity-50"
            >
              <span>
                {isSaving ? "Saving…" : `Save & Next: ${STEPS[currentStep].title}`}
              </span>
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleLaunch}
              disabled={isSaving}
              data-testid="wizard-launch"
              className="inline-flex items-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 px-7 py-3 text-14 font-semibold text-white shadow-glow-purple transition-all disabled:opacity-50"
            >
              <Rocket className="h-4 w-4" />
              <span>{isSaving ? "Launching…" : "Launch campaign"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Unsaved-changes confirm for the close X */}
      <Modal
        isOpen={showExitConfirm}
        onClose={() => setShowExitConfirm(false)}
        title="Unsaved changes"
      >
        <div className="space-y-5">
          <p className="text-13 text-black-300 leading-relaxed">
            You have changes in this wizard that have not been saved as a draft
            yet. Save them as a draft before leaving, or discard them.
          </p>
          <div className="flex justify-end gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => setShowExitConfirm(false)}
              className="rounded-xl bg-black-800 hover:bg-black-700 px-4 py-2 text-13 font-medium text-white"
            >
              Keep editing
            </button>
            <button
              type="button"
              onClick={() => router.push("/dashboard/campaigns")}
              className="rounded-xl bg-rose-950/40 border border-rose-500/40 hover:bg-rose-950/70 px-4 py-2 text-13 font-medium text-rose-200"
            >
              Discard changes
            </button>
            <button
              type="button"
              disabled={!campaignName.trim() || isSaving}
              onClick={() => {
                setShowExitConfirm(false);
                handleSaveAsDraft();
              }}
              className="rounded-xl bg-purple-600 hover:bg-purple-500 px-4 py-2 text-13 font-semibold text-white shadow-glow-purple disabled:opacity-40"
            >
              Save draft &amp; exit
            </button>
          </div>
          {!campaignName.trim() && (
            <p className="text-11 text-black-400">
              A campaign name is required before a draft can be saved.
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
