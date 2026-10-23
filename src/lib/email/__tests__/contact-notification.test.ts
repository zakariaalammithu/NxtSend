import { describe, it, expect } from "vitest";
import {
  buildContactNotificationEmail,
  escapeHtml,
  getContactNotificationRecipient,
  sendContactNotification,
  shortSubmissionRef,
  type ContactNotificationFetch,
} from "../contact-notification";

/**
 * P10 Stage C — contact-form notification sender.
 *
 * Honesty contract under test:
 *  - "sent" ONLY when Resend accepts and returns a message id.
 *  - Missing key / From / recipient → "not_configured" and the
 *    provider is NEVER called (no send attempted, no fake success).
 *  - Provider errors / network failures → "failed" with a sanitised,
 *    ≤500-char summary.
 *  - The visitor's address is Reply-To (never From); the body
 *    carries name/email/subject/message/time/reference, and visitor
 *    input is HTML-escaped in the HTML part.
 *
 * (Fixture key assembled from fragments so this file holds no
 * credential-shaped literals.)
 */

const API_KEY = ["re", "fixture", "key", "01"].join("_");
const ENV = {
  RESEND_API_KEY: API_KEY,
  EMAIL_FROM: "NxtSend <hello@nxtsend.com>",
  CONTACT_NOTIFICATION_EMAIL: "nxtsendai@gmail.com",
};

const SUBMISSION = {
  id: "123e4567-e89b-12d3-a456-426614174000",
  name: "Priya Sharma",
  email: "priya@example.com",
  subject: "Pricing question",
  message: "Hello, I would like to know more about agency pricing.",
  created_at: "2026-10-23T10:15:00.000Z",
};

function fetchReturning(response: {
  ok: boolean;
  status: number;
  body?: unknown;
  throws?: boolean;
}) {
  const calls: Array<{ url: string; init: { headers: Record<string, string>; body: string } }> = [];
  const fetchImpl: ContactNotificationFetch = async (url, init) => {
    calls.push({ url, init });
    if (response.throws) throw new Error("socket hang up");
    return {
      ok: response.ok,
      status: response.status,
      json: async () => response.body ?? {},
    };
  };
  return { fetchImpl, calls };
}

describe("getContactNotificationRecipient", () => {
  it("returns the configured recipient", () => {
    expect(getContactNotificationRecipient(ENV)).toBe("nxtsendai@gmail.com");
  });

  it("returns null when unset, placeholder, or not an email — no fallback", () => {
    expect(getContactNotificationRecipient({})).toBeNull();
    expect(
      getContactNotificationRecipient({ CONTACT_NOTIFICATION_EMAIL: "" })
    ).toBeNull();
    expect(
      getContactNotificationRecipient({
        CONTACT_NOTIFICATION_EMAIL: "your-inbox@example.com",
      })
    ).toBeNull();
    expect(
      getContactNotificationRecipient({ CONTACT_NOTIFICATION_EMAIL: "not-an-email" })
    ).toBeNull();
  });
});

describe("buildContactNotificationEmail", () => {
  const email = buildContactNotificationEmail(
    SUBMISSION,
    "nxtsendai@gmail.com",
    "NxtSend <hello@nxtsend.com>"
  );

  it("addresses the team inbox from EMAIL_FROM with the visitor as Reply-To", () => {
    expect(email.to).toBe("nxtsendai@gmail.com");
    expect(email.from).toBe("NxtSend <hello@nxtsend.com>");
    expect(email.replyTo).toBe("priya@example.com");
  });

  it("subject includes the visitor subject and the short reference", () => {
    expect(email.subject).toContain("Pricing question");
    expect(email.subject).toContain(shortSubmissionRef(SUBMISSION.id));
    expect(shortSubmissionRef(SUBMISSION.id)).toBe("123e4567");
  });

  it("body carries name, email, subject, message, time and full reference", () => {
    for (const part of [
      "Priya Sharma",
      "priya@example.com",
      "Pricing question",
      "agency pricing",
      "2026-10-23T10:15:00.000Z",
      SUBMISSION.id,
    ]) {
      expect(email.text).toContain(part);
    }
  });

  it("escapes visitor HTML in the HTML part", () => {
    const malicious = {
      ...SUBMISSION,
      name: "<b>Evil</b>",
      message: "Hi <script>alert('x')</script> & bye",
    };
    const built = buildContactNotificationEmail(
      malicious,
      "nxtsendai@gmail.com",
      "hello@nxtsend.com"
    );
    expect(built.html).not.toContain("<script>alert");
    expect(built.html).toContain("&lt;script&gt;");
    expect(built.html).toContain("&lt;b&gt;Evil&lt;/b&gt;");
    // The text part stays plain (it is not HTML by construction).
    expect(built.text).toContain("<script>alert('x')</script>");
  });

  it("escapeHtml covers the standard five characters", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });
});

