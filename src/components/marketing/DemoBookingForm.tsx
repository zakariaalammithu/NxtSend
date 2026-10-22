"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, CheckCircle2 } from "lucide-react";

/**
 * Demo booking block.
 *
 * Booking is not handed off to an external calendar service — none
 * is embedded or linked here. This is the app's own booking-request
 * form, headed by a generic team
 * block — no named hosts and no individual photos — with a plain
 * request label on the submit button.
 *
 * The form is clearly a request form: submitting it does not book a
 * calendar slot. The request IS stored, though: it posts to
 * POST /api/submissions (source "demo") and appears in
 * Admin → Submissions — the success panel below is only shown after
 * the server confirms storage.
 */

const bookingSchema = z.object({
  name: z.string().min(2, "Please enter your name"),
  email: z.string().email("Please enter a valid work email address"),
  company: z.string().min(2, "Company name is required"),
  teamSize: z.string().min(1, "Please select your team size"),
  message: z.string().max(1000, "Please keep your message under 1000 characters").optional(),
});

type BookingFormData = z.infer<typeof bookingSchema>;

export function DemoBookingForm() {
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BookingFormData>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      name: "",
      email: "",
      company: "",
      teamSize: "",
      message: "",
    },
  });

  const onSubmit = async (data: BookingFormData) => {
    // Stored via POST /api/submissions (source "demo"). Still NOT a
    // calendar booking — the stored request is what the team replies
    // to by email, exactly as the copy below the form states.
    setSubmitError(null);
    const message =
      data.message && data.message.trim().length >= 10
        ? data.message.trim()
        : `Demo booking request from ${data.company} (team size: ${data.teamSize}). Please contact me to arrange a personalized demo.`;
    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "demo",
          name: data.name,
          email: data.email,
          company: data.company,
          subject: "Demo booking request",
          message,
          meta: { team_size: data.teamSize },
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
    <div className="glass-card mx-auto max-w-3xl p-8 sm:p-10">
      {/* Intro block — generic team heading, no named hosts */}
      <div className="mb-8 flex flex-col items-start gap-5 border-b border-black-700/80 pb-8">
        <div>
          <h3 className="text-22 font-bold text-white">
            Request a personal walkthrough with our team
          </h3>
          <p className="mt-1.5 text-13 leading-relaxed text-black-400">
            Use the form below to send us a booking request. Sending it
            does not reserve a calendar slot — our team will reply by
            email to agree a time that works for you.
          </p>
        </div>
      </div>

      {submitted ? (
        <div className="py-10 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-green-500/30 bg-green-500/20 text-green-400">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h4 className="text-24 font-bold text-white">
            Thank you — your request is with us.
          </h4>
          <p className="mx-auto mt-3 max-w-md text-15 text-black-300">
            Nothing has been added to a calendar yet. A member of our
            team will email you shortly to arrange a time for your
            walkthrough.
          </p>
          <button
            type="button"
            onClick={() => setSubmitted(false)}
            className="mt-8 inline-flex items-center gap-2 rounded-xl border border-black-600 bg-black-800 px-6 py-2.5 text-13 font-semibold text-white hover:bg-black-700"
          >
            Submit another request
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-13 font-medium text-black-300">
                Name <span className="text-orange-500">*</span>
              </label>
              <input
                type="text"
                placeholder="Sarah Miller"
                {...register("name")}
                className={`input-field ${errors.name ? "border-red-500" : ""}`}
              />
              {errors.name && (
                <p className="mt-1 text-12 text-red-400">{errors.name.message}</p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-13 font-medium text-black-300">
                Work Email <span className="text-orange-500">*</span>
              </label>
              <input
                type="email"
                placeholder="sarah@company.com"
                {...register("email")}
                className={`input-field ${errors.email ? "border-red-500" : ""}`}
              />
              {errors.email && (
                <p className="mt-1 text-12 text-red-400">{errors.email.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-13 font-medium text-black-300">
                Company <span className="text-orange-500">*</span>
              </label>
              <input
                type="text"
                placeholder="Your company name"
                {...register("company")}
                className={`input-field ${errors.company ? "border-red-500" : ""}`}
              />
              {errors.company && (
                <p className="mt-1 text-12 text-red-400">{errors.company.message}</p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-13 font-medium text-black-300">
                Team Size <span className="text-orange-500">*</span>
              </label>
              <select
                {...register("teamSize")}
                className={`input-field bg-black-800 text-white ${errors.teamSize ? "border-red-500" : ""}`}
              >
                <option value="">Select team size...</option>
                <option value="1-5">1 – 5 people</option>
                <option value="6-20">6 – 20 people</option>
                <option value="21-50">21 – 50 people</option>
                <option value="51-200">51 – 200 people</option>
                <option value="201+">201+ people</option>
              </select>
              {errors.teamSize && (
                <p className="mt-1 text-12 text-red-400">{errors.teamSize.message}</p>
              )}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-13 font-medium text-black-300">
              Message <span className="text-black-500">(optional)</span>
            </label>
            <textarea
              rows={4}
              placeholder="Tell us how your team does outreach today and what you would like us to cover..."
              {...register("message")}
              className={`input-field resize-none ${errors.message ? "border-red-500" : ""}`}
            />
            {errors.message && (
              <p className="mt-1 text-12 text-red-400">{errors.message.message}</p>
            )}
          </div>

          {submitError && (
            <div className="rounded-xl border border-red-500/30 bg-red-600/10 p-3.5 text-13 text-red-300">
              Couldn&apos;t send your request: {submitError} Your details are
              still in the form — please try again.
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="group flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-brand text-15 font-semibold text-white shadow-glow-purple transition-all duration-200 hover:scale-[1.01] hover:shadow-glow-orange active:scale-[0.99] disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>Sending request...</span>
              ) : (
                <>
                  <span>Send booking request</span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </button>
            <p className="mt-4 text-center text-12 text-black-400">
              Prefer another way to reach us?{" "}
              <Link
                href="/contact"
                className="font-semibold text-white underline decoration-purple-400 underline-offset-2 hover:text-purple-300"
              >
                Visit our contact page
              </Link>
            </p>
          </div>
        </form>
      )}
    </div>
  );
}
