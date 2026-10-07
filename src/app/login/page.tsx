import type { Metadata } from "next";
import AuthForm from "@/components/AuthForm";
import { NOINDEX_METADATA } from "@/shared/robots-policy";

export const metadata: Metadata = {
  title: "Log in — MarketWar OS",
  // 43 chars was under the 50 our own audit publishes as the floor.
  description: "Log in to your MarketWar OS command centre — every brand, campaign and agent under one account.",
  // CRAWLABLE AND NOINDEX, which is not the same as blocked.
  //
  // This page used to be `Disallow`ed in robots.txt while the public header
  // linked to it on every page, so Google was invited to a page the site then
  // refused to serve — reported as "Blocked by robots.txt" — and could still
  // index the bare URL from the anchor text with no title and no description.
  // A `noindex` is the instruction that means what was intended, and it can
  // only be read if the fetch is allowed. `follow` keeps the link equity moving
  // through to the pages that should rank.
  robots: NOINDEX_METADATA,
};

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
