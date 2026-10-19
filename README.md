# NxtSend

**NxtSend is a LinkedIn outreach and email outreach platform for sales teams and growth agencies.** Run multi-profile LinkedIn campaigns and email sequences from one workspace, personalize messages with AI, rent prepared LinkedIn profiles (Avatars) to expand sending capacity, and work every reply from a single unified inbox.

## What's inside

- **Marketing site** — home, pricing, integrations, avatars, agency, academy, demo and contact pages.
- **User dashboard** — campaigns (LinkedIn + email sequences), unified inbox, leads/CRM with CSV import/export, AI personalization, analytics, usage & billing, referrals, settings.
- **Admin console** — user and subscription management, billing/transactions, campaign oversight, integration center, system health and queue monitoring, audit logs, site settings and emergency controls.
- **Integration center** — Supabase, Resend, Stripe, OpenAI / Anthropic / Meta Model API, HubSpot, Salesforce, Slack, Zapier, Make, webhooks (HMAC-signed outbound), Meta Pixel, and the Muse.ai Connector Platform path.
- **Honest by design** — with no providers configured, the app runs in clearly-labelled **Demo Mode**: dashboards show labelled demo data, provider routes refuse with `503`, and nothing is sent, charged, or tracked. A feature only reports "Connected" when its credentials are actually set.

## Stack

- [Next.js 14](https://nextjs.org) (App Router) + React 18 + TypeScript
- Tailwind CSS 3, Lucide icons
- Supabase (Postgres + Auth, row-level security) — migrations in `supabase/migrations/` (001–010)
- Resend (email delivery + inbound), Stripe (billing), Vitest (tests)

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in only what you are connecting
npm run dev                  # http://localhost:3000
```

With no environment variables set, the app boots in Demo Mode so you can explore every screen safely.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm test` | Run the Vitest suite |
| `npm run config:check` | Report which providers/features are configured vs. missing |

## Going live

Demo Mode is for evaluation. Before any real sending, billing, or tracking can happen, follow the setup guides in order:

1. **[SETUP.md](./SETUP.md)** — first-time setup of each subsystem: Supabase project + migrations, auth, Resend domain and webhooks, Stripe products, AI provider keys, bootstrap admin.
2. **[PRODUCTION.md](./PRODUCTION.md)** — the Vercel deployment runbook: project settings, environment variables, cron, and the ordered go-live smoke checklist.

Secrets belong in environment variables (Vercel project settings in production) — never in git. See `.env.example` for the full list of variables and what each one unlocks.
