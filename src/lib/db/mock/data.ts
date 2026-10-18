import type {
  Campaign,
  DashboardStat,
  Integration,
  Lead,
  Message,
} from "@/types";

const MOCK_WORKSPACE_ID = "ws_demo_001";
const MOCK_USER_ID = "usr_demo_001";

/**
 * Mock Campaigns for development and demo mode exploration.
 */
export const MOCK_CAMPAIGNS: Campaign[] = [
  {
    id: "cmp_demo_001",
    workspace_id: MOCK_WORKSPACE_ID,
    name: "SaaS Founders Q4 Outreach",
    type: "mixed",
    status: "active",
    created_by: MOCK_USER_ID,
    created_at: "2024-09-15T08:30:00.000Z",
    updated_at: "2024-10-10T14:20:00.000Z",
  },
  {
    id: "cmp_demo_002",
    workspace_id: MOCK_WORKSPACE_ID,
    name: "Series A Tech Leaders",
    type: "linkedin",
    status: "active",
    created_by: MOCK_USER_ID,
    created_at: "2024-09-20T10:15:00.000Z",
    updated_at: "2024-10-12T11:45:00.000Z",
  },
  {
    id: "cmp_demo_003",
    workspace_id: MOCK_WORKSPACE_ID,
    name: "Enterprise Cold Email Sequence",
    type: "email",
    status: "active",
    created_by: MOCK_USER_ID,
    created_at: "2024-09-28T14:00:00.000Z",
    updated_at: "2024-10-11T16:30:00.000Z",
  },
  {
    id: "cmp_demo_004",
    workspace_id: MOCK_WORKSPACE_ID,
    name: "Product Marketing Directors",
    type: "linkedin",
    status: "paused",
    created_by: MOCK_USER_ID,
    created_at: "2024-10-01T09:00:00.000Z",
    updated_at: "2024-10-08T12:00:00.000Z",
  },
  {
    id: "cmp_demo_005",
    workspace_id: MOCK_WORKSPACE_ID,
    name: "Q1 Webinar Invite Blast",
    type: "mixed",
    status: "draft",
    created_by: MOCK_USER_ID,
    created_at: "2024-10-05T17:20:00.000Z",
    updated_at: "2024-10-05T17:20:00.000Z",
  },
];

/**
 * Mock Leads representing realistic B2B prospects across several verticals.
 */
