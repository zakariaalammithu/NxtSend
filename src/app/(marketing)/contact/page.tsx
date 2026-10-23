"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Mail,
  MapPin,
  CheckCircle2,
  Send,
  MessageSquare,
  Linkedin,
  Facebook,
  CalendarDays,
  LifeBuoy,
  Handshake,
  ArrowRight,
} from "lucide-react";

/* Owner-supplied profiles (P6). These are the only social URLs the
   page and footer may link — earlier placeholders pointed at bare
   platform homepages and were removed in Fix Batch 3. */
const LINKEDIN_URL = "https://www.linkedin.com/company/NxtSend";
const FACEBOOK_URL = "https://web.facebook.com/NxtSend";

const contactSchema = z.object({
  firstName: z
    .string()
    .min(2, "First name must be at least 2 characters")
    .max(120, "First name must be at most 120 characters"),
  lastName: z
    .string()
    .min(2, "Last name must be at least 2 characters")
    .max(120, "Last name must be at most 120 characters"),
  email: z
    .string()
    .email("Please enter a valid email address")
    .max(254, "Email must be at most 254 characters"),
  subject: z
    .string()
    .min(3, "Subject must be at least 3 characters")
    .max(200, "Subject must be at most 200 characters"),
  message: z
    .string()
    .min(10, "Message must be at least 10 characters")
    .max(5000, "Message must be at most 5000 characters"),
  // Honeypot (server-side trap, see /api/submissions): a hidden
  // field humans never fill. Not a real form field — no validation.
  website: z.string().optional(),
});

