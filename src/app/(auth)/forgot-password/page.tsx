import type { Metadata } from "next";
import ForgotPasswordForm from "./ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Forgot Password | NxtSend",
  description: "Reset your NxtSend account password",
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
