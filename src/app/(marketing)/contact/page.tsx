"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Mail, MapPin, Clock, CheckCircle2, Send, MessageSquare } from "lucide-react";

const contactSchema = z.object({
  firstName: z.string().min(2, "First name must be at least 2 characters"),
  lastName: z.string().min(2, "Last name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  subject: z.string().min(3, "Subject must be at least 3 characters"),
  message: z.string().min(10, "Message must be at least 10 characters"),
});

type ContactFormData = z.infer<typeof contactSchema>;

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

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
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
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
                    <p className="text-12 text-black-500 mt-0.5">Average reply time &lt; 2 hours</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-600/20 text-orange-400 border border-orange-500/30">
                    <MapPin className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-13 font-semibold uppercase tracking-wider text-black-400">
                      Headquarters
                    </h3>
                    <p className="mt-1 text-15 font-medium text-white leading-relaxed">
                      Austin, TX 73301, USA
                    </p>
                    <p className="text-12 text-black-500 mt-0.5">Global cloud infrastructure</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-black-700 text-green-400 border border-black-600">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-13 font-semibold uppercase tracking-wider text-black-400">
                      Support Hours
                    </h3>
                    <p className="mt-1 text-15 font-medium text-white">
                      Monday – Friday: 24/5
                    </p>
                    <p className="text-12 text-black-500 mt-0.5">24/7 for Enterprise & Agency tiers</p>
                  </div>
                </div>
              </div>

              {/* Social links removed (Fix Batch 3): the icons linked to bare
                  platform homepages (linkedin.com, twitter.com, …) and no
                  verified NxtSend profiles exist yet. Re-add once real
                  profile URLs exist. */}
            </div>
          </div>

          {/* ─── Contact Form Right ──────────────────────────────────── */}
          <div className="lg:col-span-7">
            <div className="glass-card p-8 sm:p-9 relative">
              {submitted ? (
                <div className="py-12 text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20 text-green-400 border border-green-500/30 mb-6">
                    <CheckCircle2 className="h-8 w-8" />
                  </div>
                  <h3 className="text-26 font-bold text-white">
                    Thanks! We&apos;ll be in touch within 24 hours.
                  </h3>
                  <p className="mt-3 text-14 text-black-300 max-w-md mx-auto">
                    Your message has been assigned to our customer support team. Expect a response shortly.
                  </p>
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
                      Our product and support teams will get back to you promptly.
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
                      placeholder="How can we help your team?"
                      {...register("message")}
                      className={`input-field resize-none ${errors.message ? "border-red-500" : ""}`}
                    />
                    {errors.message && (
                      <p className="mt-1 text-12 text-red-400">{errors.message.message}</p>
                    )}
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
      </div>
    </div>
  );
}
