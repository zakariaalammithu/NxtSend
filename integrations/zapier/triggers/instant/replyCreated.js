'use strict';

const { buildHookTrigger } = require('../../lib/hookTrigger');

/**
 * INSTANT trigger — "New Reply (Instant)"
 * (`conversation.reply_created`). Email channel ONLY — LinkedIn
 * replies stay refused until an authorized provider exists, so
 * no LinkedIn reply event is emitted. No polling equivalent
 * exists: there is no list endpoint for replies, so this event
 * is only available as a webhook. Delivery is best-effort
 * immediate + cron retry, NOT instant-guaranteed. Event data is
 * the server's emit payload (`zapierSendReply`):
 * `{source, conversationId, messageId, duplicate}`. Note: the
 * server emits this only for dashboard + Zapier replies —
 * MCP-tool and scheduled-reply sends do not emit yet.
 */
module.exports = buildHookTrigger({
  key: 'new_reply_instant',
  noun: 'Reply',
  label: 'New Reply (Instant)',
  description:
    'Triggers when an inbox reply is sent in a conversation. Email channel only — LinkedIn replies are not available. Delivered instantly by webhook (best-effort immediate delivery with retry — not instant-guaranteed).',
  event: 'conversation.reply_created',
  dataOutputFields: [
    { key: 'data__source', label: 'Source', type: 'string' },
    { key: 'data__conversationId', label: 'Conversation ID', type: 'string' },
    { key: 'data__messageId', label: 'Message ID', type: 'string' },
    { key: 'data__duplicate', label: 'Duplicate Replay', type: 'boolean' },
  ],
  sampleData: {
    source: 'zapier_api',
    conversationId: 'conversation_sample_01',
    messageId: 'reply_sample_01',
    duplicate: false,
  },
});
