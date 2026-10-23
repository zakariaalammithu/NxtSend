/**
 * Support chat — pure input validation & plain-text sanitisation
 * (P10 Stage E). No I/O; everything here is unit-tested.
 *
 * Content rule: bodies are PLAIN TEXT end to end. Sanitisation strips
 * NUL/control characters (keeping \n and \t), trims, and enforces the
 * length caps by REJECTION (never silent truncation) — the same
 * discipline as the submissions core.
 */

export const SUPPORT_LIMITS = {
  messageBody: 4000,
  guestName: 120,
  subject: 200,
  knowledgeTitle: 160,
  knowledgeQuestion: 300,
  knowledgeAnswer: 4000,
  categoryName: 80,
  savedReplyTitle: 120,
  savedReplyBody: 4000,
  settingsText: 2000,
  displayName: 80,
  supportEmail: 254,
  clientMessageId: 128,
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Strip control characters except newline/tab; normalise line endings. */
export function sanitisePlainText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
}

export type FieldResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function validateMessageBody(value: unknown): FieldResult<string> {
  const body = sanitisePlainText(value);
  if (!body) return { ok: false, error: "Message body is required" };
  if (body.length > SUPPORT_LIMITS.messageBody) {
    return {
      ok: false,
      error: `Message must be at most ${SUPPORT_LIMITS.messageBody} characters`,
    };
  }
  return { ok: true, value: body };
}

export function validateGuestIdentity(input: {
  name?: unknown;
  email?: unknown;
}): FieldResult<{ name: string | null; email: string | null }> {
  const name = sanitisePlainText(input.name);
  const emailRaw = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (name.length > SUPPORT_LIMITS.guestName) {
    return { ok: false, error: `Name must be at most ${SUPPORT_LIMITS.guestName} characters` };
  }
  if (emailRaw && (emailRaw.length > SUPPORT_LIMITS.supportEmail || !EMAIL_RE.test(emailRaw))) {
    return { ok: false, error: "Email address is not valid" };
  }
  return { ok: true, value: { name: name || null, email: emailRaw || null } };
}

export function validateClientMessageId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > SUPPORT_LIMITS.clientMessageId) return null;
  return trimmed;
}

/**
 * related_url rule: a same-site path (/…) or an https://nxtsend.com
 * URL. Anything else (other hosts, javascript:, protocol-relative)
 * is rejected — KB links must never send visitors off-site on an
 * admin's say-so.
 */
export function validateRelatedUrl(value: unknown): FieldResult<string | null> {
  if (value === null || value === undefined || value === "") return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, error: "related_url must be a string" };
  const url = value.trim();
  if (url.startsWith("/") && !url.startsWith("//") && !url.includes("\\")) {
    return { ok: true, value: url };
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" && parsed.hostname === "nxtsend.com") {
      return { ok: true, value: url };
    }
  } catch {
    /* fall through to rejection */
  }
  return {
    ok: false,
    error: "related_url must be a same-site path (/…) or an https://nxtsend.com URL",
  };
}

export function slugify(input: string): string {
  const slug = input
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "item";
}

function asTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export interface KnowledgeInput {
  category_id: string;
  title: string;
  question: string;
  answer: string;
  keywords: string[];
  related_url: string | null;
  priority: number;
  enabled: boolean;
  status: "draft" | "published" | "archived";
}

