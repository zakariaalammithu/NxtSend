"use client";

/**
 * Admin → Support → Knowledge Base (P10 Stage F).
 *
 * CRUD over the Stage E knowledge API. Entries the bot can actually
 * answer from must be published + enabled + indexed in an enabled
 * category — the table shows all three facts so nothing looks live
 * that is not. The preview panel runs the SAME pipeline the widget
 * uses (POST /knowledge/preview writes nothing) and shows the
 * would-be answer, the matched entry and the score band.
 */

import * as React from "react";
import { Loader2, Pencil, Play, Plus, Search, Trash2, X } from "lucide-react";
import { AdminPageHeader, ErrorState, LoadingState, ModeNote } from "@/components/admin/AdminBits";
import { cn } from "@/lib/utils";
import type {
  SupportKnowledgeCategory,
  SupportKnowledgeEntry,
} from "@/lib/support/types";
import {
  errorText,
  supportApi,
  type KnowledgeListResponse,
  type PreviewResponse,
} from "./api";

interface EntryForm {
  category_id: string;
  title: string;
  question: string;
  answer: string;
  keywords: string;
  related_url: string;
  priority: number;
  enabled: boolean;
  status: "draft" | "published" | "archived";
}

const EMPTY_FORM: EntryForm = {
  category_id: "",
  title: "",
  question: "",
  answer: "",
  keywords: "",
  related_url: "",
  priority: 50,
  enabled: true,
  status: "draft",
};

const inputCls =
  "w-full rounded-xl border border-black-700 bg-black-800 px-3 py-2 text-13 text-white placeholder:text-black-500 focus:border-rose-500 focus:outline-none";
const labelCls = "block text-12 font-semibold text-black-200 mb-1.5";

