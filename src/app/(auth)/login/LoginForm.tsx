"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { ensureDefaultWorkspace } from "@/lib/auth/workspace";
import { recordPendingReferral } from "@/lib/referrals/capture";
import { Eye, EyeOff, Loader2, AlertCircle, ArrowRight } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginForm() {
  const router = useRouter();

  // Demo entry is offered ONLY when Supabase is not configured (demo mode).
  // When auth is live, the bypass button is not rendered at all — previously
  // it was always visible and, with a real backend, only bounced off the
  // middleware back to /login.
  const isDemoMode = React.useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return (
      !url ||
      !key ||
      url === "https://your-project.supabase.co" ||
      url.includes("placeholder") ||
      key === "your-anon-key" ||
      key.includes("placeholder")
    );
  }, []);

  const [showPassword, setShowPassword] = React.useState(false);
  const [demoNotice, setDemoNotice] = React.useState<string | null>(null);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setServerError(null);
    setDemoNotice(null);

    const supabase = createClient();

    if (!supabase) {
      setDemoNotice("Demo Mode: Auth not configured. Set up Supabase to enable login.");
      return;
    }

    try {
      const { data: signInData, error } =
        await supabase.auth.signInWithPassword({
          email: data.email,
          password: data.password,
        });

      if (error) {
        setServerError(error.message);
        return;
      }

      // Suspension enforcement (Stage 2b): an admin can suspend an account
      // via /api/admin/users/status, which sets profiles.status. A
      // suspended user must not get a usable session — check the profile
      // row now and sign straight back out if suspended. (A session that
      // already exists when the suspension lands stays valid until it
      // expires or is refreshed against a status-aware check; admin API
      // calls are blocked immediately by requireAdminApi.)
      if (signInData.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("status")
          .eq("id", signInData.user.id)
          .single();

        if (profile?.status === "suspended") {
          await supabase.auth.signOut();
          setServerError(
            "This account has been suspended. Please contact support if you believe this is a mistake."
          );
          return;
        }
      }

      // First authenticated load: users who signed up under email
      // confirmation had no session at signup, so their default workspace
      // could not be created then. Create it now (checked, non-fatal).
      // full_name from metadata is used ONLY as a workspace display label,
      // never for any role/authorization decision.
      if (signInData.user) {
        await ensureDefaultWorkspace(
          supabase,
          signInData.user.id,
          (signInData.user.user_metadata?.full_name as string) ?? null
        );
      }

      // Referral capture (Stage E): a user who signed up under email
      // confirmation had no session at signup — record a stashed ?ref=
      // now that they are signed in (best-effort, never blocks login).
      await recordPendingReferral();

      router.push("/dashboard");
      router.refresh();
    } catch {
      setServerError("An unexpected error occurred. Please try again.");
    }
  };

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-24 sm:text-28 font-bold tracking-tight text-white">
          Welcome back
        </h2>
        <p className="mt-1.5 text-14 text-black-300">
          Sign in to manage your automated campaigns and leads.
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
            Enter Demo Dashboard now <ArrowRight className="h-3 w-3" />
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
        {/* Email */}
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
            placeholder="name@company.com"
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
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="password"
              className="block text-13 font-medium text-black-200"
            >
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-12 font-medium text-purple-400 hover:text-purple-300 transition-colors"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
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

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 px-4 text-14 transition-all duration-200 shadow-glow-purple disabled:opacity-50 disabled:pointer-events-none mt-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Logging in...</span>
            </>
          ) : (
            <span>Log In</span>
          )}
        </button>

        {/* Demo entry — demo mode only, clearly labelled */}
        {isDemoMode && (
          <>
            {/* Divider */}
            <div className="relative my-6 text-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-black-600/70" />
              </div>
              <span className="relative bg-black-800 px-3 text-12 text-black-400 uppercase tracking-wider">
                or
              </span>
            </div>

            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-black-700/60 hover:bg-black-700 border border-black-600 text-black-200 hover:text-white font-medium py-2.5 px-4 text-13 transition-all"
            >
              <span>Explore Demo as Alex Vance (Demo Mode)</span>
              <ArrowRight className="h-3.5 w-3.5 text-purple-400" />
            </button>
          </>
        )}

        {/* Sign up link */}
        <div className="text-center pt-2">
          <p className="text-13 text-black-400">
            Don&apos;t have an account?{" "}
            <Link
              href="/signup"
              className="font-semibold text-purple-400 hover:text-purple-300 transition-colors"
            >
              Sign up &rarr;
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}
