import { cn } from "@/lib/utils";

/**
 * A floating readout for charts: a heading, a detail line and an optional "click" hint, styled
 * like the app's popovers. It is positioned by its parent (`left` as a CSS length, usually a
 * percentage of the chart's width) and clamped so it never runs past either edge. Purely visual:
 * the chart's marks carry the accessible labels.
 */
export function ChartTip({
  left,
  heading,
  detail,
  hint,
  className,
}: {
  left: string;
  heading: string;
  detail?: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "anim-fade pointer-events-none absolute z-20 w-max max-w-[220px] -translate-x-1/2 rounded-md border border-border bg-popover px-2.5 py-1.5 text-[12px] leading-snug shadow-md",
        className,
      )}
      style={{ left: `clamp(80px, ${left}, calc(100% - 80px))` }}
    >
      <div className="font-medium text-foreground">{heading}</div>
      {detail && <div className="text-muted-foreground">{detail}</div>}
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground/80">{hint}</div>}
    </div>
  );
}
