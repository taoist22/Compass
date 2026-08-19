import AsyncStorage from '@react-native-async-storage/async-storage';
import { CalendarEvent, CalendarFeed, CalendarSettings, CalendarTask, MeetingNoteMapping, NoteKind } from '../domain/types';
import { isLegacyTaskEvent, taskFromLegacyEvent } from '../domain/taskFilters';
import { DEFAULT_SYSTEM_TEMPLATE } from '../domain/noteTemplates';
import { CaldavPushState, emptyPushState, forgetPush, stateForTarget } from '../domain/pushState';

const SETTINGS_KEY = '@sn-calendar/settings';
const MAPPINGS_KEY = '@sn-calendar/mappings';
const USER_EVENTS_KEY = '@sn-calendar/userEvents';
const TASKS_KEY = '@sn-calendar/tasks';
const PUSH_STATE_KEY = '@sn-calendar/caldavPushState';
const CALDAV_EVENTS_KEY = '@sn-calendar/caldavEvents';
const EVENT_KINDS_KEY = '@sn-calendar/eventKinds';

const DEFAULT_SETTINGS: CalendarSettings = {
  feeds: [
    {
      id: 'primary-cal',
      name: 'Primary Calendar',
      enabled: true,
    },
  ],
  notesDirectory: '/storage/emulated/0/Note/Meetings',
  defaultTemplate: '',
  seriesNotebookPrefix: 'Series - ',
  defaultViewMode: 'month',
  themeMode: 'business',
  hideAllDayEvents: false,
  hideSoloEvents: false,
  caldavEnabled: false,
  caldavProvider: 'icloud',
  caldavAppleId: '',
  caldavPassword: '',
  caldavCalendarUrl: '',
  caldavCustomUrl: '',
  // 8mm ruled is the built-in default for every note kind; each is independently
  // changeable, and any of them may instead hold a custom PNG path.
  meetingTemplate: DEFAULT_SYSTEM_TEMPLATE,
  classTemplate: DEFAULT_SYSTEM_TEMPLATE,
  dailyNoteTemplate: DEFAULT_SYSTEM_TEMPLATE,
  classNotesDirectory: '/storage/emulated/0/Note/Classes',
  dateOrder: 'auto',
  pushTasksAsEvents: false,
  dailyNoteFolder: '/storage/emulated/0/Note/Daily Notes',
  dailyNoteFormat: 'YYYY-MM-DD',
};

/**
 * Spreading DEFAULT_SETTINGS is a shallow copy, so every instance would share
 * the same `feeds` array — and addFeed() pushes into it, mutating the defaults
 * themselves. Hand out a fresh copy instead.
 */
function makeDefaultSettings(): CalendarSettings {
  return {
    ...DEFAULT_SETTINGS,
    feeds: DEFAULT_SETTINGS.feeds.map(f => ({ ...f })),
  };
}

/**
 * The CalDAV app-specific password is deliberately NOT persisted.
 *
 * AsyncStorage is unencrypted, and its sandbox belongs to PluginHost rather
 * than to this plugin — every installed plugin shares it, so anything written
 * here is readable by all of them. Holding the password in module scope keeps
 * it off disk entirely while still surviving panel close/reopen, because the
 * PluginHost process outlives the plugin view (patterns.md Pattern 13).
 *
 * Consequence: the password is cleared by a device reboot, a PluginHost
 * restart, or Android reclaiming the process under memory pressure.
 */
let sessionPassword = '';

export function setSessionPassword(password: string): void {
  sessionPassword = password || '';
}

export function getSessionPassword(): string {
  return sessionPassword;
}

export function clearSessionPassword(): void {
  sessionPassword = '';
}

/** Dates survive JSON as ISO strings; revive them or every date comparison breaks. */
function reviveEvent(raw: any): CalendarEvent {
  return {
    ...raw,
    start: new Date(raw.start),
    end: new Date(raw.end),
  };
}

function reviveTask(raw: any): CalendarTask {
  return {
    ...raw,
    dueDate: raw.dueDate ? new Date(raw.dueDate) : undefined,
    completedAt: raw.completedAt ? new Date(raw.completedAt) : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : new Date(),
  };
}

