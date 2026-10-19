/**
 * Server-side Stripe client (official SDK).
 *
 * Returns null unless STRIPE_SECRET_KEY holds a plausibly real value —
 * callers turn that into the honest "billing not configured" response.
 * The secret key is read from a server-only env var and this module must
 * never be imported from client components.
 */

import Stripe from "stripe";
import { isConfiguredValue } from "@/lib/env";

let cached: Stripe | null = null;

export function getStripeClient(): Stripe | null {
  if (!isConfiguredValue(process.env.STRIPE_SECRET_KEY)) return null;
  if (!cached) {
    cached = new Stripe(process.env.STRIPE_SECRET_KEY as string);
  }
  return cached;
}
