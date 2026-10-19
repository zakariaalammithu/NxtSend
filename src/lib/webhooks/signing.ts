/**
 * Outbound webhook signing — HMAC-SHA256, Stripe-style scheme.
 *
 *   signed content = `${timestampSeconds}.${rawBody}`
 *   signature      = hex( HMAC-SHA256(secret, signed content) )
 *   header         = `X-NxtSend-Signature: t=<ts>,v1=<hex>`
 *
 * Receivers (n8n, Zapier catch hooks, custom endpoints) verify by
 * recomputing the HMAC with the shared secret shown once at
 * configuration time. The secret lives only in the workspace's
 * `integrations.config` (workspace-admin restricted, migration 002)
 * and in server memory — it is never returned to the browser after
 * creation and never appears in delivery payloads.
 */

import { createHmac, timingSafeEqual } from "crypto";

export function signWebhookPayload(
  secret: string,
  timestampSeconds: number,
  rawBody: string
): string {
  return createHmac("sha256", secret)
    .update(`${timestampSeconds}.${rawBody}`)
    .digest("hex");
}

export function buildSignatureHeader(
  secret: string,
  timestampSeconds: number,
  rawBody: string
): string {
  return `t=${timestampSeconds},v1=${signWebhookPayload(secret, timestampSeconds, rawBody)}`;
}

export function verifyWebhookSignature(
  secret: string,
  header: string | null,
  rawBody: string,
  toleranceSeconds = 300,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const [k, ...rest] = kv.split("=");
      return [k.trim(), rest.join("=").trim()];
    })
  );
  const ts = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isFinite(ts) || !v1) return false;
  if (Math.abs(nowSeconds - ts) > toleranceSeconds) return false;
  const expected = Buffer.from(signWebhookPayload(secret, ts, rawBody), "hex");
  let provided: Buffer;
  try {
    provided = Buffer.from(v1, "hex");
  } catch {
    return false;
  }
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
