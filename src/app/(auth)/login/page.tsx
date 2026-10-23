import type { Metadata } from "next";
import LoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "Log In",
  description: "Sign in to your NxtSend multichannel outreach workspace",
};

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { redirect?: string; error?: string };
}) {
  // `redirect` is emitted by middleware for protected pages
  // (/login?redirect=<pathname>) and consumed end-to-end — password
  // login and Google Sign-In both land there after sanitising.
  // `error` carries a safe OAuth/app error code from /auth/callback.
  return (
    <LoginForm
      redirect={searchParams?.redirect}
      errorCode={searchParams?.error}
    />
  );
}
