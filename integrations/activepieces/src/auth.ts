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
import { PieceAuth } from "@activepieces/pieces-framework";
import { NXTEND_API_BASE_URL } from "./lib/common";

/**
 * OAuth 2.0 auth for the NxtSend piece. Authorization code flow
 * against NxtSend's shared authorization server; scopes
 * activepieces.read / activepieces.write (there is no
 * activepieces.send tier — the piece never sends LinkedIn messages).
 * PKCE S256 is enabled (the NxtSend server requires it for public
 * clients and accepts it from confidential ones).
 *
 * The client_id / client_secret are entered in Activepieces when the
 * connection is created (from the one-time Dynamic Client
 * Registration call — see docs/integrations/providers/automation-activepieces.md).
 *
 * NOTE: Activepieces' auth docs describe a getConnectionIdentifier
 * callback for a human-readable connection label, but
 * @activepieces/pieces-framework 0.32.0 has no such property on
 * OAuth2Property (verified by tsc against the installed framework)
 * — so the connection label is Activepieces' default. Revisit if a
 * later framework version adds it.
 *
 * BLOCKED until the coordinator extends
 * src/lib/muse-connector/oauth/clients.ts: DCR currently refuses an
 * activepieces.* registration, so no token can be issued yet.
 */
export const nxtsendAuth = PieceAuth.OAuth2({
  displayName: "NxtSend",
  description: "Connect your NxtSend workspace (OAuth 2.0). Pick activepieces.read unless the flow needs to change things.",
  required: true,
  authUrl: NXTEND_API_BASE_URL + "/api/muse/oauth/authorize",
  tokenUrl: NXTEND_API_BASE_URL + "/api/muse/oauth/token",
  scope: ["activepieces.read", "activepieces.write"],
  pkce: true,
  pkceMethod: "S256",
});
