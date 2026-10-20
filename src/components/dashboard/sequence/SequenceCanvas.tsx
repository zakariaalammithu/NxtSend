"use client";

/**
 * SequenceCanvas — the Closely-style dotted-grid canvas that renders
 * a sequence as a vertical node flow (P4 Stage 3):
 *
 *   "Start of sequence" → nodes → "End of sequence"
 *
 * Each node carries a delay header ("Immediately" / "Wait for N
 * day(s)", inline editable), the step-type icon + label and a message
 * preview snippet. Condition nodes fan out into Yes/No branch columns
 * (rendered recursively from the branch step-lists stored in the
 * condition's config) that merge back into the main flow. "+" buttons
 * between nodes open the step-type picker. Read-only mode renders the
 * same flow for the template preview (no editing affordances).
 */

import * as React from "react";
import {
  Award,
  Check,
  ChevronRight,
  Clock,
  Eye,
  GitBranch,
  Linkedin,
  Mail,
  MessageSquare,
  Minus,
  Pencil,
  Play,
  Plus,
  Square,
  ThumbsUp,
} from "lucide-react";
import type { StepType } from "@/types";
import {
  STEP_TYPE_META,
  PICKER_STEP_TYPES,
  createStepDraft,
  delayLabel,
  delayParts,
  delayFromParts,
  getBranches,
  insertStepAt,
  joinStepPath,
  stepLabel,
  updateStepAt,
  type SequenceStepDraft,
} from "@/lib/sequence";
import { cn } from "@/lib/utils";

// ── Step type icon ──────────────────────────────────────────────────────────

export function StepTypeIcon({
  type,
  className = "h-4 w-4",
}: {
  type: StepType;
  className?: string;
}) {
  switch (type) {
    case "connection_request":
      return <Linkedin className={cn(className, "text-blue-400")} />;
    case "linkedin_message":
      return <MessageSquare className={cn(className, "text-sky-400")} />;
    case "email":
      return <Mail className={cn(className, "text-purple-400")} />;
    case "like_post":
      return <ThumbsUp className={cn(className, "text-rose-400")} />;
    case "view_profile":
      return <Eye className={cn(className, "text-teal-400")} />;
    case "endorse_skills":
      return <Award className={cn(className, "text-amber-400")} />;
    case "wait":
      return <Clock className={cn(className, "text-orange-400")} />;
    case "condition":
      return <GitBranch className={cn(className, "text-amber-300")} />;
    default:
      return <MessageSquare className={cn(className, "text-purple-400")} />;
  }
}

// ── Delay header (inline editable) ──────────────────────────────────────────

export function DelayEditor({
  delayHours,
  onChange,
  readOnly = false,
}: {
  delayHours: number;
  onChange?: (hours: number) => void;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = React.useState(false);
  const parts = delayParts(delayHours);
  const [value, setValue] = React.useState(String(parts.value));
  const [unit, setUnit] = React.useState<"hours" | "days">(parts.unit);

  React.useEffect(() => {
    const p = delayParts(delayHours);
    setValue(String(p.value));
    setUnit(p.unit);
  }, [delayHours]);

  if (readOnly || !onChange) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-black-600 bg-black-800 px-3 py-1 text-11 font-medium text-black-200">
        <Clock className="h-3 w-3 text-black-400" />
        {delayLabel(delayHours)}
      </span>
    );
  }

  if (!editing) {
    return (
      <button
        type="button"
        data-testid="delay-pill"
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        className="group inline-flex items-center gap-1.5 rounded-full border border-black-600 bg-black-800 px-3 py-1 text-11 font-medium text-black-200 hover:border-purple-500/50 hover:text-white transition-colors"
        title="Edit delay"
      >
        <Clock className="h-3 w-3 text-black-400" />
        {delayLabel(delayHours)}
        <Pencil className="h-3 w-3 text-black-500 group-hover:text-purple-300" />
      </button>
    );
  }

  const commit = () => {
    onChange(delayFromParts(Number(value) || 0, unit));
    setEditing(false);
  };

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/50 bg-black-800 px-2 py-0.5"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="text-11 text-black-300 pl-1">Wait for</span>
      <input
        type="number"
        min="0"
        value={value}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-14 rounded-md border border-black-600 bg-black-900 px-1.5 py-0.5 text-12 text-white focus:outline-none focus:border-purple-500"
        aria-label="Delay value"
      />
      <select
        value={unit}
        onChange={(e) => setUnit(e.target.value as "hours" | "days")}
        className="rounded-md border border-black-600 bg-black-900 px-1 py-0.5 text-12 text-white focus:outline-none focus:border-purple-500"
        aria-label="Delay unit"
      >
        <option value="hours">hour(s)</option>
        <option value="days">day(s)</option>
      </select>
      <button
        type="button"
        onClick={commit}
        className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-600 text-white hover:bg-purple-500"
        title="Apply delay"
      >
        <Check className="h-3 w-3" />
      </button>
    </span>
  );
}

