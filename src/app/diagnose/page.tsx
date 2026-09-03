import type { Metadata } from "next";
import { MarketingShell } from "@/components/marketing";
import ConnectionDiagnostic from "@/components/ConnectionDiagnostic";

// /diagnose — the address to open when a screen says something went wrong.
//
// It is a public page rather than an admin one deliberately: the failure it
// diagnoses can stop anybody from signing in, so putting it behind a sign-in
// would put it behind the thing it exists to explain. It reads nothing private —
// it sends five requests and reports which machine answered them.
export const metadata: Metadata = {
  title: "Connection diagnostic · MarketWar OS",
  description: "Tests the connection between this browser and MarketWar OS, and names exactly which machine answered when something other than the platform does.",
  robots: { index: false, follow: false },
};

export default function DiagnosePage() {
  return (
    <MarketingShell
      kicker="Diagnostic"
      title="What is actually answering?"
      subtitle="This sends five real requests from your browser and reads the headers that name each hop between you and MarketWar OS. It runs on its own; nothing here changes any setting."
    >
      <ConnectionDiagnostic />
    </MarketingShell>
  );
}
