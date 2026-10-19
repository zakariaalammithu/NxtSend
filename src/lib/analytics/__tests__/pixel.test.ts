import { describe, it, expect } from "vitest";
import { getMetaPixelId, isPixelConfigured, isTrackedPath } from "../pixel";

describe("getMetaPixelId", () => {
  it("returns null when unset or empty (component renders nothing)", () => {
    expect(getMetaPixelId({})).toBeNull();
    expect(getMetaPixelId({ NEXT_PUBLIC_META_PIXEL_ID: "" })).toBeNull();
    expect(getMetaPixelId({ NEXT_PUBLIC_META_PIXEL_ID: "   " })).toBeNull();
    expect(isPixelConfigured({})).toBe(false);
  });

  it("returns null for placeholder / non-numeric values (never fires)", () => {
    expect(getMetaPixelId({ NEXT_PUBLIC_META_PIXEL_ID: "your-pixel-id" })).toBeNull();
    expect(getMetaPixelId({ NEXT_PUBLIC_META_PIXEL_ID: "123" })).toBeNull();
    expect(getMetaPixelId({ NEXT_PUBLIC_META_PIXEL_ID: "1234567890abcdef" })).toBeNull();
  });

  it("accepts a real-looking numeric Meta Pixel ID", () => {
    expect(getMetaPixelId({ NEXT_PUBLIC_META_PIXEL_ID: "123456789012345" })).toBe(
      "123456789012345"
    );
    expect(isPixelConfigured({ NEXT_PUBLIC_META_PIXEL_ID: "123456789012345" })).toBe(true);
  });
});

describe("isTrackedPath", () => {
  it("never tracks app/admin surfaces", () => {
    expect(isTrackedPath("/dashboard")).toBe(false);
    expect(isTrackedPath("/dashboard/billing")).toBe(false);
    expect(isTrackedPath("/admin/users")).toBe(false);
  });
  it("tracks marketing + auth surfaces", () => {
    expect(isTrackedPath("/")).toBe(true);
    expect(isTrackedPath("/pricing")).toBe(true);
    expect(isTrackedPath("/login")).toBe(true);
    expect(isTrackedPath("/signup")).toBe(true);
  });
});
