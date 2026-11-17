// Package entry point (compiled to dist/index.js; package.json "main"
// points at the root index.js shim which re-exports this module).
// n8n itself loads nodes via the "n8n.nodes" key in package.json.
export { NxtSend } from './nodes/NxtSend/NxtSend.node';
export { NxtSendTrigger } from './nodes/NxtSendTrigger/NxtSendTrigger.node';
export { NxtSendApi } from './credentials/NxtSendApi.credentials';
export { NxtSendOAuth2Api } from './credentials/NxtSendOAuth2Api.credentials';
