import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
        <Compass className="h-6 w-6" />
      </span>
      <h1 className="font-display text-2xl font-bold text-white">This page isn&apos;t on the map.</h1>
      <p className="mt-2 max-w-md text-sm text-slate-400">
        The route doesn&apos;t exist — but the command centre does.
      </p>
      <Link href="/dashboard" className="btn-primary mt-6">
        Back to the Command Center
      </Link>
    </div>
  );
}
