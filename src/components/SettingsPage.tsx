import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useApp } from "@/app/context";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { backend } from "@/lib";
import { parseTheme, themeOf, type Font, type Mode, type ThemeFamily } from "@/lib/backend";
import { getDevSettings, IS_DEV, setDevSettings } from "@/lib/devSettings";
import { previewSplash } from "@/lib/splash";

const FAMILIES: ThemeFamily[] = ["dhyana", "basic"];
const MODES: Mode[] = ["light", "dark"];
const FONTS: Font[] = ["serif", "sans", "mono"];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const FAMILY_LABELS: Record<ThemeFamily, string> = { dhyana: "Dhyāna", basic: "Basic" };

export function SettingsPage() {
  const app = useApp();
  const state = app.app!;
  const { family, mode } = parseTheme(state.theme);

  const changeVault = async () => {
    try {
      const picked = await backend.pickFolder();
      if (!picked || picked === state.vaultPath) return;
      await app.setVault(picked);
      toast.success("Vault changed", { description: picked });
    } catch (e) {
      toast.error(`Couldn't change the vault: ${e}`);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-chrome">
      <div className="anim-fade mx-auto max-w-[620px] px-8 pb-24 pt-14">
        <h1 className="mb-8 text-[22px] font-semibold tracking-tight">Settings</h1>

        <Section title="Appearance">
          <Row label="Theme" hint="Dhyāna is the warm paper look. Basic is neutral.">
            <Segmented
              options={FAMILIES}
              labels={FAMILY_LABELS}
              value={family}
              onChange={(f) => void app.updateSettings({ theme: themeOf(f, mode) })}
            />
          </Row>
          <Row label="Mode">
            <Segmented
              options={MODES}
              value={mode}
              onChange={(m) => void app.updateSettings({ theme: themeOf(family, m) })}
            />
          </Row>
          <Row label="Writing font">
            <Segmented
              options={FONTS}
              value={state.font}
              onChange={(font) => void app.updateSettings({ font })}
            />
          </Row>
        </Section>

        <Section title="Vault">
          <Row
            label="Location"
            hint="Switching only changes which folder dhyāna opens. Files are never moved or deleted."
          >
            <span className="flex items-center gap-3">
              <span
                className="max-w-[240px] truncate font-mono text-[12px]"
                title={state.vaultPath ?? ""}
              >
                {state.vaultPath}
              </span>
              <Button variant="outline" onClick={() => void changeVault()}>
                Change…
              </Button>
            </span>
          </Row>
        </Section>

        {IS_DEV && <DeveloperSection onPreviewOnboarding={app.replayOnboarding} />}

        <Section title="Keyboard shortcuts">
          <Row
            label="Shortcuts"
            hint="Every action and its keys. Press ? anywhere outside the editor."
          >
            <Button variant="outline" nativeButton={false} render={<Link to="/shortcuts" />}>
              View all
            </Button>
          </Row>
        </Section>

        <p className="mt-10 text-[12px] text-muted-foreground">dhyāna 0.1.0</p>
      </div>
    </div>
  );
}

/** Development builds only (`IS_DEV`); never rendered in production. */
function DeveloperSection({ onPreviewOnboarding }: { onPreviewOnboarding(): void }) {
  const [dev, setDev] = useState(getDevSettings);
  const update = (patch: Partial<typeof dev>) => setDev(setDevSettings(patch));
  const onOff = (v: boolean) => (v ? "on" : "off");
  const LABELS = { on: "On", off: "Off" };
  return (
    <Section title="Developer">
      <Row label="Always show onboarding" hint="Open the onboarding flow on every launch.">
        <Segmented
          options={["off", "on"]}
          labels={LABELS}
          value={onOff(dev.alwaysOnboarding)}
          onChange={(v) => update({ alwaysOnboarding: v === "on" })}
        />
      </Row>
      <Row label="Hold splash screen" hint="Keep the splash up for two seconds on launch.">
        <Segmented
          options={["off", "on"]}
          labels={LABELS}
          value={onOff(dev.holdSplash)}
          onChange={(v) => update({ holdSplash: v === "on" })}
        />
      </Row>
      <Row label="Preview now">
        <span className="flex gap-2">
          <Button variant="outline" onClick={() => previewSplash()}>
            Splash
          </Button>
          <Button variant="outline" onClick={onPreviewOnboarding}>
            Onboarding
          </Button>
        </span>
      </Row>
    </Section>
  );
}

function Section({
  title,
  id,
  children,
}: {
  title: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mb-9">
      <h2 className="mb-2 border-b border-border pb-2 text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-4 py-1.5">
      <div>
        <div className="text-[13px]">{label}</div>
        {hint && <div className="text-[12px] text-muted-foreground">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  options,
  labels,
  value,
  onChange,
}: {
  options: T[];
  labels?: Record<T, string>;
  value: T;
  onChange(v: T): void;
}) {
  return (
    <ToggleGroup
      spacing={0}
      size="sm"
      className="rounded-md border border-border bg-popover p-0.5"
      value={[value]}
      onValueChange={(v) => v[0] && onChange(v[0] as T)} // clicking the selected item would clear it; ignore that
    >
      {options.map((o) => (
        <ToggleGroupItem
          key={o}
          value={o}
          className="h-6 min-w-0 rounded-[4px]! px-2.5 text-[12px] font-normal text-muted-foreground hover:bg-transparent hover:text-foreground aria-pressed:bg-chrome-active aria-pressed:text-foreground aria-pressed:hover:bg-chrome-active"
        >
          {labels?.[o] ?? cap(o)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
