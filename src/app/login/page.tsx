import type { Metadata } from "next";
import AuthForm from "@/components/AuthForm";

export const metadata: Metadata = {
  title: "Log in — MarketWar OS",
  description: "Log in to your MarketWar OS command centre.",
};

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
