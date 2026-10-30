import { Link, useRouterState } from "@tanstack/react-router";
import { CalendarRange, ChevronDown } from "lucide-react";
import { useState } from "react";
import { useDayPicker, type CalendarMonth } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const MONTHS = Array.from({ length: 12 }, (_, m) => new Date(2000, m, 1));
const monthName = (d: Date, style: "long" | "short") =>
  d.toLocaleDateString(undefined, { month: style });

const CHIP =
  "flex h-6 items-center gap-1 rounded-md px-1.5 text-[13px] font-medium transition-colors duration-100 outline-none hover:bg-chrome-hover focus-visible:bg-chrome-hover data-[popup-open]:bg-chrome-hover";
const OPTION =
  "flex h-7 items-center justify-center rounded-md px-1 text-[12px] transition-colors duration-100 outline-none hover:bg-chrome-hover focus-visible:bg-chrome-hover";
const CURRENT = "bg-primary text-primary-foreground hover:bg-primary focus-visible:bg-primary";

/** The month name as a small picker, and the year as a button that opens the year view. */
export function MonthYearCaption({
  calendarMonth,
  displayIndex: _displayIndex,
  ...divProps
}: { calendarMonth: CalendarMonth; displayIndex: number } & React.HTMLAttributes<HTMLDivElement>) {
  const { goToMonth } = useDayPicker();
  const date = calendarMonth.date;
  const [monthOpen, setMonthOpen] = useState(false);
  const onThisYear = useRouterState({
    select: (s) =>
      s.location.pathname.startsWith("/year") &&
      Number((s.location.search as { year?: unknown }).year) === date.getFullYear(),
  });

  const go = (year: number, month: number) => goToMonth(new Date(year, month, 1));

  return (
    <div {...divProps}>
      <Popover open={monthOpen} onOpenChange={setMonthOpen}>
        <PopoverTrigger className={CHIP} aria-label="Choose the month">
          {monthName(date, "long")}
          <ChevronDown size={12} className="text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={2} className="w-[188px] gap-0 p-1.5">
          <div className="grid grid-cols-3 gap-0.5">
            {MONTHS.map((m) => (
              <button
                key={m.getMonth()}
                type="button"
                aria-pressed={m.getMonth() === date.getMonth()}
                className={cn(OPTION, m.getMonth() === date.getMonth() && CURRENT)}
                onClick={() => {
                  go(date.getFullYear(), m.getMonth());
                  setMonthOpen(false);
                }}
              >
                {monthName(m, "short")}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      {/* The year is a button: it opens the year view (every day of the year as a heatmap). */}
      <Link
        to="/year"
        search={{ year: date.getFullYear(), view: "words" }}
        aria-label={`Open the ${date.getFullYear()} year view`}
        aria-current={onThisYear ? "page" : undefined}
        title={`Open the ${date.getFullYear()} year view (G Y)`}
        className={cn(
          "group/year flex h-6 items-center gap-1 rounded-md border border-border bg-popover/70 pr-1 pl-1.5 text-[13px] font-medium tabular-nums outline-none transition-colors duration-100 hover:border-primary/50 hover:bg-chrome-hover hover:text-primary focus-visible:border-primary focus-visible:text-primary",
          onThisYear && "border-primary/50 text-primary",
        )}
      >
        {date.getFullYear()}
        <CalendarRange
          size={12}
          aria-hidden="true"
          className="text-muted-foreground transition-colors duration-100 group-hover/year:text-primary group-focus-visible/year:text-primary"
        />
      </Link>{" "}
    </div>
  );
}
