import { ChevronRight, Plus, Smile } from "lucide-react";
import { useId, useState } from "react";
import { useApp } from "@/app/context";
import { MoodBlob } from "@/components/MoodBlob";
import { Kbd } from "@/components/ui/kbd";
import { factorLabel, formatAt, moodColor, timeline, valenceLabel } from "@/lib/mood";
import { nameKey } from "@/lib/names";
import type { CheckIn } from "@/lib/schema";
import { cn } from "@/lib/utils";

interface Props {
  mood: CheckIn[];
  pending: CheckIn[];
  onEdit(index: number): void;
  onAdd(): void;
  /** Shortcut hint for adding a check-in, from the action registry. */
  shortcut?: string;
}

const KEY = "dhyana.moodRow";
/** Remembered across days and launches. Collapsed until the user opens it. */
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
 * The day's mood, under the "Today · Created · Edited" line. With check-ins there is an
 * always-visible toggle (a dot per check-in, and a count); opening it shows the chips, which then
 * stay until you close it. With none there is just an "Add mood check-in" button.
 */
export function MoodRow({ mood, pending, onEdit, onAdd, shortcut }: Props) {
  const { entities } = useApp();
  const [open, setOpen] = useState(readOpen);
  const listId = useId();
  const items = timeline(mood, pending);

  const toggle = () => {
    writeOpen(!open);
    setOpen(!open);
  };
  const emotionName = (name: string) =>
    entities.find((e) => e.kind === "emotion" && nameKey(e.name) === nameKey(name))?.display ??
    name;

  return (
    <section
      aria-label="Mood"
      className="mt-2 flex min-h-7 flex-wrap items-center gap-1.5 select-none"
    >
      {items.length === 0 ? (
        <button
          type="button"
          onClick={onAdd}
          className="group/add flex h-6 items-center gap-1.5 rounded-md pr-2 pl-1 text-[12px] text-surface-muted transition-colors duration-100 hover:bg-chrome-hover hover:text-surface-fg"
        >
          <Smile size={14} aria-hidden="true" />
          <span>Add mood check-in</span>
          {shortcut && (
            <Kbd
              shortcut={shortcut}
              className="opacity-0 transition-opacity duration-100 group-hover/add:opacity-100 group-focus-visible/add:opacity-100"
            />
          )}
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-controls={listId}
            title={open ? "Hide check-ins" : "Show check-ins"}
            className="flex h-6 items-center gap-1.5 rounded-md pr-2 pl-1 text-[12px] text-surface-muted transition-colors duration-100 hover:bg-chrome-hover hover:text-surface-fg"
          >
            <ChevronRight
              size={13}
              aria-hidden="true"
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
                const detail = [
                  valenceLabel(c.valence),
                  ...words,
                  ...c.factors.map(factorLabel),
                ].join(", ");
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
                      "flex h-7 max-w-[300px] items-center gap-2 rounded-full border bg-popover/60 pr-2.5 pl-2 text-[12px] transition-spring hover:bg-chrome-hover active:scale-95",
                      held ? "border-dashed border-muted-foreground/50" : "border-border",
                    )}
                  >
                    <MoodBlob valence={c.valence} size={15} glyph />
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
        </>
      )}
    </section>
  );
}
