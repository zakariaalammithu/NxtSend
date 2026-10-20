/**
 * Sequence templates + message templates (P4 Stage 3).
 *
 * The template NAMES and flow structures follow the Closely gallery
 * the owner provided (Mutual Connection, Profile Visit Connect, …).
 * Every word of message copy is ORIGINAL NxtSend copy written for
 * these templates — nothing is taken from Closely's texts.
 *
 * Templates are plain draft factories: each call returns fresh step
 * objects with new ids, ready to drop into the canvas.
 */

import type { StepType } from "@/types";
import {
  createStepDraft,
  newStepId,
  normalizeStep,
  withBranches,
  type SequenceStepDraft,
} from "@/lib/sequence";

export interface SequenceTemplate {
  id: string;
  name: string;
  channels: Array<"linkedin" | "email">;
  blurb: string;
  build: () => SequenceStepDraft[];
}

function t(
  type: StepType,
  delayHours: number,
  subject: string,
  content = ""
): SequenceStepDraft {
  return normalizeStep({
    ...createStepDraft(type),
    id: newStepId(),
    delay_hours: delayHours,
    subject,
    content,
  });
}

function condition(
  delayHours: number,
  yes: SequenceStepDraft[],
  no: SequenceStepDraft[]
): SequenceStepDraft {
  return withBranches(
    t("condition", delayHours, "If connected"),
    { yes, no }
  );
}

