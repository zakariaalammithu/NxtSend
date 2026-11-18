"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Check, Loader2 } from "lucide-react";
import { DemoBanner, Badge } from "@/components/ui";
import {
  ALL_OAUTH_SCOPES,
  SCOPE_DESCRIPTIONS,
} from "@/lib/muse-connector/oauth/scopes";

/**
 * Dashboard → Developers → API keys.
 *
 * The one API-key system in the product (migration 028,
 * `nxtsend_api_keys`): scoped, expirable, revocable keys for the
 * n8n REST API, managed through the session-authenticated routes
 * GET / POST / DELETE /api/integrations/n8n/api-keys.
 *
 * Honest limits, stated on the page rather than hidden:
 *  - A key is `nxt_live_` + 32 base64url chars. Only the SHA-256
 *    hash is stored; the value is shown exactly ONCE at creation
 *    and never again — not in lists, not in logs, never as a hash.
 *  - Keys carry n8n.read / n8n.write ONLY (there is no n8n.send
 *    tier) and authorize /api/integrations/n8n/v1 ONLY. The REST
 *    auth layer resolves a `nxt_live_` Bearer token only when the
 *    platform is n8n — a key presented to Zapier, Make, Pabbly,
 *    Albato or Activepieces is refused. Those platforms
 *    authenticate with OAuth grants carrying their own
 *    <platform>.read / <platform>.write scopes (listed below);
 *    extending keys to them needs a backend change, not a UI one.
 *  - Demo Mode refuses the routes (503): demo data is never
 *    exposed to an external integration.
 */

interface ApiKeyEntry {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
}

const AUTOMATION_PREFIXES = ["zapier", "n8n", "make", "pabbly", "albato", "activepieces"] as const;

