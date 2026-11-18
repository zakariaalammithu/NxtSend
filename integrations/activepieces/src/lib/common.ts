/**
 * NxtSend piece.
 *
 * Build-verified 2026-11-19: tsc clean + runtime construct against
 * @activepieces/pieces-framework 0.32.0 (17 actions, 9 triggers,
 * OAuth2 auth). NOT installed in any Activepieces instance, NOT
 * submitted to Activepieces. Build with
 * `npm install && npm run build` (see README.md).
 *
 * No secrets in this file. Auth is OAuth 2.0 (src/auth.ts) against
 * NxtSend's shared authorization server; the client comes from the
 * one-time Dynamic Client Registration call.
 */
import { httpClient, HttpMethod } from "@activepieces/pieces-common";

/** Base URL of the NxtSend REST API (deployment origin). */
export const NXTEND_API_BASE_URL = "https://nxtsend.com";

/**
 * One authenticated call to the NxtSend REST API v1. The access
 * token comes from the piece auth (OAuth 2.0, access_token).
 * Throws on non-2xx with the server's {error} message — Activepieces
 * surfaces it as the step failure.
 */
export async function nxtsendRequest<T>(opts: {
  accessToken: string;
  baseUrl?: string;
  method: HttpMethod;
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}): Promise<T> {
  let base = opts.baseUrl ?? NXTEND_API_BASE_URL;
  while (base.endsWith("/")) base = base.slice(0, -1);
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined) qs.set(k, String(v));
  }
  const url = base + "/api/integrations/activepieces/v1" + opts.path + (qs.toString() ? "?" + qs.toString() : "");
  const res = await httpClient.sendRequest<T>({
    method: opts.method,
    url,
    headers: { Authorization: "Bearer " + opts.accessToken },
    body: opts.body,
  });
  return res.body;
}
