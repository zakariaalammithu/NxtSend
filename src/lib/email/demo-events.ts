/**
 * Demo email-event log (P5 Stage D).
 *
 * Live mode's webhook log is the `email_events` table — including
 * `email.received` deliveries that matched NOTHING (unrouted mail is
 * recorded there before ingestion runs). Demo mode has no such table,
 * and unrouted mail leaves no message behind to derive an event from,
 * so demo received-mail simulations are recorded in this demo
 * collection instead (`nxtsend_demo_email_events_v1`, through the
 * shared demo-store persistence). The deliverability loaders merge
 * these recorded events with the events derived from demo message
 * statuses; recorded events win on a (type, provider message id)
 * collision because they know their routing outcome.
 *
 * Everything here is demo data and is labelled simulated end-to-end.
 */

import { loadDemoCollection, saveDemoCollection } from "@/lib/data/demo-store";
import { generateId } from "@/lib/utils";
import type { EmailEventRecord } from "./events-core";

export const DEMO_EMAIL_EVENTS_KEY = "nxtsend_demo_email_events_v1";

export interface DemoEmailEventRecord extends EmailEventRecord {
  /** Routing outcome for email.received records, when known. */
  routing?: "routed" | "unrouted";
  /** The sender/recipient line for the admin log detail column. */
  detail?: string | null;
}

export function listDemoEmailEvents(): DemoEmailEventRecord[] {
  return loadDemoCollection<DemoEmailEventRecord>(DEMO_EMAIL_EVENTS_KEY, () => []);
}

export function recordDemoEmailEvent(
  input: Omit<DemoEmailEventRecord, "provider_event_id" | "received_at"> & {
    provider_event_id?: string;
    received_at?: string;
  }
): DemoEmailEventRecord {
  const record: DemoEmailEventRecord = {
    provider_event_id: input.provider_event_id ?? `demo-ev-log-${generateId()}`,
    event_type: input.event_type,
    provider_message_id: input.provider_message_id,
    payload: input.payload,
    routing: input.routing,
    detail: input.detail ?? null,
    received_at: input.received_at ?? new Date().toISOString(),
  };
  saveDemoCollection(DEMO_EMAIL_EVENTS_KEY, [record, ...listDemoEmailEvents()]);
  return record;
}
