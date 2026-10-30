import { Check, FolderOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { useApp } from "@/app/context";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { backend } from "@/lib";
import type { Font, Theme } from "@/lib/backend";
import { shortcutLabel } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

const STEPS = ["welcome", "vault", "look", "done"] as const;
type Step = (typeof STEPS)[number];

const DEFAULT_THEME: Theme = "dhyana-light";
const DEFAULT_FONT: Font = "serif";

const THEME_CARDS: { id: Theme; label: string; swatch: string; ink: string }[] = [
  { id: "dhyana-light", label: "Dhyāna light", swatch: "#f6efe2", ink: "#3b3226" },
  { id: "dhyana-dark", label: "Dhyāna dark", swatch: "#302a23", ink: "#e8dfce" },
  { id: "basic-light", label: "Basic light", swatch: "#ffffff", ink: "#1f1f23" },
  { id: "basic-dark", label: "Basic dark", swatch: "#17171a", ink: "#dcdce2" },
];

const FONTS: { id: Font; label: string; family: string }[] = [
  { id: "serif", label: "Serif", family: "var(--font-serif)" },
  { id: "sans", label: "Sans", family: "var(--font-sans)" },
  { id: "mono", label: "Mono", family: "var(--font-mono)" },
];

/**
 * First-launch flow, also replayable from Settings. Replaying is non-destructive: it starts from
 * the current choices, keeps the current vault unless you pick another, and never moves files.
 */
export function Onboarding() {
  const app = useApp();
  const replay = app.replaying;
  const current = app.app!;

  const [step, setStep] = useState<Step>("welcome");
  const [vault, setVault] = useState<string | null>(current.vaultPath);
  // A first run starts from the defaults whatever is in the settings file; a replay starts from the current choices.
  const firstRun = !current.onboardingCompleted;
  const [theme, setTheme] = useState<Theme>(firstRun ? DEFAULT_THEME : current.theme);
  const [font, setFont] = useState<Font>(firstRun ? DEFAULT_FONT : current.font);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!vault) backend.defaultVaultPath().then(setVault);
  }, [vault]);

  useEffect(() => {
    app.previewAppearance({ theme, font });
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, font]);

  const cancel = () => {
    app.previewAppearance(null);
    app.endReplay();
  };

  const finish = async (opts?: { defaults?: boolean }) => {
    setBusy(true);
    setError(null);
    try {
      const target = opts?.defaults
        ? (current.vaultPath ?? (await backend.defaultVaultPath()))
        : vault;
      if (target && target !== current.vaultPath) await app.setVault(target);
      await app.updateSettings({
        onboardingCompleted: true,
        ...(opts?.defaults ? { theme: DEFAULT_THEME, font: DEFAULT_FONT } : { theme, font }),
      });
      app.endReplay();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  const idx = STEPS.indexOf(step);
  const next = () => setStep(STEPS[Math.min(idx + 1, STEPS.length - 1)]);
  const back = () => setStep(STEPS[Math.max(idx - 1, 0)]);

  // Enter continues, Esc cancels a replay.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && replay) cancel();
      if (e.key === "Enter" && !busy && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        if (step === "done") void finish();
        else next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [step, busy, replay, vault, theme, font]);

  const switching = replay && vault !== current.vaultPath;

  return (
    <div className="anim-fade fixed inset-0 z-30 flex flex-col items-center justify-center bg-chrome px-6">
      <div className="w-full max-w-[460px]">
        {step === "welcome" && (
          <div className="group anim-pop mb-6 flex justify-center">
            <Logo size={56} className="logo-mark text-primary" />
          </div>
        )}
        <div
          className="mb-8 flex items-center justify-center gap-1.5"
          aria-label={`Step ${idx + 1} of ${STEPS.length}`}
        >
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={cn(
                "h-1 w-8 rounded-full transition-colors duration-150",
                i <= idx ? "bg-primary" : "bg-border",
              )}
            />
          ))}
        </div>

        {step === "welcome" && (
          <Panel
            title="Welcome to dhyāna"
            body="A quiet place to write. Your journal is plain markdown files in a folder you choose, and everything works offline."
          >
            <p className="text-muted-foreground">
              One note per day. Opens to today. No account, nothing leaves your machine.
            </p>
          </Panel>
        )}

        {step === "vault" && (
          <Panel
            title="Where should your journal live?"
            body="Pick a folder. Notes are saved inside it as journal/2026/10/2026-10-28.md."
          >
            <div className="flex items-center gap-2 rounded-lg border border-border bg-popover px-3 py-2.5">
              <FolderOpen size={16} className="shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-mono text-[12px]" title={vault ?? ""}>
                {vault ?? "…"}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const picked = await backend.pickFolder();
                  if (picked) setVault(picked);
                }}
              >
                Choose…
              </Button>
            </div>
            <p className="mt-2 text-[12px] text-muted-foreground">
              {replay && !switching
                ? "This is your current vault. Keep it, or choose another; your existing files are never moved or deleted."
                : switching
                  ? "Switching vaults only changes which folder dhyāna opens. Nothing is moved or deleted."
                  : "A new folder is created if it doesn't exist. Syncing it with Drive, iCloud or OneDrive works fine."}
            </p>
          </Panel>
        )}

        {step === "look" && (
          <Panel title="Make it yours" body="Both can be changed later in Settings.">
            <Label>Theme</Label>
            <div className="mb-4 grid grid-cols-4 gap-2">
              {THEME_CARDS.map((t) => (
                <Choice key={t.id} selected={theme === t.id} onClick={() => setTheme(t.id)}>
                  <span
                    className="flex h-10 items-center justify-center rounded-md border border-border text-[15px]"
                    style={{ background: t.swatch, color: t.ink, fontFamily: "var(--font-serif)" }}
                  >
                    Aa
                  </span>
                  {t.label}
                </Choice>
              ))}
            </div>
            <Label>Writing font</Label>
            <div className="grid grid-cols-3 gap-2">
              {FONTS.map((f) => (
                <Choice key={f.id} selected={font === f.id} onClick={() => setFont(f.id)}>
                  <span
                    className="flex h-10 items-center justify-center text-[18px]"
                    style={{ fontFamily: f.family }}
                  >
                    Aa
                  </span>
                  {f.label}
                </Choice>
              ))}
            </div>
          </Panel>
        )}

        {step === "done" && (
          <Panel
            title="You're set"
            body="Today's note is ready whenever you are. Nothing is created until you type."
          >
            <ul className="space-y-1.5 text-muted-foreground">
              <li>
                <b className="text-foreground">{shortcutLabel("mod+k")}</b> opens the command
                palette. Every action is in there.
              </li>
              <li>
                <b className="text-foreground">Esc</b> leaves the editor, then{" "}
                <b className="text-foreground">G T</b> jumps to today.
              </li>
            </ul>
          </Panel>
        )}

        {error && (
          <p role="alert" className="mt-4 text-[12px] text-red-500">
            {error}
          </p>
        )}

        <div className="mt-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {idx > 0 && (
              <Button variant="ghost" onClick={back} disabled={busy}>
                Back
              </Button>
            )}
            {replay ? (
              <Button variant="ghost" onClick={cancel} disabled={busy}>
                Cancel
              </Button>
            ) : (
              step === "welcome" && (
                <Button
                  variant="ghost"
                  onClick={() => void finish({ defaults: true })}
                  disabled={busy}
                >
                  Skip, use defaults
                </Button>
              )
            )}
          </div>
          {step === "done" ? (
            <Button onClick={() => void finish()} disabled={busy}>
              {switching ? "Switch vault & finish" : replay ? "Finish" : "Start writing"}
            </Button>
          ) : (
            <Button onClick={next} disabled={busy}>
              Continue
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Panel({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div key={title} className="anim-pop">
      <h1 className="mb-2 text-[22px] font-semibold tracking-tight">{title}</h1>
      <p className="mb-5 text-[14px] text-muted-foreground">{body}</p>
      {children}
    </div>
  );
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <div className="mb-1.5 text-[12px] font-medium text-muted-foreground">{children}</div>
);

function Choice({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "relative flex flex-col gap-1.5 rounded-lg border bg-popover p-2 text-center text-[12px] transition-spring hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98]",
        selected ? "border-primary" : "border-border hover:bg-chrome-hover",
      )}
    >
      {children}
      {selected && <Check size={12} className="anim-pop absolute right-1.5 top-1.5 text-primary" />}
    </button>
  );
}
