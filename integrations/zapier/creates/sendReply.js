'use strict';

const { randomUUID } = require('crypto');
const { apiUrl } = require('../lib/api');
const { replyOutputFields } = require('../lib/fields');
const { sampleReply } = require('../lib/samples');

/**
 * CREATE — "Send Reply". EMAIL ONLY.
 * POST /v1/conversations/:id/replies with
 * `{content, subject?, idempotencyKey}`. A LinkedIn reply is
 * refused by the server with 422 — there is no authorized
 * LinkedIn provider — and this action never attempts one.
 * The server returns `{message, duplicate}`: `message` is the
 * sent inbox message, `duplicate` is true when the
 * idempotency key replayed an earlier send (no second email).
 *
 * Idempotency: a client-generated `idempotencyKey` is sent on
 * every call (auto-generated UUID when the user leaves the field
 * blank), so a retried Zap step does not send the reply twice.
 */
const perform = async (z, bundle) => {
  const { conversationId, content, subject } = bundle.inputData;
  const idempotencyKey = bundle.inputData.idempotencyKey || randomUUID();
  const body = { content, idempotencyKey };
  if (subject !== undefined && subject !== '') {
    body.subject = subject;
  }
  const response = await z.request({
    url: apiUrl(`/conversations/${encodeURIComponent(conversationId)}/replies`),
    method: 'POST',
    body,
  });
  const data = response.json || {};
  const message = data.message || data.reply || data;
  return { ...message, duplicate: Boolean(data.duplicate) };
};

module.exports = {
  key: 'send_reply',
  noun: 'Reply',
  display: {
    label: 'Send Reply',
    description:
      'Sends a reply inside an existing inbox conversation. EMAIL ONLY — LinkedIn replies are refused by NxtSend (no authorized provider) and this action never attempts one. A unique idempotency key is sent so a retried step does not send twice.',
    hidden: false,
  },
  operation: {
    inputFields: [
      {
        key: 'conversationId',
        label: 'Conversation',
        type: 'string',
        required: true,
        dynamic: 'new_conversation.id.subject',
        helpText: 'Pick a recent conversation, or paste a conversation ID.',
      },
      {
        key: 'content',
        label: 'Reply',
        type: 'text',
        required: true,
        helpText: 'The reply text (email).',
      },
      { key: 'subject', label: 'Subject', type: 'string', required: false },
      {
        key: 'idempotencyKey',
        label: 'Idempotency Key',
        type: 'string',
        required: false,
        helpText: 'Leave blank to auto-generate a unique key. Reusing a key replays the original reply instead of sending a duplicate.',
      },
    ],
    perform,
    sample: sampleReply,
    outputFields: replyOutputFields,
  },
};
