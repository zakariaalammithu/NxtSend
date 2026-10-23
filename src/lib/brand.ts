/**
 * NxtSend brand constants — the single source of truth for the brand name,
 * tagline and mark assets. The mark itself (public/logo.svg + public/logo.png)
 * is the owner's official two-tone symbol (coral #FB7352 over blue #0564F5),
 * replaced 2026-10-23. Render it through src/components/brand/Logo.tsx;
 * data consumers (e.g. the integrations mosaic) use the path constants here.
 */
export const BRAND_NAME = "NxtSend";

/** Official tagline (owner-supplied, P10). Consumed by the Footer. */
export const BRAND_TAGLINE = "Move Forward. Connect Faster.";

/** Primary mark asset: the two-path vector (coral + blue). */
export const BRAND_MARK_SRC = "/logo.svg";

/** Raster mark asset: transparent PNG fallback and data-path consumers. */
export const BRAND_MARK_PNG_SRC = "/logo.png";

/** Canonical mark colours (measured from the owner's source artwork). */
export const BRAND_COLOR_CORAL = "#FB7352";
export const BRAND_COLOR_BLUE = "#0564F5";
