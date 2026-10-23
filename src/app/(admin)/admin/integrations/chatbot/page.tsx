import { redirect } from "next/navigation";

/**
 * The old "AI Chatbot" placeholder under Integrations is superseded by
 * the real Support section (P10 Stage F): the chatbot's behaviour
 * settings live under Support → Chat Settings.
 */
export default function AdminChatbotRedirectPage() {
  redirect("/admin/support/settings");
}
