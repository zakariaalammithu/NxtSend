/**
 * ContinueWithGoogleButton (P10 Stage C) — honest render states.
 *
 *  - Supabase not configured (browser client null / Demo Mode): the
 *    button renders DISABLED with the note that Google sign-in
 *    becomes available once authentication is configured. No fake
 *    flow is offered.
 *  - Configured: the button is enabled and no note shows.
 *  - Externally disabled (signup page with signups closed): disabled
 *    with the caller's note.
 *
 * Rendered with react-dom/server (same pattern as the marketing
 * component tests); the Supabase browser client is mocked.
 */

import * as React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

(globalThis as { React?: typeof React }).React = React;

const clientState = vi.hoisted(() => ({ configured: false }));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () =>
    clientState.configured
      ? { auth: { signInWithOAuth: async () => ({ error: null }) } }
      : null,
}));

import ContinueWithGoogleButton from "../ContinueWithGoogleButton";

const render = (node: React.ReactElement) =>
  renderToString(node).replace(/<!-- -->/g, "");

describe("ContinueWithGoogleButton", () => {
  it("renders the official label with the Google mark", () => {
    clientState.configured = true;
    const html = render(<ContinueWithGoogleButton redirect="/dashboard" />);
    expect(html).toContain("Continue with Google");
    expect(html).toContain("<svg");
    // The multicolour Google "G" paths are present.
    expect(html).toContain("#4285F4");
    expect(html).toContain("#EA4335");
  });

  it("is enabled when Supabase is configured", () => {
    clientState.configured = true;
    const html = render(<ContinueWithGoogleButton redirect="/dashboard" />);
    // The `disabled=""` ATTRIBUTE (not the Tailwind `disabled:`
    // variant classes, which are always in the class list).
    expect(html).not.toContain('disabled=""');
    expect(html).not.toContain("becomes available once authentication");
  });

  it("renders disabled with the honest note in Demo Mode (null client)", () => {
    clientState.configured = false;
    const html = render(<ContinueWithGoogleButton redirect="/dashboard" />);
    expect(html).toContain('disabled=""');
    expect(html).toContain(
      "Google sign-in becomes available once authentication is configured."
    );
  });

  it("renders disabled with the caller's note when externally gated", () => {
    clientState.configured = true;
    const html = render(
      <ContinueWithGoogleButton
        redirect="/dashboard"
        disabled
        disabledNote="Google sign-up is unavailable while signups are closed."
      />
    );
    expect(html).toContain('disabled=""');
    expect(html).toContain(
      "Google sign-up is unavailable while signups are closed."
    );
  });
});
