import {
  repeatChoiceFromRrule,
  repeatSettingsFromRrule,
  rruleForRepeat,
} from './recurrence';

const START = new Date(2026, 7, 21, 9, 30); // Friday

describe('recurrence form helpers', () => {
  test('recognises and parses a bounded multi-day weekly rule', () => {
    const parsed = repeatSettingsFromRrule(
      'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=12',
      START
    );
    expect(parsed).toMatchObject({
      choice: 'weekly', interval: 2, weekDays: ['MO', 'WE'], endMode: 'count', count: 12,
    });
    expect(repeatChoiceFromRrule(undefined)).toBe('none');
  });

  test('defaults weekly recurrence to the selected start weekday', () => {
    const settings = repeatSettingsFromRrule(undefined, START);
    settings.choice = 'weekly';
    expect(rruleForRepeat(settings, START)).toBe('FREQ=WEEKLY;BYDAY=FR');
  });

  test('builds interval, selected weekdays and a count', () => {
    expect(rruleForRepeat({
      choice: 'weekly', interval: 2, weekDays: ['MO', 'WE'], endMode: 'count', count: 12,
    }, START)).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=12');
  });

  test('builds an inclusive date UNTIL for all-day recurrence', () => {
    expect(rruleForRepeat({
      choice: 'daily', interval: 1, weekDays: [], endMode: 'until',
      until: new Date(2026, 8, 5), count: 10,
    }, START, true)).toBe('FREQ=DAILY;UNTIL=20260905');
  });

  test('none explicitly removes recurrence', () => {
    expect(rruleForRepeat({
      choice: 'none', interval: 1, weekDays: [], endMode: 'never', count: 10,
    }, START)).toBeUndefined();
  });
});