export class CalendarStorage {
  private settings: CalendarSettings = makeDefaultSettings();
  private mappings: Record<string, MeetingNoteMapping> = {};
  private userEvents: CalendarEvent[] = [];
  private tasks: CalendarTask[] = [];
  private pushState: CaldavPushState = emptyPushState();
  /** Last read from CalDAV, cached so the calendar is populated on open. */
  private caldavEvents: CalendarEvent[] = [];
  /**
   * Whether each event is a meeting or a class, keyed by uid.
   *
   * Deliberately NOT a field on CalendarEvent. Events from CalDAV and feeds
   * are rebuilt from their ICS text on every sync — parseIcsContent carries no
   * custom fields — so anything stored on the event object is lost the next
   * time Sync Now runs. Keyed by uid it survives, exactly as note mappings and
   * push state already do.
   */
  private eventKinds: Record<string, NoteKind> = {};
  private loaded = false;

  async load(): Promise<{ settings: CalendarSettings; mappings: Record<string, MeetingNoteMapping> }> {
    try {
      const [rawSettings, rawMappings, rawEvents, rawTasks, rawPushState, rawCaldavEvents, rawEventKinds] =
        await Promise.all([
        AsyncStorage.getItem(SETTINGS_KEY),
        AsyncStorage.getItem(MAPPINGS_KEY),
        AsyncStorage.getItem(USER_EVENTS_KEY),
        AsyncStorage.getItem(TASKS_KEY),
        AsyncStorage.getItem(PUSH_STATE_KEY),
        AsyncStorage.getItem(CALDAV_EVENTS_KEY),
        AsyncStorage.getItem(EVENT_KINDS_KEY),
      ]);

      if (rawSettings) {
        // Merge over defaults so a settings blob written by an older version
        // that lacks newer keys still yields a complete object.
        this.settings = { ...makeDefaultSettings(), ...JSON.parse(rawSettings) };
      }
      if (rawMappings) {
        this.mappings = JSON.parse(rawMappings);
      }
      if (rawTasks) {
        this.tasks = (JSON.parse(rawTasks) as any[]).map(reviveTask);
      }
      if (rawEventKinds) {
        const parsed = JSON.parse(rawEventKinds);
        this.eventKinds = parsed && typeof parsed === 'object' ? parsed : {};
      }
      if (rawCaldavEvents) {
        this.caldavEvents = (JSON.parse(rawCaldavEvents) as any[]).map(reviveEvent);
      }
      if (rawPushState) {
        const parsed = JSON.parse(rawPushState);
        // Guard the shape: a truncated or older blob must not make every item
        // look already-pushed.
        this.pushState =
          parsed && typeof parsed.target === 'string' && parsed.records
            ? parsed
            : emptyPushState();
      }

      if (rawEvents) {
        const revived = (JSON.parse(rawEvents) as any[]).map(reviveEvent);

        // Tasks used to be stored as CalendarEvents carrying isTask or a
        // "[TASK] " prefix. Lift any of those across to the dedicated task
        // list once, then keep them out of userEvents so they cannot appear
        // twice. Runs only while legacy rows remain.
        const legacy = revived.filter(isLegacyTaskEvent);
        this.userEvents = revived.filter(e => !isLegacyTaskEvent(e));

        if (legacy.length > 0) {
          const known = new Set(this.tasks.map(t => t.uid));
          const migrated = legacy.filter(e => !known.has(e.uid)).map(taskFromLegacyEvent);
          this.tasks = [...this.tasks, ...migrated];
          void this.save();
        }
      }
    } catch (e) {
      this.settings = makeDefaultSettings();
      this.mappings = {};
      this.userEvents = [];
      this.tasks = [];
      this.pushState = emptyPushState();
      this.caldavEvents = [];
      this.eventKinds = {};
    }

    // Never restored from disk — only ever from this session's memory.
    this.settings.caldavPassword = sessionPassword;
    this.loaded = true;

    return { settings: this.settings, mappings: this.mappings };
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  private async save(): Promise<void> {
    try {
      // Strip the password on the way out. updateSettings already diverts it to
      // module scope; this is the second guard, so a future call site that sets
      // it directly on the object still cannot write it to disk.
      const { caldavPassword, ...persistable } = this.settings;
      void caldavPassword;

      await Promise.all([
        AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(persistable)),
        AsyncStorage.setItem(MAPPINGS_KEY, JSON.stringify(this.mappings)),
        AsyncStorage.setItem(USER_EVENTS_KEY, JSON.stringify(this.userEvents)),
        AsyncStorage.setItem(TASKS_KEY, JSON.stringify(this.tasks)),
        AsyncStorage.setItem(PUSH_STATE_KEY, JSON.stringify(this.pushState)),
        AsyncStorage.setItem(CALDAV_EVENTS_KEY, JSON.stringify(this.caldavEvents)),
        AsyncStorage.setItem(EVENT_KINDS_KEY, JSON.stringify(this.eventKinds)),
      ]);
    } catch (e) {
      // A failed write must not take down the UI; state stays correct in memory.
    }
  }

