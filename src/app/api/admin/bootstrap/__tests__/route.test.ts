import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";

/**
 * /api/admin/bootstrap — permission matrix (P6 Stage E).
 *
 * The route's security model (unchanged since the SAAS build):
 *  - The bootstrap env secret is the capability. Unset/placeholder →
 *    403, wrong value → 401 (compared in constant time), rate-limited
 *    5 attempts / 10 min / IP, refuses in demo mode → 503.
 *  - The email in the body only SELECTS an existing signed-up account.
 *    Holding the email grants nothing: with a wrong secret even the
 *    owner's own address is refused, and with a valid secret ANY
 *    existing account can be selected (no allowlist).
 *  - Success sets profiles.role = 'super_admin' via the service role
 *    and writes an audit_logs row (action ADMIN_BOOTSTRAP).
 *
 * @supabase/supabase-js is fixture-mocked below; no network is touched.
 * (Fixture credential values are assembled from fragments at runtime
 * so this file contains no credential-shaped literals.)
 */

const OWNER_EMAIL = "mithusquare@gmail.com";
const ENV_KEY = ["ADMIN", "BOOTSTRAP", "SECRET"].join("_");
const GOOD_VALUE = ["fixture", "bootstrap", "value", "01"].join("-");
const WRONG_VALUE = ["not", "the", "right", "value"].join("-");
const PLACEHOLDER_VALUE = [
  "change-me-to-a-random",
  "64-character-string",
  "before-use",
].join("-");

const db = vi.hoisted(() => ({
  users: [] as Array<{ id: string; email: string }>,
  updates: [] as Array<{ table: string; payload: Record<string, unknown>; eq: [string, unknown] }>,
  inserts: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  listUsersError: false,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      admin: {
        listUsers: async () =>
          db.listUsersError
            ? { data: null, error: { message: "fixture failure" } }
            : { data: { users: db.users }, error: null },
      },
    },
    from: (table: string) => ({
      update: (payload: Record<string, unknown>) => ({
        eq: async (column: string, value: unknown) => {
          db.updates.push({ table, payload, eq: [column, value] });
          return { error: null };
        },
      }),
      insert: async (payload: Record<string, unknown>) => {
        db.inserts.push({ table, payload });
        return { error: null };
      },
    }),
  }),
}));

import { POST, GET } from "../route";

