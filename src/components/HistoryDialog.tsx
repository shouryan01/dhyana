import { RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useApp } from "@/app/context";
import { flushAll } from "@/app/flush";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { backend } from "@/lib";
import { diffLines, foldUnchanged } from "@/lib/diff";
import type { Version, VersionContent } from "@/lib/schema";
import { cn } from "@/lib/utils";

type Compare = "changes" | "now";

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/**
 * A note's saved versions, newest first, with a read-only diff of each: what that version
 * changed, or how it differs from the note now. Restoring keeps what's there now as a version too.
 */
export function HistoryDialog({
  path,
  title,
  open,
  onOpenChange,
}: {
  path: string;
  title: string;
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const app = useApp();
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState<VersionContent | null>(null);
  const [compare, setCompare] = useState<Compare>("changes");
  const [confirm, setConfirm] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setVersions(null);
    // Unsaved typing should be part of what's shown (and kept) as "now".
    void flushAll()
      .then(() => backend.noteHistory(path))
      .then((v) => {
        if (!live) return;
        setVersions(v);
        setSelected((s) => (s && v.some((x) => x.id === s) ? s : (v[0]?.id ?? null)));
      })
      .catch((e) => {
        if (live) setVersions([]);
        toast.error(`Couldn't read the history: ${e}`);
      });
    return () => {
      live = false;
    };
  }, [open, path, reload]);

  // Versions are recorded while this is open (after each pause in writing): add them live.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let off: (() => void) | undefined;
    backend
      .onHistoryChanged(() => {
        void backend
          .noteHistory(path)
          .then((v) => !cancelled && setVersions(v))
          .catch(() => {});
      })
      .then((u) => {
        if (cancelled) u();
        else off = u;
      });
    return () => {
      cancelled = true;
      off?.();
    };
  }, [open, path]);

  useEffect(() => {
    if (!selected) {
      setContent(null);
      return;
    }
    let live = true;
    backend
      .noteVersion(path, selected)
      .then((c) => live && setContent(c))
      .catch(() => live && setContent(null));
    return () => {
      live = false;
    };
  }, [path, selected, reload]);

  const chunks = useMemo(() => {
    if (!content) return [];
    const from = compare === "changes" ? (content.previous ?? "") : (content.text ?? "");
    const to = compare === "changes" ? (content.text ?? "") : (content.current ?? "");
    return foldUnchanged(diffLines(from, to), 3);
  }, [content, compare]);

  const version = versions?.find((v) => v.id === selected);
  const sameAsNow = content !== null && content.text === content.current;

  const restore = async () => {
    setConfirm(false);
    if (!selected) return;
    try {
      await flushAll();
      await backend.restoreVersion(path, selected);
      app.bumpDays();
      toast.success("Restored", {
        description: "What was there before is kept in the history too.",
      });
      onOpenChange(false);
      setReload((r) => r + 1);
    } catch (e) {
      toast.error(`Couldn't restore: ${e}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(640px,85vh)] flex-col gap-0 p-0 sm:max-w-[920px]">
        <DialogHeader className="border-b border-border px-5 py-3.5">
          <DialogTitle className="text-[14px]">History of {title}</DialogTitle>
          <DialogDescription className="text-[12px]">
            dhyāna saves a version each time you pause writing, and when you quit. Versions live in
            the app's data folder, not in your vault.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1">
          <ul
            className="w-[260px] shrink-0 overflow-y-auto border-r border-border p-1.5"
            aria-label="Versions"
          >
            {versions === null ? null : versions.length === 0 ? (
              <li className="px-3 py-6 text-center text-[12px] text-muted-foreground">
                No versions yet. One is saved about 20 seconds after you stop typing, and when you
                quit.
              </li>
            ) : (
              versions.map((v, i) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(v.id)}
                    aria-current={v.id === selected}
                    className={cn(
                      "flex w-full flex-col gap-0.5 rounded-md px-2.5 py-1.5 text-left",
                      v.id === selected ? "bg-chrome-active" : "hover:bg-chrome-hover",
                    )}
                  >
                    <span className="text-[12px]">
                      {when(v.time)}
                      {i === 0 && <span className="ml-1.5 text-muted-foreground">· latest</span>}
                    </span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {v.deleted ? "Deleted" : v.message}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-3 border-b border-border px-4 py-2">
              <ToggleGroup
                spacing={0}
                size="sm"
                className="rounded-md border border-border bg-popover p-0.5"
                value={[compare]}
                onValueChange={(v) => v[0] && setCompare(v[0] as Compare)}
              >
                {(
                  [
                    ["changes", "What changed"],
                    ["now", "Compared with now"],
                  ] as const
                ).map(([id, label]) => (
                  <ToggleGroupItem
                    key={id}
                    value={id}
                    className="h-6 min-w-0 rounded-[4px]! px-2.5 text-[12px] font-normal text-muted-foreground hover:bg-transparent hover:text-foreground aria-pressed:bg-chrome-active aria-pressed:text-foreground"
                  >
                    {label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <div className="flex-1" />
              <Button
                size="sm"
                variant="outline"
                disabled={!version || version.deleted || sameAsNow}
                title={sameAsNow ? "The note is already like this" : undefined}
                onClick={() => setConfirm(true)}
              >
                <RotateCcw /> Restore this version
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-2 py-2 font-mono text-[12px] leading-[1.6] select-text">
              {content && chunks.length === 0 && (
                <p className="px-2 py-6 text-center font-sans text-muted-foreground">
                  {compare === "now" ? "Same as the note now." : "No changes in this version."}
                </p>
              )}
              {chunks.map((c, i) =>
                c.kind === "skip" ? (
                  <div key={i} className="px-2 py-0.5 text-muted-foreground/70 select-none">
                    ⋯ {c.count} unchanged {c.count === 1 ? "line" : "lines"}
                  </div>
                ) : (
                  <div
                    key={i}
                    className={cn(
                      "flex gap-2 rounded-sm px-2 whitespace-pre-wrap break-words",
                      c.kind === "add" && "bg-emerald-500/12",
                      c.kind === "del" &&
                        "bg-red-500/12 text-muted-foreground line-through decoration-red-500/40",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="w-3 shrink-0 text-muted-foreground select-none"
                    >
                      {c.kind === "add" ? "+" : c.kind === "del" ? "−" : ""}
                    </span>
                    <span className="sr-only">
                      {c.kind === "add" ? "Added: " : c.kind === "del" ? "Removed: " : ""}
                    </span>
                    <span className="min-w-0">{c.text || " "}</span>
                  </div>
                ),
              )}
            </div>
          </div>
        </div>
      </DialogContent>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent className="sm:max-w-[420px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this version?</AlertDialogTitle>
            <AlertDialogDescription>
              {title} goes back to how it was on {version ? when(version.time) : ""}. What's there
              now is saved as a version first, so you can switch back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void restore()}>Restore</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
