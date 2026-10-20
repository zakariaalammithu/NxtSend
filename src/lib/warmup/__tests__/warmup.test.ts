/**
 * Warm-up provider adapter tests (P5 Stage E).
 *
 * The properties that matter (owner's hard rules):
 *  - state derives from env presence only; key presence alone NEVER
 *    produces a "verified" or "running" claim;
 *  - NO provider call happens in demo mode or without a real key —
 *    spies prove zero outbound contact, so warm-up can never appear
 *    active without a real provider behind it;
 *  - verify succeeds/fails on the PROVIDER'S actual response
 *    (fixtures shaped exactly like Instantly's documented API v2
 *    payloads — OpenAPI spec at developer.instantly.ai);
 *  - status mapping is field-by-field from provider data; unknown or
 *    missing fields degrade to null / "unknown", never to estimates;
 *  - NxtSend computes nothing: provider numbers pass through verbatim.
 * No test makes a real network call.
 */

import { describe, it, expect, vi } from "vitest";
import { getWarmupState, isWarmupConfigured } from "../state";
import {
  InstantlyWarmupAdapter,
  mapInstantlyAccount,
  mapInstantlyAnalytics,
} from "../instantly";
import { getIntegrationStatuses } from "@/lib/integrations-center/status";
import { verifyIntegration } from "@/lib/integrations-center/verify";

const KEY = "instantly-live-key-abc123";

// ── Fixtures: Instantly API v2 payloads (documented shapes) ────────────────

const ACCOUNT_ACTIVE = {
  email: "alex@outreach.example.com",
  timestamp_created: "2026-10-01T09:00:00.000Z",
  timestamp_updated: "2026-10-19T09:00:00.000Z",
  first_name: "Alex",
  last_name: "Vance",
  warmup: {
    limit: 50,
    increment: "2",
    advanced: { open_rate: 0.95, read_emulation: true, weekday_only: true },
  },
  daily_limit: 30,
  status: 1,
  warmup_status: 1,
  stat_warmup_score: 85,
  timestamp_warmup_start: "2026-10-02T09:00:00.000Z",
  provider_code: 2,
  enable_slow_ramp: true,
  setup_pending: false,
  is_managed_account: false,
  organization: "01a15555-5be5-795c-929d-5592935cc2a9",
  // A field the docs do not define — must be tolerated, not fatal.
  some_future_field: { nested: true },
};

const ACCOUNT_PAUSED = {
  email: "paused@example.com",
  timestamp_created: "2026-09-01T09:00:00.000Z",
  timestamp_updated: "2026-10-10T09:00:00.000Z",
  first_name: "Pat",
  last_name: "Roe",
  warmup: { limit: 20, increment: "disabled" },
  daily_limit: null,
  status: 2,
  warmup_status: 0,
  stat_warmup_score: null,
  timestamp_warmup_start: null,
  provider_code: 3,
  enable_slow_ramp: null,
  setup_pending: false,
  is_managed_account: false,
  organization: "01a15555-5be5-795c-929d-5592935cc2a9",
};

const ANALYTICS_BODY = {
  email_date_data: {
    "alex@outreach.example.com": {
      "2026-10-18": { sent: 40, landed_inbox: 38, landed_spam: 2, received: 39 },
    },
  },
  aggregate_data: {
    "alex@outreach.example.com": {
      sent: 320,
      received: 301,
      landed_inbox: 289,
      landed_spam: 12,
      health_score_label: "92%",
      health_score: 92,
    },
  },
};

interface FetchCall {
  url: string;
  init?: RequestInit;
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/** Routes Instantly calls by URL, recording every call. */
function fakeInstantlyFetch(handlers: {
  accounts?: () => unknown;
  analytics?: () => unknown;
}) {
  const calls: FetchCall[] = [];
  const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("warmup-analytics")) {
      return handlers.analytics
        ? handlers.analytics()
        : jsonResponse(200, ANALYTICS_BODY);
    }
    return handlers.accounts
      ? handlers.accounts()
      : jsonResponse(200, { items: [ACCOUNT_ACTIVE, ACCOUNT_PAUSED] });
  });
  return { fetchFn: fetchFn as unknown as typeof fetch, calls };
}

function adapterWith(fetchFn: typeof fetch, key: string | null = KEY) {
  return new InstantlyWarmupAdapter({
    env: { INSTANTLY_API_KEY: key ?? undefined },
    mode: "supabase",
    fetchFn,
  });
}

// ── State derivation ───────────────────────────────────────────────────────

