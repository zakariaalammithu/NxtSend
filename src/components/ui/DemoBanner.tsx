"use client";

import * as React from "react";
import Link from "next/link";
import { Zap, X, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DemoBannerProps {
  feature?: string;
  actionText?: string;
  actionHref?: string;
  className?: string;
  onDismiss?: () => void;
}

export const DemoBanner: React.FC<DemoBannerProps> = ({
  feature = "This service",
  actionText = "Connect →",
  actionHref = "/dashboard/integrations",
  className,
  onDismiss,
}) => {
  const [dismissed, setDismissed] = React.useState(true); // default true to avoid flash on SSR

  React.useEffect(() => {
    // Check if demo mode is active
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const isDemoMode =
      !supabaseUrl ||
      supabaseUrl === "https://your-project.supabase.co" ||
      process.env.NEXT_PUBLIC_DEMO_MODE === "true";

    if (!isDemoMode) {
      setDismissed(true);
      return;
    }

    // Check localStorage for dismissal
    const storageKey = `nxtsend_demo_dismissed_${feature.toLowerCase().replace(/\s+/g, "_")}`;
    const wasDismissed = window.localStorage.getItem(storageKey) === "true";
    setDismissed(wasDismissed);
  }, [feature]);

  const handleDismiss = () => {
    const storageKey = `nxtsend_demo_dismissed_${feature.toLowerCase().replace(/\s+/g, "_")}`;
    try {
      window.localStorage.setItem(storageKey, "true");
    } catch {
      // Ignore localStorage write failures (incognito / blocked)
    }
    setDismissed(true);
    onDismiss?.();
  };

  if (dismissed) return null;

  return (
    <aside
      role="status"
      aria-label="Demo mode announcement"
      className={cn(
        "sticky top-0 z-40 w-full bg-gradient-to-r from-orange-600/90 via-orange-500/90 to-yellow-600/90 backdrop-blur-md px-4 py-2.5 text-white shadow-lg border-b border-orange-400/30 transition-all",
        className
      )}
    >
      <div className="section-container flex items-center justify-between gap-4 text-13 font-medium">
        <div className="flex items-center gap-2 overflow-hidden">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20 text-white font-bold">
            <Zap className="h-3 w-3 fill-current" aria-hidden="true" />
          </span>
          <p className="truncate">
            <strong className="font-semibold">Demo Mode</strong>
            {" — "}
            <span className="text-white/95">{feature}</span> is not connected. No real action will occur.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Link
            href={actionHref}
            className="inline-flex items-center gap-1 rounded-full bg-black-900/60 hover:bg-black-900 px-3 py-1 text-12 font-semibold text-white transition-colors border border-white/20 hover:border-white/40"
          >
            <span>{actionText.replace("→", "").trim()}</span>
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Link>

          <button
            type="button"
            onClick={handleDismiss}
            className="rounded-full p-1 text-white/80 hover:text-white hover:bg-white/20 transition-colors"
            aria-label="Dismiss demo mode banner"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </aside>
  );
};

DemoBanner.displayName = "DemoBanner";

export default DemoBanner;
