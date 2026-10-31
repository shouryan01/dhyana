import { ChevronRight, History, Trash2, type LucideIcon } from "lucide-react";
import { useId, useState } from "react";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

interface Props {
  /** Absent until the day has a file to show a history of. */
  onHistory?: () => void;
  /** Absent until the day has a file to delete. */
  onDelete?: () => void;
  /** Shortcut hint for version history, from the action registry. */
  historyShortcut?: string;
}

const KEY = "dhyana.noteMenu";
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

function Row({
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
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group/row flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13px] text-foreground transition-colors duration-100 hover:bg-chrome-hover",
        danger && "hover:text-red-500",
      )}
    >
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
 * The note's own actions, top right: version history and delete. The toggle is always visible;
 * opening it lists them under it, and they stay until you close it again (the choice is
 * remembered). Both are also in the command palette. Renders nothing for a day with no file yet.
 */
export function NoteMenu({ onHistory, onDelete, historyShortcut }: Props) {
  const [open, setOpen] = useState(readOpen);
  const listId = useId();
  if (!onHistory && !onDelete) return null;

  const toggle = () => {
    writeOpen(!open);
    setOpen(!open);
  };

  return (
    <div className="flex shrink-0 flex-col items-end gap-1 select-none">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={listId}
        title={open ? "Hide note actions" : "Show note actions"}
        className="flex h-6 items-center gap-1 rounded-md pr-1.5 pl-2 text-[12px] text-surface-muted transition-colors duration-100 hover:bg-chrome-hover hover:text-surface-fg"
      >
        <span>More</span>
        <ChevronRight
          size={13}
          aria-hidden="true"
          className={cn("transition-transform duration-150", open && "rotate-90")}
        />
      </button>
      {open && (
        <div id={listId} className="flex w-[196px] flex-col gap-0.5">
          {onHistory && (
            <Row
              icon={History}
              label="Version history"
              shortcut={historyShortcut}
              onClick={onHistory}
            />
          )}
          {onDelete && <Row icon={Trash2} label="Delete this note…" danger onClick={onDelete} />}
        </div>
      )}
    </div>
  );
}
