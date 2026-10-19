"use client";

import * as React from "react";
import Link from "next/link";
import {
  Sparkles,
  AlertTriangle,
  Copy,
  Check,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { DemoBanner, Badge } from "@/components/ui";
import {
  getCampaignsRepository,
  getLeadsRepository,
  resolveWorkspaceId,
} from "@/lib/data";
import type { Campaign, Lead } from "@/types";
import type { IntegrationStatusEntry } from "@/lib/integrations-center/types";

/**
 * AI Personalization — the workbench around the ONE wired AI feature
 * (POST /api/ai/draft). Providers are OpenAI, Anthropic and Meta Model
 * API, selected server-side by key presence; this page never sees a
 * key and never sends anything: it produces drafts for mandatory
 * human review.
 *
 * Modes reuse the same draft endpoint with different stepType
 * context (personalized draft / follow-up suggestion). A subject-line
 * mode is deliberately NOT offered: the shared draft system prompt
 * contract ("output only the message text — no subject line") would
 * make its output unreliable (see R2_STAGE_E_REPORT).
 */

type Mode = "draft" | "follow_up";

interface ProviderPanelEntry {
  id: string;
  name: string;
  status: string;
  statusMessage: string;
  modelLabel: string;
}

const AI_ENTRY_MODELS: Record<string, { defaultModel: string; envName: string }> = {
  openai: { defaultModel: "gpt-4o-mini", envName: "OPENAI_MODEL" },
  anthropic: { defaultModel: "claude-sonnet-4-5", envName: "ANTHROPIC_MODEL" },
  "meta-model": { defaultModel: "muse-spark-1.3", envName: "META_MODEL" },
};

const STEP_TYPES: { value: string; label: string; channel: "linkedin" | "email" }[] = [
  { value: "connection_request", label: "LinkedIn connection note", channel: "linkedin" },
  { value: "linkedin_message", label: "LinkedIn message", channel: "linkedin" },
  { value: "email", label: "Email", channel: "email" },
];

interface DraftResponse {
  state?: string;
  provider?: string | null;
  draft?: string | null;
  aiGenerated?: boolean;
  message?: string;
  error?: string;
}

export default function AiPersonalizationPage() {
  const leadsRepo = React.useMemo(() => getLeadsRepository(), []);
  const campaignsRepo = React.useMemo(() => getCampaignsRepository(), []);
  const isDemo = leadsRepo.mode === "demo";

  const [providers, setProviders] = React.useState<ProviderPanelEntry[]>([]);
  const [providersError, setProvidersError] = React.useState<string | null>(null);
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([]);
  const [leads, setLeads] = React.useState<Lead[]>([]);
  const [campaignId, setCampaignId] = React.useState("");
  const [leadId, setLeadId] = React.useState("");
  const [mode, setMode] = React.useState<Mode>("draft");
  const [stepType, setStepType] = React.useState("linkedin_message");
  const [editor, setEditor] = React.useState("");
  const [resultNote, setResultNote] = React.useState<{
    tone: "simulated" | "ai" | "error" | "info";
    text: string;
  } | null>(null);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  // Provider status — from the Integration Center status API (the
  // same source the Integration Center renders; no second truth).
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/integrations/status");
        if (!res.ok) throw new Error(`Status API returned ${res.status}`);
        const data = (await res.json()) as { integrations: IntegrationStatusEntry[] };
        if (cancelled) return;
        const entries = data.integrations
          .filter((e) => e.descriptor.id in AI_ENTRY_MODELS)
          .map((e) => {
            const meta = AI_ENTRY_MODELS[e.descriptor.id];
            const override = e.envPresence.find((v) => v.name === meta.envName);
            return {
              id: e.descriptor.id,
              name: e.descriptor.name,
              status: e.status,
              statusMessage: e.statusMessage,
              modelLabel: override?.present
                ? `Custom model configured via ${meta.envName}`
                : `Default model: ${meta.defaultModel}`,
            };
          });
        setProviders(entries);
      } catch (err) {
        if (!cancelled) {
          setProvidersError(
            err instanceof Error ? err.message : "Failed to load provider status."
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Campaigns + leads from the data layer for the context pickers.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ws = await resolveWorkspaceId();
        if (!ws) return;
        const [campaignRows, leadRows] = await Promise.all([
          campaignsRepo.listCampaigns(ws),
          leadsRepo.listLeads(ws),
        ]);
        if (cancelled) return;
        setCampaigns(campaignRows);
        setLeads(leadRows);
        if (campaignRows.length > 0) setCampaignId(campaignRows[0].id);
        if (leadRows.length > 0) setLeadId(leadRows[0].id);
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Failed to load campaigns and leads."
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignsRepo, leadsRepo]);

  const selectedCampaign = campaigns.find((c) => c.id === campaignId) ?? null;
  const selectedLead = leads.find((l) => l.id === leadId) ?? null;

  const handleGenerate = async () => {
    setIsGenerating(true);
    setResultNote(null);
    setCopied(false);
    try {
      const step = STEP_TYPES.find((s) => s.value === stepType) ?? STEP_TYPES[1];
      const effectiveStepType = mode === "follow_up" ? "follow_up" : step.value;
      const channel = step.channel;
      const res = await fetch("/api/ai/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          stepType: effectiveStepType,
          campaignName: selectedCampaign?.name,
          lead: selectedLead
            ? {
                firstName: selectedLead.first_name,
                company: selectedLead.company,
                jobTitle: selectedLead.job_title,
              }
            : undefined,
          existingContent: editor.trim() ? editor : undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as DraftResponse;

      if (!res.ok) {
        setResultNote({
          tone: "error",
          text: data.error ?? `The draft request failed (HTTP ${res.status}).`,
        });
        return;
      }

      if (data.state === "not_configured") {
        setResultNote({
          tone: "error",
          text:
            (data.message ?? "AI is not configured.") +
            " Configure a provider in the Integration Center (server-side API key required) — see the provider panel above.",
        });
        return;
      }

      if (data.state === "error") {
        setResultNote({
          tone: "error",
          text: data.message ?? "The AI provider returned an error. Nothing was generated.",
        });
        return;
      }

      if (typeof data.draft === "string" && data.draft) {
        setEditor(data.draft);
        if (data.state === "demo" || data.aiGenerated === false) {
          setResultNote({
            tone: "simulated",
            text:
              data.message ??
              "Demo Mode sample draft — locally templated, NOT AI-generated and NOT sent.",
          });
        } else {
          setResultNote({
            tone: "ai",
            text: `Draft generated by ${data.provider ?? "AI provider"}. Review and edit it before using it anywhere — it has not been sent.`,
          });
        }
        return;
      }

      setResultNote({
        tone: "info",
        text: data.message ?? "No draft was returned.",
      });
    } catch {
      setResultNote({
        tone: "error",
        text: "The draft request could not be reached. Nothing was generated.",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(editor);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setResultNote({
        tone: "error",
        text: "Copy failed — select the text and copy it manually.",
      });
    }
  };

  return (
    <div className="space-y-7 pb-14 max-w-5xl">
      {isDemo && <DemoBanner feature="AI Personalization" />}

      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-24 sm:text-28 font-bold tracking-tight text-white">
            AI Personalization
          </h1>
          {isDemo && <span className="demo-badge">Demo Mode</span>}
        </div>
        <p className="mt-1 text-14 text-black-300">
          Generate personalized outreach drafts with your configured AI
          provider. Every draft lands in the editor for your review —
          nothing is ever sent from this page.
        </p>
      </div>

      {loadError && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-950/20 px-5 py-3 text-13 text-rose-200 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {/* Provider status panel */}
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-16 font-semibold text-white">AI Providers</h2>
          <Link
            href="/dashboard/integrations"
            className="text-12 font-medium text-purple-400 hover:text-purple-300"
          >
            Open Integration Center →
          </Link>
        </div>
        {providersError && (
          <p className="text-13 text-rose-300">
            Provider status could not be loaded ({providersError}). Drafting
            below still reports its own state honestly.
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {providers.map((p) => (
            <div
              key={p.id}
              className="rounded-2xl border border-black-700 bg-black-800/60 p-4 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-14 font-bold text-white">{p.name}</span>
                <Badge
                  variant={
                    p.status.startsWith("Connected")
                      ? "green"
                      : p.status === "Demo Mode"
                        ? "yellow"
                        : p.status === "Error"
                          ? "red"
                          : "gray"
                  }
                >
                  {p.status}
                </Badge>
              </div>
              <p className="text-12 text-black-300">{p.statusMessage}</p>
              <p className="text-11 text-black-500">{p.modelLabel}</p>
            </div>
          ))}
          {providers.length === 0 && !providersError && (
            <p className="text-13 text-black-400">Loading provider status…</p>
          )}
        </div>
        <p className="text-12 text-black-500">
          The server picks the first configured provider in the order
          OpenAI → Anthropic → Meta Model API. A provider counts as
          available only when its API key is set server-side.
        </p>
      </div>

      {/* Workbench */}
      <div className="glass-card p-6 sm:p-8 space-y-6">
        <div>
          <h2 className="text-16 font-semibold text-white flex items-center gap-2">
            <Sparkles className="h-4.5 w-4.5 text-orange-400" />
            Personalization Workbench
          </h2>
          <p className="text-13 text-black-300 mt-0.5">
            Pick the campaign context and a lead, choose what to generate,
            then review the draft below.
          </p>
        </div>

        {/* Mode tabs */}
        <div className="flex items-center gap-1 rounded-xl bg-black-800 p-1 border border-black-700 self-start w-fit">
          {(
            [
              { key: "draft", label: "Personalized draft" },
              { key: "follow_up", label: "Follow-up suggestion" },
            ] as { key: Mode; label: string }[]
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setMode(t.key)}
              className={`rounded-lg px-3.5 py-1.5 text-12 font-medium transition-colors ${
                mode === t.key
                  ? "bg-purple-600 text-white shadow-glow-purple"
                  : "text-black-400 hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-13 font-medium text-black-200 mb-1.5">
              Campaign context
            </label>
            <select
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              className="w-full rounded-xl border border-black-600 bg-black-800 px-3 py-2.5 text-13 text-white focus:outline-none focus:border-purple-500"
            >
              {campaigns.length === 0 && <option value="">No campaigns yet</option>}
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-13 font-medium text-black-200 mb-1.5">
              Lead (personalization sample)
            </label>
            <select
              value={leadId}
              onChange={(e) => setLeadId(e.target.value)}
              className="w-full rounded-xl border border-black-600 bg-black-800 px-3 py-2.5 text-13 text-white focus:outline-none focus:border-purple-500"
            >
              {leads.length === 0 && <option value="">No leads yet</option>}
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.first_name} {l.last_name}
                  {l.company ? ` — ${l.company}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-13 font-medium text-black-200 mb-1.5">
              Message type
            </label>
            <select
              value={stepType}
              onChange={(e) => setStepType(e.target.value)}
              className="w-full rounded-xl border border-black-600 bg-black-800 px-3 py-2.5 text-13 text-white focus:outline-none focus:border-purple-500"
            >
              {STEP_TYPES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedLead && (
          <p className="text-12 text-black-400">
            Personalizing for{" "}
            <span className="text-black-200 font-medium">
              {selectedLead.first_name} {selectedLead.last_name}
            </span>
            {selectedLead.job_title ? ` · ${selectedLead.job_title}` : ""}
            {selectedLead.company ? ` · ${selectedLead.company}` : ""} — only
            these fields are sent to the provider as context.
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating}
            className="inline-flex items-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 px-5 py-2.5 text-14 font-semibold text-white shadow-glow-purple transition-all disabled:opacity-50"
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 text-orange-300" />
            )}
            <span>
              {editor.trim() ? "Regenerate / improve draft" : "Generate draft"}
            </span>
          </button>
          {editor.trim() && (
            <span className="text-12 text-black-400 inline-flex items-center gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              Regenerating uses the current editor text as the starting point.
            </span>
          )}
        </div>

        {resultNote && (
          <div
            className={`rounded-xl border p-4 text-13 flex items-start gap-2.5 ${
              resultNote.tone === "error"
                ? "border-rose-500/30 bg-rose-950/20 text-rose-200"
                : resultNote.tone === "simulated"
                  ? "border-amber-500/30 bg-amber-950/20 text-amber-200"
                  : "border-emerald-500/30 bg-emerald-950/20 text-emerald-200"
            }`}
            role="status"
          >
            {resultNote.tone === "error" ? (
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            ) : (
              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
            )}
            <span>{resultNote.text}</span>
          </div>
        )}

        {/* Editor */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-13 font-medium text-black-200">
              Draft editor — review required
            </label>
            <span className="text-11 text-black-500">
              {editor.length} characters
            </span>
          </div>
          <textarea
            value={editor}
            onChange={(e) => setEditor(e.target.value)}
            rows={8}
            placeholder="Generated drafts appear here. You can also write your own and use “Regenerate / improve draft” to have the provider polish it."
            className="input-field resize-y w-full"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-12 text-amber-300/90 flex items-center gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5" />
              Mandatory review: check facts and tone before using this text
              anywhere. This page cannot send it.
            </p>
            <button
              type="button"
              onClick={handleCopy}
              disabled={!editor.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-black-700 hover:bg-black-600 px-3.5 py-2 text-12 font-medium text-white disabled:opacity-40"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              <span>{copied ? "Copied" : "Copy draft"}</span>
            </button>
          </div>
          <p className="text-12 text-black-500">
            To use a draft in a sequence, copy it into the step editor of{" "}
            <Link href="/dashboard/campaigns" className="text-purple-400 hover:underline">
              your campaign
            </Link>
            . AI usage and provider errors are reported by the draft
            endpoint itself — this page shows them verbatim.
          </p>
        </div>
      </div>
    </div>
  );
}
