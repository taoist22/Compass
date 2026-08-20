import {
  MINUTES_IN_DAY,
  TIME_STEP,
  clampToDay,
  formatDuration,
  formatTimeOfDay,
  minutesFromDate,
  moveEnd,
  moveStart,
  normaliseRange,
  withTimeOfDay,
} from './timeOfDay';

describe('formatting', () => {
  test('renders a 12-hour clock', () => {
    expect(formatTimeOfDay(9 * 60)).toBe('9:00 AM');
    expect(formatTimeOfDay(13 * 60 + 30)).toBe('1:30 PM');
  });

  test('midnight and noon read correctly rather than as 0:00', () => {
    expect(formatTimeOfDay(0)).toBe('12:00 AM');
    expect(formatTimeOfDay(12 * 60)).toBe('12:00 PM');
  });

  test('minutes are zero padded', () => {
    expect(formatTimeOfDay(9 * 60 + 5)).toBe('9:05 AM');
  });

  test('durations read in hours and minutes', () => {
    // The point of the change: any duration, not four presets.
    expect(formatDuration(30)).toBe('30m');
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(150)).toBe('2h 30m');
    expect(formatDuration(300)).toBe('5h');
  });

  test('a zero or negative duration does not render as nonsense', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(-30)).toBe('0m');
  });
});

describe('date conversion', () => {
  test('reads a time of day off a date', () => {
    expect(minutesFromDate(new Date(2026, 7, 19, 14, 45))).toBe(14 * 60 + 45);
  });

  test('applies a time without moving the calendar day', () => {
    const day = new Date(2026, 7, 19, 23, 30);
    const out = withTimeOfDay(day, 9 * 60);

    expect(out.getDate()).toBe(19);
    expect(out.getHours()).toBe(9);
    expect(out.getMinutes()).toBe(0);
    expect(out.getSeconds()).toBe(0);
  });

  test('a round trip through a date preserves the time', () => {
    const minutes = 17 * 60 + 15;
    expect(minutesFromDate(withTimeOfDay(new Date(2026, 7, 19), minutes))).toBe(minutes);
  });
});

describe('clamping', () => {
  test('never wraps past midnight in either direction', () => {
    // Wrapping would silently move the event to another day.
    expect(clampToDay(-30)).toBe(0);
    expect(clampToDay(MINUTES_IN_DAY + 60)).toBe(MINUTES_IN_DAY - 1);
  });
});

describe('moveStart', () => {
  test('carries the end along, preserving the duration', () => {
    const range = { start: 9 * 60, end: 10 * 60 + 30 };
    const moved = moveStart(range, 60);

    expect(formatTimeOfDay(moved.start)).toBe('10:00 AM');
    expect(moved.end - moved.start).toBe(90);
  });

  test('works backwards too', () => {
    const moved = moveStart({ start: 9 * 60, end: 10 * 60 }, -TIME_STEP);
    expect(formatTimeOfDay(moved.start)).toBe('8:45 AM');
    expect(moved.end - moved.start).toBe(60);
  });

  test('a long meeting keeps its length', () => {
    const range = { start: 9 * 60, end: 14 * 60 };
    expect(moveStart(range, 30).end - moveStart(range, 30).start).toBe(300);
  });

  test('cannot be pushed before midnight', () => {
    const moved = moveStart({ start: 15, end: 60 }, -60);
    expect(moved.start).toBe(0);
    expect(moved.end).toBeGreaterThan(moved.start);
  });
});

describe('moveEnd', () => {
  test('extends and shortens without touching the start', () => {
    const range = { start: 9 * 60, end: 10 * 60 };
    expect(moveEnd(range, 30).end).toBe(10 * 60 + 30);
    expect(moveEnd(range, 30).start).toBe(9 * 60);
  });

  test('never reaches or passes the start', () => {
    const range = { start: 9 * 60, end: 9 * 60 + TIME_STEP };
    const shrunk = moveEnd(range, -60);
    expect(shrunk.end).toBe(range.start + TIME_STEP);
    expect(shrunk.end).toBeGreaterThan(shrunk.start);
  });

  test('supports the durations the old preset list could not', () => {
    let range = { start: 9 * 60, end: 9 * 60 + TIME_STEP };
    range = moveEnd(range, 150 - TIME_STEP);
    expect(formatDuration(range.end - range.start)).toBe('2h 30m');

    range = moveEnd(range, 150);
    expect(formatDuration(range.end - range.start)).toBe('5h');
  });
});

describe('normaliseRange', () => {
  test('repairs an end that is not after the start', () => {
    expect(normaliseRange({ start: 600, end: 600 }).end).toBe(600 + TIME_STEP);
    expect(normaliseRange({ start: 600, end: 300 }).end).toBe(600 + TIME_STEP);
  });

  test('leaves a valid range alone', () => {
    const range = { start: 540, end: 660 };
    expect(normaliseRange(range)).toEqual(range);
  });

  test('brings out-of-range values back inside the day', () => {
    const fixed = normaliseRange({ start: -60, end: MINUTES_IN_DAY + 60 });
    expect(fixed.start).toBe(0);
    expect(fixed.end).toBe(MINUTES_IN_DAY - 1);
  });
});
