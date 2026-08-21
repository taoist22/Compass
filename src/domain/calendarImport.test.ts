import { isIcsCalendarContent, parseCalendarSetupFile } from './calendarImport';

describe('calendar setup import', () => {
  test('parses named and bare feeds, upgrades webcal, and ignores comments', () => {
    const result = parseCalendarSetupFile(`\uFEFF# Created on desktop
Personal|webcal://example.com/personal.ics
https://example.com/work.ics
bad|http://insecure.example.com/feed.ics
not a URL`);

    expect(result.feeds).toEqual([
      { name: 'Personal', url: 'https://example.com/personal.ics' },
      { name: 'Calendar 2', url: 'https://example.com/work.ics' },
    ]);
    expect(result.invalidLines).toBe(2);
  });

  test('detects actual calendar content rather than trusting the extension', () => {
    expect(isIcsCalendarContent('BEGIN:VCALENDAR\nBEGIN:VEVENT\nEND:VEVENT\nEND:VCALENDAR')).toBe(true);
    expect(isIcsCalendarContent('https://example.com/calendar.ics')).toBe(false);
  });
});
