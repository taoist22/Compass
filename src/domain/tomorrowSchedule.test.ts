import { CalendarEvent } from './types';
import { tomorrowScheduleSummary } from './tomorrowSchedule';

function event(summary: string, hour: number, allDay = false): CalendarEvent {
  return {
    uid: summary,
    summary,
    start: new Date(2026, 7, 27, hour, 0),
    end: new Date(2026, 7, 27, hour + 1, 0),
    allDay,
    attendees: [],
  };
}

describe('tomorrowScheduleSummary', () => {
  test('reports an empty calendar without implying there are no tasks', () => {
    expect(tomorrowScheduleSummary([])).toBe('No events scheduled.');
  });

  test('shows the first timed event and the remaining event count', () => {
    expect(tomorrowScheduleSummary([
      event('Management lecture', 9),
      event('Office hours', 13),
    ])).toBe('9:00 AM Management lecture (+1 more)');
  });

  test('labels an all-day event without showing a misleading midnight time', () => {
    expect(tomorrowScheduleSummary([event('Campus holiday', 0, true)]))
      .toBe('All day Campus holiday');
  });
});
