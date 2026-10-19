"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Play, Pause, Archive, Target, Users, MessageSquare, Clock, Mail, Linkedin, CheckCircle2, Pencil, Plus, Trash2, ArrowUp, ArrowDown, Save, X } from "lucide-react";
import { DemoBanner, Badge } from "@/components/ui";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { MOCK_PERFORMANCE_DATA } from "@/lib/db/mock/data";
import {
  getCampaignsRepository,
  getLeadsRepository,
  resolveWorkspaceId,
  type ActivityEntry,
  type CampaignStepDraft,
  type EnrollmentRecord,
} from "@/lib/data";
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
import type { Campaign, CampaignStatus, CampaignStep, CampaignType, Lead, StepType } from "@/types";

interface StepEditDraft {
  step_type: StepType;
  delay_hours: number;
  subject: string;
  content: string;
}

const STEP_TYPE_OPTIONS: StepType[] = [
  "connection_request",
  "linkedin_message",
  "email",
  "wait",
  "condition",
];

export default function CampaignDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const campaignsRepo = React.useMemo(() => getCampaignsRepository(), []);
  const leadsRepo = React.useMemo(() => getLeadsRepository(), []);
  const isDemo = campaignsRepo.mode === "demo";

  const [workspaceId, setWorkspaceId] = React.useState<string | null>(null);
  const [campaign, setCampaign] = React.useState<Campaign | null>(null);
  const [steps, setSteps] = React.useState<CampaignStep[]>([]);
  const [activity, setActivity] = React.useState<ActivityEntry[]>([]);
  const [enrollments, setEnrollments] = React.useState<EnrollmentRecord[]>([]);
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

  // Edit state
  const [isEditing, setIsEditing] = React.useState(false);
  const [editName, setEditName] = React.useState("");
  const [editType, setEditType] = React.useState<CampaignType>("linkedin");
  const [editSteps, setEditSteps] = React.useState<StepEditDraft[]>([]);
  const [isSaving, setIsSaving] = React.useState(false);

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
      setSteps(stepRows);
      setActivity(activityRows);
      setEnrollments(enrollmentRows);
      setLeadsById(new Map(leadRows.map((l) => [l.id, l])));
    },
    [campaignsRepo, leadsRepo]
  );

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
    setEditSteps(
      steps.map((s) => ({
        step_type: s.step_type,
        delay_hours: s.delay_hours,
        subject: s.subject ?? "",
        content: s.content ?? "",
      }))
    );
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
      const drafts: CampaignStepDraft[] = editSteps.map((s) => ({
        step_type: s.step_type,
        delay_hours: s.delay_hours,
        subject: s.subject,
        content: s.content,
        config: {},
      }));
      const savedSteps = await campaignsRepo.replaceCampaignSteps(
        campaign.id,
        drafts
      );
      // Activity write is best-effort here: the edit itself has committed.
      await campaignsRepo
        .appendActivity(workspaceId, {
          campaign_id: campaign.id,
          action: "campaign_updated",
          details: `Campaign "${updated.name}" edited (${savedSteps.length} steps).`,
        })
        .catch(() => undefined);
      setCampaign(updated);
      setSteps(savedSteps);
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

  const moveEditStep = (index: number, direction: "up" | "down") => {
    setEditSteps((prev) => {
      const next = [...prev];
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= next.length) return prev;
      const tmp = next[index];
      next[index] = next[target];
      next[target] = tmp;
      return next;
    });
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

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-13 font-semibold text-white">Sequence Steps</h4>
              <button
                type="button"
                onClick={() =>
                  setEditSteps((prev) => [
                    ...prev,
                    { step_type: "email", delay_hours: 24, subject: "", content: "" },
                  ])
                }
                className="inline-flex items-center gap-1 rounded-lg bg-black-800 hover:bg-black-700 border border-black-600 px-2.5 py-1.5 text-12 text-black-200"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Step</span>
              </button>
            </div>

            {editSteps.map((step, idx) => (
              <div
                key={idx}
                className="rounded-2xl border border-black-700/80 bg-black-800/70 p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-black-700 text-12 font-bold text-white">
                      {idx + 1}
                    </span>
                    <select
                      value={step.step_type}
                      onChange={(e) =>
                        setEditSteps((prev) =>
                          prev.map((s, i) =>
                            i === idx
                              ? { ...s, step_type: e.target.value as StepType }
                              : s
                          )
                        )
                      }
                      className="rounded-lg border border-black-600 bg-black-800 px-2 py-1.5 text-12 text-white focus:outline-none focus:border-purple-500"
                    >
                      {STEP_TYPE_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {t.replace("_", " ")}
                        </option>
                      ))}
                    </select>
                    <label className="text-11 text-black-400 flex items-center gap-1.5">
                      Delay (h)
                      <input
                        type="number"
                        min="0"
                        value={step.delay_hours}
                        onChange={(e) =>
                          setEditSteps((prev) =>
                            prev.map((s, i) =>
                              i === idx
                                ? { ...s, delay_hours: Number(e.target.value) || 0 }
                                : s
                            )
                          )
                        }
                        className="w-20 rounded-lg border border-black-600 bg-black-800 px-2 py-1.5 text-12 text-white focus:outline-none focus:border-purple-500"
                      />
                    </label>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveEditStep(idx, "up")}
                      className="h-7 w-7 flex items-center justify-center rounded-lg text-black-400 hover:text-white hover:bg-black-700 disabled:opacity-20"
                      title="Move Up"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === editSteps.length - 1}
                      onClick={() => moveEditStep(idx, "down")}
                      className="h-7 w-7 flex items-center justify-center rounded-lg text-black-400 hover:text-white hover:bg-black-700 disabled:opacity-20"
                      title="Move Down"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setEditSteps((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="h-7 w-7 flex items-center justify-center rounded-lg text-black-400 hover:text-rose-400 hover:bg-rose-950/20"
                      title="Delete Step"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <input
                  type="text"
                  value={step.subject}
                  onChange={(e) =>
                    setEditSteps((prev) =>
                      prev.map((s, i) =>
                        i === idx ? { ...s, subject: e.target.value } : s
                      )
                    )
                  }
                  placeholder="Step label / subject"
                  className="input-field py-2 text-13"
                />
                {step.step_type !== "wait" && (
                  <textarea
                    rows={3}
                    value={step.content}
                    onChange={(e) =>
                      setEditSteps((prev) =>
                        prev.map((s, i) =>
                          i === idx ? { ...s, content: e.target.value } : s
                        )
                      )
                    }
                    placeholder="Message body (supports {{first_name}}, {{company}})"
                    className="input-field py-2 text-13 resize-none font-mono text-12 text-black-200"
                  />
                )}
              </div>
            ))}
            {editSteps.length === 0 && (
              <p className="text-12 text-black-400">
                No steps. Add a step before saving, or save with zero steps to clear the sequence.
              </p>
            )}
          </div>

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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4.5">
            <StatsCard
              label="Enrolled Leads"
              value={enrollments.length}
              icon={Users}
              sublabel="recorded enrollments"
              isDemo={isDemo}
            />
            <StatsCard
              label="Active Sequence"
              value={42}
              change={5}
              changeType="up"
              icon={Target}
              sublabel="in progress"
              isDemo={true}
            />
            <StatsCard
              label="Completed"
              value={36}
              change={20}
              changeType="up"
              icon={CheckCircle2}
              sublabel="all steps executed"
              isDemo={true}
            />
            <StatsCard
              label="Replies"
              value={14}
              change={16.7}
              changeType="up"
              icon={MessageSquare}
              sublabel="positive interest"
              isDemo={true}
            />
          </div>

          <div className="glass-card p-6">
            <h3 className="text-16 font-semibold text-white mb-2">
              Campaign Configuration Summary
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-13 pt-2">
              <div className="rounded-xl bg-black-800/80 p-3.5 border border-black-700">
                <span className="text-black-400 text-11 block">Daily Sending Cap</span>
                <span className="font-semibold text-white text-15 mt-0.5 block">50 touches / day</span>
              </div>
              <div className="rounded-xl bg-black-800/80 p-3.5 border border-black-700">
                <span className="text-black-400 text-11 block">Sending Window</span>
                <span className="font-semibold text-white text-15 mt-0.5 block">Mon - Fri, 09:00 - 18:00</span>
              </div>
              <div className="rounded-xl bg-black-800/80 p-3.5 border border-black-700">
                <span className="text-black-400 text-11 block">Account Safety</span>
                <span className="font-semibold text-emerald-400 text-15 mt-0.5 block">Smart Random Delays (Active)</span>
              </div>
            </div>
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
          <div className="flex items-center justify-between pb-3 border-b border-black-700">
            <div>
              <h3 className="text-16 font-semibold text-white">Sequence Flow</h3>
              <p className="text-12 text-black-400">
                Steps stored for this campaign. Use Edit above to change them.
                Execution is simulated — no messages are sent.
              </p>
            </div>
            <span className="demo-badge">{steps.length} Steps</span>
          </div>

          <div className="space-y-4 pt-2">
            {steps.length === 0 && (
              <p className="text-13 text-black-400">
                This campaign has no steps yet. Click Edit to build its sequence.
              </p>
            )}
            {steps.map((step, idx) => (
              <div
                key={step.id}
                className="rounded-2xl border border-black-700/80 bg-black-800/70 p-5 space-y-2.5 relative"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-black-700 text-12 font-bold text-white">
                      {idx + 1}
                    </span>
                    <div className="flex items-center gap-2">
                      {step.step_type === "connection_request" ? (
                        <Linkedin className="h-4 w-4 text-blue-400" />
                      ) : step.step_type === "wait" ? (
                        <Clock className="h-4 w-4 text-orange-400" />
                      ) : (
                        <Mail className="h-4 w-4 text-purple-400" />
                      )}
                      <span className="text-14 font-semibold text-white">
                        {step.subject || step.step_type.replace("_", " ")}
                      </span>
                    </div>
                  </div>

                  <span className="text-11 text-black-400">
                    Delay: {step.delay_hours}h
                  </span>
                </div>

                {step.content && (
                  <p className="text-13 text-black-200 font-mono bg-black-900/60 p-3 rounded-xl border border-black-700/60">
                    {step.content}
                  </p>
                )}
              </div>
            ))}
          </div>
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

      {/* TAB CONTENT: Analytics */}
      {activeTab === "analytics" && (
        <div className="glass-card p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-black-700">
            <div>
              <h3 className="text-16 font-semibold text-white">Conversion Funnel</h3>
              <p className="text-12 text-black-400">Weekly touches and response rates for this sequence</p>
            </div>
            <span className="demo-badge">Demo Data</span>
          </div>

          <div className="h-[260px] pt-4">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={MOCK_PERFORMANCE_DATA}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="messages" name="Touches" fill="#642cff" radius={[4, 4, 0, 0]} />
                <Bar dataKey="replies" name="Replies" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
