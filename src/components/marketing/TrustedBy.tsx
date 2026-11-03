import Image from "next/image";
import { SectionGlow } from "@/components/marketing/SectionGlow";

/**
 * Trusted-by logo wall (P6, owner-directed; restyled without white tiles).
 *
 * The 15 companies are exactly the ones in the previous version — no
 * logo was invented, added or dropped, and no ratings, quotes or extra
 * claims are added. What changed is only how they are presented:
 *
 * - The white tiles are gone. Logos sit directly on the dark section
 *   background, at rest slightly muted (opacity-80) and full colour on
 *   hover, which is the standard professional logo-wall treatment.
 * - White backgrounds baked into the supplied files were stripped to
 *   transparency (public/images/logos/dark/, originals untouched):
 *   only white connected to the image edge was removed, so white
 *   lettering inside a coloured mark (e.g. Pavilion, LinkedIn) is
 *   intact. Full-bleed colour squares (LinkedIn, ContactReachout,
 *   Exter, nsave, XBag, Pavilion) needed no stripping and are used
 *   exactly as supplied, shown as rounded app-style icons.
 * - Dark wordmarks that would vanish on a dark background (HubSpot's
 *   navy, Clay's black text, Flip's black text, Acquisition's black
 *   triangle) were knocked out to white. Saturated brand colours —
 *   HubSpot orange, Clay's rainbow, Flip green, Indoorcare green,
 *   Sandler/Spacebar blue — are untouched.
 * - BizReviewRadar: the owner-attached logo file (2026-11-03) was
 *   verified byte-identical to the repo's public/images/logos/
 *   bizreviewradar.png, so the dark version is that exact real logo
 *   with only its white background stripped; its navy outline and
 *   teal bars are untouched.
 * - McKinsey: no logo file was ever supplied (the supplied file was
 *   abstract artwork, not a logo), so the brand is still rendered as
 *   a typographic wordmark — now in white serif on dark, not faked
 *   as an image. Supply a real McKinsey logo file and it can replace
 *   this tile directly.
 */
const wordmarkTiles = [
  { name: "HubSpot", src: "/images/logos/dark/hubspot.png", w: 846, h: 249 },
  { name: "Clay", src: "/images/logos/dark/clay.png", w: 781, h: 419 },
  { name: "Pavilion", src: "/images/logos/pavilion.png", w: 701, h: 285 },
  { name: "Flip Electronics", src: "/images/logos/dark/flip-electronics.png", w: 410, h: 150 },
  { name: "Indoorcare", src: "/images/logos/dark/indoorcare.png", w: 131, h: 166, tall: true },
  { name: "XBag", src: "/images/logos/xbag.jpg", w: 200, h: 200 },
] as const;

const iconTiles = [
  { name: "LinkedIn", src: "/images/logos/linkedin.jpg" },
  { name: "Sandler Training", src: "/images/logos/dark/sandler-training.png" },
  { name: "Spacebar Studios", src: "/images/logos/dark/spacebar-studios.png" },
  { name: "ContactReachout", src: "/images/logos/contactreachout.png" },
  { name: "BizReviewRadar", src: "/images/logos/dark/bizreviewradar.png" },
  { name: "nsave", src: "/images/logos/nsave.png" },
  { name: "Acquisition Systems", src: "/images/logos/dark/acquisition-systems.png" },
  { name: "Exter Media", src: "/images/logos/exter-media.jpg" },
] as const;

const logoTileClass =
  "flex h-16 items-center justify-center opacity-80 transition-opacity duration-300 hover:opacity-100";

export function TrustedBy() {
  return (
    <section
      aria-label="Trusted by outreach experts"
      className="relative overflow-hidden border-t border-black-700/80 py-20 lg:py-24"
    >
      <SectionGlow variant="emerald" />

      <div className="section-container relative z-10">
        <h2 className="text-center text-24 sm:text-30 font-bold tracking-tight text-white">
          Trusted by more than 3,000 outreach experts
        </h2>

        <ul className="mx-auto mt-12 grid max-w-6xl grid-cols-2 items-center gap-x-8 gap-y-10 sm:grid-cols-3 lg:grid-cols-5">
          {wordmarkTiles.slice(0, 4).map((tile) => (
            <li key={tile.name} className={logoTileClass}>
              <Image
                src={tile.src}
                alt={tile.name}
                width={tile.w}
                height={tile.h}
                className="max-h-11 w-auto max-w-full object-contain"
              />
            </li>
          ))}

          {/* McKinsey & Company — typographic wordmark (no logo file
              supplied; see component comment). */}
          <li className={logoTileClass}>
            <span className="text-center font-serif text-20 font-semibold leading-tight tracking-tight text-white">
              McKinsey &amp; Company
            </span>
          </li>

          {wordmarkTiles.slice(4).map((tile) => (
            <li key={tile.name} className={logoTileClass}>
              <Image
                src={tile.src}
                alt={tile.name}
                width={tile.w}
                height={tile.h}
                className={
                  "tall" in tile && tile.tall
                    ? "max-h-16 w-auto max-w-full object-contain"
                    : "h-12 w-12 rounded-xl object-cover"
                }
              />
            </li>
          ))}

          {iconTiles.map((tile) => (
            <li
              key={tile.name}
              className="flex flex-col items-center gap-3 opacity-80 transition-opacity duration-300 hover:opacity-100"
            >
              <Image
                src={tile.src}
                alt=""
                width={96}
                height={96}
                className="h-12 w-12 rounded-xl object-contain"
              />
              <span className="text-center text-13 font-medium leading-tight text-white/60">
                {tile.name}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
