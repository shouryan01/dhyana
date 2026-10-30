import { CalendarDays, Hash, MapPin, Plus, Smile, User } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import type { SuggestIcon, SuggestItem } from "@/editor/suggest";
import { cn } from "@/lib/utils";

export interface SuggestListHandle {
  /** Returns true when the key was used (so the editor must not also handle it). */
  onKeyDown(event: KeyboardEvent): boolean;
}

interface Props {
  items: SuggestItem[];
  command(item: SuggestItem): void;
}

const ICONS: Record<SuggestIcon, typeof User> = {
  person: User,
  place: MapPin,
  emotion: Smile,
  tag: Hash,
  date: CalendarDays,
  create: Plus,
};

/** The popup under the caret for `@ ! # $`. Keyboard: ↑ ↓ to move, Enter or Tab to pick, Esc to close. */
export const SuggestList = forwardRef<SuggestListHandle, Props>(function SuggestList(
  { items, command },
  ref,
) {
  const [selected, setSelected] = useState(0);

  useEffect(() => setSelected(0), [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown(event) {
      if (!items.length) return false;
      if (event.key === "ArrowDown") {
        setSelected((s) => (s + 1) % items.length);
        return true;
      }
      if (event.key === "ArrowUp") {
        setSelected((s) => (s - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        command(items[selected] ?? items[0]);
        return true;
      }
      return false;
    },
  }));

  return (
    <div
      role="listbox"
      className="min-w-[220px] max-w-[340px] rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/5 anim-pop"
    >
      {items.map((item, i) => {
        const Icon = ICONS[item.icon];
        return (
          <button
            key={item.id}
            type="button"
            role="option"
            aria-selected={i === selected}
            // Keep focus (and the selection) in the editor while clicking.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => command(item)}
            onMouseEnter={() => setSelected(i)}
            className={cn(
              "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px]",
              i === selected && "bg-chrome-hover",
              item.icon === "create" && "text-muted-foreground",
            )}
          >
            <Icon size={14} className="shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.detail && (
              <span className="shrink-0 text-[11px] text-muted-foreground">{item.detail}</span>
            )}
          </button>
        );
      })}
    </div>
  );
});
