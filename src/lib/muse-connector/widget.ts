/**
 * Campaigns widget for the OpenAI Apps SDK (ChatGPT) — MCP Apps UI.
 *
 * Pattern verified live from
 * https://developers.openai.com/apps-sdk/build/custom-ux (2026-11-16):
 * decoupled data/render tools, `_meta.ui.resourceUri` + the
 * `_meta["openai/outputTemplate"]` compatibility alias, resource
 * mimeType `text/html;profile=mcp-app`, and the `window.openai`
 * compatibility bridge (`window.openai.toolInput` /
 * `window.openai.toolOutput`) with feature detection.
 *
 * The widget is a static template: it contains NO workspace data.
 * Data arrives only through the bridge, from the render tool's
 * structuredContent (campaigns the model already fetched with
 * list_campaigns). No `@modelcontextprotocol/ext-apps` dependency —
 * inline JS only, per the build spec. Tools stay useful without the
 * UI: list_campaigns / get_campaign_performance return the same data
 * as plain structuredContent.
 *
 * UI verification status: PENDING — the widget HTML is served and
 * unit-tested (resource list/read, mimeType, bridge fallback), but it
 * has not been rendered inside a live ChatGPT client. Never claim a
 * live ChatGPT render until that check happens.
 */

import { CAMPAIGNS_WIDGET_RESOURCE_URI } from "./manifest";

export { CAMPAIGNS_WIDGET_RESOURCE_URI };

export const CAMPAIGNS_WIDGET_MIME_TYPE = "text/html;profile=mcp-app";

export const CAMPAIGNS_WIDGET_META = {
  ui: { prefersBorder: true },
} as const;

/** One campaign card's data, as the render tool passes it in. */
export interface WidgetCampaign {
  id: string;
  name: string;
  status?: string;
  type?: string;
  enrollments?: number | null;
}

/** Escape for HTML text content (the widget renders model-supplied data). */
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Server-side render of one campaign card — used by the unit tests
 * to pin the markup contract; the in-widget JS renders the same
 * structure from the bridge payload at runtime.
 */
export function renderWidgetCampaignCard(campaign: WidgetCampaign): string {
  const status = (campaign.status ?? "unknown").toLowerCase();
  const enrollments =
    typeof campaign.enrollments === "number" ? campaign.enrollments : null;
  return (
    `<article class="card" data-campaign-id="${esc(campaign.id)}">` +
    `<h3>${esc(campaign.name)}</h3>` +
    `<p class="meta"><span class="badge badge-${esc(status)}">${esc(status)}</span>` +
    (campaign.type ? ` <span class="type">${esc(campaign.type)}</span>` : "") +
    `</p>` +
    `<p class="enrollments">${enrollments === null ? "Enrollments: —" : `Enrollments: ${enrollments}`}</p>` +
    `</article>`
  );
}

