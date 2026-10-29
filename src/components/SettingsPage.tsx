import { useEffect } from "react";
import { useActions } from "@/app/actions";
import { useApp } from "@/app/context";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import type { Font, Theme } from "@/lib/backend";
import { cn } from "@/lib/utils";

const THEMES: Theme[] = ["paper", "light", "dark"];
const FONTS: Font[] = ["serif", "sans", "mono"];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export function SettingsPage() {
  const app = useApp();
  const actions = useActions();
  const state = app.app!;

  // "?" and the palette link here with #shortcuts
  useEffect(() => {
    if (window.location.hash.includes("shortcuts")) {
      document.getElementById("shortcuts")?.scrollIntoView();
    }
  }, []);

  return (
    <div className="h-full overflow-y-auto bg-chrome">
      <div className="anim-fade mx-auto max-w-[620px] px-8 pb-24 pt-14">
        <h1 className="mb-8 text-[22px] font-semibold tracking-tight">Settings</h1>

        <Section title="Appearance">
          <Row label="Theme">
            <Segmented options={THEMES} value={state.theme} onChange={(theme) => void app.updateSettings({ theme })} />
          </Row>
          <Row label="Writing font">
            <Segmented options={FONTS} value={state.font} onChange={(font) => void app.updateSettings({ font })} />
          </Row>
        </Section>

        <Section title="Vault">
          <Row label="Location" hint="Change it by replaying onboarding. Files are never moved.">
            <span className="max-w-[300px] truncate font-mono text-[12px]" title={state.vaultPath ?? ""}>
              {state.vaultPath}
            </span>
          </Row>
        </Section>

        <Section title="Onboarding">
          <Row label="Replay onboarding" hint="Walk through the welcome flow again. Your vault and notes are untouched.">
            <Button onClick={app.replayOnboarding}>Replay</Button>
          </Row>
        </Section>

        <Section title="Keyboard shortcuts" id="shortcuts">
          {actions.map((a) => (
            <Row key={a.id} label={a.label}>
              <span className="flex items-center gap-2">
                {a.shortcut ? <Kbd shortcut={a.shortcut} /> : <span className="text-[12px] text-muted">palette only</span>}
                {a.also?.map((s) => (
                  <span key={s} className="flex items-center gap-2 text-muted">
                    or <Kbd shortcut={s} />
                  </span>
                ))}
              </span>
            </Row>
          ))}
          <p className="px-1 pt-3 text-[12px] text-muted">
            Single-key shortcuts (like G T) work outside the editor. Press Esc to leave the editor.
          </p>
        </Section>

        <p className="mt-10 text-[12px] text-muted">dhyana 0.1.0</p>
      </div>
    </div>
  );
}

function Section({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-9">
      <h2 className="mb-2 border-b border-border pb-2 text-[12px] font-medium uppercase tracking-wide text-muted">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-4 py-1.5">
      <div>
        <div className="text-[13px]">{label}</div>
        {hint && <div className="text-[12px] text-muted">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function Segmented<T extends string>({ options, value, onChange }: { options: T[]; value: T; onChange(v: T): void }) {
  return (
    <div className="flex rounded-md border border-border bg-popover p-0.5" role="group">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          aria-pressed={value === o}
          className={cn(
            "h-6 rounded px-2.5 text-[12px] transition-colors duration-100",
            value === o ? "bg-chrome-active text-fg" : "text-muted hover:text-fg",
          )}
        >
          {cap(o)}
        </button>
      ))}
    </div>
  );
}
