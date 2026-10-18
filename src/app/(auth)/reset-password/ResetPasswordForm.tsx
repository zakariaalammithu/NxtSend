"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { Eye, EyeOff, Loader2, AlertCircle, CheckCircle2, ArrowLeft } from "lucide-react";

const resetSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(8, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type ResetFormData = z.infer<typeof resetSchema>;

export default function ResetPasswordForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [isSuccess, setIsSuccess] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetFormData>({
    resolver: zodResolver(resetSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (data: ResetFormData) => {
    setServerError(null);
    const supabase = createClient();

    if (!supabase) {
      // Demo mode success simulation
      setIsSuccess(true);
      setTimeout(() => {
        router.push("/login");
      }, 2000);
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: data.password,
      });

      if (error) {
        setServerError(error.message);
        return;
      }

      setIsSuccess(true);
      setTimeout(() => {
        router.push("/login");
      }, 2000);
    } catch {
      setServerError("Failed to update password. Please try again.");
    }
  };

  return (
    <div className="w-full">
      <Link
        href="/login"
        className="inline-flex items-center gap-1.5 text-12 font-medium text-black-400 hover:text-white transition-colors mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        <span>Back to login</span>
      </Link>

      <div className="mb-6">
        <h2 className="text-24 sm:text-28 font-bold tracking-tight text-white">
          Create new password
        </h2>
        <p className="mt-1.5 text-14 text-black-300">
          Your new password must be at least 8 characters long.
        </p>
      </div>

      {isSuccess ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-6 text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h3 className="text-16 font-semibold text-white">
            Password updated successfully!
          </h3>
          <p className="text-13 text-black-300">
            Redirecting you to the login page now...
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          {serverError && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-600/10 p-3.5 text-13 text-rose-300 flex items-center gap-2.5">
              <AlertCircle className="h-4.5 w-4.5 shrink-0 text-rose-400" />
              <span>{serverError}</span>
            </div>
          )}

          {/* New Password */}
          <div>
            <label
              htmlFor="password"
              className="block text-13 font-medium text-black-200 mb-1.5"
            >
              New Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                {...register("password")}
                className={`input-field pr-10 ${
                  errors.password ? "border-rose-500 focus:border-rose-500" : ""
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-black-400 hover:text-white transition-colors p-1"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {errors.password?.message && (
              <p className="mt-1.5 text-12 text-rose-400">
                {errors.password.message}
              </p>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-13 font-medium text-black-200 mb-1.5"
            >
              Confirm New Password
            </label>
            <div className="relative">
              <input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Re-type new password"
                {...register("confirmPassword")}
                className={`input-field pr-10 ${
                  errors.confirmPassword
                    ? "border-rose-500 focus:border-rose-500"
                    : ""
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-black-400 hover:text-white transition-colors p-1"
                aria-label={
                  showConfirmPassword ? "Hide password" : "Show password"
                }
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {errors.confirmPassword?.message && (
              <p className="mt-1.5 text-12 text-rose-400">
                {errors.confirmPassword.message}
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
                <span>Updating password...</span>
              </>
            ) : (
              <span>Reset Password</span>
            )}
          </button>
        </form>
      )}
    </div>
  );
}
