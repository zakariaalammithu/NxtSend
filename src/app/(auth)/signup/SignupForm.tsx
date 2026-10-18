"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { Eye, EyeOff, Loader2, AlertCircle, ArrowRight } from "lucide-react";

const signupSchema = z
  .object({
    fullName: z.string().min(2, "Full name must be at least 2 characters"),
    email: z.string().email("Please enter a valid work email"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(8, "Please confirm your password"),
    terms: z.boolean().refine((val) => val === true, "You must agree to the Terms and Privacy Policy"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type SignupFormData = z.infer<typeof signupSchema>;

function getPasswordStrength(password: string): {
  score: number;
  label: "Weak" | "Fair" | "Good" | "Strong";
  color: string;
} {
  if (!password) {
    return { score: 0, label: "Weak", color: "bg-black-600" };
  }

  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password) || password.length >= 12) score += 1;

  if (score <= 1) return { score: 1, label: "Weak", color: "bg-rose-500" };
  if (score === 2) return { score: 2, label: "Fair", color: "bg-orange-500" };
  if (score === 3) return { score: 3, label: "Good", color: "bg-yellow-400" };
  return { score: 4, label: "Strong", color: "bg-emerald-400" };
}

export default function SignupForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [demoNotice, setDemoNotice] = React.useState<string | null>(null);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
      terms: false,
    },
  });

  const passwordValue = watch("password") || "";
  const strength = getPasswordStrength(passwordValue);

  const onSubmit = async (data: SignupFormData) => {
    setServerError(null);
    setDemoNotice(null);

    const supabase = createClient();

    if (!supabase) {
      setDemoNotice(
        `Demo Mode: Supabase is not connected. A demo workspace "${data.fullName}'s Workspace" would be created automatically.`
      );
      return;
    }

    try {
      const { data: authData, error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            full_name: data.fullName,
          },
        },
      });

      if (error) {
        setServerError(error.message);
        return;
      }

      // Auto-create initial workspace if user session is active
      if (authData.user) {
        const workspaceName = `${data.fullName}'s Workspace`;
        await supabase.from("workspaces").insert({
          name: workspaceName,
          owner_id: authData.user.id,
          plan: "free",
        });
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setServerError("An unexpected error occurred during signup.");
    }
  };

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-24 sm:text-28 font-bold tracking-tight text-white">
          Create your account
        </h2>
        <p className="mt-1.5 text-14 text-black-300">
          Start your 14-day free trial. No credit card required.
        </p>
      </div>

      {/* Demo notice banner */}
      {demoNotice && (
        <div className="mb-5 rounded-xl border border-orange-500/30 bg-orange-600/10 p-3.5 text-13 text-orange-300 flex flex-col gap-2">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="h-4.5 w-4.5 shrink-0 text-orange-400 mt-0.5" />
            <span>{demoNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="self-start inline-flex items-center gap-1.5 text-12 font-semibold text-orange-400 hover:text-orange-300 underline"
          >
            Continue to Demo Dashboard <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Server error */}
      {serverError && (
        <div className="mb-5 rounded-xl border border-rose-500/30 bg-rose-600/10 p-3.5 text-13 text-rose-300 flex items-center gap-2.5">
          <AlertCircle className="h-4.5 w-4.5 shrink-0 text-rose-400" />
          <span>{serverError}</span>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {/* Full Name */}
        <div>
          <label
            htmlFor="fullName"
            className="block text-13 font-medium text-black-200 mb-1.5"
          >
            Full Name
          </label>
          <input
            id="fullName"
            type="text"
            autoComplete="name"
            placeholder="Alex Vance"
            {...register("fullName")}
            className={`input-field ${
              errors.fullName ? "border-rose-500 focus:border-rose-500" : ""
            }`}
          />
          {errors.fullName?.message && (
            <p className="mt-1.5 text-12 text-rose-400">
              {errors.fullName.message}
            </p>
          )}
        </div>

        {/* Work Email */}
        <div>
          <label
            htmlFor="email"
            className="block text-13 font-medium text-black-200 mb-1.5"
          >
            Work Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="alex@company.com"
            {...register("email")}
            className={`input-field ${
              errors.email ? "border-rose-500 focus:border-rose-500" : ""
            }`}
          />
          {errors.email?.message && (
            <p className="mt-1.5 text-12 text-rose-400">
              {errors.email.message}
            </p>
          )}
        </div>

        {/* Password */}
        <div>
          <label
            htmlFor="password"
            className="block text-13 font-medium text-black-200 mb-1.5"
          >
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Minimum 8 characters"
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

          {/* Password Strength Indicator */}
          {passwordValue && (
            <div className="mt-2 space-y-1.5">
              <div className="flex items-center justify-between text-11">
                <span className="text-black-400">Password strength:</span>
                <span className="font-semibold text-white">
                  {strength.label}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[1, 2, 3, 4].map((step) => (
                  <div
                    key={step}
                    className={`h-1.5 rounded-full transition-colors ${
                      step <= strength.score ? strength.color : "bg-black-700"
                    }`}
                  />
                ))}
              </div>
            </div>
          )}

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
            Confirm Password
          </label>
          <div className="relative">
            <input
              id="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Re-type your password"
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

        {/* Terms Checkbox */}
        <div className="pt-1">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              {...register("terms")}
              className="mt-1 h-4 w-4 rounded border-black-600 bg-black-800 text-purple-600 focus:ring-purple-500"
            />
            <span className="text-12 text-black-300 leading-normal">
              I agree to the{" "}
              <Link
                href="/terms"
                className="text-purple-400 hover:underline hover:text-purple-300"
              >
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link
                href="/privacy"
                className="text-purple-400 hover:underline hover:text-purple-300"
              >
                Privacy Policy
              </Link>
            </span>
          </label>
          {errors.terms?.message && (
            <p className="mt-1.5 text-12 text-rose-400">
              {errors.terms.message}
            </p>
          )}
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 px-4 text-14 transition-all duration-200 shadow-glow-purple disabled:opacity-50 disabled:pointer-events-none mt-3"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Creating Account...</span>
            </>
          ) : (
            <span>Create Account</span>
          )}
        </button>

        {/* Log in link */}
        <div className="text-center pt-3">
          <p className="text-13 text-black-400">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-semibold text-purple-400 hover:text-purple-300 transition-colors"
            >
              Log in &rarr;
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}
