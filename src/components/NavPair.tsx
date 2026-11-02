import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

export interface NavPairItem {
  to: "/library" | "/insights";
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  active: boolean;
}

/**
 * How much of the row each half takes: resting, hovered, and squeezed by its neighbour. In the
 * 248px sidebar that is about 113px each at rest, 132px hovered (label and a two-key
 * shortcut fit, the icon is hidden) and 94px squeezed (icon and label still fit). Any narrower and the
 * squeezed label would be cut off.
 */
const GROW = { rest: 1, hot: 1.4, squeezed: 1 } as const;

/**
 * Two sidebar destinations as one joined button. Hovering (or focusing) one half widens it, hides its
 * icon so the label slides over, and shows its shortcut while the other narrows. The widths
 * animate with `flex-grow`, which is why both halves have a zero flex-basis.
 */
export function NavPair({ items }: { items: [NavPairItem, NavPairItem] }) {
  const [hot, setHot] = useState<number | null>(null);
  return (
    <div
      className="flex h-8 overflow-hidden rounded-md border border-border bg-popover"
      onMouseLeave={() => setHot(null)}
    >
      {items.map((it, i) => (
        <Link
          key={it.to}
          to={it.to}
          onMouseEnter={() => setHot(i)}
          onFocus={() => setHot(i)}
          onBlur={() => setHot(null)}
          style={{ flexGrow: hot === null ? GROW.rest : hot === i ? GROW.hot : GROW.squeezed }}
          className={cn(
            "group flex min-w-0 basis-0 items-center justify-center gap-1.5 px-1.5 text-[13px] transition-[flex-grow,background-color,color] duration-150 ease-out",
            i === 1 && "border-l border-border",
            it.active
              ? "bg-chrome-active text-foreground"
              : "text-muted-foreground hover:bg-chrome-hover hover:text-foreground",
          )}
        >
          {/* The hovered half drops its icon so the label can slide over and make room for the shortcut. */}
          {hot !== i && <span className="inline-flex shrink-0">{it.icon}</span>}
          <span className="truncate">{it.label}</span>
          {hot === i && it.shortcut && (
            <Kbd shortcut={it.shortcut} className="anim-fade shrink-0" />
          )}
        </Link>
      ))}
    </div>
  );
}
