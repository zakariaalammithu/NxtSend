"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Play, Star, X } from "lucide-react";

/**
 * Testimonial wall (mirror: aimfox.com/avatars — "Loved by agencies,
 * sales teams & GTM experts").
 *
 * All 16 reviews below — titles, texts, names, titles, reviewer photos,
 * video thumbnails and Vimeo video IDs — are decoded from the mirror's
 * serialized page state (ZIP 4) and reproduced in the mirror's own
 * sort order (text and video reviews interleaved). Review-platform
 * outbound links (G2 / Capterra / Trustpilot review URLs in the mirror
 * data) are not carried over, matching the homepage wall. On the
 * mirror, clicking a video review opens its video in an overlay
 * player; the same behaviour is reproduced here.
 */

interface TextReview {
  kind: "text";
  title: string;
  quote: string;
  name: string;
  role: string;
  photo: string;
}

interface VideoReview {
  kind: "video";
  name: string;
  role: string;
  photo: string;
  thumbnail: string;
  videoId: string;
}

type Review = TextReview | VideoReview;

const reviews: Review[] = [
  {
    kind: "text",
    title: "Watch out Expandi! You have competition",
    quote:
      "I tried both Expandi and Aimfox—Expandi was unresponsive, while Aimfox impressed me with fast, helpful support.",
    name: "Adrian D.",
    role: "Head of Growth",
    photo: "/images/avatars/reviews/adrian-d.jpg",
  },
  {
    kind: "text",
    title: "Event campaigns are a game changer!",
    quote:
      "Can't express how annoying it is to do Linkedin outreach manually. I'd give it up if not for Aimfox. I find Linkedin event campaigns most useful. Just paste the event link and get the leads on autopilot!",
    name: "Oleg D.",
    role: "CMO at Maildoso",
    photo: "/images/avatars/reviews/oleg-d.jpg",
  },
  {
    kind: "video",
    name: "Bryan Seton",
    role: "Partner",
    photo: "/images/avatars/reviews/bryan-seton.jpg",
    thumbnail: "/images/avatars/reviews/bryan-seton-thumb.webp",
    videoId: "1118790353",
  },
  {
    kind: "text",
    title: "Awesome toolkit for LinkedIn outreach",
    quote:
      "I love how Aimfox combines a great UI with smart features that keep LinkedIn use safe, like geo-based IP and proxy selection.",
    name: "Luca P.",
    role: "Founder",
    photo: "/images/avatars/reviews/luca-p.jpg",
  },
  {
    kind: "text",
    title: "The LinkedIn tool that makes life easier",
    quote:
      "I’ve tried many LinkedIn tools, but Aimfox stands out—it’s easy to set up, has great support, and just works. It’s been a game-changer for my lead generation.",
    name: "Alex S.",
    role: "Consulting",
    photo: "/images/avatars/reviews/alex-s.jpg",
  },
  {
    kind: "text",
    title: "Unmatched customer support!",
    quote: "The BEST cold outreach tool by far!!! Switched from Lemlist...",
    name: "Tyrone D.",
    role: "Coach",
    photo: "/images/avatars/reviews/tyrone-d.jpg",
  },
  {
    kind: "video",
    name: "Jay Feldman",
    role: "Founder",
    photo: "/images/avatars/reviews/jay-feldman.jpg",
    thumbnail: "/images/avatars/reviews/jay-feldman-thumb.webp",
    videoId: "1118790843",
  },
  {
    kind: "text",
    title: "Scaling made easy and stellar support",
    quote:
      "I love using Aimfox with my SDR team—it helps us scale outreach, stay engaged beyond email, and with Ksenija’s ongoing support and expertise, it’s been an invaluable tool I highly recommend.",
    name: "Charlotte Jackson",
    role: "SDR Team Lead",
    photo: "/images/avatars/reviews/charlotte-jackson.jpg",
  },
  {
    kind: "text",
    title: "The app is built on user feedback",
    quote:
      "I was a bit frustrated at first, but the team came through fast with a fix and totally turned things around—I’m genuinely impressed!",
    name: "Nick Lazarev",
    role: "Lead-Gen specialist",
    photo: "/images/avatars/reviews/nick-lazarev.jpg",
  },
  {
    kind: "video",
    name: "Dave Menjura",
    role: "CRO",
    photo: "/images/avatars/reviews/dave-menjura.jpg",
    thumbnail: "/images/avatars/reviews/dave-menjura-thumb.webp",
    videoId: "1118790539",
  },
  {
    kind: "text",
    title: "Only tool that let's you natively rent profiles",
    quote:
      "As an early adopter of Aimfox, I'm genuinely impressed with the platform's potential. It offers some truly unique features that set it apart from other LinkedIn automation tools I've tried.",
    name: "Vinod Krisshna",
    role: "Outbound Agency",
    photo: "/images/avatars/reviews/vinod-krisshna.jpg",
  },
  {
    kind: "video",
    name: "Balsa Kosic",
    role: "COO",
    photo: "/images/avatars/reviews/balsa-kosic.jpg",
    thumbnail: "/images/avatars/reviews/balsa-kosic-thumb.webp",
    videoId: "1118790221",
  },
  {
    kind: "text",
    title: "Best customer support experience I ever had",
    quote:
      "It’s rare to find customer service this good—she was friendly, patient, and really knew her stuff. If you’re on the fence about AimFox, their customer service alone makes it worth it!",
    name: "Jessica Presco",
    role: "Customer support",
    photo: "/images/avatars/reviews/jessica-presco.jpg",
  },
  {
    kind: "text",
    title: "Effective Tool for Generating Leads",
    quote:
      "I have tested other solutions, and Aimfox has been the most effective in helping me schedule more meetings with new leads. Switched from Doux-soup",
    name: "Leandro G.",
    role: "Lead Gen",
    photo: "/images/avatars/reviews/leandro-g.jpg",
  },
  {
    kind: "video",
    name: "Roy Ripper",
    role: "CEO",
    photo: "/images/avatars/reviews/roy-ripper.jpg",
    thumbnail: "/images/avatars/reviews/roy-ripper-thumb.webp",
    videoId: "1118790702",
  },
  {
    kind: "text",
    title: "Best value-for-money in class!",
    quote:
      "Aimfox is a genuine GAME CHANGER! And the price is a steal.. Switched from Dripify...",
    name: "Roy R.",
    role: "CEO and Founder",
    photo: "/images/avatars/reviews/roy-r.jpg",
  },
];

