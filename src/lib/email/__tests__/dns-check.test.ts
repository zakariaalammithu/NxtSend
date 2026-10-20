/**
 * DNS authentication checker tests — every resolver is a fixture, so
 * no test touches the network. The verdict rules pinned here are the
 * honesty contract: a record set is "valid" only when it is actually
 * well-formed, and missing/guessed pieces are labelled as such.
 */

import { describe, it, expect, vi } from "vitest";
import {
  checkDomainAuth,
  createDefaultTxtResolver,
  evaluateDmarcRecords,
  evaluateSpfRecords,
  normalizeDomain,
  parseDohTxtData,
  type TxtResolver,
} from "../dns-check";

/** Fake resolver: hostname → record texts; absent name = no records. */
function fakeResolver(
  txt: Record<string, string[]> = {},
  cnames: Record<string, string[]> = {}
): TxtResolver {
  return {
    async resolveTxt(hostname: string) {
      return (txt[hostname] ?? []).map((r) => [r]);
    },
    async resolveCname(hostname: string) {
      return cnames[hostname] ?? [];
    },
  };
}

const VALID_SPF = "v=spf1 include:_spf.provider.com -all";
const VALID_DMARC = "v=DMARC1; p=none; rua=mailto:dmarc@example.com";
const DKIM_KEY = "v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBfakekey";

describe("normalizeDomain", () => {
  it("strips scheme, path, port, case and trailing dot", () => {
    expect(normalizeDomain("https://Example.COM:8443/path?q=1")).toBe("example.com");
    expect(normalizeDomain("example.com.")).toBe("example.com");
    expect(normalizeDomain("  mail.example.co.uk ")).toBe("mail.example.co.uk");
  });

  it("rejects non-domains", () => {
    expect(normalizeDomain("")).toBeNull();
    expect(normalizeDomain(null)).toBeNull();
    expect(normalizeDomain("not a domain")).toBeNull();
    expect(normalizeDomain("localhost")).toBeNull();
    expect(normalizeDomain("example.c")).toBeNull();
  });
});

describe("evaluateSpfRecords", () => {
  it("valid: single record ending in -all", () => {
    const v = evaluateSpfRecords([VALID_SPF], "example.com");
    expect(v.state).toBe("valid");
    expect(v.records).toEqual([VALID_SPF]);
    expect(v.notes.join(" ")).toContain("-all");
  });

  it("not found when no v=spf1 record exists", () => {
    expect(evaluateSpfRecords([], "example.com").state).toBe("not_found");
    expect(evaluateSpfRecords(["some other txt"], "example.com").state).toBe("not_found");
  });

  it("invalid: multiple SPF records", () => {
    const v = evaluateSpfRecords([VALID_SPF, "v=spf1 -all"], "example.com");
    expect(v.state).toBe("invalid");
    expect(v.issues.join(" ")).toContain("exactly ONE");
  });

  it("invalid: +all authorises everyone", () => {
    const v = evaluateSpfRecords(["v=spf1 include:x.com +all"], "example.com");
    expect(v.state).toBe("invalid");
    expect(v.issues.join(" ")).toContain("ANY server");
  });

  it("invalid: ?all takes no position", () => {
    const v = evaluateSpfRecords(["v=spf1 include:x.com ?all"], "example.com");
    expect(v.state).toBe("invalid");
    expect(v.issues.join(" ")).toContain("?all");
  });

  it("invalid: missing all mechanism", () => {
    const v = evaluateSpfRecords(["v=spf1 include:x.com"], "example.com");
    expect(v.state).toBe("invalid");
    expect(v.issues.join(" ")).toContain('no "all" mechanism');
  });

  it("valid: a redirect modifier delegates the policy (gmail-style record)", () => {
    const v = evaluateSpfRecords(["v=spf1 redirect=_spf.google.com"], "gmail.com");
    expect(v.state).toBe("valid");
    expect(v.notes.join(" ")).toContain("redirects all SPF evaluation");
    expect(v.notes.join(" ")).toContain("_spf.google.com");
  });

  it("invalid: more than 10 DNS lookups", () => {
    const includes = Array.from({ length: 11 }, (_, i) => `include:s${i}.com`).join(" ");
    const v = evaluateSpfRecords([`v=spf1 ${includes} -all`], "example.com");
    expect(v.state).toBe("invalid");
    expect(v.issues.join(" ")).toContain("10");
  });

  it("valid with a note for ~all (softfail)", () => {
    const v = evaluateSpfRecords(["v=spf1 include:amazonses.com ~all"], "example.com");
    expect(v.state).toBe("valid");
    expect(v.notes.join(" ")).toContain("softfail");
  });
});

