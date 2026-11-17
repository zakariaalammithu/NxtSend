# Changelog

## 0.1.0 — 2026-11-17

Initial release.

- NxtSend action node: Lead, Campaign, Sequence, LinkedIn Account
  (read-only), Conversation and Analytics resources (39 operations).
- NxtSend Trigger node: webhook + polling modes, 9 events (8 webhook
  + `conversation.created` polling-only).
- Credentials: NxtSend API (API key) and NxtSend OAuth2 API, both tested
  against `GET /auth/test`.
- 12 importable workflow templates in `workflows/`.
- 126 Jest tests; `npm run build` and `npm run lint` pass.
- Coordinator fixes (2026-11-18, still 0.1.0 — unreleased): Schedule
  Follow-Up now sends the server's `{conversation_id, body,
  scheduled_at}` body (the original step/subject body would have
  400'd on every call); new `getConversations` dropdown for the
  follow-up's conversation field; `conversation.created` added as
  a polling-only trigger event.

Not published on npm; not verified by n8n; not yet loaded into a live n8n
instance (no Docker/Podman in the build environment).
