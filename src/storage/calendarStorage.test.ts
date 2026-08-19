import AsyncStorage from '@react-native-async-storage/async-storage';
import { CalendarStorage, calendarStorage, clearSessionPassword, getSessionPassword } from './calendarStorage';

// AsyncStorage is mocked globally in jest.setup.js.

/** save() is fire-and-forget; let its promises settle before asserting on disk. */
const flushWrites = () => new Promise<void>(resolve => setTimeout(() => resolve(), 0));

describe('calendarStorage', () => {
  test('manages feeds and settings correctly', async () => {
    const settings = calendarStorage.getSettings();
    expect(settings.notesDirectory).toBe('/storage/emulated/0/Note/Meetings');

    calendarStorage.updateSettings({ seriesNotebookPrefix: 'Meeting Series - ' });
    expect(calendarStorage.getSettings().seriesNotebookPrefix).toBe('Meeting Series - ');

    const newFeed = { id: 'feed-1', name: 'Work', enabled: true };
    calendarStorage.addFeed(newFeed);
    expect(calendarStorage.getSettings().feeds.length).toBe(2);

    calendarStorage.removeFeed('feed-1');
    expect(calendarStorage.getSettings().feeds.length).toBe(1);

    calendarStorage.setMapping({
      eventUid: 'evt-1',
      seriesId: 'series-1',
      notePath: '/storage/emulated/0/Note/Meetings/Meeting.note',
      lastPageNum: 1,
      lastCreatedIso: new Date().toISOString(),
    });

    expect(calendarStorage.getMapping('evt-1')?.notePath).toBe('/storage/emulated/0/Note/Meetings/Meeting.note');
    expect(calendarStorage.getMapping('series-1')?.notePath).toBe('/storage/emulated/0/Note/Meetings/Meeting.note');
  });

  test('load returns storage data', async () => {
    const loaded = await calendarStorage.load();
    expect(loaded.settings).toBeDefined();
    expect(loaded.mappings).toBeDefined();
  });

  test('manages user events persistence', () => {
    const mockEvt = { uid: 'user-evt-1', summary: 'Test', start: new Date(), end: new Date(), allDay: false, attendees: [] };
    calendarStorage.addUserEvent(mockEvt);
    expect(calendarStorage.getUserEvents().length).toBe(1);

    // Update existing
    calendarStorage.addUserEvent({ ...mockEvt, summary: 'Updated Test' });
    expect(calendarStorage.getUserEvents()[0].summary).toBe('Updated Test');

    calendarStorage.removeUserEvent('user-evt-1');
    expect(calendarStorage.getUserEvents().length).toBe(0);
  });
});

describe('credential handling', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    clearSessionPassword();
  });

  test('the CalDAV password is never written to AsyncStorage', async () => {
    const store = new CalendarStorage();
    store.updateSettings({
      caldavAppleId: 'user@icloud.com',
      caldavPassword: 'abcd-efgh-ijkl-mnop',
      caldavCalendarUrl: 'https://p02-caldav.icloud.com/123456789/calendars/work/',
    });
    await flushWrites();

    const raw = (await AsyncStorage.getItem('@sn-calendar/settings')) as string;

    expect(raw).toBeTruthy();
    expect(raw).not.toContain('abcd-efgh-ijkl-mnop');
    expect(JSON.parse(raw).caldavPassword).toBeUndefined();

    // Everything non-secret still persists.
    expect(JSON.parse(raw).caldavAppleId).toBe('user@icloud.com');
    expect(JSON.parse(raw).caldavCalendarUrl).toContain('/calendars/work/');
  });

  test('the password stays readable in memory for the session', () => {
    const store = new CalendarStorage();
    store.updateSettings({ caldavPassword: 'in-memory-only' });

    expect(getSessionPassword()).toBe('in-memory-only');
    expect(store.getSettings().caldavPassword).toBe('in-memory-only');
  });

  test('a reload does not restore a password from disk', async () => {
    const first = new CalendarStorage();
    first.updateSettings({ caldavAppleId: 'user@icloud.com', caldavPassword: 'gone-on-reboot' });
    await flushWrites();

    // Simulate a PluginHost restart: module scope is cleared, disk survives.
    clearSessionPassword();

    const second = new CalendarStorage();
    const { settings } = await second.load();

    expect(settings.caldavAppleId).toBe('user@icloud.com');
    expect(settings.caldavPassword).toBe('');
  });
});