export const MOCK_LEADS: Lead[] = [
  {
    id: "lead_demo_001",
    workspace_id: MOCK_WORKSPACE_ID,
    first_name: "Sarah",
    last_name: "Jenkins",
    email: "sarah.jenkins@stripe.com",
    linkedin_url: "https://linkedin.com/in/sarahjenkins-growth",
    company: "Stripe",
    job_title: "Head of Growth",
    status: "replied",
    tags: ["Fintech", "High-Priority", "Decision-Maker"],
    custom_fields: { team_size: "1000+", crm_id: "CRM-8012" },
    created_at: "2024-10-01T10:00:00.000Z",
  },
  {
    id: "lead_demo_002",
    workspace_id: MOCK_WORKSPACE_ID,
    first_name: "David",
    last_name: "Zhao",
    email: "david.zhao@datadoghq.com",
    linkedin_url: "https://linkedin.com/in/david-zhao-tech",
    company: "Datadog",
    job_title: "VP of Engineering",
    status: "contacted",
    tags: ["DevOps", "Enterprise"],
    custom_fields: { tech_stack: "Cloud Monitoring", budget: "$50k+" },
    created_at: "2024-10-02T11:30:00.000Z",
  },
  {
    id: "lead_demo_003",
    workspace_id: MOCK_WORKSPACE_ID,
    first_name: "Elena",
    last_name: "Rostova",
    email: "elena@scalewave.io",
    linkedin_url: "https://linkedin.com/in/elena-rostova",
    company: "ScaleWave",
    job_title: "Founder & CEO",
    status: "converted",
    tags: ["Founder", "Series A", "Fast-Mover"],
    custom_fields: { referral: "Twitter/X", stage: "Customer" },
    created_at: "2024-10-03T14:15:00.000Z",
  },
  {
    id: "lead_demo_004",
    workspace_id: MOCK_WORKSPACE_ID,
    first_name: "Marcus",
    last_name: "Vance",
    email: "marcus.vance@vercel.com",
    linkedin_url: "https://linkedin.com/in/marcus-vance-cro",
    company: "Vercel",
    job_title: "Chief Revenue Officer",
    status: "replied",
    tags: ["Executive", "B2B SaaS"],
    custom_fields: { sales_cycle: "Enterprise", priority: "Tier-1" },
    created_at: "2024-10-04T09:45:00.000Z",
  },
  {
    id: "lead_demo_005",
    workspace_id: MOCK_WORKSPACE_ID,
    first_name: "Chloe",
    last_name: "Dubois",
    email: "chloe.dubois@figma.com",
    linkedin_url: "https://linkedin.com/in/chloe-dubois-design",
    company: "Figma",
    job_title: "VP of Product",
    status: "contacted",
    tags: ["Product", "Design-Ops"],
    custom_fields: { location: "San Francisco, CA" },
    created_at: "2024-10-05T13:20:00.000Z",
  },
  {
    id: "lead_demo_006",
    workspace_id: MOCK_WORKSPACE_ID,
    first_name: "Liam",
    last_name: "O'Connor",
    email: "liam.oc@notion.so",
    linkedin_url: "https://linkedin.com/in/liam-oconnor-bd",
    company: "Notion",
    job_title: "Director of Business Development",
    status: "new",
    tags: ["Partnerships", "Productivity"],
    custom_fields: { interest_level: "High" },
    created_at: "2024-10-06T15:10:00.000Z",
  },
  {
    id: "lead_demo_007",
    workspace_id: MOCK_WORKSPACE_ID,
    first_name: "Priya",
    last_name: "Patel",
    email: "priya.patel@finpulse.tech",
    linkedin_url: "https://linkedin.com/in/priya-patel-finpulse",
    company: "FinPulse",
    job_title: "Co-founder & CTO",
    status: "replied",
    tags: ["Technical Co-Founder", "Fintech"],
    custom_fields: { team_size: "15-50", funding: "$4.5M" },
    created_at: "2024-10-07T08:50:00.000Z",
  },
  {
    id: "lead_demo_008",
    workspace_id: MOCK_WORKSPACE_ID,
    first_name: "Alexander",
    last_name: "Schmidt",
    email: "alex.schmidt@ramp.com",
    linkedin_url: "https://linkedin.com/in/alex-schmidt-mktg",
    company: "Ramp",
    job_title: "Chief Marketing Officer",
    status: "contacted",
    tags: ["CMO", "Fintech Unicorn"],
    custom_fields: { target_vertical: "Corporate Cards" },
    created_at: "2024-10-08T16:00:00.000Z",
  },
  {
    id: "lead_demo_009",
    workspace_id: MOCK_WORKSPACE_ID,
    first_name: "Sofia",
    last_name: "Vergara-Cole",
    email: "sofia@linear.app",
    linkedin_url: "https://linkedin.com/in/sofia-vergara-sales",
    company: "Linear",
    job_title: "Head of Sales",
    status: "new",
    tags: ["Sales Lead", "DevTools"],
    custom_fields: { inbound_intent: "Webinar Attendee" },
    created_at: "2024-10-09T11:15:00.000Z",
  },
  {
    id: "lead_demo_010",
    workspace_id: MOCK_WORKSPACE_ID,
    first_name: "Jason",
    last_name: "Miller",
    email: "jason.miller@retool.com",
    linkedin_url: "https://linkedin.com/in/jason-miller-ops",
    company: "Retool",
    job_title: "VP of Operations",
    status: "unresponsive",
    tags: ["Internal-Tools", "Ops"],
    custom_fields: { last_follow_up: "2024-10-10" },
    created_at: "2024-10-10T12:00:00.000Z",
  },
];

/**
 * High-level overview statistics reflecting system throughput and demo KPI numbers.
 */
export const MOCK_STATS: DashboardStat[] = [
  {
    label: "Total Leads",
    value: 247,
    change: 14.8,
    changeType: "up",
    icon: "users",
  },
  {
    label: "Active Campaigns",
    value: 3,
    change: 0,
    changeType: "up",
    icon: "zap",
  },
  {
    label: "Connections Sent",
    value: 89,
    change: 11.2,
    changeType: "up",
    icon: "user-plus",
  },
  {
    label: "Messages Sent",
    value: 156,
    change: 18.5,
    changeType: "up",
    icon: "message-square",
  },
  {
    label: "Emails Sent",
    value: 312,
    change: 26.4,
    changeType: "up",
    icon: "mail",
  },
  {
    label: "Replies",
    value: 28,
    change: 8.7,
    changeType: "up",
    icon: "corner-up-left",
  },
];

