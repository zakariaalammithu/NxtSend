import Image from "next/image";

/**
 * Hero visual for the demo page (mirror: aimfox.com/demo).
 *
 * The mirror hero placed a click-to-play product video under the
 * headline. That recording belongs to the mirror product, so it is
 * not carried over: this slot now shows a static product visual
 * instead, using the kept abstract artwork from
 * public/images/demo/. The component name and export are unchanged
 * so the page layout slot stays the same, and the slot can take an
 * owner-supplied NxtSend recording later if one is produced.
 */
export function DemoHeroVideo() {
  return (
    <figure className="relative flex w-full max-w-[1200px] flex-col items-center justify-center overflow-hidden rounded-3xl border border-white bg-black-100 shadow-2xl backdrop-blur-sm md:rounded-7xl">
      <Image
        src="/images/demo/hero.webp"
        alt="NxtSend outreach workspace"
        width={1200}
        height={788}
        className="w-full object-cover"
      />
      <figcaption className="w-full bg-black-900 px-6 py-4 text-center text-14 font-medium text-white/80">
        A look inside the NxtSend workspace — campaigns, inboxes and
        follow-ups side by side.
      </figcaption>
    </figure>
  );
}
