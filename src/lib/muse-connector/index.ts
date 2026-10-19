/**
 * Muse.ai (Meta Muse) readiness pack.
 *
 * There is NO Muse agent API for NxtSend to call — the integration
 * direction is inverted (Muse Connector Platform: NxtSend hosts the
 * API/MCP surface, Muse calls in, after Meta's review). This module
 * holds the preparation artefacts: the pre-classified tool manifest,
 * the submission readiness checklist, and the deliberately
 * unimplemented adapter interface. See ./adapter.ts before touching
 * anything here.
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
export { UnimplementedMuseConnectorAdapter } from "./adapter";
export type { MuseConnectorAdapter, MuseConnectorResult } from "./adapter";
