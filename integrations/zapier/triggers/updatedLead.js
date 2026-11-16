'use strict';

const { fetchList, sortDesc } = require('../lib/api');
const { leadOutputFields } = require('../lib/fields');
const { sampleLead } = require('../lib/samples');

/**
 * POLLING trigger — "Lead Updated".
 * Polls GET /v1/leads with `order=updated_at_desc` (the server
 * orders by updated_at, falling back to created_at) and fires
 * once per distinct `updated_at`.
 *
 * Dedupe needs a composite id: the stable lead id alone would
 * never re-fire for an update, so the item `id` is
 * `<leadId>__<updated_at>` and the original lead id is carried in
 * `lead_id` (use that in later steps). An update that sets the
 * same `updated_at` twice fires once; a lead updated outside the
 * most recent 100 leads is not seen until it re-enters that
 * window — use "Lead Updated (Instant)" for guaranteed delivery.
 */
const withCompositeId = (lead) => ({
  ...lead,
  id: `${lead.id}__${lead.updated_at || lead.created_at || ''}`,
  lead_id: lead.id,
});

const perform = async (z, bundle) => {
  const leads = await fetchList(z, '/leads', { order: 'updated_at_desc' });
  return sortDesc(leads, 'updated_at').slice(0, 100).map(withCompositeId);
};

const sample = withCompositeId(sampleLead);

module.exports = {
  key: 'updated_lead',
  noun: 'Lead',
  display: {
    label: 'Lead Updated',
    description:
      'Triggers when a lead is updated in your workspace. Polling: Zapier checks on your plan’s polling interval. The item ID is the lead ID plus its update time, so each update fires once; the original lead ID is in the “Lead ID” field.',
    hidden: false,
  },
  operation: {
    type: 'polling',
    perform,
    sample,
    outputFields: [
      { key: 'id', label: 'Update ID', type: 'string', primary: true },
      { key: 'lead_id', label: 'Lead ID', type: 'string' },
      ...leadOutputFields.filter((field) => field.key !== 'id'),
    ],
  },
};
