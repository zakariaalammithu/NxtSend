/**
 * Shared REST platform config + envelope tests.
 *
 * Covers: platform configs (both platforms), the enabled flag
 * (unset = on), the public-origin precedence, the resource URL,
 * and the webhook envelope (same 8 events, stable id, shape).
 * Outbox/emit behaviour is covered by Worker B's
 * n8n-webhooks.test.ts in this folder.
 */

import { describe, it, expect } from "vitest";
import {
  getPlatformConfig,
  isPlatformEnabled,
  getPlatformBaseUrl,
  getPlatformResourceUrl,
  platformDisplayName,
  ZAPIER_PLATFORM,
  N8N_PLATFORM,
} from "../config";
import {
  WEBHOOK_EVENT_TYPES,
  WEBHOOK_EVENT_DESCRIPTIONS,
  isWebhookEventType,
  buildEventEnvelope,
} from "../events";

describe("platform config", () => {
  it("has the agreed shape for both platforms", () => {
    expect(getPlatformConfig("zapier")).toBe(ZAPIER_PLATFORM);
    expect(getPlatformConfig("n8n")).toBe(N8N_PLATFORM);
    expect(ZAPIER_PLATFORM).toMatchObject({
      platform: "zapier",
      resourcePath: "/api/integrations/zapier",
      scopePrefix: "zapier",
      enabledEnv: "ZAPIER_ENABLED",
      baseUrlEnv: "ZAPIER_APP_BASE_URL",
      auditPrefix: "zapier",
    });
    expect(N8N_PLATFORM).toMatchObject({
      platform: "n8n",
      resourcePath: "/api/integrations/n8n",
      scopePrefix: "n8n",
      enabledEnv: "N8N_INTEGRATION_ENABLED",
      baseUrlEnv: "N8N_API_BASE_URL",
      auditPrefix: "n8n",
    });
    expect(platformDisplayName("zapier")).toBe("Zapier");
    expect(platformDisplayName("n8n")).toBe("n8n");
  });

  it("is enabled unless explicitly disabled", () => {
    expect(isPlatformEnabled("n8n", {})).toBe(true);
    expect(isPlatformEnabled("n8n", { N8N_INTEGRATION_ENABLED: "false" })).toBe(false);
    expect(isPlatformEnabled("n8n", { N8N_INTEGRATION_ENABLED: "0" })).toBe(false);
    expect(isPlatformEnabled("n8n", { N8N_INTEGRATION_ENABLED: "true" })).toBe(true);
    expect(isPlatformEnabled("zapier", { ZAPIER_ENABLED: "no" })).toBe(false);
    expect(isPlatformEnabled("zapier", {})).toBe(true);
  });

  it("resolves the public origin with baseUrlEnv → NEXT_PUBLIC_APP_URL → request origin", () => {
    expect(
      getPlatformBaseUrl("n8n", "https://origin.example", {
        N8N_API_BASE_URL: "https://n8n.example",
        NEXT_PUBLIC_APP_URL: "https://app.example",
      })
    ).toBe("https://n8n.example");
    expect(
      getPlatformBaseUrl("n8n", "https://origin.example", {
        NEXT_PUBLIC_APP_URL: "https://app.example",
      })
    ).toBe("https://app.example");
    expect(getPlatformBaseUrl("n8n", "https://origin.example", {})).toBe("https://origin.example");
    expect(getPlatformBaseUrl("n8n", undefined, {})).toBeNull();
  });

  it("builds the resource URL from the origin", () => {
    expect(getPlatformResourceUrl("n8n", "https://nxtsend.com/")).toBe(
      "https://nxtsend.com/api/integrations/n8n"
    );
    expect(getPlatformResourceUrl("zapier", "https://nxtsend.com")).toBe(
      "https://nxtsend.com/api/integrations/zapier"
    );
  });
});

describe("webhook events + envelope", () => {
  it("has exactly the 8 genuine events", () => {
    expect([...WEBHOOK_EVENT_TYPES]).toEqual([
      "lead.created",
      "lead.updated",
      "lead.added_to_campaign",
      "lead.removed_from_campaign",
      "campaign.created",
      "campaign.status_changed",
      "conversation.reply_created",
      "subscription.changed",
    ]);
    for (const type of WEBHOOK_EVENT_TYPES) {
      expect(WEBHOOK_EVENT_DESCRIPTIONS[type]).toBeTruthy();
    }
    expect(isWebhookEventType("lead.created")).toBe(true);
    expect(isWebhookEventType("linkedin.message_sent")).toBe(false);
    expect(isWebhookEventType(undefined)).toBe(false);
  });

  it("builds the stable envelope shape, keeping a passed id", () => {
    const envelope = buildEventEnvelope("lead.created", "ws_1", { leadId: "l1" }, "evt_1");
    expect(envelope).toEqual({
      id: "evt_1",
      type: "lead.created",
      created_at: expect.any(String),
      workspace_id: "ws_1",
      data: { leadId: "l1" },
    });
    const generated = buildEventEnvelope("campaign.created", "ws_1", {});
    expect(generated.id).toBeTruthy();
    expect(generated.id).not.toBe("evt_1");
  });
});
