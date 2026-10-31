import {
  ArrowLeft,
  Bath,
  Briefcase,
  Check,
  CloudSun,
  Dumbbell,
  Fingerprint,
  Flower2,
  GraduationCap,
  Heart,
  HeartHandshake,
  HeartPulse,
  House,
  ListChecks,
  type LucideIcon,
  Newspaper,
  Palette,
  Plane,
  Plus,
  Smile,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";
import { type CSSProperties, type KeyboardEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useApp } from "@/app/context";
import { BouncingMood, MoodBlob, useSpring } from "@/components/MoodBlob";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { TimePicker } from "@/components/TimePicker";
import {
  emotionLean,
  FACTORS,
  formatAt,
  moodColor,
  nowHHMM,
  sortEmotionsFor,
  valenceLabel,
} from "@/lib/mood";
import { nameKey } from "@/lib/names";
import type { CheckIn } from "@/lib/schema";
import { cn } from "@/lib/utils";

export interface CheckInRequest {
  /** Editing this check-in; a new one otherwise. */
  initial?: CheckIn;
  /** Offered automatically on the first open of today. */
  auto?: boolean;
}

interface Props {
  request: CheckInRequest | null;
  /** Saves and closes. */
  onSave(c: CheckIn): void;
  /** Closes without saving (Skip, Esc, clicking outside). */
  onDismiss(): void;
  onDelete?(): void;
}

const STEPS = ["feeling", "emotions", "factors"] as const;

const FACTOR_ICONS: Record<(typeof FACTORS)[number][0], LucideIcon> = {
  health: HeartPulse,
  fitness: Dumbbell,
  "self-care": Bath,
  hobbies: Palette,
  identity: Fingerprint,
  spirituality: Flower2,
  community: Users,
  dating: Heart,
  family: House,
  friends: Smile,
  partner: HeartHandshake,
  tasks: ListChecks,
  weather: CloudSun,
  work: Briefcase,
  education: GraduationCap,
  "current-events": Newspaper,
  travel: Plane,
  money: Wallet,
};

const TITLES = [
  "How are you feeling right now?",
  "What best describes this feeling?",
  "What’s having the biggest impact on you?",
];
const HINTS = [
  "Slide to how pleasant or unpleasant this moment feels.",
  "Pick as many as fit, or none.",
  "Optional. Pick any that apply.",
];

const NUDGE: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };

const CHIP =
  "mood-chip inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-popover/80 pr-3.5 pl-2.5 text-[12.5px] text-foreground transition-spring hover:bg-chrome-hover active:scale-95";

/**
 * The check-in, in three short steps like Apple Health's: how pleasant it feels (a slider with a
 * shape and colour that follow it, and a wash of that colour behind everything), which emotions,
 * and what's behind it. Only the first step matters; the rest can be passed over. Enter moves on,
 * Esc skips.
 */
