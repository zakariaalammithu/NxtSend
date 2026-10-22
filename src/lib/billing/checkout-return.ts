/**
 * Post-checkout return notices for /dashboard/billing (P9 B2).
 *
 * Stripe returns the browser to /dashboard/billing?checkout=success
 * or ?checkout=cancelled after Checkout. The redirect is NOT proof
 * of payment: plans change only when the signature-verified webhook
 * confirms the subscription. The success copy therefore says the
 * plan updates once the webhook confirms — never "payment
 * successful, plan active" — and the cancelled copy states plainly
 * that nothing was charged.
 */

export interface CheckoutReturnNotice {
  tone: "success" | "info";
  text: string;
}

export function checkoutReturnNotice(
  param: string | null | undefined
): CheckoutReturnNotice | null {
  if (param === "success") {
    return {
      tone: "success",
      text: "Checkout complete — thank you. Your plan updates as soon as Stripe confirms the payment through our webhook (usually a few seconds); the redirect by itself never changes a plan. If your plan hasn't updated shortly, refresh this page.",
    };
  }
  if (param === "cancelled") {
    return {
      tone: "info",
      text: "Checkout cancelled — nothing was charged and your plan is unchanged.",
    };
  }
  return null;
}

/** The billing URL with the checkout param removed (for history.replaceState). */
export function billingUrlWithoutCheckoutParam(
  pathname: string,
  search: string
): string {
  const params = new URLSearchParams(search);
  params.delete("checkout");
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
