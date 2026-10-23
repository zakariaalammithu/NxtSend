import { describe, it, expect } from "vitest";
import {
  aggregateHealth,
  type HealthCheck,
} from "../health-core";
import {
  validateSubmissionInput,
  createRateLimiter,
  isHoneypotTripped,
} from "../submissions-core";
import {
  DEFAULT_ADMIN_SETTINGS,
  validateSettingsUpdate,
  diffSettings,
  toPublicSettings,
  isSignupOpen,
  type AdminSettings,
} from "../settings-core";
import {
  filterAuditEntries,
  shapeAuditRow,
  type AuditEntry,
} from "../audit-core";
import { buildUsageRow, groupSignupsByMonth } from "../usage-core";
import { mergeNotifications, type AdminNotification } from "../notifications-core";
import { ADMIN_NAV_GROUPS } from "../nav";
import { demoGetSettings, demoUpdateSettings } from "../demo-server-store";

// ── System Health aggregation (the honesty rule) ────────────────────────────

function check(partial: Partial<HealthCheck> & { id: string }): HealthCheck {
  return {
    label: partial.id,
    status: "ok",
    required: false,
    message: "",
    ...partial,
  };
}

describe("aggregateHealth", () => {
  it("is healthy only when every check is ok", () => {
    const summary = aggregateHealth([
      check({ id: "db", status: "ok", required: true }),
      check({ id: "email", status: "ok" }),
    ]);
    expect(summary.overall).toBe("healthy");
    expect(summary.label).toBe("Healthy");
  });

  it("a FAILED required check flips the overall status to issues — never healthy", () => {
    const summary = aggregateHealth([
      check({ id: "db", status: "fail", required: true }),
      check({ id: "email", status: "ok" }),
      check({ id: "billing", status: "ok" }),
    ]);
    expect(summary.overall).toBe("issues");
    expect(summary.label).toBe("Issues found");
  });

  it("an UNKNOWN required check also flips the overall status to issues", () => {
    const summary = aggregateHealth([
      check({ id: "db", status: "unknown", required: true }),
    ]);
    expect(summary.overall).toBe("issues");
  });

  it("a non-required failure degrades to not_configured, not healthy", () => {
    const summary = aggregateHealth([
      check({ id: "db", status: "ok", required: true }),
      check({ id: "pixel", status: "fail" }),
    ]);
    expect(summary.overall).toBe("not_configured");
    expect(summary.label).toBe("Not fully configured");
  });

  it("a warning anywhere prevents a blanket healthy verdict", () => {
    const summary = aggregateHealth([
      check({ id: "db", status: "ok", required: true }),
      check({ id: "jobs", status: "warning" }),
    ]);
    expect(summary.overall).toBe("not_configured");
    expect(summary.counts).toEqual({ ok: 1, warning: 1, fail: 0, unknown: 0 });
  });
});

// ── Submissions validation + rate limiting ──────────────────────────────────

