import type { Metadata } from "next";
import AuthForm from "@/components/AuthForm";

export const metadata: Metadata = {
  title: "Create account — MarketWar OS",
  description: "Create your MarketWar OS account and take command of your growth.",
};

export default function SignupPage() {
  return <AuthForm mode="signup" />;
}
