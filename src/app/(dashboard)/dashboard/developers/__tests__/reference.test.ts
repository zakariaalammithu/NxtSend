/**
 * Pins the Developers docs data (../reference.ts) to the implementation.
 *
 * The docs page must never document an endpoint, scope or credential
 * that does not exist in code — so this test reads the route files,
 * the OAuth scope list and .env.example from disk and checks every
 * claim the reference data makes:
 *
 *  - every documented endpoint has a route file under each platform
 *    it claims, exporting that HTTP method;
 *  - n8n-family endpoints are not callable under Zapier (no route
 *    file, or the file exports no such method — e.g. Zapier's
 *    leads/[id] exists but exports only GET + PATCH, no DELETE);
 *  - every scope named in the docs data is a real OAuth scope, and
 *    no automation platform has a .send tier;
 *  - every env var the credential checklist derives from the
 *    registry exists in .env.example;
 *  - no endpoint promises LinkedIn sending or accepting (a LinkedIn
 *    mention in an endpoint must be a refusal — "refused" /
 *    "unavailable" — never a capability).
 *
 * Plus a renderToString smoke test for the three Developers pages.
 */

import * as React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  REST_PLATFORMS,
  REST_ENDPOINTS,
  REST_HEALTH_ENDPOINTS,
  type RestPlatformId,
} from "../reference";
import { ALL_OAUTH_SCOPES } from "@/lib/muse-connector/oauth/scopes";
import { INTEGRATION_REGISTRY } from "@/lib/integrations-center/registry";
import DevelopersPage from "../page";
import ApiKeysPage from "../api-keys/page";
import WebhooksPage from "../webhooks/page";

/* The app is compiled by Next with the automatic JSX runtime, so page
   modules do not import React. Vitest/esbuild transforms JSX to the
   classic runtime — expose React globally so those modules render. */
(globalThis as { React?: typeof React }).React = React;

const repoRoot = fileURLToPath(new URL("../../../../../../", import.meta.url));

const ALL_PLATFORMS: RestPlatformId[] = ["zapier", "n8n", "make", "pabbly", "albato", "activepieces"];
const N8N_FAMILY: RestPlatformId[] = ["n8n", "make", "pabbly", "albato", "activepieces"];

