import { Link, Outlet, useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { PanelLeft, Search, Settings as SettingsIcon, SunMedium } from "lucide-react";
import { useEffect } from "react";
import { Toaster } from "sonner";
import { useActions, useHotkeys, useRolloverNotice } from "@/app/actions";
import { useApp } from "@/app/context";
import { installCloseFlush } from "@/app/flush";
import { Calendar } from "@/components/Calendar";
import { CommandPalette } from "@/components/CommandPalette";
import { Kbd } from "@/components/ui/kbd";
import { isISODate } from "@/lib/dates";
import { formatShortcut } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

export function Shell() {
  const app = useApp();
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { date?: string };
  const selected = params.date && isISODate(params.date) ? params.date : app.today;
  const onSettings = useRouterState({ select: (s) => s.location.pathname.startsWith("/settings") });
  const actions = useActions();
  useHotkeys(actions);
  useRolloverNotice();

  useEffect(() => {
    let dispose: (() => void) | undefined;
    installCloseFlush().then((d) => (dispose = d));
    return () => dispose?.();
  }, []);

  const shortcutOf = (id: string) => actions.find((a) => a.id === id)?.shortcut;

  return (
    <div className="flex h-full">
      <aside
        className={cn(
          "flex w-[248px] shrink-0 flex-col gap-3 border-r border-border bg-chrome px-2.5 py-3 transition-[margin] duration-150 ease-out",
          !app.sidebarOpen && "-ml-[248px]",
        )}
        aria-hidden={!app.sidebarOpen}
      >
        <div className="flex items-center justify-between px-1.5">
          <span className="font-[family-name:var(--font-serif)] text-[15px] font-semibold tracking-tight">dhyana</span>
          <IconButton label="Toggle sidebar" shortcut={shortcutOf("sidebar")} onClick={app.toggleSidebar}>
            <PanelLeft size={15} />
          </IconButton>
        </div>

        <button
          onClick={() => app.openPalette("commands")}
          className="flex h-8 items-center gap-2 rounded-md border border-border bg-popover px-2.5 text-muted transition-colors duration-100 hover:bg-chrome-hover"
        >
          <Search size={14} />
          <span className="flex-1 text-left">Search commands</span>
          <Kbd shortcut="mod+k" />
        </button>

        <nav className="flex flex-col gap-0.5">
          <NavLink
            to="/day/$date"
            params={{ date: app.today }}
            active={selected === app.today && !onSettings}
            icon={<SunMedium size={15} />}
            label="Today"
            shortcut={shortcutOf("today")}
          />
          <NavLink
            to="/settings"
            active={onSettings}
            icon={<SettingsIcon size={15} />}
            label="Settings"
            shortcut={shortcutOf("settings")}
          />
        </nav>

        <Calendar selected={selected} onSelect={(date) => navigate({ to: "/day/$date", params: { date } })} />
      </aside>

      <main className="relative min-w-0 flex-1 overflow-hidden bg-surface">
        {!app.sidebarOpen && (
          <div className="absolute left-3 top-3 z-10">
            <IconButton label="Show sidebar" shortcut={shortcutOf("sidebar")} onClick={app.toggleSidebar}>
              <PanelLeft size={15} />
            </IconButton>
          </div>
        )}
        <Outlet />
      </main>

      <CommandPalette actions={actions} />
      <Toaster position="bottom-right" theme="system" toastOptions={{ className: "!font-[family-name:var(--font-ui)]" }} />
    </div>
  );
}

function NavLink(props: {
  to: "/day/$date" | "/settings";
  params?: { date: string };
  active: boolean;
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
}) {
  return (
    <Link
      to={props.to}
      params={props.params as never}
      className={cn(
        "flex h-8 items-center gap-2 rounded-md px-2 text-[13px] transition-colors duration-100",
        props.active ? "bg-chrome-active text-fg" : "text-muted hover:bg-chrome-hover hover:text-fg",
      )}
    >
      {props.icon}
      <span className="flex-1">{props.label}</span>
      {props.shortcut && <Kbd shortcut={props.shortcut} />}
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
    <button
      aria-label={label}
      title={shortcut ? `${label} (${formatShortcut(shortcut).join("+")})` : label}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors duration-100 hover:bg-chrome-hover hover:text-fg"
    >
      {children}
    </button>
  );
}
