/**
 * Widget unit tests — the campaigns widget template (Apps SDK).
 * Pins the markup contract: NxtSend branding, bridge feature
 * detection, loading / empty / error / fallback states, no external
 * resources, responsive meta. Live ChatGPT rendering is still
 * PENDING (see widget.ts) — these tests cover the template only.
 */

import { describe, it, expect } from "vitest";
import {
  buildCampaignsWidgetHtml,
  renderWidgetCampaignCard,
  CAMPAIGNS_WIDGET_MIME_TYPE,
  CAMPAIGNS_WIDGET_META,
  CAMPAIGNS_WIDGET_RESOURCE_URI,
} from "../widget";

describe("campaigns widget", () => {
  it("resource identity matches the Apps SDK pattern", () => {
    expect(CAMPAIGNS_WIDGET_RESOURCE_URI).toBe("ui://widget/campaigns.html");
    expect(CAMPAIGNS_WIDGET_MIME_TYPE).toBe("text/html;profile=mcp-app");
    expect(CAMPAIGNS_WIDGET_META).toEqual({ ui: { prefersBorder: true } });
  });

  it("html has NxtSend branding, the window.openai bridge and all states", () => {
    const html = buildCampaignsWidgetHtml();
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("NxtSend campaigns");
    expect(html).toContain('name="viewport"');
    // Compatibility bridge, feature-detected.
    expect(html).toContain("window.openai");
    expect(html).toContain("toolInput");
    expect(html).toContain("toolOutput");
    // States.
    expect(html).toContain("Loading campaigns");
    expect(html).toContain("No campaigns to show yet");
    expect(html).toContain("Could not load campaigns");
    expect(html).toContain("needs the ChatGPT bridge");
    // Honest LinkedIn note.
    expect(html).toContain("LinkedIn sends are not supported");
    // No external resources: the iframe must render without network.
    expect(html).not.toMatch(/src="https?:/);
    expect(html).not.toMatch(/href="https?:/);
    expect(html).not.toContain("@modelcontextprotocol/ext-apps");
  });

  it("renderWidgetCampaignCard renders a card and escapes markup", () => {
    const card = renderWidgetCampaignCard({
      id: "cmp_1",
      name: "<script>alert(1)</script>",
      status: "active",
      type: "email",
      enrollments: 3,
    });
    expect(card).toContain("&lt;script&gt;");
    expect(card).not.toContain("<script>alert");
    expect(card).toContain("badge-active");
    expect(card).toContain("Enrollments: 3");

    const unknown = renderWidgetCampaignCard({ id: "cmp_2", name: "No data" });
    expect(unknown).toContain("Enrollments: —");
    expect(unknown).toContain("badge-unknown");
  });
});
