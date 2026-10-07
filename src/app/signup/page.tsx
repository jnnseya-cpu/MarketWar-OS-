import type { Metadata } from "next";
import AuthForm from "@/components/AuthForm";
import { NOINDEX_METADATA } from "@/shared/robots-policy";

export const metadata: Metadata = {
  title: "Create account — MarketWar OS",
  description: "Create your MarketWar OS account and take command of your growth.",
  // THE MOST-LINKED PAGE ON THE SITE AFTER THE HOME PAGE — seven links from six
  // landing pages — and it was `Disallow`ed, which is what Search Console
  // reported. See `shared/robots-policy.ts`: a path an indexable page links to
  // is crawled and carries `noindex, follow`, never blocked.
  robots: NOINDEX_METADATA,
};

export default function SignupPage() {
  return <AuthForm mode="signup" />;
}
