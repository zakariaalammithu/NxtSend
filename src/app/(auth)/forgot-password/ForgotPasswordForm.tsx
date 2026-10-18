"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { Loader2, AlertCircle, CheckCircle2, ArrowLeft, Mail } from "lucide-react";

const forgotSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

type ForgotFormData = z.infer<typeof forgotSchema>;

export default function ForgotPasswordForm() {
  const [isSuccess, setIsSuccess] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ForgotFormData>({
    resolver: zodResolver(forgotSchema),
    defaultValues: {
      email: "",
    },
  });

  const submittedEmail = watch("email");

  const onSubmit = async (data: ForgotFormData) => {
    setServerError(null);
    const supabase = createClient();

    if (!supabase) {
      // In demo mode, simulate success response
      setIsSuccess(true);
      return;
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        setServerError(error.message);
        return;
      }

      setIsSuccess(true);
    } catch {
      setServerError("Unable to send reset email. Please try again.");
    }
  };

  return (
    <div className="w-full">
      {/* Back to login arrow */}
      <Link
        href="/login"
        className="inline-flex items-center gap-1.5 text-12 font-medium text-black-400 hover:text-white transition-colors mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        <span>Back to login</span>
      </Link>

      {/* Header */}
      <div className="mb-6">
        <h2 className="text-24 sm:text-28 font-bold tracking-tight text-white">
          Reset password
        </h2>
        <p className="mt-1.5 text-14 text-black-300">
          Enter the email address associated with your account and we&apos;ll send you a password reset link.
        </p>
      </div>

      {/* Success Card */}
      {isSuccess ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-6 text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-16 font-semibold text-white">
              Check your email for a reset link
            </h3>
            <p className="text-13 text-black-300">
              We&apos;ve sent instructions to{" "}
              <strong className="text-white font-medium">{submittedEmail || "your email"}</strong>.
              Follow the link inside to set a new password.
            </p>
          </div>
          <div className="pt-2">
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-xl bg-black-700 hover:bg-black-600 text-white font-medium py-2.5 px-5 text-13 transition-colors"
            >
              Return to Login
            </Link>
          </div>
        </div>
      ) : (
        /* Form */
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          {serverError && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-600/10 p-3.5 text-13 text-rose-300 flex items-center gap-2.5">
              <AlertCircle className="h-4.5 w-4.5 shrink-0 text-rose-400" />
              <span>{serverError}</span>
            </div>
          )}

          <div>
            <label
              htmlFor="email"
              className="block text-13 font-medium text-black-200 mb-1.5"
            >
              Account Email
            </label>
            <div className="relative">
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="alex@company.com"
                {...register("email")}
                className={`input-field pr-10 ${
                  errors.email ? "border-rose-500 focus:border-rose-500" : ""
                }`}
              />
              <Mail className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-black-400 pointer-events-none" />
            </div>
            {errors.email?.message && (
              <p className="mt-1.5 text-12 text-rose-400">
                {errors.email.message}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 px-4 text-14 transition-all duration-200 shadow-glow-purple disabled:opacity-50 disabled:pointer-events-none mt-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Sending link...</span>
              </>
            ) : (
              <span>Send Reset Link</span>
            )}
          </button>
        </form>
      )}
    </div>
  );
}
