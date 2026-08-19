import { CalendarEvent } from './types';
import { expandEventsForDate } from './icsParser';

export interface MonthGridCell {
  date: Date;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  eventCount: number;
  events: CalendarEvent[];
}

export function generateMonthGrid(
  year: number,
  month: number, // 0-indexed (0=Jan, 11=Dec)
  allEvents: CalendarEvent[],
  today = new Date()
): MonthGridCell[][] {
  const firstDayOfMonth = new Date(year, month, 1);
  const startingDayOfWeek = firstDayOfMonth.getDay(); // 0=Sun, 1=Mon, ...

  const startDate = new Date(year, month, 1 - startingDayOfWeek);

  const grid: MonthGridCell[][] = [];
  let currentPointer = new Date(startDate);

  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth();
  const todayDate = today.getDate();

  for (let week = 0; week < 6; week++) {
    const weekRow: MonthGridCell[] = [];
    for (let day = 0; day < 7; day++) {
      const cellDate = new Date(currentPointer);
      const isCurrentMonth = cellDate.getMonth() === month;
      const isToday =
        cellDate.getFullYear() === todayYear &&
        cellDate.getMonth() === todayMonth &&
        cellDate.getDate() === todayDate;

      const dayEvents = expandEventsForDate(allEvents, cellDate);

      weekRow.push({
        date: cellDate,
        dayNumber: cellDate.getDate(),
        isCurrentMonth,
        isToday,
        eventCount: dayEvents.length,
        events: dayEvents,
      });

      currentPointer.setDate(currentPointer.getDate() + 1);
    }
    grid.push(weekRow);

    // Stop if 5 weeks rendered and we reached next month
    if (week >= 4 && currentPointer.getMonth() !== month) {
      break;
    }
  }

  return grid;
}

export interface CellRowAllocation {
  events: number;
  tasks: number;
  hiddenEvents: number;
  hiddenTasks: number;
  /** Whether a "+N more" line is drawn — it occupies a row of the budget. */
  moreEventsLine: boolean;
  moreTasksLine: boolean;
}

/**
 * Decides how many event and task lines a month cell can show.
 *
 * Row counts used to be fixed constants, which only ever suited one device.
 * The Manta and Nomad differ three ways at once — cell height 140dp vs 123dp,
 * width 146dp vs 107dp, and a fontScale of 0.85 vs 1.0 that renders the same
 * declared size 18% larger on the Nomad. Seven rows fitted the Manta purely
 * because its text was being shrunk; on the Nomad it overflowed and, because
 * the cell uses minHeight, stretched the whole week taller.
 *
 * So the budget comes from the measured cell instead. Events are capped so a
 * busy morning cannot crowd out every task, but any budget they do not use
 * passes to tasks — a day with one event and five tasks shows 1 and 4 rather
 * than wasting event slots.
 *
 * Items can be hidden without an overflow line being drawn: when the budget is
 * exhausted there is nowhere to put one, and drawing it anyway is what pushed
 * the cell past its height.
 */
export function allocateCellRows(
  eventCount: number,
  taskCount: number,
  budget: number,
  eventCap: number
): CellRowAllocation {
  const usable = Math.max(0, budget);

  const fit = (count: number, room: number) => {
    let shown = Math.min(count, room);
    let hidden = count - shown;
    // The overflow line needs a row of its own; give up one item to make room.
    if (hidden > 0 && shown + 1 > room) shown = Math.max(0, room - 1);
    hidden = count - shown;
    const line = hidden > 0 && shown + 1 <= room;
    return { shown, hidden, line };
  };

  const ev = fit(Math.min(eventCount, eventCap), usable);
  // Events beyond the cap are hidden regardless of how much room there is.
  const hiddenEvents = eventCount - ev.shown;
  const eventsLine = hiddenEvents > 0 && ev.shown + 1 <= usable;

  const remaining = Math.max(0, usable - ev.shown - (eventsLine ? 1 : 0));
  const tk = fit(taskCount, remaining);

  return {
    events: ev.shown,
    tasks: tk.shown,
    hiddenEvents,
    hiddenTasks: tk.hidden,
    moreEventsLine: eventsLine,
    moreTasksLine: tk.line,
  };
}
