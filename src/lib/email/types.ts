/**
 * Email provider module — types.
 *
 * One adapter interface, honest results: a send only reports "sent" when
 * the provider accepted the message and returned its own message ID.
 * Every other outcome is a distinct, labelled status.
 */

import type { ProviderState } from "@/lib/env";

export type { ProviderState };

/**
 * A file carried with an outbound email (P6 Stage C — voice notes
 * are the first producer). `contentBase64` is the raw file bytes in
 * base64; every adapter renders it in its provider's native shape
 * (Resend `attachments`, Gmail MIME part, Graph `fileAttachment`).
 */
export interface EmailAttachment {
  filename: string;
  contentType: string;
  contentBase64: string;
}

export interface SendEmailInput {
  workspaceId: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
  /** Optional file attachments (e.g. a recorded voice note). */
  attachments?: EmailAttachment[];
  /** Defaults to EMAIL_FROM. */
  from?: string;
  replyTo?: string;
  /**
   * Extra headers merged into the provider payload. The adapter adds
   * the List-Unsubscribe / List-Unsubscribe-Post headers itself (see
   * ./unsubscribe.ts); caller-supplied values win for any other key.
   */
  headers?: Record<string, string>;
  leadId?: string | null;
  campaignId?: string | null;
}

export type SendEmailResult =
  | {
      status: "sent";
      provider: string;
      providerMessageId: string;
      message: string;
    }
  | {
      /** Demo mode: nothing was sent, nothing was called. */
      status: "simulated";
      provider: string;
      providerMessageId: null;
      message: string;
    }
  | {
      /** Recipient is on the workspace suppression list — send refused. */
      status: "suppressed";
      provider: string;
      providerMessageId: null;
      message: string;
    }
  | {
      /** Provider not (fully) configured — nothing was attempted. */
      status: "not_configured";
      provider: string;
      providerMessageId: null;
      message: string;
    }
  | {
      /** Provider was called and rejected/failed, or a required
       *  server-side dependency (suppression store) is unavailable. */
      status: "error";
      provider: string;
      providerMessageId: null;
      message: string;
    };

export interface EmailProviderAdapter {
  readonly provider: string;
  getState(): ProviderState;
  sendEmail(input: SendEmailInput): Promise<SendEmailResult>;
}
