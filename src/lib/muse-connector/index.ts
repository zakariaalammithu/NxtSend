/**
 * Muse.ai (Meta Muse) connector pack — CLIENT-SAFE barrel.
 *
 * Only the manifest, readiness checklist, input schemas and the
 * adapter interface + unimplemented stub are exported here, because
 * the Integration Center detail page ("use client") imports this
 * barrel: anything server-only (next/headers, the Resend/AI provider
 * SDKs, node:crypto) in this file's import graph breaks that page's
 * build. The real adapter (./adapter.ts) is server-only and is
 * imported directly by the MCP server, never through this barrel.
 *
 * Server-only pieces live in their own modules — import them
 * directly from server code:
 *   real adapter ....... ./adapter (NxtSendMuseConnectorAdapter)
 *   audit .............. ./audit (recordMuseAudit, recordMuseOAuthEvent)
 *   tokens/context ..... ./tokens, ./context (re-export Worker A's
 *                        oauth/ server; resolveMuseContext)
 *   MCP transport ...... ./mcp (handleMcpRequest)
 */

export {
  NXTSEND_TOOL_MANIFEST,
  MUSE_CONNECTOR_MANIFEST_STATUS,
} from "./manifest";
export type {
  MuseToolDescriptor,
  MuseToolClassification,
} from "./manifest";
export { MUSE_READINESS_CHECKLIST } from "./readiness";
export type { MuseReadinessItem } from "./readiness";
export { UnimplementedMuseConnectorAdapter } from "./interface";
export type {
  MuseConnectorAdapter,
  MuseConnectorResult,
  MuseToolOutcomeStatus,
} from "./interface";
export {
  TOOL_INPUT_SCHEMAS,
  TOOL_SCOPES,
  requiredScope,
  validateToolInput,
} from "./schemas";
export type { MuseScope, ToolInputSchema, ToolValidationError } from "./schemas";