describe("validateSubmissionInput", () => {
  const valid = {
    source: "contact",
    name: "Priya Sharma",
    email: "Priya@Example.com",
    company: "Acme Ltd",
    subject: "Pricing question",
    message: "Hello, I would like to know more about agency pricing.",
  };

  it("accepts a valid contact submission and normalises it", () => {
    const result = validateSubmissionInput(valid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.source).toBe("contact");
      expect(result.value.email).toBe("priya@example.com");
      expect(result.value.company).toBe("Acme Ltd");
      expect(result.value.meta).toEqual({});
    }
  });

  it("accepts the demo source and defaults optional fields to null", () => {
    const result = validateSubmissionInput({
      source: "demo",
      name: "Tom Lee",
      email: "tom@corp.io",
      message: "Please book me a product demo next week.",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.company).toBeNull();
      expect(result.value.subject).toBeNull();
    }
  });

  it("rejects an unknown source, bad email, short name and short message together", () => {
    const result = validateSubmissionInput({
      source: "carrier-pigeon",
      name: "X",
      email: "not-an-email",
      message: "short",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual([
        "email",
        "message",
        "name",
        "source",
      ]);
    }
  });

  it("discards a non-object meta instead of trusting it", () => {
    const result = validateSubmissionInput({ ...valid, meta: "evil" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.meta).toEqual({});
  });

  // P10 Stage C: over-limit fields are REJECTED with a per-field 400,
  // never silently truncated (a truncated message reads as delivered
  // while part of it is gone).
  it("rejects over-limit fields instead of truncating them", () => {
    const cases: Array<[Record<string, unknown>, string, RegExp]> = [
      [{ name: "n".repeat(121) }, "name", /at most 120/],
      [{ email: `${"e".repeat(245)}@example.com` }, "email", /at most 254/],
      [{ subject: "s".repeat(201) }, "subject", /at most 200/],
      [{ company: "c".repeat(161) }, "company", /at most 160/],
      [{ message: "m".repeat(5001) }, "message", /at most 5000/],
    ];
    for (const [patch, field, pattern] of cases) {
      const result = validateSubmissionInput({ ...valid, ...patch });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[field]).toMatch(pattern);
    }
  });

  it("accepts fields exactly at the limit", () => {
    const result = validateSubmissionInput({
      ...valid,
      name: "n".repeat(120),
      subject: "s".repeat(200),
      message: "m".repeat(5000),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toHaveLength(120);
      expect(result.value.message).toHaveLength(5000);
    }
  });
});

describe("isHoneypotTripped", () => {
  it("trips only on a non-empty honeypot value", () => {
    expect(isHoneypotTripped({ website: "http://spam.example" })).toBe(true);
    expect(isHoneypotTripped({ website: "" })).toBe(false);
    expect(isHoneypotTripped({ website: "   " })).toBe(false);
    expect(isHoneypotTripped({})).toBe(false);
    expect(isHoneypotTripped({ website: 42 })).toBe(false);
  });
});

describe("createRateLimiter", () => {
  it("allows up to maxAttempts per window, then blocks", () => {
    const limiter = createRateLimiter({ maxAttempts: 3, windowMs: 60_000 });
    const t0 = 1_000_000;
    expect(limiter.check("ip-1", t0)).toBe(true);
    expect(limiter.check("ip-1", t0 + 1)).toBe(true);
    expect(limiter.check("ip-1", t0 + 2)).toBe(true);
    expect(limiter.check("ip-1", t0 + 3)).toBe(false);
  });

  it("resets after the window passes and isolates keys", () => {
    const limiter = createRateLimiter({ maxAttempts: 1, windowMs: 60_000 });
    const t0 = 5_000;
    expect(limiter.check("ip-1", t0)).toBe(true);
    expect(limiter.check("ip-1", t0 + 10)).toBe(false);
    expect(limiter.check("ip-2", t0 + 10)).toBe(true);
    expect(limiter.check("ip-1", t0 + 60_000)).toBe(true);
  });
});

// ── Settings validation, public projection, signup gate ─────────────────────

const CURRENT: AdminSettings = { ...DEFAULT_ADMIN_SETTINGS };

describe("validateSettingsUpdate", () => {
  it("applies a partial update and keeps untouched fields", () => {
    const result = validateSettingsUpdate({ signups_open: false }, CURRENT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.signups_open).toBe(false);
      expect(result.value.site_name).toBe(CURRENT.site_name);
    }
  });

  it("rejects an invalid support email and a non-boolean flag", () => {
    const result = validateSettingsUpdate(
      { support_email: "nope", signups_open: "yes" },
      CURRENT
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.support_email).toBeTruthy();
      expect(result.errors.signups_open).toBeTruthy();
    }
  });

  it("rejects out-of-range daily limits", () => {
    const result = validateSettingsUpdate(
      { default_daily_connections: 0, default_daily_messages: 999_999 },
      CURRENT
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.default_daily_connections).toBeTruthy();
      expect(result.errors.default_daily_messages).toBeTruthy();
    }
  });

  it("ignores unknown fields instead of persisting them", () => {
    const result = validateSettingsUpdate(
      { site_name: "NxtSend Pro", injected: "x" },
      CURRENT
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.site_name).toBe("NxtSend Pro");
      expect("injected" in result.value).toBe(false);
    }
  });
});