describe("getWarmupState", () => {
  it("demo mode wins over everything", () => {
    expect(getWarmupState({ INSTANTLY_API_KEY: KEY }, "demo")).toBe("demo");
    expect(getWarmupState({}, "demo")).toBe("demo");
  });

  it("no key → not_connected; placeholder key → configuration_required; real key → connected", () => {
    expect(getWarmupState({}, "supabase")).toBe("not_connected");
    expect(getWarmupState({ INSTANTLY_API_KEY: "" }, "supabase")).toBe(
      "not_connected"
    );
    expect(
      getWarmupState({ INSTANTLY_API_KEY: "your-key-here" }, "supabase")
    ).toBe("configuration_required");
    expect(getWarmupState({ INSTANTLY_API_KEY: KEY }, "supabase")).toBe(
      "connected"
    );
    expect(isWarmupConfigured({ INSTANTLY_API_KEY: KEY })).toBe(true);
    expect(isWarmupConfigured({ INSTANTLY_API_KEY: "your-key-here" })).toBe(
      false
    );
  });
});

// ── Verify: guards run before any outbound call ────────────────────────────

describe("InstantlyWarmupAdapter.verifyConnection — guards", () => {
  it("unconfigured: no provider call is attempted", async () => {
    const { fetchFn, calls } = fakeInstantlyFetch({});
    const result = await adapterWith(fetchFn, null).verifyConnection();
    expect(result.ok).toBe(false);
    expect(result.attempted).toBe(false);
    expect(result.state).toBe("not_connected");
    expect(calls).toHaveLength(0);
  });

  it("placeholder key: configuration_required, still no call", async () => {
    const { fetchFn, calls } = fakeInstantlyFetch({});
    const result = await adapterWith(
      fetchFn,
      "your_instantly_api_key"
    ).verifyConnection();
    expect(result.attempted).toBe(false);
    expect(result.state).toBe("configuration_required");
    expect(calls).toHaveLength(0);
  });

  it("demo mode: no call even with a key present", async () => {
    const { fetchFn, calls } = fakeInstantlyFetch({});
    const adapter = new InstantlyWarmupAdapter({
      env: { INSTANTLY_API_KEY: KEY },
      mode: "demo",
      fetchFn,
    });
    const result = await adapter.verifyConnection();
    expect(result.state).toBe("demo");
    expect(result.attempted).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

// ── Verify: the provider's response decides ────────────────────────────────

describe("InstantlyWarmupAdapter.verifyConnection — provider responses", () => {
  it("200 verifies; the key travels as a Bearer header to the documented URL", async () => {
    const { fetchFn, calls } = fakeInstantlyFetch({});
    const result = await adapterWith(fetchFn).verifyConnection();
    expect(result.ok).toBe(true);
    expect(result.attempted).toBe(true);
    expect(result.state).toBe("connected");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.instantly.ai/api/v2/accounts?limit=1");
    const headers = (calls[0].init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${KEY}`);
  });

  it("401 → Error with the provider's message; never 'verified'", async () => {
    const { fetchFn } = fakeInstantlyFetch({
      accounts: () =>
        jsonResponse(401, {
          statusCode: 401,
          error: "Unauthorized",
          message: "Invalid API key",
        }),
    });
    const result = await adapterWith(fetchFn).verifyConnection();
    expect(result.ok).toBe(false);
    expect(result.state).toBe("error");
    expect(result.message).toContain("401");
    expect(result.message).toContain("Invalid API key");
  });

  it("402 → Error explaining an active paid plan is required", async () => {
    const { fetchFn } = fakeInstantlyFetch({
      accounts: () =>
        jsonResponse(402, {
          statusCode: 402,
          error: "Payment Required",
          message: "Workspace does not have an active paid plan",
        }),
    });
    const result = await adapterWith(fetchFn).verifyConnection();
    expect(result.ok).toBe(false);
    expect(result.message).toContain("no active paid plan");
  });

  it("network failure → Error, attempted", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("socket hang up");
    }) as unknown as typeof fetch;
    const result = await adapterWith(fetchFn).verifyConnection();
    expect(result.ok).toBe(false);
    expect(result.attempted).toBe(true);
    expect(result.state).toBe("error");
    expect(result.message).toContain("socket hang up");
  });
});

// ── Status mapping ─────────────────────────────────────────────────────────

describe("mapInstantlyAccount", () => {
  it("maps every documented field verbatim", () => {
    const m = mapInstantlyAccount(ACCOUNT_ACTIVE);
    expect(m).not.toBeNull();
    expect(m!.email).toBe("alex@outreach.example.com");
    expect(m!.accountStatusLabel).toBe("Active");
    expect(m!.warmupStatus).toBe("active");
    expect(m!.warmupStatusLabel).toBe("Active");
    expect(m!.warmupDailyLimit).toBe(50);
    expect(m!.warmupIncrement).toBe("2");
    expect(m!.slowRamp).toBe(true);
    expect(m!.dailyLimit).toBe(30);
    expect(m!.warmupScore).toBe(85);
    expect(m!.warmupStartedAt).toBe("2026-10-02T09:00:00.000Z");
    expect(m!.mailboxProvider).toBe("Google");
    expect(m!.analytics).toBeNull();
  });

  it("paused warm-up + null fields degrade to nulls, not estimates", () => {
    const m = mapInstantlyAccount(ACCOUNT_PAUSED);
    expect(m!.warmupStatus).toBe("paused");
    expect(m!.accountStatusLabel).toBe("Paused");
    expect(m!.warmupIncrement).toBe("disabled");
    expect(m!.dailyLimit).toBeNull();
    expect(m!.warmupScore).toBeNull();
    expect(m!.warmupStartedAt).toBeNull();
    expect(m!.slowRamp).toBeNull();
    expect(m!.mailboxProvider).toBe("Microsoft");
  });

  it("unknown enum codes and missing objects are tolerated", () => {
    const m = mapInstantlyAccount({
      email: "odd@example.com",
      status: 42,
      warmup_status: 7,
      // no warmup object at all, no provider_code
    });
    expect(m!.warmupStatus).toBe("unknown");
    expect(m!.warmupStatusCode).toBe(7);
    expect(m!.accountStatusLabel).toContain("42");
    expect(m!.warmupDailyLimit).toBeNull();
    expect(m!.mailboxProvider).toBeNull();
  });

  it("a row without an email is dropped, never rendered", () => {
    expect(mapInstantlyAccount({ status: 1 })).toBeNull();
    expect(mapInstantlyAccount(null)).toBeNull();
    expect(mapInstantlyAccount("nope")).toBeNull();
  });

  it("provider-reported problem states map to their documented labels", () => {
    for (const [code, status, label] of [
      [-1, "banned", "Banned"],
      [-2, "spam_folder_unknown", "Spam Folder Unknown"],
      [-3, "permanent_suspension", "Permanent Suspension"],
    ] as const) {
      const m = mapInstantlyAccount({ email: "x@example.com", warmup_status: code });
      expect(m!.warmupStatus).toBe(status);
      expect(m!.warmupStatusLabel).toBe(label);
    }
  });
});

describe("mapInstantlyAnalytics", () => {
  it("passes provider numbers through verbatim", () => {
    const a = mapInstantlyAnalytics(ANALYTICS_BODY.aggregate_data["alex@outreach.example.com"]);
    expect(a).toEqual({
      sent: 320,
      received: 301,
      landedInbox: 289,
      landedSpam: 12,
      healthScore: 92,
      healthScoreLabel: "92%",
    });
  });

  it("missing fields → nulls", () => {
    const a = mapInstantlyAnalytics({});
    expect(a.sent).toBeNull();
    expect(a.healthScore).toBeNull();
    expect(a.healthScoreLabel).toBeNull();
  });
});

// ── getWarmupStatus ────────────────────────────────────────────────────────

describe("InstantlyWarmupAdapter.getWarmupStatus", () => {
  it("unconfigured: refuses without any provider call", async () => {
    const { fetchFn, calls } = fakeInstantlyFetch({});
    const result = await adapterWith(fetchFn, null).getWarmupStatus();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.state).toBe("not_connected");
    expect(calls).toHaveLength(0);
  });

  it("returns provider mailboxes with analytics merged by email", async () => {
    const { fetchFn, calls } = fakeInstantlyFetch({});
    const result = await adapterWith(fetchFn).getWarmupStatus();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.provider).toBe("instantly");
    expect(result.report.mailboxes).toHaveLength(2);
    const alex = result.report.mailboxes[0];
    expect(alex.warmupStatus).toBe("active");
    expect(alex.analytics?.sent).toBe(320);
    expect(alex.analytics?.healthScore).toBe(92);
    // The paused mailbox has no analytics entry at the provider → null,
    // and the analytics request carried exactly the listed emails.
    expect(result.report.mailboxes[1].analytics).toBeNull();
    const analyticsCall = calls.find((c) =>
      c.url.includes("warmup-analytics")
    );
    expect(analyticsCall).toBeDefined();
    expect(JSON.parse(String(analyticsCall!.init?.body))).toEqual({
      emails: ["alex@outreach.example.com", "paused@example.com"],
    });
    expect(result.report.analyticsError).toBeNull();
  });

  it("analytics failure degrades honestly: mailboxes shown, reason attached, no invented numbers", async () => {
    const { fetchFn } = fakeInstantlyFetch({
      analytics: () =>
        jsonResponse(500, { statusCode: 500, error: "Server Error", message: "boom" }),
    });
    const result = await adapterWith(fetchFn).getWarmupStatus();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.mailboxes).toHaveLength(2);
    expect(result.report.mailboxes[0].analytics).toBeNull();
    expect(result.report.analyticsError).toContain("500");
  });

  it("accounts failure → ok:false error state (no partial fabrication)", async () => {
    const { fetchFn } = fakeInstantlyFetch({
      accounts: () =>
        jsonResponse(401, { statusCode: 401, error: "Unauthorized", message: "bad key" }),
    });
    const result = await adapterWith(fetchFn).getWarmupStatus();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.state).toBe("error");
      expect(result.message).toContain("401");
    }
  });
});

// ── Integration Center wiring ──────────────────────────────────────────────

describe("Integration Center — warmup entry", () => {
  const warmupStatus = (
    entries: ReturnType<typeof getIntegrationStatuses>
  ) => entries.find((e) => e.descriptor.id === "warmup")!;

  it("demo mode: Demo Mode status whose message says Unavailable", () => {
    const entry = warmupStatus(getIntegrationStatuses({ env: {}, mode: "demo" }));
    expect(entry.status).toBe("Demo Mode");
    expect(entry.statusMessage).toContain("Unavailable");
  });

  it("live, no key: Not Connected with the Unavailable wording", () => {
    const entry = warmupStatus(
      getIntegrationStatuses({ env: {}, mode: "supabase" })
    );
    expect(entry.status).toBe("Not Connected");
    expect(entry.statusMessage).toContain("Unavailable — provider not connected");
  });

  it("live, key set: Connected but Not Verified — never Verified from the key alone", () => {
    const entry = warmupStatus(
      getIntegrationStatuses({
        env: { INSTANTLY_API_KEY: KEY },
        mode: "supabase",
      })
    );
    expect(entry.status).toBe("Connected but Not Verified");
    expect(entry.envPresence).toEqual([
      { name: "INSTANTLY_API_KEY", present: true },
    ]);
  });

  it("a stored successful verification upgrades to Connected and Verified", () => {
    const entry = warmupStatus(
      getIntegrationStatuses({
        env: { INSTANTLY_API_KEY: KEY },
        mode: "supabase",
        verifications: {
          warmup: {
            ok: true,
            checkedAt: "2026-10-20T00:00:00.000Z",
            message: "Instantly accepted the API key.",
          },
        },
      })
    );
    expect(entry.status).toBe("Connected and Verified");
  });

  it("verifyIntegration: no key → Not Connected, fetch never called", async () => {
    const fetchFn = vi.fn(async () => jsonResponse(200, { items: [] }));
    const outcome = await verifyIntegration("warmup", {
      env: {},
      mode: "supabase",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(outcome?.status).toBe("Not Connected");
    expect(outcome?.attempted).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("verifyIntegration: provider 200 → Connected and Verified; 401 → Error", async () => {
    const okFetch = vi.fn(async () =>
      jsonResponse(200, { items: [ACCOUNT_ACTIVE] })
    );
    const ok = await verifyIntegration("warmup", {
      env: { INSTANTLY_API_KEY: KEY },
      mode: "supabase",
      fetchFn: okFetch as unknown as typeof fetch,
    });
    expect(ok?.status).toBe("Connected and Verified");
    expect(ok?.ok).toBe(true);

    const badFetch = vi.fn(async () =>
      jsonResponse(401, { statusCode: 401, error: "Unauthorized", message: "nope" })
    );
    const bad = await verifyIntegration("warmup", {
      env: { INSTANTLY_API_KEY: KEY },
      mode: "supabase",
      fetchFn: badFetch as unknown as typeof fetch,
    });
    expect(bad?.status).toBe("Error");
    expect(bad?.ok).toBe(false);
  });

  it("verifyIntegration in demo mode attempts nothing", async () => {
    const fetchFn = vi.fn(async () => jsonResponse(200, { items: [] }));
    const outcome = await verifyIntegration("warmup", {
      env: { INSTANTLY_API_KEY: KEY },
      mode: "demo",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(outcome?.status).toBe("Demo Mode");
    expect(outcome?.attempted).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
