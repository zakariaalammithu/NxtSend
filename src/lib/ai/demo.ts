/**
 * Demo-mode drafter.
 *
 * Produces a locally templated sample draft (with the personalization
 * placeholders rendered for a sample lead) so the feature can be
 * experienced in Demo Mode. It is NOT AI output and is always labelled
 * `simulated` — the UI shows that label next to the inserted text.
 */

import type { DraftRequest, DraftResult } from "./types";
import { renderTemplate } from "./prompt";

const TEMPLATES: Record<string, string> = {
  connection_request:
    "Hi {{first_name}}, I work with people in {{job_title}} roles at companies like {{company}} on booking more sales meetings from LinkedIn. Would love to connect and share what's working.",
  linkedin_message:
    "Thanks for connecting, {{first_name}}! Quick question — how is {{company}} handling LinkedIn outreach today? We put together a short playbook on multichannel sequences that people in similar roles have found useful. Happy to send it over.",
  email:
    "Hi {{first_name}},\n\nNoticed {{company}} is growing its sales motion — most people in {{job_title}} roles I speak with say LinkedIn outreach is hard to run consistently alongside everything else.\n\nWe help teams automate the repetitive parts while keeping messages personal. Open to a 15-minute look this week?\n\nBest regards",
  follow_up:
    "Hi {{first_name}}, floating this back to the top of your inbox — I know things get busy in {{job_title}} roles. If LinkedIn outreach consistency is still a pain at {{company}}, I'm happy to share the short playbook I mentioned. Either way, no hard feelings if the timing isn't right.",
};

export function demoDraft(input: DraftRequest): DraftResult {
  const template =
    TEMPLATES[input.stepType] ??
    (input.channel === "email" ? TEMPLATES.email : TEMPLATES.linkedin_message);
  const draft = renderTemplate(template, input.lead ?? {});
  return {
    status: "simulated",
    provider: null,
    draft,
    aiGenerated: false,
    message:
      "Demo Mode sample draft (locally templated — NOT AI-generated and NOT sent). Configure OPENAI_API_KEY or ANTHROPIC_API_KEY for real AI drafting.",
  };
}