describe("settings helpers", () => {
  it("toPublicSettings exposes ONLY the three public fields", () => {
    const pub = toPublicSettings(CURRENT);
    expect(Object.keys(pub).sort()).toEqual([
      "demo_banner_enabled",
      "signups_open",
      "site_name",
    ]);
  });

  it("isSignupOpen is the single signup-gate decision", () => {
    expect(isSignupOpen({ signups_open: true })).toBe(true);
    expect(isSignupOpen({ signups_open: false })).toBe(false);
  });

  it("diffSettings reports only changed fields (for the audit entry)", () => {
    const diff = diffSettings(CURRENT, {
      ...CURRENT,
      signups_open: false,
    });
    expect(Object.keys(diff)).toEqual(["signups_open"]);
    expect(diff.signups_open).toEqual({ from: true, to: false });
  });
});

describe("demo settings store persistence", () => {
  it("round-trips an update: save → read back → signup gate flips", () => {
    const before = demoGetSettings();
    const updated = demoUpdateSettings(
      { ...before, signups_open: false, site_name: "NxtSend Test" },
      "admin@example.com"
    );
    expect(updated.signups_open).toBe(false);
    expect(updated.updated_by).toBe("admin@example.com");
    expect(updated.updated_at).toBeTruthy();

    const readBack = demoGetSettings();
    expect(readBack.site_name).toBe("NxtSend Test");
    expect(isSignupOpen(readBack)).toBe(false);

    // Restore defaults for other tests sharing this process store.
    demoUpdateSettings({ ...DEFAULT_ADMIN_SETTINGS }, null);
    expect(isSignupOpen(demoGetSettings())).toBe(true);
  });
});

// ── Audit filtering + row shaping ───────────────────────────────────────────

const ENTRIES: AuditEntry[] = [
  {
    id: "1",
    actor: "admin@nxtsend.com",
    action: "USER_SUSPEND",
    resource: "user:u1",
    details: "Suspended user bob@corp.io",
    created_at: "2026-10-01T09:00:00.000Z",
  },
  {
    id: "2",
    actor: "admin@nxtsend.com",
    action: "SETTINGS_UPDATE",
    resource: "settings:global",
    details: "signups_open: true -> false",
    created_at: "2026-10-05T12:00:00.000Z",
  },
  {
    id: "3",
    actor: "ops@nxtsend.com",
    action: "USER_ACTIVATE",
    resource: "user:u2",
    details: "Re-activated user kim@corp.io",
    created_at: "2026-10-10T08:30:00.000Z",
  },
];

describe("filterAuditEntries", () => {
  it("filters by exact action; 'all' passes everything", () => {
    expect(filterAuditEntries(ENTRIES, { action: "SETTINGS_UPDATE" })).toHaveLength(1);
    expect(filterAuditEntries(ENTRIES, { action: "all" })).toHaveLength(3);
    expect(filterAuditEntries(ENTRIES, {})).toHaveLength(3);
  });

  it("filters by actor substring (case-insensitive)", () => {
    expect(filterAuditEntries(ENTRIES, { actor: "OPS@" })).toHaveLength(1);
  });

  it("applies the date range inclusively on both ends", () => {
    const result = filterAuditEntries(ENTRIES, {
      from: "2026-10-05",
      to: "2026-10-10",
    });
    expect(result.map((e) => e.id)).toEqual(["2", "3"]);
  });

  it("searches across actor, action, resource and details", () => {
    expect(filterAuditEntries(ENTRIES, { search: "bob@corp" })).toHaveLength(1);
    expect(filterAuditEntries(ENTRIES, { search: "settings:global" })).toHaveLength(1);
    expect(filterAuditEntries(ENTRIES, { search: "nonexistent" })).toHaveLength(0);
  });
});

describe("shapeAuditRow", () => {
  it("prefers metadata.details and the actor email from metadata", () => {
    const entry = shapeAuditRow({
      id: 42,
      action: "SETTINGS_UPDATE",
      resource: "settings:global",
      metadata: { details: "site_name changed", actor_email: "a@b.co" },
      created_at: "2026-10-05T00:00:00.000Z",
    });
    expect(entry.id).toBe("42");
    expect(entry.actor).toBe("a@b.co");
    expect(entry.details).toBe("site_name changed");
  });

  it("falls back to 'system' when no actor is recorded", () => {
    const entry = shapeAuditRow({ id: "x", action: "BOOT", metadata: {} });
    expect(entry.actor).toBe("system");
    expect(entry.resource).toBeNull();
  });
});

