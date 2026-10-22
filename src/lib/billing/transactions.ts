/**
 * Admin transactions mapping — one `billing_events` row (a verified
 * Stripe event, stored by the webhook handler) → one display row for
 * Admin → Billing → Transactions.
 *
 * Honesty rules:
 *  - Amounts/statuses come only from the stored verified payload.
 *  - A `charge.refunded` event is shown as a REFUND of the refunded
 *    amount — never as fresh revenue at the charge's full amount with
 *    a "succeeded" status (the generic mapping would do exactly
 *    that, because a refunded Charge object still carries
 *    amount/status of the original charge). Partial refunds are
 *    labelled "partially_refunded".
 *  - Disputes are labelled as disputes, with the outcome
 *    (won/lost) once `charge.dispute.closed` arrives.
 */

export interface BillingTransaction {
  id: string;
  provider: string;
  event_type: string;
  amount: number | null;
  currency: string | null;
  status: string | null;
  processed_at: string;
}

export interface BillingEventRowLike {
  event_id: unknown;
  provider: unknown;
  event_type: unknown;
  payload: unknown;
  processed_at: unknown;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function centsToMajor(value: unknown): number | null {
  return typeof value === "number" ? value / 100 : null;
}

export function mapBillingEventToTransaction(
  row: BillingEventRowLike
): BillingTransaction {
  const payload = asRecord(row.payload);
  const data = asRecord(payload.data);
  const object = asRecord(data.object);
  const eventType = String(row.event_type);

  let amount = centsToMajor(
    object.amount_total ?? object.amount_paid ?? object.amount
  );
  let status =
    typeof object.status === "string" ? (object.status as string) : null;

  if (eventType === "charge.refunded") {
    // The payload object is the Charge: `amount` is the ORIGINAL
    // charge amount, `amount_refunded` is what went back. Show the
    // refund, labelled as one.
    const refunded = centsToMajor(object.amount_refunded);
    if (refunded !== null) amount = refunded;
    const original = centsToMajor(object.amount);
    status =
      refunded !== null && original !== null && refunded < original
        ? "partially_refunded"
        : "refunded";
  } else if (eventType === "charge.dispute.created") {
    amount = centsToMajor(object.amount);
    status = "disputed";
  } else if (eventType === "charge.dispute.closed") {
    amount = centsToMajor(object.amount);
    if (status === "won") status = "dispute_won";
    else if (status === "lost") status = "dispute_lost";
  }

  return {
    id: String(row.event_id),
    provider: String(row.provider ?? "stripe"),
    event_type: eventType,
    amount,
    currency: typeof object.currency === "string" ? object.currency : null,
    status,
    processed_at: String(row.processed_at),
  };
}
