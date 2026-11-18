/**
 * Automation-platform REST auth tests (resolveRestContext).
 *
 * Covers, for each of Make / Pabbly / Albato / Activepieces:
 * OAuth happy path (a token bound to that platform's resource
 * resolves with the right workspace), wrong-resource 401
 * (a token for one platform does not verify for another),
 * insufficient scope 403 (read-only token on the write tier),
 * rate limiting (429), and demo refusal (503). OAuth tokens
 * are issued through the real OAuth handlers against the
 * in-memory store — no database, no network.
 *
 * Registration note: the client registers with a loopback
 * redirect and the platform's resource URL as the RFC 8707
 * hint. The resource hint is what lets registrationPlatform()
 * detect the platform (the scope-prefix checks in
 * src/lib/muse-connector/oauth/clients.ts cover only
 * muse/claude/zapier/n8n — a coordinator follow-up is to widen
 * them). The loopback redirect is accepted by the fallback
 * Muse allowlist (isAllowedRedirectUriForPlatform falls through
 * to isAllowedMuseRedirectUri for these platforms).
 */
import { describe, it, expect } from "vitest";
import {
  createMemoryMuseOAuthStore,
  registerMuseClient,
  issueAuthorizationCode,
  handleMuseTokenRequest,
} from "@/lib/muse-connector/oauth";
import { createRateLimiter } from "@/lib/admin/submissions-core";
import { resolveRestContext, REST_RATE_LIMIT_PER_MINUTE } from "@/lib/integrations/rest/auth";
import {
  ACTIVEPIECES_PLATFORM,
  ALBATO_PLATFORM,
  MAKE_PLATFORM,
  PABBLY_PLATFORM,
  getPlatformResourceUrl,
  type RestPlatform,
} from "@/lib/integrations/rest/config";
import type { OAuthScope } from "@/lib/muse-connector/oauth/scopes";

const ORIGIN = "https://nxtsend.com";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-11-18T00:00:00Z");

const PLATFORM_CONFIGS = [
  { id: "make" as const, config: MAKE_PLATFORM },
  { id: "pabbly" as const, config: PABBLY_PLATFORM },
  { id: "albato" as const, config: ALBATO_PLATFORM },
  { id: "activepieces" as const, config: ACTIVEPIECES_PLATFORM },
];

function formRequest(url: string, params: Record<string, string>): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
}

async function platformToken(
  platform: RestPlatform,
  scopes: OAuthScope[] = [`${platform}.read`, `${platform}.write`] as OAuthScope[]
): Promise<{ store: ReturnType<typeof createMemoryMuseOAuthStore>; access: string }> {
  const store = createMemoryMuseOAuthStore();
  const resource = getPlatformResourceUrl(platform, ORIGIN);
  const redirect = "http://localhost:3000/oauth/callback";
  const reg = await registerMuseClient(
    store,
    {
      name: platform,
      redirectUris: [redirect],
      confidential: true,
      scopes: scopes.join(" "),
      resource,
    },
    NOW
  );
  if (!reg.ok) throw new Error(`registration failed for ${platform}: ${reg.detail}`);
  const code = await issueAuthorizationCode(
    store,
    {
      clientId: reg.client.client_id,
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
      scopes,
      codeChallenge: null,
      redirectUri: redirect,
      resource,
    },
    NOW
  );
  const res = await handleMuseTokenRequest(
    formRequest("http://localhost:3000/api/muse/oauth/token", {
      grant_type: "authorization_code",
      client_id: reg.client.client_id,
      client_secret: reg.clientSecret ?? "",
      code,
      redirect_uri: redirect,
      resource,
    }),
    { store, now: NOW }
  );
  if (res.status !== 200) throw new Error(`exchange failed for ${platform}: ${JSON.stringify(res.body)}`);
  return { store, access: (res.body as { access_token: string }).access_token };
}

function apiRequest(platform: RestPlatform, access: string | null): Request {
  const headers: Record<string, string> = {};
  if (access) headers.authorization = `Bearer ${access}`;
  return new Request(`${ORIGIN}/api/integrations/${platform}/v1/leads`, { headers });
}