/**
 * Mock outreach communications across LinkedIn and Email channels.
 * Clearly flagged with is_demo: true.
 */
export const MOCK_MESSAGES: Message[] = [
  {
    id: "msg_demo_001",
    workspace_id: MOCK_WORKSPACE_ID,
    lead_id: "lead_demo_001",
    campaign_id: "cmp_demo_001",
    channel: "linkedin",
    direction: "outbound",
    content:
      "Hi Sarah, saw your recent talk on scalable growth flywheels at SaaStr. Would love to connect and share some tactical data we gathered across 200+ B2B startups.",
    status: "delivered",
    is_demo: true,
    sent_at: "2024-10-09T09:30:00.000Z",
  },
  {
    id: "msg_demo_002",
    workspace_id: MOCK_WORKSPACE_ID,
    lead_id: "lead_demo_001",
    campaign_id: "cmp_demo_001",
    channel: "linkedin",
    direction: "inbound",
    content:
      "Hey Alex! Thanks for connecting. That benchmark data sounds genuinely interesting. Mind sending over a summary slide or quick deck?",
    status: "replied",
    is_demo: true,
    sent_at: "2024-10-09T14:15:00.000Z",
  },
  {
    id: "msg_demo_003",
    workspace_id: MOCK_WORKSPACE_ID,
    lead_id: "lead_demo_003",
    campaign_id: "cmp_demo_003",
    channel: "email",
    direction: "outbound",
    subject: "Scaling founder-led outbound for ScaleWave",
    content:
      "Hi Elena,\n\nCongrats on the ScaleWave announcement! Automating multichannel outreach without burning domain reputation is notoriously tough early on. How is your team currently orchestrating LinkedIn + email touches?\n\nBest,\nAlex",
    status: "opened",
    is_demo: true,
    sent_at: "2024-10-10T10:00:00.000Z",
  },
  {
    id: "msg_demo_004",
    workspace_id: MOCK_WORKSPACE_ID,
    lead_id: "lead_demo_003",
    campaign_id: "cmp_demo_003",
    channel: "email",
    direction: "inbound",
    subject: "Re: Scaling founder-led outbound for ScaleWave",
    content:
      "Hey Alex,\n\nWe're currently juggling manual LinkedIn messaging and a disjointed cold email tool, so this hits close to home. Do you have 15 mins this Thursday to walk me through NxtSend?\n\nElena",
    status: "replied",
    is_demo: true,
    sent_at: "2024-10-10T16:45:00.000Z",
  },
  {
    id: "msg_demo_005",
    workspace_id: MOCK_WORKSPACE_ID,
    lead_id: "lead_demo_004",
    campaign_id: "cmp_demo_002",
    channel: "linkedin",
    direction: "outbound",
    content:
      "Marcus, impressive expansion at Vercel over the past quarter! Curious if automated multichannel pipelines are part of your enterprise SDR playbook this year?",
    status: "delivered",
    is_demo: true,
    sent_at: "2024-10-11T11:20:00.000Z",
  },
  {
    id: "msg_demo_006",
    workspace_id: MOCK_WORKSPACE_ID,
    lead_id: "lead_demo_007",
    campaign_id: "cmp_demo_001",
    channel: "email",
    direction: "outbound",
    subject: "Automating multichannel outreach for technical teams",
    content:
      "Hi Priya,\n\nNoticed FinPulse is hiring SDRs. We built an automated sequence engine designed specifically for technical products to bridge LinkedIn connection requests and verified email follow-ups with zero manual sync.",
    status: "delivered",
    is_demo: true,
    sent_at: "2024-10-12T08:00:00.000Z",
  },
];

/**
 * Mock Third-Party Integrations status data.
 */
