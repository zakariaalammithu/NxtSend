import type { Metadata } from "next";
import SignupForm from "./SignupForm";

export const metadata: Metadata = {
  title: "Sign Up",
  description: "Create your NxtSend account and launch automated multichannel outreach",
};

export default function SignupPage({
  searchParams,
}: {
  searchParams?: { redirect?: string; error?: string };
}) {
  // Same contract as /login: `redirect` is the canonical post-login
  // target (middleware-emitted, sanitised in the form); `error`
  // carries a safe error code. See src/lib/auth/oauth.ts.
  return (
    <SignupForm
      redirect={searchParams?.redirect}
      errorCode={searchParams?.error}
    />
  );
}
