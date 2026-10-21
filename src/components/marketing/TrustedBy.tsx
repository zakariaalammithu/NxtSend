import Image from "next/image";

/**
 * Trusted-by logo wall (P6, owner-directed).
 *
 * The heading wording and every logo are supplied by the owner
 * (~/workspace/nxtsend-work/p6-assets/company-logos). Logos are shown
 * exactly as supplied — normalised only for canvas trim — on uniform
 * light tiles so baked-background files read as one system on the
 * dark page. No ratings, quotes or extra claims are added.
 *
 * Asset notes:
 * - Wordmark files (the image already contains the company name):
 *   HubSpot (canvas trimmed), Clay, Pavilion, Instantly, Flip
 *   Electronics, Indoorcare, XBag.
 * - Icon-only files get a caption label with the company name.
 * - McKinsey: the supplied file contained abstract artwork, not a
 *   logo, so the brand is rendered as a typographic name tile rather
 *   than faking a logo.
 */
const wordmarkTiles = [
  { name: "HubSpot", src: "/images/logos/hubspot.png", w: 900, h: 303 },
  { name: "Clay", src: "/images/logos/clay.png", w: 829, h: 467 },
  { name: "Pavilion", src: "/images/logos/pavilion.png", w: 701, h: 285 },
  { name: "Instantly", src: "/images/logos/instantly.jpg", w: 385, h: 108 },
  { name: "Flip Electronics", src: "/images/logos/flip-electronics.jpg", w: 410, h: 150 },
  { name: "Indoorcare", src: "/images/logos/indoorcare.jpg", w: 131, h: 167 },
  { name: "XBag", src: "/images/logos/xbag.jpg", w: 200, h: 200 },
] as const;

const iconTiles = [
  { name: "LinkedIn", src: "/images/logos/linkedin.jpg" },
  { name: "Sandler Training", src: "/images/logos/sandler-training.jpg" },
  { name: "Spacebar Studios", src: "/images/logos/spacebar-studios.jpg" },
  { name: "ContactReachout", src: "/images/logos/contactreachout.png" },
  { name: "BizReviewRadar", src: "/images/logos/bizreviewradar.png" },
  { name: "nsave", src: "/images/logos/nsave.png" },
] as const;

const tileClass =
  "flex h-28 flex-col items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.35)] ring-1 ring-black/5";

export function TrustedBy() {
  return (
    <section
      aria-label="Trusted by outreach experts"
      className="relative border-t border-black-700/80 py-16 lg:py-20"
    >
      <div className="section-container">
        <h2 className="text-center text-24 sm:text-30 font-bold tracking-tight text-white">
          Trusted by more than 3,000 outreach experts
        </h2>

        <ul className="mx-auto mt-10 grid max-w-6xl grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
          {wordmarkTiles.slice(0, 4).map((tile) => (
            <li key={tile.name} className={tileClass}>
              <Image
                src={tile.src}
                alt={tile.name}
                width={tile.w}
                height={tile.h}
                className="max-h-14 w-auto max-w-full object-contain"
              />
            </li>
          ))}

          {/* McKinsey & Company — typographic tile (supplied file was
              abstract artwork, not a logo; see component comment). */}
          <li className={tileClass}>
            <span className="text-center font-serif text-18 font-semibold leading-tight tracking-tight text-[#0b1f4a]">
              McKinsey &amp; Company
            </span>
          </li>

          {wordmarkTiles.slice(4).map((tile) => (
            <li key={tile.name} className={tileClass}>
              <Image
                src={tile.src}
                alt={tile.name}
                width={tile.w}
                height={tile.h}
                className="max-h-14 w-auto max-w-full object-contain"
              />
            </li>
          ))}

          {iconTiles.map((tile) => (
            <li key={tile.name} className={tileClass}>
              <Image
                src={tile.src}
                alt=""
                width={96}
                height={96}
                className="h-10 w-10 rounded-lg object-cover"
              />
              <span className="text-center text-12 font-semibold leading-tight text-black-700">
                {tile.name}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
