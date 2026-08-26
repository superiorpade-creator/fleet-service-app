"use client";

import { useSearchParams } from "next/navigation";
import { format, addMonths, subMonths } from "date-fns";

// Shared Prev/Today/Next controls sitting above however many calendar
// grids are stacked below it - moving the month moves all of them
// together, since they all read the same ?month= URL param.
export function CalendarMonthNav({ monthDate }: { monthDate: Date }) {
  const searchParams = useSearchParams();

  function monthHref(date: Date) {
    const params = new URLSearchParams(searchParams);
    params.set("month", format(date, "yyyy-MM"));
    return `/calendar?${params.toString()}`;
  }

  return (
    <div className="flex items-center justify-between mb-4 gap-3 flex-wrap max-w-5xl mx-auto px-4 pt-6">
      <h1 className="font-display text-2xl font-bold">{format(monthDate, "MMMM yyyy")}</h1>
      <div className="flex gap-2">
        
          <a
          href={monthHref(subMonths(monthDate, 1))}
          className="px-3 py-2 border border-line rounded hover:bg-white transition text-sm"
        >
          &larr; Prev
        </a>
        
          <a
          href={monthHref(new Date())}
          className="px-3 py-2 border border-line rounded hover:bg-white transition text-sm"
        >
          Today
        </a>
        
          <a
          href={monthHref(addMonths(monthDate, 1))}
          className="px-3 py-2 border border-line rounded hover:bg-white transition text-sm"
        >
          Next &rarr;
        </a>
      </div>
    </div>
  );
}
