import { useNavigate } from "@tanstack/react-router";
import { CalendarDays, CornerDownLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { useApp } from "@/app/context";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { formatLong, parseDateInput } from "@/lib/dates";
import type { Action } from "@/lib/shortcuts";

const GROUPS: Action["group"][] = ["Navigate", "Journal", "App"];

export function CommandPalette({ actions }: { actions: Action[] }) {
  const app = useApp();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (app.paletteOpen) setQuery("");
  }, [app.paletteOpen, app.paletteMode]);

  return (
    <Dialog open={app.paletteOpen} onOpenChange={(o) => !o && app.closePalette()}>
      <DialogContent
        showCloseButton={false}
        className="top-[16vh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-[640px]"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Command palette</DialogTitle>
          <DialogDescription>Search for an action, or jump to a date.</DialogDescription>
        </DialogHeader>
        {app.paletteMode === "goto-date" ? (
          <GotoDate query={query} setQuery={setQuery} />
        ) : (
          <Command loop>
            <CommandInput value={query} onValueChange={setQuery} placeholder="Type a command…" />
            <CommandList className="max-h-[360px] p-1.5">
              <CommandEmpty>No matching commands</CommandEmpty>
              {GROUPS.map((group) => {
                const items = actions.filter((a) => a.group === group);
                if (!items.length) return null;
                return (
                  <CommandGroup key={group} heading={group}>
                    {items.map((a) => (
                      <CommandItem
                        key={a.id}
                        value={`${a.label} ${a.keywords ?? ""}`}
                        onSelect={() => {
                          app.closePalette();
                          // Let the dialog release focus first, so e.g. "Focus editor" lands.
                          setTimeout(a.run, 0);
                        }}
                      >
                        <span className="flex-1 truncate">{a.label}</span>
                        {a.shortcut && <Kbd shortcut={a.shortcut} />}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                );
              })}
            </CommandList>
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
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Go to date… (friday, yesterday, -3, 2026-10-28)"
      />
      <CommandList className="p-1.5">
        {target ? (
          <CommandItem value={target} onSelect={() => go(target)}>
            <CalendarDays className="text-muted-foreground" />
            <span className="flex-1">{formatLong(target)}</span>
            <CornerDownLeft className="size-3.5 text-muted-foreground" />
          </CommandItem>
        ) : (
          <div className="px-3 py-6 text-center text-muted-foreground">
            {query ? "Not a date I understand" : "Try “friday”, “yesterday”, “-3” or 2026-10-28"}
          </div>
        )}
      </CommandList>
    </Command>
  );
}