export const SEQUENCE_TEMPLATES: SequenceTemplate[] = [
  {
    id: "mutual-connection",
    name: "Mutual Connection",
    channels: ["linkedin"],
    blurb:
      "Open with a connection request that leans on shared ground, then branch on whether they accept.",
    build: () => [
      t(
        "connection_request",
        0,
        "Connection request",
        "Hi {{first_name}}, we seem to run in some of the same circles here, and I keep seeing thoughtful posts from people at {{company}}. I'd value having you in my network."
      ),
      condition(
        24,
        [
          t(
            "linkedin_message",
            0,
            "Welcome message",
            "Great to be connected, {{first_name}}. I spend my days helping outreach teams book more conversations without burning their domain or their list — happy to swap notes whenever it's useful."
          ),
        ],
        [
          t("view_profile", 0, "View profile"),
          t("like_post", 24, "Like a recent post"),
        ]
      ),
    ],
  },
  {
    id: "profile-visit-connect",
    name: "Profile Visit Connect",
    channels: ["linkedin"],
    blurb:
      "Warm the profile first with a visit, then send the request a day later and follow up on acceptance.",
    build: () => [
      t("view_profile", 0, "View profile"),
      t(
        "connection_request",
        24,
        "Connection request",
        "Hello {{first_name}} — your profile caught my eye while I was looking at leaders in your space. I'd enjoy connecting and following what you're building at {{company}}."
      ),
      condition(
        48,
        [
          t(
            "linkedin_message",
            0,
            "Intro message",
            "Thanks for accepting, {{first_name}}. I'll keep this brief: we help teams turn LinkedIn into a steady pipeline channel. If that's on your roadmap this quarter, I'd be glad to share how others approach it."
          ),
        ],
        []
      ),
    ],
  },
  {
    id: "email-linkedin-outreach",
    name: "Email & LinkedIn Outreach",
    channels: ["linkedin", "email"],
    blurb:
      "A multichannel rhythm: connect on LinkedIn, land in the inbox, then alternate until one channel answers.",
    build: () => [
      t(
        "connection_request",
        0,
        "Connection request",
        "Hi {{first_name}}, I follow the work coming out of {{company}} and would love to connect. I share practical outbound ideas here most weeks."
      ),
      t(
        "email",
        48,
        "A short intro from {{company_name}} outreach",
        "Hi {{first_name}},\n\nReaching out because teams similar to {{company}} usually tell us the same thing: LinkedIn works, but following up consistently eats the week. NxtSend runs the sequence across LinkedIn and email so no warm reply slips away.\n\nOpen to a two-minute look at how it would run for your team?\n\nBest regards"
      ),
      t(
        "linkedin_message",
        72,
        "LinkedIn follow-up",
        "Hi {{first_name}}, floating my note back to the top here. If outbound consistency is a pain point at {{company}}, I can send over a short teardown of what a joined-up LinkedIn + email sequence looks like."
      ),
      t(
        "email",
        96,
        "Closing the loop",
        "Hi {{first_name}},\n\nI'll close the loop after this one. If pipeline from outbound is a priority later this year, reply here and I'll put together a sample sequence for {{company}} — no pitch deck, just the working draft.\n\nThanks for your time"
      ),
    ],
  },
  {
    id: "standard-connect",
    name: "Standard Connect",
    channels: ["linkedin"],
    blurb:
      "The dependable default: a clean connection request, a pause, then a branch on acceptance.",
    build: () => [
      t(
        "connection_request",
        0,
        "Connection request",
        "Hi {{first_name}}, I'd like to add you to my professional network. I work with revenue teams and often share what's working in B2B outreach."
      ),
      condition(
        48,
        [
          t(
            "linkedin_message",
            0,
            "First message",
            "Appreciate the connection, {{first_name}}. Quick question: how is {{company}} handling follow-ups after the first touch? It's the step we see most teams lose replies on, and I'd enjoy hearing your take."
          ),
        ],
        [t("view_profile", 0, "View profile")]
      ),
    ],
  },
  {
    id: "connection-request-outreach",
    name: "Connection Request Outreach",
    channels: ["linkedin"],
    blurb:
      "A straight-line LinkedIn push: request, a considered follow-up message, then a light engagement touch.",
    build: () => [
      t(
        "connection_request",
        0,
        "Connection request",
        "Hello {{first_name}}, I'm building my network of people leading growth and sales teams, and your role at {{company}} stood out. Would be great to connect."
      ),
      t(
        "linkedin_message",
        72,
        "Follow-up message",
        "Hi {{first_name}}, thanks for connecting. I put together a short breakdown of the sequence structure our best-performing customers use — three touches, no spam signals. Want me to send it your way?"
      ),
      t("like_post", 48, "Like a recent post"),
    ],
  },
  {
    id: "like-to-connect",
    name: "Like-to-Connect",
    channels: ["linkedin"],
    blurb:
      "Engage before you ask: like a post, visit the profile, and only then send the connection request.",
    build: () => [
      t("like_post", 0, "Like a recent post"),
      t("view_profile", 24, "View profile"),
      t(
        "connection_request",
        24,
        "Connection request",
        "Hi {{first_name}}, I've been enjoying your recent posts — the perspective from inside {{company}} is refreshingly practical. I'd love to connect and keep the conversation going."
      ),
    ],
  },
  {
    id: "email-outreach-series",
    name: "Email Outreach Series",
    channels: ["email"],
    blurb:
      "A focused three-email arc: value first, a concrete proof point second, a graceful break-up last.",
    build: () => [
      t(
        "email",
        0,
        "How {{company}} could double follow-up coverage",
        "Hi {{first_name}},\n\nMost teams we talk to send a strong first email and then let follow-ups slide when the week gets busy. NxtSend keeps every touch on schedule across email and LinkedIn, so interested replies actually get a second and third chance.\n\nWorth seeing how it would map to your current playbook?\n\nBest regards"
      ),
      t(
        "email",
        72,
        "The follow-up gap, in numbers",
        "Hi {{first_name}},\n\nA pattern we see again and again: the majority of replies arrive on touch two or three, yet most sequences stop after one. A structured series — like this one — quietly captures the responses a single email leaves behind.\n\nI can draft a three-step version for {{company}} if you'd like to judge it on the copy alone.\n\nBest regards"
      ),
      t(
        "email",
        96,
        "Should I close the file, {{first_name}}?",
        "Hi {{first_name}},\n\nI've reached out a couple of times about running outreach as one sequence instead of scattered touches. If the timing is off, no hard feelings — a quick \"not now\" and I'll close the file.\n\nIf it IS on your list, one reply gets you a working sample sequence for {{company}}.\n\nThanks either way"
      ),
    ],
  },
  {
    id: "post-stumble-connect",
    name: "Post Stumble Connect",
    channels: ["linkedin"],
    blurb:
      "Start from their content: like the post that caught your eye, connect, then branch on the response.",
    build: () => [
      t("like_post", 0, "Like their post"),
      t(
        "connection_request",
        24,
        "Connection request",
        "Hi {{first_name}}, your recent post landed with me — it's rare to see the unvarnished version of how teams actually run outreach. I'd love to connect and keep reading."
      ),
      condition(
        48,
        [
          t(
            "linkedin_message",
            0,
            "Message after connecting",
            "Thanks for connecting, {{first_name}}. Your post touched on something we think about a lot: consistency beats intensity in outbound. If you ever want to compare notes on sequence design, my inbox is open."
          ),
        ],
        [t("view_profile", 0, "View profile")]
      ),
    ],
  },
];