export default function ApiKeysPage() {
  const [keys, setKeys] = React.useState<ApiKeyEntry[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [newKeyName, setNewKeyName] = React.useState("");
  const [newKeyRead, setNewKeyRead] = React.useState(true);
  const [newKeyWrite, setNewKeyWrite] = React.useState(false);
  const [newKeyExpiry, setNewKeyExpiry] = React.useState("");
  const [createBusy, setCreateBusy] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [createdKey, setCreatedKey] = React.useState<string | null>(null);
  const [createdKeyName, setCreatedKeyName] = React.useState<string | null>(null);
  const [revokeBusy, setRevokeBusy] = React.useState<string | null>(null);
  const [revokeError, setRevokeError] = React.useState<string | null>(null);
  const [revokeNotice, setRevokeNotice] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const loadKeys = React.useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/n8n/api-keys");
      const body = (await res.json().catch(() => null)) as
        | { keys?: ApiKeyEntry[]; api_keys?: ApiKeyEntry[]; error?: string }
        | null;
      if (!res.ok) throw new Error(body?.error ?? `API keys request failed (HTTP ${res.status})`);
      setKeys(body?.keys ?? body?.api_keys ?? []);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load API keys.");
    }
  }, []);

  React.useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  const createKey = async () => {
    setCreateBusy(true);
    setCreateError(null);
    setCreatedKey(null);
    setCreatedKeyName(null);
    try {
      const scopes = [
        ...(newKeyRead ? ["n8n.read"] : []),
        ...(newKeyWrite ? ["n8n.write"] : []),
      ];
      if (scopes.length === 0) throw new Error("Pick at least one scope (n8n.read is the recommended default).");
      if (!newKeyName.trim()) throw new Error("Give the key a name (e.g. “Production n8n”).");
      const res = await fetch("/api/integrations/n8n/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newKeyName.trim(),
          scopes,
          ...(newKeyExpiry ? { expires_at: newKeyExpiry } : {}),
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { key?: string; api_key?: { key?: string }; plaintext_key?: string; error?: string }
        | null;
      if (!res.ok) throw new Error(body?.error ?? `Create key failed (HTTP ${res.status})`);
      const plain = body?.key ?? body?.api_key?.key ?? body?.plaintext_key ?? null;
      if (!plain) throw new Error("The server created the key but did not return its value — it cannot be recovered. Revoke it and create a new one.");
      setCreatedKey(plain);
      setCreatedKeyName(newKeyName.trim());
      setNewKeyName("");
      setNewKeyExpiry("");
      await loadKeys();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Create key failed.");
    } finally {
      setCreateBusy(false);
    }
  };

  const revokeKey = async (keyId: string, keyName: string) => {
    if (!window.confirm(`Revoke the API key “${keyName}”? n8n workflows using it will start failing with 401 immediately. This cannot be undone.`)) return;
    setRevokeBusy(keyId);
    setRevokeError(null);
    setRevokeNotice(null);
    try {
      const res = await fetch(`/api/integrations/n8n/api-keys?id=${encodeURIComponent(keyId)}`, {
        method: "DELETE",
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? `Revoke failed (HTTP ${res.status})`);
      setRevokeNotice(`API key “${keyName}” revoked.`);
      await loadKeys();
    } catch (err) {
      setRevokeError(err instanceof Error ? err.message : "Revoke failed.");
    } finally {
      setRevokeBusy(null);
    }
  };

  const copyCreatedKey = async () => {
    if (!createdKey) return;
    try {
      await navigator.clipboard.writeText(createdKey);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the key is still shown in full and selectable.
    }
  };

  const activeKeys = keys === null ? null : keys.filter((k) => !k.revoked_at);

  return (
    <div className="space-y-6 pb-14">
      <DemoBanner feature="Developer API keys" />

      <div>
        <Link
          href="/dashboard/developers"
          className="inline-flex items-center gap-1.5 text-13 font-semibold text-black-300 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Developers
        </Link>
        <h1 className="mt-2 text-24 sm:text-28 font-bold tracking-tight text-white">API keys</h1>
        <p className="mt-1 text-14 text-black-300 leading-relaxed max-w-3xl">
          Scoped, expirable, revocable keys for the n8n REST API. Keys are stored as hashes only
          and the key value is shown <strong className="text-white">exactly once</strong> at
          creation — copy it into n8n immediately; it can never be shown again. A lost key must be
          revoked and replaced. NxtSend API keys are not n8n instance credentials — your n8n login
          is unrelated and is never entered here.
        </p>
      </div>

      <section className="glass-card p-6 space-y-4">
        <h2 className="text-16 font-bold text-white">What a key can do — and what it cannot</h2>
        <p className="text-13 text-black-300 leading-relaxed">
          A key authorizes <code className="font-mono text-black-100">/api/integrations/n8n/v1</code> only,
          as a Bearer token (<code className="font-mono text-black-100">Authorization: Bearer nxt_live_…</code>).
          The other platforms — Zapier, Make, Pabbly, Albato, Activepieces — refuse API keys and
          authenticate with OAuth grants carrying their own scopes (below). A key holding only{" "}
          <code className="font-mono text-black-100">n8n.read</code> gets 403 on every mutation;
          write does not imply read.
        </p>
        <div className="divide-y divide-black-700/60">
          {AUTOMATION_PREFIXES.map((prefix) => {
            const scopes = (ALL_OAUTH_SCOPES as readonly string[]).filter((s) =>
              s.startsWith(`${prefix}.`)
            );
            return (
              <div key={prefix} className="py-3 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-13 font-semibold text-white">{prefix}</span>
                  {prefix === "n8n" ? (
                    <Badge variant="success" size="sm">API keys accepted</Badge>
                  ) : (
                    <Badge variant="gray" size="sm">OAuth only — no API keys</Badge>
                  )}
                </div>
                {scopes.map((scope) => (
                  <p key={scope} className="text-12 text-black-400 leading-relaxed">
                    <code className="font-mono text-black-200">{scope}</code>
                    {` — ${SCOPE_DESCRIPTIONS[scope as keyof typeof SCOPE_DESCRIPTIONS]}`}
                  </p>
                ))}
                {prefix !== "n8n" && (
                  <p className="text-12 text-black-400 leading-relaxed">
                    There is no <code className="font-mono text-black-200">{prefix}.send</code>{" "}
                    tier: {prefix === "zapier" ? "Zapier" : prefix === "make" ? "Make" : prefix === "pabbly" ? "Pabbly Connect" : prefix === "albato" ? "Albato" : "Activepieces"}{" "}
                    never sends LinkedIn messages, and email inbox replies are covered by the write tier.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="glass-card p-6 space-y-4">
        <h2 className="text-16 font-bold text-white">Your API keys</h2>
        {loadError && <p className="text-13 text-rose-200 leading-relaxed">{loadError}</p>}
        {!loadError && keys === null && <p className="text-13 text-black-400">Loading API keys…</p>}
        {!loadError && keys !== null && keys.length === 0 && (
          <p className="text-13 text-black-300 leading-relaxed">
            No API keys yet — create one below. Until a key exists (or an OAuth grant), nothing is
            connected via n8n.
          </p>
        )}
        {keys !== null && keys.length > 0 && (
          <div className="divide-y divide-black-700/60">
            {keys.map((k) => (
              <div key={k.id} className="py-3 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-13 font-semibold text-white">{k.name}</span>
                  <code className="font-mono text-11 text-black-400">{k.key_prefix}…</code>
                  <Badge variant={k.revoked_at ? "gray" : "success"} size="sm">
                    {k.revoked_at ? "Revoked" : "Active"}
                  </Badge>
                </div>
                <p className="text-12 text-black-300">
                  Scopes: {k.scopes.length > 0 ? k.scopes.join(", ") : "—"}
                </p>
                <p className="text-12 text-black-400">
                  Created {new Date(k.created_at).toLocaleString()}
                  {k.expires_at ? ` · expires ${new Date(k.expires_at).toLocaleString()}` : " · never expires"}
                  {" · "}Last used: {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "never"}
                  {k.revoked_at ? ` · revoked ${new Date(k.revoked_at).toLocaleString()}` : ""}
                </p>
                {!k.revoked_at && (
                  <button
                    type="button"
                    onClick={() => void revokeKey(k.id, k.name)}
                    disabled={revokeBusy === k.id}
                    className="inline-flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-950/30 hover:bg-rose-950/50 disabled:opacity-50 px-3 py-1.5 text-12 font-semibold text-rose-200 transition-colors"
                  >
                    {revokeBusy === k.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    {revokeBusy === k.id ? "Revoking…" : "Revoke key"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {revokeNotice && <p className="text-13 text-green-300">{revokeNotice}</p>}
        {revokeError && <p className="text-13 text-rose-200">{revokeError}</p>}
        {activeKeys !== null && activeKeys.some((k) => k.last_used_at !== null) && (
          <p className="text-13 text-black-300 leading-relaxed">
            <strong className="text-white">API-key signal:</strong> at least one key below has been
            used — n8n has called the API with a key. That is a real connection signal.
          </p>
        )}
        <div className="space-y-3 pt-2">
          <h3 className="text-13 font-semibold text-white">Create a new API key</h3>
          <label className="block space-y-1">
            <span className="text-12 text-black-300">Name</span>
            <input
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="Production n8n"
              className="w-full rounded-xl bg-black-800 border border-black-700 px-3 py-2 text-13 text-white placeholder:text-black-500"
            />
          </label>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-13 text-black-300">
              <input type="checkbox" checked={newKeyRead} onChange={(e) => setNewKeyRead(e.target.checked)} />
              <code className="font-mono text-black-100">n8n.read</code> (recommended)
            </label>
            <label className="flex items-center gap-2 text-13 text-black-300">
              <input type="checkbox" checked={newKeyWrite} onChange={(e) => setNewKeyWrite(e.target.checked)} />
              <code className="font-mono text-black-100">n8n.write</code>
            </label>
          </div>
          <p className="text-12 text-black-400 leading-relaxed">
            Only n8n scopes are offered here because the key system accepts only{" "}
            <code className="font-mono text-black-200">n8n.read</code> /{" "}
            <code className="font-mono text-black-200">n8n.write</code> — the server drops any
            other scope from a create request. The other platforms&apos; scopes above are OAuth
            grant scopes, not key scopes.
          </p>
          <label className="block space-y-1">
            <span className="text-12 text-black-300">Expiry (optional — leave blank for no expiry)</span>
            <input
              type="date"
              value={newKeyExpiry}
              onChange={(e) => setNewKeyExpiry(e.target.value)}
              className="w-full rounded-xl bg-black-800 border border-black-700 px-3 py-2 text-13 text-white"
            />
          </label>
          <button
            type="button"
            onClick={() => void createKey()}
            disabled={createBusy}
            className="inline-flex items-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 px-4 py-2 text-13 font-semibold text-white transition-colors"
          >
            {createBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {createBusy ? "Creating…" : "Create API key"}
          </button>
          {createError && <p className="text-13 text-rose-200">{createError}</p>}
          {createdKey && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 space-y-2">
              <p className="text-13 font-semibold text-amber-200">
                Copy it now — this key will never be shown again.
              </p>
              <p className="text-12 text-black-300 leading-relaxed">
                Key “{createdKeyName}” was created. Store it in n8n&apos;s NxtSend API credential
                immediately; after you leave this box there is no way to recover it.
              </p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 rounded-xl bg-black-800 border border-black-700 px-3 py-2 font-mono text-12 text-amber-100 break-all">
                  {createdKey}
                </code>
                <button
                  type="button"
                  onClick={() => void copyCreatedKey()}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-black-600 bg-black-800 px-2.5 py-1.5 text-11 font-semibold text-black-200 hover:text-white transition-colors"
                  aria-label="Copy key"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <button
                type="button"
                onClick={() => { setCreatedKey(null); setCreatedKeyName(null); }}
                className="inline-flex items-center gap-2 rounded-xl border border-black-600 px-3 py-1.5 text-12 font-semibold text-black-300 hover:text-white transition-colors"
              >
                I&apos;ve copied it — hide the key
              </button>
            </div>
          )}
        </div>
      </section>

      <p className="text-12 text-black-400 leading-relaxed">
        The same keys are manageable from the{" "}
        <Link href="/dashboard/integrations/n8n" className="font-semibold text-purple-300 hover:text-white transition-colors">
          n8n Integration Center page
        </Link>{" "}
        (API keys section). Full endpoint reference:{" "}
        <Link href="/dashboard/developers" className="font-semibold text-purple-300 hover:text-white transition-colors">
          Developers
        </Link>
        .
      </p>
    </div>
  );
}