describe("evaluateDmarcRecords", () => {
  it("valid: p=none is monitor-only, said out loud", () => {
    const v = evaluateDmarcRecords([VALID_DMARC], "example.com");
    expect(v.state).toBe("valid");
    expect(v.notes.join(" ")).toContain("monitor-only");
    expect(v.notes.join(" ")).toContain("dmarc@example.com");
  });

  it("valid: p=reject is the strongest stance", () => {
    const v = evaluateDmarcRecords(["v=DMARC1; p=reject; rua=mailto:d@e.com"], "example.com");
    expect(v.state).toBe("valid");
    expect(v.notes.join(" ")).toContain("p=reject");
  });

  it("not found when absent", () => {
    expect(evaluateDmarcRecords([], "example.com").state).toBe("not_found");
  });

  it("invalid: missing p= policy", () => {
    const v = evaluateDmarcRecords(["v=DMARC1; rua=mailto:d@e.com"], "example.com");
    expect(v.state).toBe("invalid");
    expect(v.issues.join(" ")).toContain('no "p=" policy');
  });

  it("invalid: duplicate DMARC records", () => {
    const v = evaluateDmarcRecords([VALID_DMARC, VALID_DMARC], "example.com");
    expect(v.state).toBe("invalid");
    expect(v.issues.join(" ")).toContain("only one is allowed");
  });

  it("notes the missing rua=", () => {
    const v = evaluateDmarcRecords(["v=DMARC1; p=quarantine"], "example.com");
    expect(v.state).toBe("valid");
    expect(v.notes.join(" ")).toContain("will not receive aggregate reports");
  });
});

describe("checkDomainAuth (fixture resolver)", () => {
  it("all three protocols valid for a fully configured domain", async () => {
    const resolver = fakeResolver({
      "example.com": [VALID_SPF],
      "_dmarc.example.com": [VALID_DMARC],
      "resend._domainkey.example.com": [DKIM_KEY],
    });
    const out = await checkDomainAuth("example.com", {
      resolver,
      dkimSelectors: [{ selector: "resend", source: "provider" }],
    });
    expect(out.spf.state).toBe("valid");
    expect(out.dmarc.state).toBe("valid");
    const providerDkim = out.dkim.find((d) => d.selector === "resend");
    expect(providerDkim?.state).toBe("valid");
    expect(providerDkim?.selectorSource).toBe("provider");
    // Guessed selectors that don't exist are honest not_found + labelled guesses.
    const guess = out.dkim.find((d) => d.selector === "mail");
    expect(guess?.state).toBe("not_found");
    expect(guess?.selectorSource).toBe("guess");
  });

  it("finds Resend-style SPF on the send subdomain", async () => {
    const resolver = fakeResolver({
      "send.example.com": ["v=spf1 include:amazonses.com ~all"],
      "_dmarc.example.com": [VALID_DMARC],
      "resend._domainkey.example.com": [DKIM_KEY],
    });
    const out = await checkDomainAuth("example.com", { resolver });
    expect(out.spf.state).toBe("valid");
    expect(out.spf.notes.join(" ")).toContain("send");
  });

  it("everything missing → three honest not_found verdicts", async () => {
    const out = await checkDomainAuth("example.com", { resolver: fakeResolver({}) });
    expect(out.spf.state).toBe("not_found");
    expect(out.dmarc.state).toBe("not_found");
    expect(out.dkim.every((d) => d.state === "not_found")).toBe(true);
  });

  it("DKIM with an empty p= is a revoked key → invalid", async () => {
    const resolver = fakeResolver({
      "resend._domainkey.example.com": ["v=DKIM1; k=rsa; p="],
    });
    const out = await checkDomainAuth("example.com", {
      resolver,
      dkimSelectors: [{ selector: "resend", source: "provider" }],
    });
    const dkim = out.dkim.find((d) => d.selector === "resend");
    expect(dkim?.state).toBe("invalid");
    expect(dkim?.issues.join(" ")).toContain("revoked");
  });

  it("DKIM delegated by CNAME resolves the target key", async () => {
    const resolver = fakeResolver(
      { "selector1._domainkey.contoso.com": [DKIM_KEY] },
      { "selector1._domainkey.example.com": ["selector1._domainkey.contoso.com"] }
    );
    const out = await checkDomainAuth("example.com", {
      resolver,
      dkimSelectors: [{ selector: "selector1", source: "provider" }],
    });
    const dkim = out.dkim.find((d) => d.selector === "selector1");
    expect(dkim?.state).toBe("valid");
    expect(dkim?.notes.join(" ")).toContain("CNAME");
  });

  it("a failing resolver yields error verdicts, not fake not_found", async () => {
    const broken: TxtResolver = {
      async resolveTxt() {
        throw new Error("queryTxt ESERVFAIL");
      },
      async resolveCname() {
        return [];
      },
    };
    const out = await checkDomainAuth("example.com", { resolver: broken });
    expect(out.spf.state).toBe("error");
    expect(out.dmarc.state).toBe("error");
    expect(out.dkim.every((d) => d.state === "error")).toBe(true);
  });
});

