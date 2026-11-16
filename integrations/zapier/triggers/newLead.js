'use strict';

const { fetchList, sortDesc } = require('../lib/api');
const { leadOutputFields } = require('../lib/fields');
const { sampleLead } = require('../lib/samples');

/**
 * POLLING trigger — "New Lead".
 * Zapier polls GET /v1/leads (newest first, up to 100 per poll)
 * and dedups on the stable lead `id`. Latency is your Zapier
 * plan's polling interval (minutes), NOT instant — use
 * "New Lead (Instant)" for webhook delivery.
 */
const perform = async (z, bundle) => {
  const leads = await fetchList(z, '/leads');
  return sortDesc(leads, 'created_at').slice(0, 100);
};

module.exports = {
  key: 'new_lead',
  noun: 'Lead',
  display: {
    label: 'New Lead',
    description:
      'Triggers when a new lead is created in your workspace. Polling: Zapier checks for new leads on your plan’s polling interval (minutes), not instantly.',
    hidden: false,
  },
  operation: {
    type: 'polling',
    perform,
    sample: sampleLead,
    outputFields: leadOutputFields,
  },
};
