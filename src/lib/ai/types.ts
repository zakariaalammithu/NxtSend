/**
 * AI adapter types (server-side only — keys never leave the server).
 *
 * The one wired feature is "Draft outreach message": the model produces
 * a DRAFT that lands in the editor for mandatory human review/editing.
 * Nothing in this module sends anything anywhere.
 */

import type { ProviderState } from "@/lib/env";

export type AIProviderId = "openai" | "anthropic" | "meta";

export interface DraftRequest {
  /** "linkedin" | "email" */
  channel: "linkedin" | "email";
  /** Sequence step type, e.g. connection_request / linkedin_message / email. */
  stepType: string;
  campaignName?: string;
  campaignGoal?: string;
  /** Existing step content the user wants improved (optional). */
  existingContent?: string;
  /** Sample lead fields used for personalization context. */
  lead?: {
    firstName?: string;
    company?: string;
    jobTitle?: string;
  };
}

export type DraftResult =
  | {
      status: "ok";
      provider: AIProviderId;
      draft: string;
      aiGenerated: true;
      message: string;
    }
  | {
      /** Demo mode: locally templated sample, clearly labelled. */
      status: "simulated";
      provider: null;
      draft: string;
      aiGenerated: false;
      message: string;
    }
  | {
      status: "not_configured";
      provider: null;
      draft: null;
      aiGenerated: false;
      message: string;
    }
  | {
      status: "error";
      provider: AIProviderId;
      draft: null;
      aiGenerated: false;
      message: string;
    };

export interface AIProviderAdapter {
  readonly provider: AIProviderId;
  getState(): ProviderState;
  draftOutreach(input: DraftRequest): Promise<DraftResult>;
}