export function SupportKnowledge() {
  const [mode, setMode] = React.useState("demo");
  const [entries, setEntries] = React.useState<SupportKnowledgeEntry[]>([]);
  const [categories, setCategories] = React.useState<SupportKnowledgeCategory[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [forbidden, setForbidden] = React.useState(false);

  const [search, setSearch] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("");

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [form, setForm] = React.useState<EntryForm>(EMPTY_FORM);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [formWarnings, setFormWarnings] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);

  const [newCategoryName, setNewCategoryName] = React.useState("");
  const [categoryError, setCategoryError] = React.useState<string | null>(null);
  const [renaming, setRenaming] = React.useState<{ id: string; name: string } | null>(null);

  const [previewQuestion, setPreviewQuestion] = React.useState("");
  const [preview, setPreview] = React.useState<PreviewResponse["preview"] | null>(null);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [previewing, setPreviewing] = React.useState(false);

  const load = React.useCallback(async () => {
    const res = await supportApi<KnowledgeListResponse>("/api/admin/support/knowledge");
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
    setEntries(res.body.entries);
    setCategories(res.body.categories);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const categoryName = (id: string) =>
    categories.find((c) => c.id === id)?.name ?? "Unknown category";

  const filtered = entries.filter((entry) => {
    if (categoryFilter && entry.category_id !== categoryFilter) return false;
    if (statusFilter && entry.status !== statusFilter) return false;
    const q = search.trim().toLowerCase();
    if (q) {
      const haystack = `${entry.title} ${entry.question} ${entry.keywords.join(" ")}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, category_id: categories[0]?.id ?? "" });
    setFormError(null);
    setFormWarnings([]);
    setFormOpen(true);
  };

  const openEdit = (entry: SupportKnowledgeEntry) => {
    setEditingId(entry.id);
    setForm({
      category_id: entry.category_id,
      title: entry.title,
      question: entry.question,
      answer: entry.answer,
      keywords: entry.keywords.join(", "),
      related_url: entry.related_url ?? "",
      priority: entry.priority,
      enabled: entry.enabled,
      status: entry.status,
    });
    setFormError(null);
    setFormWarnings([]);
    setFormOpen(true);
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.category_id) return setFormError("Choose a category.");
    if (!form.title.trim()) return setFormError("Title is required.");
    if (!form.question.trim()) return setFormError("Question is required.");
    if (!form.answer.trim()) return setFormError("Answer is required.");
    setSaving(true);
    setFormError(null);
    setFormWarnings([]);
    const payload = {
      category_id: form.category_id,
      title: form.title.trim(),
      question: form.question.trim(),
      answer: form.answer.trim(),
      keywords: form.keywords.split(",").map((k) => k.trim()).filter(Boolean),
      related_url: form.related_url.trim() || null,
      priority: form.priority,
      enabled: form.enabled,
      status: form.status,
    };
    const res = editingId
      ? await supportApi(`/api/admin/support/knowledge/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        })
      : await supportApi("/api/admin/support/knowledge", {
          method: "POST",
          body: JSON.stringify(payload),
        });
    setSaving(false);
    if (res.status === 409) {
      const duplicate = (res.body as { duplicate_of?: { title: string } }).duplicate_of;
      setFormError(
        duplicate
          ? `This question duplicates the existing entry “${duplicate.title}”. Change the question or edit that entry instead.`
          : errorText(res)
      );
      return;
    }
    if (!res.ok) {
      setFormError(errorText(res));
      return;
    }
    const warnings = (res.body as { warnings?: string[] }).warnings ?? [];
    if (warnings.length) setFormWarnings(warnings);
    setFormOpen(false);
    await load();
  };

  const patchEntry = async (entry: SupportKnowledgeEntry, patch: Record<string, unknown>) => {
    const res = await supportApi(`/api/admin/support/knowledge/${entry.id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      setLoadError(errorText(res));
      return;
    }
    await load();
  };

  const deleteEntry = async (entry: SupportKnowledgeEntry) => {
    if (!window.confirm(`Delete the knowledge entry “${entry.title}”? This cannot be undone.`)) return;
    const res = await supportApi(`/api/admin/support/knowledge/${entry.id}`, { method: "DELETE" });
    if (!res.ok) {
      setLoadError(errorText(res));
      return;
    }
    await load();
  };

  const createCategory = async () => {
    if (!newCategoryName.trim()) return;
    setCategoryError(null);
    const res = await supportApi("/api/admin/support/knowledge/categories", {
      method: "POST",
      body: JSON.stringify({ name: newCategoryName.trim(), description: "", enabled: true }),
    });
    if (!res.ok) {
      setCategoryError(errorText(res));
      return;
    }
    setNewCategoryName("");
    await load();
  };

  const patchCategory = async (category: SupportKnowledgeCategory, patch: Record<string, unknown>) => {
    setCategoryError(null);
    const res = await supportApi(`/api/admin/support/knowledge/categories/${category.id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      setCategoryError(errorText(res));
      return;
    }
    await load();
  };

  const deleteCategory = async (category: SupportKnowledgeCategory) => {
    if (!window.confirm(`Delete the category “${category.name}”? Categories with entries cannot be deleted.`)) return;
    setCategoryError(null);
    const res = await supportApi(`/api/admin/support/knowledge/categories/${category.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setCategoryError(errorText(res));
      return;
    }
    await load();
  };

  const runPreview = async () => {
    if (!previewQuestion.trim()) return;
    setPreviewing(true);
    setPreviewError(null);
    setPreview(null);
    const res = await supportApi<PreviewResponse>("/api/admin/support/knowledge/preview", {
      method: "POST",
      body: JSON.stringify({ question: previewQuestion }),
    });
    setPreviewing(false);
    if (!res.ok) {
      setPreviewError(errorText(res));
      return;
    }
    setPreview(res.body.preview);
  };

  const matchedEntry = preview?.source_knowledge_ids.length
    ? entries.find((e) => e.id === preview.source_knowledge_ids[0])
    : undefined;

  return (
    <div className="space-y-5 pb-10">
      <AdminPageHeader
        title="Knowledge Base"
        description="What the support assistant answers from. Only published + enabled entries in enabled categories are used — drafts are never served."
        badge={mode === "demo" ? "Demo Mode" : undefined}
      />
      <ModeNote mode={mode} />

      {forbidden ? (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-950/20 px-5 py-4 text-13 text-amber-200">
          <strong>No support permission.</strong> Your admin account is not an enabled support
          agent, so the knowledge base is not available.
        </div>
      ) : loading ? (
        <LoadingState label="Loading knowledge base…" />
      ) : (
        <>
          {loadError && <ErrorState message={loadError} onRetry={() => void load()} />}

          {/* Preview */}
          <div className="glass-card p-5 space-y-3">
            <h2 className="text-15 font-bold text-white">Preview the assistant</h2>
            <p className="text-12 text-black-400">
              Runs the exact matching pipeline the widget uses. Previewing saves nothing.
            </p>
            <div className="flex gap-2">
              <input
                value={previewQuestion}
                onChange={(e) => setPreviewQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void runPreview();
                }}
                placeholder="Ask a question as a visitor would…"
                aria-label="Preview question"
                className={inputCls}
              />
              <button
                type="button"
                onClick={() => void runPreview()}
                disabled={!previewQuestion.trim() || previewing}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 text-13 font-semibold text-white hover:bg-rose-500 disabled:opacity-40"
              >
                {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Preview answer
              </button>
            </div>
            {previewError && <p className="text-13 text-rose-300">{previewError}</p>}
            {preview && (
              <div className="rounded-xl border border-black-700 bg-black-800/50 p-4 space-y-2" aria-live="polite">
                <div className="flex flex-wrap gap-1.5 text-11 font-bold">
                  <span className="rounded-full bg-purple-500/15 px-2 py-0.5 text-purple-200">
                    Band: {preview.band}
                  </span>
                  <span className="rounded-full bg-black-700 px-2 py-0.5 text-black-200">
                    Score {preview.score}
                  </span>
                  <span className="rounded-full bg-black-700 px-2 py-0.5 text-black-200">
                    Margin {preview.margin}
                  </span>
                  <span className="rounded-full bg-black-700 px-2 py-0.5 text-black-200">
                    Engine {preview.engine}
                  </span>
                  {matchedEntry && (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-200">
                      Matched: {matchedEntry.title}
                    </span>
                  )}
                </div>
                <p className="whitespace-pre-wrap text-13 leading-relaxed text-black-100">{preview.answer}</p>
                {preview.candidates.length > 1 && (
                  <p className="text-11 text-black-500">
                    Other candidates:{" "}
                    {preview.candidates.slice(1).map((c) => `${c.title} (${c.score})`).join(" · ")}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Entry form */}
          {formOpen && (
            <form onSubmit={(e) => void submitForm(e)} className="glass-card p-5 space-y-4" aria-label="Knowledge entry form">
              <div className="flex items-center justify-between">
                <h2 className="text-15 font-bold text-white">
                  {editingId ? "Edit knowledge entry" : "New knowledge entry"}
                </h2>
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  aria-label="Close form"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-black-300 hover:bg-black-700 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {formError && (
                <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-950/20 px-3 py-2 text-12 text-rose-200">
                  {formError}
                </p>
              )}
              {formWarnings.map((w) => (
                <p key={w} className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-12 text-amber-200">
                  {w}
                </p>
              ))}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls} htmlFor="kb-title">Title</label>
                  <input id="kb-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls} placeholder="How much does NxtSend cost?" />
                </div>
                <div>
                  <label className={labelCls} htmlFor="kb-category">Category</label>
                  <select id="kb-category" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} className={inputCls}>
                    <option value="">Choose a category…</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}{c.enabled ? "" : " (disabled)"}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className={labelCls} htmlFor="kb-question">Question / topic visitors ask</label>
                <input id="kb-question" value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} className={inputCls} placeholder="What does NxtSend cost?" />
              </div>
              <div>
                <label className={labelCls} htmlFor="kb-answer">Answer (plain text)</label>
                <textarea id="kb-answer" value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })} rows={5} className={inputCls} placeholder="The answer the assistant gives, word for word." />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls} htmlFor="kb-keywords">Keywords (comma separated)</label>
                  <input id="kb-keywords" value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} className={inputCls} placeholder="price, pricing, plans" />
                </div>
                <div>
                  <label className={labelCls} htmlFor="kb-url">Related URL (site path, optional)</label>
                  <input id="kb-url" value={form.related_url} onChange={(e) => setForm({ ...form, related_url: e.target.value })} className={inputCls} placeholder="/pricing" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className={labelCls} htmlFor="kb-priority">Priority (0–100, tie-break only)</label>
                  <input id="kb-priority" type="number" min={0} max={100} value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="kb-status">Status</label>
                  <select id="kb-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as EntryForm["status"] })} className={inputCls}>
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex cursor-pointer items-center gap-2 text-13 text-black-200">
                    <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="h-4 w-4 accent-rose-500" />
                    Enabled
                  </label>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-13 font-semibold text-white hover:bg-rose-500 disabled:opacity-40">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editingId ? "Save changes" : "Create entry"}
                </button>
                <button type="button" onClick={() => setForm({ ...form, status: form.status === "published" ? "draft" : "published" })} className="rounded-xl border border-black-600 bg-black-800 px-4 py-2 text-13 font-semibold text-white hover:bg-black-700">
                  {form.status === "published" ? "Switch to draft" : "Publish"}
                </button>
              </div>
            </form>
          )}

          {/* Entries table */}
          <div className="glass-card overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-black-700/60 p-3">
              <label className="flex min-w-[200px] flex-1 items-center gap-2 rounded-xl border border-black-700 bg-black-800 px-3 py-2">
                <Search className="h-4 w-4 text-black-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search entries…" aria-label="Search knowledge entries" className="w-full bg-transparent text-13 text-white placeholder:text-black-500 focus:outline-none" />
              </label>
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="Filter by category" className="rounded-xl border border-black-700 bg-black-800 px-2.5 py-2 text-12 text-white">
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status" className="rounded-xl border border-black-700 bg-black-800 px-2.5 py-2 text-12 text-white">
                <option value="">All statuses</option>
                <option value="published">Published</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>
              <button type="button" onClick={openCreate} className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-13 font-semibold text-white hover:bg-rose-500">
                <Plus className="h-4 w-4" /> New entry
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-13">
                <thead>
                  <tr className="border-b border-black-700/60 text-11 uppercase tracking-wide text-black-400">
                    <th className="px-4 py-2.5 font-semibold">Title</th>
                    <th className="px-4 py-2.5 font-semibold">Category</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5 font-semibold">Enabled</th>
                    <th className="px-4 py-2.5 font-semibold">Priority</th>
                    <th className="px-4 py-2.5 font-semibold">Updated</th>
                    <th className="px-4 py-2.5 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((entry) => (
                    <tr key={entry.id} className="border-b border-black-800 last:border-0 hover:bg-black-800/40">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-white">{entry.title}</p>
                        <p className="text-12 text-black-400 line-clamp-1">{entry.question}</p>
                      </td>
                      <td className="px-4 py-3 text-black-300">{categoryName(entry.category_id)}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => void patchEntry(entry, { status: entry.status === "published" ? "draft" : "published" })}
                          title="Toggle published / draft"
                          className={cn(
                            "rounded-full px-2 py-0.5 text-11 font-bold",
                            entry.status === "published"
                              ? "bg-emerald-500/15 text-emerald-300"
                              : entry.status === "archived"
                                ? "bg-black-700 text-black-300"
                                : "bg-amber-500/15 text-amber-300"
                          )}
                        >
                          {entry.status}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={entry.enabled}
                          aria-label={`Enable or disable ${entry.title}`}
                          onClick={() => void patchEntry(entry, { enabled: !entry.enabled })}
                          className={cn(
                            "h-5 w-9 rounded-full p-0.5 transition",
                            entry.enabled ? "bg-emerald-500" : "bg-black-600"
                          )}
                        >
                          <span className={cn("block h-4 w-4 rounded-full bg-white transition", entry.enabled && "translate-x-4")} />
                        </button>
                      </td>
                      <td className="px-4 py-3 text-black-300">{entry.priority}</td>
                      <td className="px-4 py-3 text-black-400">
                        {new Date(entry.updated_at).toLocaleDateString([], { month: "short", day: "numeric" })}
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex gap-1">
                          <button type="button" onClick={() => openEdit(entry)} aria-label={`Edit ${entry.title}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-black-300 hover:bg-black-700 hover:text-white">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => void deleteEntry(entry)} aria-label={`Delete ${entry.title}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-300 hover:bg-rose-950/40 hover:text-rose-200">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-black-400">
                        No entries match these filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Category manager */}
          <div className="glass-card p-5 space-y-3">
            <h2 className="text-15 font-bold text-white">Categories</h2>
            <p className="text-12 text-black-400">
              Disabling a category removes all of its entries from the assistant immediately. A
              category with entries cannot be deleted.
            </p>
            {categoryError && <p className="text-13 text-rose-300">{categoryError}</p>}
            <ul className="divide-y divide-black-800">
              {categories.map((category) => (
                <li key={category.id} className="flex flex-wrap items-center gap-2 py-2.5">
                  {renaming?.id === category.id ? (
                    <>
                      <input
                        value={renaming.name}
                        onChange={(e) => setRenaming({ id: category.id, name: e.target.value })}
                        aria-label="Category name"
                        className={cn(inputCls, "max-w-[240px]")}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          void patchCategory(category, { name: renaming.name });
                          setRenaming(null);
                        }}
                        className="rounded-lg bg-rose-600 px-3 py-1.5 text-12 font-semibold text-white hover:bg-rose-500"
                      >
                        Save
                      </button>
                      <button type="button" onClick={() => setRenaming(null)} className="rounded-lg bg-black-700 px-3 py-1.5 text-12 font-semibold text-white">
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="min-w-[180px] text-13 font-semibold text-white">{category.name}</span>
                      <span className="text-12 text-black-500">{category.slug}</span>
                      <span className="ml-auto flex items-center gap-1.5">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={category.enabled}
                          aria-label={`Enable or disable category ${category.name}`}
                          onClick={() => void patchCategory(category, { enabled: !category.enabled })}
                          className={cn("h-5 w-9 rounded-full p-0.5 transition", category.enabled ? "bg-emerald-500" : "bg-black-600")}
                        >
                          <span className={cn("block h-4 w-4 rounded-full bg-white transition", category.enabled && "translate-x-4")} />
                        </button>
                        <button type="button" onClick={() => setRenaming({ id: category.id, name: category.name })} className="rounded-lg px-2 py-1.5 text-12 font-semibold text-black-200 hover:bg-black-700 hover:text-white">
                          Rename
                        </button>
                        <button type="button" onClick={() => void deleteCategory(category)} aria-label={`Delete category ${category.name}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-300 hover:bg-rose-950/40">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="New category name"
                aria-label="New category name"
                className={cn(inputCls, "max-w-[280px]")}
              />
              <button type="button" onClick={() => void createCategory()} disabled={!newCategoryName.trim()} className="inline-flex items-center gap-1.5 rounded-xl bg-black-700 px-3.5 text-13 font-semibold text-white hover:bg-black-600 disabled:opacity-40">
                <Plus className="h-4 w-4" /> Add category
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
