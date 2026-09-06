import type { Metadata } from "next";
import AuthForm from "@/components/AuthForm";

export const metadata: Metadata = {
  title: "Log in — MarketWar OS",
  // 43 chars was under the 50 our own audit publishes as the floor.
  description: "Log in to your MarketWar OS command centre — every brand, campaign and agent under one account.",
};

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
