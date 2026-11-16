# Muse Submission (Directory Listing)

> **Verification note — read this first.** `platform.muse.ai/docs`
> itself was **not fetchable from this environment** — the submission
> requirements below were verified from Meta Help Center-derived
> implementation guides and the readiness checklist already in this
> repo (`src/lib/muse-connector/readiness.ts`), and **must be
> re-checked live before submission**. **No submission has been made.
> No approval is claimed. Nothing in this repo has been submitted to
> Meta.**

## Two paths — only one needs Meta

| Path | Needs Meta approval? | Status |
| --- | --- | --- |
| **Custom Connector** (a Muse user adds NxtSend's MCP endpoint URL directly) | **No** | **Works now** — the surface is implemented and deployed; see [OAUTH_SETUP.md](OAUTH_SETUP.md). |
| **Connector directory listing** (NxtSend appears in Muse's connector directory) | **Yes** — submit at `muse.ai/platform`, pass Meta's review | **NOT done.** This doc describes what the owner must still do. |

Do not confuse the two: the Custom Connector path is the useful,
available-now route. Directory listing is a separate, owner-driven
process with no published timeline.

## What submission requires (from the readiness checklist)

The items below come from `src/lib/muse-connector/readiness.ts`
(`MUSE_READINESS_CHECKLIST`); re-check each against the live
guidelines before submitting, because the docs source was not
directly fetchable here.

1. **A live integration surface** — done: the hosted MCP endpoint +
   OAuth server in this repo, deployed at the public URL.
2. **Submission at `muse.ai/platform`** — sign in with a work email
   and submit: connector name, company/developer, product website,
   example prompts, 512×512 PNG/SVG icon, whether it accepts
   payments, contact name + work email, support email/URL, privacy
   policy URL, terms of service URL. **Owner step — not done.**
3. **Business verification** — business information and supporting
   evidence of authority to submit, authorised brand assets, support
   + security contacts, a named developer responsible for
   maintenance, acceptance of the Muse Connector Terms. **Owner step.**
4. **Data-processing questionnaire** — declare what data is accessed
   and why, how it is protected, shared, retained and deleted —
   consistent with the published privacy policy. Connector data must
   not be sold, used for secondary purposes, or trained on.
   **Owner step.**
5. **Integration credentials + tool documentation** — the endpoint,
   auth setup (OAuth with PKCE; a Read Only option is offered —
   `muse.read`), requested scopes, test vs production credentials.
   API/MCP docs must include setup instructions, inputs/outputs,
   Read/Write/Sensitive-write classifications, permissions, side
   effects, status handling, errors and rate limits. The docs in this
   folder are that documentation — re-check them against the live
   guidelines before submitting.
6. **Dedicated test account + demo** — a test account kept accessible
   throughout review, with sign-in instructions and representative
   data, and a way to exercise transaction tools without real charges.
   **Owner step.**
7. **Pass Meta's 3-stage review** — (1) risk assessment
   (security/privacy/integrity), (2) tool review — approval covers
   **only the approved tools**, (3) end-to-end QA including verifying
   that sensitive writes require approval every time. Status is
   tracked in the submissions portal; Meta does not answer individual
   status emails.
8. **Ongoing obligations** — 48-hour security-incident notification
   to Meta, data minimisation, audit up to once per year, 30-day
   termination by either party, Meta may re-review or remove a
   connector at any time. No exclusivity.

## Facts that must not be misrepresented in the submission

- **No paid Muse plan is required to submit** (per the research).
- **No submission fee, revenue share, or review timeline is
  published**; onboarding runs in waves. Do not promise a date.
- **Approval is discretionary** — meeting the guidelines does not
  guarantee it.
- **Meta is not currently approving new financial money-movement
  tools** (read-only finance is allowed) — NxtSend's billing surface
  is kept out of the manifest entirely. Do not add billing tools to
  the submission.
- **LinkedIn-send tools are NOT SUPPORTED** and must not be listed:
  no authorized LinkedIn provider exists, and the official LinkedIn
  API exposes no connection-request/DM endpoints to standard
  developers. Listing one would be a false claim and a review
  failure.
- The 18 tools in [MCP_TOOLS.md](MCP_TOOLS.md) are the complete
  submission surface. Do not list tools that do not exist.

## Before submitting — checklist for the owner

- [ ] Re-check `platform.muse.ai/docs` live (it was not fetchable
      from the build environment).
- [ ] Deploy the surface (see [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md))
      and run the live checks in [TESTING.md](TESTING.md).
- [ ] Prepare the submission assets (icon, privacy policy, terms,
      support contacts, example prompts).
- [ ] Create the dedicated test account with representative data.
- [ ] Confirm the `muse.read`-only grant path works end to end as a
      Custom Connector first — it is the same surface Meta will test.
