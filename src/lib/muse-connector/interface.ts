/**
 * Muse Connector adapter interface + deliberately-unimplemented stub.
 *
 * Client-safe (imports only the manifest): the Integration Center
 * detail page ("use client") imports the muse-connector barrel, so
 * this module must never import server-only code. The real adapter
 * lives in ./adapter.ts (server-only: email/AI SDKs, next/headers)
 * and is imported directly by the MCP server, never through the
 * barrel.
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
    }
  | {
      status: "error";
      code: string;
      httpStatus: number;
      message: string;
      /** NxtSend outcome status for tool results. */
      resultStatus: "FAILED" | "BLOCKED";
      details?: string[];
    };

const NOT_IMPLEMENTED_REASON =
  "No Muse agent API exists to integrate with. The supported path is the Muse Connector Platform: NxtSend hosts an API/MCP surface (see the tool manifest), submits it at muse.ai/platform, and Muse calls NxtSend after Meta's review. Nothing has been submitted yet.";

/** NxtSend outcome statuses carried by tool results. */
export type MuseToolOutcomeStatus =
  | "PENDING"
  | "PROCESSING"
  | "SUCCESS"
  | "FAILED"
  | "BLOCKED"
  | "CANCELLED";

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
    caller: {
      subject: string;
      scopes: string[];
      workspaceId?: string;
      /** OAuth client id, when the transport resolved one (profile tool). */
      clientId?: string;
      /** Grant id (client + user pair), when the transport resolved one. */
      grantId?: string;
    }
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
