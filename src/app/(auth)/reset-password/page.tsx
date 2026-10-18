import type { Metadata } from "next";
import ResetPasswordForm from "./ResetPasswordForm";

export const metadata: Metadata = {
  title: "Reset Password | NxtSend",
  description: "Set a new password for your NxtSend account",
};

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
