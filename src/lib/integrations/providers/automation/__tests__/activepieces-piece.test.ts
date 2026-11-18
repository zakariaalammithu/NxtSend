/**
 * Activepieces piece tests.
 *
 * Covers: every action/trigger source file parses as TypeScript
 * (checked by the repo's tsc run — here we check the inventory
 * statically); each action's endpoint (method + path, parsed from
 * its source) is a real Activepieces v1 operation, or the universal
 * API call; each webhook trigger subscribes to a real webhook
 * event; the piece index registers exactly 17 actions and 9
 * triggers with OAuth2 auth. No database, no network.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { WEBHOOK_EVENT_TYPES } from "@/lib/integrations/rest/events";

const HERE = dirname(fileURLToPath(import.meta.url));
// src/lib/integrations/providers/automation/__tests__ -> repo root (6 up)
const REPO = join(HERE, "..", "..", "..", "..", "..", "..");
const PIECE_DIR = join(REPO, "integrations", "activepieces");
const V1_DIR = join(REPO, "src", "app", "api", "integrations", "activepieces", "v1");

function realEndpoints(): Set<string> {
  const found = new Set<string>();
  function walk(dir: string, prefix: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), `${prefix}/${entry.name}`);
      } else if (entry.name === "route.ts") {
        const src = readFileSync(join(dir, entry.name), "utf8");
        for (const m of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
          if (new RegExp(`export (async )?function ${m}\\b`).test(src)) {
            // Route dirs use [id]; piece paths use {id}.
            found.add(`${m} ${normalizePath(prefix)}`);
          }
        }
      }
    }
  }
  walk(V1_DIR, "/v1");
  return found;
}

function normalizePath(path: string): string {
  return path.replace(/\[([^\]]+)\]/g, "{$1}");
}

describe("Activepieces piece inventory", () => {
  it("the piece index registers 17 actions, 9 triggers, OAuth2 auth", () => {
    const index = readFileSync(join(PIECE_DIR, "src", "index.ts"), "utf8");
    // The imports are the source of truth for the inventory.
    const actionImports = Array.from(index.matchAll(/from "\.\/lib\/actions\/([a-z-]+)"/g)).map((m) => m[1]);
    const triggerImports = Array.from(index.matchAll(/from "\.\/lib\/triggers\/([a-z-]+)"/g)).map((m) => m[1]);
    expect(actionImports.length).toBe(17);
    expect(triggerImports.length).toBe(9);
    expect(index).toContain("createPiece");
    const auth = readFileSync(join(PIECE_DIR, "src", "auth.ts"), "utf8");
    expect(auth).toContain("PieceAuth.OAuth2");
    expect(auth).toContain("activepieces.read");
    expect(auth).toContain("activepieces.write");
    // No getConnectionIdentifier property in the OAuth2 call (the
    // framework 0.32.0 types have no such property — the file only
    // mentions it in a comment explaining the omission).
    expect(auth).not.toMatch(/getConnectionIdentifier\s*:/);
    expect(auth).not.toMatch(/getConnectionIdentifier\s*\(/);
  });

  it("every action endpoint is a real Activepieces v1 operation", () => {
    const endpoints = realEndpoints();
    expect(endpoints.size).toBeGreaterThan(20);
    const dir = join(PIECE_DIR, "src", "lib", "actions");
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBe(17);
    for (const f of files) {
      const src = readFileSync(join(dir, f), "utf8");
      if (f === "custom-api-call.ts") {
        // Universal call: method/path come from props, not the file.
        expect(src).toContain("props.method");
        expect(src).toContain("props.path");
        continue;
      }
      const m = src.match(/method:\s*HttpMethod\.(\w+)/);
      expect(m, `${f}: no HttpMethod found`).not.toBeNull();
      const method = m![1];
      // Path is a plain string, with a .replace chain for placeholders.
      // Piece paths are relative to the API base, which ends in /v1.
      const pathMatch = src.match(/path:\s*"([^"]+)"/);
      expect(pathMatch, `${f}: no path string found`).not.toBeNull();
      const key = `${method} /v1${normalizePath(pathMatch![1])}`;
      expect(endpoints.has(key), `${f}: ${key} is not a real Activepieces v1 operation`).toBe(true);
    }
  });

  it("every webhook trigger subscribes to a real webhook event", () => {
    const dir = join(PIECE_DIR, "src", "lib", "triggers");
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBe(9);
    for (const f of files) {
      const src = readFileSync(join(dir, f), "utf8");
      if (f === "new-lead-polling.ts") {
        expect(src).toContain("TriggerStrategy.POLLING");
        expect(src).toContain("/v1/leads");
        continue;
      }
      expect(src).toContain("TriggerStrategy.WEBHOOK");
      const eventMatch = src.match(/event:\s*"([^"]+)"/);
      expect(eventMatch, `${f}: no event found`).not.toBeNull();
      expect(
        (WEBHOOK_EVENT_TYPES as readonly string[]).includes(eventMatch![1]),
        `${f}: ${eventMatch![1]} is not a real webhook event`
      ).toBe(true);
      // Every trigger must carry sampleData (required by the framework).
      expect(src).toContain("sampleData");
    }
  });

  it("no piece file contains a secret-like value", () => {
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, e.name);
        if (e.isDirectory()) out.push(...walk(full));
        else if (e.name.endsWith(".ts")) out.push(full);
      }
      return out;
    };
    for (const f of walk(join(PIECE_DIR, "src"))) {
      const text = readFileSync(f, "utf8");
      expect(text).not.toMatch(/(api[_-]?key|client[_-]?secret|password)\s*[:=]\s*"[^"]{8,}"/i);
      expect(text).not.toContain("sk-");
    }
  });
});
