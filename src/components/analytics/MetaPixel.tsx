"use client";

/**
 * Meta Pixel loader — consent-gated, env-driven, deduplicated.
 *
 * Behaviour:
 *  - No NEXT_PUBLIC_META_PIXEL_ID -> renders nothing, zero network.
 *  - Consent: fbevents is loaded ONLY after the visitor has granted
 *    marketing consent, recorded as localStorage
 *    `nxtsend_cookie_consent = "accepted"` (a future cookie banner sets
 *    this flag and dispatches `nxtsend:consent-granted`; until then the
 *    pixel stays off even when an ID is configured — see SETUP.md).
 *  - PageView fires once from the init snippet and once per client-side
 *    route change (pathname-guarded ref prevents duplicates).
 *  - Never fires on /dashboard or /admin routes.
 *  - No PII is ever sent: events carry no parameters by default.
 */

import * as React from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";
import {
  CONSENT_EVENT_NAME,
  CONSENT_GRANTED_VALUE,
  CONSENT_STORAGE_KEY,
  getMetaPixelId,
  isTrackedPath,
  type PixelEventName,
} from "@/lib/analytics/pixel";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

/**
 * Fires a typed conversion event when the pixel is loaded.
 * Safe to call anywhere: a no-op when the pixel is not configured,
 * consent was not granted, or fbq has not loaded yet.
 */
export function trackPixelEvent(
  event: Exclude<PixelEventName, "PageView">,
  params?: Record<string, unknown>,
  eventId?: string
): void {
  if (typeof window === "undefined" || typeof window.fbq !== "function") {
    return;
  }
  if (eventId) {
    window.fbq("track", event, params ?? {}, { eventID: eventId });
  } else if (params) {
    window.fbq("track", event, params);
  } else {
    window.fbq("track", event);
  }
}

function readConsent(): boolean {
  try {
    return window.localStorage.getItem(CONSENT_STORAGE_KEY) === CONSENT_GRANTED_VALUE;
  } catch {
    return false;
  }
}

export default function MetaPixel() {
  const pixelId = getMetaPixelId();
  const pathname = usePathname() ?? "/";
  const [consented, setConsented] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const lastPath = React.useRef<string | null>(null);

  React.useEffect(() => {
    setConsented(readConsent());
    const onGrant = () => setConsented(true);
    window.addEventListener(CONSENT_EVENT_NAME, onGrant);
    return () => window.removeEventListener(CONSENT_EVENT_NAME, onGrant);
  }, []);

  const active = Boolean(pixelId) && consented && isTrackedPath(pathname);

  // Route-change PageView, deduplicated by pathname. The initial
  // PageView comes from the init snippet below.
  React.useEffect(() => {
    if (!active || !loaded) return;
    if (lastPath.current === null) {
      lastPath.current = pathname;
      return;
    }
    if (lastPath.current !== pathname) {
      lastPath.current = pathname;
      window.fbq?.("track", "PageView");
    }
  }, [active, loaded, pathname]);

  if (!pixelId || !consented) return null;

  return (
    <Script
      id="meta-pixel"
      strategy="afterInteractive"
      onLoad={() => setLoaded(true)}
      dangerouslySetInnerHTML={{
        __html: `
          !function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '${pixelId}');
          fbq('track', 'PageView');
        `,
      }}
    />
  );
}
