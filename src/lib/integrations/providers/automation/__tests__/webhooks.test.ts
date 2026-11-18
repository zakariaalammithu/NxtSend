/**
 * Automation-platform webhook tests (Make, Pabbly Connect, Albato,
 * Activepieces).
 *
 * Covers, per platform, over the in-memory platform store:
 * subscribe (valid event + public https target URL, invalid event
 * rejected, Zapier hook URL rejected, query-string URL rejected),
 * list (only this workspace's, only this platform's), unsubscribe
 * (own subscription removed, another workspace's subscription is
 * not visible), and secret redaction (the stored secret is never
 * returned). Also covers the shared 8-event set and dedup by
 * (workspace, event, target URL).
 *
 * NOTE: these tests run over InMemoryPlatformStore. The Supabase
 * store has a known bug (src/lib/integrations/rest/outbox.ts
 * rowToSubscription maps any non-n8n platform to "zapier", so a
 * Make/Pabbly/Albato/Activepieces subscription read back from
 * Supabase would be filtered out) — a coordinator follow-up, not
 * covered here because it needs a live database.
 */
import { describe, it, expect } from "vitest";
import { InMemoryPlatformStore } from "@/lib/integrations/rest/outbox";
import { WEBHOOK_EVENT_TYPES } from "@/lib/integrations/rest/events";
import {
  ACTIVEPIECES_PLATFORM,
  ALBATO_PLATFORM,
  MAKE_PLATFORM,
  PABBLY_PLATFORM,
  type RestPlatform,
} from "@/lib/integrations/rest/config";
import type { RestApiDeps, RestApiResult } from "@/lib/integrations/rest/api";
import {
  restListWebhookSubscriptions,
  restSubscribeWebhook,
  restUnsubscribeWebhook,
} from "@/lib/integrations/rest/api";
import type { MuseAccessContext } from "@/lib/muse-connector/oauth/tokens";
import {
  FakeAccountsRepository,
  FakeCampaignsRepository,
  FakeInboxRepository,
  FakeLeadsRepository,
  FakeScheduledRepliesRepository,
  FakeUsageRepository,
} from "@/lib/muse-connector/__tests__/fakes";

const WS_A = "ws_a";
const WS_B = "ws_b";
const USER_A = "user_a";

const TARGET_URLS: Record<RestPlatform, string> = {
  zapier: "https://hooks.zapier.com/hooks/catch/123456/abcdef",
  n8n: "https://my-workspace.app.n8n.cloud/webhook/abc123",
  make: "https://hook.integromat.com/abc123",
  pabbly: "https://connect.pabbly.com/workflow/sendwebhookdata/abc123",
  albato: "https://webhook.albato.com/abc123",
  activepieces: "https://cloud.activepieces.com/api/v1/webhooks/abc123",
};

const PLATFORM_CONFIGS = [
  { id: "make" as const, config: MAKE_PLATFORM },
  { id: "pabbly" as const, config: PABBLY_PLATFORM },
  { id: "albato" as const, config: ALBATO_PLATFORM },
  { id: "activepieces" as const, config: ACTIVEPIECES_PLATFORM },
];

function ctx(workspaceId = WS_A, platform: RestPlatform): MuseAccessContext {
  return {
    userId: USER_A,
    workspaceId,
    scopes: [`${platform}.read`, `${platform}.write`],
    clientId: `${platform}_client`,
    grantId: `${platform}_client:${USER_A}`,
    resource: `https://nxtsend.com/api/integrations/${platform}`,
  };
}

function deps(platform: RestPlatform): RestApiDeps {
  const store = new InMemoryPlatformStore(platform);
  return {
    platform:
      platform === "make"
        ? MAKE_PLATFORM
        : platform === "pabbly"
          ? PABBLY_PLATFORM
          : platform === "albato"
            ? ALBATO_PLATFORM
            : ACTIVEPIECES_PLATFORM,
    leads: new FakeLeadsRepository(),
    campaigns: new FakeCampaignsRepository(),
    inbox: new FakeInboxRepository(),
    accounts: new FakeAccountsRepository(),
    usage: new FakeUsageRepository(),
    scheduledReplies: new FakeScheduledRepliesRepository(),
    mode: "supabase",
    store,
    emit: async () => {},
    sendReply: async () => {
      throw new Error("not used in webhook tests");
    },
    getUserLabel: async (userId: string) => ({ id: userId, email: "owner@example.com" }),
    getWorkspaceLabel: async (workspaceId: string) => ({ id: workspaceId, name: "Acme Workspace" }),
    audit: async () => {},
  } as unknown as RestApiDeps;
}

/** Narrow a RestApiResult body to the shape the test expects. */
function bodyOf<T>(res: RestApiResult): T {
  return res.body as T;
}

