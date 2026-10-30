import { ChevronDown } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useDayPicker, type CalendarMonth } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** The years the year picker offers: the ones with a journal folder (plus the one on screen). */
export const CalendarYears = createContext<number[]>([]);

const MONTHS = Array.from({ length: 12 }, (_, m) => new Date(2000, m, 1));
const monthName = (d: Date, style: "long" | "short") =>
  d.toLocaleDateString(undefined, { month: style });

const CHIP =
  "flex h-6 items-center gap-1 rounded-md px-1.5 text-[13px] font-medium transition-colors duration-100 outline-none hover:bg-chrome-hover focus-visible:bg-chrome-hover data-[popup-open]:bg-chrome-hover";
const OPTION =
  "flex h-7 items-center justify-center rounded-md px-1 text-[12px] transition-colors duration-100 outline-none hover:bg-chrome-hover focus-visible:bg-chrome-hover";
const CURRENT = "bg-primary text-primary-foreground hover:bg-primary focus-visible:bg-primary";

/** The month name and the year as two small pickers, in place of the plain "October 2026". */
export function MonthYearCaption({
  calendarMonth,
  displayIndex: _displayIndex,
  ...divProps
}: { calendarMonth: CalendarMonth; displayIndex: number } & React.HTMLAttributes<HTMLDivElement>) {
  const { goToMonth } = useDayPicker();
  const years = useContext(CalendarYears);
  const date = calendarMonth.date;
  const [monthOpen, setMonthOpen] = useState(false);
  const [yearOpen, setYearOpen] = useState(false);
  const currentYear = useRef<HTMLButtonElement>(null);

  // Open the year list scrolled to the year on screen.
  useEffect(() => {
    if (yearOpen) currentYear.current?.scrollIntoView({ block: "center" });
  }, [yearOpen]);

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

      {years.length > 1 ? (
        <Popover open={yearOpen} onOpenChange={setYearOpen}>
          <PopoverTrigger className={CHIP} aria-label="Choose the year">
            {date.getFullYear()}
            <ChevronDown size={12} className="text-muted-foreground" />
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={2}
            className="max-h-[216px] w-[84px] gap-0.5 overflow-y-auto p-1.5"
          >
            {[...years].reverse().map((y) => (
              <button
                key={y}
                ref={y === date.getFullYear() ? currentYear : undefined}
                type="button"
                aria-pressed={y === date.getFullYear()}
                className={cn(OPTION, "shrink-0 tabular-nums", y === date.getFullYear() && CURRENT)}
                onClick={() => {
                  go(y, date.getMonth());
                  setYearOpen(false);
                }}
              >
                {y}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      ) : (
        <span className="px-1.5 text-[13px] font-medium tabular-nums">{date.getFullYear()}</span>
      )}
    </div>
  );
}
