"use client";

/**
 * StepEditorDrawer — the right-side editor for one canvas node
 * (P4 Stage 3).
 *
 * Message steps (connection request / LinkedIn message / email) get
 * the full Closely-style editor: variable chips (contact, "My
 * variables" custom fields, sender), a textarea with a character
 * counter (connection requests are hard-limited to 250 characters),
 * a live preview that renders the text for a real enrolled contact —
 * or a clearly-labelled sample contact when the campaign has none —
 * with prev/next cycling, a "Use template" library of original
 * message starters, the AI draft button, and (connection requests)
 * the "Withdraw requests after N days" toggle stored in step config.
 *
 * Non-message steps get a simple drawer (label + delay); condition
 * steps get a label plus a read-only branch summary. Every drawer
 * offers Save / Delete / Duplicate; nothing is written until Save.
 */

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  LayoutTemplate,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type { TemplateVariables } from "@/lib/ai/prompt";
import { renderTemplate } from "@/lib/ai/prompt";
import { MESSAGE_TEMPLATES } from "@/lib/sequence-templates";
import {
  CONTACT_VARIABLES,
  SENDER_VARIABLES,
  STEP_TYPE_META,
  SAMPLE_PREVIEW_CONTACTS,
  delayParts,
  delayFromParts,
  getBranches,
  stepLabel,
  variableInsertion,
  type PreviewContact,
  type SequenceStepDraft,
} from "@/lib/sequence";
import { cn } from "@/lib/utils";
import { StepTypeIcon } from "./SequenceCanvas";
import EmailContentHints from "@/components/dashboard/EmailContentHints";

export interface StepEditorDrawerProps {
  step: SequenceStepDraft | null;
  onClose: () => void;
  onSave: (step: SequenceStepDraft) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  /** Enrolled/imported contacts for the preview (samples used when empty). */
  previewContacts?: PreviewContact[];
  /** Custom-field names for the "My variables" chip group. */
  customFieldNames?: string[];
  /** Sender identity for {my_*} variables, when the host knows it. */
  sender?: TemplateVariables;
  campaignName?: string;
  campaignDescription?: string;
}

const CONNECTION_NOTE_LIMIT = 250;

