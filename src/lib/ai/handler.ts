/**
 * POST /api/ai/draft — request handling logic (unit-testable).
 *
 * Guard order:
 *   1. Demo mode: no session exists by design -> return the labelled
 *      simulated draft.
 *   2. Live mode: an authenticated session is REQUIRED (401 without),
 *      and suspended accounts are refused (403).
 *   3. Body validation (400 on malformed input).
 *   4. Draft orchestration (demo/not_configured/ok/error states are in
 *      the JSON body; HTTP stays 200 so the UI can render the state).
 */

import { draftOutreachMessage } from "./index";
import type { DraftRequest, DraftResult } from "./types";
import type { DataMode } from "@/lib/data/mode";

export interface DraftHttpResult {
  status: number;
  body: Record<string, unknown>;
}

function cap(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  return v ? v.slice(0, max) : undefined;
}

export function parseDraftRequest(body: unknown): DraftRequest | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const stepType = cap(b.stepType, 40);
  if (!stepType) return null;
  const channel =
    b.channel === "email" || stepType === "email" ? "email" : "linkedin";
  const leadRaw = (b.lead ?? {}) as Record<string, unknown>;
  return {
    channel,
    stepType,
    campaignName: cap(b.campaignName, 120),
    campaignGoal: cap(b.campaignGoal, 300),
    existingContent: cap(b.existingContent, 4000),
    lead: {
      firstName: cap(leadRaw.firstName, 80),
      company: cap(leadRaw.company, 120),
      jobTitle: cap(leadRaw.jobTitle, 120),
    },
  };
}

export async function handleDraftRequest(args: {
  mode: DataMode;
  user: { id: string; status?: string } | null;
  body: unknown;
  /** Test seam: defaults to the real orchestration. */
  draftFn?: (input: DraftRequest) => Promise<DraftResult>;
}): Promise<DraftHttpResult> {
  if (args.mode !== "demo" && !args.user) {
    return { status: 401, body: { error: "Unauthorized: sign in to use AI drafting." } };
  }
  if (args.user?.status === "suspended") {
    return { status: 403, body: { error: "Forbidden: this account is suspended." } };
  }
  const input = parseDraftRequest(args.body);
  if (!input) {
    return {
      status: 400,
      body: { error: "Invalid request: a stepType is required." },
    };
  }
  const result = await (args.draftFn ?? draftOutreachMessage)(input);
  return {
    status: 200,
    body: {
      state:
        result.status === "simulated"
          ? "demo"
          : result.status === "ok"
            ? "connected"
            : result.status,
      provider: result.provider,
      draft: result.draft,
      aiGenerated: result.aiGenerated,
      message: result.message,
      reviewRequired: true,
    },
  };
}
