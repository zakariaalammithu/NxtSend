"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Play, Pause, Archive, Target, Users, MessageSquare, Mail, Linkedin, CheckCircle2, Pencil, Save, X } from "lucide-react";
import { DemoBanner, Badge } from "@/components/ui";
import { StatsCard } from "@/components/dashboard/StatsCard";
import {
  getAccountsRepository,
  getCampaignsRepository,
  getInboxRepository,
  getLeadsRepository,
  loadCampaignStats,
  resolveSenderVars,
  resolveWorkspaceId,
  type ActivityEntry,
  type CampaignStats,
  type EnrollmentRecord,
} from "@/lib/data";
import { getUserSettingsRepository } from "@/lib/data/user-settings";
import { SequenceBuilder } from "@/components/dashboard/sequence/SequenceBuilder";
import {
  campaignStepToDraft,
  collectCustomFieldNames,
  draftToPayload,
  leadToPreviewContact,
  type SequenceStepDraft,
} from "@/lib/sequence";
import { formatDate } from "@/lib/utils";
import { runDemoSequenceScan } from "@/lib/executor/demo-runner";
import type { ExecutorRunSummary } from "@/lib/executor/types";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { Campaign, CampaignStatus, CampaignStep, CampaignType, ConnectedAccount, Lead } from "@/types";

function AnalyticsTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl bg-black-800/80 p-3.5 border border-black-700">
      <span className="text-black-400 text-11 block">{label}</span>
      <span className="font-semibold text-white text-18 mt-0.5 block">
        {value}
      </span>
      {hint && <span className="text-11 text-black-500 block mt-0.5">{hint}</span>}
    </div>
  );
}