// ── Usage rows + growth grouping ────────────────────────────────────────────

describe("buildUsageRow", () => {
  it("flags metrics over the plan limit using the billing limit helpers", () => {
    const row = buildUsageRow({
      workspace_id: "ws_1",
      workspace_name: "Acme",
      plan: "free",
      period_start: "2026-10-01",
      metrics: { leads: 600, campaigns: 1 },
    });
    // free plan: 500 leads / 3 campaigns (planLimits single source).
    expect(row.over_limit).toEqual(["leads"]);
    const leadsCheck = row.checks.find((c) => c.metric === "leads");
    expect(leadsCheck?.limit).toBe(500);
    expect(leadsCheck?.allowed).toBe(false);
  });

  it("reports no over-limit metrics when usage is within plan", () => {
    const row = buildUsageRow({
      workspace_id: "ws_2",
      workspace_name: "Beta",
      plan: "growth",
      period_start: null,
      metrics: { leads: 10 },
    });
    expect(row.over_limit).toEqual([]);
  });
});

describe("groupSignupsByMonth", () => {
  it("buckets by UTC month, ascending, with a running cumulative total", () => {
    const buckets = groupSignupsByMonth([
      "2026-09-15T10:00:00.000Z",
      "2026-08-01T00:00:00.000Z",
      "2026-09-20T10:00:00.000Z",
      "2026-10-02T10:00:00.000Z",
    ]);
    expect(buckets).toEqual([
      { month: "2026-08", signups: 1, cumulative: 1 },
      { month: "2026-09", signups: 2, cumulative: 3 },
      { month: "2026-10", signups: 1, cumulative: 4 },
    ]);
  });

  it("skips invalid timestamps instead of inventing a bucket", () => {
    expect(groupSignupsByMonth(["not-a-date", ""])).toEqual([]);
    expect(groupSignupsByMonth([])).toEqual([]);
  });
});

// ── Notifications merge ─────────────────────────────────────────────────────

describe("mergeNotifications", () => {
  const n = (id: string, created_at: string): AdminNotification => ({
    id,
    source: "audit",
    severity: "info",
    title: id,
    detail: "",
    created_at,
  });

  it("merges groups newest-first and caps at the limit", () => {
    const merged = mergeNotifications(
      [
        [n("a", "2026-10-01T00:00:00Z"), n("b", "2026-10-03T00:00:00Z")],
        [n("c", "2026-10-02T00:00:00Z")],
      ],
      2
    );
    expect(merged.map((x) => x.id)).toEqual(["b", "c"]);
  });
});

// ── Admin navigation completeness (the brief's sidebar) ────────────────────

describe("ADMIN_NAV_GROUPS", () => {
  const allItems = ADMIN_NAV_GROUPS.flatMap((g) => g.items);

  it("has the brief groups in order, with Support after Admin", () => {
    expect(ADMIN_NAV_GROUPS.map((g) => g.label)).toEqual([
      "Admin",
      "Support",
      "Analytics",
      "Billing",
      "Integrations",
      "System",
      "Security / Settings",
    ]);
  });

  it("contains every item the brief requires", () => {
    const labels = allItems.map((i) => i.label);
    for (const required of [
      "Overview",
      "My Campaigns",
      "Users",
      "Campaigns",
      "Leads",
      "CRM",
      "Submissions",
      "Notifications",
      "Support Inbox",
      "Knowledge Base",
      "Saved Replies",
      "Chat Settings",
      "Website Visitors",
      "Traffic Sources",
      "User Growth",
      "Usage & Credits",
      "Transactions",
      "Revenue",
      "Subscriptions",
      "Credit Rules",
      "Email / Resend",
      "Google Sheets",
      "AI Providers",
      "AI Chatbot",
      "Other APIs",
      "Muse.ai Integration",
      "Queue & Workers",
      "Online",
      "Browser Automation",
      "Campaign Settings",
      "System Health",
      "Inbox Testing",
      "Development Diagnostics",
      "System Settings",
      "Configure Secrets",
      "Emergency Controls",
      "Audit Logs",
    ]) {
      expect(labels).toContain(required);
    }
  });

  it("has unique hrefs, all under /admin", () => {
    const hrefs = allItems.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const href of hrefs) expect(href.startsWith("/admin")).toBe(true);
  });
});