export const MOCK_INTEGRATIONS: Integration[] = [
  {
    id: "int_demo_001",
    workspace_id: MOCK_WORKSPACE_ID,
    provider: "LinkedIn",
    status: "demo",
    config: {
      account_name: "Demo Account (Alex Vance)",
      daily_limit: 50,
      auto_connect: true,
      note: "Simulated LinkedIn outreach sandbox",
    },
    updated_at: "2024-10-12T12:00:00.000Z",
  },
  {
    id: "int_demo_002",
    workspace_id: MOCK_WORKSPACE_ID,
    provider: "Resend",
    status: "demo",
    config: {
      sender_domain: "mail.nxtsend-demo.com",
      daily_send_limit: 500,
      tracking_enabled: true,
    },
    updated_at: "2024-10-12T12:00:00.000Z",
  },
  {
    id: "int_demo_003",
    workspace_id: MOCK_WORKSPACE_ID,
    provider: "Stripe",
    status: "demo",
    config: {
      plan: "free",
      currency: "usd",
      auto_renew: true,
    },
    updated_at: "2024-10-12T12:00:00.000Z",
  },
  {
    id: "int_demo_004",
    workspace_id: MOCK_WORKSPACE_ID,
    provider: "HubSpot",
    status: "disconnected",
    config: {
      sync_contacts: false,
      sync_deals: false,
    },
    updated_at: "2024-10-01T00:00:00.000Z",
  },
  {
    id: "int_demo_005",
    workspace_id: MOCK_WORKSPACE_ID,
    provider: "Google Sheets",
    status: "disconnected",
    config: {
      auto_export_leads: false,
    },
    updated_at: "2024-10-01T00:00:00.000Z",
  },
];

/**
 * 7-Day Performance trend data for dashboard and analytics charts.
 */
export const MOCK_PERFORMANCE_DATA = [
  { name: "Mon", connections: 14, messages: 22, emails: 45, replies: 4 },
  { name: "Tue", connections: 18, messages: 28, emails: 52, replies: 6 },
  { name: "Wed", connections: 22, messages: 35, emails: 60, replies: 7 },
  { name: "Thu", connections: 19, messages: 31, emails: 58, replies: 5 },
  { name: "Fri", connections: 25, messages: 42, emails: 70, replies: 9 },
  { name: "Sat", connections: 8, messages: 12, emails: 24, replies: 2 },
  { name: "Sun", connections: 11, messages: 16, emails: 30, replies: 3 },
];

/**
 * Recent Activity feed for dashboard overview.
 */
export interface ActivityItem {
  id: string;
  type: "reply" | "connection" | "email_sent" | "campaign_started" | "bounce";
  title: string;
  description: string;
  leadName?: string;
  leadEmail?: string;
  timestamp: string;
  channel: "linkedin" | "email" | "system";
  is_demo: boolean;
}

export const MOCK_ACTIVITY: ActivityItem[] = [
  {
    id: "act_001",
    type: "reply",
    title: "New positive reply received",
    description: "Sarah Jenkins replied: 'Would love to see the benchmark data...'",
    leadName: "Sarah Jenkins",
    leadEmail: "sarah.jenkins@stripe.com",
    timestamp: "10 minutes ago",
    channel: "linkedin",
    is_demo: true,
  },
  {
    id: "act_002",
    type: "connection",
    title: "Connection request accepted",
    description: "David Zhao accepted connection request",
    leadName: "David Zhao",
    leadEmail: "david.zhao@datadoghq.com",
    timestamp: "35 minutes ago",
    channel: "linkedin",
    is_demo: true,
  },
  {
    id: "act_003",
    type: "email_sent",
    title: "Email follow-up delivered",
    description: "Step 2 'Follow-up on product scaling' sent to Marcus Vance",
    leadName: "Marcus Vance",
    leadEmail: "marcus.vance@vercel.com",
    timestamp: "1 hour ago",
    channel: "email",
    is_demo: true,
  },
  {
    id: "act_004",
    type: "reply",
    title: "Meeting requested",
    description: "Elena Rostova replied asking for a 15-min demo walkthrough",
    leadName: "Elena Rostova",
    leadEmail: "elena@scalewave.io",
    timestamp: "2 hours ago",
    channel: "email",
    is_demo: true,
  },
  {
    id: "act_005",
    type: "campaign_started",
    title: "Campaign batch launched",
    description: "Sent 45 connection requests in 'Series A Tech Leaders'",
    timestamp: "3 hours ago",
    channel: "system",
    is_demo: true,
  },
  {
    id: "act_006",
    type: "connection",
    title: "Connection request accepted",
    description: "Chloe Dubois accepted connection request",
    leadName: "Chloe Dubois",
    leadEmail: "chloe.dubois@figma.com",
    timestamp: "4 hours ago",
    channel: "linkedin",
    is_demo: true,
  },
  {
    id: "act_007",
    type: "email_sent",
    title: "First touch email opened",
    description: "Priya Patel opened email 'Multichannel outreach for technical teams'",
    leadName: "Priya Patel",
    leadEmail: "priya.patel@finpulse.tech",
    timestamp: "5 hours ago",
    channel: "email",
    is_demo: true,
  },
  {
    id: "act_008",
    type: "bounce",
    title: "Email delivery bounced",
    description: "Soft bounce recorded for contact at legacy address",
    leadName: "Alexander Schmidt",
    leadEmail: "alex.schmidt@ramp.com",
    timestamp: "6 hours ago",
    channel: "email",
    is_demo: true,
  },
];

