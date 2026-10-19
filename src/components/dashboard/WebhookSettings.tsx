"use client";

/**
 * Outbound Webhooks settings (n8n / Zapier / custom endpoints).
 *
 * Reads its state from /api/webhooks/config — the badge shows the real
 * derived state (Demo Mode / Not Connected / Configuration Required /
 * Connected), never a hardcoded one. The signing secret is generated
 * server-side and shown exactly once after the first save; afterwards
 * only "secret configured" is displayed.
 */

import * as React from "react";
import { Webhook, Save, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui";
import { PROVIDER_STATE_LABELS, type ProviderState } from "@/lib/env";
import {
  WEBHOOK_EVENT_TYPES,
  WEBHOOK_EVENT_DESCRIPTIONS,
  type WebhookEventType,
} from "@/lib/webhooks/events";

interface DeliveryRow {
  id: string;
  event_type: string;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
}

interface ConfigResponse {
  state: ProviderState;
  config: {
    url: string | null;
    events: WebhookEventType[];
    enabled: boolean;
    hasSecret: boolean;
  };
  deliveries: DeliveryRow[];
  note?: string;
  secret?: string;
  secretNote?: string;
  error?: string;
}

const STATE_BADGE: Record<ProviderState, "green" | "gray" | "yellow" | "blue" | "red"> = {
  connected: "green",
  not_connected: "gray",
  configuration_required: "yellow",
  demo: "blue",
  error: "red",
};

export default function WebhookSettings() {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [state, setState] = React.useState<ProviderState>("not_connected");
  const [url, setUrl] = React.useState("");
  const [events, setEvents] = React.useState<WebhookEventType[]>([...WEBHOOK_EVENT_TYPES]);
  const [enabled, setEnabled] = React.useState(true);
  const [hasSecret, setHasSecret] = React.useState(false);
  const [deliveries, setDeliveries] = React.useState<DeliveryRow[]>([]);
  const [note, setNote] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [oneTimeSecret, setOneTimeSecret] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/webhooks/config");
      const data = (await res.json()) as ConfigResponse;
      if (data.config) {
        setState(data.state);
        setUrl(data.config.url ?? "");
        setEvents(data.config.events.length ? data.config.events : [...WEBHOOK_EVENT_TYPES]);
        setEnabled(data.config.enabled);
        setHasSecret(data.config.hasSecret);
        setDeliveries(data.deliveries ?? []);
        setNote(data.note ?? null);
      } else if (data.error) {
        setError(data.error);
      }
    } catch {
      setError("Could not load webhook settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const toggleEvent = (event: WebhookEventType) => {
    setEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setOneTimeSecret(null);
    try {
      const res = await fetch("/api/webhooks/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, events, enabled }),
      });
      const data = (await res.json()) as ConfigResponse;
      if (!res.ok) {
        setError(data.error ?? "Saving failed.");
        return;
      }
      setState(data.state);
      setHasSecret(data.config.hasSecret);
      if (data.secret) setOneTimeSecret(data.secret);
      setNote(data.note ?? "Webhook subscription saved.");
      void load();
    } catch {
      setError("Saving failed (network error).");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section id="webhook-settings" className="glass-card p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-black-800 border border-black-700 text-purple-400">
            <Webhook className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-16 font-bold text-white">Outbound Webhooks — n8n / Zapier</h2>
            <p className="text-13 text-black-300 mt-0.5 leading-relaxed">
              Send signed events to your automation endpoint when leads and campaigns change.
              Payloads are signed with HMAC-SHA256 (<span className="font-mono text-12">X-NxtSend-Signature</span>).
            </p>
          </div>
        </div>
        <Badge variant={STATE_BADGE[state]}>{PROVIDER_STATE_LABELS[state]}</Badge>
      </div>

      {note && (
        <p className="rounded-xl border border-black-700 bg-black-800/60 px-4 py-3 text-12 text-black-300 leading-relaxed">
          {note}
        </p>
      )}
      {error && (
        <p className="rounded-xl border border-rose-500/40 bg-rose-950/20 px-4 py-3 text-12 text-rose-200">
          {error}
        </p>
      )}
      {oneTimeSecret && (
        <div className="rounded-xl border border-orange-500/40 bg-orange-950/20 px-4 py-3 text-12 text-orange-200 space-y-1">
          <p className="font-semibold text-white">Signing secret — shown once, store it now:</p>
          <p className="font-mono break-all">{oneTimeSecret}</p>
          <p>Use it in your receiver to verify the X-NxtSend-Signature header (scheme documented in SETUP.md).</p>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label className="block text-11 text-black-400 mb-1">Endpoint URL (https)</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-n8n.example.com/webhook/nxtsend"
            className="input-field py-2 text-13 w-full"
          />
        </div>
        <div>
          <span className="block text-11 text-black-400 mb-1.5">Events</span>
          <div className="space-y-1.5">
            {WEBHOOK_EVENT_TYPES.map((event) => (
              <label key={event} className="flex items-start gap-2 text-13 text-black-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={events.includes(event)}
                  onChange={() => toggleEvent(event)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-mono text-12 text-white">{event}</span>
                  <span className="block text-12 text-black-400">{WEBHOOK_EVENT_DESCRIPTIONS[event]}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-13 text-black-200 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span>Subscription enabled</span>
        </label>
        <p className="text-12 text-black-400">
          Signing secret: {hasSecret ? "configured (stored server-side, never displayed again)" : "will be generated on first save"}.
        </p>
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading || !url}
            className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 px-5 py-2 text-13 font-semibold text-white transition-colors disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            <span>{saving ? "Saving…" : "Save webhook settings"}</span>
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-black-800 hover:bg-black-700 border border-black-600 px-4 py-2 text-13 text-white transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="pt-4 border-t border-black-700/60">
        <h3 className="text-13 font-semibold text-white mb-2">Recent deliveries</h3>
        {loading ? (
          <p className="text-12 text-black-400">Loading…</p>
        ) : deliveries.length === 0 ? (
          <p className="text-12 text-black-400">
            No deliveries yet. Events appear here after a lead is created/imported or a campaign changes status.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {deliveries.slice(0, 10).map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 text-12 text-black-300"
              >
                <span className="font-mono">{d.event_type}</span>
                <span className="text-black-500">{new Date(d.created_at).toLocaleString()}</span>
                <span
                  className={
                    d.status === "delivered"
                      ? "text-emerald-400"
                      : d.status === "simulated"
                        ? "text-sky-400"
                        : d.status === "failed"
                          ? "text-rose-400"
                          : "text-black-300"
                  }
                >
                  {d.status}
                  {d.attempts > 0 ? ` · ${d.attempts} attempt${d.attempts === 1 ? "" : "s"}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        {state === "demo" && (
          <p className="text-11 text-black-500 mt-2">
            Demo Mode deliveries are simulated and logged — endpoints are never actually called.
          </p>
        )}
      </div>
    </section>
  );
}
