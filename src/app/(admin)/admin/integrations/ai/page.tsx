"use client";

import * as React from "react";
import { AdminIntegrationView } from "@/components/admin/AdminIntegrationView";

/**
 * Admin → Integrations → AI Providers. OpenAI, Anthropic, and the
 * Meta Model API adapters (typed server-side clients; keys never
 * reach the browser). Provider selection order is OpenAI → Anthropic
 * → Meta, and a provider joins the rotation only when its key is
 * configured. The one wired feature is human-reviewed outreach
 * drafting in the campaign wizard — AI output is never auto-sent.
 */
export default function AdminAiIntegrationPage() {
  return (
    <AdminIntegrationView
      title="AI Providers"
      description="Model providers behind AI-assisted drafting. Configured models can be overridden per provider via the OPENAI_MODEL / ANTHROPIC_MODEL / META_MODEL environment variables."
      integrationIds={["openai", "anthropic", "meta-model"]}
    />
  );
}