export function validateKnowledgeInput(
  input: Record<string, unknown>,
  partial: boolean
): FieldResult<Partial<KnowledgeInput>> {
  const out: Partial<KnowledgeInput> = {};
  const has = (key: string) => Object.prototype.hasOwnProperty.call(input, key);

  if (!partial || has("category_id")) {
    const categoryId = asTrimmed(input.category_id);
    if (!categoryId) return { ok: false, error: "category_id is required" };
    out.category_id = categoryId;
  }
  if (!partial || has("title")) {
    const title = sanitisePlainText(input.title);
    if (!title) return { ok: false, error: "title is required" };
    if (title.length > SUPPORT_LIMITS.knowledgeTitle) {
      return { ok: false, error: `title must be at most ${SUPPORT_LIMITS.knowledgeTitle} characters` };
    }
    out.title = title;
  }
  if (!partial || has("question")) {
    const question = sanitisePlainText(input.question);
    if (!question) return { ok: false, error: "question is required" };
    if (question.length > SUPPORT_LIMITS.knowledgeQuestion) {
      return { ok: false, error: `question must be at most ${SUPPORT_LIMITS.knowledgeQuestion} characters` };
    }
    out.question = question;
  }
  if (!partial || has("answer")) {
    const answer = sanitisePlainText(input.answer);
    if (!answer) return { ok: false, error: "answer is required" };
    if (answer.length > SUPPORT_LIMITS.knowledgeAnswer) {
      return { ok: false, error: `answer must be at most ${SUPPORT_LIMITS.knowledgeAnswer} characters` };
    }
    out.answer = answer;
  }
  if (!partial || has("keywords")) {
    const raw = input.keywords;
    if (raw === undefined) {
      out.keywords = [];
    } else if (!Array.isArray(raw) || raw.some((k) => typeof k !== "string")) {
      return { ok: false, error: "keywords must be an array of strings" };
    } else {
      const keywords = raw
        .map((k) => sanitisePlainText(k))
        .filter(Boolean)
        .slice(0, 30);
      if (keywords.some((k) => k.length > 60)) {
        return { ok: false, error: "each keyword must be at most 60 characters" };
      }
      out.keywords = keywords;
    }
  }
  if (!partial || has("related_url")) {
    const url = validateRelatedUrl(input.related_url);
    if (!url.ok) return url;
    out.related_url = url.value;
  }
  if (!partial || has("priority")) {
    const priority = input.priority === undefined ? 50 : Number(input.priority);
    if (!Number.isFinite(priority) || priority < 0 || priority > 100) {
      return { ok: false, error: "priority must be a number between 0 and 100" };
    }
    out.priority = Math.round(priority);
  }
  if (!partial || has("enabled")) {
    out.enabled = input.enabled === undefined ? true : Boolean(input.enabled);
  }
  if (!partial || has("status")) {
    const status = input.status === undefined ? "draft" : input.status;
    if (status !== "draft" && status !== "published" && status !== "archived") {
      return { ok: false, error: 'status must be "draft", "published" or "archived"' };
    }
    out.status = status;
  }
  return { ok: true, value: out };
}

export interface SavedReplyInput {
  title: string;
  category_id: string | null;
  shortcut: string | null;
  body: string;
  enabled: boolean;
}

export function validateSavedReplyInput(
  input: Record<string, unknown>,
  partial: boolean
): FieldResult<Partial<SavedReplyInput>> {
  const out: Partial<SavedReplyInput> = {};
  const has = (key: string) => Object.prototype.hasOwnProperty.call(input, key);

  if (!partial || has("title")) {
    const title = sanitisePlainText(input.title);
    if (!title) return { ok: false, error: "title is required" };
    if (title.length > SUPPORT_LIMITS.savedReplyTitle) {
      return { ok: false, error: `title must be at most ${SUPPORT_LIMITS.savedReplyTitle} characters` };
    }
    out.title = title;
  }
  if (!partial || has("body")) {
    const body = sanitisePlainText(input.body);
    if (!body) return { ok: false, error: "body is required" };
    if (body.length > SUPPORT_LIMITS.savedReplyBody) {
      return { ok: false, error: `body must be at most ${SUPPORT_LIMITS.savedReplyBody} characters` };
    }
    out.body = body;
  }
  if (!partial || has("category_id")) {
    const categoryId = asTrimmed(input.category_id);
    out.category_id = categoryId || null;
  }
  if (!partial || has("shortcut")) {
    const shortcut = asTrimmed(input.shortcut).toLowerCase();
    if (shortcut && !/^[a-z0-9][a-z0-9-]{0,39}$/.test(shortcut)) {
      return { ok: false, error: "shortcut must be lowercase letters, numbers and hyphens (max 40)" };
    }
    out.shortcut = shortcut || null;
  }
  if (!partial || has("enabled")) {
    out.enabled = input.enabled === undefined ? true : Boolean(input.enabled);
  }
  return { ok: true, value: out };
}

