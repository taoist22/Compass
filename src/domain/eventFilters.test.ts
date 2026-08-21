import { dedupeEvents, feedEventHideIdentity, filterEvents } from './eventFilters';
import { CalendarEvent, CalendarSettings } from './types';

describe('eventFilters', () => {
  const dummySettings: CalendarSettings = {
    feeds: [],
    notesDirectory: '/storage/emulated/0/Note/Meetings',
    defaultTemplate: '',
    seriesNotebookPrefix: 'Series - ',
    defaultViewMode: 'agenda',
    themeMode: 'business',
    hideAllDayEvents: false,
    hideSoloEvents: false,
  };

  const sampleEvents: CalendarEvent[] = [
    {
      uid: '1',
      summary: 'Team Meeting',
      start: new Date(),
      end: new Date(),
      allDay: false,
      attendees: [{ name: 'Alice' }],
    },
    {
      uid: '2',
      summary: 'Focus Time',
      start: new Date(),
      end: new Date(),
      allDay: false,
      attendees: [],
    },
    {
      uid: '3',
      summary: 'Company Holiday',
      start: new Date(),
      end: new Date(),
      allDay: true,
      attendees: [],
    },
  ];
  const fingerprintBase: CalendarEvent = {
    uid: 'base',
    summary: 'Shared appointment',
    start: new Date('2026-08-25T10:00:00Z'),
    end: new Date('2026-08-25T11:00:00Z'),
    allDay: false,
    attendees: [],
  };

  test('keeps all events when filters are disabled', () => {
    const res = filterEvents(sampleEvents, dummySettings);
    expect(res.length).toBe(3);
  });

  test('filters out all-day events when hideAllDayEvents is true', () => {
    const res = filterEvents(sampleEvents, { ...dummySettings, hideAllDayEvents: true });
    expect(res.length).toBe(2);
    expect(res.find(e => e.uid === '3')).toBeUndefined();
  });

  test('filters out solo events when hideSoloEvents is true', () => {
    const res = filterEvents(sampleEvents, { ...dummySettings, hideSoloEvents: true });
    expect(res.length).toBe(1);
    expect(res[0].uid).toBe('1');
  });

  test('dedupeEvents collapses the push/pull duplicate and keeps the local copy', () => {
    const local = {
      uid: 'evt-user-1',
      summary: 'Standup',
      isTask: false,
      start: new Date('2026-08-25T10:00:00Z'),
      end: new Date('2026-08-25T10:30:00Z'),
      allDay: false,
      attendees: [],
    };
    // Same UID coming back down through the subscribed webcal feed.
    const fromFeed = { ...local, summary: 'Standup', calendarName: 'iCloud' };

    const res = dedupeEvents([local, fromFeed]);

    expect(res).toHaveLength(1);
    // The local copy wins — it carries isTask and any on-device edits.
    expect(res[0].calendarName).toBeUndefined();
  });

  test('dedupeEvents leaves distinct items alone and tolerates a missing uid', () => {
    const base = { start: new Date(), end: new Date(), allDay: false, attendees: [] };
    const res = dedupeEvents([
      { ...base, uid: 'a', summary: 'A' },
      { ...base, uid: 'b', summary: 'B' },
      { ...base, uid: '', summary: 'No uid 1' },
      { ...base, uid: '', summary: 'No uid 2' },
    ]);

    expect(res).toHaveLength(4);
  });

  test('collapses identical events from two subscribed feeds even when Google gives them different UIDs', () => {
    const first = { ...fingerprintBase, uid: 'google-a', sourceKind: 'feed' as const, calendarName: 'Work' };
    const second = { ...fingerprintBase, uid: 'google-b', sourceKind: 'feed' as const, calendarName: 'Personal' };
    expect(dedupeEvents([first, second])).toHaveLength(1);
  });

  test('never fingerprint-merges editable events', () => {
    const first = { ...fingerprintBase, uid: 'local-a', sourceKind: 'local' as const };
    const second = { ...fingerprintBase, uid: 'local-b', sourceKind: 'local' as const };
    expect(dedupeEvents([first, second])).toHaveLength(2);
  });

  test('hides a subscribed event by its persisted identity', () => {
    const feedEvent = { ...fingerprintBase, uid: 'hidden-google', sourceKind: 'feed' as const };
    expect(filterEvents([feedEvent], {
      ...dummySettings,
      hiddenFeedEventIds: [feedEventHideIdentity(feedEvent)],
    })).toHaveLength(0);
  });

  test('filterEvents dedupes before applying preferences', () => {
    const dup = {
      uid: 'dup-1',
      summary: 'Twice',
      start: new Date(),
      end: new Date(),
      allDay: false,
      attendees: [],
    };

    expect(filterEvents([dup, { ...dup }], dummySettings)).toHaveLength(1);
  });
});
