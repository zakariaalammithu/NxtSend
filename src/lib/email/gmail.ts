/**
 * Gmail mailbox adapter — sends through the Gmail API with the
 * mailbox's OAuth grant (src/lib/oauth). Server-side only.
 *
 * Delivery: POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send
 * with a base64url-encoded RFC 822 message. The Stage-C
 * List-Unsubscribe headers + footer ride inside the MIME headers /
 * body via the shared preparation in ./mailbox-core.ts — the same
 * material the Resend adapter sends, so a recipient's one-click
 * unsubscribe works identically from a Gmail mailbox.
 *
 * Gmail's send response carries the provider message ID, which is
 * what `sent` records (see ./types.ts contract).
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

export type GmailAdapterDeps = MailboxAdapterDeps & {
  fetchFn?: typeof fetch;
};

/** Encodes a header value when it leaves printable ASCII (RFC 2047). */
export function encodeHeaderValue(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function encodeBody(text: string): string {
  return Buffer.from(text, "utf8")
    .toString("base64")
    .replace(/.{1,76}/g, "$&\r\n")
    .trimEnd();
}

/**
 * Builds the RFC 822 message for the Gmail API. Both bodies are
 * carried when both exist (multipart/alternative); the prepared
 * unsubscribe headers are emitted verbatim as MIME headers.
 * Exported for payload tests.
 */
export function buildMimeMessage(message: PreparedMailboxMessage): string {
  const boundary = `nxtsend_${Buffer.from(
    `${message.to}|${message.subject}|${Date.now()}`
  )
    .toString("base64url")
    .slice(0, 24)}`;
  const lines: string[] = [
    `From: ${message.from}`,
    `To: ${message.to}`,
    `Subject: ${encodeHeaderValue(message.subject)}`,
  ];
  if (message.replyTo) lines.push(`Reply-To: ${message.replyTo}`);
  for (const [name, value] of Object.entries(message.headers)) {
    lines.push(`${name}: ${value}`);
  }
  lines.push("MIME-Version: 1.0");

  const hasText = message.text !== undefined;
  const hasHtml = message.html !== undefined;
  if (hasText && hasHtml) {
    lines.push(
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      encodeBody(message.text as string),
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      encodeBody(message.html as string),
      `--${boundary}--`,
      ""
    );
  } else if (hasHtml) {
    lines.push(
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      encodeBody(message.html as string)
    );
  } else {
    lines.push(
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      encodeBody(message.text ?? "")
    );
  }
  return lines.join("\r\n");
}

export async function deliverViaGmail(
  fetchFn: typeof fetch,
  accessToken: string,
  message: PreparedMailboxMessage
): Promise<{ providerMessageId: string }> {
  const raw = Buffer.from(buildMimeMessage(message), "utf8").toString(
    "base64url"
  );
  let res: Response;
  try {
    res = await fetchFn(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw }),
      }
    );
  } catch (err) {
    throw new Error(
      `Gmail API request failed: ${err instanceof Error ? err.message : "network error"}`
    );
  }
  const body = (await res.json().catch(() => ({}))) as {
    id?: string;
    error?: { message?: string; status?: string };
  };
  if (!res.ok || !body.id) {
    throw new Error(
      body.error?.message ??
        `Gmail API returned HTTP ${res.status} without a message ID`
    );
  }
  return { providerMessageId: body.id };
}

export class GmailEmailAdapter implements EmailProviderAdapter {
  readonly provider = "gmail";
  private readonly deps: GmailAdapterDeps;

  constructor(deps: GmailAdapterDeps) {
    this.deps = deps;
  }

  getState(): ProviderState {
    return this.deps.stateOverride ?? "connected";
  }

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const fetchFn = this.deps.fetchFn ?? fetch;
    return sendMailboxEmail("google", this.deps, input, (accessToken, message) =>
      deliverViaGmail(fetchFn, accessToken, message)
    );
  }
}
