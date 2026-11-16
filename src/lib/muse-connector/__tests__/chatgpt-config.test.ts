/**
 * ChatGPT MCP config tests (Worker C).
 *
 * What is being protected: the ChatGPT flag/URL precedence —
 * CHATGPT_MCP_ENABLED wins when set, otherwise MUSE_MCP_ENABLED
 * applies, otherwise the surface is on; the public URL precedence
 * is CHATGPT_MCP_PUBLIC_URL, then MUSE_MCP_PUBLIC_URL, then
 * NEXT_PUBLIC_APP_URL, then the request origin. A bad URL never
 * yields a value (null, not a throw).
 */

import { describe, it, expect } from "vitest";
import {
  isChatGptMcpEnabled,
  getChatGptPublicUrl,
  isMuseMcpEnabled,
  getMusePublicUrl,
} from "../oauth/config";

describe("isChatGptMcpEnabled", () => {
  it("defaults to enabled when nothing is set", () => {
    expect(isChatGptMcpEnabled({})).toBe(true);
    expect(isMuseMcpEnabled({})).toBe(true);
  });

  it("CHATGPT_MCP_ENABLED=false disables the ChatGPT surface even when Muse is on", () => {
    expect(
      isChatGptMcpEnabled({ CHATGPT_MCP_ENABLED: "false", MUSE_MCP_ENABLED: "true" })
    ).toBe(false);
    expect(isMuseMcpEnabled({ MUSE_MCP_ENABLED: "true" })).toBe(true);
  });

  it("CHATGPT_MCP_ENABLED=true enables it even when Muse is off", () => {
    expect(
      isChatGptMcpEnabled({ CHATGPT_MCP_ENABLED: "true", MUSE_MCP_ENABLED: "false" })
    ).toBe(true);
    expect(isMuseMcpEnabled({ MUSE_MCP_ENABLED: "false" })).toBe(false);
  });

  it("falls back to MUSE_MCP_ENABLED when the ChatGPT var is unset", () => {
    expect(isChatGptMcpEnabled({ MUSE_MCP_ENABLED: "false" })).toBe(false);
    expect(isChatGptMcpEnabled({ MUSE_MCP_ENABLED: "0" })).toBe(false);
    expect(isChatGptMcpEnabled({ MUSE_MCP_ENABLED: "true" })).toBe(true);
  });

  it("treats the usual off spellings as disabled", () => {
    for (const off of ["false", "0", "no", "off", "FALSE", " Off "]) {
      expect(isChatGptMcpEnabled({ CHATGPT_MCP_ENABLED: off }), off).toBe(false);
    }
    expect(isChatGptMcpEnabled({ CHATGPT_MCP_ENABLED: "yes" })).toBe(true);
  });
});

describe("getChatGptPublicUrl", () => {
  it("prefers CHATGPT_MCP_PUBLIC_URL over MUSE_MCP_PUBLIC_URL over NEXT_PUBLIC_APP_URL", () => {
    const env = {
      CHATGPT_MCP_PUBLIC_URL: "https://chatgpt.example.com/",
      MUSE_MCP_PUBLIC_URL: "https://muse.example.com",
      NEXT_PUBLIC_APP_URL: "https://app.example.com",
    };
    expect(getChatGptPublicUrl("https://req.example.com", env)).toBe(
      "https://chatgpt.example.com"
    );
    expect(
      getChatGptPublicUrl("https://req.example.com", {
        MUSE_MCP_PUBLIC_URL: "https://muse.example.com",
        NEXT_PUBLIC_APP_URL: "https://app.example.com",
      })
    ).toBe("https://muse.example.com");
    expect(
      getChatGptPublicUrl("https://req.example.com", {
        NEXT_PUBLIC_APP_URL: "https://app.example.com",
      })
    ).toBe("https://app.example.com");
    expect(getChatGptPublicUrl("https://req.example.com", {})).toBe(
      "https://req.example.com"
    );
  });

  it("returns null when nothing usable is set", () => {
    expect(getChatGptPublicUrl(undefined, {})).toBeNull();
    expect(getChatGptPublicUrl(undefined, { NEXT_PUBLIC_APP_URL: "not-a-url" })).toBeNull();
    expect(getMusePublicUrl(undefined, {})).toBeNull();
  });

  it("strips trailing slashes and rejects non-http(s) schemes", () => {
    expect(
      getChatGptPublicUrl(undefined, { CHATGPT_MCP_PUBLIC_URL: "https://example.com///" })
    ).toBe("https://example.com");
    expect(
      getChatGptPublicUrl(undefined, { CHATGPT_MCP_PUBLIC_URL: "ftp://example.com" })
    ).toBeNull();
  });
});