export default function CampaignDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const campaignsRepo = React.useMemo(() => getCampaignsRepository(), []);
  const leadsRepo = React.useMemo(() => getLeadsRepository(), []);
  const inboxRepo = React.useMemo(() => getInboxRepository(), []);
  const accountsRepo = React.useMemo(() => getAccountsRepository(), []);
  const isDemo = campaignsRepo.mode === "demo";

  const [workspaceId, setWorkspaceId] = React.useState<string | null>(null);
  const [campaign, setCampaign] = React.useState<Campaign | null>(null);
  // The campaign's sender account (for the sequence drawer's {my_*}
  // preview) + the signed-in profile name as its fallback.
  const [senderAccount, setSenderAccount] =
    React.useState<ConnectedAccount | null>(null);
  const [profileName, setProfileName] = React.useState<string | null>(null);
  const [steps, setSteps] = React.useState<CampaignStep[]>([]);
  const [activity, setActivity] = React.useState<ActivityEntry[]>([]);
  const [enrollments, setEnrollments] = React.useState<EnrollmentRecord[]>([]);
  const [stats, setStats] = React.useState<CampaignStats | null>(null);
  const [leadsById, setLeadsById] = React.useState<Map<string, Lead>>(new Map());
  const [isLoading, setIsLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  // Sequence executor (demo runner) state
  const [execRunning, setExecRunning] = React.useState(false);
  const [execSummary, setExecSummary] = React.useState<ExecutorRunSummary | null>(null);
  const [execError, setExecError] = React.useState<string | null>(null);

  const handleRunDueSteps = async () => {
    if (!workspaceId || !id) return;
    setExecRunning(true);
    setExecError(null);
    try {
      const summary = await runDemoSequenceScan(workspaceId);
      setExecSummary(summary);
      await loadAll(workspaceId, id);
    } catch (err) {
      setExecError(
        err instanceof Error ? err.message : "The demo sequence run failed."
      );
    } finally {
      setExecRunning(false);
    }
  };

  const [activeTab, setActiveTab] = React.useState<
    "overview" | "sequence" | "leads" | "analytics"
  >("overview");

  // Edit state (name/type — the sequence itself is edited on the
  // Sequence tab's canvas, P4 Stage 3)
  const [isEditing, setIsEditing] = React.useState(false);
  const [editName, setEditName] = React.useState("");
  const [editType, setEditType] = React.useState<CampaignType>("linkedin");
  const [isSaving, setIsSaving] = React.useState(false);

  // Sequence canvas state: drafts mirror the stored steps once loaded;
  // "Save sequence" writes them back through replaceCampaignSteps.
  const [seqDrafts, setSeqDrafts] = React.useState<SequenceStepDraft[] | null>(null);
  const [savedSeqJson, setSavedSeqJson] = React.useState<string>("");
  const [seqSaving, setSeqSaving] = React.useState(false);
  const [seqError, setSeqError] = React.useState<string | null>(null);
  const [seqNotice, setSeqNotice] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (seqDrafts === null && campaign) {
      const drafts = steps.map(campaignStepToDraft);
      setSeqDrafts(drafts);
      setSavedSeqJson(JSON.stringify(drafts));
    }
  }, [steps, campaign, seqDrafts]);

  const seqDirty =
    seqDrafts !== null && JSON.stringify(seqDrafts) !== savedSeqJson;

  const seqPreviewContacts = React.useMemo(() => {
    const enrolled = enrollments
      .map((e) => leadsById.get(e.lead_id))
      .filter((l): l is Lead => Boolean(l));
    return enrolled.map(leadToPreviewContact);
  }, [enrollments, leadsById]);

  const seqCustomFieldNames = React.useMemo(
    () =>
      collectCustomFieldNames(
        Array.from(leadsById.values()).map(leadToPreviewContact)
      ),
    [leadsById]
  );

  // {my_*} preview variables: the campaign's sender account identity
  // first, then the signed-in profile, then template fallbacks.
  const seqSenderVars = React.useMemo(
    () => resolveSenderVars(senderAccount, profileName),
    [senderAccount, profileName]
  );

  const handleSaveSequence = async () => {
    if (!workspaceId || !campaign || !seqDrafts) return;
    setSeqSaving(true);
    setSeqError(null);
    setSeqNotice(null);
    try {
      const savedSteps = await campaignsRepo.replaceCampaignSteps(
        campaign.id,
        seqDrafts.map(draftToPayload)
      );
      await campaignsRepo
        .appendActivity(workspaceId, {
          campaign_id: campaign.id,
          action: "campaign_updated",
          details: `Campaign "${campaign.name}" sequence edited on the canvas (${savedSteps.length} top-level steps).`,
        })
        .catch(() => undefined);
      const drafts = savedSteps.map(campaignStepToDraft);
      setSteps(savedSteps);
      setSeqDrafts(drafts);
      setSavedSeqJson(JSON.stringify(drafts));
      setActivity(await campaignsRepo.listActivity(workspaceId, campaign.id));
      setSeqNotice("Sequence saved.");
    } catch (err) {
      setSeqError(
        err instanceof Error ? err.message : "Failed to save the sequence."
      );
    } finally {
      setSeqSaving(false);
    }
  };

  const loadAll = React.useCallback(
    async (ws: string, campaignId: string) => {
      const [camp, stepRows, activityRows, enrollmentRows, leadRows] =
        await Promise.all([
          campaignsRepo.getCampaign(ws, campaignId),
          campaignsRepo.getCampaignSteps(campaignId),
          campaignsRepo.listActivity(ws, campaignId),
          campaignsRepo.listEnrollments(campaignId),
          leadsRepo.listLeads(ws),
        ]);
      if (!camp) {
        setNotFound(true);
        return;
      }
      setCampaign(camp);
      // Resolve the campaign's sender account for the {my_*}
      // variables in the sequence drawer preview. A deleted account
      // resolves to null and the preview falls back to the profile.
      const [liAccount, emAccount] = await Promise.all([
        camp.sender_account_id
          ? accountsRepo.getAccount(ws, camp.sender_account_id)
          : Promise.resolve(null),
        camp.email_account_id
          ? accountsRepo.getAccount(ws, camp.email_account_id)
          : Promise.resolve(null),
      ]);
      setSenderAccount(liAccount ?? emAccount);
      try {
        const settings = await getUserSettingsRepository().getSettings();
        setProfileName(settings.identity.full_name);
      } catch {
        // Preview fallback only — never block the page.
      }
      setSteps(stepRows);
      setActivity(activityRows);
      setEnrollments(enrollmentRows);
      setLeadsById(new Map(leadRows.map((l) => [l.id, l])));
      // Honest stats for the Overview cards + Analytics tab, derived
      // from this campaign's enrollments, messages and step executions.
      const statsResult = await loadCampaignStats(
        { campaignsRepo, inboxRepo, leadsRepo, mode: campaignsRepo.mode },
        ws,
        [camp]
      );
      setStats(statsResult.byCampaign.get(campaignId) ?? null);
    },
    [campaignsRepo, leadsRepo, inboxRepo, accountsRepo]
  );

  // Deep link support: /dashboard/campaigns/[id]?tab=analytics (used by
  // the list page's per-row analytics action).
  React.useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "overview" || t === "sequence" || t === "leads" || t === "analytics") {
      setActiveTab(t);
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ws = await resolveWorkspaceId();
        if (cancelled) return;
        setWorkspaceId(ws);
        if (!ws || !id) {
          setNotFound(true);
          return;
        }
        await loadAll(ws, id);
      } catch (err) {
        if (!cancelled) {
          setActionError(
            err instanceof Error ? err.message : "Failed to load the campaign."
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, loadAll]);

  const status: CampaignStatus = campaign?.status ?? "draft";

  const toggleStatus = async () => {
    if (!workspaceId || !campaign) return;
    const next: CampaignStatus = status === "active" ? "paused" : "active";
    setActionError(null);
    try {
      await campaignsRepo.setCampaignStatus(workspaceId, campaign.id, next);
      setCampaign({ ...campaign, status: next });
      setActivity(await campaignsRepo.listActivity(workspaceId, campaign.id));
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to change the campaign status."
      );
    }
  };

  const handleArchive = async () => {
    if (!workspaceId || !campaign) return;
    setActionError(null);
    try {
      await campaignsRepo.setCampaignStatus(workspaceId, campaign.id, "archived");
      setCampaign({ ...campaign, status: "archived" });
      setActivity(await campaignsRepo.listActivity(workspaceId, campaign.id));
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to archive the campaign."
      );
    }
  };

  const startEditing = () => {
    if (!campaign) return;
    setEditName(campaign.name);
    setEditType(campaign.type);
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!workspaceId || !campaign) return;
    setIsSaving(true);
    setActionError(null);
    try {
      const updated = await campaignsRepo.updateCampaign(campaign.id, {
        name: editName.trim() || campaign.name,
        type: editType,
      });
      // Activity write is best-effort here: the edit itself has committed.
      await campaignsRepo
        .appendActivity(workspaceId, {
          campaign_id: campaign.id,
          action: "campaign_updated",
          details: `Campaign "${updated.name}" details edited (name/type). Sequence steps are edited on the Sequence tab.`,
        })
        .catch(() => undefined);
      setCampaign(updated);
      setActivity(await campaignsRepo.listActivity(workspaceId, campaign.id));
      setIsEditing(false);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to save the campaign."
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 pb-14">
        <DemoBanner feature="Campaign Sequences" />
        <p className="text-13 text-black-400">Loading campaign…</p>
      </div>
    );
  }

  if (notFound || !campaign) {
    return (
      <div className="space-y-6 pb-14">
        <DemoBanner feature="Campaign Sequences" />
        <div className="glass-card p-10 text-center space-y-3">
          <h1 className="text-20 font-bold text-white">Campaign not found</h1>
          <p className="text-13 text-black-400 max-w-sm mx-auto">
            This campaign does not exist in the current workspace (it may have
            been deleted).
          </p>
          <Link
            href="/dashboard/campaigns"
            className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 px-4 py-2 text-13 font-semibold text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Campaigns</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-14">
      {/* Back button & Demo Banner */}
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard/campaigns"
          className="inline-flex items-center gap-1.5 text-13 font-medium text-black-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Campaigns</span>
        </Link>
        {isDemo && <span className="demo-badge">Campaign Detail</span>}
      </div>

      <DemoBanner feature="Campaign Sequences" />

      {actionError && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-950/20 px-5 py-3 text-13 text-rose-200">
          {actionError}
        </div>
      )}

      {/* Header Card */}
      <div className="glass-card p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-22 sm:text-26 font-bold tracking-tight text-white">
              {campaign.name}
            </h1>
            <Badge
              variant={
                status === "active"
                  ? "green"
                  : status === "paused"
                  ? "yellow"
                  : "red"
              }
            >
              {status.toUpperCase()}
            </Badge>
            <Badge variant="purple">{campaign.type.toUpperCase()}</Badge>
          </div>
          <p className="text-13 text-black-300">
            Enrolling high-intent prospects across automated multichannel touches.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={startEditing}
            className="inline-flex items-center gap-1.5 rounded-xl bg-black-800 hover:bg-black-700 border border-black-600 px-4 py-2 text-13 font-medium text-black-200 hover:text-white transition-colors"
          >
            <Pencil className="h-4 w-4" />
            <span>Edit</span>
          </button>

          <button
            type="button"
            onClick={toggleStatus}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-13 font-semibold transition-all ${
              status === "active"
                ? "bg-amber-600/20 text-amber-300 border border-amber-500/30 hover:bg-amber-600/30"
                : "bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-600/30"
            }`}
          >
            {status === "active" ? (
              <>
                <Pause className="h-4 w-4" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                <span>Resume</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleArchive}
            className="inline-flex items-center gap-1.5 rounded-xl bg-black-800 hover:bg-black-700 border border-black-600 px-4 py-2 text-13 font-medium text-black-300 hover:text-white transition-colors"
          >
            <Archive className="h-4 w-4" />
            <span>Archive</span>
          </button>
        </div>
      </div>

      {/* Edit panel */}
      {isEditing && (
        <div className="glass-card p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-16 font-semibold text-white">Edit Campaign</h3>
            <span className="text-12 text-black-400">
              Changes save to {isDemo ? "the demo store" : "the database"} when you click Save.
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-11 text-black-400 mb-1">Campaign Name</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="input-field py-2 text-13"
              />
            </div>
            <div>
              <label className="block text-11 text-black-400 mb-1">Type</label>
              <select
                value={editType}
                onChange={(e) => setEditType(e.target.value as CampaignType)}
                className="w-full rounded-xl border border-black-600 bg-black-800 px-3 py-2 text-13 text-white focus:outline-none focus:border-purple-500"
              >
                <option value="linkedin">LinkedIn</option>
                <option value="email">Email</option>
                <option value="mixed">Mixed</option>
              </select>
            </div>
          </div>

          <p className="text-12 text-black-400 leading-relaxed">
            The sequence itself is edited on the{" "}
            <strong className="text-white">Sequence tab</strong> — the canvas
            builder with templates, branches and the message editor lives
            there, and saves through the same repository.
          </p>

          <div className="flex justify-end gap-3 pt-3 border-t border-black-700">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-black-800 hover:bg-black-700 px-4 py-2 text-13 font-medium text-white"
            >
              <X className="h-4 w-4" />
              <span>Cancel</span>
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSaveEdit}
              className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 px-5 py-2 text-13 font-semibold text-white shadow-glow-purple disabled:opacity-40"
            >
              <Save className="h-4 w-4" />
              <span>{isSaving ? "Saving…" : "Save Changes"}</span>
            </button>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 border-b border-black-700/80 pb-px">
        {[
          { key: "overview", label: "Overview" },
          { key: "sequence", label: "Sequence" },
          { key: "leads", label: "Leads" },
          { key: "analytics", label: "Analytics" },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() =>
              setActiveTab(tab.key as "overview" | "sequence" | "leads" | "analytics")
            }
            className={`rounded-t-xl px-4 py-2.5 text-14 font-medium transition-colors border-b-2 ${
              activeTab === tab.key
                ? "border-purple-500 text-white bg-black-800/40"
                : "border-transparent text-black-400 hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB CONTENT: Overview */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Overview stats — all four are real counts from the stats
              module (enrollments, message history, step executions).
              The previous hardcoded 42/36/14 literals and the invented
              "Configuration Summary" (50/day cap, sending window,
              "Smart Random Delays") were removed: none of those values
              are stored or enforced anywhere in the product. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4.5">
            <StatsCard
              label="Enrolled Leads"
              value={enrollments.length}
              icon={Users}
              sublabel="recorded enrollments"
              isDemo={isDemo}
            />
            <StatsCard
              label="In Progress"
              value={stats ? stats.enrollments.inProgress : "—"}
              icon={Target}
              sublabel="enrollments not finished"
              isDemo={isDemo}
            />
            <StatsCard
              label="Completed"
              value={stats ? stats.enrollments.completed : "—"}
              icon={CheckCircle2}
              sublabel="finished every step"
              isDemo={isDemo}
            />
            <StatsCard
              label="Replies"
              value={stats ? stats.repliesTotal : "—"}
              icon={MessageSquare}
              sublabel="inbound replies recorded"
              isDemo={isDemo}
            />
          </div>

          {/* Sequence execution — the executor (src/lib/executor)
              advances due enrollments: email steps via the email
              adapter, LinkedIn steps recorded as skipped, stop rules
              on reply/bounce/unsubscribe. */}
          <div className="glass-card p-6 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-16 font-semibold text-white">Sequence Execution</h3>
              {isDemo && <span className="demo-badge">Demo Mode</span>}
            </div>
            {isDemo ? (
              <>
                <p className="text-13 text-black-300">
                  Due steps for active campaigns execute against the demo
                  store: email steps are recorded as <strong>Simulated</strong>{" "}
                  (nothing is actually sent), LinkedIn steps are recorded as{" "}
                  <strong>skipped</strong> (no authorized LinkedIn provider),
                  and enrollments stop when a lead replies. In production the
                  same engine runs in the background worker — see Admin →
                  Queue &amp; Workers.
                </p>
                <button
                  type="button"
                  onClick={handleRunDueSteps}
                  disabled={execRunning}
                  className="inline-flex items-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 px-4 py-2 text-13 font-semibold text-white transition-colors"
                >
                  <Play className="h-3.5 w-3.5" />
                  {execRunning ? "Running due steps…" : "Run due steps now (Demo)"}
                </button>
                {execError && (
                  <p className="text-13 text-rose-300">{execError}</p>
                )}
                {execSummary && (
                  <div className="rounded-xl border border-black-700/70 bg-black-800/60 px-4 py-3 space-y-1">
                    <p className="text-13 text-black-100">
                      Scanned {execSummary.scanned} enrollment(s) —{" "}
                      {execSummary.simulated} simulated send(s),{" "}
                      {execSummary.skippedLinkedIn} LinkedIn step(s) skipped,{" "}
                      {execSummary.waitsExecuted} wait/condition step(s)
                      executed,{" "}
                      {execSummary.stoppedReply + execSummary.stoppedSuppression}{" "}
                      enrollment(s) stopped by stop rules,{" "}
                      {execSummary.overLimit} deferred by plan limit,{" "}
                      {execSummary.errors} transient error(s).
                    </p>
                    {execSummary.log.map((line, i) => (
                      <p key={i} className="text-12 text-black-400">
                        {line}
                      </p>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-13 text-black-300">
                Due steps for active campaigns are executed by the background
                worker (Vercel Cron → <code>follow_up_due</code>): email steps
                are sent through the configured email provider with
                suppression checks, LinkedIn steps are recorded as skipped
                (no authorized provider), and enrollments stop on reply,
                bounce or unsubscribe. Worker status and run history:{" "}
                <Link href="/admin/system/queue" className="text-purple-400 hover:underline">
                  Admin → Queue &amp; Workers
                </Link>
                .
              </p>
            )}
          </div>

          {/* Activity log — recorded through the data layer on every
              lifecycle action (simulated in demo mode, flagged as such). */}
          <div className="glass-card p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-16 font-semibold text-white">Activity Log</h3>
              {isDemo && <span className="demo-badge">Simulated</span>}
            </div>
            {activity.length === 0 ? (
              <p className="text-13 text-black-400">
                No lifecycle activity recorded yet. Creating, pausing, resuming,
                archiving, duplicating or deleting this campaign will appear here.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {activity.slice(0, 20).map((entry) => (
                  <li
                    key={entry.id}
                    className="rounded-xl border border-black-700/70 bg-black-800/60 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <span className="text-12 font-semibold text-purple-300">
                        {entry.action}
                      </span>
                      <span className="text-11 text-black-400">
                        {formatDate(entry.created_at, "long")}
                        {entry.simulated ? " • simulated" : ""}
                      </span>
                    </div>
                    <p className="text-13 text-black-200 mt-1">{entry.details}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT: Sequence */}
      {activeTab === "sequence" && (
        <div className="glass-card p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-black-700 flex-wrap gap-3">
            <div>
              <h3 className="text-16 font-semibold text-white">Sequence Flow</h3>
              <p className="text-12 text-black-400 max-w-xl">
                Build on the canvas — templates, &quot;if connected&quot; branches and
                the message editor. Changes save when you click Save sequence.{" "}
                {isDemo
                  ? "In Demo Mode execution is simulated: email sends are labelled Simulated and LinkedIn steps are recorded as skipped."
                  : "Email steps are sent by the background worker; LinkedIn steps are recorded as skipped (no authorized provider)."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {seqDirty && (
                <span className="text-11 font-medium text-amber-300">
                  Unsaved changes
                </span>
              )}
              <button
                type="button"
                onClick={handleSaveSequence}
                disabled={!seqDirty || seqSaving}
                data-testid="save-sequence"
                className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 px-4 py-2 text-13 font-semibold text-white shadow-glow-purple disabled:opacity-40"
              >
                <Save className="h-4 w-4" />
                <span>{seqSaving ? "Saving…" : "Save sequence"}</span>
              </button>
            </div>
          </div>

          {seqError && (
            <p className="text-12 text-rose-300">{seqError}</p>
          )}
          {seqNotice && !seqDirty && (
            <p className="text-12 text-emerald-300">{seqNotice}</p>
          )}

          {seqDrafts !== null && (
            <SequenceBuilder
              steps={seqDrafts}
              onStepsChange={(next) => {
                setSeqDrafts(next);
                setSeqNotice(null);
              }}
              campaignName={campaign?.name ?? ""}
              campaignDescription={campaign?.description ?? ""}
              previewContacts={seqPreviewContacts}
              customFieldNames={seqCustomFieldNames}
              sender={seqSenderVars}
              showEntryModal={false}
            />
          )}
        </div>
      )}

      {/* TAB CONTENT: Leads */}
      {activeTab === "leads" && (
        <div className="glass-card overflow-hidden">
          <div className="p-4 border-b border-black-700/80 flex items-center justify-between">
            <h3 className="text-15 font-semibold text-white">
              Enrolled Leads in this Sequence
            </h3>
            <span className="text-12 text-black-400">
              Showing {enrollments.length} enrolled lead(s)
            </span>
          </div>

          {enrollments.length === 0 ? (
            <p className="p-6 text-13 text-black-400">
              No leads are enrolled in this campaign yet. Enroll leads from the
              Leads page using the target icon or the bulk action bar.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-13">
                <thead>
                  <tr className="border-b border-black-700/80 bg-black-800/40 text-11 font-semibold uppercase tracking-wider text-black-400">
                    <th className="py-3 px-5">Lead</th>
                    <th className="py-3 px-4">Company</th>
                    <th className="py-3 px-4">Enrollment</th>
                    <th className="py-3 px-4">Step</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black-700/50">
                  {enrollments.map((enrollment) => {
                    const lead = leadsById.get(enrollment.lead_id);
                    return (
                      <tr key={enrollment.id} className="table-row-hover">
                        <td className="py-3 px-5">
                          <div className="font-medium text-white">
                            {lead
                              ? `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() || lead.email
                              : enrollment.lead_id}
                          </div>
                          <div className="text-11 text-black-400">{lead?.email ?? ""}</div>
                        </td>
                        <td className="py-3 px-4 text-black-200">{lead?.company ?? "—"}</td>
                        <td className="py-3 px-4">
                          <Badge variant="gray">{enrollment.status}</Badge>
                        </td>
                        <td className="py-3 px-4 text-black-300">
                          Step {enrollment.current_step} of {steps.length}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: Analytics — real aggregates from the stats
          module (enrollments, message history, step executions). The
          previous MOCK_PERFORMANCE_DATA chart was removed. */}
      {activeTab === "analytics" && (
        <div className="glass-card p-6 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-black-700">
            <div>
              <h3 className="text-16 font-semibold text-white">Campaign Analytics</h3>
              <p className="text-12 text-black-400">
                Computed from this campaign&apos;s recorded enrollments,
                messages and step executions — nothing here is estimated.
              </p>
            </div>
            {isDemo && <span className="demo-badge">Demo Mode</span>}
          </div>

          {!stats ? (
            <p className="text-13 text-black-400">Loading analytics…</p>
          ) : (
            <>
              <div>
                <h4 className="text-13 font-semibold text-white mb-2.5 flex items-center gap-2">
                  <Linkedin className="h-4 w-4 text-blue-400" /> LinkedIn
                  {!stats.linkedin.providerConnected && (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-10 font-semibold text-amber-300">
                      Provider not connected — steps recorded, not sent
                    </span>
                  )}
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <AnalyticsTile label="Connections sent" value={String(stats.linkedin.connectionRequestsSent)} />
                  <AnalyticsTile label="Accepted" value="—" hint="No data source until a provider reports it" />
                  <AnalyticsTile label="Messages sent" value={String(stats.linkedin.messagesSent)} />
                  <AnalyticsTile label="Replied" value={String(stats.linkedin.replied)} />
                  <AnalyticsTile label="Steps skipped" value={String(stats.linkedin.stepsSkipped)} hint="No authorized LinkedIn provider" />
                </div>
              </div>

              <div>
                <h4 className="text-13 font-semibold text-white mb-2.5 flex items-center gap-2">
                  <Mail className="h-4 w-4 text-purple-400" /> Email
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
                  <AnalyticsTile
                    label="Sent"
                    value={String(stats.email.sent)}
                    hint={`${stats.email.sentProviderConfirmed} provider-confirmed · ${stats.email.sentSimulated} simulated`}
                  />
                  <AnalyticsTile
                    label="Opened"
                    value={stats.email.opened === null ? "—" : String(stats.email.opened)}
                    hint={stats.email.opened === null ? "No provider event source available" : "Provider webhook events (simulated in Demo Mode)"}
                  />
                  <AnalyticsTile
                    label="Clicked"
                    value={stats.email.clicked === null ? "—" : String(stats.email.clicked)}
                    hint={stats.email.clicked === null ? "No provider event source available" : "Provider webhook events (simulated in Demo Mode)"}
                  />
                  <AnalyticsTile
                    label="Bounced"
                    value={stats.email.bounced === null ? "—" : String(stats.email.bounced)}
                    hint={stats.email.bounced === null ? "No provider event source available" : "Provider-reported bounces; auto-suppressed"}
                  />
                  <AnalyticsTile
                    label="Complained"
                    value={stats.email.complained === null ? "—" : String(stats.email.complained)}
                    hint={stats.email.complained === null ? "No provider event source available" : "Provider-reported complaints; auto-suppressed"}
                  />
                  <AnalyticsTile label="Replied" value={String(stats.email.replied)} />
                  <AnalyticsTile label="Failed / blocked" value={String(stats.email.failed)} />
                </div>
              </div>

              <div>
                <h4 className="text-13 font-semibold text-white mb-2.5">
                  Step execution outcomes
                </h4>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                  <AnalyticsTile label="Sent" value={String(stats.executions.sent)} />
                  <AnalyticsTile label="Simulated" value={String(stats.executions.simulated)} />
                  <AnalyticsTile label="Skipped" value={String(stats.executions.skipped)} />
                  <AnalyticsTile label="Stopped" value={String(stats.executions.stopped)} hint="Stop rules: reply / suppression" />
                  <AnalyticsTile label="Executed" value={String(stats.executions.executed)} hint="Wait / condition steps" />
                  <AnalyticsTile label="Failed" value={String(stats.executions.failed)} />
                </div>
              </div>

              {stats.executions.total === 0 &&
              stats.email.sent === 0 &&
              stats.repliesTotal === 0 ? (
                <p className="text-13 text-black-400">
                  No execution or message activity has been recorded for
                  this campaign yet. Enroll leads from the Leads page
                  {isDemo
                    ? ", then use “Run due steps now” in the Overview tab to execute due steps against the demo store."
                    : " — due steps are executed by the background worker."}
                </p>
              ) : (
                <div className="h-[240px] pt-2">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={[
                        { name: "Email sent", value: stats.email.sent },
                        { name: "Email replies", value: stats.email.replied },
                        { name: "LinkedIn replies", value: stats.linkedin.replied },
                        { name: "Steps skipped", value: stats.executions.skipped },
                        { name: "Completed", value: stats.enrollments.completed },
                      ]}
                    >
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="value" name="Count" fill="#642cff" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