function freshLimiter(maxAttempts = 1000) {
  return createRateLimiter({ maxAttempts, windowMs: 60_000 });
}

describe("resolveRestContext — automation platform OAuth", () => {
  for (const { id, config } of PLATFORM_CONFIGS) {
    it(`resolves a ${id} token with the read tier`, async () => {
      const { store, access } = await platformToken(id);
      const res = await resolveRestContext(apiRequest(id, access), config, "read", {
        store,
        mode: "supabase",
        now: NOW,
        rateLimiter: freshLimiter(),
      });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.ctx.workspaceId).toBe(WORKSPACE_ID);
        expect(res.ctx.userId).toBe(USER_ID);
        expect(res.ctx.resource).toBe(getPlatformResourceUrl(id, ORIGIN));
        expect(res.ctx.scopes).toContain(`${id}.read`);
      }
    });

    it(`refuses Demo Mode with a 503 for ${id}`, async () => {
      const { store, access } = await platformToken(id);
      const res = await resolveRestContext(apiRequest(id, access), config, "read", {
        store,
        mode: "demo",
        now: NOW,
        rateLimiter: freshLimiter(),
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.status).toBe(503);
        expect(res.error.body.code).toBe("demo_mode");
        expect(res.error.body.error).toContain("Demo Mode");
      }
    });

    it(`answers 403 when a ${id} grant lacks the write tier`, async () => {
      const { store, access } = await platformToken(id, [`${id}.read`] as OAuthScope[]);
      const res = await resolveRestContext(apiRequest(id, access), config, "write", {
        store,
        mode: "supabase",
        now: NOW,
        rateLimiter: freshLimiter(),
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.status).toBe(403);
        expect(res.error.body.code).toBe("insufficient_scope");
      }
    });

    it(`rate-limits a ${id} token after the per-token budget`, async () => {
      const { store, access } = await platformToken(id);
      const limiter = createRateLimiter({ maxAttempts: 2, windowMs: 60_000 });
      const base = { store, mode: "supabase" as const, now: NOW, rateLimiter: limiter };
      expect((await resolveRestContext(apiRequest(id, access), config, "read", base)).ok).toBe(true);
      expect((await resolveRestContext(apiRequest(id, access), config, "read", base)).ok).toBe(true);
      const third = await resolveRestContext(apiRequest(id, access), config, "read", base);
      expect(third.ok).toBe(false);
      if (!third.ok) {
        expect(third.error.status).toBe(429);
        expect(third.error.body.error).toContain(String(REST_RATE_LIMIT_PER_MINUTE));
      }
    });
  }

  it("a token for one platform does not verify for another (wrong-resource 401)", async () => {
    const make = await platformToken("make");
    const pabbly = await platformToken("pabbly");
    // Make token presented to the Pabbly platform.
    const wrong = await resolveRestContext(
      apiRequest("pabbly", make.access),
      PABBLY_PLATFORM,
      "read",
      { store: make.store, mode: "supabase", now: NOW, rateLimiter: freshLimiter() }
    );
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.error.status).toBe(401);
    // And the reverse direction.
    const reverse = await resolveRestContext(
      apiRequest("make", pabbly.access),
      MAKE_PLATFORM,
      "read",
      { store: pabbly.store, mode: "supabase", now: NOW, rateLimiter: freshLimiter() }
    );
    expect(reverse.ok).toBe(false);
    if (!reverse.ok) expect(reverse.error.status).toBe(401);
    // Missing and garbage tokens 401 on every platform.
    for (const { id, config } of PLATFORM_CONFIGS) {
      const base = { store: make.store, mode: "supabase" as const, now: NOW, rateLimiter: freshLimiter() };
      const missing = await resolveRestContext(apiRequest(id, null), config, "read", base);
      expect(missing.ok).toBe(false);
      if (!missing.ok) expect(missing.error.status).toBe(401);
      const garbage = await resolveRestContext(apiRequest(id, "garbage"), config, "read", base);
      expect(garbage.ok).toBe(false);
      if (!garbage.ok) expect(garbage.error.status).toBe(401);
    }
  });
});