// ── Step-type picker ────────────────────────────────────────────────────────

function StepTypePicker({
  onPick,
  onClose,
}: {
  onPick: (type: StepType) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} aria-hidden="true" />
      <div className="absolute left-1/2 top-full z-40 mt-1 w-60 -translate-x-1/2 rounded-xl border border-black-600 bg-black-800 p-1.5 shadow-2xl">
        {PICKER_STEP_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => onPick(type)}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-13 text-black-100 hover:bg-black-700 transition-colors"
          >
            <StepTypeIcon type={type} className="h-4 w-4 shrink-0" />
            <span>{STEP_TYPE_META[type].label}</span>
            <ChevronRight className="ml-auto h-3.5 w-3.5 text-black-500" />
          </button>
        ))}
      </div>
    </>
  );
}

// ── Canvas ──────────────────────────────────────────────────────────────────

export interface SequenceCanvasProps {
  steps: SequenceStepDraft[];
  onStepsChange?: (steps: SequenceStepDraft[]) => void;
  selectedPath?: string | null;
  onSelectStep?: (stepPath: string) => void;
  readOnly?: boolean;
}

const ZOOM_LEVELS = [0.75, 1, 1.25];

export function SequenceCanvas({
  steps,
  onStepsChange,
  selectedPath,
  onSelectStep,
  readOnly = false,
}: SequenceCanvasProps) {
  const editable = !readOnly && Boolean(onStepsChange);
  const [zoomIdx, setZoomIdx] = React.useState(1);
  const zoom = ZOOM_LEVELS[zoomIdx];
  const [pickerAt, setPickerAt] = React.useState<{
    listPath: string;
    index: number;
  } | null>(null);

  const handlePick = (type: StepType) => {
    if (!pickerAt || !onStepsChange) return;
    const step = createStepDraft(type);
    const next = insertStepAt(steps, pickerAt.listPath, pickerAt.index, step);
    onStepsChange(next);
    setPickerAt(null);
    onSelectStep?.(joinStepPath(pickerAt.listPath, pickerAt.index));
  };

  const renderInsert = (listPath: string, index: number, label?: string) => {
    if (!editable) return null;
    const isOpen =
      pickerAt?.listPath === listPath && pickerAt?.index === index;
    return (
      <div className="relative flex justify-center py-1" key={`ins-${listPath}-${index}`}>
        <button
          type="button"
          data-testid="insert-step"
          onClick={() => setPickerAt(isOpen ? null : { listPath, index })}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border border-dashed border-black-500 bg-black-800 px-2.5 py-1 text-11 font-medium text-black-300 hover:border-purple-400 hover:text-white transition-colors",
            isOpen && "border-purple-400 text-white"
          )}
          title="Insert a step here"
        >
          <Plus className="h-3 w-3" />
          {label ?? "Add step"}
        </button>
        {isOpen && <StepTypePicker onPick={handlePick} onClose={() => setPickerAt(null)} />}
      </div>
    );
  };

  const renderConnector = (key: string) => (
    <div key={key} className="flex justify-center" aria-hidden="true">
      <div className="h-5 w-px bg-black-500/70" />
    </div>
  );

  const renderNode = (
    step: SequenceStepDraft,
    listPath: string,
    index: number
  ): React.ReactNode => {
    const stepPath = joinStepPath(listPath, index);
    const meta = STEP_TYPE_META[step.step_type];
    const selected = selectedPath === stepPath;
    const snippet = step.content?.trim();
    return (
      <div key={step.id} className="flex w-full flex-col items-center">
        <DelayEditor
          delayHours={step.delay_hours}
          readOnly={!editable}
          onChange={
            editable
              ? (hours) =>
                  onStepsChange?.(updateStepAt(steps, stepPath, { delay_hours: hours }))
              : undefined
          }
        />
        {renderConnector(`c-${stepPath}`)}
        <button
          type="button"
          data-testid="canvas-node"
          data-step-type={step.step_type}
          onClick={() => onSelectStep?.(stepPath)}
          className={cn(
            "w-full rounded-2xl border bg-black-800/90 p-4 text-left transition-colors",
            step.step_type === "condition"
              ? "border-amber-500/50 bg-amber-950/20"
              : "border-black-600",
            selected
              ? "ring-2 ring-purple-500 border-purple-500"
              : "hover:border-purple-500/40",
            !onSelectStep && "cursor-default"
          )}
        >
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black-700">
              <StepTypeIcon type={step.step_type} className="h-4.5 w-4.5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-14 font-semibold text-white">
                {stepLabel(step)}
              </span>
              <span className="block text-11 text-black-400">
                {meta?.label ?? step.step_type}
                {meta?.channel === "linkedin" ? " · LinkedIn" : meta?.channel === "email" ? " · Email" : ""}
              </span>
            </span>
          </div>
          {snippet && (
            <p className="mt-2.5 line-clamp-2 text-12 leading-relaxed text-black-300">
              {snippet}
            </p>
          )}
          {step.step_type === "condition" && (
            <p className="mt-2 text-11 text-amber-300/90">
              Branches on whether the prospect has connected
            </p>
          )}
        </button>

        {step.step_type === "condition" && renderBranches(step, stepPath)}
      </div>
    );
  };

  const renderBranches = (step: SequenceStepDraft, stepPath: string) => {
    const branches = getBranches(step);
    return (
      <div className="w-full">
        {renderConnector(`cb-${stepPath}`)}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {(["yes", "no"] as const).map((key) => {
            const branchListPath = `${stepPath}.${key}`;
            const list = branches[key];
            return (
              <div
                key={key}
                data-testid={`branch-${key}`}
                className={cn(
                  "rounded-2xl border p-3",
                  key === "yes"
                    ? "border-emerald-500/30 bg-emerald-950/10"
                    : "border-rose-500/30 bg-rose-950/10"
                )}
              >
                <div className="mb-2 flex justify-center">
                  <span
                    className={cn(
                      "rounded-full px-3 py-1 text-11 font-bold uppercase tracking-wide",
                      key === "yes"
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-rose-500/15 text-rose-300"
                    )}
                  >
                    {key === "yes" ? "Yes — connected" : "No — not connected"}
                  </span>
                </div>
                <div className="flex flex-col items-center">
                  {list.map((branchStep, i) => (
                    <React.Fragment key={branchStep.id}>
                      {renderInsert(branchListPath, i)}
                      {renderNode(branchStep, branchListPath, i)}
                      {renderConnector(`bc-${branchListPath}-${i}`)}
                    </React.Fragment>
                  ))}
                  {renderInsert(branchListPath, list.length, "Add a new step")}
                  {list.length === 0 && !editable && (
                    <p className="py-2 text-center text-12 text-black-400">
                      No steps — the sequence ends here.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {renderConnector(`cm-${stepPath}`)}
      </div>
    );
  };

  return (
    <div className="relative">
      {/* Zoom control */}
      <div className="absolute right-3 top-3 z-20 flex items-center gap-1 rounded-full border border-black-600 bg-black-800/90 px-2 py-1">
        <button
          type="button"
          disabled={zoomIdx === 0}
          onClick={() => setZoomIdx((i) => Math.max(0, i - 1))}
          className="flex h-6 w-6 items-center justify-center rounded-full text-black-300 hover:text-white disabled:opacity-30"
          aria-label="Zoom out"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="min-w-[2.5rem] text-center text-12 font-medium text-black-200">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          disabled={zoomIdx === ZOOM_LEVELS.length - 1}
          onClick={() =>
            setZoomIdx((i) => Math.min(ZOOM_LEVELS.length - 1, i + 1))
          }
          className="flex h-6 w-6 items-center justify-center rounded-full text-black-300 hover:text-white disabled:opacity-30"
          aria-label="Zoom in"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div
        className="overflow-auto rounded-2xl border border-black-700 bg-black-900/60 px-4 py-8 sm:px-8"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.09) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
        data-testid="sequence-canvas"
      >
        <div style={{ zoom }} className="mx-auto max-w-xl">
          <div className="flex flex-col items-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-purple-600 px-4 py-1.5 text-12 font-semibold text-white shadow-glow-purple">
              <Play className="h-3.5 w-3.5" />
              Start of sequence
            </span>
            {renderConnector("start")}
            {steps.map((step, i) => (
              <React.Fragment key={step.id}>
                {renderInsert("", i)}
                {renderNode(step, "", i)}
                {renderConnector(`m-${step.id}`)}
              </React.Fragment>
            ))}
            {renderInsert("", steps.length, "Add a new step")}
            {steps.length === 0 && (
              <p className="py-3 text-center text-13 text-black-400">
                This sequence is empty.
              </p>
            )}
            <span className="inline-flex items-center gap-2 rounded-full border border-black-500 bg-black-800 px-4 py-1.5 text-12 font-semibold text-black-200">
              <Square className="h-3.5 w-3.5" />
              End of sequence
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SequenceCanvas;
