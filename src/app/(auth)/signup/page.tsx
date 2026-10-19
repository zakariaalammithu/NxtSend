import type { Metadata } from "next";
import SignupForm from "./SignupForm";

export const metadata: Metadata = {
  title: "Sign Up",
  description: "Create your NxtSend account and launch automated multichannel outreach",
};

export default function SignupPage() {
  return <SignupForm />;
}
