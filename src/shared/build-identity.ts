// WHICH CODE IS ANSWERING?
//
// WHY IT IS IN `shared/` AND NOT `backend/`. `/api/health/live` states at the
// top of the file that it imports NOTHING from `@/backend` at module level,
// because a top-level import that throws on load cannot be caught by any
// try/catch in the handler — it takes the whole route down and returns a bare
// 500, which is the outage this platform has already had twice. Putting this in
// `backend/` and importing it there broke that rule silently. It reads
// `process.env` and nothing else, so `shared/` is where it belongs.
//
// WHY IT IS SHARED AT ALL. This lived inline in `/api/health/live`, and the moment a
// second diagnostic needed it the obvious move was to read one environment
// variable and call it good. That would have reported "unknown" on three of the
// four hosts this platform can run on, in the report whose whole purpose is to
// say whether a fix is deployed — and a diagnostic that answers "unknown" for a
// reason unrelated to the deployment is worse than one that does not ask.
//
// A FIX THAT WAS NEVER DEPLOYED IS THE COMMONEST CAUSE OF "STILL NOT WORKING",
// and no amount of reading the code finds it. It cost this repository a full day
// once, with a green CI run and a production build serving older code.
export type BuildIdentity = {
  commit: string;
  host: string;
  note: string;
};

export function buildIdentity(env: NodeJS.ProcessEnv = process.env): BuildIdentity {
  const sources: [string, string | undefined][] = [
    ["vercel", env.VERCEL_GIT_COMMIT_SHA],
    ["firebase-app-hosting", env.CLOUD_RUN_REVISION || env.K_REVISION],
    ["github-actions", env.GITHUB_SHA],
    ["generic", env.COMMIT_SHA || env.SOURCE_COMMIT || env.GIT_COMMIT],
  ];
  const found = sources.find(([, v]) => Boolean(v && v.trim()));
  return {
    commit: found ? String(found[1]).slice(0, 12) : "unknown",
    host: found ? found[0] : "unknown",
    note: found
      ? "Compare this with the commit you pushed. If they differ, the deployment has not picked up your change yet and nothing in the code will explain what you are seeing."
      : "This deployment exposes no commit stamp, so it cannot say which build it is running. Set COMMIT_SHA in the host's environment to make that answerable.",
  };
}
