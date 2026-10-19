/**
 * Resend Receiving API client (server-side only).
 *
 * Per Resend's documentation, an `email.received` webhook carries only
 * metadata — never the body. The full content (text / html / headers)
 * must be fetched afterwards:
 *
 *   GET https://api.resend.com/emails/receiving/{email_id}
 *   Authorization: Bearer <RESEND_API_KEY>
 *
 * (The official SDK exposes the same call as
 * `resend.emails.receiving.get(id)`; a typed fetch is used here so the
 * behaviour — and its failure modes — are explicit and testable.)
 *
 * Receiving itself requires a receiving domain on the Resend account:
 * either the account's Resend-managed `<id>.resend.app` address or a
 * verified custom domain with the MX record Resend provides. Without
 * that dashboard/DNS setup no `email.received` events ever arrive —
 * see SETUP.md §6. A sending-only Resend configuration cannot supply
 * inbox replies.
 */

import type { ReceivedEmailContent } from "@/lib/inbox/inbound";

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

function headerValue(
  headers: Record<string, unknown> | null | undefined,
  name: string
): string | null {
  if (!headers) return null;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === name) {
      return typeof value === "string" ? value : null;
    }
  }
  return null;
}

export function parseReceivedEmail(raw: Record<string, unknown>): ReceivedEmailContent {
  const headers = (raw.headers as Record<string, unknown> | undefined) ?? undefined;
  const toRaw = raw.to;
  const to = Array.isArray(toRaw)
    ? toRaw.map((t) => String(t))
    : typeof toRaw === "string"
      ? [toRaw]
      : [];
  const referencesRaw = headerValue(headers, "references");
  return {
    providerMessageId: String(raw.id ?? ""),
    from: String(raw.from ?? ""),
    to,
    subject: (raw.subject as string | null) ?? null,
    text: (raw.text as string | null) ?? null,
    html: (raw.html as string | null) ?? null,
    messageIdHeader:
      (raw.message_id as string | null) ?? headerValue(headers, "message-id"),
    inReplyTo: headerValue(headers, "in-reply-to"),
    references: referencesRaw
      ? referencesRaw.split(/\s+/).map((t) => t.replace(/[<>]/g, "")).filter(Boolean)
      : [],
    receivedAt:
      typeof raw.created_at === "string"
        ? raw.created_at
        : new Date().toISOString(),
  };
}

/**
 * Returns a fetcher for received-email content. Throws when the API key
 * is missing or Resend errors — the webhook handler treats a throw as
 * "retry later" (502, event NOT recorded) rather than dropping mail.
 */
export function createResendReceivedEmailFetcher(
  apiKey: string | undefined,
  fetchImpl: FetchLike = fetch
): (providerMessageId: string) => Promise<ReceivedEmailContent> {
  return async (providerMessageId: string) => {
    if (!apiKey) {
      throw new Error(
        "RESEND_API_KEY is not configured: received-email content cannot be fetched."
      );
    }
    const res = await fetchImpl(
      `https://api.resend.com/emails/receiving/${encodeURIComponent(providerMessageId)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );
    if (!res.ok) {
      throw new Error(
        `Resend Receiving API failed (${res.status}) for email ${providerMessageId}`
      );
    }
    const body = (await res.json()) as Record<string, unknown>;
    // The REST API returns the email object directly; tolerate a
    // `{ data: ... }` envelope as well.
    const emailObj =
      body && typeof body === "object" && "data" in body && body.data
        ? (body.data as Record<string, unknown>)
        : body;
    return parseReceivedEmail(emailObj);
  };
}
