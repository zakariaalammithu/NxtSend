/**
 * Make app manifest / module / scenario tests.
 *
 * Covers: every JSON file under integrations/make/ parses; the
 * manifest, base and connection files have the expected shape;
 * every module (except the universal API call, which has no fixed
 * endpoint by design) names a real v1 endpoint — the operation
 * (method + path) must exist in the real Make v1 route tree; every
 * scenario blueprint parses, its flow modules are from the known
 * set, and every NxtSend URL it calls is a real v1 endpoint; no
 * file contains a secret-like value (the only placeholders are
 * intentional PASTE_ markers). No database, no network.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// src/lib/integrations/providers/automation/__tests__ -> repo root (6 up)
const REPO = join(HERE, "..", "..", "..", "..", "..", "..");
const MAKE_DIR = join(REPO, "integrations", "make");
const V1_DIR = join(REPO, "src", "app", "api", "integrations", "make", "v1");

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function walkJson(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkJson(full, out);
    else if (entry.name.endsWith(".json")) out.push(full);
  }
  return out;
}

/** Route tree of the real Make v1 API: "METHOD /v1/..." entries. */
function realEndpoints(): Set<string> {
  const found = new Set<string>();
  function walk(dir: string, prefix: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), `${prefix}/${entry.name}`);
      } else if (entry.name === "route.ts") {
        // route.ts files contain one handler per HTTP method.
        const src = readFileSync(join(dir, entry.name), "utf8");
        for (const m of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
          if (new RegExp(`export (async )?function ${m}\\b`).test(src)) {
            // Route dirs use [id]; module/piece paths use {id}.
            found.add(`${m} ${normalizePath(prefix)}`);
          }
        }
      }
    }
  }
  walk(V1_DIR, "/v1");
  return found;
}

/** Normalize a module endpoint path: "[id]" -> "{id}", "[leadId]" -> "{leadId}". */
function normalizePath(path: string): string {
  return path.replace(/\[([^\]]+)\]/g, "{$1}");
}

describe("Make app files", () => {
  it("every JSON file under integrations/make/ parses", () => {
    const files = walkJson(MAKE_DIR);
    expect(files.length).toBeGreaterThan(10);
    for (const f of files) {
      expect(() => readJson(f), f).not.toThrow();
    }
  });

  it("manifest, base and connection have the expected shape", () => {
    const app = readJson(join(MAKE_DIR, "app.json")) as Record<string, unknown>;
    expect(app.label).toBe("NxtSend");
    expect(app.status).toContain("NOT submitted");
    const modules = app.modules as Record<string, string[]>;
    expect(Array.isArray(modules.actions)).toBe(true);
    expect(Array.isArray(modules.searches)).toBe(true);
    expect(Array.isArray(modules.triggers)).toBe(true);
    expect(modules.actions.length + modules.searches.length + modules.triggers.length).toBe(18);
    // Plus the universal API-call module in its own category.
    expect((modules as Record<string, string[]>).universal.length).toBe(1);
    expect(Object.values(modules).flat().length).toBe(19);
    const base = readJson(join(MAKE_DIR, "base.json")) as Record<string, unknown>;
    expect(typeof base.baseUrl).toBe("string");
    const conn = readJson(join(MAKE_DIR, "connections", "oauth2.json")) as Record<
      string,
      unknown
    >;
    expect(conn.type).toBe("oauth2");
    expect((conn.scopes as string[]).sort()).toEqual(["make.read", "make.write"]);
    expect((conn.authorizationUrl as string)).toContain("/api/muse/oauth/authorize");
  });

  it("no Make file contains a secret-like value", () => {
    const files = walkJson(MAKE_DIR);
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      // Intentional placeholders only; a real key/token/password
      // must never appear in a shipped template.
      expect(text).not.toMatch(/"(api[_-]?key|token|password|secret)"\s*:\s*"(?!PASTE_)[^"]{8,}"/i);
      expect(text).not.toContain("sk-");
    }
    // And the placeholders that DO exist are clearly marked.
    const scenario = readFileSync(join(MAKE_DIR, "scenarios", "new-lead-to-crm.json"), "utf8");
    expect(scenario).toContain("PASTE_YOUR_CRM_API_KEY");
  });
});

describe("Make modules vs the real v1 route tree", () => {
  it("every module endpoint (except universal-api-call) is a real v1 operation", () => {
    const endpoints = realEndpoints();
    expect(endpoints.size).toBeGreaterThan(20);
    const modulesDir = join(MAKE_DIR, "modules");
    const files = readdirSync(modulesDir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBe(19);
    for (const f of files) {
      const mod = readJson(join(modulesDir, f)) as Record<string, unknown>;
      expect(typeof mod.label).toBe("string");
      expect(typeof mod.type).toBe("string");
      const endpoint = mod.endpoint as { method: string; path: string } | null;
      if (f === "universal-api-call.json") {
        expect(endpoint).toBeNull();
        continue;
      }
      expect(endpoint, f).not.toBeNull();
      // Module paths are relative to the base URL, which ends in
      // /v1 — so "/leads" means the "POST /v1/leads" operation.
      const key = `${endpoint!.method} /v1${normalizePath(endpoint!.path)}`;
      expect(endpoints.has(key), `${f}: ${key} is not a real Make v1 operation`).toBe(true);
    }
  });
});

describe("Make scenario blueprints", () => {
  const KNOWN_MODULES = new Set([
    "http:ActionSendData",
    "builtin:BasicFeeder",
    "google-sheets:addRow",
    "gateway:CustomWebHook",
    "slack:CreateMessage",
  ]);
  const NXTEND_HOSTS = ["api.nxtsend.com", "nxtsend.com"];

  it("every blueprint parses, uses known modules, and calls only real v1 endpoints", () => {
    const endpoints = realEndpoints();
    const scenariosDir = join(MAKE_DIR, "scenarios");
    const files = readdirSync(scenariosDir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBe(2);
    for (const f of files) {
      const bp = readJson(join(scenariosDir, f)) as Record<string, unknown>;
      const flow = bp.flow as Array<Record<string, unknown>>;
      expect(Array.isArray(flow)).toBe(true);
      expect(flow.length).toBeGreaterThan(0);
      for (const step of flow) {
        expect(KNOWN_MODULES.has(step.module as string), `${f}: unknown module ${String(step.module)}`).toBe(true);
        const text = JSON.stringify(step);
        // Any NxtSend URL in the blueprint must be a real v1 endpoint.
        for (const m of Array.from(text.matchAll(/https:\/\/([a-z0-9.-]+)(\/api\/integrations\/make\/v1[^"\\]*)/g))) {
          expect(NXTEND_HOSTS).toContain(m[1]);
          const path = m[2].replace("/api/integrations/make", "");
          // Method is not recorded in the blueprint mapper; accept
          // the path if ANY method exists for it.
          const exists = Array.from(endpoints).some((e) => e.endsWith(` ${path}`));
          expect(exists, `${f}: ${m[2]} is not a real Make v1 endpoint`).toBe(true);
        }
      }
      // No blueprint may point at another platform's API.
      expect(JSON.stringify(bp)).not.toMatch(/\/api\/integrations\/(n8n|zapier|pabbly|albato|activepieces)\//);
    }
  });

  it("scenario files are under the Make 2 MB blueprint import limit", () => {
    const scenariosDir = join(MAKE_DIR, "scenarios");
    for (const f of readdirSync(scenariosDir)) {
      const size = readFileSync(join(scenariosDir, f)).length;
      expect(size).toBeLessThan(2 * 1024 * 1024);
    }
  });
});