/**
 * Mock Campaign Steps for campaign detail page.
 */
export const MOCK_CAMPAIGN_STEPS = [
  {
    id: "step_001",
    step_order: 1,
    step_type: "connection_request" as const,
    delay_hours: 0,
    subject: "LinkedIn Connection",
    content: "Hi {{first_name}}, came across your profile while researching high-growth SaaS teams. Would love to connect!",
  },
  {
    id: "step_002",
    step_order: 2,
    step_type: "wait" as const,
    delay_hours: 24,
    subject: "Wait 24 Hours",
    content: "Wait for connection to be accepted or 24 hours elapsed",
  },
  {
    id: "step_003",
    step_order: 3,
    step_type: "linkedin_message" as const,
    delay_hours: 4,
    subject: "Follow-up LinkedIn Message",
    content: "Thanks for connecting, {{first_name}}! We just published our 2024 outbound benchmark report. Thought this might be relevant for {{company}}.",
  },
  {
    id: "step_004",
    step_order: 4,
    step_type: "email" as const,
    delay_hours: 48,
    subject: "Scaling outreach for {{company}}",
    content: "Hi {{first_name}},\n\nWanted to quickly follow up on LinkedIn. We've helped companies similar to {{company}} scale personalized touchpoints without burning domain reputation.\n\nBest,\nAlex",
  },
];

/**
 * Admin Mock Users (8 users with different roles and plans).
 */
export interface AdminUser {
  id: string;
  name: string;
  email: string;
  avatar_url?: string | null;
  role: "super_admin" | "admin" | "user";
  plan: "free" | "starter" | "growth" | "agency";
  status: "active" | "suspended";
  created_at: string;
  workspace_count: number;
}

export const MOCK_ADMIN_USERS: AdminUser[] = [
  {
    id: "usr_001",
    name: "Alex Vance",
    email: "alex@nxtsend.com",
    avatar_url: null,
    role: "super_admin",
    plan: "growth",
    status: "active",
    created_at: "2024-01-15T10:00:00Z",
    workspace_count: 3,
  },
  {
    id: "usr_002",
    name: "Sarah Jenkins",
    email: "sarah.j@stripe.com",
    avatar_url: null,
    role: "admin",
    plan: "growth",
    status: "active",
    created_at: "2024-02-01T12:00:00Z",
    workspace_count: 2,
  },
  {
    id: "usr_003",
    name: "David Zhao",
    email: "david.zhao@datadoghq.com",
    avatar_url: null,
    role: "user",
    plan: "starter",
    status: "active",
    created_at: "2024-02-14T09:30:00Z",
    workspace_count: 1,
  },
  {
    id: "usr_004",
    name: "Elena Rostova",
    email: "elena@scalewave.io",
    avatar_url: null,
    role: "user",
    plan: "agency",
    status: "active",
    created_at: "2024-03-01T14:15:00Z",
    workspace_count: 4,
  },
  {
    id: "usr_005",
    name: "Marcus Vance",
    email: "marcus.v@vercel.com",
    avatar_url: null,
    role: "user",
    plan: "growth",
    status: "active",
    created_at: "2024-03-12T16:00:00Z",
    workspace_count: 1,
  },
  {
    id: "usr_006",
    name: "Chloe Dubois",
    email: "chloe.d@figma.com",
    avatar_url: null,
    role: "user",
    plan: "free",
    status: "active",
    created_at: "2024-03-20T11:45:00Z",
    workspace_count: 1,
  },
  {
    id: "usr_007",
    name: "Liam O'Connor",
    email: "liam.oc@notion.so",
    avatar_url: null,
    role: "user",
    plan: "starter",
    status: "suspended",
    created_at: "2024-04-05T08:20:00Z",
    workspace_count: 1,
  },
  {
    id: "usr_008",
    name: "Priya Patel",
    email: "priya@finpulse.tech",
    avatar_url: null,
    role: "user",
    plan: "growth",
    status: "active",
    created_at: "2024-04-18T13:10:00Z",
    workspace_count: 2,
  },
];

