import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useApp } from "@/app/context";
import { MoodBlob } from "@/components/MoodBlob";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FACTORS, nowHHMM, sortEmotionsFor, valenceLabel } from "@/lib/mood";
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

/**
 * The check-in, in three short steps like Apple Health's: how pleasant it feels (a slider with a
 * shape and colour that follow it), which emotions, and what's behind it. Only the first step
 * matters; the rest can be passed over. Enter moves on, Esc skips.
 */
export function MoodCheckIn({ request, onSave, onDismiss, onDelete }: Props) {
  return (
    <Dialog open={request !== null} onOpenChange={(o) => !o && onDismiss()}>
      <DialogContent showCloseButton={false} className="gap-0 overflow-hidden p-0 sm:max-w-[460px]">
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
  const [valence, setValence] = useState(request.initial?.valence ?? 0);
  const [emotions, setEmotions] = useState<string[]>(request.initial?.emotions ?? []);
  const [factors, setFactors] = useState<string[]>(request.initial?.factors ?? []);
  const [at, setAt] = useState(request.initial?.at ?? nowHHMM());
  const [query, setQuery] = useState("");

  const allEmotions = useMemo(
    () => app.entities.filter((e) => e.kind === "emotion"),
    [app.entities],
  );
  const ordered = useMemo(() => sortEmotionsFor(allEmotions, valence), [allEmotions, valence]);
  const q = nameKey(query);
  const shown = q ? ordered.filter((e) => nameKey(e.display).includes(q)) : ordered;
  const exact = allEmotions.some((e) => nameKey(e.display) === q || nameKey(e.name) === q);

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
  const next = () => (step < STEPS.length - 1 ? setStep(step + 1) : finish());

  // Enter moves on from anywhere but a text field (where it might mean "create").
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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

  const chip = (selected: boolean) =>
    cn(
      "h-7 rounded-full border px-3 text-[12px] transition-spring active:scale-95",
      selected
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-popover text-foreground hover:bg-chrome-hover",
    );

  return (
    <div className="flex flex-col">
      <DialogHeader className="px-5 pt-5">
        <DialogTitle className="text-[15px]">
          {step === 0
            ? editing
              ? "Edit check-in"
              : "How are you feeling right now?"
            : step === 1
              ? "What best describes this feeling?"
              : "What's having the biggest impact on you?"}
        </DialogTitle>
        <DialogDescription className="text-[12px]">
          {step === 0
            ? "Slide to how pleasant or unpleasant this moment feels."
            : step === 1
              ? "Pick as many as fit, or none."
              : "Optional. Pick any that apply."}
        </DialogDescription>
      </DialogHeader>

      <div className="min-h-[260px] px-5 py-4">
        {step === 0 && (
          <div className="flex flex-col items-center gap-4">
            <MoodBlob valence={valence} />
            <div className="text-[17px] font-semibold" aria-live="polite">
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
              className="mood-slider mt-1"
            />
            <div className="flex w-full justify-between text-[11px] text-muted-foreground">
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
              />
            )}
            <div className="flex max-h-[220px] flex-wrap gap-1.5 overflow-y-auto">
              {shown.map((e) => (
                <button
                  key={e.path}
                  type="button"
                  aria-pressed={emotions.some((x) => nameKey(x) === nameKey(e.name))}
                  onClick={() => toggle(emotions, setEmotions, e.name)}
                  className={chip(emotions.some((x) => nameKey(x) === nameKey(e.name)))}
                >
                  {e.display}
                </button>
              ))}
              {query.trim() && !exact && (
                <button type="button" onClick={() => void createEmotion()} className={chip(false)}>
                  <Plus size={12} className="mr-1 inline" />
                  Add “{query.trim()}”
                </button>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-wrap gap-1.5">
            {FACTORS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={factors.includes(id)}
                onClick={() => toggle(factors, setFactors, id)}
                className={chip(factors.includes(id))}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-border bg-muted/50 px-5 py-3">
        <div className="flex gap-1" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={cn(
                "size-1.5 rounded-full transition-colors duration-150",
                i === step ? "bg-foreground" : "bg-muted-foreground/30",
              )}
            />
          ))}
        </div>
        {editing && (
          <>
            <Input
              type="time"
              aria-label="Time"
              value={at}
              onChange={(e) => setAt(e.target.value)}
              className="ml-2 h-7 w-[110px] text-[12px]"
            />
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
          <Button variant="ghost" onClick={() => setStep(step - 1)}>
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
