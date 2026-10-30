import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/app/context";
import { Calendar as DayPicker } from "@/components/ui/calendar";
import { backend } from "@/lib";
import { firstDayOfWeek, parseISODate, toISODate } from "@/lib/dates";

interface Props {
  selected: string;
  onSelect(date: string): void;
}

const weekStartsOn = firstDayOfWeek() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
const firstOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

/** The sidebar month: shadcn's Calendar, with a dot under every day that has a note. */
export function Calendar({ selected, onSelect }: Props) {
  const { today, daysVersion } = useApp();
  const sel = useMemo(() => parseISODate(selected), [selected]);
  const [month, setMonth] = useState(() => firstOfMonth(sel));
  const [withEntries, setWithEntries] = useState<Date[]>([]);

  // Follow the selected day when it moves to another month (prev/next day, go to date).
  useEffect(() => {
    setMonth(firstOfMonth(sel));
  }, [sel]);

  useEffect(() => {
    let live = true;
    backend
      .listDays(month.getFullYear(), month.getMonth() + 1)
      .then((days) => live && setWithEntries(days.map(parseISODate)))
      .catch(() => live && setWithEntries([]));
    return () => {
      live = false;
    };
  }, [month, daysVersion]);

  return (
    <DayPicker
      mode="single"
      required
      selected={sel}
      onSelect={(d) => onSelect(toISODate(d))}
      month={month}
      onMonthChange={setMonth}
      today={parseISODate(today)}
      weekStartsOn={weekStartsOn}
      showOutsideDays={false}
      formatters={{
        formatWeekdayName: (d) => d.toLocaleDateString(undefined, { weekday: "narrow" }),
      }}
      modifiers={{ hasEntry: withEntries }}
      modifiersClassNames={{
        hasEntry:
          "after:pointer-events-none after:absolute after:z-20 after:bottom-[3px] after:left-1/2 after:size-[3px] after:-translate-x-1/2 after:rounded-full after:bg-muted-foreground after:content-[''] data-[selected=true]:after:bg-primary-foreground",
      }}
      className="w-full select-none bg-transparent p-0 px-1 [--cell-size:--spacing(7)]"
      // These replace (not merge with) the component's defaults, so structural classes are repeated.
      classNames={{
        root: "w-full",
        month: "flex w-full flex-col gap-1",
        month_caption: "flex h-6 w-full items-center justify-start px-1",
        caption_label: "text-[13px] font-medium select-none",
        nav: "absolute inset-x-0 top-0 flex w-full items-center justify-end gap-1",
        weekday: "flex-1 rounded-md text-[11px] font-normal text-muted-foreground select-none",
        week: "mt-0.5 flex w-full",
        today: "font-semibold text-primary",
      }}
    />
  );
}
