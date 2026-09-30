// Bonvoyage mark: a map pin carrying a spark, for "places, rated". Wordmark set in the display face.
export function LogoMark({ size = 32, title }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <path d="M16 2.2c-6.6 0-12 5.1-12 11.5C4 22 16 30 16 30s12-8 12-16.3C28 7.3 22.6 2.2 16 2.2z" fill="var(--brand)" />
      <path d="M16 6.8l1.9 4.9 4.9 1.9-4.9 1.9L16 20.4l-1.9-4.9-4.9-1.9 4.9-1.9z" fill="#fff" />
      <circle cx="24.6" cy="5.6" r="2.6" fill="var(--sun)" />
    </svg>
  );
}

export default function Logo({ size = 30 }) {
  return (
    <span className="logo">
      <LogoMark size={size} />
      <span className="wordmark">bonvoyage</span>
    </span>
  );
}
