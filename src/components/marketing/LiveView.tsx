"use client";

import { useState } from "react";
import Image from "next/image";
import {
  BarChart3,
  Check,
  ContactRound,
  Inbox,
  LayoutDashboard,
  Mic,
  Send,
  Settings,
  Target,
  Users,
} from "lucide-react";

/**
 * "One live view of every campaign" (P6 rebuild) — an interactive
 * marketing preview of the NxtSend workspace.
 *
 * The old section was a static screenshot behind three inert spans.
 * Now: the Unified Inbox / Leads / Analytics tabs switch the copy on
 * the left AND the preview pane on the right, and the preview carries
 * its own mini navigation mirroring the real dashboard sidebar
 * (src/app/(dashboard)/layout.tsx: Dashboard, Campaigns, Inbox,
 * CRM → Leads, Analytics, Connected Accounts, Settings). Clicking a
 * nav item switches the pane to a matching mini interface; the three
 * overlapping destinations stay in sync with the tabs both ways.
 *
 * Everything inside the preview is illustrative interface content —
 * it demonstrates the product's screens, it is not live data and is
 * labelled "Interface preview" in the frame.
 */

type TabKey = "inbox" | "leads" | "analytics";
type PaneKey = TabKey | "overview" | "campaigns" | "accounts" | "settings";

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "inbox", label: "Unified inbox", icon: "/images/icons/unibox.png" },
  { key: "leads", label: "Leads", icon: "/images/icons/leads.png" },
  { key: "analytics", label: "Analytics", icon: "/images/icons/analytics.png" },
];

const TAB_COPY: Record<
  TabKey,
  { heading: string; body: string; bullets: string[] }
> = {
  inbox: {
    heading: "Every reply lands in a single inbox",
    body: "Answer messages from every connected and rented profile in one thread view, without switching accounts or losing track of who said what.",
    bullets: [
      "Filter conversations by account or by campaign",
      "Assign a thread to a teammate inside the same workspace",
      "Search past messages before you write the follow-up",
    ],
  },
  leads: {
    heading: "Every lead, organised and ready to work",
    body: "Build lists from LinkedIn searches or a CSV import, keep the fields your sequences need, and assign every lead to the right campaign — no spreadsheets in between.",
    bullets: [
      "Import from a LinkedIn search or CSV in minutes",
      "Enrichment fields ready for personalisation variables",
      "Duplicate detection keeps every list clean",
    ],
  },
  analytics: {
    heading: "Know exactly what is working",
    body: "Follow the full funnel for every campaign and every profile — invitations, acceptances, replies and meetings — so the next round starts from evidence, not guesses.",
    bullets: [
      "Funnel view from first invitation to booked meeting",
      "Acceptance and reply rates per campaign and per profile",
      "Compare sequences and steps side by side",
    ],
  },
};

const NAV: { key: PaneKey; label: string; icon: typeof Inbox }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "campaigns", label: "Campaigns", icon: Target },
  { key: "inbox", label: "Inbox", icon: Inbox },
  { key: "leads", label: "Leads", icon: ContactRound },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
  { key: "accounts", label: "Accounts", icon: Users },
  { key: "settings", label: "Settings", icon: Settings },
];

function Avatar({
  src,
  name,
  size = "h-8 w-8",
}: {
  src: string;
  name: string;
  size?: string;
}) {
  return (
    <Image
      src={src}
      alt={name}
      width={64}
      height={64}
      className={`${size} shrink-0 rounded-full object-cover object-top ring-1 ring-white/20`}
    />
  );
}

function PaneTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-13 font-bold uppercase tracking-wider text-white/50">
      {children}
    </div>
  );
}

/* ── Preview panes (illustrative interface content) ───────────────────── */

