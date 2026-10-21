import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextResponse } from "next/server";

/**
 * requireAdminApi — the /api/admin/* gate (P6 Stage E permission tests).
 *
 * The caller's role is read from their `profiles` row through their own
 * RLS session — never from request data or user-editable auth metadata.
 * Matrix: demo mode → 503 · anonymous → 401 · profile missing → 403 ·
 * non-admin role → 403 · suspended admin → 403 · active admin /
 * super_admin → caller passes.
 *
 * The Supabase server client is fixture-mocked; no network is touched.
 */

const mockCreateServerClient = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: mockCreateServerClient,
}));

import { requireAdminApi } from "../server-auth";

interface ProfileFixture {
  id: string;
  email: string;
  role: string;
  status: string;
}

function fakeClient(opts: {
  user?: { id: string; email: string } | null;
  authError?: boolean;
  profile?: ProfileFixture | null;
  profileError?: boolean;
}) {
  return {
    auth: {
      getUser: async () =>
        opts.authError
          ? { data: { user: null }, error: { message: "fixture auth error" } }
          : { data: { user: opts.user ?? null }, error: null },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () =>
            opts.profileError || !opts.profile
              ? { data: null, error: { message: "fixture: no profile" } }
              : { data: opts.profile, error: null },
        }),
      }),
    }),
  };
}

const USER = { id: "user-1", email: "person@example.com" };

function profile(partial: Partial<ProfileFixture>): ProfileFixture {
  return {
    id: USER.id,
    email: USER.email,
    role: "user",
    status: "active",
    ...partial,
  };
}

async function statusOf(result: Awaited<ReturnType<typeof requireAdminApi>>) {
  return "response" in result
    ? (result.response as NextResponse).status
    : 200;
}

beforeEach(() => {
  mockCreateServerClient.mockReset();
});

describe("requireAdminApi", () => {
  it("demo mode (no Supabase client) → 503", async () => {
    mockCreateServerClient.mockResolvedValue(null);
    const result = await requireAdminApi();
    expect(await statusOf(result)).toBe(503);
  });

  it("anonymous (no session user) → 401", async () => {
    mockCreateServerClient.mockResolvedValue(fakeClient({ user: null }));
    const result = await requireAdminApi();
    expect(await statusOf(result)).toBe(401);
  });

  it("auth error → 401", async () => {
    mockCreateServerClient.mockResolvedValue(fakeClient({ authError: true }));
    const result = await requireAdminApi();
    expect(await statusOf(result)).toBe(401);
  });

  it("authenticated but profile missing → 403", async () => {
    mockCreateServerClient.mockResolvedValue(
      fakeClient({ user: USER, profile: null, profileError: true })
    );
    const result = await requireAdminApi();
    expect(await statusOf(result)).toBe(403);
  });

  it("non-admin user → 403", async () => {
    mockCreateServerClient.mockResolvedValue(
      fakeClient({ user: USER, profile: profile({ role: "user" }) })
    );
    const result = await requireAdminApi();
    expect(await statusOf(result)).toBe(403);
  });

  it("suspended admin → 403", async () => {
    mockCreateServerClient.mockResolvedValue(
      fakeClient({
        user: USER,
        profile: profile({ role: "admin", status: "suspended" }),
      })
    );
    const result = await requireAdminApi();
    expect(await statusOf(result)).toBe(403);
    if ("response" in result) {
      const body = await (result.response as NextResponse).json();
      expect(body.error).toContain("suspended");
    }
  });

  it("suspended super_admin → 403", async () => {
    mockCreateServerClient.mockResolvedValue(
      fakeClient({
        user: USER,
        profile: profile({ role: "super_admin", status: "suspended" }),
      })
    );
    const result = await requireAdminApi();
    expect(await statusOf(result)).toBe(403);
  });

  it("active admin → caller passes with role + identity", async () => {
    mockCreateServerClient.mockResolvedValue(
      fakeClient({ user: USER, profile: profile({ role: "admin" }) })
    );
    const result = await requireAdminApi();
    expect("caller" in result).toBe(true);
    if ("caller" in result) {
      expect(result.caller.id).toBe(USER.id);
      expect(result.caller.email).toBe(USER.email);
      expect(result.caller.role).toBe("admin");
      expect(result.caller.status).toBe("active");
    }
  });

  it("active super_admin → caller passes", async () => {
    mockCreateServerClient.mockResolvedValue(
      fakeClient({ user: USER, profile: profile({ role: "super_admin" }) })
    );
    const result = await requireAdminApi();
    expect("caller" in result).toBe(true);
    if ("caller" in result) {
      expect(result.caller.role).toBe("super_admin");
    }
  });
});