type ContactFormData = z.infer<typeof contactSchema>;

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [demoCapture, setDemoCapture] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      subject: "",
      message: "",
      website: "",
    },
  });

  const onSubmit = async (data: ContactFormData) => {
    // Real capture: POST /api/submissions stores the enquiry (see
    // Admin → Submissions). The success panel below is only shown
    // after the server confirms storage — previously this handler
    // console.log'd the data and discarded it.
    setSubmitError(null);
    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "contact",
          name: `${data.firstName} ${data.lastName}`.trim(),
          email: data.email,
          subject: data.subject,
          message: data.message,
          website: data.website ?? "",
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const body = (await res.json().catch(() => ({}))) as {
        id?: string;
        mode?: string;
      };
      // The submission reference the API returns — shown so the
      // visitor can quote it if they follow up by email.
      setReference(typeof body.id === "string" ? body.id.slice(0, 8) : null);
      // Demo Mode honesty: the message was captured in the demo
      // store only — no email notification leaves the app.
      setDemoCapture(body.mode === "demo");
      setSubmitted(true);
      reset();
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    }
  };

  return (
    <div className="relative min-h-screen overflow-x-clip bg-black-900 pt-12 pb-24">
      {/* Glow Effects */}
      <div className="pointer-events-none absolute top-0 left-1/2 h-[450px] w-[800px] -translate-x-1/2 rounded-full bg-purple-600/15 blur-[140px]" />

      <div className="section-container relative z-10">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-purple-900/30 px-3.5 py-1 text-12 font-semibold text-purple-300">
            <MessageSquare className="h-3.5 w-3.5 text-purple-400" />
            <span>Support & Inquiries</span>
          </div>
          <h1 className="mt-4 text-40 sm:text-54 font-extrabold text-white tracking-tight">
            Get in touch
          </h1>
          <p className="mt-4 text-16 sm:text-18 text-black-300">
            Have questions about our multi-account platform, pricing plans, or technical capabilities? We are here to help.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 max-w-5xl mx-auto items-start">
          {/* ─── Contact Info Left ───────────────────────────────────── */}
          <div className="lg:col-span-5 space-y-6">
            <div className="glass-card p-7 sm:p-8">
              <h2 className="text-20 font-bold text-white mb-6">
                Contact Information
              </h2>

              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30">
                    <Mail className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-13 font-semibold uppercase tracking-wider text-black-400">
                      Email Us
                    </h3>
                    <a
                      href="mailto:hello@nxtsend.com"
                      className="mt-1 block text-16 font-medium text-white hover:text-purple-300 transition-colors"
                    >
                      hello@nxtsend.com
                    </a>
                    <p className="text-12 text-black-500 mt-0.5">For sales, support and partnership enquiries</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-600/20 text-orange-400 border border-orange-500/30">
                    <MapPin className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-13 font-semibold uppercase tracking-wider text-black-400">
                      Office
                    </h3>
                    <p className="mt-1 text-15 font-medium text-white leading-relaxed">
                      Austin, TX 73301, USA
                    </p>
                  </div>
                </div>
              </div>

              {/* Social profiles — owner-supplied URLs (P6). Fix Batch 3
                  removed the old icons because they pointed at bare
                  platform homepages; these link to the real company
                  profiles, matching the footer. */}
              <div className="mt-8 border-t border-black-700/60 pt-6">
                <h3 className="text-13 font-semibold uppercase tracking-wider text-black-400">
                  Follow Us
                </h3>
                <div className="mt-3.5 flex flex-wrap gap-3">
                  <a
                    href={LINKEDIN_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl border border-black-600 bg-black-800 px-4 py-2.5 text-13 font-semibold text-white transition-colors hover:border-purple-500/50 hover:text-purple-300"
                  >
                    <Linkedin className="h-4 w-4" />
                    LinkedIn
                  </a>
                  <a
                    href={FACEBOOK_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl border border-black-600 bg-black-800 px-4 py-2.5 text-13 font-semibold text-white transition-colors hover:border-purple-500/50 hover:text-purple-300"
                  >
                    <Facebook className="h-4 w-4" />
                    Facebook
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* ─── Contact Form Right ──────────────────────────────────── */}
          <div className="lg:col-span-7">
            <div id="contact-form" className="glass-card p-8 sm:p-9 relative scroll-mt-28">
              {submitted ? (
                <div className="py-12 text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20 text-green-400 border border-green-500/30 mb-6">
                    <CheckCircle2 className="h-8 w-8" />
                  </div>
                  <h3 className="text-26 font-bold text-white">
                    Thanks — your message is on its way.
                  </h3>
                  <p className="mt-3 text-14 text-black-300 max-w-md mx-auto">
                    We&apos;ve received your message and will reply to the email address you gave us.
                  </p>
                  {reference && (
                    <p className="mt-4 text-13 text-black-400">
                      Your reference:{" "}
                      <span className="font-mono font-semibold text-white">
                        {reference}
                      </span>{" "}
                      — please quote this reference if you email us about
                      this message.
                    </p>
                  )}
                  {demoCapture && (
                    <p className="mt-3 text-12 text-orange-300 max-w-md mx-auto">
                      Demo Mode: this message was captured in the demo
                      store only — no email notification was sent.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => setSubmitted(false)}
                    className="mt-8 inline-flex items-center gap-2 rounded-xl border border-black-600 bg-black-800 px-6 py-2.5 text-13 font-semibold text-white hover:bg-black-700"
                  >
                    Send another message
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <div className="border-b border-black-700/80 pb-3 mb-2">
                    <h3 className="text-20 font-bold text-white">
                      Send Us a Message
                    </h3>
                    <p className="text-13 text-black-400 mt-1">
                      Fill in the form and we&apos;ll reply by email.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-13 font-medium text-black-300 mb-1.5">
                        First Name <span className="text-orange-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Alex"
                        {...register("firstName")}
                        className={`input-field ${errors.firstName ? "border-red-500" : ""}`}
                      />
                      {errors.firstName && (
                        <p className="mt-1 text-12 text-red-400">{errors.firstName.message}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-13 font-medium text-black-300 mb-1.5">
                        Last Name <span className="text-orange-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Chen"
                        {...register("lastName")}
                        className={`input-field ${errors.lastName ? "border-red-500" : ""}`}
                      />
                      {errors.lastName && (
                        <p className="mt-1 text-12 text-red-400">{errors.lastName.message}</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-13 font-medium text-black-300 mb-1.5">
                      Email Address <span className="text-orange-500">*</span>
                    </label>
                    <input
                      type="email"
                      maxLength={254}
                      placeholder="alex@company.com"
                      {...register("email")}
                      className={`input-field ${errors.email ? "border-red-500" : ""}`}
                    />
                    {errors.email && (
                      <p className="mt-1 text-12 text-red-400">{errors.email.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-13 font-medium text-black-300 mb-1.5">
                      Subject <span className="text-orange-500">*</span>
                    </label>
                    <input
                      type="text"
                      maxLength={200}
                      placeholder="Partnership inquiry / Technical question"
                      {...register("subject")}
                      className={`input-field ${errors.subject ? "border-red-500" : ""}`}
                    />
                    {errors.subject && (
                      <p className="mt-1 text-12 text-red-400">{errors.subject.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-13 font-medium text-black-300 mb-1.5">
                      Message <span className="text-orange-500">*</span>
                    </label>
                    <textarea
                      rows={5}
                      maxLength={5000}
                      placeholder="How can we help your team?"
                      {...register("message")}
                      className={`input-field resize-none ${errors.message ? "border-red-500" : ""}`}
                    />
                    {errors.message && (
                      <p className="mt-1 text-12 text-red-400">{errors.message.message}</p>
                    )}
                  </div>

                  {/* Honeypot — hidden from humans (off-screen,
                      removed from the tab order); bots that fill it
                      are silently dropped server-side. */}
                  <div
                    aria-hidden="true"
                    className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden"
                  >
                    <label>
                      Website
                      <input
                        type="text"
                        tabIndex={-1}
                        autoComplete="off"
                        {...register("website")}
                      />
                    </label>
                  </div>

                  {submitError && (
                    <div className="rounded-xl border border-red-500/30 bg-red-600/10 p-3.5 text-13 text-red-300">
                      Couldn&apos;t send your message: {submitError} Your text
                      is still in the form — please try again.
                    </div>
                  )}

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-brand text-14 font-semibold text-white shadow-glow-purple transition-all duration-200 hover:shadow-glow-orange hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <span>Sending Message...</span>
                      ) : (
                        <>
                          <Send className="h-4 w-4" />
                          <span>Send Message</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>

        {/* ─── What to contact us about ────────────────────────────────
            Routing hints only — each card restates an existing page or
            flow (the demo request page, this form / email, this form).
            No phone numbers, hours or response-time promises. */}
        <div className="max-w-5xl mx-auto mt-16">
          <h2 className="text-center text-26 sm:text-30 font-bold text-white">
            What to contact us about
          </h2>
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="glass-card p-6 flex flex-col">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30">
                <CalendarDays className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-16 font-bold text-white">Sales &amp; demos</h3>
              <p className="mt-2 flex-1 text-14 leading-relaxed text-black-300">
                Comparing plans or planning a rollout across several accounts? Request a walkthrough and we&apos;ll arrange it by email.
              </p>
              <Link
                href="/demo"
                className="mt-5 inline-flex items-center gap-1.5 text-14 font-semibold text-purple-300 hover:text-purple-200"
              >
                Book a demo
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="glass-card p-6 flex flex-col">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-black-700 text-green-400 border border-black-600">
                <LifeBuoy className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-16 font-bold text-white">Product support</h3>
              <p className="mt-2 flex-1 text-14 leading-relaxed text-black-300">
                Something not behaving as expected, or a question about your workspace? Email us or use the form on this page.
              </p>
              <a
                href="mailto:hello@nxtsend.com"
                className="mt-5 inline-flex items-center gap-1.5 text-14 font-semibold text-purple-300 hover:text-purple-200"
              >
                Email support
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>

            <div className="glass-card p-6 flex flex-col">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-600/20 text-orange-400 border border-orange-500/30">
                <Handshake className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-16 font-bold text-white">Partnerships</h3>
              <p className="mt-2 flex-1 text-14 leading-relaxed text-black-300">
                Integration ideas, agency arrangements or something else entirely — tell us what you have in mind in the form above.
              </p>
              <a
                href="#contact-form"
                className="mt-5 inline-flex items-center gap-1.5 text-14 font-semibold text-purple-300 hover:text-purple-200"
              >
                Send a message
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
