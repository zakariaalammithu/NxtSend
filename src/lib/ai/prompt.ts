/**
 * Prompt construction + template personalization (pure, unit-tested).
 */

import type { DraftRequest } from "./types";

export const DRAFT_SYSTEM_PROMPT = [
  "You are an expert B2B outreach copywriter for the NxtSend platform.",
  "Write ONE short, human-sounding outreach message draft.",
  "Rules:",
  "- Keep the personalization placeholders {{first_name}}, {{company}} and {{job_title}} literally in the text so the message works as a reusable template.",
  "- No hype, no false claims, no invented facts about the recipient.",
  "- LinkedIn connection notes: under 300 characters. LinkedIn messages: under 600 characters. Emails: under 120 words, plain paragraphs.",
  "- Output ONLY the message text — no subject line, no explanations, no quotation marks around it.",
].join("\n");

export function buildDraftUserPrompt(input: DraftRequest): string {
  const parts: string[] = [];
  parts.push(
    `Channel: ${input.channel}. Sequence step type: ${input.stepType}.`
  );
  if (input.campaignName) parts.push(`Campaign: "${input.campaignName}".`);
  if (input.campaignGoal) parts.push(`Campaign goal: ${input.campaignGoal}.`);
  if (input.lead?.company || input.lead?.jobTitle) {
    parts.push(
      `Typical recipient: ${input.lead?.jobTitle ?? "a decision-maker"} at {{company}}.`
    );
  }
  if (input.existingContent?.trim()) {
    parts.push(
      `Improve this existing draft, keeping its intent:\n---\n${input.existingContent.trim()}\n---`
    );
  } else {
    parts.push("Write a fresh first draft.");
  }
  return parts.join("\n");
}

/**
 * Variables available to message templates.
 *
 * Contact variables resolve from the recipient lead; sender ("my_*")
 * variables resolve from the sending account's profile (connected
 * accounts, migration 011 — callers pass them in; absent values
 * render their fallback or empty); any other name resolves from the
 * lead's custom fields (e.g. extra CSV columns captured on import).
 */
export interface TemplateVariables {
  firstName?: string;
  lastName?: string;
  company?: string;
  jobTitle?: string;
  myFirstName?: string;
  myLastName?: string;
  myJobTitle?: string;
  myCompanyName?: string;
  customFields?: Record<string, unknown>;
}

/** Built-in fallbacks used when neither a value nor an inline
 *  `{var:Fallback}` is present. Unknown variables without a custom
 *  field or fallback are left untouched so typos stay visible. */
const VARIABLE_DEFAULTS: Record<string, string> = {
  first_name: "there",
  company: "your company",
  company_name: "your company",
  job_title: "your role",
  last_name: "",
  my_first_name: "",
  my_last_name: "",
  my_job_title: "",
  my_company_name: "",
};

function variableValue(
  name: string,
  vars: TemplateVariables
): string | undefined {
  switch (name) {
    case "first_name":
      return vars.firstName;
    case "last_name":
      return vars.lastName;
    case "company":
    case "company_name":
      return vars.company;
    case "job_title":
      return vars.jobTitle;
    case "my_first_name":
      return vars.myFirstName;
    case "my_last_name":
      return vars.myLastName;
    case "my_job_title":
      return vars.myJobTitle;
    case "my_company_name":
      return vars.myCompanyName;
    default: {
      const custom = vars.customFields?.[name];
      return custom === undefined || custom === null
        ? undefined
        : String(custom);
    }
  }
}

// Matches {{name}}, {{name:Fallback text}}, {name} and
// {name:Fallback text}. Double-brace is NxtSend's established syntax;
// single-brace is accepted so Closely-style chips/text also render.
const VARIABLE_PATTERN =
  /\{\{\s*([A-Za-z0-9_]+)\s*(?::([^{}]*))?\}\}|\{\s*([A-Za-z0-9_]+)\s*(?::([^{}]*))?\}/g;

/**
 * Renders template placeholders with lead/sender values (used by the
 * executor, the demo drafter and the sequence builder's live preview).
 *
 * Supported: {{first_name}} {{last_name}} {{company}} {{company_name}}
 * {{job_title}}, sender variables {{my_first_name}} {{my_last_name}}
 * {{my_job_title}} {{my_company_name}}, custom fields by name, and the
 * fallback syntax {{first_name:Fallback text}} — the fallback is used
 * whenever the variable has no value.
 */
export function renderTemplate(
  template: string,
  vars: TemplateVariables
): string {
  return template.replace(
    VARIABLE_PATTERN,
    (match, dName, dFallback, sName, sFallback) => {
      const name = (dName ?? sName) as string;
      const rawFallback = (dName !== undefined ? dFallback : sFallback) as
        | string
        | undefined;
      const fallback =
        rawFallback === undefined ? undefined : rawFallback.trim();
      const value = variableValue(name, vars);
      if (value !== undefined && value !== "") return value;
      if (fallback !== undefined) return fallback;
      if (value !== undefined) return value; // defined-but-empty stays empty
      return VARIABLE_DEFAULTS[name] ?? match;
    }
  );
}
