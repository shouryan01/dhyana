import { ChevronLeft, History, Trash2 } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { shortcutLabel } from "@/lib/shortcuts";
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

/** An icon-only button that names itself (and its shortcut) in a tooltip on hover or focus. */
function IconButton({
  label,
  shortcut,
  danger,
  expanded,
  controls,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  danger?: boolean;
  expanded?: boolean;
  controls?: string;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            aria-expanded={expanded}
            aria-controls={controls}
            onClick={onClick}
            className={cn(
              "size-7 text-surface-muted hover:bg-chrome-hover hover:text-surface-fg",
              // The ghost variant tints anything that is aria-expanded. The toggle should look the
              // same open or closed (only hover changes it), so undo that and keep hover winning.
              "aria-expanded:bg-transparent aria-expanded:text-surface-muted aria-expanded:hover:bg-chrome-hover aria-expanded:hover:text-surface-fg",
              danger && "hover:text-red-500",
            )}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="bottom" className="flex items-center gap-2">
        {label}
        {shortcut && <span className="text-[11px] opacity-70">{shortcutLabel(shortcut)}</span>}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * The note's own actions, top right. A chevron toggle is always visible; opening it reveals a
 * version-history icon and a delete icon beside it, which stay until you close it again (the
 * choice is remembered). Each names itself on hover, and both are in the command palette.
 * Renders nothing for a day with no file yet.
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
    <div className="flex shrink-0 items-center gap-0.5 select-none">
      {open && (
        <div id={listId} className="flex items-center gap-0.5">
          {onHistory && (
            <IconButton label="Version history" shortcut={historyShortcut} onClick={onHistory}>
              <History size={15} />
            </IconButton>
          )}
          {onDelete && (
            <IconButton label="Delete this note" danger onClick={onDelete}>
              <Trash2 size={15} />
            </IconButton>
          )}
        </div>
      )}
      <IconButton
        label={open ? "Hide note actions" : "Show note actions"}
        expanded={open}
        controls={listId}
        onClick={toggle}
      >
        <ChevronLeft
          size={15}
          className={cn("transition-transform duration-150", open && "rotate-180")}
        />
      </IconButton>
    </div>
  );
}
