/**
 * SectionGlow — reusable section background in the BizReviewRadar
 * "Integrates with your favorite tools" treatment, already used inline
 * in NxtSend's agency hero and HomeIntegrations section:
 *
 * - a soft radial glow anchored at the top of the section, fading to
 *   transparent (never a flat colour band, never covering content)
 * - a faint white 1px grid, 64px cells, 5% opacity, radially masked
 *   near the top so it melts away instead of ending in a hard edge
 * - decorative only: pointer-events-none, aria-hidden, no text, links
 *   or layout changes of its own
 *
 * Variants alternate across consecutive sections so the site does not
 * repeat one colour everywhere:
 * - emerald: the screenshot hero's teal-green top light
 * - blue: the Integrations section's deep blue
 * - violet: NxtSend's own brand purple
 * - teal: a softer teal-green, for closing CTA bands
 *
 * Usage: place as the first child of a section that is already
 * `relative` + `overflow-hidden` (add those classes when inserting),
 * with the section's content wrapper `relative z-10` so copy always
 * sits above the glow.
 */
export type SectionGlowVariant = "emerald" | "blue" | "violet" | "teal";

const GLOWS: Record<SectionGlowVariant, string> = {
  emerald:
    "radial-gradient(110% 60% at 50% 0%, rgba(16,185,129,0.28) 0%, rgba(12,17,80,0.35) 45%, rgba(5,7,15,0) 75%)",
  blue: "radial-gradient(120% 70% at 50% 0%, rgba(23,37,215,0.42) 0%, rgba(12,17,80,0.45) 42%, rgba(5,7,15,0) 72%)",
  violet:
    "radial-gradient(110% 60% at 50% 0%, rgba(130,4,255,0.32) 0%, rgba(102,45,255,0.24) 45%, rgba(5,7,15,0) 75%)",
  teal: "radial-gradient(100% 55% at 50% 0%, rgba(45,212,191,0.28) 0%, rgba(16,185,129,0.2) 40%, rgba(5,7,15,0) 75%)",
};

export function SectionGlow({
  variant = "blue",
  grid = true,
}: {
  variant?: SectionGlowVariant;
  grid?: boolean;
}) {
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[40rem] max-h-full"
        style={{ background: GLOWS[variant] }}
      />
      {grid && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
            backgroundSize: "64px 64px",
            maskImage: "radial-gradient(70% 50% at 50% 20%, #000, transparent)",
            WebkitMaskImage:
              "radial-gradient(70% 50% at 50% 20%, #000, transparent)",
          }}
        />
      )}
    </>
  );
}
