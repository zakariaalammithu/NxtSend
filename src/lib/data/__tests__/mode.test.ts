import { describe, it, expect } from "vitest";
import { getDataMode, isSupabaseConfigured } from "@/lib/data/mode";

const REAL_URL = "https://abcdefghijklm.supabase.co";
const REAL_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.real-anon-key";

describe("getDataMode / isSupabaseConfigured", () => {
  it("returns 'supabase' when a real URL and key are configured", () => {
    expect(
      getDataMode({
        NEXT_PUBLIC_SUPABASE_URL: REAL_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: REAL_KEY,
      })
    ).toBe("supabase");
    expect(
      isSupabaseConfigured({
        NEXT_PUBLIC_SUPABASE_URL: REAL_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: REAL_KEY,
      })
    ).toBe(true);
  });

  it("returns 'demo' when env vars are missing", () => {
    expect(getDataMode({})).toBe("demo");
    expect(
      getDataMode({ NEXT_PUBLIC_SUPABASE_URL: undefined, NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined })
    ).toBe("demo");
  });

  it("returns 'demo' for the documented placeholder URL", () => {
    expect(
      getDataMode({
        NEXT_PUBLIC_SUPABASE_URL: "https://your-project.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: REAL_KEY,
      })
    ).toBe("demo");
  });

  it("returns 'demo' for the documented placeholder key", () => {
    expect(
      getDataMode({
        NEXT_PUBLIC_SUPABASE_URL: REAL_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "your-anon-key",
      })
    ).toBe("demo");
  });

  it("returns 'demo' when any value contains 'placeholder'", () => {
    expect(
      getDataMode({
        NEXT_PUBLIC_SUPABASE_URL: "https://placeholder.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: REAL_KEY,
      })
    ).toBe("demo");
    expect(
      getDataMode({
        NEXT_PUBLIC_SUPABASE_URL: REAL_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder-key",
      })
    ).toBe("demo");
  });

  it("returns 'demo' when only one of URL/key is set", () => {
    expect(getDataMode({ NEXT_PUBLIC_SUPABASE_URL: REAL_URL })).toBe("demo");
    expect(getDataMode({ NEXT_PUBLIC_SUPABASE_ANON_KEY: REAL_KEY })).toBe("demo");
  });
});