const WIDGET_CSS = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: #fafafa; color: #1f2937; }
header { padding: 14px 16px 8px; }
header h1 { margin: 0; font-size: 17px; font-weight: 700; color: #4c1d95; }
header p { margin: 4px 0 0; font-size: 13px; color: #6b7280; }
main { padding: 8px 16px 16px; display: grid; gap: 10px; }
@media (min-width: 560px) { main { grid-template-columns: 1fr 1fr; } }
.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px 14px; }
.card h3 { margin: 0 0 6px; font-size: 15px; }
.meta { margin: 0 0 6px; font-size: 12px; }
.enrollments { margin: 0; font-size: 13px; color: #4b5563; }
.type { color: #6b7280; text-transform: capitalize; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; text-transform: capitalize; }
.badge-active { background: #dcfce7; color: #166534; }
.badge-draft { background: #e0e7ff; color: #3730a3; }
.badge-paused { background: #fef3c7; color: #92400e; }
.badge-archived { background: #f3f4f6; color: #6b7280; }
.badge-unknown { background: #f3f4f6; color: #6b7280; }
.state { padding: 24px 16px; text-align: center; color: #6b7280; font-size: 14px; }
.state.error { color: #b91c1c; }
footer { padding: 0 16px 14px; font-size: 12px; color: #9ca3af; }
@media (prefers-color-scheme: dark) {
  body { background: #111827; color: #f3f4f6; }
  header h1 { color: #c4b5fd; }
  header p, .state { color: #9ca3af; }
  .card { background: #1f2937; border-color: #374151; }
  .enrollments { color: #d1d5db; }
  footer { color: #6b7280; }
}
`;

/**
 * The full widget document. Inline CSS + JS only, no external
 * resources (the iframe must render without network). The script:
 *   1. shows a loading state,
 *   2. feature-detects `window.openai` and reads
 *      `window.openai.toolOutput` (render-tool result) and
 *      `window.openai.toolInput` (the ids the model passed),
 *   3. also listens for the shared MCP Apps bridge notifications
 *      (`ui/notifications/tool-result` / `tool-input`) via postMessage,
 *   4. renders loading / empty / error states, and
 *   5. when no bridge exists at all, shows a plain fallback message
 *      instead of a blank frame.
 */
export function buildCampaignsWidgetHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>NxtSend campaigns</title>
<style>${WIDGET_CSS}</style>
</head>
<body>
<header>
  <h1>NxtSend campaigns</h1>
  <p>Your campaigns, as fetched with list_campaigns.</p>
</header>
<main id="root" aria-live="polite">
  <div class="state" id="loading">Loading campaigns&hellip;</div>
</main>
<footer>LinkedIn sends are not supported in NxtSend — LinkedIn steps are recorded as skipped.</footer>
<script>
(function () {
  var root = document.getElementById("root");
  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function statusClass(status) {
    var s = String(status || "unknown").toLowerCase();
    return ["active", "draft", "paused", "archived"].indexOf(s) >= 0 ? s : "unknown";
  }
  function card(c) {
    var enrollments = typeof c.enrollments === "number" ? c.enrollments : null;
    return '<article class="card" data-campaign-id="' + escapeHtml(c.id) + '">' +
      "<h3>" + escapeHtml(c.name || "Untitled campaign") + "</h3>" +
      '<p class="meta"><span class="badge badge-' + statusClass(c.status) + '">' +
      escapeHtml(String(c.status || "unknown")) + "</span>" +
      (c.type ? ' <span class="type">' + escapeHtml(c.type) + "</span>" : "") + "</p>" +
      '<p class="enrollments">' +
      (enrollments === null ? "Enrollments: \\u2014" : "Enrollments: " + enrollments) +
      "</p></article>";
  }
  function render(payload) {
    if (!payload || typeof payload !== "object") {
      root.innerHTML = '<div class="state error">Could not load campaigns: the widget received no data.</div>';
      return;
    }
    var campaigns = Array.isArray(payload.campaigns) ? payload.campaigns : [];
    if (campaigns.length === 0) {
      root.innerHTML = '<div class="state">No campaigns to show yet. Create one from the NxtSend dashboard, then ask to see your campaigns again.</div>';
      return;
    }
    root.innerHTML = campaigns.map(card).join("");
  }
  function fromBridge() {
    // ChatGPT compatibility bridge (window.openai), feature-detected.
    // The shared MCP Apps bridge delivers the same payloads over
    // postMessage (ui/notifications/tool-result / tool-input).
    var openai = typeof window !== "undefined" ? window.openai : undefined;
    if (!openai) return false;
    var output = openai.toolOutput;
    var input = openai.toolInput;
    var payload = null;
    if (output && typeof output === "object") {
      payload = output.structuredContent || output;
      if (payload && Array.isArray(payload.campaigns)) { render(payload); return true; }
    }
    if (input && typeof input === "object" && Array.isArray(input.campaigns)) {
      render({ campaigns: input.campaigns }); return true;
    }
    return false;
  }
  function onPostMessage(event) {
    try {
      var msg = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      if (!msg || typeof msg !== "object") return;
      if (msg.method === "ui/notifications/tool-result" && msg.params) {
        var sc = msg.params.structuredContent || msg.params;
        if (sc && Array.isArray(sc.campaigns)) render(sc);
      } else if (msg.method === "ui/notifications/tool-input" && msg.params) {
        var args = msg.params.arguments || msg.params;
        if (args && Array.isArray(args.campaigns)) render({ campaigns: args.campaigns });
      }
    } catch (e) { /* ignore malformed host messages */ }
  }
  window.addEventListener("message", onPostMessage);
  // Give the host a tick to attach the bridge, then fall back plainly.
  setTimeout(function () {
    if (root.querySelector("#loading") && !fromBridge()) {
      root.innerHTML = '<div class="state">This widget needs the ChatGPT bridge to show your campaigns. Your campaigns are still available — ask for them and they will be listed as text.</div>';
    }
  }, 300);
})();
</script>
</body>
</html>`;
}