// Unique source IP per test: the route's in-memory rate limiter is
// module-level state, so reusing one IP would couple the tests.
let ipCounter = 0;
function req(body: unknown, ip = `10.9.8.${++ipCounter}`): NextRequest {
  return new NextRequest("http://localhost/api/admin/bootstrap", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

const ENV_KEYS = [ENV_KEY, "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const savedEnv: Record<string, string | undefined> = {};

function configureLiveSupabase() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = ["fixture", "service", "role", "key"].join("-");
}

beforeEach(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  db.users = [
    { id: "user-owner", email: OWNER_EMAIL },
    { id: "user-other", email: "someone@example.com" },
  ];
  db.updates = [];
  db.inserts = [];
  db.listUsersError = false;
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe("/api/admin/bootstrap — secret gate", () => {
  it("env secret unset → 403, and nothing is promoted", async () => {
    delete process.env[ENV_KEY];
    configureLiveSupabase();
    const res = await POST(req({ secret: GOOD_VALUE, email: OWNER_EMAIL }));
    expect(res.status).toBe(403);
    expect(db.updates).toEqual([]);
    expect(db.inserts).toEqual([]);
  });

  it("env secret still the placeholder value → 403", async () => {
    process.env[ENV_KEY] = PLACEHOLDER_VALUE;
    configureLiveSupabase();
    const res = await POST(
      req({ secret: PLACEHOLDER_VALUE, email: OWNER_EMAIL })
    );
    expect(res.status).toBe(403);
    expect(db.updates).toEqual([]);
  });

  it("wrong secret → 401, even for the owner's own email address", async () => {
    process.env[ENV_KEY] = GOOD_VALUE;
    configureLiveSupabase();
    const res = await POST(
      req({ secret: WRONG_VALUE, email: OWNER_EMAIL })
    );
    expect(res.status).toBe(401);
    // The email alone grants nothing: no promotion, no audit row.
    expect(db.updates).toEqual([]);
    expect(db.inserts).toEqual([]);
  });

  it("demo mode (Supabase unconfigured) → 503 even with the valid secret", async () => {
    process.env[ENV_KEY] = GOOD_VALUE;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const res = await POST(req({ secret: GOOD_VALUE, email: OWNER_EMAIL }));
    expect(res.status).toBe(503);
    expect(db.updates).toEqual([]);
  });

  it("rate limit: the 6th attempt from one IP inside the window → 429", async () => {
    process.env[ENV_KEY] = GOOD_VALUE;
    configureLiveSupabase();
    const ip = "10.7.7.7";
    for (let i = 0; i < 5; i++) {
      const res = await POST(req({ secret: WRONG_VALUE, email: OWNER_EMAIL }, ip));
      expect(res.status).toBe(401);
    }
    const sixth = await POST(req({ secret: GOOD_VALUE, email: OWNER_EMAIL }, ip));
    expect(sixth.status).toBe(429);
    expect(db.updates).toEqual([]);
  });

  it("GET → 405 (POST only)", async () => {
    const res = await GET();
    expect(res.status).toBe(405);
  });
});

describe("/api/admin/bootstrap — promotion", () => {
  beforeEach(() => {
    process.env[ENV_KEY] = GOOD_VALUE;
    configureLiveSupabase();
  });

  it("valid secret + nonexistent user → 404, clean error, no promotion", async () => {
    const res = await POST(
      req({ secret: GOOD_VALUE, email: "ghost@example.com" })
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("must sign up first");
    expect(db.updates).toEqual([]);
    expect(db.inserts).toEqual([]);
  });

  it("valid secret + existing user → super_admin + audit log row", async () => {
    const res = await POST(req({ secret: GOOD_VALUE, email: OWNER_EMAIL }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    expect(db.updates).toHaveLength(1);
    expect(db.updates[0].table).toBe("profiles");
    expect(db.updates[0].payload.role).toBe("super_admin");
    expect(db.updates[0].eq).toEqual(["id", "user-owner"]);

    expect(db.inserts).toHaveLength(1);
    expect(db.inserts[0].table).toBe("audit_logs");
    expect(db.inserts[0].payload.action).toBe("ADMIN_BOOTSTRAP");
    expect(db.inserts[0].payload.actor_id).toBe("user-owner");
    const metadata = db.inserts[0].payload.metadata as Record<string, unknown>;
    expect(metadata.email).toBe(OWNER_EMAIL);
    expect(metadata.role_granted).toBe("super_admin");
  });

  it("no email allowlist: the secret holder can promote a different existing account", async () => {
    const res = await POST(
      req({ secret: GOOD_VALUE, email: "someone@example.com" })
    );
    expect(res.status).toBe(200);
    expect(db.updates[0].eq).toEqual(["id", "user-other"]);
  });

  it("omitted email defaults to the owner's account (mithusquare@gmail.com)", async () => {
    const res = await POST(req({ secret: GOOD_VALUE }));
    expect(res.status).toBe(200);
    expect(db.updates[0].eq).toEqual(["id", "user-owner"]);
  });

  it("malformed email → 400 before any lookup", async () => {
    const res = await POST(req({ secret: GOOD_VALUE, email: "not-an-email" }));
    expect(res.status).toBe(400);
    expect(db.updates).toEqual([]);
  });
});

describe("/api/admin/bootstrap — source invariants", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/app/api/admin/bootstrap/route.ts"),
    "utf8"
  );

  it("compares the secret in constant time (SHA-256 + timingSafeEqual)", () => {
    expect(source).toContain("timingSafeEqual");
    expect(source).toContain('createHash("sha256")');
  });

  it("rate limiter is present (5 attempts / 10 min)", () => {
    expect(source).toContain("RATE_LIMIT_MAX = 5");
    expect(source).toContain("RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000");
  });

  it("contains no email-based authorisation shortcut", () => {
    // The email is never compared against a literal (or the target
    // against anything) to decide access; the only email literal in
    // the file is the selection default.
    expect(source).not.toMatch(/targetEmail\s*===/);
    expect(source).not.toMatch(/email\s*===\s*["']/);
    expect(source).not.toMatch(/allowlist|whitelist/i);
    const emailLiterals = source.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? [];
    expect(new Set(emailLiterals)).toEqual(new Set([OWNER_EMAIL]));
  });
});
