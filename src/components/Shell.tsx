import { Link, Outlet, useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import {
  Library,
  Moon,
  PanelLeft,
  PenLine,
  Search,
  Settings as SettingsIcon,
  Sun,
} from "lucide-react";
import { useEffect } from "react";
import { Toaster } from "sonner";
import { useActions, useHotkeys, useRolloverNotice } from "@/app/actions";
import { useApp } from "@/app/context";
import { installCloseFlush } from "@/app/flush";
import { Calendar } from "@/components/Calendar";
import { CommandPalette } from "@/components/CommandPalette";
import { Logo } from "@/components/Logo";
import { titlebarHeight, trafficLightInset, WindowControls } from "@/components/TitleBar";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { parseTheme } from "@/lib/backend";
import { isISODate } from "@/lib/dates";
import { shortcutLabel } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

export function Shell() {
  const app = useApp();
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { date?: string };
  const selected = params.date && isISODate(params.date) ? params.date : app.today;
  const onSettings = useRouterState({
    select: (s) => /^\/(settings|shortcuts|library)/.test(s.location.pathname),
  });
  const onLibrary = useRouterState({ select: (s) => s.location.pathname.startsWith("/library") });
  const onDay = useRouterState({ select: (s) => s.location.pathname.startsWith("/day/") });
  const actions = useActions();
  useHotkeys(actions);
  useRolloverNotice();

  useEffect(() => {
    let dispose: (() => void) | undefined;
    installCloseFlush().then((d) => (dispose = d));
    return () => dispose?.();
  }, []);

  const dark = app.app ? parseTheme(app.app.theme).mode === "dark" : false;
  const shortcutOf = (id: string) => actions.find((a) => a.id === id)?.shortcut;
  const lights = trafficLightInset();

  return (
    <TooltipProvider delay={500}>
      <div className="flex h-full">
        <aside
          className={cn(
            "flex w-[248px] shrink-0 flex-col gap-3 border-r border-border bg-chrome px-2.5 pb-3 transition-[margin] duration-150 ease-out",
            !app.sidebarOpen && "-ml-[248px]",
          )}
          aria-hidden={!app.sidebarOpen}
        >
          <div
            data-tauri-drag-region
            className={cn(
              "flex shrink-0 items-center justify-between pr-1",
              titlebarHeight(),
              lights && "pl-[64px]",
            )}
          >
            <Link
              to="/day/$date"
              params={{ date: app.today }}
              aria-label="Go to today"
              className="group flex h-7 items-center gap-2 rounded-md px-1.5 font-[family-name:var(--font-serif)] text-[15px] font-semibold tracking-tight transition-colors duration-100 hover:bg-chrome-hover"
            >
              <Logo size={17} className="logo-mark text-primary" />
              dhyāna
            </Link>
            <IconButton
              label="Toggle sidebar"
              shortcut={shortcutOf("sidebar")}
              onClick={app.toggleSidebar}
            >
              <PanelLeft size={15} />
            </IconButton>
          </div>

          <button
            onClick={() => app.openPalette("commands")}
            className="group flex h-8 items-center gap-2 rounded-md border border-border bg-popover px-2.5 text-muted-foreground transition-colors duration-100 hover:bg-chrome-hover"
          >
            <span className={cn(ICON, "group-hover:-rotate-12")}>
              <Search size={14} />
            </span>
            <span className="flex-1 text-left">Search</span>
            <Kbd shortcut="mod+k" className={REVEAL} />
          </button>

          <nav className="flex flex-col gap-0.5">
            <NavLink
              to="/day/$date"
              params={{ date: app.today }}
              active={onDay && selected === app.today}
              icon={<PenLine size={15} />}
              wiggle="group-hover:-rotate-12"
              label="Today"
              shortcut={shortcutOf("today")}
            />
            <NavLink
              to="/library"
              active={onLibrary}
              icon={<Library size={15} />}
              wiggle="group-hover:-rotate-12"
              label="Library"
              shortcut={shortcutOf("library")}
            />
          </nav>

          <Calendar
            selected={selected}
            onSelect={(date) => navigate({ to: "/day/$date", params: { date } })}
          />

          <div className="mt-auto flex flex-col gap-0.5">
            <button
              onClick={() => void app.toggleMode()}
              className={cn(
                ROW,
                "group text-muted-foreground hover:bg-chrome-hover hover:text-foreground",
              )}
            >
              <span className={cn(ICON, dark ? "group-hover:rotate-90" : "group-hover:-rotate-12")}>
                {dark ? <Sun size={15} /> : <Moon size={15} />}
              </span>
              <span className="flex-1 text-left">{dark ? "Light mode" : "Dark mode"}</span>
              {shortcutOf("mode") && <Kbd shortcut={shortcutOf("mode")!} className={REVEAL} />}
            </button>
            <NavLink
              to="/settings"
              active={onSettings}
              icon={<SettingsIcon size={15} />}
              wiggle="group-hover:rotate-45"
              label="Settings"
              shortcut={shortcutOf("settings")}
            />
          </div>
        </aside>

        <main
          className={cn(
            "flex min-w-0 flex-1 flex-col overflow-hidden",
            onSettings ? "bg-chrome" : "bg-surface",
          )}
        >
          <div
            data-tauri-drag-region
            className={cn(
              "flex shrink-0 items-center",
              titlebarHeight(),
              app.sidebarOpen ? "pl-3" : lights ? "pl-[78px]" : "pl-3",
            )}
          >
            {!app.sidebarOpen && (
              <IconButton
                label="Show sidebar"
                shortcut={shortcutOf("sidebar")}
                onClick={app.toggleSidebar}
              >
                <PanelLeft size={15} />
              </IconButton>
            )}
            <div data-tauri-drag-region className="h-full flex-1" />
            <WindowControls />
          </div>
          <div className="relative min-h-0 flex-1">
            <Outlet />
          </div>
        </main>

        <CommandPalette actions={actions} />
        <Toaster
          position="bottom-right"
          theme={dark ? "dark" : "light"}
          toastOptions={{
            style: {
              background: "var(--popover)",
              color: "var(--foreground)",
              border: "1px solid var(--border)",
              fontFamily: "var(--font-ui)",
            },
          }}
        />
      </div>
    </TooltipProvider>
  );
}

/** Shortcut hints appear only while the row is hovered or keyboard-focused. */
const REVEAL =
  "opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-focus-visible:opacity-100";
/** Icons beside a label get a springy nudge when the row is hovered. */
const ICON = "inline-flex transition-transform duration-200 ease-spring group-hover:scale-110";
const ROW =
  "flex h-8 items-center gap-2 rounded-md px-2 text-[13px] transition-colors duration-100";

function NavLink(props: {
  to: "/day/$date" | "/settings" | "/library";
  params?: { date: string };
  active: boolean;
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  wiggle?: string;
}) {
  return (
    <Link
      to={props.to}
      params={props.params as never}
      className={cn(
        ROW,
        "group",
        props.active
          ? "bg-chrome-active text-foreground"
          : "text-muted-foreground hover:bg-chrome-hover hover:text-foreground",
      )}
    >
      <span className={cn(ICON, props.wiggle)}>{props.icon}</span>
      <span className="flex-1">{props.label}</span>
      {props.shortcut && <Kbd shortcut={props.shortcut} className={REVEAL} />}
    </Link>
  );
}

export function IconButton({
  label,
  shortcut,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            onClick={onClick}
            className="size-7 text-muted-foreground hover:scale-110 hover:bg-chrome-hover hover:text-foreground active:scale-90"
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
