/**
 * Resend webhook verification + handling.
 *
 * Resend signs webhooks with the Svix scheme (documented by both Resend
 * and Svix):
 *   key        = base64-decoded bytes of the `whsec_...` secret
 *   signed     = `${svix-id}.${svix-timestamp}.${raw-body}`
 *   signature  = base64( HMAC-SHA256(key, signed) )
 *   header     = `svix-signature: v1,<base64> [v1,<base64> ...]`
 * Timestamps older/newer than 5 minutes are rejected (replay window).
 *
 * The handler is storage-agnostic: persistence goes through
 * EmailEventStore so the dedupe/status logic is unit-testable without a
 * database. The route wires the Supabase implementation.
 *
 * Hard rule: when RESEND_WEBHOOK_SECRET is unset the handler REJECTS
 * (503). Unverified events are never accepted.
 */

import { createHmac, timingSafeEqual } from "crypto";
import { isConfiguredValue } from "@/lib/env";
import type { IngestOutcome, ReceivedEmailContent } from "@/lib/inbox/inbound";

export const SVIX_TOLERANCE_SECONDS = 300;

export function svixKeyBytes(secret: string): Buffer {
  const raw = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  return Buffer.from(raw, "base64");
}

/** Computes the v1 signature for a payload (also used to build fixtures). */
export function signSvixPayload(
  secret: string,
  msgId: string,
  timestampSeconds: number,
  rawBody: string
): string {
  const signed = `${msgId}.${timestampSeconds}.${rawBody}`;
  return createHmac("sha256", svixKeyBytes(secret)).update(signed).digest("base64");
}

export interface SvixHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

export function verifySvixSignature(
  secret: string,
  headers: SvixHeaders,
  rawBody: string,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): { ok: true } | { ok: false; reason: string } {
  if (!headers.id || !headers.timestamp || !headers.signature) {
    return { ok: false, reason: "missing svix headers" };
  }
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts)) {
    return { ok: false, reason: "invalid svix-timestamp" };
  }
  if (Math.abs(nowSeconds - ts) > SVIX_TOLERANCE_SECONDS) {
    return { ok: false, reason: "svix-timestamp outside tolerance window" };
  }
  const expected = signSvixPayload(secret, headers.id, ts, rawBody);
  const expectedBuf = Buffer.from(expected);
  for (const part of headers.signature.split(" ")) {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) continue;
    const sigBuf = Buffer.from(sig);
    if (sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf)) {
      return { ok: true };
    }
  }
  return { ok: false, reason: "signature mismatch" };
}

// ── Event handling ──────────────────────────────────────────────────────────

export interface ResendEvent {
  type: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface EmailEventStore {
  /** Returns true when this delivery was already recorded (dedupe). */
  hasEvent(providerEventId: string): Promise<boolean>;
  recordEvent(evt: {
    providerEventId: string;
    eventType: string;
    providerMessageId: string | null;
    payload: unknown;
  }): Promise<void>;
  updateMessageStatus(providerMessageId: string, status: string): Promise<void>;
  /** Workspace that owns the message, for bounce/complaint suppression. */
  getMessageWorkspace(providerMessageId: string): Promise<string | null>;
  addSuppression(workspaceId: string, email: string, reason: string): Promise<void>;
  /**
   * Optional: stores a received (inbound) email into its conversation.
   * Wired by the route's store when a database is configured; the
   * handler reports `ingested: false` when it is absent.
   */
  ingestReceivedEmail?: (email: ReceivedEmailContent) => Promise<IngestOutcome>;
}

/** Resend event type -> messages.status value (null = log only).
 *  `email.received` is handled by the dedicated inbound branch in
 *  handleResendWebhook (content fetch + conversation ingestion). */
export const RESEND_EVENT_STATUS: Record<string, string | null> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.delivery_delayed": "delivery_delayed",
  "email.opened": null,
  "email.clicked": null,
  "email.received": null,
};

export interface WebhookHandleResult {
  status: number;
  body: Record<string, unknown>;
}

