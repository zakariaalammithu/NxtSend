"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, CheckCircle2 } from "lucide-react";

/**
 * Demo booking block (mirror: aimfox.com/demo).
 *
 * On the mirror, booking a demo happens through Aimfox's own Calendly
 * ("Book a personalized demo with Alex & Ksenija" / "Book now", and the
 * "Book a call" card's Calendly link). Aimfox's Calendly is NOT embedded
 * or linked here. Instead this is the app's own booking-request form,
 * headed by the mirror's host block — Alex & Ksenija's photos and the
 * "Book a personalized demo with Alex & Ksenija" line, with the mirror's
 * "Book now" label on the submit button.
 *
 * The form is clearly a request form: submitting it does not book a
 * calendar slot. Like the app's contact form, it is handled in-app
 * (there is no demo/contact API endpoint in the app yet).
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
    // In-app handling only (same pattern as the contact form):
    // no calendar slot is booked by submitting this form.
    console.log("Demo booking request submitted:", data);
    await new Promise((resolve) => setTimeout(resolve, 600));
    setSubmitted(true);
    reset();
  };

  return (
    <div className="glass-card mx-auto max-w-3xl p-8 sm:p-10">
      {/* Host block (mirror: "Book a personalized demo with Alex & Ksenija") */}
      <div className="mb-8 flex flex-col items-start gap-5 border-b border-black-700/80 pb-8 sm:flex-row sm:items-center">
        <div className="flex shrink-0 items-center">
          <Image
            src="/images/demo/alex.webp"
            alt="Alex"
            width={844}
            height={844}
            className="size-14 rounded-full border-2 border-black-900 object-cover sm:size-16"
          />
          <Image
            src="/images/demo/ksenija.webp"
            alt="Ksenija"
            width={844}
            height={844}
            className="-ml-2 size-14 rounded-full border-2 border-black-900 object-cover sm:size-16"
          />
        </div>
        <div>
          <h3 className="text-22 font-bold text-white">
            Book a personalized demo with Alex &amp; Ksenija
          </h3>
          <p className="mt-1.5 text-13 leading-relaxed text-black-400">
            Send a booking request with the form below. This doesn&apos;t
            book a calendar slot — we&apos;ll reply by email to arrange a
            time for your demo.
          </p>
        </div>
      </div>

      {submitted ? (
        <div className="py-10 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-green-500/30 bg-green-500/20 text-green-400">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h4 className="text-24 font-bold text-white">
            Thanks! Your request has been received.
          </h4>
          <p className="mx-auto mt-3 max-w-md text-15 text-black-300">
            No calendar slot has been booked yet. We&apos;ll get back to
            you by email to arrange a time for your personalized demo with
            Alex &amp; Ksenija.
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
                placeholder="Acme Growth"
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
              placeholder="Tell us about your current outreach and what you'd like to see in the demo..."
              {...register("message")}
              className={`input-field resize-none ${errors.message ? "border-red-500" : ""}`}
            />
            {errors.message && (
              <p className="mt-1 text-12 text-red-400">{errors.message.message}</p>
            )}
          </div>

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
                  <span>Book now</span>
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
