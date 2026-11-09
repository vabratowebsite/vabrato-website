/** Equal Housing Opportunity mark (house outline with equals sign). */
export function EqualHousingIcon({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      role="img"
      aria-label="Equal Housing Opportunity"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
    >
      <path
        d="M16 3L2 13h3v15h22V13h3z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <rect x="10" y="15" width="12" height="2.6" fill="currentColor" />
      <rect x="10" y="20" width="12" height="2.6" fill="currentColor" />
    </svg>
  );
}
