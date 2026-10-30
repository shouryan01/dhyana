import { ChevronRight, Plus } from "lucide-react";
import { useId, useState } from "react";
import { useApp } from "@/app/context";
import { factorLabel, formatAt, moodColor, timeline, valenceLabel } from "@/lib/mood";
import { nameKey } from "@/lib/names";
import type { CheckIn } from "@/lib/schema";
import { cn } from "@/lib/utils";

interface Props {
  mood: CheckIn[];
  pending: CheckIn[];
  onEdit(index: number): void;
  onAdd(): void;
}

const KEY = "dhyana.moodStrip";
/** Collapsed unless the user opened it; remembered across days and launches. */
const readOpen = (): boolean => {
  try {
    return localStorage.getItem(KEY) === "open";
  } catch {
    return false;
  }
};
const writeOpen = (open: boolean) => {
  try {
    localStorage.setItem(KEY, open ? "open" : "closed");
  } catch {
    /* storage unavailable: the choice lasts until reload */
  }
};

/**
 * The day's check-ins under the date. Quiet by default: a small toggle that appears when the
 * header is hovered (or focused) and opens the chips, one per check-in, in time order. Click a
 * chip to edit it. It must sit inside an ancestor with the `group` class (the day's header).
 */
export function MoodStrip({ mood, pending, onEdit, onAdd }: Props) {
  const { entities } = useApp();
  const [open, setOpen] = useState(readOpen);
  const listId = useId();
  const items = timeline(mood, pending);
  if (!items.length) return null;

  const toggle = () => {
    writeOpen(!open);
    setOpen(!open);
  };
  const emotionName = (name: string) =>
    entities.find((e) => e.kind === "emotion" && nameKey(e.name) === nameKey(name))?.display ??
    name;

  return (
    <section
      aria-label="Mood check-ins"
      className="mt-2 flex min-h-6 flex-wrap items-center gap-1.5 select-none"
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={listId}
        title={open ? "Hide check-ins" : "Show check-ins"}
        className={cn(
          "flex h-6 items-center gap-1.5 rounded-md pr-2 pl-1 text-[12px] text-surface-muted transition-[opacity,background-color,color] duration-100 hover:bg-chrome-hover hover:text-surface-fg",
          // Hidden until the header is hovered or something in it has focus; always there when open.
          !open &&
            "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100",
        )}
      >
        <ChevronRight
          size={13}
          className={cn("transition-transform duration-150", open && "rotate-90")}
        />
        <span className="flex items-center gap-0.5" aria-hidden="true">
          {items.map(({ checkin: c, index }) => (
            <span
              key={index}
              className="size-2 rounded-full"
              style={{ background: moodColor(c.valence) }}
            />
          ))}
        </span>
        <span>
          {items.length} {items.length === 1 ? "check-in" : "check-ins"}
        </span>
      </button>

      {open && (
        <div id={listId} className="flex flex-wrap items-center gap-1.5">
          {items.map(({ checkin: c, index, pending: held }) => {
            const words = c.emotions.map(emotionName);
            const detail = [valenceLabel(c.valence), ...words, ...c.factors.map(factorLabel)].join(
              ", ",
            );
            return (
              <button
                key={index}
                type="button"
                onClick={() => onEdit(index)}
                title={
                  held
                    ? `${detail}. Saved into this note when you start writing.`
                    : `${detail}. Click to edit.`
                }
                className={cn(
                  "flex h-7 max-w-[300px] items-center gap-2 rounded-full border bg-popover/60 px-2.5 text-[12px] transition-spring hover:bg-chrome-hover active:scale-95",
                  held ? "border-dashed border-muted-foreground/50" : "border-border",
                )}
              >
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: moodColor(c.valence) }}
                />
                <span className="text-muted-foreground">{formatAt(c.at)}</span>
                <span className="truncate">
                  {words.length ? words.join(", ") : valenceLabel(c.valence)}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={onAdd}
            aria-label="Add a check-in"
            title="Add a check-in"
            className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-spring hover:bg-chrome-hover hover:text-foreground active:scale-90"
          >
            <Plus size={14} />
          </button>
        </div>
      )}
    </section>
  );
}
