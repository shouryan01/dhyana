import { ChevronRight, History, Plus, Smile, Trash2, type LucideIcon } from "lucide-react";
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
  onEditCheckIn(index: number): void;
  onAddCheckIn(): void;
  /** Absent until the day has a file to show a history of. */
  onHistory?: () => void;
  /** Absent until the day has a file to delete. */
  onDelete?: () => void;
  /** Shortcut hints, from the action registry. */
  shortcuts?: { checkIn?: string; history?: string };
}

const KEY = "dhyana.noteActions";
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

const ROW =
  "group/row flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13px] text-foreground transition-colors duration-100 hover:bg-chrome-hover";

function Action({
  icon: Icon,
  label,
  shortcut,
  danger,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  shortcut?: string;
  danger?: boolean;
  onClick(): void;
}) {
  return (
    <button type="button" onClick={onClick} className={cn(ROW, danger && "hover:text-red-500")}>
      <Icon size={15} aria-hidden="true" className="shrink-0 text-muted-foreground" />
      <span className="flex-1">{label}</span>
      {shortcut && (
        <Kbd
          shortcut={shortcut}
          className="opacity-0 transition-opacity duration-100 group-hover/row:opacity-100 group-focus-visible/row:opacity-100"
        />
      )}
    </button>
  );
}

/**
 * Everything you can do with the open note, in one list under its date. The toggle is always
 * visible; opening it shows the actions and the day's check-ins, and they stay put until you
 * close it again (the choice is remembered). Each action is also in the command palette.
 */
export function NoteActions({
  mood,
  pending,
  onEditCheckIn,
  onAddCheckIn,
  onHistory,
  onDelete,
  shortcuts,
}: Props) {
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
    <section aria-label="Note actions" className="mt-2 select-none">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={listId}
        title={open ? "Hide actions" : "Show actions"}
        className="flex h-6 items-center gap-1.5 rounded-md pr-2 pl-1 text-[12px] text-surface-muted transition-colors duration-100 hover:bg-chrome-hover hover:text-surface-fg"
      >
        <ChevronRight
          size={13}
          aria-hidden="true"
          className={cn("transition-transform duration-150", open && "rotate-90")}
        />
        <span>Actions</span>
        {items.length > 0 && (
          <>
            <span className="flex items-center gap-0.5" aria-hidden="true">
              {items.map(({ checkin: c, index }) => (
                <span
                  key={index}
                  className="size-2 rounded-full"
                  style={{ background: moodColor(c.valence) }}
                />
              ))}
            </span>
            <span className="sr-only">
              {items.length} {items.length === 1 ? "check-in" : "check-ins"}
            </span>
          </>
        )}
      </button>

      {open && (
        <div id={listId} className="mt-1 flex max-w-[340px] flex-col gap-3 pb-1">
          <div className="flex flex-col gap-0.5">
            <Action
              icon={Smile}
              label="Add mood check-in"
              shortcut={shortcuts?.checkIn}
              onClick={onAddCheckIn}
            />
            {onHistory && (
              <Action
                icon={History}
                label="Version history"
                shortcut={shortcuts?.history}
                onClick={onHistory}
              />
            )}
            {onDelete && (
              <Action icon={Trash2} label="Delete this note…" danger onClick={onDelete} />
            )}
          </div>

          {items.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <h2 className="px-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                Check-ins
              </h2>
              <div className="flex flex-wrap items-center gap-1.5 px-1">
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
                      onClick={() => onEditCheckIn(index)}
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
                  onClick={onAddCheckIn}
                  aria-label="Add a check-in"
                  title="Add a check-in"
                  className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-spring hover:bg-chrome-hover hover:text-foreground active:scale-90"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
