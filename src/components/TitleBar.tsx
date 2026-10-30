import { useEffect, useState } from "react";
import { backend } from "@/lib";
import { isMac } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

/**
 * The window is frameless on every desktop platform. macOS keeps its native traffic lights
 * (overlaid on the left, see `titleBarStyle: "Overlay"` in tauri.conf.json); Windows and Linux
 * get the minimise / maximise / close buttons drawn here, on the right.
 */

/** Left inset that clears the macOS traffic lights; zero elsewhere. */
export const trafficLightInset = () => backend.native && isMac();

/** Slightly taller where there are no traffic lights to line up with, so the logo sits about as far from the top edge as from the left. */
export const titlebarHeight = () => (trafficLightInset() ? "h-9" : "h-12");

type Win = Awaited<ReturnType<typeof currentWindow>>;
const currentWindow = async () => (await import("@tauri-apps/api/window")).getCurrentWindow();

function useMaximized(enabled: boolean) {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let dead = false;
    let off: (() => void) | undefined;
    void (async () => {
      const win = await currentWindow();
      const sync = async () => {
        const m = await win.isMaximized();
        if (!dead) setMaximized(m);
      };
      await sync();
      off = await win.onResized(sync);
      if (dead) off();
    })();
    return () => {
      dead = true;
      off?.();
    };
  }, [enabled]);
  return maximized;
}

export function WindowControls() {
  const show = backend.native && !isMac();
  const maximized = useMaximized(show);
  if (!show) return null;
  const run = (fn: (w: Win) => Promise<unknown>) => () => void currentWindow().then(fn);
  return (
    <div className="flex h-8 items-stretch self-start text-muted">
      <ControlButton label="Minimize" onClick={run((w) => w.minimize())}>
        <path d="M0 5.5h10" />
      </ControlButton>
      <ControlButton label={maximized ? "Restore" : "Maximize"} onClick={run((w) => w.toggleMaximize())}>
        {maximized ? (
          <>
            <path d="M2.5 2.5V.5h7v7h-2" />
            <rect x="0.5" y="2.5" width="7" height="7" />
          </>
        ) : (
          <rect x="0.5" y="0.5" width="9" height="9" />
        )}
      </ControlButton>
      <ControlButton label="Close" danger onClick={run((w) => w.close())}>
        <path d="M0 0l10 10M10 0L0 10" />
      </ControlButton>
    </div>
  );
}

function ControlButton({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex w-[46px] items-center justify-center transition-colors duration-100",
        danger ? "hover:bg-[#e81123] hover:text-white" : "hover:bg-chrome-hover hover:text-fg",
      )}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
        {children}
      </svg>
    </button>
  );
}
