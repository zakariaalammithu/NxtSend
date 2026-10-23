"use client";

/**
 * Admin → Support → Saved Replies (P10 Stage F).
 *
 * Canned responses agents insert from the inbox composer. Categories
 * here reuse the knowledge categories (the API's category_id on a
 * saved reply references the same table). Editing a template never
 * rewrites messages already sent — the API snapshots the body into
 * each message.
 */

import * as React from "react";
import { Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { AdminPageHeader, ErrorState, LoadingState, ModeNote } from "@/components/admin/AdminBits";
import { cn } from "@/lib/utils";
import type { SupportSavedReply } from "@/lib/support/types";
import { errorText, supportApi, type KnowledgeListResponse, type SavedRepliesResponse } from "./api";

const inputCls =
  "w-full rounded-xl border border-black-700 bg-black-800 px-3 py-2 text-13 text-white placeholder:text-black-500 focus:border-rose-500 focus:outline-none";
const labelCls = "block text-12 font-semibold text-black-200 mb-1.5";

interface ReplyForm {
  title: string;
  body: string;
  category_id: string;
  shortcut: string;
  enabled: boolean;
}

const EMPTY: ReplyForm = { title: "", body: "", category_id: "", shortcut: "", enabled: true };

export function SupportReplies() {
  const [mode, setMode] = React.useState("demo");
  const [replies, setReplies] = React.useState<SupportSavedReply[]>([]);
  const [categories, setCategories] = React.useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [forbidden, setForbidden] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState("");
  const [previewId, setPreviewId] = React.useState<string | null>(null);

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [form, setForm] = React.useState<ReplyForm>(EMPTY);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    const res = await supportApi<SavedRepliesResponse>("/api/admin/support/saved-replies");
    if (res.status === 403) {
      setForbidden(true);
      setLoading(false);
      return;
    }
    if (!res.ok) {
      setLoadError(errorText(res));
      setLoading(false);
      return;
    }
    setMode(res.body.mode);
    setReplies(res.body.replies);
    setLoading(false);
    // Category names come from the knowledge endpoint (same table).
    const kb = await supportApi<KnowledgeListResponse>("/api/admin/support/knowledge");
    if (kb.ok) {
      setCategories(kb.body.categories.map((c) => ({ id: c.id, name: c.name })));
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const categoryName = (id: string | null) =>
    id ? categories.find((c) => c.id === id)?.name ?? "—" : "—";

  const filtered = replies.filter((reply) => {
    if (categoryFilter && reply.category_id !== categoryFilter) return false;
    const q = search.trim().toLowerCase();
    if (q && !`${reply.title} ${reply.body} ${reply.shortcut ?? ""}`.toLowerCase().includes(q)) {
      return false;
    }
    return true;
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return setFormError("Title is required.");
    if (!form.body.trim()) return setFormError("Body is required.");
    setSaving(true);
    setFormError(null);
    const payload = {
      title: form.title.trim(),
      body: form.body.trim(),
      category_id: form.category_id || null,
      shortcut: form.shortcut.trim() || null,
      enabled: form.enabled,
    };
    const res = editingId
      ? await supportApi(`/api/admin/support/saved-replies/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        })
      : await supportApi("/api/admin/support/saved-replies", {
          method: "POST",
          body: JSON.stringify(payload),
        });
    setSaving(false);
    if (!res.ok) {
      setFormError(errorText(res));
      return;
    }
    setFormOpen(false);
    await load();
  };

  const patch = async (reply: SupportSavedReply, body: Record<string, unknown>) => {
    const res = await supportApi(`/api/admin/support/saved-replies/${reply.id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    if (!res.ok) setLoadError(errorText(res));
    await load();
  };

  const remove = async (reply: SupportSavedReply) => {
    if (!window.confirm(`Delete the saved reply “${reply.title}”?`)) return;
    const res = await supportApi(`/api/admin/support/saved-replies/${reply.id}`, {
      method: "DELETE",
    });
    if (!res.ok) setLoadError(errorText(res));
    await load();
  };

  return (
    <div className="space-y-5 pb-10">
      <AdminPageHeader
        title="Saved Replies"
        description="Canned responses the support team can insert from the inbox. Editing a template never changes messages that were already sent."
        badge={mode === "demo" ? "Demo Mode" : undefined}
      />
      <ModeNote mode={mode} />

      {forbidden ? (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-950/20 px-5 py-4 text-13 text-amber-200">
          <strong>No support permission.</strong> Your admin account is not an enabled support
          agent, so saved replies are not available.
        </div>
      ) : loading ? (
        <LoadingState label="Loading saved replies…" />
      ) : (
        <>
          {loadError && <ErrorState message={loadError} onRetry={() => void load()} />}

          {formOpen && (
            <form onSubmit={(e) => void submit(e)} className="glass-card p-5 space-y-4" aria-label="Saved reply form">
              <div className="flex items-center justify-between">
                <h2 className="text-15 font-bold text-white">
                  {editingId ? "Edit saved reply" : "New saved reply"}
                </h2>
                <button type="button" onClick={() => setFormOpen(false)} aria-label="Close form" className="flex h-8 w-8 items-center justify-center rounded-lg text-black-300 hover:bg-black-700 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>
              {formError && (
                <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-950/20 px-3 py-2 text-12 text-rose-200">
                  {formError}
                </p>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls} htmlFor="reply-title">Title</label>
                  <input id="reply-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls} placeholder="Billing — where is my invoice?" />
                </div>
                <div>
                  <label className={labelCls} htmlFor="reply-shortcut">Shortcut (optional)</label>
                  <input id="reply-shortcut" value={form.shortcut} onChange={(e) => setForm({ ...form, shortcut: e.target.value })} className={inputCls} placeholder="invoice" />
                </div>
              </div>
              <div>
                <label className={labelCls} htmlFor="reply-body">Body (plain text)</label>
                <textarea id="reply-body" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={5} className={inputCls} placeholder="The exact text inserted into the composer." />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls} htmlFor="reply-category">Category</label>
                  <select id="reply-category" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} className={inputCls}>
                    <option value="">No category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex cursor-pointer items-center gap-2 text-13 text-black-200">
                    <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="h-4 w-4 accent-rose-500" />
                    Enabled
                  </label>
                </div>
              </div>
              <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-13 font-semibold text-white hover:bg-rose-500 disabled:opacity-40">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingId ? "Save changes" : "Create reply"}
              </button>
            </form>
          )}

          <div className="glass-card overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-black-700/60 p-3">
              <label className="flex min-w-[200px] flex-1 items-center gap-2 rounded-xl border border-black-700 bg-black-800 px-3 py-2">
                <Search className="h-4 w-4 text-black-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search replies…" aria-label="Search saved replies" className="w-full bg-transparent text-13 text-white placeholder:text-black-500 focus:outline-none" />
              </label>
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="Filter by category" className="rounded-xl border border-black-700 bg-black-800 px-2.5 py-2 text-12 text-white">
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setForm(EMPTY);
                  setFormError(null);
                  setFormOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-13 font-semibold text-white hover:bg-rose-500"
              >
                <Plus className="h-4 w-4" /> New reply
              </button>
            </div>
            <ul className="divide-y divide-black-800">
              {filtered.map((reply) => (
                <li key={reply.id} className="px-4 py-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-13 font-semibold text-white">{reply.title}</p>
                    <span className="rounded-full bg-black-700 px-2 py-0.5 text-10 font-bold text-black-200">
                      {categoryName(reply.category_id)}
                    </span>
                    {reply.shortcut && (
                      <span className="rounded-full bg-black-800 px-2 py-0.5 text-10 font-bold text-black-400">
                        /{reply.shortcut}
                      </span>
                    )}
                    <span className={cn("rounded-full px-2 py-0.5 text-10 font-bold", reply.enabled ? "bg-emerald-500/15 text-emerald-300" : "bg-black-700 text-black-300")}>
                      {reply.enabled ? "Enabled" : "Disabled"}
                    </span>
                    <span className="ml-auto flex gap-1">
                      <button type="button" onClick={() => setPreviewId(previewId === reply.id ? null : reply.id)} className="rounded-lg px-2 py-1.5 text-12 font-semibold text-black-200 hover:bg-black-700 hover:text-white">
                        {previewId === reply.id ? "Hide" : "Preview"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void patch(reply, { enabled: !reply.enabled })}
                        className="rounded-lg px-2 py-1.5 text-12 font-semibold text-black-200 hover:bg-black-700 hover:text-white"
                      >
                        {reply.enabled ? "Disable" : "Enable"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(reply.id);
                          setForm({
                            title: reply.title,
                            body: reply.body,
                            category_id: reply.category_id ?? "",
                            shortcut: reply.shortcut ?? "",
                            enabled: reply.enabled,
                          });
                          setFormError(null);
                          setFormOpen(true);
                        }}
                        aria-label={`Edit ${reply.title}`}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-black-300 hover:bg-black-700 hover:text-white"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => void remove(reply)} aria-label={`Delete ${reply.title}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-300 hover:bg-rose-950/40">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </span>
                  </div>
                  {previewId === reply.id && (
                    <p className="mt-2 whitespace-pre-wrap rounded-xl bg-black-800/70 px-3.5 py-2.5 text-13 leading-relaxed text-black-100">
                      {reply.body}
                    </p>
                  )}
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="px-4 py-8 text-center text-13 text-black-400">No saved replies match.</li>
              )}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
