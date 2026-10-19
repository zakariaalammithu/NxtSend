/**
 * Muse Connector adapter — UNIMPLEMENTED, by design and by fact.
 *
 * READ THIS BEFORE "IMPLEMENTING" ANYTHING HERE:
 *
 * There is NO API for NxtSend to call. Muse.ai is Meta's consumer
 * personal AI agent; Meta publishes no endpoint, SDK or webhook that
 * lets a third-party SaaS drive a user's Muse (verified across the
 * official platform page, connector guidelines, terms and Help Center,
 * 2026-10-19 — see the research report in
 * ~/workspace/research_notes/muse-ai-api-investigation-20261018-2029).
 *
 * The integration direction is INVERTED: under the Muse Connector
 * Platform, NxtSend is the server. NxtSend will expose its own API or
 * hosted MCP server (described by ./manifest.ts), submit it at
 * muse.ai/platform, and — after Meta's functional/security/legal
 * review and end-to-end QA — Muse calls INTO NxtSend on behalf of
 * its users, authenticated with an API key or OAuth (PKCE) that
 * NxtSend issues.
 *
 * This interface therefore describes the surface NxtSend must BUILD
 * AND HOST when the readiness checklist (./readiness.ts) is acted on —
 * not a client for someone else's API. Every method of the shipped
 * implementation returns an explicit not-implemented result. Do not
 * add endpoints, hosts, or auth schemes here that Meta has not
 * documented; there are none to add.
 *
 * When access is obtained, the files that change are:
 *   1. THIS file — implement the handler against the real API/MCP
 *      surface NxtSend ends up hosting.
 *   2. ./manifest.ts — finalise tool schemas (inputs become JSON
 *      Schemas; approval covers only the approved tools).
 *   3. src/lib/integrations-center/registry.ts + status.ts — the
 *      muse-ai entry's status source (submission state, not a fake
 *      "connected").
 *   4. .env.example + SETUP.md §14 — only if Meta issues credentials
 *      for some future surface; the connector itself authenticates
 *      with credentials NxtSend issues to Muse.
 */

import {
  NXTSEND_TOOL_MANIFEST,
  type MuseToolDescriptor,
} from "./manifest";

export type MuseConnectorResult =
  | { status: "ok"; data: unknown }
  | {
      status: "not_implemented";
      reason: string;
      /** Where the real path is documented. */
      see: "readiness-checklist" | "tool-manifest";
    };

const NOT_IMPLEMENTED_REASON =
  "No Muse agent API exists to integrate with. The supported path is the Muse Connector Platform: NxtSend hosts an API/MCP surface (see the tool manifest), submits it at muse.ai/platform, and Muse calls NxtSend after Meta's review. Nothing has been submitted yet.";

/**
 * The surface a future NxtSend-hosted connector will implement.
 * Signatures are deliberately transport-agnostic (REST or MCP) — the
 * transport is chosen when the surface is built, per the submission.
 */
export interface MuseConnectorAdapter {
  /** Tools this connector offers, with Meta's classifications. */
  listTools(): MuseToolDescriptor[];
  /**
   * Executes one approved tool call on behalf of an authenticated
   * Muse user. Sensitive-write tools must require the platform's
   * per-call approval before this runs.
   */
  handleToolCall(
    toolName: string,
    input: Record<string, unknown>,
    caller: { subject: string; scopes: string[] }
  ): Promise<MuseConnectorResult>;
  /** Liveness of the hosted surface (for Meta's review + monitoring). */
  healthCheck(): Promise<MuseConnectorResult>;
}

export class UnimplementedMuseConnectorAdapter implements MuseConnectorAdapter {
  listTools(): MuseToolDescriptor[] {
    // The manifest is real, pre-classified preparation work — serving
    // it does not imply any live integration exists.
    return NXTSEND_TOOL_MANIFEST;
  }

  // Signature intentionally parameterless: it satisfies the
  // MuseConnectorAdapter interface (fewer parameters is compatible)
  // while making it impossible to mistake this stub for a handler that
  // inspects a call. A real implementation restores the full signature.
  async handleToolCall(): Promise<MuseConnectorResult> {
    return {
      status: "not_implemented",
      reason: NOT_IMPLEMENTED_REASON,
      see: "readiness-checklist",
    };
  }

  async healthCheck(): Promise<MuseConnectorResult> {
    return {
      status: "not_implemented",
      reason: NOT_IMPLEMENTED_REASON,
      see: "readiness-checklist",
    };
  }
}
