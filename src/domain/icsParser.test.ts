import {
  parseIcsContent,
  parseIcsDate,
  parseAttendee,
  unfoldIcsContent,
  unescapeIcsValue,
  expandEventsForDate,
} from './icsParser';

describe('icsParser', () => {
  test('unfoldIcsContent unfolds lines with leading whitespace', () => {
    const raw = 'SUMMARY:Weekly Team Sync\r\nDESCRIPTION:This is a long description\r\n  that spans multiple lines';
    const unfolded = unfoldIcsContent(raw);
    expect(unfolded.length).toBe(2);
    expect(unfolded[1]).toBe('DESCRIPTION:This is a long description that spans multiple lines');
  });

  test('unescapeIcsValue unescapes special characters', () => {
    expect(unescapeIcsValue('Hello\\, World\\; Line 1\\nLine 2')).toBe('Hello, World; Line 1\nLine 2');
  });

  test('parseIcsDate handles UTC, local, and invalid date formats', () => {
    const utcRes = parseIcsDate('20260816T140000Z');
    expect(utcRes.allDay).toBe(false);
    expect(utcRes.date.toISOString()).toBe('2026-08-16T14:00:00.000Z');

    const localRes = parseIcsDate('20260816T140000');
    expect(localRes.allDay).toBe(false);
    expect(localRes.date.getFullYear()).toBe(2026);

    const dateOnlyRes = parseIcsDate('VALUE=DATE:20260816');
    expect(dateOnlyRes.allDay).toBe(true);
    expect(dateOnlyRes.date.getFullYear()).toBe(2026);

    const fallbackRes = parseIcsDate('invalid-date-string');
    expect(fallbackRes.date).toBeInstanceOf(Date);
  });

  test('parseAttendee parses name, email and status', () => {
    const line = 'ATTENDEE;CN="Sarah Connor";PARTSTAT=ACCEPTED:mailto:s.connor@acme.com';
    const att = parseAttendee(line);
    expect(att.name).toBe('Sarah Connor');
    expect(att.email).toBe('s.connor@acme.com');
    expect(att.status).toBe('ACCEPTED');

    const att2 = parseAttendee('ATTENDEE;PARTSTAT=DECLINED:plainemail@example.com');
    expect(att2.email).toBe('plainemail@example.com');
    expect(att2.status).toBe('DECLINED');
  });

  test('parseIcsContent parses standard VEVENT block and fallback defaults', () => {
    const icsData = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:evt-1001
SUMMARY:Project Architecture Review
DESCRIPTION:Reviewing the Supernote plugin architecture\\nand E-ink UX patterns.
LOCATION:Meeting Room A / Zoom
DTSTART:20260816T140000Z
DTEND:20260816T150000Z
ORGANIZER;CN="taoist22":mailto:ct@example.com
ATTENDEE;CN="Alice";PARTSTAT=ACCEPTED:mailto:alice@example.com
ATTENDEE;CN="Bob";PARTSTAT=TENTATIVE:mailto:bob@example.com
END:VEVENT
BEGIN:VEVENT
UID:evt-1002
DTSTART:20260816T160000Z
END:VEVENT
END:VCALENDAR`;

    const events = parseIcsContent(icsData, 'Work Calendar');
    expect(events.length).toBe(2);

    const evt1 = events[0];
    expect(evt1.uid).toBe('evt-1001');
    expect(evt1.summary).toBe('Project Architecture Review');
    expect(evt1.organizer?.name).toBe('taoist22');

    const evt2 = events[1];
    expect(evt2.summary).toBe('(No Title)');
  });

  test('expandEventsForDate expands daily and weekly recurring events', () => {
    const icsData = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:rec-2002
SUMMARY:Weekly Standup
DTSTART:20260802T090000Z
DTEND:20260802T093000Z
RRULE:FREQ=WEEKLY
END:VEVENT
BEGIN:VEVENT
UID:rec-2003
SUMMARY:Daily Checkin
DTSTART:20260815T080000Z
DTEND:20260815T081500Z
RRULE:FREQ=DAILY
END:VEVENT
END:VCALENDAR`;

    const events = parseIcsContent(icsData);
    const targetDate = new Date('2026-08-16T00:00:00Z');
    const expanded = expandEventsForDate(events, targetDate);

    expect(expanded.length).toBe(2);
    expect(expanded[0].summary).toBe('Daily Checkin');
    expect(expanded[1].summary).toBe('Weekly Standup');
  });

  test('expands a simple monthly rule on the same calendar day', () => {
    const events = parseIcsContent(`BEGIN:VCALENDAR
BEGIN:VEVENT
UID:monthly-1
SUMMARY:Monthly review
DTSTART:20260821T090000
DTEND:20260821T100000
RRULE:FREQ=MONTHLY
END:VEVENT
END:VCALENDAR`);

    expect(expandEventsForDate(events, new Date(2026, 7, 21))).toHaveLength(1);
    expect(expandEventsForDate(events, new Date(2026, 8, 20))).toHaveLength(0);
    expect(expandEventsForDate(events, new Date(2026, 8, 21))).toHaveLength(1);
    expect(expandEventsForDate(events, new Date(2026, 9, 21))).toHaveLength(1);
  });

  test('expandEventsForDate respects exceptionDates for single occurrence deletion', () => {
    const icsData = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:rec-3001
SUMMARY:Daily Sync
DTSTART:20260815T080000Z
DTEND:20260815T081500Z
RRULE:FREQ=DAILY
END:VEVENT
END:VCALENDAR`;

    const events = parseIcsContent(icsData);
    events[0].exceptionDates = ['2026-08-16'];

    const aug16 = new Date(2026, 7, 16);
    const expandedAug16 = expandEventsForDate(events, aug16);
    expect(expandedAug16.length).toBe(0);

    const aug17 = new Date(2026, 7, 17);
    const expandedAug17 = expandEventsForDate(events, aug17);
    expect(expandedAug17.length).toBe(1);
  });

  test('honours INTERVAL, BYDAY, COUNT and UNTIL recurrence fields', () => {
    const everyOtherMonWed = parseIcsContent(`BEGIN:VCALENDAR
BEGIN:VEVENT
UID:class-1
SUMMARY:Class
DTSTART:20260803T090000
DTEND:20260803T100000
RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=4
END:VEVENT
END:VCALENDAR`);

    expect(expandEventsForDate(everyOtherMonWed, new Date(2026, 7, 3))).toHaveLength(1);
    expect(expandEventsForDate(everyOtherMonWed, new Date(2026, 7, 5))).toHaveLength(1);
    expect(expandEventsForDate(everyOtherMonWed, new Date(2026, 7, 10))).toHaveLength(0);
    expect(expandEventsForDate(everyOtherMonWed, new Date(2026, 7, 17))).toHaveLength(1);
    expect(expandEventsForDate(everyOtherMonWed, new Date(2026, 7, 19))).toHaveLength(1);
    expect(expandEventsForDate(everyOtherMonWed, new Date(2026, 7, 31))).toHaveLength(0);

    const until = parseIcsContent(`BEGIN:VCALENDAR
BEGIN:VEVENT
UID:daily-until
SUMMARY:Short run
DTSTART:20260801T090000
DTEND:20260801T100000
RRULE:FREQ=DAILY;UNTIL=20260803T235959
END:VEVENT
END:VCALENDAR`);
    expect(expandEventsForDate(until, new Date(2026, 7, 3))).toHaveLength(1);
    expect(expandEventsForDate(until, new Date(2026, 7, 4))).toHaveLength(0);
  });

  test('folds EXDATE and RECURRENCE-ID replacements into a recurring series', () => {
    const events = parseIcsContent(`BEGIN:VCALENDAR
BEGIN:VEVENT
UID:sync-1
SUMMARY:Daily sync
DTSTART:20260801T090000
DTEND:20260801T100000
RRULE:FREQ=DAILY
EXDATE:20260802T090000
END:VEVENT
BEGIN:VEVENT
UID:sync-1
RECURRENCE-ID:20260803T090000
SUMMARY:Moved sync
DTSTART:20260803T130000
DTEND:20260803T140000
END:VEVENT
END:VCALENDAR`);

    expect(expandEventsForDate(events, new Date(2026, 7, 2))).toHaveLength(0);
    const aug3 = expandEventsForDate(events, new Date(2026, 7, 3));
    expect(aug3).toHaveLength(1);
    expect(aug3[0].summary).toBe('Moved sync');
    expect(aug3[0].start.getHours()).toBe(13);
  });

  test('converts a TZID wall-clock time into the correct instant', () => {
    const parsed = parseIcsDate('DTSTART;TZID=America/New_York:20260820T100000');
    expect(parsed.date.toISOString()).toBe('2026-08-20T14:00:00.000Z');
  });

  test('drops malformed events instead of placing them at the current time', () => {
    const events = parseIcsContent(`BEGIN:VCALENDAR
BEGIN:VEVENT
UID:bad-date
SUMMARY:Broken
DTSTART:not-a-date
END:VEVENT
END:VCALENDAR`);
    expect(events).toHaveLength(0);
  });

  test('retains the hidden SNFolio task-mirror marker', () => {
    const events = parseIcsContent(`BEGIN:VCALENDAR
BEGIN:VEVENT
UID:task-1787558400000
SUMMARY:Buy milk
X-SNFOLIO-TASK-MIRROR:TRUE
DTSTART:20260824T090000
DTEND:20260824T093000
END:VEVENT
END:VCALENDAR`);

    expect(events).toHaveLength(1);
    expect(events[0].isTaskMirror).toBe(true);
    expect(events[0].summary).toBe('Buy milk');
  });

  test('shows overnight and multi-day events on each overlapping day', () => {
    const events = parseIcsContent(`BEGIN:VCALENDAR
BEGIN:VEVENT
UID:trip
SUMMARY:Trip
DTSTART:20260820T220000
DTEND:20260822T080000
END:VEVENT
END:VCALENDAR`);
    expect(expandEventsForDate(events, new Date(2026, 7, 20))).toHaveLength(1);
    expect(expandEventsForDate(events, new Date(2026, 7, 21))).toHaveLength(1);
    expect(expandEventsForDate(events, new Date(2026, 7, 22))).toHaveLength(1);
    expect(expandEventsForDate(events, new Date(2026, 7, 23))).toHaveLength(0);
  });
});
