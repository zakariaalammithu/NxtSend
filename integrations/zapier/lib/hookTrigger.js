'use strict';

const { apiUrl } = require('./api');
const { envelopeOutputFields } = require('./fields');
const { sampleEnvelope } = require('./samples');

/**
 * Build a REST Hook ("Instant") trigger for one real webhook event.
 *
 * Delivery is best-effort immediate + cron retry (NOT
 * instant-guaranteed — the descriptions say so). There is no
 * subscription-confirmation handshake: `performSubscribe` POSTs
 * `{event, target_url}` (Zapier's per-Zap `bundle.targetUrl`) and
 * the server returns `{id, event, target_url}`; Zapier stores
 * that as `subscribeData`, and `performUnsubscribe` posts
 * `{id}` back. `perform` returns the cleaned webhook body
 * (the server envelope `{id, type, created_at, workspace_id,
 * data}`) as a one-item array. `performList` returns the sample
 * envelope so the editor can be built without a live event.
 *
 * `data__*` output fields use Zapier's `__` convention for nested
 * keys (`data__email` reads `item.data.email`). Entity fields
 * inside `data` are camelCase (the API's entity convention —
 * `firstName`, `idempotencyKey`), while envelope/system fields are
 * snake_case (`workspace_id`, `created_at`).
 */
const buildHookTrigger = ({
  key,
  noun,
  label,
  description,
  event,
  dataOutputFields,
  sampleData,
}) => {
  const sample = sampleEnvelope(event, sampleData);
  return {
    key,
    noun,
    display: {
      label,
      description,
      hidden: false,
    },
    operation: {
      type: 'hook',
      performSubscribe: async (z, bundle) => {
        const response = await z.request({
          url: apiUrl('/webhooks/subscribe'),
          method: 'POST',
          body: { event, target_url: bundle.targetUrl },
        });
        return response.json;
      },
      performUnsubscribe: async (z, bundle) => {
        // The server's unsubscribe is idempotent, but an unknown id
        // still returns 404 — treat that as already-unsubscribed
        // (success) so turning a Zap off never fails on a stale id.
        try {
          const response = await z.request({
            url: apiUrl('/webhooks/unsubscribe'),
            method: 'POST',
            body: { id: bundle.subscribeData.id },
          });
          return response.json;
        } catch (error) {
          if (/404/.test(error.message || '')) {
            return { id: bundle.subscribeData.id, unsubscribed: true };
          }
          throw error;
        }
      },
      perform: async (z, bundle) => [bundle.cleanedRequest],
      performList: async (z, bundle) => [sample],
      sample,
      outputFields: [...envelopeOutputFields, ...dataOutputFields],
    },
  };
};

module.exports = { buildHookTrigger };
