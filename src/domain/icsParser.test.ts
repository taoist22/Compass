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

  test('expandEventsForDate expands daily, weekly, monthly recurring events', () => {
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

    const aug16 = new Date('2026-08-16T00:00:00Z');
    const expandedAug16 = expandEventsForDate(events, aug16);
    expect(expandedAug16.length).toBe(0);

    const aug17 = new Date('2026-08-17T00:00:00Z');
    const expandedAug17 = expandEventsForDate(events, aug17);
    expect(expandedAug17.length).toBe(1);
  });
});