// ── Message templates (the editor drawer's "Use template" library) ─────────

export interface MessageTemplate {
  label: string;
  subject?: string;
  content: string;
}

/** Original one-click message starters, keyed by message step type. */
export const MESSAGE_TEMPLATES: Partial<Record<StepType, MessageTemplate[]>> = {
  connection_request: [
    {
      label: "Shared circles",
      content:
        "Hi {{first_name}}, we move in some of the same circles here and I always learn from your posts. I'd be glad to have you in my network.",
    },
    {
      label: "Admire the work",
      content:
        "Hello {{first_name}} — the work you're doing at {{company}} caught my attention. I'd love to connect and follow along.",
    },
    {
      label: "Direct and short",
      content:
        "Hi {{first_name}}, I connect with people leading teams like yours to share what's working in outbound right now. Keen to connect if you are.",
    },
  ],
  linkedin_message: [
    {
      label: "Warm opener",
      content:
        "Thanks for connecting, {{first_name}}! I won't pitch you in the first message — just glad to be in touch. If outbound is ever a topic at {{company}}, I'm a decent sounding board.",
    },
    {
      label: "Useful resource",
      content:
        "Hi {{first_name}}, since we connected I thought I'd share something genuinely useful: a one-page breakdown of the follow-up cadence our customers use to lift reply rates. Want the link?",
    },
    {
      label: "Soft question",
      content:
        "Quick one, {{first_name}}: when a prospect goes quiet after the first touch, what does your team do today? We're mapping how different teams handle it and I'd value your answer.",
    },
  ],
  email: [
    {
      label: "Problem-first intro",
      subject: "The follow-up gap at {{company}}",
      content:
        "Hi {{first_name}},\n\nMost outbound teams lose more replies to missed follow-ups than to bad first emails. NxtSend runs LinkedIn and email as one sequence, so every touch lands on time without the manual chasing.\n\nOpen to a short walkthrough tailored to {{company}}?\n\nBest regards",
    },
    {
      label: "Short and plain",
      subject: "Quick question, {{first_name}}",
      content:
        "Hi {{first_name}},\n\nHow does your team currently keep LinkedIn and email outreach in sync? We built NxtSend to run both from a single sequence — happy to show you the shape of it in two minutes.\n\nWorth a look?\n\nBest regards",
    },
    {
      label: "Graceful break-up",
      subject: "Closing the loop",
      content:
        "Hi {{first_name}},\n\nI've sent a couple of notes and don't want to crowd your inbox. If coordinated outreach is a priority this quarter, reply and I'll draft a sample sequence for {{company}}. If not, I'll close the file with thanks.\n\nAll the best",
    },
  ],
};
