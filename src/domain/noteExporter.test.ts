import {
  generateMarkdownSnapshot,
  generateOutboundIcsEvent,
  generateOutboundIcsTodo,
  generatePlainTextSnapshot,
} from './noteExporter';
import { createMeetingSnapshot } from './meetingSnapshot';
import { CalendarEvent } from './types';

describe('noteExporter', () => {
  const sampleEvent: CalendarEvent = {
    uid: 'evt-exp-1',
    summary: 'Physics 301 Midterm Sync',
    description: '1. Review Mechanics\n2. Lab reports',
    location: 'Science Hall 101',
    start: new Date('2026-08-25T10:00:00Z'),
    end: new Date('2026-08-25T11:30:00Z'),
    allDay: false,
    organizer: { name: 'Prof. Davis', email: 'davis@univ.edu' },
    attendees: [{ name: 'Alex Smith', email: 'alex@univ.edu', status: 'ACCEPTED' }],
    actionItems: ['Review Mechanics', 'Submit Lab report'],
  };

  test('generateMarkdownSnapshot generates valid Obsidian markdown with YAML frontmatter', () => {
    const snapshot = createMeetingSnapshot(sampleEvent, 'academic');
    const md = generateMarkdownSnapshot(snapshot, sampleEvent, 'academic');

    expect(md).toContain('---');
    expect(md).toContain('title: "Physics 301 Midterm Sync"');
    expect(md).toContain('Instructor / Professor');
    expect(md).toContain('#class-notes');
    expect(md).toContain('Review Mechanics');
  });

  test('generateOutboundIcsEvent formats valid RFC 5545 VEVENT string', () => {
    const ics = generateOutboundIcsEvent(sampleEvent);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('SUMMARY:Physics 301 Midterm Sync');
    expect(ics).toContain('LOCATION:Science Hall 101');
    expect(ics).toContain('END:VEVENT');
    expect(ics).toContain('END:VCALENDAR');
  });

  test('generateOutboundIcsEvent emits DTSTAMP, which iCloud requires', () => {
    const ics = generateOutboundIcsEvent(sampleEvent);
    expect(ics).toMatch(/\r\nDTSTAMP:\d{8}T\d{6}Z\r\n/);
  });

  test('generateOutboundIcsEvent terminates every content line with CRLF', () => {
    const ics = generateOutboundIcsEvent(sampleEvent);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);
  });

  test('generateOutboundIcsEvent escapes TEXT separators per RFC 5545', () => {
    const ics = generateOutboundIcsEvent({
      ...sampleEvent,
      summary: 'Standup, Tuesday; week 3',
      location: 'Bldg C\\Room 2, Level 1',
      description: 'Line one\nLine two, with comma',
    });

    expect(ics).toContain('SUMMARY:Standup\\, Tuesday\\; week 3');
    expect(ics).toContain('LOCATION:Bldg C\\\\Room 2\\, Level 1');
    expect(ics).toContain('DESCRIPTION:Line one\\nLine two\\, with comma');
  });

  test('generateOutboundIcsEvent folds content lines at 75 octets', () => {
    const ics = generateOutboundIcsEvent({
      ...sampleEvent,
      description: 'x'.repeat(400),
    });

    const octets = (s: string) =>
      [...s].reduce((n, ch) => {
        const cp = ch.codePointAt(0) as number;
        return n + (cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4);
      }, 0);
    const lines = ics.split('\r\n').filter(Boolean);

    expect(lines.every(l => octets(l) <= 75)).toBe(true);
    expect(lines.some(l => l.startsWith(' '))).toBe(true);
    // Unfolding must restore the original value.
    expect(ics.replace(/\r\n /g, '')).toContain(`DESCRIPTION:${'x'.repeat(400)}`);
  });

  test('generatePlainTextSnapshot carries the content without Markdown syntax', () => {
    const snapshot = createMeetingSnapshot(sampleEvent, 'business');
    const txt = generatePlainTextSnapshot(snapshot, sampleEvent, 'business');

    expect(txt).toContain('Physics 301 Midterm Sync');
    expect(txt).toContain('ATTENDEES');
    expect(txt).toContain('TASKS & ACTION ITEMS');
    // No Markdown headings, bullets or frontmatter.
    expect(txt).not.toContain('##');
    expect(txt).not.toContain('---\ntitle:');
  });

  test('generatePlainTextSnapshot uses academic wording in academic mode', () => {
    const snapshot = createMeetingSnapshot(sampleEvent, 'academic');
    const txt = generatePlainTextSnapshot(snapshot, sampleEvent, 'academic');
    expect(txt).toContain('Instructor:');
    expect(txt).toContain('ROSTER & ATTENDEES');
  });

  test('generateOutboundIcsTodo emits a VTODO with DUE, not a VEVENT', () => {
    const ics = generateOutboundIcsTodo({
      ...sampleEvent,
      uid: 'task-1',
      summary: '[TASK] Submit lab report',
      isTask: true,
      allDay: false,
    });

    expect(ics).toContain('BEGIN:VTODO');
    expect(ics).toContain('END:VTODO');
    expect(ics).not.toContain('VEVENT');
    expect(ics).toMatch(/\r\nDUE:\d{8}T\d{6}Z\r\n/);
    // VTODO has no DTEND — a task has a deadline, not a duration.
    expect(ics).not.toContain('DTEND');
    expect(ics).toMatch(/\r\nDTSTAMP:\d{8}T\d{6}Z\r\n/);
  });

  test('generateOutboundIcsTodo strips the legacy [TASK] display prefix', () => {
    const ics = generateOutboundIcsTodo({ ...sampleEvent, summary: '[TASK] Buy milk', isTask: true });
    expect(ics).toContain('SUMMARY:Buy milk');
    expect(ics).not.toContain('[TASK]');
  });

  test('generateOutboundIcsTodo reflects completion state', () => {
    const open = generateOutboundIcsTodo({ ...sampleEvent, isTask: true });
    expect(open).toContain('STATUS:NEEDS-ACTION');
    expect(open).toContain('PERCENT-COMPLETE:0');
    expect(open).not.toContain('COMPLETED:');

    const done = generateOutboundIcsTodo({ ...sampleEvent, isTask: true, completed: true });
    expect(done).toContain('STATUS:COMPLETED');
    expect(done).toContain('PERCENT-COMPLETE:100');
    expect(done).toMatch(/\r\nCOMPLETED:\d{8}T\d{6}Z\r\n/);
  });

  test('generateOutboundIcsTodo uses a DATE-valued DUE for all-day tasks', () => {
    const ics = generateOutboundIcsTodo({
      ...sampleEvent,
      isTask: true,
      allDay: true,
      start: new Date('2026-08-25T00:00:00Z'),
    });
    expect(ics).toContain('DUE;VALUE=DATE:20260825');
  });

  test('generateOutboundIcsEvent uses the DATE value type for all-day events', () => {
    const ics = generateOutboundIcsEvent({
      ...sampleEvent,
      allDay: true,
      start: new Date('2026-08-25T00:00:00Z'),
      end: new Date('2026-08-26T00:00:00Z'),
    });

    expect(ics).toContain('DTSTART;VALUE=DATE:20260825');
    expect(ics).toContain('DTEND;VALUE=DATE:20260826');
    expect(ics).not.toContain('DTSTART:2026');
  });
});