function OverviewPane() {
  const stats = [
    { label: "Active campaigns", value: "6" },
    { label: "Replies waiting", value: "12" },
    { label: "New connections", value: "84" },
  ];
  const activity = [
    "Emily D. replied in Q4 Outbound",
    "12 invitations accepted today",
    "Step 3 sent — Founders Outreach",
    "New leads imported from CSV",
  ];
  return (
    <div>
      <PaneTitle>Overview</PaneTitle>
      <div className="mt-3 grid grid-cols-3 gap-2.5">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
            <div className="text-20 font-extrabold text-white">{s.value}</div>
            <div className="mt-0.5 text-10 leading-tight text-white/50">{s.label}</div>
          </div>
        ))}
      </div>
      <ul className="mt-4 space-y-2">
        {activity.map((a) => (
          <li key={a} className="flex items-center gap-2.5 rounded-xl bg-white/5 px-3 py-2 text-12 text-white/80 ring-1 ring-white/5">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-purple-400" />
            {a}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CampaignsPane() {
  const rows = [
    { name: "Q4 Outbound — SaaS VPs", status: "Active", steps: "5 steps", pct: 68 },
    { name: "Founders Outreach", status: "Active", steps: "4 steps", pct: 42 },
    { name: "Agency Partners", status: "Paused", steps: "6 steps", pct: 15 },
  ];
  return (
    <div>
      <PaneTitle>Campaigns</PaneTitle>
      <ul className="mt-3 space-y-2.5">
        {rows.map((r) => (
          <li key={r.name} className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-13 font-semibold text-white">{r.name}</span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-10 font-bold ${
                  r.status === "Active"
                    ? "bg-emerald-400/15 text-emerald-300"
                    : "bg-white/10 text-white/50"
                }`}
              >
                {r.status}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-brand" style={{ width: `${r.pct}%` }} />
              </div>
              <span className="text-11 text-white/50">{r.steps}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

const THREADS = [
  { photo: "/images/people/emily-davidson.jpg", name: "Emily Davidson", snippet: "Happy to chat — Thursday works for me.", unread: true },
  { photo: "/images/people/robert-tas.jpg", name: "Robert Tas", snippet: "Can you share the deck you mentioned?", unread: true },
  { photo: "/images/people/felix-dragoi.jpg", name: "Felix Dragoi", snippet: "Sounds good — let’s book a call.", unread: false },
  { photo: "/images/people/misti-morgenstern.jpg", name: "Misti Morgenstern", snippet: "Thanks for reaching out!", unread: false },
] as const;

function InboxPane() {
  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-1" role="list" aria-label="Conversations">
        {THREADS.map((t, i) => (
          <span
            key={t.name}
            className={`relative shrink-0 rounded-full ring-2 ${
              i === 0 ? "ring-purple-400" : "ring-white/15"
            }`}
          >
            <Avatar src={t.photo} name={t.name} size="h-9 w-9" />
            {t.unread && (
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-orange-400 ring-2 ring-[#0d0d12]" />
            )}
          </span>
        ))}
        <span className="ml-1 hidden shrink-0 self-center text-11 text-white/45 sm:block">
          4 conversations · 2 unread
        </span>
      </div>

      <div className="mt-3 space-y-2.5">
        <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-gradient-brand px-3.5 py-2.5 text-12 leading-relaxed text-white">
          Hi Emily — noticed your team is expanding its outbound motion. Open
          to a quick look at how we run multi-profile campaigns?
        </div>
        <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-md bg-white/10 px-3.5 py-2.5 text-12 leading-relaxed text-white/90">
          Hi! Yes — we’re hiring two SDRs right now. What makes it different?
        </div>
        <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-gradient-brand px-3.5 py-2.5 text-12 leading-relaxed text-white">
          Every profile and every reply lives in one workspace — this inbox.
          Happy to walk you through it.
        </div>
        <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-md bg-white/10 px-3.5 py-2.5 text-12 leading-relaxed text-white/90">
          Happy to chat — Thursday works for me.
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-full bg-white/5 py-1.5 pl-4 pr-1.5 ring-1 ring-white/10">
        <span className="flex-1 truncate text-12 text-white/40">Write a reply…</span>
        <Mic className="h-4 w-4 shrink-0 text-white/40" />
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-white">
          <Send className="h-3.5 w-3.5" />
        </span>
      </div>
    </div>
  );
}

const LEAD_ROWS = [
  { photo: "/images/people/austin-smith.jpg", name: "Austin Smith", title: "VP Sales · Northwind", campaign: "Q4 Outbound", status: "Connected" },
  { photo: "/images/people/brandon-pindulic.jpg", name: "Brandon Pindulic", title: "Founder · Loopwork", campaign: "Founders Outreach", status: "Replied" },
  { photo: "/images/people/kotaiba-alhaj.jpg", name: "Kotaiba Alhaj", title: "Head of Growth · FinEdge", campaign: "Fintech VPs", status: "In sequence" },
  { photo: "/images/people/paola-marinone.jpg", name: "Paola Marinone", title: "SDR Lead · Cloudly", campaign: "Q4 Outbound", status: "Connected" },
] as const;

function LeadsPane() {
  return (
    <div>
      <PaneTitle>Leads</PaneTitle>
      <ul className="mt-3 divide-y divide-white/5 overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10">
        {LEAD_ROWS.map((lead) => (
          <li key={lead.name} className="flex items-center gap-3 px-3 py-2.5">
            <Avatar src={lead.photo} name={lead.name} />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-13 font-semibold text-white">{lead.name}</div>
              <div className="truncate text-11 text-white/45">{lead.title}</div>
            </div>
            <span className="hidden shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-10 font-semibold text-white/70 md:block">
              {lead.campaign}
            </span>
            <span className="shrink-0 rounded-full bg-purple-500/20 px-2 py-0.5 text-10 font-bold text-purple-200">
              {lead.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AnalyticsPane() {
  const funnel = [
    { label: "Invitations sent", value: "1,240", pct: 100 },
    { label: "Accepted", value: "571", pct: 46 },
    { label: "Replies", value: "347", pct: 28 },
    { label: "Meetings booked", value: "112", pct: 9 },
  ];
  const profiles = [
    { photo: "/images/people/emily-davidson.jpg", name: "Emily D.", rate: 31 },
    { photo: "/images/people/robert-tas.jpg", name: "Robert T.", rate: 26 },
    { photo: "/images/people/dave-mattso.jpg", name: "Dave M.", rate: 22 },
  ];
  return (
    <div>
      <PaneTitle>Analytics · Campaign funnel</PaneTitle>
      <ul className="mt-3 space-y-2">
        {funnel.map((f) => (
          <li key={f.label} className="flex items-center gap-3">
            <span className="w-28 shrink-0 truncate text-11 text-white/60">{f.label}</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-brand" style={{ width: `${f.pct}%` }} />
            </div>
            <span className="w-10 shrink-0 text-right text-11 font-semibold text-white/80">{f.value}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 border-t border-white/10 pt-3">
        <PaneTitle>Reply rate per profile</PaneTitle>
        <ul className="mt-2.5 space-y-2">
          {profiles.map((p) => (
            <li key={p.name} className="flex items-center gap-2.5">
              <Avatar src={p.photo} name={p.name} size="h-6 w-6" />
              <span className="w-16 shrink-0 truncate text-11 text-white/70">{p.name}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-purple-300" style={{ width: `${p.rate * 2}%` }} />
              </div>
              <span className="text-11 font-semibold text-white/80">{p.rate}%</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function AccountsPane() {
  const accounts = [
    { photo: "/images/people/dave-mattso.jpg", name: "Dave M.", detail: "LinkedIn profile · Warm-up on" },
    { photo: "/images/people/emily-davidson.jpg", name: "Emily D.", detail: "LinkedIn profile · Warm-up on" },
    { photo: "/images/people/robert-tas.jpg", name: "Robert T.", detail: "LinkedIn profile · Daily limit 20" },
  ];
  return (
    <div>
      <PaneTitle>Connected accounts</PaneTitle>
      <ul className="mt-3 space-y-2.5">
        {accounts.map((a) => (
          <li key={a.name} className="flex items-center gap-3 rounded-2xl bg-white/5 px-3 py-2.5 ring-1 ring-white/10">
            <Avatar src={a.photo} name={a.name} size="h-9 w-9" />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-13 font-semibold text-white">{a.name}</div>
              <div className="truncate text-11 text-white/45">{a.detail}</div>
            </div>
            <span className="shrink-0 rounded-full bg-emerald-400/15 px-2 py-0.5 text-10 font-bold text-emerald-300">
              Connected
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SettingsPane() {
  const toggles = [
    { label: "Warm-up mode", on: true },
    { label: "Timezone-aware sending", on: true },
    { label: "AI personalisation", on: false },
  ];
  return (
    <div>
      <PaneTitle>Workspace settings</PaneTitle>
      <div className="mt-3 rounded-2xl bg-white/5 p-3.5 ring-1 ring-white/10">
        <div className="text-11 text-white/45">Workspace name</div>
        <div className="mt-1.5 rounded-xl bg-black-900/60 px-3 py-2 text-13 text-white ring-1 ring-white/10">
          NxtSend Growth
        </div>
        <ul className="mt-4 space-y-3">
          {toggles.map((t) => (
            <li key={t.label} className="flex items-center gap-3">
              <span className="flex-1 text-12 text-white/80">{t.label}</span>
              <span
                className={`flex h-5 w-9 items-center rounded-full px-0.5 ${
                  t.on ? "justify-end bg-gradient-brand" : "justify-start bg-white/15"
                }`}
              >
                <span className="h-4 w-4 rounded-full bg-white" />
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 inline-flex rounded-full bg-gradient-brand px-4 py-1.5 text-12 font-semibold text-white">
          Save changes
        </div>
      </div>
    </div>
  );
}

const PANES: Record<PaneKey, () => React.ReactNode> = {
  overview: OverviewPane,
  campaigns: CampaignsPane,
  inbox: InboxPane,
  leads: LeadsPane,
  analytics: AnalyticsPane,
  accounts: AccountsPane,
  settings: SettingsPane,
};

/* ── Section ──────────────────────────────────────────────────────────── */

export function LiveView() {
  const [tab, setTab] = useState<TabKey>("inbox");
  const [view, setView] = useState<PaneKey>("inbox");

  const selectTab = (key: TabKey) => {
    setTab(key);
    setView(key);
  };

  const selectNav = (key: PaneKey) => {
    setView(key);
    if (key === "inbox" || key === "leads" || key === "analytics") {
      setTab(key);
    }
  };

  const copy = TAB_COPY[tab];
  const Pane = PANES[view];

  return (
    <section id="analytics" className="relative border-t border-black-700/80 py-24 lg:py-32">
      <div className="section-container">
        <div className="text-center">
          <h2 className="text-36 font-bold tracking-tight text-white sm:text-48">
            One live view of every campaign
          </h2>
        </div>

        <div className="mx-auto mt-14 grid max-w-6xl grid-cols-1 items-center gap-10 lg:grid-cols-12">
          {/* Left: tabs + per-tab copy */}
          <div className="lg:col-span-5">
            <div
              role="tablist"
              aria-label="Workspace views"
              className="inline-flex items-center gap-1 rounded-full border border-black-600 bg-black-800 p-1"
            >
              {TABS.map((t) => {
                const active = tab === t.key;
                return (
                  <button
                    key={t.key}
                    role="tab"
                    aria-selected={active}
                    onClick={() => selectTab(t.key)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-12 font-bold uppercase tracking-wide transition-colors ${
                      active
                        ? "bg-white text-black-900"
                        : "text-black-300 hover:text-white"
                    }`}
                  >
                    {t.label}
                    <Image src={t.icon} alt="" width={18} height={18} className="h-4 w-4 object-contain" />
                  </button>
                );
              })}
            </div>

            <h3 className="mt-8 text-36 font-bold leading-[1.12] tracking-tight text-white sm:text-44">
              {copy.heading}
            </h3>
            <p className="mt-4 max-w-md text-16 leading-relaxed text-black-400">
              {copy.body}
            </p>
            <ul className="mt-8 space-y-3">
              {copy.bullets.map((b) => (
                <li key={b} className="flex items-start gap-2.5 text-15 text-black-200">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Right: interactive preview */}
          <div className="lg:col-span-7">
            <div className="rounded-[2rem] border border-black-700/80 bg-black-800/40 p-2 shadow-2xl sm:p-3">
              <div className="overflow-hidden rounded-[1.6rem] border border-black-700/60 bg-[#0d0d12]">
                {/* Window chrome */}
                <div className="flex items-center gap-2 border-b border-white/10 px-3.5 py-2.5">
                  <span className="flex gap-1.5" aria-hidden="true">
                    <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                    <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                    <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                  </span>
                  <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-11 text-white/40">
                    app.nxtsend.com
                  </span>
                  <span className="ml-auto rounded-full bg-purple-500/15 px-2 py-0.5 text-10 font-bold uppercase tracking-wider text-purple-300">
                    Interface preview
                  </span>
                </div>

                <div className="flex">
                  {/* Mini navigation — mirrors the dashboard sidebar */}
                  <nav
                    aria-label="Preview navigation"
                    className="flex w-12 shrink-0 flex-col gap-0.5 border-r border-white/10 p-2 sm:w-44"
                  >
                    {NAV.map((item) => {
                      const active = view === item.key;
                      return (
                        <button
                          key={item.key}
                          onClick={() => selectNav(item.key)}
                          aria-current={active ? "page" : undefined}
                          className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-12 font-semibold transition-colors ${
                            active
                              ? "bg-gradient-brand text-white"
                              : "text-white/55 hover:bg-white/5 hover:text-white"
                          }`}
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
                          <span className="hidden truncate sm:block">{item.label}</span>
                        </button>
                      );
                    })}
                    <div className="mt-auto hidden px-2.5 pt-3 text-10 leading-relaxed text-white/35 sm:block">
                      The real workspace, in miniature — try the navigation.
                    </div>
                  </nav>

                  {/* Pane */}
                  <div key={view} className="min-h-[380px] min-w-0 flex-1 p-3.5 sm:min-h-[420px] sm:p-5">
                    <Pane />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
