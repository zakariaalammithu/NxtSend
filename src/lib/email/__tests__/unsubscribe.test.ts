import { describe, it, expect, beforeEach } from "vitest";
import {
  appendUnsubscribeFooter,
  buildUnsubscribeHeaders,
  buildUnsubscribeUrl,
  createUnsubscribeToken,
  getUnsubscribeSigningStatus,
  maskEmail,
  verifyUnsubscribeToken,
  type UnsubscribeEnv,
} from "../unsubscribe";
import {
  createDemoSuppressionStore,
  suppressionSourceLabel,
  type SuppressionStore,
} from "../suppression-store";
import {
  performUnsubscribe,
  UNSUBSCRIBED_REASON,
  type UnsubscribeServiceDeps,
} from "../unsubscribe-service";
import { setDemoStorage, createMemoryStorage } from "@/lib/data/demo-store";

/**
 * Unsubscribe system (P5 Stage C): stateless HMAC tokens, header
 * construction, footer append, the one-click service, and the
 * suppression store. All env is injected — process.env is never read
 * here, so these tests are deterministic in any environment.
 */

const SECRET_ENV: UnsubscribeEnv = {
  NODE_ENV: "test",
  NEXT_PUBLIC_APP_URL: "https://app.nxtsend.example",
  UNSUBSCRIBE_SECRET: "unit-test-unsubscribe-secret-0123456789abcdef",
};

describe("unsubscribe tokens", () => {
  it("round-trips workspace + normalized email", () => {
    const token = createUnsubscribeToken(
      { workspaceId: "ws_1", email: "  Person@Example.COM " },
      SECRET_ENV
    );
    expect(token).toBeTruthy();
    expect(verifyUnsubscribeToken(token as string, SECRET_ENV)).toEqual({
      workspaceId: "ws_1",
      email: "person@example.com",
    });
  });

  it("rejects a tampered payload and a tampered signature", () => {
    const token = createUnsubscribeToken(
      { workspaceId: "ws_1", email: "a@example.com" },
      SECRET_ENV
    ) as string;
    const [payload, signature] = token.split(".");
    // Point the same signature at a different workspace.
    const forgedPayload = Buffer.from(
      JSON.stringify({ v: 1, w: "ws_other", e: "a@example.com" })
    ).toString("base64url");
    expect(
      verifyUnsubscribeToken(`${forgedPayload}.${signature}`, SECRET_ENV)
    ).toBeNull();
    expect(
      verifyUnsubscribeToken(`${payload}.${signature.slice(0, -2)}xx`, SECRET_ENV)
    ).toBeNull();
    expect(verifyUnsubscribeToken("not-a-token", SECRET_ENV)).toBeNull();
    expect(verifyUnsubscribeToken("", SECRET_ENV)).toBeNull();
    expect(verifyUnsubscribeToken("a.b.c", SECRET_ENV)).toBeNull();
  });

  it("a token carries exactly its own workspace — never another", () => {
    const token = createUnsubscribeToken(
      { workspaceId: "ws_a", email: "a@example.com" },
      SECRET_ENV
    ) as string;
    const claims = verifyUnsubscribeToken(token, SECRET_ENV);
    expect(claims?.workspaceId).toBe("ws_a");
    expect(claims?.workspaceId).not.toBe("ws_b");
  });

  it("rejects tokens verified with the wrong secret", () => {
    const token = createUnsubscribeToken(
      { workspaceId: "ws_1", email: "a@example.com" },
      SECRET_ENV
    ) as string;
    expect(
      verifyUnsubscribeToken(token, {
        ...SECRET_ENV,
        UNSUBSCRIBE_SECRET: "a-different-secret",
      })
    ).toBeNull();
  });

  it("signing status: explicit secret wins, then derived, then demo, else unconfigured", () => {
    expect(getUnsubscribeSigningStatus(SECRET_ENV, "supabase")).toBe("configured");
    expect(
      getUnsubscribeSigningStatus(
        { SUPABASE_SERVICE_ROLE_KEY: "service-role-key" },
        "supabase"
      )
    ).toBe("derived");
    expect(getUnsubscribeSigningStatus({}, "demo")).toBe("demo");
    expect(getUnsubscribeSigningStatus({}, "supabase")).toBe("unconfigured");
  });

  it("derived keys work — and rotating the service-role key invalidates old links", () => {
    const envA: UnsubscribeEnv = {
      NEXT_PUBLIC_APP_URL: "https://app.nxtsend.example",
      SUPABASE_SERVICE_ROLE_KEY: "srk-A",
    };
    const token = createUnsubscribeToken(
      { workspaceId: "ws_1", email: "a@example.com" },
      envA
    );
    expect(verifyUnsubscribeToken(token as string, envA)?.email).toBe(
      "a@example.com"
    );
    expect(
      verifyUnsubscribeToken(token as string, {
        ...envA,
        SUPABASE_SERVICE_ROLE_KEY: "srk-B",
      })
    ).toBeNull();
  });

  it("demo mode mints verifiable tokens with no secrets at all — live mode cannot verify them", () => {
    const env: UnsubscribeEnv = { NEXT_PUBLIC_APP_URL: "http://localhost:3000" };
    const token = createUnsubscribeToken(
      { workspaceId: "ws_demo_001", email: "demo@example.com" },
      env,
      "demo"
    );
    expect(
      verifyUnsubscribeToken(token as string, env, "demo")?.workspaceId
    ).toBe("ws_demo_001");
    // The demo key is never accepted in live mode.
    expect(verifyUnsubscribeToken(token as string, env, "supabase")).toBeNull();
  });

  it("live mode with no key material mints nothing", () => {
    expect(
      createUnsubscribeToken(
        { workspaceId: "ws_1", email: "a@example.com" },
        {},
        "supabase"
      )
    ).toBeNull();
  });
});

