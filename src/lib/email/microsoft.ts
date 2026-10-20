/**
 * Microsoft Graph mailbox adapter — sends through Microsoft Graph
 * with the mailbox's OAuth grant (src/lib/oauth). Server-side only.
 *
 * MESSAGE-ID CONTRACT DECISION: POST /me/sendMail accepts the mail
 * (HTTP 202) but returns NO message id, and this product's send
 * contract records `sent` only with a provider-assigned id (never an
 * invented one — see ./types.ts). So this adapter uses Graph's
 * two-step documented flow instead:
 *   1. POST /me/messages        → creates the message in Drafts and
 *      returns the provider-assigned message id (HTTP 201);
 *   2. POST /me/messages/{id}/send → sends that exact message (202).
 * The recorded provider message id is the id from step 1 — assigned
 * by Microsoft to this message before it was sent. If step 2 fails,
 * the draft is deleted (best effort) so a failed send does not leave
 * a stray draft, and the result is an error.
 *
 * Body note: Graph carries ONE body per message — when both text and
 * HTML exist, the HTML body is sent (it contains the same content +
 * the unsubscribe footer link); otherwise the text body is sent.
 * The Stage-C List-Unsubscribe headers ride as
 * `internetMessageHeaders`, the shared preparation in
 * ./mailbox-core.ts having built them exactly as for Resend/Gmail.
 */

import type { ProviderState } from "@/lib/env";
import type {
  EmailProviderAdapter,
  SendEmailInput,
  SendEmailResult,
} from "./types";
import {
  sendMailboxEmail,
  type MailboxAdapterDeps,
  type PreparedMailboxMessage,
} from "./mailbox-core";

export type MicrosoftGraphAdapterDeps = MailboxAdapterDeps & {
  fetchFn?: typeof fetch;
};

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

/** The Graph message JSON for the create step. Exported for tests. */
export function buildGraphMessage(message: PreparedMailboxMessage): Record<
  string,
  unknown
> {
  const body =
    message.html !== undefined
      ? { contentType: "HTML", content: message.html }
      : { contentType: "Text", content: message.text ?? "" };
  const graphMessage: Record<string, unknown> = {
    subject: message.subject,
    body,
    toRecipients: [
      { emailAddress: { address: message.to } },
    ],
  };
  if (message.replyTo) {
    graphMessage.replyTo = [
      { emailAddress: { address: message.replyTo } },
    ];
  }
  const headerEntries = Object.entries(message.headers);
  if (headerEntries.length > 0) {
    graphMessage.internetMessageHeaders = headerEntries.map(
      ([name, value]) => ({ name, value })
    );
  }
  return graphMessage;
}

export async function deliverViaGraph(
  fetchFn: typeof fetch,
  accessToken: string,
  message: PreparedMailboxMessage
): Promise<{ providerMessageId: string }> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  // Step 1 — create the message; Graph assigns the id.
  let createRes: Response;
  try {
    createRes = await fetchFn(`${GRAPH_BASE}/me/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify(buildGraphMessage(message)),
    });
  } catch (err) {
    throw new Error(
      `Microsoft Graph request failed: ${err instanceof Error ? err.message : "network error"}`
    );
  }
  const created = (await createRes.json().catch(() => ({}))) as {
    id?: string;
    error?: { message?: string; code?: string };
  };
  if (!createRes.ok || !created.id) {
    throw new Error(
      created.error?.message ??
        `Microsoft Graph returned HTTP ${createRes.status} without a message ID`
    );
  }
  const messageId = created.id;

  // Step 2 — send the created message.
  let sendRes: Response;
  try {
    sendRes = await fetchFn(
      `${GRAPH_BASE}/me/messages/${encodeURIComponent(messageId)}/send`,
      { method: "POST", headers }
    );
  } catch (err) {
    await deleteGraphMessage(fetchFn, accessToken, messageId);
    throw new Error(
      `Microsoft Graph send request failed: ${err instanceof Error ? err.message : "network error"}`
    );
  }
  if (!sendRes.ok) {
    const errBody = (await sendRes.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    await deleteGraphMessage(fetchFn, accessToken, messageId);
    throw new Error(
      errBody.error?.message ??
        `Microsoft Graph send returned HTTP ${sendRes.status}`
    );
  }
  return { providerMessageId: messageId };
}

/** Best-effort draft cleanup after a failed send step. */
async function deleteGraphMessage(
  fetchFn: typeof fetch,
  accessToken: string,
  messageId: string
): Promise<void> {
  try {
    await fetchFn(
      `${GRAPH_BASE}/me/messages/${encodeURIComponent(messageId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
  } catch {
    // Cleanup only — the send failure is already being reported.
  }
}

export class MicrosoftGraphEmailAdapter implements EmailProviderAdapter {
  readonly provider = "microsoft";
  private readonly deps: MicrosoftGraphAdapterDeps;

  constructor(deps: MicrosoftGraphAdapterDeps) {
    this.deps = deps;
  }

  getState(): ProviderState {
    return this.deps.stateOverride ?? "connected";
  }

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const fetchFn = this.deps.fetchFn ?? fetch;
    return sendMailboxEmail(
      "microsoft",
      this.deps,
      input,
      (accessToken, message) => deliverViaGraph(fetchFn, accessToken, message)
    );
  }
}
