/**
 * P7 Stage D — seed content pins.
 *
 * The Stage D preload has THREE mirrors of the same facts:
 *   1. `seed-content.ts` (the single source of truth),
 *   2. the demo-store fixtures (built FROM the seed module),
 *   3. migration 016's seed SQL (hand-mirrored for live installs).
 * These tests pin all three to the same verified facts so the mirrors
 * cannot drift, and pin the honesty rules: no live/approved statuses,
 * no credential-shaped strings anywhere, shells are display-level
 * only, snapshot states carry the owner-reported badge, and the
 * compliance checklist starts entirely unchecked.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  HUB_SEED_GLOBAL_DOCUMENTS,
  HUB_SEED_RECORDS,
  LEGAL_LINKS,
  LEGAL_LINK_CHECK,
  META_SUBMISSION_ITEMS,
  MUSE_CONNECTOR_TOOLS,
  MUSE_REDIRECT_URI,
  OWNER_REPORTED_BADGE,
  REST_API_CURL_EXAMPLE,
  SECURITY_COMPLIANCE_ITEMS,
  TERM_DERIVED_REQUIREMENTS,
  expectedVaultEntries,
  getSeedRecord,
} from "../seed-content";
import {
  MUSE_CONNECTOR_SCOPES,
  BRR_API_SCOPES,
  validateHubMetadata,
  validateScopesForProfile,
} from "../hub-core";
import {
  __resetHubDemoStore,
  getDemoHubIntegration,
  listDemoHubChecklistEntries,
  listDemoHubCredentials,
  listDemoHubDocuments,
  listDemoHubIntegrations,
  listDemoHubTestAccounts,
} from "../demo-store";

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../.."
);
const sql = readFileSync(
  path.join(appRoot, "supabase/migrations/016_integration_hub.sql"),
  "utf8"
);

const muse = getSeedRecord("brr-muse-connector")!;
const FULL_KEY_RE = /brr_(test|live)_[A-Za-z0-9]{12}_[A-Za-z0-9]{32}/;

beforeEach(() => {
  __resetHubDemoStore();
});

describe("seed records — identity and status discipline", () => {
  it("seeds exactly the six BRR records, in order", () => {
    expect(HUB_SEED_RECORDS.map((r) => r.slug)).toEqual([
      "brr-muse-connector",
      "brr-rest-api",
      "brr-oauth",
      "brr-mcp",
      "brr-zapier",
      "brr-webhooks",
    ]);
  });

  it("assigns honest statuses: Muse in_review, the rest configuring", () => {
    expect(muse.status).toBe("in_review");
    for (const r of HUB_SEED_RECORDS) {
      if (r.slug !== "brr-muse-connector") expect(r.status).toBe("configuring");
      expect(r.status).not.toBe("live");
      expect(r.status).not.toBe("approved");
      expect(r.vendor).toBe("BizReviewRadar");
    }
  });

  it("every record's metadata passes the Hub's own metadata validation", () => {
    for (const r of HUB_SEED_RECORDS) {
      const errors: Record<string, string> = {};
      const out = validateHubMetadata(r.metadata, errors);
      expect(errors).toEqual({});
      expect(out).toBeDefined();
    }
  });
});

describe("Muse connector — scopes", () => {
  it("carries exactly the 3 Muse scopes under the muse profile", () => {
    expect(muse.metadata["scope_profile"]).toBe("muse");
    expect(muse.metadata["scopes"]).toEqual([...MUSE_CONNECTOR_SCOPES]);
    expect(validateScopesForProfile("muse", muse.metadata["scopes"]).ok).toBe(true);
  });

  it("rejects the non-Muse scopes under the muse profile", () => {
    for (const bad of ["reviews:read", "reviews:reply", "analyses:read", "analyses:write", "review_replies:write", "webhooks:manage"]) {
      expect(validateScopesForProfile("muse", [bad]).ok).toBe(false);
    }
  });

  it("REST API + OAuth records carry the 7-scope brr_api profile", () => {
    for (const slug of ["brr-rest-api", "brr-oauth"]) {
      const r = getSeedRecord(slug)!;
      expect(r.metadata["scope_profile"]).toBe("brr_api");
      expect(r.metadata["scopes"]).toEqual([...BRR_API_SCOPES]);
    }
  });
});

describe("Muse connector — the 7 tools (verbatim)", () => {
  it("has exactly the 7 allowlisted tools, in source order", () => {
    expect(MUSE_CONNECTOR_TOOLS.map((t) => t.name)).toEqual([
      "brr.find_business",
      "brr.get_business_profile",
      "brr.get_latest_report",
      "brr.list_recommendations",
      "brr.list_competitors",
      "brr.get_report_alert_preferences",
      "brr.list_unanswered_reviews",
    ]);
  });

  it("maps each tool to its verified scope, all read-only, none tested", () => {
    const map = Object.fromEntries(MUSE_CONNECTOR_TOOLS.map((t) => [t.name, t.scope]));
    expect(map).toEqual({
      "brr.find_business": "businesses:read",
      "brr.get_business_profile": "businesses:read",
      "brr.get_latest_report": "reports:read",
      "brr.list_recommendations": "recommendations:read",
      "brr.list_competitors": "businesses:read",
      "brr.get_report_alert_preferences": "reports:read",
      "brr.list_unanswered_reviews": "businesses:read",
    });
    for (const t of MUSE_CONNECTOR_TOOLS) {
      expect(t.permission).toBe("read");
      expect(t.test_status).toBe("not_tested");
      expect(t.source).toBe("verified_source");
      expect(t.input_schema["type"]).toBe("object");
      expect(t.input_schema["additionalProperties"]).toBe(false);
    }
  });

  it("pins the required-argument contract from the CODE (not the audit digest)", () => {
    const byName = Object.fromEntries(MUSE_CONNECTOR_TOOLS.map((t) => [t.name, t]));
    expect(byName["brr.get_latest_report"].required).toEqual(["business_id"]);
    expect(byName["brr.list_recommendations"].required).toEqual(["business_id"]);
    expect(byName["brr.list_competitors"].required).toEqual(["business_id"]);
    // Handlers use ArgsEmpty / limit-only schemas for these three:
    expect(byName["brr.get_business_profile"].required).toEqual([]);
    expect(byName["brr.get_report_alert_preferences"].required).toEqual([]);
    expect(byName["brr.list_unanswered_reviews"].required).toEqual([]);
    expect(byName["brr.find_business"].required).toEqual([]);
  });

  it("excludes the two private-surface tools and says so", () => {
    const names = MUSE_CONNECTOR_TOOLS.map((t) => t.name);
    expect(names).not.toContain("brr.get_analysis");
    expect(names).not.toContain("brr.draft_review_reply");
    const limitations = muse.metadata["known_limitations"] as string[];
    expect(limitations.join(" ")).toContain("brr.get_analysis");
    expect(limitations.join(" ")).toContain("brr.draft_review_reply");
    const manifest = muse.documents.find((d) => d.kind === "manifest")!;
    expect(manifest.body).toContain("Excluded tools");
  });

  it("the record's tool_inventory IS the pinned tool list", () => {
    expect(muse.metadata["tool_inventory"]).toEqual(MUSE_CONNECTOR_TOOLS);
  });
});

describe("Muse connector — redirect URI and readiness", () => {
  it("records the redirect URI as recorded_unverified", () => {
    expect(muse.metadata["redirect_uris"]).toEqual([MUSE_REDIRECT_URI]);
    expect(MUSE_REDIRECT_URI).toBe(
      "https://agent.meta.ai/api/hatch/oauth/callback"
    );
    expect(muse.metadata["redirect_uri_status"]).toBe("recorded_unverified");
    expect(String(muse.metadata["notes_redirect_status"])).toContain(
      "recorded_unverified"
    );
  });

  it("documents the three readiness conditions and the 404 evidence", () => {
    const readiness = muse.metadata["readiness"] as {
      conditions: string[];
      live_evidence: string;
    };
    expect(readiness.conditions).toHaveLength(3);
    expect(readiness.conditions.join(" ")).toContain("MUSE_CONNECTOR_PUBLIC_ORIGIN");
    expect(readiness.conditions.join(" ")).toContain("muse_mcp_enabled");
    expect(readiness.conditions.join(" ")).toContain("oauth_authcode_enabled");
    expect(readiness.live_evidence).toContain("404");
  });
});

describe("credential shells — display-level only", () => {
  it("defines the expected vault entries per record", () => {
    const shape = (slug: string) =>
      expectedVaultEntries(getSeedRecord(slug)!).map((e) => [
        e.kind,
        e.environment,
      ]);
    expect(shape("brr-muse-connector")).toEqual([
      ["oauth_client_id", "production"],
      ["client_secret", "production"],
    ]);
    expect(shape("brr-rest-api")).toEqual([
      ["api_key", "test"],
      ["api_key", "production"],
    ]);
    expect(shape("brr-oauth")).toEqual([
      ["oauth_client_id", "production"],
      ["client_secret", "production"],
    ]);
    expect(shape("brr-zapier")).toEqual([["api_key", "test"]]);
    expect(shape("brr-webhooks")).toEqual([["webhook_secret", "production"]]);
    expect(shape("brr-mcp")).toEqual([]);
  });

  it("every entry is 'Not configured' with an ENTER_REAL_* placeholder", () => {
    for (const r of HUB_SEED_RECORDS) {
      for (const e of expectedVaultEntries(r)) {
        expect(e.status).toBe("Not configured");
        expect(e.placeholder).toMatch(/^ENTER_REAL_[A-Z_]+$/);
      }
    }
  });

  it("demo shells materialise with NO value material at all", () => {
    for (const rec of listDemoHubIntegrations()) {
      const shells = listDemoHubCredentials(rec.id);
      const expected = expectedVaultEntries(getSeedRecord(rec.slug)!);
      expect(shells).toHaveLength(expected.length);
      for (const s of shells) {
        expect(s.has_value).toBe(false);
        expect(s.value_last4).toBeNull();
        expect(s.status).toBe("needs_verification");
      }
    }
  });

  it("no credential-shaped string exists anywhere in the seed mirrors", () => {
    const tsJson = JSON.stringify({
      records: HUB_SEED_RECORDS,
      docs: HUB_SEED_GLOBAL_DOCUMENTS,
    });
    expect(tsJson).not.toMatch(FULL_KEY_RE);
    expect(sql).not.toMatch(FULL_KEY_RE);
    expect(tsJson).not.toContain("value_enc");
    // The only ENTER_REAL_* strings are placeholder copy.
    expect(tsJson).toContain("ENTER_REAL_CLIENT_SECRET");
  });
});

describe("REST API record — cURL + live-key refusal", () => {
  it("carries the exact placeholder cURL template", () => {
    const rest = getSeedRecord("brr-rest-api")!;
    expect(rest.metadata["curl_example"]).toBe(REST_API_CURL_EXAMPLE);
    expect(REST_API_CURL_EXAMPLE).toContain("${BRR_TEST_API_KEY}");
    expect(REST_API_CURL_EXAMPLE).toContain(
      "https://bizreviewradar.com/api/v1/integration-test"
    );
    expect(REST_API_CURL_EXAMPLE).not.toMatch(FULL_KEY_RE);
  });

  it("documents the verified live-key refusal", () => {
    const rest = getSeedRecord("brr-rest-api")!;
    expect(rest.external_status_note).toContain("api_key_not_activated");
    const liveShell = expectedVaultEntries(rest).find(
      (e) => e.environment === "production"
    )!;
    expect(liveShell.note).toContain("REFUSED");
  });
});

describe("OAuth record — scope catalogue honesty", () => {
  it("uses review_replies:write and flags the page's replies:write error", () => {
    const oauth = getSeedRecord("brr-oauth")!;
    expect(oauth.metadata["scopes"]).toContain("review_replies:write");
    expect(String(oauth.metadata["oauth_notes"])).toContain("replies:write");
    expect(String(oauth.metadata["oauth_notes"])).toContain(
      "does not exist in the code enum"
    );
    const guide = oauth.documents[0].body;
    expect(guide).toContain("client_credentials");
    expect(guide).toContain("SEPARATE oauth_clients population");
  });
});

describe("Zapier record — corrected inventory only", () => {
  it("inventories exactly the source-verified operations", () => {
    const zapier = getSeedRecord("brr-zapier")!;
    const inventory = zapier.metadata["tool_inventory"] as { name: string }[];
    expect(inventory.map((t) => t.name)).toEqual([
      "analysis_completed",
      "report_generated",
      "recommendation_created",
      "list_businesses",
      "start_analysis",
      "get_business",
      "get_competitors",
      "get_recommendations",
      "generate_review_reply",
      "find_business",
      "find_report",
    ]);
  });

  it("contains NO 'Create business' action and NO 'New analysis' trigger", () => {
    const zapier = getSeedRecord("brr-zapier")!;
    const inventory = zapier.metadata["tool_inventory"] as {
      name: string;
      description: string;
    }[];
    for (const t of inventory) {
      expect(t.name).not.toMatch(/create_business|new_analysis/);
      expect(t.description).not.toContain("Create business");
      expect(t.description).not.toContain("New analysis");
    }
    // The corrections are documented AS corrections in the guide.
    const guide = zapier.documents[0].body;
    expect(guide).toContain("NO 'Create business' action");
    expect(guide).toContain("NO 'New analysis' trigger");
    expect(guide).toContain("does not publish to Google");
    expect(zapier.external_status_note).toContain("Private Zapier app");
  });
});

describe("Webhooks record — signing facts", () => {
  it("pins the signature scheme, events, retries, and receiver labelling", () => {
    const wh = getSeedRecord("brr-webhooks")!;
    const signing = String(wh.metadata["webhook_signing"]);
    expect(signing).toContain("X-BRR-Signature: sha256=<hex>");
    expect(signing).toContain("{timestampSec}.{body}");
    expect(signing).toContain("30/120/600/3600/21600");
    expect(signing).toContain("MAX_ATTEMPTS=5");
    expect(signing).toContain("20 consecutive failures");
    expect(signing).toContain("RECEIVER-side guidance only");
    const hooks = wh.metadata["webhooks"] as { events: string[] }[];
    expect(hooks[0].events).toEqual([
      "analysis.completed",
      "analysis.failed",
      "report.generated",
      "recommendation.created",
      "webhook.test",
    ]);
  });
});

describe("checklists — tracker snapshot and compliance", () => {
  it("seeds the 6 snapshot items FIRST, each state badged owner-reported", () => {
    const snapshot = META_SUBMISSION_ITEMS.slice(0, 6);
    expect(snapshot.every((i) => i.item_key.startsWith("snapshot-"))).toBe(true);
    const museDemo = getDemoHubIntegration("brr-muse-connector")!;
    const entries = listDemoHubChecklistEntries(museDemo.id).filter(
      (e) => e.item.list_key === "meta-submission"
    );
    const byKey = Object.fromEntries(entries.map((e) => [e.item.item_key, e]));
    for (const item of snapshot) {
      const entry = byKey[item.item_key];
      expect(entry.state).not.toBeNull();
      expect(entry.state!.note).toBe(OWNER_REPORTED_BADGE);
      expect(entry.state!.evidence_url).toBeNull();
    }
    expect(byKey["snapshot-business-verification"].state!.state).toBe("done");
    expect(byKey["snapshot-data-processing-questionnaire"].state!.state).toBe("in_progress");
    expect(byKey["snapshot-integration-credentials"].state!.state).toBe("in_progress");
    expect(byKey["snapshot-overall-submission"].state!.state).toBe("in_progress");
    expect(byKey["snapshot-end-to-end-testing"].state!.state).toBe("todo");
    expect(byKey["snapshot-final-approval"].state!.state).toBe("todo");
  });

  it("seeds the 14 manual items; only the reviewer-account item is blocked", () => {
    expect(META_SUBMISSION_ITEMS).toHaveLength(20);
    const museDemo = getDemoHubIntegration("brr-muse-connector")!;
    const entries = listDemoHubChecklistEntries(museDemo.id).filter(
      (e) => e.item.list_key === "meta-submission"
    );
    const manual = entries.filter(
      (e) => !e.item.item_key.startsWith("snapshot-")
    );
    expect(manual).toHaveLength(14);
    for (const e of manual) {
      if (e.item.item_key === "preparing-reviewer-test-account") {
        expect(e.state!.state).toBe("blocked");
        expect(e.state!.note).toContain("api_demo");
      } else {
        expect(e.state).toBeNull(); // todo = no state row
      }
    }
  });

  it("seeds all 18 compliance items, every one unchecked (todo)", () => {
    expect(SECURITY_COMPLIANCE_ITEMS).toHaveLength(18);
    const museDemo = getDemoHubIntegration("brr-muse-connector")!;
    const entries = listDemoHubChecklistEntries(museDemo.id).filter(
      (e) => e.item.list_key === "security-compliance"
    );
    expect(entries).toHaveLength(18);
    for (const e of entries) expect(e.state).toBeNull();
  });

  it("records the two term-derived requirements with the terms link", () => {
    expect(TERM_DERIVED_REQUIREMENTS).toHaveLength(2);
    expect(TERM_DERIVED_REQUIREMENTS[0]).toContain("only as necessary");
    expect(TERM_DERIVED_REQUIREMENTS[1]).toContain("48 hours");
    const notes = muse.documents.find(
      (d) => d.slug === "brr-muse-compliance-notes"
    )!;
    expect(notes.body).toContain("48 hours");
    expect(notes.body).toContain("https://platform.muse.ai/terms");
  });

  it("seeds the test-accounts section EMPTY", () => {
    const museDemo = getDemoHubIntegration("brr-muse-connector")!;
    expect(listDemoHubTestAccounts(museDemo.id)).toEqual([]);
  });
});

describe("documents — privacy record and templates", () => {
  it("privacy record carries the Part 9.2 fields, all owner-to-confirm", () => {
    const policy = muse.documents.find((d) => d.kind === "policy")!;
    for (const field of [
      "Personal data categories",
      "Sensitive data categories",
      "Purposes of processing",
      "Processors / subprocessors",
      "Storage / access countries",
      "Retention period",
      "Revocation handling",
      "Deletion procedure",
      "Security controls",
      "International transfer controls",
      "Government request procedure",
      "Last verification date",
    ]) {
      expect(policy.body).toContain(field);
    }
    expect(policy.body).toContain("Owner to confirm");
    expect(policy.body).not.toMatch(/retained for \d+ (days|months|years)/i);
  });

  it("seeds the 8 Hub-global templates, labelled not-a-connection", () => {
    expect(HUB_SEED_GLOBAL_DOCUMENTS.map((d) => d.slug)).toEqual([
      "template-n8n",
      "template-make",
      "template-pabbly",
      "template-custom-rest-api",
      "template-custom-mcp-server",
      "template-generic-oauth",
      "template-generic-api-key",
      "template-generic-webhooks",
    ]);
    for (const d of HUB_SEED_GLOBAL_DOCUMENTS) {
      expect(d.body).toContain("Template — not a connection");
    }
    const globalDocs = listDemoHubDocuments(null).filter(
      (d) => d.integration_id === null
    );
    expect(globalDocs.map((d) => d.slug).sort()).toEqual(
      HUB_SEED_GLOBAL_DOCUMENTS.map((d) => d.slug).sort()
    );
  });

  it("legal links: the 5 seeded links all fetched reachable on 2026-10-22", () => {
    expect(LEGAL_LINKS.map((l) => l.url)).toEqual([
      "https://platform.muse.ai/",
      "https://platform.muse.ai/docs",
      "https://platform.muse.ai/terms",
      "https://bizreviewradar.com/privacy",
      "https://bizreviewradar.com/terms",
    ]);
    expect(LEGAL_LINK_CHECK.checked_on).toBe("2026-10-22");
    expect(LEGAL_LINK_CHECK.results.every((r) => r.reachable)).toBe(true);
    expect(muse.metadata["compliance_links"]).toEqual(
      LEGAL_LINKS.map((l) => ({ ...l }))
    );
    expect(muse.metadata["legal"]).toEqual({
      privacy_url: "https://bizreviewradar.com/privacy",
      terms_url: "https://bizreviewradar.com/terms",
    });
  });
});

describe("three-way mirror — TS seed == demo fixtures == SQL seed", () => {
  it("demo fixtures carry the same slugs, statuses, scopes and tools", () => {
    const demo = listDemoHubIntegrations();
    expect(demo.map((d) => d.slug)).toEqual(HUB_SEED_RECORDS.map((r) => r.slug));
    for (const r of HUB_SEED_RECORDS) {
      const d = getDemoHubIntegration(r.slug)!;
      expect(d.status).toBe(r.status);
      expect(d.metadata["scopes"]).toEqual(r.metadata["scopes"]);
      expect(d.metadata["scope_profile"]).toBe(r.metadata["scope_profile"]);
    }
    const demoMuse = getDemoHubIntegration("brr-muse-connector")!;
    const tools = demoMuse.metadata["tool_inventory"] as { name: string }[];
    expect(tools.map((t) => t.name)).toEqual(
      MUSE_CONNECTOR_TOOLS.map((t) => t.name)
    );
    const demoDocs = listDemoHubDocuments(demoMuse.id).filter(
      (d) => d.integration_id === demoMuse.id
    );
    expect(demoDocs.map((d) => d.slug).sort()).toEqual(
      muse.documents.map((d) => d.slug).sort()
    );
  });

  it("SQL seed contains every pinned fact", () => {
    for (const r of HUB_SEED_RECORDS) {
      expect(sql).toContain(`'${r.slug}'`);
      expect(sql).toContain(`'${r.status}'`);
      for (const doc of r.documents) expect(sql).toContain(doc.slug);
      for (const e of expectedVaultEntries(r)) expect(sql).toContain(e.label);
      for (const item of r.checklist_items) expect(sql).toContain(item.item_key);
    }
    for (const t of MUSE_CONNECTOR_TOOLS) {
      expect(sql).toContain(t.name);
      expect(sql).toContain(t.description);
    }
    for (const d of HUB_SEED_GLOBAL_DOCUMENTS) expect(sql).toContain(d.slug);
    expect(sql).toContain(MUSE_REDIRECT_URI);
    expect(sql).toContain("recorded_unverified");
    expect(sql).toContain("${BRR_TEST_API_KEY}");
    expect(sql).toContain("api_key_not_activated");
    // The badge text backs all six snapshot states.
    expect(sql.split(OWNER_REPORTED_BADGE).length - 1).toBeGreaterThanOrEqual(6);
    // SQL seed never inserts credentials or test accounts.
    expect(sql).not.toMatch(/INSERT INTO hub_credentials/i);
    expect(sql).not.toMatch(/INSERT INTO hub_test_accounts/i);
  });
});
