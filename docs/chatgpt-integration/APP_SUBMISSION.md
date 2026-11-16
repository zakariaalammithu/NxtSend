# App Submission (OpenAI)

## Status: NOT submitted, NOT approved

**Nothing in this codebase has been submitted to OpenAI, and no
approval is claimed.** The ChatGPT surface is implemented and usable
today only through **Developer Mode** (a per-user, high-risk setting;
see CHATGPT_SETUP.md). It does **not** appear in ChatGPT's connector
directory, and no user can discover it there.

Do not tell users, customers, or reviewers that NxtSend is "approved
by OpenAI", "listed in ChatGPT", or "an official ChatGPT integration"
until a submission has actually been made and approved. The
Integration Center entry, the admin page and the in-app copy all state
the not-submitted status plainly for this reason.

## What submission would involve (owner steps, not done)

Submitting a connector to OpenAI is a separate, owner-side process
outside this codebase. Based on the OpenAI Apps SDK documentation
(https://developers.openai.com/apps-sdk) as verified live on
2026-11-16 for the custom-UX pattern, a submission is expected to
involve:

1. **A deployed, public NxtSend instance** with the OAuth + MCP
   surface live at its public origin (migrations 023 + 024 applied,
   `TOKEN_ENCRYPTION_KEY` set, metadata endpoints answering).
2. **The connector definition**: MCP server URL
   (`https://nxtsend.com/api/mcp/chatgpt`), the OAuth endpoints and
   metadata URLs, the `nxtsend.*` scopes with plain-words descriptions,
   and the 54-tool manifest with classifications (MCP_TOOLS.md).
3. **The Apps SDK widget** (`render_campaigns_widget` +
   `ui://widget/campaigns.html`) — including a **live render check
   inside ChatGPT**, which is still PENDING and must be done before
   any submission claims the widget works.
4. **OpenAI's review**: functional checks (OAuth flow end-to-end,
   tools behaving as described), security review, and whatever
   business/legal information OpenAI asks for at submission time.
   No review timeline, fee, or approval criterion is claimed here —
   none was verified from a primary OpenAI source during this work,
   and inventing one would be fabrication.
5. **Plan/availability confirmation**: re-check live which ChatGPT
   plans can install a listed connector and whether workspace-admin
   approval is needed (CHATGPT_SETUP.md — availability changes often).

## What is already submission-shaped

- The manifest is pre-classified (Read / Write / Sensitive write)
  with MCP annotations that match the classifications, except the
  documented `get_conversation` exception.
- The OAuth server follows the platform's public-client + PKCE model
  (DCR + CIMD), with RFC 8414 / 9728 / 8707 / 9207 metadata.
- The widget follows the verified Apps SDK pattern (decoupled
  data/render tools, `_meta.ui.resourceUri` +
  `_meta["openai/outputTemplate"]`, `window.openai` bridge).
- Honest limitations are declared in-product rather than hidden:
  `get_date_range_report` BLOCKED, partial idempotency, no LinkedIn
  sends, in-memory rate limiting, UI verification pending.

## What must happen before submission

- [ ] Live OAuth grant flow inside ChatGPT verified end-to-end
      (connect → consent → tools/call → revoke).
- [ ] Widget rendered inside a live ChatGPT client and screenshotted
      (see `audit-screenshots/chatgpt-integration/README.md`).
- [ ] Live `tools/list` (54 tools) and `get_profile` verified from
      ChatGPT.
- [ ] Re-check OpenAI's current submission requirements live — do not
      submit against this document alone.
