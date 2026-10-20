/**
 * Sequence model — the shared draft shape and tree operations behind
 * the Closely-style sequence canvas (P4 Stage 3).
 *
 * A sequence is a flat list of steps at the top level (that is what
 * the repository stores and the executor walks). A `condition` step
 * additionally keeps its Yes/No branch step-lists inside its own
 * `config` JSONB, under `config.branches = { yes: [...], no: [...] }`,
 * where branch entries are FULL step objects in this same draft
 * shape (recursively — a branch may itself contain a condition).
 * Branch steps are stored data only: the executor never walks them
 * (it records a condition step as elapsed without evaluating it —
 * see src/lib/executor). Save/load must round-trip them untouched.
 *
 * Everything here is pure and unit-tested.
 */

import type { CampaignStep, Lead, StepType } from "@/types";
import type { CampaignStepDraft } from "@/lib/data/campaigns";

// ── Draft shape ─────────────────────────────────────────────────────────────

export interface SequenceStepDraft {
  id: string;
  step_type: StepType;
  delay_hours: number;
  subject: string;
  content: string;
  config: Record<string, unknown>;
}

let uidCounter = 0;
export function newStepId(): string {
  uidCounter += 1;
  return `step-${Date.now().toString(36)}-${uidCounter}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

// ── Step type metadata ──────────────────────────────────────────────────────

export type StepChannelKind = "linkedin" | "email" | "none";

export interface StepTypeMeta {
  label: string;
  channel: StepChannelKind;
  /** Message steps get the full editor drawer (text, variables…). */
  message: boolean;
}

export const STEP_TYPE_META: Record<StepType, StepTypeMeta> = {
  connection_request: { label: "Connection request", channel: "linkedin", message: true },
  linkedin_message: { label: "Message", channel: "linkedin", message: true },
  email: { label: "Email", channel: "email", message: true },
  like_post: { label: "Like post", channel: "linkedin", message: false },
  view_profile: { label: "View profile", channel: "linkedin", message: false },
  endorse_skills: { label: "Endorse skills", channel: "linkedin", message: false },
  wait: { label: "Wait", channel: "none", message: false },
  condition: { label: "Condition: If connected", channel: "none", message: false },
};

/** Step types offered by the canvas "+" picker (Closely's order). */
export const PICKER_STEP_TYPES: StepType[] = [
  "like_post",
  "view_profile",
  "connection_request",
  "linkedin_message",
  "endorse_skills",
  "email",
  "condition",
];

export function stepLabel(step: Pick<SequenceStepDraft, "step_type" | "subject">): string {
  const subject = step.subject?.trim();
  if (subject) return subject;
  return STEP_TYPE_META[step.step_type]?.label ?? step.step_type;
}

// ── Condition branches ──────────────────────────────────────────────────────

export interface ConditionBranches {
  yes: SequenceStepDraft[];
  no: SequenceStepDraft[];
}

export function getBranches(
  step: Pick<SequenceStepDraft, "step_type" | "config">
): ConditionBranches {
  if (step.step_type !== "condition") return { yes: [], no: [] };
  const raw =
    step.config && typeof step.config === "object"
      ? (step.config.branches as Partial<ConditionBranches> | undefined)
      : undefined;
  return {
    yes: Array.isArray(raw?.yes) ? raw!.yes.map(normalizeStep) : [],
    no: Array.isArray(raw?.no) ? raw!.no.map(normalizeStep) : [],
  };
}

export function withBranches(
  step: SequenceStepDraft,
  branches: ConditionBranches
): SequenceStepDraft {
  return {
    ...step,
    config: {
      ...step.config,
      branches: { yes: branches.yes, no: branches.no },
    },
  };
}

/** Fills defaults and recursively normalizes branch steps. */
export function normalizeStep(
  raw: Partial<SequenceStepDraft> & { step_type: StepType }
): SequenceStepDraft {
  const step: SequenceStepDraft = {
    id: typeof raw.id === "string" && raw.id ? raw.id : newStepId(),
    step_type: raw.step_type,
    delay_hours:
      typeof raw.delay_hours === "number" && Number.isFinite(raw.delay_hours)
        ? Math.max(0, raw.delay_hours)
        : 0,
    subject: typeof raw.subject === "string" ? raw.subject : "",
    content: typeof raw.content === "string" ? raw.content : "",
    config:
      raw.config && typeof raw.config === "object" ? { ...raw.config } : {},
  };
  if (step.step_type === "condition") {
    const branches = getBranches(step);
    return withBranches(step, branches);
  }
  return step;
}

export function normalizeSteps(
  steps: Array<Partial<SequenceStepDraft> & { step_type: StepType }>
): SequenceStepDraft[] {
  return steps.map(normalizeStep);
}

// ── Fresh step factory (original starter copy) ──────────────────────────────

export function createStepDraft(type: StepType): SequenceStepDraft {
  const base: SequenceStepDraft = {
    id: newStepId(),
    step_type: type,
    delay_hours: 0,
    subject: "",
    content: "",
    config: {},
  };
  switch (type) {
    case "connection_request":
      return {
        ...base,
        subject: "Connection request",
        content:
          "Hi {{first_name}}, I came across your profile and was impressed by your work at {{company}}. I'd love to connect and exchange notes on what's working in our space.",
      };
    case "linkedin_message":
      return {
        ...base,
        delay_hours: 48,
        subject: "Follow-up message",
        content:
          "Thanks for connecting, {{first_name}}! I work with teams at companies like {{company}} on getting more from their outbound. Happy to share what's been working for us if it's useful.",
      };
    case "email":
      return {
        ...base,
        delay_hours: 72,
        subject: "Quick question, {{first_name}}",
        content:
          "Hi {{first_name}},\n\nI noticed {{company}} is growing the team and wondered how you're handling outreach volume right now. We help teams run LinkedIn and email outreach from one place, without the manual follow-up grind.\n\nWorth a short look?\n\nBest regards",
      };
    case "like_post":
      return { ...base, subject: "Like post" };
    case "view_profile":
      return { ...base, subject: "View profile" };
    case "endorse_skills":
      return { ...base, subject: "Endorse skills" };
    case "wait":
      return { ...base, delay_hours: 24, subject: "Wait" };
    case "condition":
      return withBranches(
        { ...base, subject: "If connected" },
        { yes: [], no: [] }
      );
  }
}

// ── List / step paths ───────────────────────────────────────────────────────
//
// A LIST path addresses a step list: "" is the root list; "2.yes" is
// the Yes branch of root step 2; "2.yes.0.no" nests further. A STEP
// path appends the index within its list: "2.yes.1" is branch step 1
// of root step 2's Yes branch; "0" is the first root step.

export type BranchKey = "yes" | "no";

interface ListSegment {
  index: number;
  branch: BranchKey;
}

export function parseListPath(path: string): ListSegment[] {
  if (!path) return [];
  const parts = path.split(".");
  const segments: ListSegment[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const index = Number(parts[i]);
    const branch = parts[i + 1];
    if (!Number.isInteger(index) || (branch !== "yes" && branch !== "no")) {
      throw new Error(`Invalid sequence list path: ${path}`);
    }
    segments.push({ index, branch });
  }
  return segments;
}

export function joinStepPath(listPath: string, index: number): string {
  return listPath ? `${listPath}.${index}` : String(index);
}

export function splitStepPath(
  stepPath: string
): { listPath: string; index: number } {
  const idx = stepPath.lastIndexOf(".");
  if (idx < 0) return { listPath: "", index: Number(stepPath) };
  return {
    listPath: stepPath.slice(0, idx),
    index: Number(stepPath.slice(idx + 1)),
  };
}

export function getListAt(
  steps: SequenceStepDraft[],
  listPath: string
): SequenceStepDraft[] {
  let list = steps;
  for (const seg of parseListPath(listPath)) {
    const step = list[seg.index];
    if (!step || step.step_type !== "condition") return [];
    list = getBranches(step)[seg.branch];
  }
  return list;
}

export function updateListAt(
  steps: SequenceStepDraft[],
  listPath: string,
  fn: (list: SequenceStepDraft[]) => SequenceStepDraft[]
): SequenceStepDraft[] {
  const segments = parseListPath(listPath);
  if (segments.length === 0) return fn(steps);
  const [head, ...rest] = segments;
  return steps.map((step, i) => {
    if (i !== head.index || step.step_type !== "condition") return step;
    const branches = getBranches(step);
    const childPath = rest
      .map((s) => `${s.index}.${s.branch}`)
      .join(".");
    const updated = updateListAt(branches[head.branch], childPath, fn);
    return withBranches(step, { ...branches, [head.branch]: updated });
  });
}

export function getStepAt(
  steps: SequenceStepDraft[],
  stepPath: string
): SequenceStepDraft | null {
  const { listPath, index } = splitStepPath(stepPath);
  return getListAt(steps, listPath)[index] ?? null;
}

export function updateStepAt(
  steps: SequenceStepDraft[],
  stepPath: string,
  patch: Partial<SequenceStepDraft>
): SequenceStepDraft[] {
  const { listPath, index } = splitStepPath(stepPath);
  return updateListAt(steps, listPath, (list) =>
    list.map((s, i) => (i === index ? normalizeStep({ ...s, ...patch }) : s))
  );
}

export function insertStepAt(
  steps: SequenceStepDraft[],
  listPath: string,
  index: number,
  step: SequenceStepDraft
): SequenceStepDraft[] {
  return updateListAt(steps, listPath, (list) => {
    const next = [...list];
    next.splice(Math.max(0, Math.min(index, next.length)), 0, step);
    return next;
  });
}

export function removeStepAt(
  steps: SequenceStepDraft[],
  stepPath: string
): SequenceStepDraft[] {
  const { listPath, index } = splitStepPath(stepPath);
  return updateListAt(steps, listPath, (list) =>
    list.filter((_, i) => i !== index)
  );
}

/** Duplicates a step (deep — branches included). Returns the new
 *  steps and the path of the copy (inserted right after the source). */
export function duplicateStepAt(
  steps: SequenceStepDraft[],
  stepPath: string
): { steps: SequenceStepDraft[]; copyPath: string } {
  const source = getStepAt(steps, stepPath);
  if (!source) return { steps, copyPath: stepPath };
  const copy = cloneStepWithNewIds(source);
  const { listPath, index } = splitStepPath(stepPath);
  return {
    steps: insertStepAt(steps, listPath, index + 1, copy),
    copyPath: joinStepPath(listPath, index + 1),
  };
}

export function cloneStepWithNewIds(step: SequenceStepDraft): SequenceStepDraft {
  const cloned = normalizeStep({
    ...step,
    id: newStepId(),
    config: JSON.parse(JSON.stringify(step.config ?? {})) as Record<
      string,
      unknown
    >,
  });
  if (cloned.step_type === "condition") {
    const branches = getBranches(cloned);
    return withBranches(cloned, {
      yes: branches.yes.map(cloneStepWithNewIds),
      no: branches.no.map(cloneStepWithNewIds),
    });
  }
  return cloned;
}

// ── Whole-sequence helpers ──────────────────────────────────────────────────

/** Depth-first flattening (root steps, then each condition's branch
 *  steps). Used for summaries/counts — NOT by the executor. */
export function flattenSteps(steps: SequenceStepDraft[]): SequenceStepDraft[] {
  const out: SequenceStepDraft[] = [];
  for (const step of steps) {
    out.push(step);
    if (step.step_type === "condition") {
      const branches = getBranches(step);
      out.push(...flattenSteps(branches.yes), ...flattenSteps(branches.no));
    }
  }
  return out;
}

export function countSteps(steps: SequenceStepDraft[]): number {
  return flattenSteps(steps).length;
}

// ── Delay display (schema stays delay_hours; Closely shows days) ───────────

export function delayParts(delayHours: number): {
  value: number;
  unit: "hours" | "days";
} {
  if (delayHours > 0 && delayHours % 24 === 0) {
    return { value: delayHours / 24, unit: "days" };
  }
  return { value: delayHours, unit: "hours" };
}

export function delayFromParts(value: number, unit: "hours" | "days"): number {
  const v = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  return unit === "days" ? v * 24 : v;
}

export function delayLabel(delayHours: number): string {
  if (delayHours <= 0) return "Immediately";
  const { value, unit } = delayParts(delayHours);
  const noun =
    unit === "days" ? (value === 1 ? "day" : "days") : value === 1 ? "hour" : "hours";
  return `Wait for ${value} ${noun}`;
}

// ── Repository conversions ──────────────────────────────────────────────────

export function campaignStepToDraft(step: CampaignStep): SequenceStepDraft {
  return normalizeStep({
    id: step.id,
    step_type: step.step_type,
    delay_hours: step.delay_hours,
    subject: step.subject ?? "",
    content: step.content ?? "",
    config: step.config ?? {},
  });
}

export function draftToPayload(step: SequenceStepDraft): CampaignStepDraft {
  return {
    step_type: step.step_type,
    delay_hours: step.delay_hours,
    subject: step.subject,
    content: step.content,
    // Branch step-lists ride inside the condition step's config JSONB.
    config: step.config ?? {},
  };
}

// ── Preview contacts (drawer live preview) ──────────────────────────────────

export interface PreviewContact {
  id: string;
  firstName: string;
  lastName?: string;
  jobTitle?: string;
  company?: string;
  email?: string;
  customFields: Record<string, unknown>;
  /** True for the built-in sample contacts (labelled in the UI). */
  sample?: boolean;
}

export function leadToPreviewContact(lead: Lead): PreviewContact {
  return {
    id: lead.id,
    firstName: lead.first_name ?? "",
    lastName: lead.last_name,
    jobTitle: lead.job_title,
    company: lead.company,
    email: lead.email,
    customFields: lead.custom_fields ?? {},
  };
}

/** Clearly-labelled sample contacts, used only when a campaign has no
 *  enrolled leads to preview with. Never presented as real people. */
export const SAMPLE_PREVIEW_CONTACTS: PreviewContact[] = [
  {
    id: "sample-maya",
    firstName: "Maya",
    lastName: "Chen",
    jobTitle: "VP of Sales",
    company: "NorthPeak Labs",
    email: "maya.chen@example.com",
    customFields: { team_size: "40", industry: "SaaS" },
    sample: true,
  },
  {
    id: "sample-daniel",
    firstName: "Daniel",
    lastName: "Okafor",
    jobTitle: "Head of Growth",
    company: "Brightline Systems",
    email: "daniel.okafor@example.com",
    customFields: { team_size: "120", industry: "Fintech" },
    sample: true,
  },
];

/** Union of custom-field names across contacts ("My variables"). */
export function collectCustomFieldNames(
  contacts: PreviewContact[]
): string[] {
  const names = new Set<string>();
  for (const c of contacts) {
    for (const key of Object.keys(c.customFields ?? {})) names.add(key);
  }
  return Array.from(names).sort();
}

// ── Variable chips ──────────────────────────────────────────────────────────

export const CONTACT_VARIABLES: Array<{ token: string; label: string }> = [
  { token: "first_name", label: "{first_name}" },
  { token: "last_name", label: "{last_name}" },
  { token: "job_title", label: "{job_title}" },
  { token: "company_name", label: "{company_name}" },
];

export const SENDER_VARIABLES: Array<{ token: string; label: string }> = [
  { token: "my_first_name", label: "{my_first_name}" },
  { token: "my_last_name", label: "{my_last_name}" },
  { token: "my_job_title", label: "{my_job_title}" },
  { token: "my_company_name", label: "{my_company_name}" },
];

/** What a chip inserts: NxtSend's established double-brace syntax. */
export function variableInsertion(token: string): string {
  return `{{${token}}}`;
}