export function AvatarsWall() {
  const [active, setActive] = useState<VideoReview | null>(null);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActive(null);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [active]);

  return (
    <>
      <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {reviews.map((review) =>
          review.kind === "text" ? (
            <div
              key={review.name}
              className="glass-card-hover flex flex-col justify-between p-8"
            >
              <div>
                <div className="flex items-center gap-1 text-orange-500">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className="h-4 w-4 fill-orange-500 text-orange-500"
                    />
                  ))}
                </div>
                <h3 className="mt-5 text-18 leading-snug font-bold text-white">
                  {review.title}
                </h3>
                <p className="mt-3 text-14 leading-relaxed text-black-300">
                  {review.quote}
                </p>
              </div>
              <div className="mt-8 flex items-center gap-3 border-t border-black-700/80 pt-5">
                <Image
                  src={review.photo}
                  alt={review.name}
                  width={44}
                  height={44}
                  className="h-11 w-11 rounded-full object-cover"
                />
                <div>
                  <div className="text-15 font-bold text-white">
                    {review.name}
                  </div>
                  <div className="text-12 text-black-400">{review.role}</div>
                </div>
              </div>
            </div>
          ) : (
            <button
              key={review.name}
              type="button"
              onClick={() => setActive(review)}
              aria-label={`Play video testimonial: ${review.name}`}
              className="glass-card group relative cursor-pointer overflow-hidden p-2 text-left"
            >
              <span className="relative block overflow-hidden rounded-2xl">
                <Image
                  src={review.thumbnail}
                  alt={`${review.name} video testimonial`}
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
                  src={review.photo}
                  alt={review.name}
                  width={44}
                  height={44}
                  className="h-11 w-11 rounded-full object-cover"
                />
                <span>
                  <span className="block text-15 font-bold text-white">
                    {review.name}
                  </span>
                  <span className="block text-12 text-black-400">
                    {review.role}
                  </span>
                </span>
              </span>
            </button>
          ),
        )}
      </div>

      {/* Video player (mirror: video reviews open in an overlay) */}
      {active ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setActive(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`${active.name} — video testimonial`}
        >
          <div
            className="w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-4">
              <p className="text-16 font-semibold text-white">
                {active.name} — {active.role}
              </p>
              <button
                type="button"
                aria-label="Close video"
                onClick={() => setActive(null)}
                className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-white/20 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black">
              <iframe
                src={`https://player.vimeo.com/video/${active.videoId}?autoplay=1`}
                title={`${active.name} video testimonial`}
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
