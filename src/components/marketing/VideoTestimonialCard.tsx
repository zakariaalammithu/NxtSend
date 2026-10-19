"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Play, X } from "lucide-react";

/**
 * Video testimonial card for the Home / Agency testimonial walls.
 *
 * Batch 2: the walls previously rendered these five video reviews as
 * bare play-glyph cards with no imagery. The reviewer photos, video
 * thumbnails and Vimeo IDs are the same person's real assets already
 * used by the Avatars/Demo wall (AvatarsWall.tsx, decoded from the
 * avatars mirror's serialized state) — each photo/thumbnail is used
 * only on that person's own card. Clicking opens the video in the
 * same overlay player pattern as AvatarsWall.
 */

export interface VideoTestimonial {
  name: string;
  role: string;
  photo: string;
  thumbnail: string;
  videoId: string;
}

export function VideoTestimonialCard({
  testimonial,
}: {
  testimonial: VideoTestimonial;
}) {
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Play video testimonial: ${testimonial.name}`}
        className="glass-card group relative cursor-pointer overflow-hidden p-2 text-left"
      >
        <span className="relative block overflow-hidden rounded-2xl">
          <Image
            src={testimonial.thumbnail}
            alt={`${testimonial.name} video testimonial`}
            width={1400}
            height={1216}
            className="aspect-[4/3] w-full object-cover"
          />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-brand text-white shadow-glow-purple transition-transform group-hover:scale-110">
              <Play className="h-5 w-5 fill-white text-white" />
            </span>
          </span>
        </span>
        <span className="flex items-center gap-3 px-4 py-4">
          <Image
            src={testimonial.photo}
            alt={testimonial.name}
            width={44}
            height={44}
            className="h-11 w-11 rounded-full object-cover"
          />
          <span>
            <span className="block text-15 font-bold text-white">
              {testimonial.name}
            </span>
            <span className="block text-12 text-black-400">
              {testimonial.role}
            </span>
          </span>
        </span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`${testimonial.name} — video testimonial`}
        >
          <div
            className="w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-4">
              <p className="text-16 font-semibold text-white">
                {testimonial.name} — {testimonial.role}
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
                src={`https://player.vimeo.com/video/${testimonial.videoId}?autoplay=1`}
                title={`${testimonial.name} video testimonial`}
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