describe("parseDohTxtData", () => {
  it("joins quoted segments and strips quotes", () => {
    expect(parseDohTxtData('"v=DMARC1; p=none;"')).toBe("v=DMARC1; p=none;");
    expect(parseDohTxtData('"abc" "def"')).toBe("abcdef");
    expect(parseDohTxtData("plain-value")).toBe("plain-value");
  });
});

describe("createDefaultTxtResolver fallback", () => {
  it("falls back to DoH when the native resolver refuses", async () => {
    const native = {
      async resolveTxt(): Promise<string[][]> {
        const err = new Error("queryTxt EREFUSED") as Error & { code?: string };
        err.code = "EREFUSED";
        throw err;
      },
      async resolveCname(): Promise<string[]> {
        return [];
      },
    };
    const fetchFn = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        Status: 0,
        Answer: [
          { name: "_dmarc.gmail.com", type: 16, data: '"v=DMARC1; p=none;"' },
        ],
      }),
    })) as unknown as typeof fetch;
    const resolver = createDefaultTxtResolver(fetchFn, native);
    const out = await resolver.resolveTxt("_dmarc.gmail.com");
    expect(out).toEqual([["v=DMARC1; p=none;"]]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("does NOT fall back on an authoritative ENOTFOUND", async () => {
    const native = {
      async resolveTxt(): Promise<string[][]> {
        const err = new Error("queryTxt ENOTFOUND") as Error & { code?: string };
        err.code = "ENOTFOUND";
        throw err;
      },
      async resolveCname(): Promise<string[]> {
        return [];
      },
    };
    const fetchFn = vi.fn() as unknown as typeof fetch;
    const resolver = createDefaultTxtResolver(fetchFn, native);
    await expect(resolver.resolveTxt("nope.example.com")).resolves.toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("NXDOMAIN via DoH → no records", async () => {
    const native = {
      async resolveTxt(): Promise<string[][]> {
        throw new Error("queryTxt ESERVFAIL");
      },
      async resolveCname(): Promise<string[]> {
        return [];
      },
    };
    const fetchFn = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ Status: 3 }),
    })) as unknown as typeof fetch;
    const resolver = createDefaultTxtResolver(fetchFn, native);
    await expect(resolver.resolveTxt("gone.example.com")).resolves.toEqual([]);
  });
});