export function MoodCheckIn({ request, onSave, onDismiss, onDelete }: Props) {
  return (
    <Dialog open={request !== null} onOpenChange={(o) => !o && onDismiss()}>
      <DialogContent showCloseButton={false} className="gap-0 overflow-hidden p-0 sm:max-w-[440px]">
        {request && (
          <Flow
            key={request.initial ? JSON.stringify(request.initial) : "new"}
            request={request}
            onSave={onSave}
            onDismiss={onDismiss}
            onDelete={onDelete}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Flow({ request, onSave, onDismiss, onDelete }: Props & { request: CheckInRequest }) {
  const app = useApp();
  const editing = !!request.initial;
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<"next" | "back">("next");
  const [valence, setValence] = useState(request.initial?.valence ?? 0);
  const [emotions, setEmotions] = useState<string[]>(request.initial?.emotions ?? []);
  const [factors, setFactors] = useState<string[]>(request.initial?.factors ?? []);
  const [at, setAt] = useState(request.initial?.at ?? nowHHMM());
  const [query, setQuery] = useState("");
  // What's drawn glides after the value, so a key press or a click on the track doesn't snap.
  const drawn = useSpring(valence);

  const allEmotions = useMemo(
    () => app.entities.filter((e) => e.kind === "emotion"),
    [app.entities],
  );
  const ordered = useMemo(() => sortEmotionsFor(allEmotions, valence), [allEmotions, valence]);
  const q = nameKey(query);
  const shown = q ? ordered.filter((e) => nameKey(e.display).includes(q)) : ordered;
  const exact = allEmotions.some((e) => nameKey(e.display) === q || nameKey(e.name) === q);
  const picked = (name: string) => emotions.some((x) => nameKey(x) === nameKey(name));
  const displayOf = (name: string) =>
    allEmotions.find((e) => nameKey(e.name) === nameKey(name))?.display ?? name;

  const toggle = (list: string[], set: (l: string[]) => void, v: string) =>
    set(
      list.some((x) => nameKey(x) === nameKey(v))
        ? list.filter((x) => nameKey(x) !== nameKey(v))
        : [...list, v],
    );

  const createEmotion = async () => {
    try {
      const made = await app.createEntity("emotion", query.trim());
      setEmotions((l) => [...l, made.name]);
      setQuery("");
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e));
    }
  };

  const finish = () => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(at)) {
      toast.error("Use a time like 07:30");
      return;
    }
    onSave({ at, valence: Math.round(valence * 100) / 100, emotions, factors });
  };
  const go = (to: number) => {
    setDir(to < step ? "back" : "next");
    setStep(to);
  };
  const next = () => (step < STEPS.length - 1 ? go(step + 1) : finish());

  // Arrow keys move one word along the scale (thirds of it line up with the seven steps);
  // dragging stays continuous.
  const nudge = (e: KeyboardEvent) => {
    const d = NUDGE[e.key];
    if (!d) return;
    e.preventDefault();
    const x = valence * 3;
    const k =
      Math.abs(x - Math.round(x)) < 0.01 ? Math.round(x) + d : d > 0 ? Math.ceil(x) : Math.floor(x);
    setValence(Math.max(-1, Math.min(1, k / 3)));
  };

  // Enter moves on from anywhere but a text field (where it might mean "create").
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Enter" || e.isComposing) return;
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" && el.getAttribute("type") !== "range") return;
      if (el.tagName === "BUTTON") return;
      e.preventDefault();
      next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div
      className="mood-aura flex flex-col"
      style={{ "--tint": moodColor(drawn) } as CSSProperties}
    >
      <DialogHeader className="items-center gap-1.5 px-6 pt-6 text-center">
        {step === 0 ? (
          <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase tabular-nums">
            {editing ? `Check-in · ${formatAt(at)}` : formatAt(at)}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => go(0)}
            title="Change how pleasant this feels"
            className="mb-1 flex max-w-full items-center gap-1.5 rounded-full bg-popover/70 py-1 pr-3 pl-1 text-[12px] ring-1 ring-border transition-spring hover:bg-chrome-hover active:scale-95"
          >
            <MoodBlob valence={drawn} size={20} glyph />
            <span className="shrink-0 font-medium">{valenceLabel(valence)}</span>
            {step === 2 && emotions.length > 0 && (
              <span className="truncate text-muted-foreground">
                · {emotions.map(displayOf).join(", ")}
              </span>
            )}
          </button>
        )}
        <DialogTitle className="text-[17px] leading-snug font-semibold tracking-tight">
          {step === 0 && editing ? "How were you feeling?" : TITLES[step]}
        </DialogTitle>
        <DialogDescription className="text-[12px]">{HINTS[step]}</DialogDescription>
      </DialogHeader>

      <div key={step} className={cn("min-h-[324px] px-6 pt-4 pb-5", `mood-step-${dir}`)}>
        {step === 0 && (
          <div className="flex flex-col items-center">
            {/* Bounces about a wide frame, DVD-logo style. */}
            <BouncingMood valence={drawn} size={176} className="h-[208px] w-full" />
            <div
              key={valenceLabel(valence)}
              className="mood-word -mt-1 text-[22px] font-semibold tracking-tight"
              aria-live="polite"
            >
              {valenceLabel(valence)}
            </div>
            <input
              type="range"
              min={-1}
              max={1}
              step={0.01}
              value={valence}
              autoFocus
              aria-label="How pleasant this feels"
              aria-valuetext={valenceLabel(valence)}
              onChange={(e) => setValence(Number(e.target.value))}
              onKeyDown={nudge}
              className="mood-slider mt-6"
            />
            <div className="mt-2.5 flex w-full justify-between text-[11px] font-medium text-muted-foreground">
              <span>Very unpleasant</span>
              <span>Very pleasant</span>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-3">
            {allEmotions.length > 10 && (
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (shown.length === 1) toggle(emotions, setEmotions, shown[0].name);
                  else if (query.trim() && !exact) void createEmotion();
                }}
                placeholder="Find or add an emotion…"
                aria-label="Find an emotion"
                className="rounded-full bg-popover/80 px-3.5"
              />
            )}
            <div className="-m-1 flex max-h-[228px] flex-wrap justify-center gap-1.5 overflow-y-auto p-1">
              {shown.map((e) => (
                <button
                  key={e.path}
                  type="button"
                  aria-pressed={picked(e.name)}
                  onClick={() => toggle(emotions, setEmotions, e.name)}
                  className={CHIP}
                >
                  {/* A dot in the colour the emotion leans towards; a tick once picked. */}
                  <span aria-hidden="true" className="flex size-3.5 items-center justify-center">
                    {picked(e.name) ? (
                      <Check size={13} strokeWidth={2.5} />
                    ) : (
                      <span
                        className="size-1.5 rounded-full"
                        style={{ background: moodColor(emotionLean(e.name) * 0.8) }}
                      />
                    )}
                  </span>
                  {e.display}
                </button>
              ))}
              {query.trim() && !exact && (
                <button
                  type="button"
                  onClick={() => void createEmotion()}
                  className={cn(CHIP, "border-dashed")}
                >
                  <Plus size={13} aria-hidden="true" />
                  Add “{query.trim()}”
                </button>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-wrap justify-center gap-1.5">
            {FACTORS.map(([id, label]) => {
              const on = factors.includes(id);
              const Icon = on ? Check : FACTOR_ICONS[id];
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(factors, setFactors, id)}
                  className={CHIP}
                >
                  <Icon
                    size={13}
                    aria-hidden="true"
                    strokeWidth={on ? 2.5 : 2}
                    className={on ? undefined : "text-muted-foreground"}
                  />
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-border/70 px-5 py-3">
        <div
          role="img"
          aria-label={`Step ${step + 1} of ${STEPS.length}`}
          className="flex items-center gap-1"
        >
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={cn(
                "h-1.5 rounded-full transition-[width,background-color] duration-200 ease-out",
                i === step ? "w-4 bg-foreground/80" : "w-1.5 bg-muted-foreground/30",
              )}
            />
          ))}
        </div>
        {editing && (
          <>
            <TimePicker value={at} onChange={setAt} className="ml-2" />
            {onDelete && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Delete check-in"
                title="Delete check-in"
                onClick={onDelete}
                className="text-muted-foreground hover:text-red-500"
              >
                <Trash2 />
              </Button>
            )}
          </>
        )}
        <div className="flex-1" />
        {step > 0 ? (
          <Button variant="ghost" onClick={() => go(step - 1)}>
            <ArrowLeft /> Back
          </Button>
        ) : (
          <Button variant="ghost" onClick={onDismiss}>
            {editing ? "Cancel" : "Skip"}
          </Button>
        )}
        {step < STEPS.length - 1 && (step > 0 || editing) && (
          <Button variant="outline" onClick={finish}>
            Done
          </Button>
        )}
        <Button onClick={next}>{step < STEPS.length - 1 ? "Next" : "Done"}</Button>
      </div>
    </div>
  );
}
