'use strict';

const { buildHookTrigger } = require('../../lib/hookTrigger');

/**
 * INSTANT trigger — "Subscription Changed (Instant)"
 * (`subscription.changed`). Fires when a Stripe subscription
 * mutation is applied to the workspace (plan/status). No polling
 * equivalent exists: there is no list endpoint for subscription
 * changes, so this event is only available as a webhook.
 * Delivery is best-effort immediate + cron retry, NOT
 * instant-guaranteed. Event data is the server's emit payload
 * (Stripe webhook `onSubscriptionChanged`):
 * `{source, plan, status, stripeSubscriptionId,
 * stripeCustomerId}`.
 */
module.exports = buildHookTrigger({
  key: 'subscription_changed_instant',
  noun: 'Subscription',
  label: 'Subscription Changed (Instant)',
  description:
    'Triggers when your workspace’s subscription (plan or status) changes. Delivered instantly by webhook (best-effort immediate delivery with retry — not instant-guaranteed).',
  event: 'subscription.changed',
  dataOutputFields: [
    { key: 'data__source', label: 'Source', type: 'string' },
    { key: 'data__plan', label: 'Plan', type: 'string' },
    { key: 'data__status', label: 'Subscription Status', type: 'string' },
    { key: 'data__stripeSubscriptionId', label: 'Stripe Subscription ID', type: 'string' },
    { key: 'data__stripeCustomerId', label: 'Stripe Customer ID', type: 'string' },
  ],
  sampleData: {
    source: 'stripe_webhook',
    plan: 'pro',
    status: 'active',
    stripeSubscriptionId: 'sub_sample_01',
    stripeCustomerId: 'cus_sample_01',
  },
});
