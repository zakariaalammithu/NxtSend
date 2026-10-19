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
 * Renders {{first_name}} / {{company}} / {{job_title}} placeholders with
 * sample lead values (used by the demo drafter and previews).
 */
export function renderTemplate(
  template: string,
  lead: { firstName?: string; company?: string; jobTitle?: string }
): string {
  return template
    .replaceAll("{{first_name}}", lead.firstName ?? "there")
    .replaceAll("{{company}}", lead.company ?? "your company")
    .replaceAll("{{job_title}}", lead.jobTitle ?? "your role");
}
