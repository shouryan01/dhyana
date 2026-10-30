/** The dhyāna mark: a book with a spark. Drawn in currentColor so it follows the theme. */
export function Logo({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="245 220 350 405" fill="none" className={className} aria-hidden>
      <g stroke="currentColor" strokeWidth="32" strokeLinecap="round" strokeLinejoin="round">
        <rect x="261" y="236" width="318" height="373" rx="46" />
        <path d="M262 534H578" strokeWidth="30" />
      </g>
      <path
        d="M419 300Q448 352 503 384Q448 416 419 468Q390 416 335 384Q390 352 419 300Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="16"
        strokeLinejoin="round"
      />
    </svg>
  );
}
