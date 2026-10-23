import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * GET /auth/callback (P10 Stage C) — the Supabase OAuth landing.
 *
 * The Supabase server client is fixture-mocked below; no network is
 * touched. The contract under test:
 *   ?error=access_denied        → /login?error=oauth_cancelled
 *   ?error=<anything else>      → /login?error=oauth_failed, and the
 *                                 raw provider text NEVER appears in
 *                                 the redirect
 *   no code / no error          → /login?error=oauth_failed
 *   Demo Mode (null client)     → /login?error=oauth_failed (never a
 *                                 bounce into the dashboard)
 *   exchange failure            → /login?error=oauth_failed
 *   suspended profile           → signed out + account_suspended
 *   happy path                  → default workspace ensured, lands on
 *                                 the SANITISED ?redirect= target
 */

interface FakeState {
  exchangeError: boolean;
  user: { id: string; user_metadata?: Record<string, unknown> } | null;
  profileStatus: string | null;
  signOutCalls: number;
  workspaceInserts: Array<Record<string, unknown>>;
}

const fake = vi.hoisted(() => ({
  state: null as FakeState | null,
  clientIsNull: false,
}));

function buildFakeClient(state: FakeState) {
  return {
    auth: {
      exchangeCodeForSession: async () =>
        state.exchangeError
          ? { data: { user: null, session: null }, error: { message: "bad code" } }
          : { data: { user: state.user, session: { access_token: "x" } }, error: null },
      getUser: async () => ({ data: { user: state.user } }),
      signOut: async () => {
        state.signOutCalls += 1;
        return { error: null };
      },
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () =>
            table === "profiles"
              ? {
                  data:
                    state.profileStatus === null
                      ? null
                      : { status: state.profileStatus },
                  error: null,
                }
              : { data: null, error: null },
          limit: async () => ({ data: [], error: null }),
        }),
      }),
      insert: async (row: Record<string, unknown>) => {
        if (table === "workspaces") state.workspaceInserts.push(row);
        return { error: null };
      },
    }),
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () =>
    fake.clientIsNull || !fake.state ? null : buildFakeClient(fake.state),
}));

import { GET } from "../route";

const ORIGIN = "http://localhost:3000";

function request(query: string): NextRequest {
  return new NextRequest(`${ORIGIN}/auth/callback${query}`);
}

function locationOf(res: Response): string {
  return res.headers.get("location") ?? "";
}

beforeEach(() => {
  fake.clientIsNull = false;
  fake.state = {
    exchangeError: false,
    user: { id: "user-1", user_metadata: { full_name: "Pat Example" } },
    profileStatus: "active",
    signOutCalls: 0,
    workspaceInserts: [],
  };
});

describe("GET /auth/callback", () => {
  it("maps provider access_denied to oauth_cancelled on /login", async () => {
    const res = await GET(request("?error=access_denied&error_description=nope"));
    expect(res.status).toBe(307);
    expect(locationOf(res)).toBe(`${ORIGIN}/login?error=oauth_cancelled`);
  });

  it("maps other provider errors to oauth_failed and never reflects raw text", async () => {
    const raw = "provider_says_user_banned_xyz";
    const res = await GET(request(`?error=${raw}`));
    expect(locationOf(res)).toBe(`${ORIGIN}/login?error=oauth_failed`);
    expect(locationOf(res)).not.toContain(raw);
  });

  it("with neither code nor error, redirects to oauth_failed", async () => {
    const res = await GET(request(""));
    expect(locationOf(res)).toBe(`${ORIGIN}/login?error=oauth_failed`);
  });

  it("in Demo Mode (null server client) a code still lands on oauth_failed", async () => {
    fake.clientIsNull = true;
    const res = await GET(request("?code=abc"));
    expect(locationOf(res)).toBe(`${ORIGIN}/login?error=oauth_failed`);
  });

  it("exchange failure redirects to oauth_failed", async () => {
    fake.state!.exchangeError = true;
    const res = await GET(request("?code=bad-code"));
    expect(locationOf(res)).toBe(`${ORIGIN}/login?error=oauth_failed`);
  });

  it("a suspended profile is signed straight back out with account_suspended", async () => {
    fake.state!.profileStatus = "suspended";
    const res = await GET(request("?code=good-code"));
    expect(locationOf(res)).toBe(`${ORIGIN}/login?error=account_suspended`);
    expect(fake.state!.signOutCalls).toBe(1);
    expect(fake.state!.workspaceInserts).toEqual([]);
  });

  it("happy path: ensures the default workspace and lands on the target", async () => {
    const res = await GET(request("?code=good-code&redirect=/dashboard/billing"));
    expect(locationOf(res)).toBe(`${ORIGIN}/dashboard/billing`);
    expect(fake.state!.workspaceInserts).toHaveLength(1);
    expect(fake.state!.workspaceInserts[0].owner_id).toBe("user-1");
  });

  it("happy path without a target lands on /dashboard", async () => {
    const res = await GET(request("?code=good-code"));
    expect(locationOf(res)).toBe(`${ORIGIN}/dashboard`);
  });

  it("a malicious redirect target collapses to /dashboard", async () => {
    const res = await GET(
      request("?code=good-code&redirect=" + encodeURIComponent("//evil.example.com"))
    );
    expect(locationOf(res)).toBe(`${ORIGIN}/dashboard`);
    expect(locationOf(res)).not.toContain("evil.example.com");
  });
});