  getSettings(): CalendarSettings {
    return this.settings;
  }

  updateSettings(newSettings: Partial<CalendarSettings>): CalendarSettings {
    const { caldavPassword, ...persistable } = newSettings;

    if (caldavPassword !== undefined) {
      setSessionPassword(caldavPassword);
    }

    this.settings = { ...this.settings, ...persistable, caldavPassword: sessionPassword };
    void this.save();
    return this.settings;
  }

  addFeed(feed: CalendarFeed): CalendarFeed[] {
    this.settings.feeds.push(feed);
    void this.save();
    return this.settings.feeds;
  }

  removeFeed(feedId: string): CalendarFeed[] {
    this.settings.feeds = this.settings.feeds.filter(f => f.id !== feedId);
    void this.save();
    return this.settings.feeds;
  }

  getMapping(eventOrSeriesId: string): MeetingNoteMapping | undefined {
    return this.mappings[eventOrSeriesId];
  }

  /** Every note mapping, keyed by event uid and series id. */
  getAllMappings(): Record<string, MeetingNoteMapping> {
    return this.mappings;
  }

  setMapping(mapping: MeetingNoteMapping): void {
    this.mappings[mapping.eventUid] = mapping;
    if (mapping.seriesId) {
      this.mappings[mapping.seriesId] = mapping;
    }
    void this.save();
  }

  getUserEvents(): CalendarEvent[] {
    return this.userEvents;
  }

  addUserEvent(event: CalendarEvent): CalendarEvent[] {
    const existingIdx = this.userEvents.findIndex(e => e.uid === event.uid);
    if (existingIdx >= 0) {
      this.userEvents[existingIdx] = event;
    } else {
      this.userEvents.push(event);
    }
    void this.save();
    return this.userEvents;
  }

  getTasks(): CalendarTask[] {
    return this.tasks;
  }

  /** Upsert by uid, so editing a task replaces rather than duplicates it. */
  upsertTask(task: CalendarTask): CalendarTask[] {
    const idx = this.tasks.findIndex(t => t.uid === task.uid);
    if (idx >= 0) {
      this.tasks[idx] = task;
    } else {
      this.tasks.push(task);
    }
    void this.save();
    return this.tasks;
  }

  removeTask(uid: string): CalendarTask[] {
    // Removes any subtasks with it, so orphans cannot accumulate once
    // subtasks are surfaced.
    this.tasks = this.tasks.filter(t => t.uid !== uid && t.parentId !== uid);
    void this.save();
    return this.tasks;
  }

  removeUserEvent(eventUid: string): CalendarEvent[] {
    this.userEvents = this.userEvents.filter(e => e.uid !== eventUid && e.recurringSeriesId !== eventUid);
    // Forget the push record too: if the same uid is ever created again it
    // must upload rather than be mistaken for something already on the server.
    this.pushState = forgetPush(this.pushState, eventUid);
    void this.save();
    return this.userEvents;
  }

  /**
   * Push bookkeeping for the CalDAV sync. Scoped to a collection, so pointing
   * the plugin at a different calendar starts from nothing.
   */
  getPushState(target: string): CaldavPushState {
    return stateForTarget(this.pushState, target);
  }

  setPushState(state: CaldavPushState): void {
    this.pushState = state;
    void this.save();
  }

  /**
   * Events from the last CalDAV read. Cached so the calendar is populated the
   * moment the plugin opens, rather than staying blank until a sync finishes —
   * and so it still shows something with no network at all.
   */
  getCaldavEvents(): CalendarEvent[] {
    return this.caldavEvents;
  }

  /**
   * The kind recorded for an event, or undefined if it has never been asked.
   * A note mapping is consulted first: if a note already exists, what it was
   * created as is the stronger answer.
   */
  getEventKind(uid: string): NoteKind | undefined {
    return this.mappings[uid]?.kind || this.eventKinds[uid];
  }

  setEventKind(uid: string, kind: NoteKind): void {
    this.eventKinds[uid] = kind;
    void this.save();
  }

  getAllEventKinds(): Record<string, NoteKind> {
    return this.eventKinds;
  }

  /** Replaces the cache wholesale: a read is the full picture for its window. */
  setCaldavEvents(events: CalendarEvent[]): void {
    this.caldavEvents = events;
    void this.save();
  }
}

export const calendarStorage = new CalendarStorage();
