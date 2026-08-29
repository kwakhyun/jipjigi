type BrandLockupProps = {
  className?: string;
  tone?: "light" | "dark";
};

export function BrandLockup({ className, tone = "light" }: BrandLockupProps) {
  const classes = ["brand-wordmark", `brand-wordmark-${tone}`, className].filter(Boolean).join(" ");

  return (
    <span className={classes}>
      <svg className="brand-symbol" viewBox="0 0 32 32" aria-hidden="true">
        <rect x="1" y="1" width="30" height="30" rx="10" fill="currentColor" />
        <path d="m8.5 15.2 7.5-6.1 7.5 6.1M10.8 14.2v9h10.4v-9" fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.1" />
        <path d="m13.1 18.3 2 2 4-4.2" fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
      <span>집지기</span>
    </span>
  );
}
