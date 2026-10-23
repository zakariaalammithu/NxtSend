/**
 * Email content lint — heuristic deliverability hints for the email
 * composing surfaces (sequence email steps, inbox replies).
 *
 * These are RULE-OF-THUMB hints, presented in the UI as exactly that:
 * dismissible, never blocking a send, and never a score or a promise
 * about inbox placement. Spam filtering depends on the recipient's
 * provider, the domain's reputation and history — no client-side
 * check can certify a message as "not spam".
 *
 * Pure function — no I/O, safe in client components.
 */

export interface EmailLintInput {
  subject?: string;
  body?: string;
  /**
   * "campaign" = bulk outreach (subject rules apply).
   * "reply" = a 1:1 conversation reply (subject is inherited, so
   * subject rules are skipped). Unsubscribe needs no rule in either
   * context: the send path appends it at send time (P5 Stage C).
   */
  context?: "campaign" | "reply";
}

export interface EmailLintHint {
  id: string;
  message: string;
}

const URL_SHORTENERS = [
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "ow.ly",
  "is.gd",
  "buff.ly",
  "cutt.ly",
  "rb.gy",
  "shorturl.at",
  "rebrand.ly",
  "short.io",
];

/** Phrases heavily associated with spam in filter training data. */
const SPAM_PHRASES = [
  "free money",
  "100% free",
  "act now",
  "risk-free",
  "risk free",
  "no obligation",
  "buy now",
  "order now",
  "cash bonus",
  "make money fast",
  "earn extra cash",
  "double your",
  "guaranteed income",
  "you've been selected",
  "you have been selected",
  "claim your prize",
  "winner",
  "limited time offer",
  "once in a lifetime",
  "no catch",
  "credit card debt",
  "lowest price ever",
  "increase sales",
];

function lettersOf(text: string): string[] {
  return text.split("").filter((c) => /[a-zA-Z]/.test(c));
}

function capsRatio(text: string): number {
  const letters = lettersOf(text);
  if (letters.length === 0) return 0;
  const upper = letters.filter((c) => c === c.toUpperCase()).length;
  return upper / letters.length;
}

function findUrls(text: string): string[] {
  return text.match(/https?:\/\/[^\s)<>"']+/gi) ?? [];
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Text with URLs, HTML tags and template tokens removed — what a reader actually reads. */
function proseOf(text: string): string {
  return text
    .replace(/https?:\/\/[^\s)<>"']+/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\{\{[^}]*\}\}/g, " ")
    .replace(/\{[a-z_]+(:[^}]*)?\}/gi, " ");
}

export function lintEmailContent(input: EmailLintInput): EmailLintHint[] {
  const subject = (input.subject ?? "").trim();
  const body = (input.body ?? "").trim();
  const context = input.context ?? "campaign";
  const hints: EmailLintHint[] = [];

  // Nothing written yet — nothing to hint about.
  if (!subject && !body) return hints;

  if (context === "campaign" && body && !subject) {
    hints.push({
      id: "missing-subject",
      message:
        "No subject line — mail without a subject is more likely to be filtered, and far less likely to be opened.",
    });
  }

  if (subject && lettersOf(subject).length >= 8 && capsRatio(subject) >= 0.7) {
    hints.push({
      id: "subject-all-caps",
      message:
        "The subject line is mostly ALL CAPS — a classic spam-filter trigger, and it reads as shouting. Sentence case works better.",
    });
  }

  if (body && lettersOf(body).length >= 40 && capsRatio(body) >= 0.6) {
    hints.push({
      id: "body-all-caps",
      message:
        "Large parts of the body are in ALL CAPS — filters and readers both tend to dislike it. Rewriting in normal case usually helps.",
    });
  }

  const bangs = (subject + body).split("!").length - 1;
  if (bangs >= 3) {
    hints.push({
      id: "excessive-exclamation",
      message: `There are ${bangs} exclamation marks — heavy punctuation is a common spam signal. One is plenty.`,
    });
  }

  const urls = findUrls(body);
  const words = wordCount(proseOf(body));
  if (
    urls.length >= 3 &&
    (words < 60 || urls.length / Math.max(words, 1) > 0.1)
  ) {
    hints.push({
      id: "link-density",
      message: `The email carries ${urls.length} links in very little text — link-heavy, text-light mail matches a common phishing/spam pattern. Add real content or drop some links.`,
    });
  }

  const shortener = urls
    .map((u) => {
      try {
        return new URL(u).hostname.toLowerCase().replace(/^www\./, "");
      } catch {
        return "";
      }
    })
    .find((host) => URL_SHORTENERS.includes(host));
  if (shortener) {
    hints.push({
      id: "url-shortener",
      message: `A link uses the shortener ${shortener} — shorteners hide the real destination, which hurts both trust and filtering. Link to the real URL instead.`,
    });
  }

  const referencesImage =
    /<img\b/i.test(body) ||
    /!\[[^\]]*\]\(/.test(body) ||
    urls.some((u) => /\.(png|jpe?g|gif|webp|svg)(\?|#|$)/i.test(u));
  if (body && referencesImage && words < 5) {
    hints.push({
      id: "image-only",
      message:
        "The email is (almost) only an image — image-only mail is frequently filtered, blocked by default in many clients, and invisible to screen readers. Add real text alongside it.",
    });
  }

  // NOTE: there is deliberately no "missing unsubscribe" hint anymore.
  // Since P5 Stage C the send path appends a signed one-click
  // unsubscribe footer + List-Unsubscribe headers at send time
  // (src/lib/email/unsubscribe.ts), so the template itself no longer
  // needs an unsubscribe line — nagging for one here would be wrong.

  const haystack = ` ${`${subject} ${body}`.toLowerCase().replace(/\s+/g, " ")} `;
  const foundPhrases = SPAM_PHRASES.filter((p) => haystack.includes(p)).slice(0, 3);
  if (foundPhrases.length > 0) {
    hints.push({
      id: "spam-phrases",
      message: `Wording heavily associated with spam: ${foundPhrases
        .map((p) => `"${p}"`)
        .join(", ")}. A plainer rewording usually avoids the association.`,
    });
  }

  return hints;
}
