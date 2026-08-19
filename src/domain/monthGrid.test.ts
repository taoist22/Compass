import { generateMonthGrid, allocateCellRows } from './monthGrid';
import { CalendarEvent } from './types';

describe('monthGrid', () => {
  test('generates valid month grid matrix with correct week rows and day counts', () => {
    const events: CalendarEvent[] = [
      {
        uid: 'm-1',
        summary: 'Aug 16 Meeting',
        start: new Date(2026, 7, 16, 10, 0),
        end: new Date(2026, 7, 16, 11, 0),
        allDay: false,
        attendees: [],
      },
    ];

    const today = new Date(2026, 7, 16);
    const grid = generateMonthGrid(2026, 7, events, today);

    expect(grid.length).toBeGreaterThanOrEqual(5);
    expect(grid[0].length).toBe(7); // 7 days a week

    // Aug 16, 2026 is a Sunday (index 0)
    let aug16Cell;
    for (const week of grid) {
      for (const cell of week) {
        if (cell.date.getMonth() === 7 && cell.date.getDate() === 16) {
          aug16Cell = cell;
        }
      }
    }

    expect(aug16Cell).toBeDefined();
    expect(aug16Cell?.isToday).toBe(true);
    expect(aug16Cell?.isCurrentMonth).toBe(true);
    expect(aug16Cell?.eventCount).toBe(1);
  });
});

describe('allocateCellRows', () => {
  // Budgets measured from the two devices: ~6 rows on Manta, ~5 on Nomad.
  const MANTA = 6;
  const NOMAD = 5;

  test('shows everything when it fits', () => {
    const a = allocateCellRows(2, 3, MANTA, 3);
    expect(a.events).toBe(2);
    expect(a.tasks).toBe(3);
    expect(a.hiddenEvents).toBe(0);
    expect(a.hiddenTasks).toBe(0);
  });

  test('caps events so a busy morning cannot crowd out every task', () => {
    const a = allocateCellRows(6, 4, MANTA, 3);
    expect(a.events).toBe(3);
    expect(a.hiddenEvents).toBe(3);
    // 3 events + 1 overflow line = 4 of 6, leaving 2 for tasks.
    expect(a.tasks + (a.moreTasksLine ? 1 : 0)).toBeLessThanOrEqual(2);
  });

  test('unused event budget passes to tasks', () => {
    // One event and five tasks is exactly six rows, so all of it fits — the
    // old fixed 3-event cap would have shown only four tasks.
    const light = allocateCellRows(1, 5, MANTA, 3);
    expect(light.events).toBe(1);
    expect(light.tasks).toBe(5);
    expect(light.hiddenTasks).toBe(0);

    // With three events competing, the same six tasks lose rows.
    const busy = allocateCellRows(3, 5, MANTA, 3);
    expect(busy.events).toBe(3);
    expect(busy.tasks).toBeLessThan(light.tasks);
  });

  test('never exceeds the budget, including overflow lines', () => {
    for (const budget of [2, 3, 4, 5, 6, 8]) {
      for (const events of [0, 1, 3, 9]) {
        for (const tasks of [0, 1, 4, 12]) {
          const a = allocateCellRows(events, tasks, budget, 3);
          const used =
            a.events + (a.moreEventsLine ? 1 : 0) + a.tasks + (a.moreTasksLine ? 1 : 0);
          expect(used).toBeLessThanOrEqual(budget);
        }
      }
    }
  });

  test('accounts for every item as either shown or hidden', () => {
    for (const budget of [2, 4, 6]) {
      const a = allocateCellRows(7, 9, budget, 3);
      expect(a.events + a.hiddenEvents).toBe(7);
      expect(a.tasks + a.hiddenTasks).toBe(9);
    }
  });

  test('the Nomad shows one row fewer than the Manta for the same day', () => {
    const manta = allocateCellRows(2, 6, MANTA, 3);
    const nomad = allocateCellRows(2, 6, NOMAD, 3);
    expect(nomad.tasks).toBe(manta.tasks - 1);
  });

  test('a tiny budget still leaves room for the overflow line', () => {
    const a = allocateCellRows(5, 5, 2, 3);
    // One event plus its "+4 more" line fills the two rows entirely.
    expect(a.events).toBe(1);
    expect(a.hiddenEvents).toBe(4);
    expect(a.tasks).toBe(0);
    expect(a.hiddenTasks).toBe(5);
  });

  test('a zero budget hides everything rather than overflowing the cell', () => {
    const a = allocateCellRows(3, 3, 0, 3);
    expect(a.events).toBe(0);
    expect(a.tasks).toBe(0);
    expect(a.hiddenEvents).toBe(3);
    expect(a.hiddenTasks).toBe(3);
  });

  test('an empty day allocates nothing', () => {
    const a = allocateCellRows(0, 0, MANTA, 3);
    expect(a.events).toBe(0);
    expect(a.tasks).toBe(0);
    expect(a.moreEventsLine).toBe(false);
    expect(a.moreTasksLine).toBe(false);
  });
});
