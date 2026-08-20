import { DEFAULT_DAY_GRID, gridHeight, gridHours, hourLabel, placeEvents } from './dayGrid';
import { CalendarEvent } from './types';

const OPTS = { startHour: 8, endHour: 20, hourHeight: 44, minHeight: 30 };

function event(uid: string, startHour: number, endHour: number, over: Partial<CalendarEvent> = {}): CalendarEvent {
  const day = 19;
  return {
    uid,
    summary: uid,
    start: new Date(2026, 7, day, Math.floor(startHour), Math.round((startHour % 1) * 60)),
    end: new Date(2026, 7, day, Math.floor(endHour), Math.round((endHour % 1) * 60)),
    allDay: false,
    attendees: [],
    ...over,
  };
}

describe('the grid itself', () => {
  test('draws a line for every hour inclusive of both ends', () => {
    expect(gridHours(OPTS)).toHaveLength(13);
    expect(gridHours(OPTS)[0]).toBe(8);
    expect(gridHours(OPTS)[12]).toBe(20);
  });

  test('height covers the span, not the number of labels', () => {
    // Twelve gaps between thirteen lines.
    expect(gridHeight(OPTS)).toBe(12 * 44);
  });

  test('hour labels read as a clock, not as 0-23', () => {
    expect(hourLabel(8)).toBe('8 AM');
    expect(hourLabel(12)).toBe('12 PM');
    expect(hourLabel(13)).toBe('1 PM');
    expect(hourLabel(0)).toBe('12 AM');
  });
});

describe('placing events', () => {
  test('an event sits at its start and spans its length', () => {
    const [placed] = placeEvents([event('a', 9, 10.5)], OPTS);
    expect(placed.top).toBe(44);
    expect(placed.height).toBe(66);
  });

  test('an event at the top of the grid starts at zero', () => {
    expect(placeEvents([event('a', 8, 9)], OPTS)[0].top).toBe(0);
  });

  test('a short event keeps a readable minimum height', () => {
    // Fifteen minutes is 11dp of grid; unreadable without a floor.
    expect(placeEvents([event('a', 9, 9.25)], OPTS)[0].height).toBe(30);
  });

  test('all-day events are excluded — they have no position in a day', () => {
    expect(placeEvents([event('a', 0, 0, { allDay: true })], OPTS)).toEqual([]);
  });

  test('an event starting before the grid is clamped in, not dropped', () => {
    // Otherwise the day silently lies about what is on.
    const [placed] = placeEvents([event('early', 6, 9)], OPTS);
    expect(placed.top).toBe(0);
    expect(placed.height).toBeGreaterThan(0);
  });

  test('an event running past the grid is clipped at the bottom', () => {
    const [placed] = placeEvents([event('late', 19, 23)], OPTS);
    expect(placed.top + placed.height).toBeLessThanOrEqual(gridHeight(OPTS));
  });

  test('an event with no duration still renders visibly', () => {
    const [placed] = placeEvents([event('instant', 10, 10)], OPTS);
    expect(placed.height).toBeGreaterThanOrEqual(OPTS.minHeight);
  });
});

describe('overlaps', () => {
  test('a day with no overlaps keeps every event full width', () => {
    const placed = placeEvents([event('a', 9, 10), event('b', 11, 12)], OPTS);
    expect(placed.every(p => p.columns === 1)).toBe(true);
  });

  test('two overlapping events split into two columns', () => {
    const placed = placeEvents([event('a', 9, 11), event('b', 10, 12)], OPTS);
    expect(placed.every(p => p.columns === 2)).toBe(true);
    expect(placed.map(p => p.column).sort()).toEqual([0, 1]);
  });

  test('the earlier event keeps the left track', () => {
    // What a paper planner does: later arrivals move right.
    const placed = placeEvents([event('later', 10, 12), event('earlier', 9, 11)], OPTS);
    expect(placed.find(p => p.event.uid === 'earlier')?.column).toBe(0);
    expect(placed.find(p => p.event.uid === 'later')?.column).toBe(1);
  });

  test('a freed column is reused rather than growing the width', () => {
    // c starts after a ends, so it takes a's track instead of a third column.
    const placed = placeEvents([event('a', 9, 10), event('b', 9.5, 12), event('c', 10, 11)], OPTS);
    expect(placed.every(p => p.columns === 2)).toBe(true);
  });

  test('an overlap elsewhere does not narrow an unrelated event', () => {
    const placed = placeEvents(
      [event('a', 9, 11), event('b', 10, 12), event('alone', 15, 16)],
      OPTS
    );
    expect(placed.find(p => p.event.uid === 'alone')?.columns).toBe(1);
  });

  test('touching events do not count as overlapping', () => {
    // One ending exactly as the next begins is a full day, not a clash.
    const placed = placeEvents([event('a', 9, 10), event('b', 10, 11)], OPTS);
    expect(placed.every(p => p.columns === 1)).toBe(true);
  });

  test('three-way overlaps get three columns', () => {
    const placed = placeEvents([event('a', 9, 12), event('b', 9.5, 12), event('c', 10, 12)], OPTS);
    expect(placed.every(p => p.columns === 3)).toBe(true);
    expect(placed.map(p => p.column).sort()).toEqual([0, 1, 2]);
  });

  test('every event is placed exactly once', () => {
    const events = [event('a', 9, 11), event('b', 10, 12), event('c', 14, 15)];
    const placed = placeEvents(events, OPTS);
    expect(placed).toHaveLength(3);
    expect(new Set(placed.map(p => p.event.uid)).size).toBe(3);
  });
});

describe('defaults', () => {
  test('the default grid runs 8am to 8pm', () => {
    expect(DEFAULT_DAY_GRID.startHour).toBe(8);
    expect(DEFAULT_DAY_GRID.endHour).toBe(20);
  });
});
