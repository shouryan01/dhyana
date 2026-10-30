import { formatShortcut } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

/** Renders a shortcut spec ("mod+k", "g t") as keycaps. */
export function Kbd({ shortcut, className }: { shortcut: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {formatShortcut(shortcut).map((k, i) => (
        <kbd
          key={i}
          className="min-w-[18px] rounded border border-border bg-chrome px-1 py-px text-center font-sans text-[11px] leading-4 text-muted-foreground"
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}