describe('legacy task migration on load', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    clearSessionPassword();
  });

  test('tasks stored as events are lifted into the task list and removed from events', async () => {
    await AsyncStorage.setItem(
      '@sn-calendar/userEvents',
      JSON.stringify([
        {
          uid: 'evt-1',
          summary: 'Standup',
          start: '2026-08-17T09:00:00.000Z',
          end: '2026-08-17T09:30:00.000Z',
          allDay: false,
          attendees: [],
        },
        {
          uid: 'task-1',
          summary: '[TASK] Submit lab report',
          isTask: true,
          completed: false,
          start: '2026-08-12T09:00:00.000Z',
          end: '2026-08-12T09:30:00.000Z',
          allDay: true,
          attendees: [],
        },
      ])
    );

    const store = new CalendarStorage();
    await store.load();

    // The real event stays an event.
    expect(store.getUserEvents().map(e => e.uid)).toEqual(['evt-1']);

    // The legacy task becomes a task, with the display prefix stripped.
    const tasks = store.getTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].uid).toBe('task-1');
    expect(tasks[0].title).toBe('Submit lab report');
    expect(tasks[0].dueDate).toBeInstanceOf(Date);
  });

  test('migration does not duplicate a task that already migrated', async () => {
    await AsyncStorage.setItem(
      '@sn-calendar/userEvents',
      JSON.stringify([
        {
          uid: 'task-1',
          summary: '[TASK] Already moved',
          isTask: true,
          start: '2026-08-12T09:00:00.000Z',
          end: '2026-08-12T09:30:00.000Z',
          allDay: true,
          attendees: [],
        },
      ])
    );
    await AsyncStorage.setItem(
      '@sn-calendar/tasks',
      JSON.stringify([
        {
          uid: 'task-1',
          title: 'Already moved',
          completed: true,
          createdAt: '2026-08-12T09:00:00.000Z',
        },
      ])
    );

    const store = new CalendarStorage();
    await store.load();

    expect(store.getTasks()).toHaveLength(1);
    // The already-migrated copy wins; its completion state is not clobbered.
    expect(store.getTasks()[0].completed).toBe(true);
  });
});

describe('task storage', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    clearSessionPassword();
  });

  test('tasks round-trip with their dates revived', async () => {
    const first = new CalendarStorage();
    first.upsertTask({
      uid: 't-1',
      title: 'Read chapter 4',
      dueDate: new Date('2026-08-20T00:00:00.000Z'),
      completed: false,
      createdAt: new Date('2026-08-17T00:00:00.000Z'),
    });
    await flushWrites();

    const second = new CalendarStorage();
    await second.load();
    const [t] = second.getTasks();

    expect(t.title).toBe('Read chapter 4');
    expect(t.dueDate).toBeInstanceOf(Date);
    expect(t.createdAt).toBeInstanceOf(Date);
  });

  test('upsert replaces by uid rather than duplicating', () => {
    const store = new CalendarStorage();
    const base = { uid: 't-1', title: 'A', completed: false, createdAt: new Date() };
    store.upsertTask(base);
    store.upsertTask({ ...base, completed: true, completedAt: new Date() });

    expect(store.getTasks()).toHaveLength(1);
    expect(store.getTasks()[0].completed).toBe(true);
  });

  test('removing a task also removes its subtasks', () => {
    const store = new CalendarStorage();
    const now = new Date();
    store.upsertTask({ uid: 'parent', title: 'P', completed: false, createdAt: now });
    store.upsertTask({ uid: 'child', title: 'C', completed: false, createdAt: now, parentId: 'parent' });
    store.upsertTask({ uid: 'other', title: 'O', completed: false, createdAt: now });

    store.removeTask('parent');

    expect(store.getTasks().map(t => t.uid)).toEqual(['other']);
  });
});

describe('persistence round-trip', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    clearSessionPassword();
  });

  test('settings, feeds, mappings and events survive a reload', async () => {
    const first = new CalendarStorage();
    first.updateSettings({ notesDirectory: '/storage/emulated/0/Note/Custom', caldavEnabled: true });
    first.addFeed({ id: 'feed-school', name: 'School', url: 'https://example.com/x.ics', enabled: true });
    first.setMapping({
      eventUid: 'evt-9',
      seriesId: 'series-9',
      notePath: '/storage/emulated/0/Note/Meetings/Standup.note',
      lastPageNum: 4,
      lastCreatedIso: '2026-08-16T10:00:00.000Z',
    });
    first.addUserEvent({
      uid: 'evt-persist',
      summary: 'Persisted Event',
      start: new Date('2026-08-25T10:00:00Z'),
      end: new Date('2026-08-25T11:00:00Z'),
      allDay: false,
      attendees: [],
    });
    await flushWrites();

    const second = new CalendarStorage();
    const { settings } = await second.load();

    expect(settings.notesDirectory).toBe('/storage/emulated/0/Note/Custom');
    expect(settings.caldavEnabled).toBe(true);
    expect(settings.feeds.some(f => f.id === 'feed-school')).toBe(true);
    expect(second.getMapping('series-9')?.lastPageNum).toBe(4);
    expect(second.getUserEvents()).toHaveLength(1);
  });

  test('event dates revive as Date objects, not ISO strings', async () => {
    const first = new CalendarStorage();
    first.addUserEvent({
      uid: 'evt-date',
      summary: 'Date Check',
      start: new Date('2026-08-25T10:00:00Z'),
      end: new Date('2026-08-25T11:30:00Z'),
      allDay: false,
      attendees: [],
    });
    await flushWrites();

    const second = new CalendarStorage();
    await second.load();
    const revived = second.getUserEvents()[0];

    expect(revived.start).toBeInstanceOf(Date);
    expect(revived.end).toBeInstanceOf(Date);
    expect(revived.start.toISOString()).toBe('2026-08-25T10:00:00.000Z');
    expect(revived.end.getTime() - revived.start.getTime()).toBe(90 * 60 * 1000);
  });

  test('a settings blob missing newer keys still yields a complete object', async () => {
    await AsyncStorage.setItem('@sn-calendar/settings', JSON.stringify({ notesDirectory: '/old/path' }));

    const store = new CalendarStorage();
    const { settings } = await store.load();

    expect(settings.notesDirectory).toBe('/old/path');
    expect(settings.seriesNotebookPrefix).toBe('Series - ');
    expect(settings.feeds).toHaveLength(1);
  });
});