export interface CategoryInput {
  name: string;
  description: string;
  enabled: boolean;
  sort_order: number;
}

export function validateCategoryInput(
  input: Record<string, unknown>,
  partial: boolean
): FieldResult<Partial<CategoryInput>> {
  const out: Partial<CategoryInput> = {};
  const has = (key: string) => Object.prototype.hasOwnProperty.call(input, key);

  if (!partial || has("name")) {
    const name = sanitisePlainText(input.name);
    if (!name) return { ok: false, error: "name is required" };
    if (name.length > SUPPORT_LIMITS.categoryName) {
      return { ok: false, error: `name must be at most ${SUPPORT_LIMITS.categoryName} characters` };
    }
    out.name = name;
  }
  if (!partial || has("description")) {
    const description = sanitisePlainText(input.description);
    if (description.length > 500) {
      return { ok: false, error: "description must be at most 500 characters" };
    }
    out.description = description;
  }
  if (!partial || has("enabled")) {
    out.enabled = input.enabled === undefined ? true : Boolean(input.enabled);
  }
  if (!partial || has("sort_order")) {
    const sortOrder = input.sort_order === undefined ? 0 : Number(input.sort_order);
    if (!Number.isFinite(sortOrder)) return { ok: false, error: "sort_order must be a number" };
    out.sort_order = Math.round(sortOrder);
  }
  return { ok: true, value: out };
}

export type SettingsPatch = Partial<
  Omit<import("./types").SupportSettings, "id" | "updated_by" | "updated_at">
>;

export function validateSettingsPatch(
  input: Record<string, unknown>
): FieldResult<SettingsPatch> {
  const out: SettingsPatch = {};
  const has = (key: string) => Object.prototype.hasOwnProperty.call(input, key);
  const boolKeys = [
    "ai_kb_enabled",
    "ai_enhancement_enabled",
    "live_support_enabled",
    "allow_user_escalation",
  ] as const;
  for (const key of boolKeys) {
    if (has(key)) {
      if (typeof input[key] !== "boolean") return { ok: false, error: `${key} must be a boolean` };
      out[key] = input[key] as boolean;
    }
  }
  const textKeys = [
    "greeting",
    "welcome_message",
    "offline_message",
    "closing_message",
  ] as const;
  for (const key of textKeys) {
    if (has(key)) {
      const value = sanitisePlainText(input[key]);
      if (value.length > SUPPORT_LIMITS.settingsText) {
        return { ok: false, error: `${key} must be at most ${SUPPORT_LIMITS.settingsText} characters` };
      }
      out[key] = value;
    }
  }
  if (has("display_name")) {
    const value = sanitisePlainText(input.display_name);
    if (!value) return { ok: false, error: "display_name is required" };
    if (value.length > SUPPORT_LIMITS.displayName) {
      return { ok: false, error: `display_name must be at most ${SUPPORT_LIMITS.displayName} characters` };
    }
    out.display_name = value;
  }
  if (has("support_email")) {
    const value = asTrimmed(input.support_email).toLowerCase();
    if (!EMAIL_RE.test(value) || value.length > SUPPORT_LIMITS.supportEmail) {
      return { ok: false, error: "support_email must be a valid email address" };
    }
    out.support_email = value;
  }
  return { ok: true, value: out };
}

/** Preview text for list rendering: plain text, single line, capped. */
export function makePreview(body: string, max = 160): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