/** "/campaigns/{id}/follow-ups/{followUpId}" → "campaigns/[id]/follow-ups/[followUpId]" */
function endpointToRouteDir(endpointPath: string): string {
  return endpointPath
    .replace(/\{id\}/g, "[id]")
    .replace(/\{action\}/g, "[action]")
    .replace(/\{leadId\}/g, "[leadId]")
    .replace(/\{followUpId\}/g, "[followUpId]")
    .replace(/^\//, "");
}

function routeFile(platform: RestPlatformId, endpointPath: string): string {
  return path.join(
    repoRoot,
    "src/app/api/integrations",
    platform,
    "v1",
    endpointToRouteDir(endpointPath),
    "route.ts"
  );
}

function routeExportsMethod(file: string, method: string): boolean {
  if (!existsSync(file)) return false;
  const text = readFileSync(file, "utf8");
  return new RegExp(`export\\s+(async\\s+)?function\\s+${method}\\b`).test(text);
}

describe("reference endpoints exist in the route files", () => {
  it("documents only real endpoints, with the right method, per platform", () => {
    expect(REST_ENDPOINTS.length).toBeGreaterThan(0);
    const missing: string[] = [];
    for (const e of REST_ENDPOINTS) {
      const platforms = e.platforms === "all" ? ALL_PLATFORMS : N8N_FAMILY;
      for (const p of platforms) {
        const file = routeFile(p, e.path);
        if (!existsSync(file)) {
          missing.push(`${e.method} ${e.path} — no route file under ${p}`);
        } else if (!routeExportsMethod(file, e.method)) {
          missing.push(`${e.method} ${e.path} — ${p} route file exports no ${e.method}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("n8n-family endpoints are not callable under Zapier", () => {
    const callable: string[] = [];
    for (const e of REST_ENDPOINTS.filter((x) => x.platforms === "n8n-family")) {
      const file = routeFile("zapier", e.path);
      if (existsSync(file) && routeExportsMethod(file, e.method)) {
        callable.push(`${e.method} ${e.path}`);
      }
    }
    expect(callable).toEqual([]);
  });

  it("health endpoints exist per platform and export GET", () => {
    const missing: string[] = [];
    for (const h of REST_HEALTH_ENDPOINTS) {
      const file = path.join(
        repoRoot,
        "src/app/api/integrations",
        h.platform,
        "health",
        "route.ts"
      );
      if (!routeExportsMethod(file, "GET")) missing.push(h.path);
    }
    expect(missing).toEqual([]);
    expect(REST_HEALTH_ENDPOINTS.map((h) => h.platform).sort()).toEqual(
      [...ALL_PLATFORMS].sort()
    );
  });

  it("the platform list matches the route directories", () => {
    for (const p of REST_PLATFORMS) {
      expect(
        existsSync(path.join(repoRoot, "src/app/api/integrations", p.id, "v1")),
        `no v1 routes for ${p.id}`
      ).toBe(true);
    }
  });
});

describe("reference scopes are real", () => {
  it("every scope named in the docs data is in ALL_OAUTH_SCOPES", () => {
    const referenceText = readFileSync(
      path.join(repoRoot, "src/app/(dashboard)/dashboard/developers/reference.ts"),
      "utf8"
    );
    const named = new Set(
      Array.from(referenceText.matchAll(/\b[a-z]+\.(?:read|write|send)\b/g)).map((m) => m[0])
    );
    expect(named.size).toBeGreaterThan(0);
    const unknown = Array.from(named).filter((s) => !(ALL_OAUTH_SCOPES as readonly string[]).includes(s));
    expect(unknown).toEqual([]);
  });

  it("no automation platform has a .send tier", () => {
    const sendScopes = (ALL_OAUTH_SCOPES as readonly string[]).filter((s) =>
      /^(zapier|n8n|make|pabbly|albato|activepieces)\.send$/.test(s)
    );
    expect(sendScopes).toEqual([]);
    for (const p of REST_PLATFORMS) {
      expect(p.scopePrefix).not.toMatch(/\.send$/);
    }
  });
});

describe("credential checklist env vars exist in .env.example", () => {
  it("every env var derived from the registry is shipped in .env.example", () => {
    const envExample = readFileSync(path.join(repoRoot, ".env.example"), "utf8");
    const shipped = new Set(
      envExample
        .split(/\r?\n/)
        .map((line) => line.match(/^([A-Z0-9_]+)=/)?.[1])
        .filter((n): n is string => Boolean(n))
    );
    const checklistCategories = [
      "CRM",
      "Email Outreach",
      "Lead Enrichment",
      "Email Verification",
      "Communication",
      "Productivity",
    ];
    const checklistAutomation = ["make", "pabbly", "albato", "activepieces"];
    const missing: string[] = [];
    for (const entry of INTEGRATION_REGISTRY) {
      if (
        !checklistCategories.includes(entry.category) &&
        !checklistAutomation.includes(entry.id)
      ) {
        continue;
      }
      for (const v of entry.envVars) {
        if (!shipped.has(v.name)) missing.push(`${entry.id}: ${v.name}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe("no LinkedIn send/accept is documented", () => {
  it("no endpoint path sends or accepts", () => {
    const bad = REST_ENDPOINTS.filter((e) => /send|accept/i.test(e.path));
    expect(bad).toEqual([]);
  });

  it("no endpoint promises a LinkedIn send, accept or invite", () => {
    // A neutral mention is fine (linkedin_url is a lead field, "type
    // (linkedin | email | mixed)" is a campaign-type enum, "connected
    // accounts (LinkedIn / email)" lists account kinds). What must never
    // appear is a sentence claiming the API sends, accepts or invites
    // on LinkedIn — unless the same sentence refuses it.
    const bad: string[] = [];
    for (const e of REST_ENDPOINTS) {
      const text = `${e.description} ${e.response}`;
      for (const sentence of text.split(/(?<=[.!?])\s+/)) {
        if (!/linkedin/i.test(sentence)) continue;
        if (/\b(send|sends|sending|accept|accepts|accepting|invite|invites|inviting)\b/i.test(sentence)) {
          if (!/refused|unavailable|never|not supported|no authorized/i.test(sentence)) {
            bad.push(`${e.method} ${e.path}: ${sentence}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("the docs state plainly that LinkedIn send is not supported", () => {
    // The plain statement lives on the docs page (its MCP section and
    // "What is not available" section); the reference data carries the
    // matching honest facts (accepted is always null; LinkedIn replies
    // are refused 422).
    const pageText = readFileSync(
      path.join(repoRoot, "src/app/(dashboard)/dashboard/developers/page.tsx"),
      "utf8"
    );
    expect(pageText).toMatch(/LinkedIn-send tools are not supported/);
    expect(pageText).toMatch(/No LinkedIn send or accept anywhere/);
    const referenceText = readFileSync(
      path.join(repoRoot, "src/app/(dashboard)/dashboard/developers/reference.ts"),
      "utf8"
    );
    expect(referenceText).toMatch(/accepted is always null/);
    expect(referenceText).toMatch(/linkedin_unavailable/);
  });
});

describe("developers pages render", () => {
  it("API docs page renders its sections", () => {
    const html = renderToString(React.createElement(DevelopersPage));
    for (const heading of [
      "Developers",
      "Authentication",
      "REST API reference",
      "Request &amp; response examples",
      "Error codes",
      "Rate limits",
      "Webhooks",
      "MCP servers",
      "Credential checklist",
      "What is not available",
    ]) {
      expect(html).toContain(heading);
    }
    expect(html).toContain("/api/integrations/n8n/v1/leads");
  });

  it("API keys page renders the n8n-only scope form", () => {
    const html = renderToString(React.createElement(ApiKeysPage));
    expect(html).toContain("API keys");
    expect(html).toContain("n8n.read");
    expect(html).toContain("n8n.write");
    expect(html).toContain("exactly once");
  });

  it("webhook page renders the platform list and the 8 events", () => {
    const html = renderToString(React.createElement(WebhooksPage));
    expect(html).toContain("Webhook subscriptions");
    expect(html).toContain("lead.created");
    expect(html).toContain("campaign.status_changed");
    expect(html).toContain("daily 06:00 cron");
  });
});
