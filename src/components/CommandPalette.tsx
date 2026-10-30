import { useNavigate } from "@tanstack/react-router";
import { CalendarDays, CornerDownLeft, MapPin, Plus, User } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
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
import { nameKey } from "@/lib/names";
import type { EntityKind } from "@/lib/schema";
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
        ) : app.paletteMode === "entity" ? (
          <EntityPicker query={query} setQuery={setQuery} />
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

/** Jump to a person or place by name or alias, or create one. */
function EntityPicker({ query, setQuery }: { query: string; setQuery(q: string): void }) {
  const app = useApp();
  const navigate = useNavigate();
  const people = app.entities.filter((e) => e.kind === "person" || e.kind === "place");
  const q = query.trim();
  const exact = (kind: EntityKind) =>
    people.some(
      (e) =>
        e.kind === kind && [e.display, e.name, ...e.aliases].some((n) => nameKey(n) === nameKey(q)),
    );

  const open = (path: string) => {
    app.closePalette();
    void navigate({ to: "/entity", search: { path } });
  };
  const create = async (kind: EntityKind) => {
    try {
      const made = await app.createEntity(kind, q);
      open(made.path);
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e));
    }
  };

  return (
    <Command>
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Go to a person or place… or type a new name"
      />
      <CommandList className="max-h-[360px] p-1.5">
        <CommandEmpty>No one by that name</CommandEmpty>
        {people.map((e) => {
          const Icon = e.kind === "place" ? MapPin : User;
          return (
            <CommandItem
              key={e.path}
              value={`${e.display} ${e.aliases.join(" ")} ${e.kind}`}
              onSelect={() => open(e.path)}
            >
              <Icon className="text-muted-foreground" />
              <span className="flex-1 truncate">{e.display}</span>
              {e.mentions > 0 && (
                <span className="text-[11px] text-muted-foreground">{e.mentions}×</span>
              )}
            </CommandItem>
          );
        })}
        {q &&
          (["person", "place"] as const)
            .filter((kind) => !exact(kind))
            .map((kind) => (
              <CommandItem
                key={`create-${kind}`}
                forceMount
                value={`create ${kind} ${q}`}
                onSelect={() => void create(kind)}
              >
                <Plus className="text-muted-foreground" />
                <span className="flex-1 truncate text-muted-foreground">
                  Create {kind} “{q}”
                </span>
              </CommandItem>
            ))}
      </CommandList>
    </Command>
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