export async function handleResendWebhook(args: {
  rawBody: string;
  headers: SvixHeaders;
  secret: string | undefined;
  store: EmailEventStore | null;
  nowSeconds?: number;
  /**
   * Fetches the full content of a received email (the webhook payload
   * carries metadata only). Required for `email.received` ingestion;
   * see src/lib/email/receiving.ts.
   */
  fetchReceivedEmail?: (providerMessageId: string) => Promise<ReceivedEmailContent>;
}): Promise<WebhookHandleResult> {
  const { rawBody, headers, secret, store } = args;

  if (!isConfiguredValue(secret)) {
    return {
      status: 503,
      body: {
        error:
          "RESEND_WEBHOOK_SECRET is not configured. Webhook events are rejected rather than accepted unverified.",
      },
    };
  }
  const verdict = verifySvixSignature(secret, headers, rawBody, args.nowSeconds);
  if (!verdict.ok) {
    return { status: 401, body: { error: `Signature verification failed: ${verdict.reason}` } };
  }
  if (!store) {
    return {
      status: 503,
      body: {
        error:
          "Database is not configured (demo mode): verified events cannot be persisted, so processing is refused.",
      },
    };
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(rawBody) as ResendEvent;
  } catch {
    return { status: 400, body: { error: "Invalid JSON payload" } };
  }

  const deliveryId = headers.id as string;
  if (await store.hasEvent(deliveryId)) {
    return { status: 200, body: { received: true, duplicate: true } };
  }

  const providerMessageId = event.data?.email_id ?? null;

  // ── Inbound mail ──────────────────────────────────────────────────────
  // An `email.received` delivery carries only metadata; the body must be
  // fetched from the Receiving API BEFORE the event is recorded. If the
  // fetch fails we answer 502 WITHOUT recording, so Resend redelivers
  // and the mail is not lost to the dedupe check above.
  if (event.type === "email.received") {
    if (!providerMessageId || !args.fetchReceivedEmail || !store.ingestReceivedEmail) {
      await store.recordEvent({
        providerEventId: deliveryId,
        eventType: event.type,
        providerMessageId,
        payload: event,
      });
      return {
        status: 200,
        body: {
          received: true,
          type: event.type,
          ingested: false,
          reason:
            "Inbound ingestion is not wired (missing content fetcher or store). The event was logged only. A receiving domain + RESEND_API_KEY are required — see SETUP.md §6.",
        },
      };
    }
    let email: ReceivedEmailContent;
    try {
      email = await args.fetchReceivedEmail(providerMessageId);
    } catch (err) {
      return {
        status: 502,
        body: {
          error: `Could not fetch received email content (${err instanceof Error ? err.message : "unknown error"}). Event not recorded; the provider will retry.`,
        },
      };
    }
    await store.recordEvent({
      providerEventId: deliveryId,
      eventType: event.type,
      providerMessageId,
      payload: event,
    });
    const outcome = await store.ingestReceivedEmail(email);
    return {
      status: 200,
      body: {
        received: true,
        type: event.type,
        ingested: outcome.status === "ingested",
        ingestStatus: outcome.status,
        conversationId:
          outcome.status === "unrouted" ? null : (outcome.conversationId ?? null),
        ...(outcome.status === "unrouted" ? { reason: outcome.reason } : {}),
      },
    };
  }

  await store.recordEvent({
    providerEventId: deliveryId,
    eventType: event.type,
    providerMessageId,
    payload: event,
  });

  const status = RESEND_EVENT_STATUS[event.type];
  if (status && providerMessageId) {
    await store.updateMessageStatus(providerMessageId, status);
  }

  // Bounces and complaints suppress the recipient for the owning workspace.
  if (
    (event.type === "email.bounced" || event.type === "email.complained") &&
    providerMessageId
  ) {
    const workspaceId = await store.getMessageWorkspace(providerMessageId);
    const recipients = Array.isArray(event.data?.to)
      ? (event.data?.to as string[])
      : event.data?.to
        ? [event.data.to as string]
        : [];
    if (workspaceId) {
      for (const email of recipients) {
        await store.addSuppression(
          workspaceId,
          email,
          event.type === "email.bounced" ? "bounced (Resend webhook)" : "spam complaint (Resend webhook)"
        );
      }
    }
  }

  return { status: 200, body: { received: true, duplicate: false, type: event.type } };
}