/**
 * Admin Mock Subscriptions.
 */
export interface AdminSubscription {
  id: string;
  workspaceName: string;
  userEmail: string;
  plan: "free" | "starter" | "growth" | "agency";
  amount: number;
  status: "active" | "trialing" | "past_due" | "canceled";
  renewalDate: string;
  stripeStatus: string;
}

export const MOCK_ADMIN_SUBSCRIPTIONS: AdminSubscription[] = [
  {
    id: "sub_001",
    workspaceName: "ScaleWave Agency",
    userEmail: "elena@scalewave.io",
    plan: "agency",
    amount: 299,
    status: "active",
    renewalDate: "Nov 01, 2024",
    stripeStatus: "Demo Mode (Mock)",
  },
  {
    id: "sub_002",
    workspaceName: "Stripe Growth Hub",
    userEmail: "sarah.j@stripe.com",
    plan: "growth",
    amount: 149,
    status: "active",
    renewalDate: "Nov 15, 2024",
    stripeStatus: "Demo Mode (Mock)",
  },
  {
    id: "sub_003",
    workspaceName: "Alex Vance Outreach",
    userEmail: "alex@nxtsend.com",
    plan: "growth",
    amount: 149,
    status: "active",
    renewalDate: "Nov 20, 2024",
    stripeStatus: "Demo Mode (Mock)",
  },
  {
    id: "sub_004",
    workspaceName: "FinPulse Labs",
    userEmail: "priya@finpulse.tech",
    plan: "starter",
    amount: 49,
    status: "active",
    renewalDate: "Nov 28, 2024",
    stripeStatus: "Demo Mode (Mock)",
  },
  {
    id: "sub_005",
    workspaceName: "Datadog SDR Team",
    userEmail: "david.zhao@datadoghq.com",
    plan: "starter",
    amount: 49,
    status: "trialing",
    renewalDate: "Oct 25, 2024",
    stripeStatus: "Demo Mode (Mock)",
  },
];

/**
 * Admin Mock Audit Logs.
 */
export interface AdminAuditLog {
  id: string;
  actor: string;
  action: string;
  resource: string;
  details: string;
  timestamp: string;
}

export const MOCK_ADMIN_AUDIT_LOGS: AdminAuditLog[] = [
  {
    id: "aud_001",
    actor: "alex@nxtsend.com",
    action: "ROLE_CHANGE",
    resource: "user:usr_002",
    details: "Granted role 'admin' to sarah.j@stripe.com",
    timestamp: "2024-10-12 14:35:10",
  },
  {
    id: "aud_002",
    actor: "system",
    action: "INTEGRATION_SYNC",
    resource: "integration:linkedin",
    details: "Simulated token refresh completed for Alex Vance",
    timestamp: "2024-10-12 12:00:00",
  },
  {
    id: "aud_003",
    actor: "alex@nxtsend.com",
    action: "CAMPAIGN_LAUNCH",
    resource: "campaign:cmp_demo_001",
    details: "Enrolled 45 leads into 'SaaS Founders Q4 Outreach'",
    timestamp: "2024-10-11 16:40:22",
  },
  {
    id: "aud_004",
    actor: "sarah.j@stripe.com",
    action: "LEAD_IMPORT",
    resource: "leads:batch_08",
    details: "Imported 120 leads via CSV file 'tech_leaders.csv'",
    timestamp: "2024-10-10 11:15:45",
  },
  {
    id: "aud_005",
    actor: "alex@nxtsend.com",
    action: "USER_SUSPEND",
    resource: "user:usr_007",
    details: "Suspended user Liam O'Connor for excessive bounce rate",
    timestamp: "2024-10-09 09:20:12",
  },
  {
    id: "aud_006",
    actor: "system",
    action: "WEBHOOK_EVENT",
    resource: "stripe:invoice.payment_succeeded",
    details: "Processed demo renewal for ScaleWave Agency ($299)",
    timestamp: "2024-10-08 00:00:05",
  },
];

