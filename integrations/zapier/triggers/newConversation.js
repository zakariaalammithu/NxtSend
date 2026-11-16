'use strict';

const { fetchList, sortDesc } = require('../lib/api');
const { conversationOutputFields } = require('../lib/fields');
const { sampleConversation } = require('../lib/samples');

/**
 * POLLING trigger — "New Conversation".
 * Polls GET /v1/conversations (newest first, up to 100 per poll),
 * dedups on the stable conversation `id`. Polling latency is your
 * Zapier plan's interval — use "New Reply (Instant)" for
 * webhook delivery of replies inside a conversation.
 */
const perform = async (z, bundle) => {
  const conversations = await fetchList(z, '/conversations');
  return sortDesc(conversations, 'created_at').slice(0, 100);
};

module.exports = {
  key: 'new_conversation',
  noun: 'Conversation',
  display: {
    label: 'New Conversation',
    description:
      'Triggers when a new inbox conversation starts in your workspace. Polling: Zapier checks on your plan’s polling interval (minutes), not instantly.',
    hidden: false,
  },
  operation: {
    type: 'polling',
    perform,
    sample: sampleConversation,
    outputFields: conversationOutputFields,
  },
};
