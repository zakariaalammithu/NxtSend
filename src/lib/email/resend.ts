/**
 * Resend email adapter — official `resend` SDK, server-side only.
 *
 * Send-path guarantees (brief §2/§13):
 *   1. State is derived from env (see ./state.ts) — in demo or
 *      unconfigured states NOTHING is called and the result says so.
 *   2. When configured, the workspace suppression list is checked BEFORE
 *      the provider call. If the check cannot be performed (no
 *      service-role client / query error) the send is refused —
 *      fail closed, never "probably fine".
 *   3. "sent" is returned only when Resend accepts the message and
 *      returns its message ID. The outcome is recorded in `messages`
 *      with the provider ID so delivery webhooks can update it.
 */

import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import type { ProviderState } from "@/lib/env";
import type { EmailProviderAdapter, SendEmailInput, SendEmailResult } from "./types";
import { getEmailState } from "./state";
import { checkSuppression } from "./suppression";

/** The subset of the Resend SDK the adapter depends on (injectable). */
export interface ResendSender {
  send(payload: {
    from: string;
    to: string;
    subject: string;
    html?: string;
    text?: string;
    replyTo?: string;
  }): Promise<{ id: string | null; error: string | null }>;
}

function sdkSender(apiKey: string): ResendSender {
  const client = new Resend(apiKey);
  return {
    async send(payload) {
      // Optional fields are only set when present — the SDK's option
      // types reject explicit `undefined` for the content variants.
      const options: Record<string, unknown> = {
        from: payload.from,
        to: [payload.to],
        subject: payload.subject,
      };
      if (payload.html) options.html = payload.html;
      if (payload.text) options.text = payload.text;
      if (payload.replyTo) options.replyTo = payload.replyTo;
      const { data, error } = await client.emails.send(
        options as unknown as Parameters<typeof client.emails.send>[0]
      );
      return {
        id: data?.id ?? null,
        error: error ? `${error.name}: ${error.message}` : null,
      };
    },
  };
}

export interface ResendAdapterDeps {
  sender?: ResendSender;
  adminClient?: SupabaseClient | null;
  /** Test seam: defaults to a real suppression query. */
  suppressionCheck?: (workspaceId: string, email: string) => Promise<boolean>;
  /** Test seam: defaults to the env-derived state. */
  stateOverride?: ProviderState;
  /**
   * The caller owns message persistence, so the adapter must NOT write
   * its own bookkeeping row into `messages`. Used by the inbox reply
   * flow, which pre-creates the message row (keyed by an idempotency
   * key) before the provider call and records the outcome itself —
   * without this flag every inbox reply would be stored twice.
   * All send behaviour (suppression, state, results) is unchanged.
   */
  skipMessageRecord?: boolean;
}

export class ResendEmailAdapter implements EmailProviderAdapter {
  readonly provider = "resend";
  private readonly deps: ResendAdapterDeps;

  constructor(deps: ResendAdapterDeps = {}) {
    this.deps = deps;
  }

  getState(): ProviderState {
    return this.deps.stateOverride ?? getEmailState();
  }

  private admin(): SupabaseClient | null {
    return this.deps.adminClient !== undefined
      ? this.deps.adminClient
      : createAdminClient();
  }

  private async recordMessage(
    input: SendEmailInput,
    status: string,
    providerMessageId: string | null
  ): Promise<void> {
    if (this.deps.skipMessageRecord) return; // caller owns the message row
    const admin = this.admin();
    if (!admin) return; // best-effort bookkeeping only
    try {
      await admin.from("messages").insert({
        workspace_id: input.workspaceId,
        lead_id: input.leadId ?? null,
        campaign_id: input.campaignId ?? null,
        channel: "email",
        direction: "outbound",
        subject: input.subject,
        content: input.text ?? input.html ?? "",
        status,
        is_demo: false,
        provider: this.provider,
        provider_message_id: providerMessageId,
      });
    } catch {
      // A bookkeeping failure must not rewrite the send outcome.
    }
  }

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const state = this.getState();

    if (state === "demo") {
      return {
        status: "simulated",
        provider: this.provider,
        providerMessageId: null,
        message:
          "Demo Mode: no email was sent. Connect Supabase and set RESEND_API_KEY + EMAIL_FROM to send for real.",
      };
    }
    if (state === "not_connected" || state === "configuration_required") {
      return {
        status: "not_configured",
        provider: this.provider,
        providerMessageId: null,
        message:
          state === "not_connected"
            ? "Resend is not configured: set RESEND_API_KEY and EMAIL_FROM (see SETUP.md). No email was sent."
            : "Resend is partially configured: both RESEND_API_KEY and EMAIL_FROM are required. No email was sent.",
      };
    }

    // Configured — suppression check first, fail closed.
    const admin = this.admin();
    if (!admin && !this.deps.suppressionCheck) {
      return {
        status: "error",
        provider: this.provider,
        providerMessageId: null,
        message:
          "Send refused: the suppression list could not be checked (SUPABASE_SERVICE_ROLE_KEY is not configured). No email was sent.",
      };
    }
    let suppressed: boolean;
    try {
      suppressed = this.deps.suppressionCheck
        ? await this.deps.suppressionCheck(input.workspaceId, input.to)
        : await checkSuppression(admin as SupabaseClient, input.workspaceId, input.to);
    } catch (err) {
      return {
        status: "error",
        provider: this.provider,
        providerMessageId: null,
        message: `Send refused: suppression check failed (${err instanceof Error ? err.message : "unknown error"}). No email was sent.`,
      };
    }
    if (suppressed) {
      await this.recordMessage(input, "suppressed", null);
      return {
        status: "suppressed",
        provider: this.provider,
        providerMessageId: null,
        message: `Recipient ${input.to} is on the workspace suppression list. No email was sent.`,
      };
    }

    const sender =
      this.deps.sender ?? sdkSender(process.env.RESEND_API_KEY as string);
    const from = input.from ?? (process.env.EMAIL_FROM as string);
    const result = await sender.send({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.replyTo,
    });

    if (result.error || !result.id) {
      await this.recordMessage(input, "error", null);
      return {
        status: "error",
        provider: this.provider,
        providerMessageId: null,
        message: `Resend rejected the send: ${result.error ?? "no message ID returned"}. The email was NOT sent.`,
      };
    }

    await this.recordMessage(input, "sent", result.id);
    return {
      status: "sent",
      provider: this.provider,
      providerMessageId: result.id,
      message: `Email accepted by Resend (message ID ${result.id}). Delivery is confirmed separately via webhook events.`,
    };
  }
}
