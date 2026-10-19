"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { X } from "lucide-react";

/**
 * Hero video (mirror: aimfox.com/demo).
 *
 * The mirror hero shows a video player under the headline: a thumbnail
 * with Aimfox's play-button artwork; clicking opens a dialog player.
 * The video ID (1138006557) is decoded from the mirror's serialized
 * page state, following the same modal pattern as the academy and
 * avatars pages. Thumbnail and play-button artwork are the mirror's
 * own assets, copied into public/images/demo/.
 */
const DEMO_VIDEO_ID = "1138006557";

export function DemoHeroVideo() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open ]);

  return (
    <>
      <div className="relative flex w-full max-w-[1200px] items-center justify-center overflow-hidden rounded-3xl border border-white bg-black-100 shadow-2xl backdrop-blur-sm md:rounded-7xl">
        <Image
          src="/images/demo/hero-video-thumbnail.webp"
          alt="Aimfox demo video"
          width={1200}
          height={788}
          className="w-full object-cover"
        />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Play demo video"
          className="group absolute inset-0 flex cursor-pointer items-center justify-center"
        >
          <Image
            src="/images/demo/play-button.webp"
            alt=""
            width={661}
            height={661}
            className="size-26 transition-transform duration-300 group-hover:scale-105 xl:size-[10.375rem]"
          />
        </button>
      </div>

      {/* Video player (mirror: the hero video opens in a dialog) */}
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Aimfox demo video"
        >
          <div
            className="w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-4">
              <p className="text-16 font-semibold text-white">
                Discover how to automate LinkedIn Outreach
              </p>
              <button
                type="button"
                aria-label="Close video"
                onClick={() => setOpen(false)}
                className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-white/20 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black">
              <iframe
                src={`https://player.vimeo.com/video/${DEMO_VIDEO_ID}?autoplay=1`}
                title="Aimfox demo video"
                className="size-full"
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
