import { Plus } from "lucide-react";
import { useApp } from "@/app/context";
import { MoodBlob } from "@/components/MoodBlob";
import { factorLabel, formatAt, timeline, valenceLabel } from "@/lib/mood";
import { nameKey } from "@/lib/names";
import type { CheckIn } from "@/lib/schema";
import { cn } from "@/lib/utils";

interface Props {
  mood: CheckIn[];
  pending: CheckIn[];
  onEdit(index: number): void;
  onAdd(): void;
}

/** The day's check-ins in time order, as small chips under the date. Click one to edit it. */
export function MoodStrip({ mood, pending, onEdit, onAdd }: Props) {
  const { entities } = useApp();
  const items = timeline(mood, pending);
  if (!items.length) return null;
  const emotionName = (name: string) =>
    entities.find((e) => e.kind === "emotion" && nameKey(e.name) === nameKey(name))?.display ??
    name;

  return (
    <section
      aria-label="Mood check-ins"
      className="mb-8 flex flex-wrap items-center gap-1.5 select-none"
    >
      {items.map(({ checkin: c, index, pending: held }) => {
        const words = c.emotions.map(emotionName);
        const detail = [valenceLabel(c.valence), ...words, ...c.factors.map(factorLabel)].join(
          ", ",
        );
        return (
          <button
            key={index}
            type="button"
            onClick={() => onEdit(index)}
            title={
              held
                ? `${detail}. Saved into this note when you start writing.`
                : `${detail}. Click to edit.`
            }
            className={cn(
              "flex h-7 max-w-[300px] items-center gap-2 rounded-full border bg-popover/60 px-2.5 text-[12px] transition-spring hover:bg-chrome-hover active:scale-95",
              held ? "border-dashed border-muted-foreground/50" : "border-border",
            )}
          >
            <MoodBlob valence={c.valence} size={15} glyph />
            <span className="text-muted-foreground">{formatAt(c.at)}</span>
            <span className="truncate">
              {words.length ? words.join(", ") : valenceLabel(c.valence)}
            </span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={onAdd}
        aria-label="Add a check-in"
        title="Add a check-in"
        className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-spring hover:bg-chrome-hover hover:text-foreground active:scale-90"
      >
        <Plus size={14} />
      </button>
    </section>
  );
}
