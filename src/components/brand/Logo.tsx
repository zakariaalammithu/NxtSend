"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { BRAND_MARK_PNG_SRC, BRAND_MARK_SRC, BRAND_NAME } from "@/lib/brand";

export interface LogoProps {
  /** "mark" renders the symbol only; "lockup" adds the wordmark. */
  variant?: "mark" | "lockup";
  /** Mark height in px. Width follows the mark's aspect (0.8811). */
  size?: number;
  /** Classes for the wrapper (gap, alignment, transitions). */
  className?: string;
  /** Typography classes for the wordmark (size/weight per surface). */
  wordmarkClassName?: string;
  /**
   * Render "Send" in the brand gradient (auth / dashboard / admin / 404
   * chrome). Marketing chrome uses the plain wordmark.
   */
  wordmarkGradient?: boolean;
  alt?: string;
}

/**
 * The one NxtSend logo. Renders the official two-tone mark (coral #FB7352 /
 * blue #0564F5) from /logo.svg, falling back to /logo.png and finally to the
 * gradient initial block — the wordmark stays visible at every stage, so a
 * missing asset never leaves a surface unbranded. The component does not
 * render its own link; callers keep ownership of navigation and layout.
 */
export function Logo({
  variant = "lockup",
  size = 32,
  className,
  wordmarkClassName,
  wordmarkGradient = false,
  alt = BRAND_NAME,
}: LogoProps) {
  // 0 = vector, 1 = raster, 2 = initial block
  const [stage, setStage] = useState(0);

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      {stage < 2 ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={stage === 0 ? BRAND_MARK_SRC : BRAND_MARK_PNG_SRC}
          alt={alt}
          style={{ height: size }}
          className="w-auto shrink-0 object-contain"
          onError={() => setStage((s) => s + 1)}
        />
      ) : (
        <span
          aria-hidden="true"
          style={{
            width: size,
            height: size,
            borderRadius: Math.max(6, Math.round(size * 0.28)),
            fontSize: Math.round(size * 0.44),
          }}
          className="flex shrink-0 items-center justify-center bg-gradient-brand font-extrabold text-white shadow-sm"
        >
          N
        </span>
      )}
      {variant === "lockup" && (
        <span
          className={cn(
            "font-bold tracking-tight text-white",
            wordmarkClassName
          )}
        >
          {wordmarkGradient ? (
            <>
              Nxt<span className="text-gradient-brand">Send</span>
            </>
          ) : (
            BRAND_NAME
          )}
        </span>
      )}
    </span>
  );
}
