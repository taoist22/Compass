import { createMeetingSnapshot, generateNoteFilename } from './meetingSnapshot';
import { CalendarEvent } from './types';

describe('meetingSnapshot', () => {
  const sampleEvent: CalendarEvent = {
    uid: 'evt-100',
    summary: 'Q3 Product Strategy Sync',
    description: '1. Review Q3 Goals\n2. Design System updates',
    location: 'Conference Room 4B / Zoom',
    start: new Date('2026-08-16T10:00:00Z'),
    end: new Date('2026-08-16T11:00:00Z'),
    allDay: false,
    organizer: { name: 'Sarah Connor', email: 's.connor@acme.com' },
    attendees: [
      { name: 'John Doe', email: 'j.doe@acme.com', status: 'ACCEPTED' },
      { name: 'Alex Smith', email: 'a.smith@acme.com', status: 'TENTATIVE' },
    ],
  };

  test('generateNoteFilename formats single meeting filename cleanly', () => {
    const filename = generateNoteFilename(sampleEvent);
    expect(filename).toBe('2026-08-16 - Q3 Product Strategy Sync.note');
  });

  test('generateNoteFilename formats recurring series filename cleanly', () => {
    const recurringEvent: CalendarEvent = {
      ...sampleEvent,
      recurringSeriesId: 'series-999',
      rrule: 'FREQ=WEEKLY',
    };
    const filename = generateNoteFilename(recurringEvent, true, 'Series - ');
    expect(filename).toBe('Series - Q3 Product Strategy Sync.note');
  });

  test('createMeetingSnapshot formats header text block with all fields', () => {
    const snapshot = createMeetingSnapshot(sampleEvent);
    expect(snapshot.title).toBe('Q3 Product Strategy Sync');
    expect(snapshot.organizerStr).toContain('Sarah Connor');
    expect(snapshot.formattedHeaderText).toContain('MEETING: Q3 PRODUCT STRATEGY SYNC');
    expect(snapshot.formattedHeaderText).toContain('John Doe (j.doe@acme.com) [ACCEPTED]');
    expect(snapshot.formattedHeaderText).toContain('Conference Room 4B / Zoom');
    expect(snapshot.formattedHeaderText).toContain('1. Review Q3 Goals');
    expect(snapshot.formattedHeaderText).toContain('[Snapshot Frozen:');
  });

  test('createMeetingSnapshot handles allDay, empty attendees, and missing description', () => {
    const minimalEvent: CalendarEvent = {
      uid: 'evt-200',
      summary: 'Company Holiday',
      start: new Date('2026-12-25T00:00:00Z'),
      end: new Date('2026-12-25T23:59:59Z'),
      allDay: true,
      attendees: [],
    };

    const snapshot = createMeetingSnapshot(minimalEvent);
    expect(snapshot.timeStr).toBe('All Day');
    expect(snapshot.organizerStr).toBe('N/A');
    expect(snapshot.attendeesStr).toContain('No attendees listed');
    expect(snapshot.locationStr).toBe('N/A');
    expect(snapshot.descriptionStr).toContain('No agenda or description provided.');
  });
});
