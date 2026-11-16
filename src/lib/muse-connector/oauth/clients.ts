/**
 * Muse OAuth clients — lookup, redirect validation, DCR creation.
 *
 * There is NO env-configured static client anywhere in NxtSend (no
 * other integration has one either): clients exist only by Dynamic
 * Client Registration (RFC 7591) into `muse_oauth_clients`.
 *
 * Redirect allowlist: the Muse callback
 * https://agent.meta.ai/api/hatch/oauth/callback, or a loopback
 * http://localhost:* URI (local testing). Anything else is refused —
 * an open-redirect via a registered client is not possible.
 */

import { createHash, randomBytes, timingSafeEqual } from "crypto";
import type { MuseOAuthClientRow, MuseOAuthStore } from "./store";

/** The Muse callback every registered Muse client must use. */
export const MUSE_OAUTH_CALLBACK = "https://agent.meta.ai/api/hatch/oauth/callback";

/** Cap on registered clients; oldest never-used client is evicted past it. */
export const MUSE_MAX_CLIENTS = 50;

/** A never-used client older than this may be evicted when over cap. */
export const MUSE_CLIENT_EVICTION_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * True when a redirect URI is on the allowlist: exactly the Muse
 * callback, or a loopback http://localhost:<port>[/path] URI.
 */
export function isAllowedMuseRedirectUri(uri: string): boolean {
  if (uri === MUSE_OAUTH_CALLBACK) return true;
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:") return false;
  if (parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") return false;
  return true;
}

/** Exact-match check of a redirect URI against a client's allowlist. */
export function isRegisteredRedirectUri(
  client: MuseOAuthClientRow,
  redirectUri: string
): boolean {
  return client.redirect_uris.includes(redirectUri);
}

/**
 * Validates a redirect URI for use: it must be allowlisted AND
 * exactly registered for this client.
 */
export function validateRedirectUri(
  client: MuseOAuthClientRow,
  redirectUri: string | null | undefined
): boolean {
  if (!redirectUri) return false;
  if (!isAllowedMuseRedirectUri(redirectUri)) return false;
  return isRegisteredRedirectUri(client, redirectUri);
}

/**
 * Constant-time client-secret check (hash-then-compare, like the
 * CRON_SECRET pattern in src/app/api/jobs/run/route.ts). Public
 * clients have no secret: presenting one for a public client is
 * refused, and a confidential client without a matching secret is
 * refused. Returns false for ANY problem — never throws.
 */
export function verifyClientSecret(
  client: MuseOAuthClientRow,
  providedSecret: string | null | undefined
): boolean {
  if (!client.client_secret_hash) {
    // Public client: no secret may be presented.
    return !providedSecret;
  }
  if (!providedSecret) return false;
  const a = Buffer.from(createHash("sha256").update(providedSecret, "utf8").digest("hex"));
  const b = Buffer.from(client.client_secret_hash);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface RegisterMuseClientInput {
  name: unknown;
  redirectUris: unknown;
  /** Default public (no secret). Set true only when explicitly requested. */
  confidential?: boolean;
}

export type RegisterMuseClientResult =
  | {
      ok: true;
      client: MuseOAuthClientRow;
      /** Plaintext secret — returned exactly once, only for confidential clients. */
      clientSecret: string | null;
    }
  | { ok: false; error: "invalid_client_metadata" | "too_many_clients"; detail: string };

function generateClientId(): string {
  return `muse_${randomBytes(16).toString("hex")}`;
}

function validateRegistrationMetadata(input: RegisterMuseClientInput): {
  ok: true;
  name: string;
  redirectUris: string[];
} | { ok: false; detail: string } {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 200) {
    return { ok: false, detail: "client_name is required (max 200 characters)." };
  }
  if (!Array.isArray(input.redirectUris) || input.redirectUris.length === 0) {
    return { ok: false, detail: "redirect_uris must be a non-empty array." };
  }
  if (input.redirectUris.length > 10) {
    return { ok: false, detail: "redirect_uris must contain at most 10 URIs." };
  }
  const redirectUris: string[] = [];
  for (const uri of input.redirectUris) {
    if (typeof uri !== "string" || !isAllowedMuseRedirectUri(uri)) {
      return {
        ok: false,
        detail:
          "Every redirect_uri must be the Muse callback (https://agent.meta.ai/api/hatch/oauth/callback) or a loopback http://localhost:* URI.",
      };
    }
    if (!redirectUris.includes(uri)) redirectUris.push(uri);
  }
  return { ok: true, name, redirectUris };
}

/**
 * Registers a client (RFC 7591). Default public — no secret is
 * issued. When the cap is hit, the oldest never-used client older
 * than 24h is evicted first; when no client qualifies for eviction
 * the registration is refused instead of silently dropping one.
 */
export async function registerMuseClient(
  store: MuseOAuthStore,
  input: RegisterMuseClientInput,
  now: Date = new Date()
): Promise<RegisterMuseClientResult> {
  const meta = validateRegistrationMetadata(input);
  if (!meta.ok) return { ok: false, error: "invalid_client_metadata", detail: meta.detail };

  const clients = await store.listClients();
  if (clients.length >= MUSE_MAX_CLIENTS) {
    // Only evict a client that was never used — check oldest first.
    let evicted = false;
    for (const candidate of clients) {
      const age = now.getTime() - new Date(candidate.created_at).getTime();
      if (age <= MUSE_CLIENT_EVICTION_AGE_MS) continue;
      if (await store.clientHasActivity(candidate.client_id)) continue;
      await store.deleteClient(candidate.client_id);
      evicted = true;
      break;
    }
    if (!evicted) {
      return {
        ok: false,
        error: "too_many_clients",
        detail: `Client limit reached (${MUSE_MAX_CLIENTS}). No never-used client older than 24 hours exists to evict.`,
      };
    }
  }

  const confidential = input.confidential === true;
  const clientSecret = confidential ? randomBytes(32).toString("base64url") : null;
  const client = await store.createClient({
    client_id: generateClientId(),
    client_secret_hash: clientSecret
      ? createHash("sha256").update(clientSecret, "utf8").digest("hex")
      : null,
    name: meta.name,
    redirect_uris: meta.redirectUris,
  });
  return { ok: true, client, clientSecret };
}
