"use client";

// "You can change your mind" has to be true, not just written down. This
// re-opens the consent banner from anywhere in the marketing site, which is
// what makes the withdrawal right in the Privacy Policy an actual mechanism
// rather than a sentence describing one.

export default function CookieSettingsLink() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("mw:cookie-settings"))}
      className="text-emerald-400 underline underline-offset-2 hover:text-emerald-300"
    >
      change your cookie choice
    </button>
  );
}
