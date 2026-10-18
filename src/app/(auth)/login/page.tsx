import type { Metadata } from "next";
import LoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "Log In | NxtSend",
  description: "Sign in to your NxtSend multichannel outreach workspace",
};

export default function LoginPage() {
  return <LoginForm />;
}
