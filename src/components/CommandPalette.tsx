import { Command } from "cmdk";
import { CalendarDays, CornerDownLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useApp } from "@/app/context";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { formatLong, parseDateInput } from "@/lib/dates";
import type { Action } from "@/lib/shortcuts";

const GROUPS: Action["group"][] = ["Navigate", "Journal", "App"];

const itemClass =
  "flex h-9 cursor-default items-center gap-2 rounded-md px-2.5 text-[13px] text-fg data-[selected=true]:bg-chrome-hover";

export function CommandPalette({ actions }: { actions: Action[] }) {
  const app = useApp();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (app.paletteOpen) setQuery("");
  }, [app.paletteOpen, app.paletteMode]);

  return (
    <Dialog open={app.paletteOpen} onOpenChange={(o) => !o && app.closePalette()}>
      <DialogContent>
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        {app.paletteMode === "goto-date" ? (
          <GotoDate query={query} setQuery={setQuery} />
        ) : (
          <Command loop>
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Type a command…"
              className="h-12 w-full border-b border-border bg-transparent px-4 text-[14px] outline-none placeholder:text-muted"
            />
            <Command.List className="max-h-[360px] overflow-y-auto p-1.5">
              <Command.Empty className="px-3 py-6 text-center text-muted">No matching commands</Command.Empty>
              {GROUPS.map((group) => {
                const items = actions.filter((a) => a.group === group);
                if (!items.length) return null;
                return (
                  <Command.Group
                    key={group}
                    heading={group}
                    className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted"
                  >
                    {items.map((a) => (
                      <Command.Item
                        key={a.id}
                        value={`${a.label} ${a.keywords ?? ""}`}
                        onSelect={() => {
                          app.closePalette();
                          // Let the dialog release focus first, so e.g. "Focus editor" lands.
                          setTimeout(a.run, 0);
                        }}
                        className={itemClass}
                      >
                        <span className="flex-1 truncate">{a.label}</span>
                        {a.shortcut && <Kbd shortcut={a.shortcut} />}
                      </Command.Item>
                    ))}
                  </Command.Group>
                );
              })}
            </Command.List>
          </Command>
        )}
      </DialogContent>
    </Dialog>
  );
}

function GotoDate({ query, setQuery }: { query: string; setQuery(q: string): void }) {
  const app = useApp();
  const navigate = useNavigate();
  const target = parseDateInput(query);

  const go = (date: string) => {
    app.closePalette();
    navigate({ to: "/day/$date", params: { date } });
  };

  return (
    <Command shouldFilter={false}>
      <Command.Input
        value={query}
        onValueChange={setQuery}
        placeholder="Go to date… (friday, yesterday, -3, 2026-10-28)"
        className="h-12 w-full border-b border-border bg-transparent px-4 text-[14px] outline-none placeholder:text-muted"
      />
      <Command.List className="p-1.5">
        {target ? (
          <Command.Item value={target} onSelect={() => go(target)} className={itemClass}>
            <CalendarDays size={15} className="text-muted" />
            <span className="flex-1">{formatLong(target)}</span>
            <CornerDownLeft size={13} className="text-muted" />
          </Command.Item>
        ) : (
          <div className="px-3 py-6 text-center text-muted">
            {query ? "Not a date I understand" : "Try “friday”, “yesterday”, “-3” or 2026-10-28"}
          </div>
        )}
      </Command.List>
    </Command>
  );
}
