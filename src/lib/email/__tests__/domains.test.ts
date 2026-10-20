/**
 * Resend domain-status tests — fake SDK clients only, no network.
 * Pins the honesty rules: only the provider's own "verified" status
 * counts, an unverified/listed-but-pending FROM domain is a warning,
 * and a detail-fetch failure never breaks the list verdict.
 */

import { describe, it, expect, vi } from "vitest";
import {
  dkimSelectorsFromDomain,
  extractEmailDomain,
  listResendDomains,
  matchEmailFromDomain,
  type ResendDomainInfo,
} from "../domains";

describe("extractEmailDomain", () => {
  it("handles display-name and bare forms", () => {
    expect(extractEmailDomain("NxtSend <hello@Example.COM>")).toBe("example.com");
    expect(extractEmailDomain("hello@example.com")).toBe("example.com");
    expect(extractEmailDomain("  <a@mail.example.org> ")).toBe("mail.example.org");
  });

  it("returns null for non-addresses", () => {
    expect(extractEmailDomain("")).toBeNull();
    expect(extractEmailDomain(undefined)).toBeNull();
    expect(extractEmailDomain(null)).toBeNull();
    expect(extractEmailDomain("not-an-email")).toBeNull();
    expect(extractEmailDomain("a@localhost")).toBeNull();
    expect(extractEmailDomain("@example.com")).toBeNull();
  });
});

const DOM = (name: string, status: string): ResendDomainInfo => ({
  id: `id-${name}`,
  name,
  status,
  records: [],
});

describe("matchEmailFromDomain", () => {
  it("verified only when the provider says exactly 'verified'", () => {
    const m = matchEmailFromDomain([DOM("example.com", "verified")], "a@example.com");
    expect(m.state).toBe("verified");
    expect(m.fromDomain).toBe("example.com");
  });

  it("listed but pending → not_verified", () => {
    const m = matchEmailFromDomain([DOM("example.com", "pending")], "a@example.com");
    expect(m.state).toBe("not_verified");
    expect(m.domain?.name).toBe("example.com");
  });

  it("absent from the provider list → not_listed", () => {
    const m = matchEmailFromDomain([DOM("other.com", "verified")], "a@example.com");
    expect(m.state).toBe("not_listed");
  });

  it("unparsable FROM → unknown", () => {
    const m = matchEmailFromDomain([], "garbage");
    expect(m.state).toBe("unknown");
    expect(m.fromDomain).toBeNull();
  });
});

describe("listResendDomains", () => {
  it("normalizes the {data:{data:[...]}} list shape", async () => {
    const client = {
      list: vi.fn(async () => ({
        data: { data: [{ id: "1", name: "example.com", status: "verified" }] },
        error: null,
      })),
      get: vi.fn(),
    };
    const out = await listResendDomains("key", { client });
    expect(out.error).toBeNull();
    expect(out.domains).toHaveLength(1);
    expect(out.domains[0].name).toBe("example.com");
  });

  it("normalizes the flat {data:[...]} list shape", async () => {
    const client = {
      list: vi.fn(async () => ({
        data: [{ id: "2", name: "x.com", status: "pending" }],
        error: null,
      })),
      get: vi.fn(),
    };
    const out = await listResendDomains("key", { client });
    expect(out.domains.map((d) => d.name)).toEqual(["x.com"]);
  });

  it("surfaces SDK errors", async () => {
    const client = {
      list: vi.fn(async () => ({
        data: null,
        error: { name: "invalid_api_key", message: "bad key" },
      })),
      get: vi.fn(),
    };
    const out = await listResendDomains("key", { client });
    expect(out.error).toContain("invalid_api_key");
    expect(out.domains).toEqual([]);
  });

  it("fetches records only for the detail domain", async () => {
    const client = {
      list: vi.fn(async () => ({
        data: {
          data: [
            { id: "1", name: "example.com", status: "verified" },
            { id: "2", name: "other.com", status: "verified" },
          ],
        },
        error: null,
      })),
      get: vi.fn(async (id: string) => ({
        data: {
          id,
          name: "example.com",
          status: "verified",
          records: [
            {
              record: "DKIM",
              name: "resend._domainkey.example.com",
              type: "TXT",
              value: "p=MIGf...",
              status: "verified",
            },
            {
              record: "SPF",
              name: "send.example.com",
              type: "TXT",
              value: "v=spf1 include:amazonses.com ~all",
              status: "verified",
            },
          ],
        },
        error: null,
      })),
    };
    const out = await listResendDomains("key", {
      client,
      detailDomain: "example.com",
    });
    expect(client.get).toHaveBeenCalledTimes(1);
    expect(client.get).toHaveBeenCalledWith("1");
    const example = out.domains.find((d) => d.name === "example.com");
    expect(example?.records).toHaveLength(2);
    expect(out.domains.find((d) => d.name === "other.com")?.records).toEqual([]);
  });

  it("a failing detail fetch keeps the list verdict", async () => {
    const client = {
      list: vi.fn(async () => ({
        data: { data: [{ id: "1", name: "example.com", status: "pending" }] },
        error: null,
      })),
      get: vi.fn(async () => {
        throw new Error("boom");
      }),
    };
    const out = await listResendDomains("key", {
      client,
      detailDomain: "example.com",
    });
    expect(out.error).toBeNull();
    expect(out.domains[0].status).toBe("pending");
  });
});

describe("dkimSelectorsFromDomain", () => {
  it("extracts selectors from _domainkey record names", () => {
    const selectors = dkimSelectorsFromDomain({
      id: "1",
      name: "example.com",
      status: "verified",
      records: [
        {
          kind: "DKIM",
          name: "resend._domainkey.example.com",
          type: "TXT",
          value: "p=x",
          status: "verified",
        },
        {
          kind: "SPF",
          name: "send.example.com",
          type: "TXT",
          value: "v=spf1 ...",
          status: "verified",
        },
      ],
    });
    expect(selectors).toEqual(["resend"]);
  });
});
