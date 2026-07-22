// Brand — the MarketWar OS logo. `marketwar-os-mark.png` is the MW monogram on a
// transparent background (sits on any surface); `marketwar-os-logo.png` is the
// full stacked lockup with wordmark + tagline. Use <BrandLockup/> wherever the
// old Shield+text lockup lived; <BrandLogoFull/> for auth screens / hero.

export function BrandMark({ className = "h-8 w-auto" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/marketwar-os-mark.png" alt="MarketWar OS" className={className} />;
}

export function BrandLockup({
  markClass = "h-8 w-auto",
  textClass = "font-display text-lg font-bold tracking-tight text-white",
}: {
  markClass?: string;
  textClass?: string;
}) {
  return (
    <span className="flex items-center gap-2.5">
      <BrandMark className={markClass} />
      <span className={textClass}>
        MarketWar <span className="text-amber-400">OS</span>
      </span>
    </span>
  );
}

export function BrandLogoFull({ className = "h-auto w-52" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/marketwar-os-logo.png"
      alt="MarketWar OS — AI Customer Acquisition Operating System"
      className={className}
    />
  );
}