export function StepEditorDrawer({
  step,
  onClose,
  onSave,
  onDelete,
  onDuplicate,
  previewContacts = [],
  customFieldNames = [],
  sender,
  campaignName = "",
  campaignDescription = "",
}: StepEditorDrawerProps) {
  const [subject, setSubject] = React.useState("");
  const [content, setContent] = React.useState("");
  const [delayValue, setDelayValue] = React.useState("0");
  const [delayUnit, setDelayUnit] = React.useState<"hours" | "days">("hours");
  const [withdrawOn, setWithdrawOn] = React.useState(false);
  const [withdrawDays, setWithdrawDays] = React.useState("14");
  const [previewIdx, setPreviewIdx] = React.useState(0);
  const [showTemplates, setShowTemplates] = React.useState(false);
  const [aiBusy, setAiBusy] = React.useState(false);
  const [aiNotice, setAiNotice] = React.useState<string | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Reset the local draft whenever a different step is opened.
  React.useEffect(() => {
    if (!step) return;
    setSubject(step.subject ?? "");
    setContent(step.content ?? "");
    const parts = delayParts(step.delay_hours);
    setDelayValue(String(parts.value));
    setDelayUnit(parts.unit);
    const withdraw = step.config?.withdraw_after_days;
    setWithdrawOn(typeof withdraw === "number");
    setWithdrawDays(typeof withdraw === "number" ? String(withdraw) : "14");
    setPreviewIdx(0);
    setShowTemplates(false);
    setAiNotice(null);
  }, [step]);

  if (!step) return null;

  const meta = STEP_TYPE_META[step.step_type];
  const isMessage = meta?.message ?? false;
  const isCondition = step.step_type === "condition";
  const branches = isCondition ? getBranches(step) : null;

  const usingSamples = previewContacts.length === 0;
  const contacts = usingSamples ? SAMPLE_PREVIEW_CONTACTS : previewContacts;
  const contact = contacts[Math.min(previewIdx, contacts.length - 1)];

  const previewVars: TemplateVariables = {
    firstName: contact?.firstName,
    lastName: contact?.lastName,
    company: contact?.company,
    jobTitle: contact?.jobTitle,
    customFields: contact?.customFields ?? {},
    ...(sender ?? {}),
  };

  const insertVariable = (token: string) => {
    const insertion = variableInsertion(token);
    const el = textareaRef.current;
    if (!el) {
      setContent((prev) => prev + insertion);
      return;
    }
    const start = el.selectionStart ?? content.length;
    const end = el.selectionEnd ?? content.length;
    const next = content.slice(0, start) + insertion + content.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + insertion.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const handleAiDraft = async () => {
    setAiBusy(true);
    setAiNotice(null);
    try {
      const res = await fetch("/api/ai/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: step.step_type === "email" ? "email" : "linkedin",
          stepType: step.step_type,
          campaignName: campaignName.trim() || undefined,
          campaignGoal: campaignDescription.trim() || undefined,
          existingContent: content,
          lead: { firstName: "Alex", company: "NorthPeak Labs", jobTitle: "VP of Sales" },
        }),
      });
      const data = (await res.json()) as {
        draft?: string | null;
        message?: string;
        error?: string;
      };
      if (data.draft) {
        setContent(data.draft);
        setAiNotice(`${data.message ?? "Draft inserted."} Review and edit before use.`);
      } else {
        setAiNotice(data.message ?? data.error ?? "AI drafting is unavailable right now.");
      }
    } catch {
      setAiNotice("AI drafting request failed (network error). Your text was not changed.");
    } finally {
      setAiBusy(false);
    }
  };

  const handleSave = () => {
    const config: Record<string, unknown> = { ...(step.config ?? {}) };
    if (step.step_type === "connection_request") {
      config.withdraw_after_days = withdrawOn
        ? Math.max(1, Number(withdrawDays) || 14)
        : null;
    }
    onSave({
      ...step,
      subject,
      content: isMessage ? content : step.content,
      delay_hours: delayFromParts(Number(delayValue) || 0, delayUnit),
      config,
    });
  };

  const charCount = content.length;
  const overLimit =
    step.step_type === "connection_request" && charCount > CONNECTION_NOTE_LIMIT;

  const chipGroup = (
    title: string,
    vars: Array<{ token: string; label: string }>
  ) => (
    <div>
      <p className="mb-1.5 text-11 font-medium text-black-400">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {vars.map((v) => (
          <button
            key={v.token}
            type="button"
            onClick={() => insertVariable(v.token)}
            className="rounded-full border border-black-600 bg-black-800 px-2.5 py-1 font-mono text-11 text-purple-200 hover:border-purple-500/60 hover:text-white transition-colors"
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-black-900/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className="absolute right-0 top-0 flex h-full w-[450px] max-w-[94vw] flex-col border-l border-black-600 bg-black-800 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-black-700 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-black-700">
              <StepTypeIcon type={step.step_type} className="h-4.5 w-4.5" />
            </span>
            <div>
              <h3 className="text-15 font-semibold text-white">
                {meta?.label ?? step.step_type}
              </h3>
              <p className="text-11 text-black-400">
                {meta?.channel === "linkedin"
                  ? "LinkedIn step"
                  : meta?.channel === "email"
                    ? "Email step"
                    : "Sequence step"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-black-400 hover:bg-black-700 hover:text-white"
            aria-label="Close editor"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {/* Label / subject */}
          <div>
            <label className="mb-1.5 block text-12 font-medium text-black-300">
              {step.step_type === "email" ? "Subject line" : "Step label"}
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={
                step.step_type === "email"
                  ? "e.g. Quick question, {{first_name}}"
                  : stepLabel({ step_type: step.step_type, subject: "" })
              }
              className="input-field py-2 text-13"
            />
          </div>

          {/* Delay */}
          {!isCondition && (
            <div>
              <label className="mb-1.5 block text-12 font-medium text-black-300">
                Delay before this step
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  value={delayValue}
                  onChange={(e) => setDelayValue(e.target.value)}
                  className="input-field w-24 py-2 text-13"
                  aria-label="Delay value"
                />
                <select
                  value={delayUnit}
                  onChange={(e) => setDelayUnit(e.target.value as "hours" | "days")}
                  className="rounded-xl border border-black-600 bg-black-800 px-3 py-2 text-13 text-white focus:outline-none focus:border-purple-500"
                  aria-label="Delay unit"
                >
                  <option value="hours">hour(s)</option>
                  <option value="days">day(s)</option>
                </select>
                <span className="text-12 text-black-400">
                  after the previous step
                </span>
              </div>
            </div>
          )}

          {isCondition && branches && (
            <div className="space-y-3">
              <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3.5 text-12 leading-relaxed text-amber-200/90">
                This step branches the sequence on whether the prospect has
                accepted your connection request. Both branch flows are stored
                with the campaign. The executor does not evaluate conditions
                yet — it records this step as elapsed — so keep branch steps
                ready for when an authorized LinkedIn provider can report
                connection state.
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(["yes", "no"] as const).map((key) => (
                  <div
                    key={key}
                    className="rounded-xl border border-black-700 bg-black-800/70 p-3"
                  >
                    <p
                      className={cn(
                        "text-11 font-bold uppercase tracking-wide",
                        key === "yes" ? "text-emerald-300" : "text-rose-300"
                      )}
                    >
                      {key === "yes" ? "Yes — connected" : "No — not connected"}
                    </p>
                    <p className="mt-1 text-12 text-black-300">
                      {branches[key].length === 0
                        ? "No steps — sequence ends"
                        : branches[key]
                            .map((s) => stepLabel(s))
                            .join(" → ")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isMessage && (
            <>
              {/* Variables */}
              <div className="space-y-3">
                {chipGroup("Contact variables", CONTACT_VARIABLES)}
                {customFieldNames.length > 0 &&
                  chipGroup(
                    "My variables (from your imported columns)",
                    customFieldNames.map((name) => ({
                      token: name,
                      label: `{${name}}`,
                    }))
                  )}
                {chipGroup("Sender variables", SENDER_VARIABLES)}
                <p className="text-11 leading-relaxed text-black-500">
                  Tip: add a fallback with {"{{first_name:Fallback text}}"} —
                  it is used when a contact has no value for the variable.
                </p>
              </div>

              {/* Message body */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-12 font-medium text-black-300">
                    {step.step_type === "email" ? "Email body" : "Message"}
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowTemplates((v) => !v)}
                      className="inline-flex items-center gap-1 rounded-lg border border-black-600 bg-black-800 px-2 py-1 text-11 font-medium text-black-200 hover:text-white"
                    >
                      <LayoutTemplate className="h-3 w-3" />
                      Use template
                    </button>
                    <button
                      type="button"
                      onClick={handleAiDraft}
                      disabled={aiBusy}
                      className="inline-flex items-center gap-1 rounded-lg border border-purple-500/30 bg-purple-600/20 px-2 py-1 text-11 font-medium text-purple-200 hover:bg-purple-600/40 disabled:opacity-50"
                    >
                      <Sparkles className="h-3 w-3" />
                      {aiBusy ? "Drafting…" : "Draft with AI"}
                    </button>
                  </div>
                </div>

                {showTemplates && (
                  <div className="mb-2 space-y-1.5 rounded-xl border border-black-600 bg-black-900/70 p-2">
                    {(MESSAGE_TEMPLATES[step.step_type] ?? []).map((tpl) => (
                      <button
                        key={tpl.label}
                        type="button"
                        onClick={() => {
                          setContent(tpl.content);
                          if (tpl.subject) setSubject(tpl.subject);
                          setShowTemplates(false);
                        }}
                        className="block w-full rounded-lg px-2.5 py-2 text-left hover:bg-black-700"
                      >
                        <span className="block text-12 font-semibold text-white">
                          {tpl.label}
                        </span>
                        <span className="block truncate text-11 text-black-400">
                          {tpl.content.replace(/\s+/g, " ").slice(0, 90)}…
                        </span>
                      </button>
                    ))}
                    <p className="px-2.5 pb-1 text-11 text-black-500">
                      Choosing a template replaces the current text.
                    </p>
                  </div>
                )}

                <textarea
                  ref={textareaRef}
                  rows={step.step_type === "email" ? 9 : 6}
                  value={content}
                  maxLength={
                    step.step_type === "connection_request"
                      ? CONNECTION_NOTE_LIMIT
                      : undefined
                  }
                  onChange={(e) => setContent(e.target.value)}
                  className="input-field resize-none py-2 text-13 leading-relaxed"
                  placeholder="Write your message… use the variable chips above to personalize it."
                  data-testid="step-content"
                />
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-11 text-black-500">
                    {step.step_type === "connection_request"
                      ? "Connection notes are limited by LinkedIn"
                      : step.step_type === "email"
                        ? "Plain text — variables render per recipient"
                        : "Variables render per recipient"}
                  </span>
                  <span
                    className={cn(
                      "text-11 font-medium",
                      overLimit ? "text-rose-400" : "text-black-400"
                    )}
                    data-testid="char-counter"
                  >
                    {charCount}
                    {step.step_type === "connection_request"
                      ? ` / ${CONNECTION_NOTE_LIMIT}`
                      : " characters"}
                  </span>
                </div>
                {aiNotice && (
                  <p className="mt-1.5 text-11 leading-relaxed text-black-400">
                    {aiNotice}
                  </p>
                )}
                {step.step_type === "email" && (
                  <div className="mt-3">
                    <EmailContentHints
                      subject={subject}
                      body={content}
                      context="campaign"
                    />
                  </div>
                )}
              </div>

              {/* Live preview */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-12 font-medium text-black-300">
                    <Eye className="h-3.5 w-3.5" />
                    Live preview
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={previewIdx === 0}
                      onClick={() => setPreviewIdx((i) => Math.max(0, i - 1))}
                      className="flex h-6 w-6 items-center justify-center rounded-md border border-black-600 text-black-300 hover:text-white disabled:opacity-30"
                      aria-label="Previous contact"
                      data-testid="preview-prev"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <span className="text-11 text-black-400">
                      {previewIdx + 1} / {contacts.length}
                    </span>
                    <button
                      type="button"
                      disabled={previewIdx >= contacts.length - 1}
                      onClick={() =>
                        setPreviewIdx((i) => Math.min(contacts.length - 1, i + 1))
                      }
                      className="flex h-6 w-6 items-center justify-center rounded-md border border-black-600 text-black-300 hover:text-white disabled:opacity-30"
                      aria-label="Next contact"
                      data-testid="preview-next"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="rounded-xl border border-black-700 bg-black-900/70 p-3.5">
                  <p className="text-12 text-black-400">
                    For{" "}
                    <strong className="text-white">
                      {contact
                        ? `${contact.firstName} ${contact.lastName ?? ""}`.trim()
                        : "—"}
                    </strong>
                    {contact?.jobTitle ? ` · ${contact.jobTitle}` : ""}
                    {contact?.company ? ` · ${contact.company}` : ""}
                    {contact?.sample && (
                      <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-10 font-semibold text-amber-300">
                        Sample contact
                      </span>
                    )}
                  </p>
                  {step.step_type === "email" && (
                    <p className="mt-2 text-13 font-semibold text-white">
                      {renderTemplate(subject, previewVars)}
                    </p>
                  )}
                  <p
                    className="mt-1.5 whitespace-pre-wrap text-13 leading-relaxed text-black-100"
                    data-testid="preview-body"
                  >
                    {renderTemplate(content, previewVars)}
                  </p>
                </div>
                {usingSamples && (
                  <p className="mt-1.5 text-11 text-black-500">
                    Previewing with sample contacts — once people are enrolled
                    in this campaign, the preview cycles through them instead.
                  </p>
                )}
              </div>

              {/* Withdraw toggle — connection requests only */}
              {step.step_type === "connection_request" && (
                <div className="rounded-xl border border-black-700 bg-black-800/70 p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-13 font-medium text-white">
                        Withdraw requests after N days
                      </p>
                      <p className="mt-0.5 text-11 leading-relaxed text-black-400">
                        Stored with this step. Withdrawal runs through the
                        connected LinkedIn provider once one is authorized —
                        until then requests are recorded as skipped, so there
                        is nothing to withdraw.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={withdrawOn}
                      data-testid="withdraw-toggle"
                      onClick={() => setWithdrawOn((v) => !v)}
                      className={cn(
                        "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                        withdrawOn ? "bg-purple-600" : "bg-black-600"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all",
                          withdrawOn ? "left-[1.375rem]" : "left-0.5"
                        )}
                      />
                    </button>
                  </div>
                  {withdrawOn && (
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-12 text-black-300">Withdraw after</span>
                      <input
                        type="number"
                        min="1"
                        value={withdrawDays}
                        onChange={(e) => setWithdrawDays(e.target.value)}
                        className="input-field w-20 py-1.5 text-13"
                        aria-label="Withdraw after days"
                      />
                      <span className="text-12 text-black-300">days</span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {!isMessage && !isCondition && (
            <div className="rounded-xl border border-black-700 bg-black-800/70 p-3.5 text-12 leading-relaxed text-black-300">
              {step.step_type === "wait"
                ? "A pure timing step — the sequence simply waits for the delay above before continuing."
                : "This touch runs on LinkedIn. Until an authorized LinkedIn provider is connected, the executor records it as skipped — it is never faked as sent."}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 border-t border-black-700 px-5 py-4">
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-13 font-medium text-rose-300 hover:bg-rose-950/50"
          >
            <Trash2 className="h-4 w-4" />
            Delete step
          </button>
          <button
            type="button"
            onClick={onDuplicate}
            className="inline-flex items-center gap-1.5 rounded-xl bg-black-800 px-3 py-2 text-13 font-medium text-black-200 border border-black-600 hover:text-white"
          >
            <Copy className="h-4 w-4" />
            Duplicate
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-black-800 px-4 py-2 text-13 font-medium text-white border border-black-600 hover:bg-black-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={overLimit}
              className="rounded-xl bg-purple-600 px-5 py-2 text-13 font-semibold text-white shadow-glow-purple hover:bg-purple-500 disabled:opacity-40"
              data-testid="drawer-save"
            >
              Save
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

export default StepEditorDrawer;