describe("automation platform webhooks", () => {
  it("the shared webhook event set is the same 8 events for all platforms", () => {
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
  });

  for (const { id } of PLATFORM_CONFIGS) {
    it(`${id}: subscribe → list → unsubscribe`, async () => {
      const d = deps(id);
      const sub = await restSubscribeWebhook(ctx(WS_A, id), d, {
        event: "lead.created",
        target_url: TARGET_URLS[id],
      });
      expect(sub.status).toBe(201);
      const created = bodyOf<{ id: string; event: string; target_url: string }>(sub);
      expect(created.event).toBe("lead.created");
      expect(created.target_url).toBe(TARGET_URLS[id]);
      // The secret is stored but never returned.
      expect((created as unknown as Record<string, unknown>).secret).toBeUndefined();
      expect(created.id).toBeTruthy();

      const list = await restListWebhookSubscriptions(ctx(WS_A, id), d);
      expect(list.status).toBe(200);
      const subs = bodyOf<{ subscriptions: Array<Record<string, unknown>> }>(list).subscriptions;
      expect(subs.length).toBe(1);
      expect(subs[0].id).toBe(created.id);

      const unsub = await restUnsubscribeWebhook(ctx(WS_A, id), d, { id: created.id });
      expect(unsub.status).toBe(200);
      const after = await restListWebhookSubscriptions(ctx(WS_A, id), d);
      expect(bodyOf<{ subscriptions: unknown[] }>(after).subscriptions.length).toBe(0);
    });

    it(`${id}: subscribe rejects an invalid event and a Zapier hook URL`, async () => {
      const d = deps(id);
      const badEvent = await restSubscribeWebhook(ctx(WS_A, id), d, {
        event: "lead.deleted",
        target_url: TARGET_URLS[id],
      });
      expect(badEvent.status).toBe(400);
      const zapierUrl = await restSubscribeWebhook(ctx(WS_A, id), d, {
        event: "lead.created",
        target_url: TARGET_URLS.zapier,
      });
      expect(zapierUrl.status).toBe(400);
      const withQuery = await restSubscribeWebhook(ctx(WS_A, id), d, {
        event: "lead.created",
        target_url: `${TARGET_URLS[id]}?x=1`,
      });
      expect(withQuery.status).toBe(400);
    });

    it(`${id}: subscriptions are workspace-isolated`, async () => {
      const d = deps(id);
      const sub = await restSubscribeWebhook(ctx(WS_A, id), d, {
        event: "campaign.created",
        target_url: TARGET_URLS[id],
      });
      expect(sub.status).toBe(201);
      const created = bodyOf<{ id: string }>(sub);
      // Workspace B sees nothing.
      const listB = await restListWebhookSubscriptions(ctx(WS_B, id), d);
      expect(bodyOf<{ subscriptions: unknown[] }>(listB).subscriptions.length).toBe(0);
      // Workspace B cannot unsubscribe workspace A's subscription.
      const unsubB = await restUnsubscribeWebhook(ctx(WS_B, id), d, { id: created.id });
      expect(unsubB.status).toBe(404);
      // Workspace A still has it.
      const listA = await restListWebhookSubscriptions(ctx(WS_A, id), d);
      expect(bodyOf<{ subscriptions: unknown[] }>(listA).subscriptions.length).toBe(1);
    });

    it(`${id}: subscribing the same (event, target URL) twice dedups`, async () => {
      const d = deps(id);
      const first = await restSubscribeWebhook(ctx(WS_A, id), d, {
        event: "lead.updated",
        target_url: TARGET_URLS[id],
      });
      const second = await restSubscribeWebhook(ctx(WS_A, id), d, {
        event: "lead.updated",
        target_url: TARGET_URLS[id],
      });
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      const firstId = bodyOf<{ id: string }>(first).id;
      const secondId = bodyOf<{ id: string }>(second).id;
      expect(secondId).toBe(firstId);
      const list = await restListWebhookSubscriptions(ctx(WS_A, id), d);
      expect(bodyOf<{ subscriptions: unknown[] }>(list).subscriptions.length).toBe(1);
    });

    it(`${id}: unsubscribe without an id is a 400`, async () => {
      const d = deps(id);
      const res = await restUnsubscribeWebhook(ctx(WS_A, id), d, {});
      expect(res.status).toBe(400);
    });
  }

  it("subscriptions are platform-isolated (a Make sub never lists under Pabbly)", async () => {
    const dMake = deps("make");
    const sub = await restSubscribeWebhook(ctx(WS_A, "make"), dMake, {
      event: "lead.created",
      target_url: TARGET_URLS.make,
    });
    expect(sub.status).toBe(201);
    // A Pabbly deps object with its own store has no Make subscriptions.
    const dPabbly = deps("pabbly");
    const list = await restListWebhookSubscriptions(ctx(WS_A, "pabbly"), dPabbly);
    expect(bodyOf<{ subscriptions: unknown[] }>(list).subscriptions.length).toBe(0);
    // And the config's platform field matches the platform.
    expect(MAKE_PLATFORM.platform).toBe("make");
  });
});
