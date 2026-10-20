"use client";

/**
 * Shared presentational bits for the Integration Center hub + detail
 * pages: per-integration icons and the status → badge-variant mapping.
 * The status strings are the exact Center vocabulary
 * (src/lib/integrations-center/types.ts) — never paraphrase them in UI.
 */

import {
  Linkedin,
  Mail,
  Inbox,
  Send,
  CreditCard,
  Puzzle,
  FileSpreadsheet,
  Webhook,
  Database,
  Sparkles,
  Bot,
  Cpu,
  Brain,
  Target,
  Cog,
  MailCheck,
  type LucideIcon,
} from "lucide-react";
import type { BadgeVariant } from "@/components/ui";
import type { CenterStatus } from "@/lib/integrations-center/types";

export const INTEGRATION_ICONS: Record<string, LucideIcon> = {
  supabase: Database,
  resend: Mail,
  gmail: Inbox,
  microsoft: Send,
  stripe: CreditCard,
  openai: Sparkles,
  anthropic: Bot,
  "meta-model": Cpu,
  "muse-ai": Brain,
  "meta-pixel": Target,
  webhooks: Webhook,
  jobs: Cog,
  linkedin: Linkedin,
  "google-sheets": FileSpreadsheet,
  crm: Puzzle,
  "email-verification": MailCheck,
};

export const STATUS_BADGE_VARIANT: Record<CenterStatus, BadgeVariant> = {
  "Connected and Verified": "success",
  "Connected but Not Verified": "blue",
  "Configuration Required": "warning",
  "Not Connected": "gray",
  "Demo Mode": "demo",
  Error: "error",
  "Unsupported / No Documented API": "gray",
};