describe("sendContactNotification", () => {
  it("sends via Resend and returns the provider id on acceptance", async () => {
    const { fetchImpl, calls } = fetchReturning({
      ok: true,
      status: 200,
      body: { id: "msg_fixture_1" },
    });
    const result = await sendContactNotification(SUBMISSION, {
      env: ENV,
      fetchImpl,
    });
    expect(result.status).toBe("sent");
    expect(result.providerId).toBe("msg_fixture_1");
    expect(result.error).toBeNull();
    expect(result.recipient).toBe("nxtsendai@gmail.com");

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    expect(calls[0].init.headers.Authorization).toBe(`Bearer ${API_KEY}`);
    expect(calls[0].init.headers["Idempotency-Key"]).toBe(
      `contact-notification/${SUBMISSION.id}`
    );
    const payload = JSON.parse(calls[0].init.body) as Record<string, unknown>;
    expect(payload.to).toEqual(["nxtsendai@gmail.com"]);
    expect(payload.from).toBe("NxtSend <hello@nxtsend.com>");
    expect(payload.reply_to).toBe("priya@example.com");
    expect(String(payload.subject)).toContain("Pricing question");
  });

  it("is not_configured (and never calls the provider) when the key is missing", async () => {
    const { fetchImpl, calls } = fetchReturning({ ok: true, status: 200 });
    const result = await sendContactNotification(SUBMISSION, {
      env: { ...ENV, RESEND_API_KEY: undefined },
      fetchImpl,
    });
    expect(result.status).toBe("not_configured");
    expect(calls).toHaveLength(0);
  });

  it("is not_configured when the recipient or the From is missing", async () => {
    const { fetchImpl, calls } = fetchReturning({ ok: true, status: 200 });
    const noRecipient = await sendContactNotification(SUBMISSION, {
      env: { ...ENV, CONTACT_NOTIFICATION_EMAIL: undefined },
      fetchImpl,
    });
    expect(noRecipient.status).toBe("not_configured");
    expect(noRecipient.recipient).toBeNull();

    const noFrom = await sendContactNotification(SUBMISSION, {
      env: { ...ENV, EMAIL_FROM: undefined },
      fetchImpl,
    });
    expect(noFrom.status).toBe("not_configured");
    expect(calls).toHaveLength(0);
  });

  it("maps a provider rejection to failed with a sanitised summary", async () => {
    const { fetchImpl } = fetchReturning({
      ok: false,
      status: 422,
      body: { message: "The `from` address is not verified" },
    });
    const result = await sendContactNotification(SUBMISSION, {
      env: ENV,
      fetchImpl,
    });
    expect(result.status).toBe("failed");
    expect(result.providerId).toBeNull();
    expect(result.error).toContain("not verified");
  });

  it("truncates long provider errors to 500 chars", async () => {
    const { fetchImpl } = fetchReturning({
      ok: false,
      status: 500,
      body: { message: "x".repeat(1200) },
    });
    const result = await sendContactNotification(SUBMISSION, {
      env: ENV,
      fetchImpl,
    });
    expect(result.status).toBe("failed");
    expect(result.error?.length).toBe(500);
  });

  it("maps a network throw to failed", async () => {
    const { fetchImpl } = fetchReturning({ ok: true, status: 200, throws: true });
    const result = await sendContactNotification(SUBMISSION, {
      env: ENV,
      fetchImpl,
    });
    expect(result.status).toBe("failed");
    expect(result.error).toContain("socket hang up");
  });

  it("treats a 200 without a message id as failed, not sent", async () => {
    const { fetchImpl } = fetchReturning({ ok: true, status: 200, body: {} });
    const result = await sendContactNotification(SUBMISSION, {
      env: ENV,
      fetchImpl,
    });
    expect(result.status).toBe("failed");
    expect(result.providerId).toBeNull();
  });

  it("never leaks the API key into the result", async () => {
    const { fetchImpl } = fetchReturning({
      ok: false,
      status: 401,
      body: { message: "API key is invalid" },
    });
    const result = await sendContactNotification(SUBMISSION, {
      env: ENV,
      fetchImpl,
    });
    expect(JSON.stringify(result)).not.toContain(API_KEY);
  });
});
