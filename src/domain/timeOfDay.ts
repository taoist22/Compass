/**
 * Times of day as minutes past midnight.
 *
 * Replaces the hour/minute/AM-PM chip rows plus a fixed duration list. That
 * arrangement needed three scrolling rows of chips — too wide for a Nomad —
 * and could only express the four durations someone thought of in advance, so
 * a two-and-a-half or five hour meeting was impossible to enter.
 *
 * Start and end are each nudged by discrete taps, which suits a display that
 * ghosts on frequent redraws far better than a slider or a spinner.
 */

export const MINUTES_IN_DAY = 24 * 60;

/** Smallest gap an event may have, and the fine step size. */
export const TIME_STEP = 15;

export function minutesFromDate(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** Applies a time of day to a date, leaving the calendar day untouched. */
export function withTimeOfDay(day: Date, minutes: number): Date {
  const out = new Date(day);
  out.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return out;
}

export function formatTimeOfDay(minutes: number): string {
  const clamped = clampToDay(minutes);
  const hour24 = Math.floor(clamped / 60);
  const min = clamped % 60;
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(min).padStart(2, '0')} ${suffix}`;
}

/**
 * Clamps rather than wraps. A tap that rolled 11:45 PM round to midnight would
 * silently move the event to a different day.
 */
export function clampToDay(minutes: number): number {
  if (minutes < 0) return 0;
  if (minutes > MINUTES_IN_DAY - 1) return MINUTES_IN_DAY - 1;
  return minutes;
}

export function formatDuration(minutes: number): string {
  if (minutes <= 0) return '0m';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export interface TimeRange {
  start: number;
  end: number;
}

/**
 * Moves the start, carrying the end with it.
 *
 * Preserving the duration is what people expect when they discover a meeting
 * is an hour later than they thought; recomputing the end from scratch would
 * make them re-enter it every time.
 */
export function moveStart(range: TimeRange, delta: number): TimeRange {
  const duration = Math.max(TIME_STEP, range.end - range.start);
  const start = clampToDay(range.start + delta);
  return { start, end: clampToDay(Math.max(start + TIME_STEP, start + duration)) };
}

/** Moves the end, never letting it reach or pass the start. */
export function moveEnd(range: TimeRange, delta: number): TimeRange {
  const end = clampToDay(range.end + delta);
  return { start: range.start, end: Math.max(end, range.start + TIME_STEP) };
}

/** Repairs a range read from stored data, which may predate these rules. */
export function normaliseRange(range: TimeRange): TimeRange {
  const start = clampToDay(range.start);
  const end = clampToDay(range.end);
  return { start, end: end > start ? end : Math.min(start + TIME_STEP, MINUTES_IN_DAY - 1) };
}