describe("unsubscribe URLs + headers", () => {
  it("builds the URL under NEXT_PUBLIC_APP_URL", () => {
    const resolved = buildUnsubscribeUrl(
      { workspaceId: "ws_1", email: "a@example.com" },
      SECRET_ENV
    );
    expect(resolved.url).toMatch(
      /^https:\/\/app\.nxtsend\.example\/api\/unsubscribe\/.+/
    );
  });

  it("production + localhost app URL → no URL, with a reason (never a broken link)", () => {
    const env: UnsubscribeEnv = {
      ...SECRET_ENV,
      NODE_ENV: "production",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    };
    const resolved = buildUnsubscribeUrl(
      { workspaceId: "ws_1", email: "a@example.com" },
      env
    );
    expect(resolved.url).toBeNull();
    const prep = buildUnsubscribeHeaders(
      { workspaceId: "ws_1", email: "a@example.com" },
      env
    );
    expect(prep.url).toBeNull();
    expect(prep.warning).toMatch(/localhost/);
    expect(prep.headers["List-Unsubscribe"]).toBeUndefined();
  });

  it("production + unconfigured signing → no URL header, warning says why", () => {
    const env: UnsubscribeEnv = {
      NODE_ENV: "production",
      NEXT_PUBLIC_APP_URL: "https://app.nxtsend.example",
    };
    const prep = buildUnsubscribeHeaders(
      { workspaceId: "ws_1", email: "a@example.com" },
      env,
      "supabase"
    );
    expect(prep.url).toBeNull();
    expect(prep.headers).toEqual({});
    expect(prep.warning).toMatch(/UNSUBSCRIBE_SECRET/);
  });

  it("full headers: one-click HTTPS + mailto when EMAIL_REPLY_TO is set", () => {
    const prep = buildUnsubscribeHeaders(
      { workspaceId: "ws_1", email: "a@example.com" },
      { ...SECRET_ENV, EMAIL_REPLY_TO: "replies@reply.example.com" }
    );
    expect(prep.headers["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click"
    );
    expect(prep.headers["List-Unsubscribe"]).toContain(
      "<mailto:replies@reply.example.com>"
    );
    expect(prep.headers["List-Unsubscribe"]).toContain(
      `<${prep.url as string}>`
    );
  });

  it("URL-only when EMAIL_REPLY_TO is unset (no fabricated mailto)", () => {
    const prep = buildUnsubscribeHeaders(
      { workspaceId: "ws_1", email: "a@example.com" },
      SECRET_ENV
    );
    expect(prep.headers["List-Unsubscribe"]).toBe(`<${prep.url as string}>`);
    expect(prep.headers["List-Unsubscribe"]).not.toContain("mailto:");
    expect(prep.headers["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click"
    );
  });

  it("mailto-only when no URL can be built, and no One-Click post header", () => {
    const env: UnsubscribeEnv = {
      NODE_ENV: "production",
      NEXT_PUBLIC_APP_URL: "not a url",
      UNSUBSCRIBE_SECRET: "unit-test-unsubscribe-secret-0123456789abcdef",
      EMAIL_REPLY_TO: "replies@reply.example.com",
    };
    const prep = buildUnsubscribeHeaders(
      { workspaceId: "ws_1", email: "a@example.com" },
      env
    );
    expect(prep.url).toBeNull();
    expect(prep.headers["List-Unsubscribe"]).toBe(
      "<mailto:replies@reply.example.com>"
    );
    expect(prep.headers["List-Unsubscribe-Post"]).toBeUndefined();
  });
});

describe("footer append", () => {
  const url = "https://app.nxtsend.example/api/unsubscribe/TOKEN";

  it("appends to text and html at send time — the stored template object is not mutated", () => {
    const template = {
      text: "Hi Sarah,\n\nQuick note about Acme.",
      html: "<p>Hi Sarah,</p><p>Quick note about Acme.</p>",
    };
    const out = appendUnsubscribeFooter(template, url);
    expect(out.text).toContain(`Unsubscribe: ${url}`);
    expect(out.html).toContain(`href="${url}"`);
    expect(out.html).toContain(">Unsubscribe</a>");
    // Original untouched (the executor stores/sends from templates).
    expect(template.text).toBe("Hi Sarah,\n\nQuick note about Acme.");
    expect(template.html).toBe("<p>Hi Sarah,</p><p>Quick note about Acme.</p>");
  });

  it("no URL → bodies pass through unchanged", () => {
    const bodies = { text: "Body", html: "<p>Body</p>" };
    expect(appendUnsubscribeFooter(bodies, null)).toEqual(bodies);
  });

  it("html-only and text-only inputs each gain the footer in their own format", () => {
    expect(appendUnsubscribeFooter({ html: "<p>x</p>" }, url).html).toContain(url);
    expect(appendUnsubscribeFooter({ text: "x" }, url).text).toContain(url);
  });
});

describe("maskEmail", () => {
  it("masks the local part, keeps the domain", () => {
    expect(maskEmail("sarah.jenkins@stripe.com")).toBe("s***@stripe.com");
    expect(maskEmail("ab@x.io")).toBe("a***@x.io");
  });
});

/** Minimal in-memory SuppressionStore for the service tests. */
function fakeStore(): SuppressionStore & { rows: Map<string, string> } {
  const rows = new Map<string, string>();
  const key = (w: string, e: string) => `${w}:${e}`;
  const entryFor = (workspaceId: string, email: string) => ({
    id: key(workspaceId, email),
    workspace_id: workspaceId,
    email,
    reason: rows.get(key(workspaceId, email)) as string,
    created_at: new Date().toISOString(),
  });
  return {
    rows,
    async list(workspaceId) {
      return Array.from(rows.keys())
        .filter((k) => k.startsWith(`${workspaceId}:`))
        .map((k) => entryFor(workspaceId, k.slice(workspaceId.length + 1)));
    },
    async add(workspaceId, email, reason) {
      const k = key(workspaceId, email);
      const created = !rows.has(k);
      if (created) rows.set(k, reason);
      return { entry: entryFor(workspaceId, email), created };
    },
    async remove(workspaceId, email) {
      return rows.delete(key(workspaceId, email));
    },
    async check(workspaceId, email) {
      return rows.has(key(workspaceId, email));
    },
  };
}

describe("performUnsubscribe (one-click service)", () => {
  function makeDeps(store: SuppressionStore) {
    const state = { stops: 0 };
    const deps: UnsubscribeServiceDeps = {
      store,
      stopEnrollments: async () => {
        state.stops += 1;
        return 2;
      },
      env: SECRET_ENV,
      mode: "supabase",
    };
    return { deps, state };
  }

  it("records the suppression with reason `unsubscribed` and stops enrollments", async () => {
    const store = fakeStore();
    const { deps } = makeDeps(store);
    const token = createUnsubscribeToken(
      { workspaceId: "ws_1", email: "a@example.com" },
      SECRET_ENV
    ) as string;
    const result = await performUnsubscribe(deps, token);
    expect(result.outcome).toBe("unsubscribed");
    if (result.outcome !== "invalid") {
      expect(result.stoppedEnrollments).toBe(2);
    }
    expect(store.rows.get("ws_1:a@example.com")).toBe(UNSUBSCRIBED_REASON);
    expect(store.rows.get("ws_1:a@example.com")).toBe("unsubscribed");
  });

  it("is idempotent: a second click succeeds as `already`, one row, no error", async () => {
    const store = fakeStore();
    const { deps } = makeDeps(store);
    const token = createUnsubscribeToken(
      { workspaceId: "ws_1", email: "a@example.com" },
      SECRET_ENV
    ) as string;
    await performUnsubscribe(deps, token);
    const second = await performUnsubscribe(deps, token);
    expect(second.outcome).toBe("already");
    expect(store.rows.size).toBe(1);
  });

  it("an address already suppressed for another reason stays suppressed (outcome already)", async () => {
    const store = fakeStore();
    await store.add("ws_1", "a@example.com", "bounced (Resend webhook)");
    const { deps } = makeDeps(store);
    const token = createUnsubscribeToken(
      { workspaceId: "ws_1", email: "a@example.com" },
      SECRET_ENV
    ) as string;
    const result = await performUnsubscribe(deps, token);
    expect(result.outcome).toBe("already");
    // The original reason is preserved (provenance), still one row.
    expect(store.rows.get("ws_1:a@example.com")).toBe("bounced (Resend webhook)");
  });

  it("invalid token → outcome invalid, zero writes, enrollments untouched", async () => {
    const store = fakeStore();
    const { deps, state } = makeDeps(store);
    const result = await performUnsubscribe(deps, "garbage.token");
    expect(result.outcome).toBe("invalid");
    expect(store.rows.size).toBe(0);
    expect(state.stops).toBe(0);
  });

  it("a failing enrollment stopper never fails the unsubscribe", async () => {
    const store = fakeStore();
    const deps: UnsubscribeServiceDeps = {
      store,
      stopEnrollments: async () => {
        throw new Error("db down");
      },
      env: SECRET_ENV,
      mode: "supabase",
    };
    const token = createUnsubscribeToken(
      { workspaceId: "ws_1", email: "a@example.com" },
      SECRET_ENV
    ) as string;
    const result = await performUnsubscribe(deps, token);
    expect(result.outcome).toBe("unsubscribed");
    expect(store.rows.get("ws_1:a@example.com")).toBe("unsubscribed");
  });
});

describe("demo suppression store", () => {
  beforeEach(() => {
    setDemoStorage(createMemoryStorage());
  });

  it("add → check → list → remove round-trip, scoped per workspace", async () => {
    const store = createDemoSuppressionStore();
    const { created } = await store.add("ws_demo_001", "A@Example.com", "unsubscribed");
    expect(created).toBe(true);
    expect(await store.check("ws_demo_001", "a@example.com")).toBe(true);
    expect(await store.check("ws_other", "a@example.com")).toBe(false);
    // Idempotent re-add keeps the first reason.
    const again = await store.add("ws_demo_001", "a@example.com", "manual block");
    expect(again.created).toBe(false);
    expect(again.entry.reason).toBe("unsubscribed");
    expect((await store.list("ws_demo_001")).length).toBe(1);
    expect(await store.remove("ws_demo_001", "a@example.com")).toBe(true);
    expect(await store.check("ws_demo_001", "a@example.com")).toBe(false);
  });
});

describe("suppressionSourceLabel", () => {
  it("derives the provenance the UI shows", () => {
    expect(suppressionSourceLabel("bounced (Resend webhook)")).toBe("Provider webhook");
    expect(suppressionSourceLabel("unsubscribed")).toBe("Unsubscribe link");
    expect(suppressionSourceLabel("manual block")).toBe("Added manually");
    expect(suppressionSourceLabel("")).toBe("System");
  });
});
