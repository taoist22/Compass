import React, { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { PluginManager, FileUtils, PluginCommAPI, RattaFileSelector } from 'sn-plugin-lib';
import {
  Area,
  CalendarEvent,
  CalendarTask,
  CalendarViewMode,
  NoteKind,
  ProfileThemeMode,
  TaskPriority,
  TaskStatus,
} from '../domain/types';
import { countOpenTasks, isSameDay as isSameCalendarDay, sectionTasksForDay } from '../domain/taskFilters';
import {
  isDone,
  statusGlyph,
  taskRowLabel,
  taskStatus,
  withStatus,
} from '../domain/taskModel';
import { DAILY_NOTE_PRESETS, dailyNotePath, dateKey, formatDailyNoteName, looksMangled } from '../domain/dailyNote';
import {
  DEFAULT_SYSTEM_TEMPLATE,
  SystemTemplate,
  templateLabel,
  templateSettingKey,
} from '../domain/noteTemplates';
import { expandEventsForDate, parseIcsContent } from '../domain/icsParser';
import { filterEvents } from '../domain/eventFilters';
import { meetingNoteService } from '../supernote/meetingNoteService';
import { calendarStorage } from '../storage/calendarStorage';
import { generateNoteFilename, noteIdentity } from '../domain/meetingSnapshot';
import { formatTimeOfDay, minutesFromDate } from '../domain/timeOfDay';
import { caldavService, CaldavProviderType, isTaskItem } from '../domain/caldavService';
import {
  prunePushState,
  recordPullSnapshot,
  recordPush,
  selectItemsToPush,
  selectRemovedUids,
} from '../domain/pushState';
import { LASSO_BUTTON_ID, LASSO_PRESS_EVENT } from '../domain/buttonIds';
import { parseCapturedText, resolveDateOrder, ParsedCapture } from '../domain/captureParser';
import { captureLassoText } from '../supernote/lassoCapture';
import { MonthGridView } from './MonthGridView';
import { TaskListModal } from './TaskListModal';
import { ItemCreationModal } from './ItemCreationModal';
import { DatePickerModal } from './DatePickerModal';
import { openNoteInEditor } from '../supernote/exportService';

type SettingsTab = 'sync' | 'notes' | 'app' | 'help';

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Rows per column in the below-grid strip before collapsing to "+N more". */
const STRIP_TASK_LIMIT = 4;

/**
 * How far either side of today a CalDAV read reaches.
 *
 * The server filters to this window, so a calendar with years of history costs
 * nothing to sync. OPEN: these are placeholders until the past/future sync
 * window is settled.
 */
/**
 * Developer tooling that must not ship publicly. Set to false and the probe
 * button and its output disappear; nothing else depends on it.
 */
const SHOW_DEV_PROBE = true;

const CALDAV_WINDOW_PAST_DAYS = 30;
const CALDAV_WINDOW_FUTURE_DAYS = 365;

export function AgendaScreen(): React.JSX.Element {
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [themeMode, setThemeMode] = useState<ProfileThemeMode>('business');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // Modals & Popups (Defaults to FALSE on launch)
  const [showDatePickerModal, setShowDatePickerModal] = useState<boolean>(false);
  const [showDateActionSheet, setShowDateActionSheet] = useState<boolean>(false);
  const [showItemCreationModal, setShowItemCreationModal] = useState<boolean>(false);
  const [creationType, setCreationType] = useState<'event' | 'task'>('event');

  // Deletion Modal State
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [pendingDeleteEvent, setPendingDeleteEvent] = useState<CalendarEvent | null>(null);

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [allParsedEvents, setAllParsedEvents] = useState<CalendarEvent[]>([]);
  /**
   * Whether any subscribed feed is actually producing events. Drives the Sync
   * Now button for feed-only setups, and is derived from what a fetch returned
   * rather than from the settings list, so URLs living in feeds.txt count too.
   */
  const [hasSubscribedFeeds, setHasSubscribedFeeds] = useState<boolean>(false);
  /** UIDs from the last feed fetch, so a refresh can replace them. */
  const feedUidsRef = useRef<Set<string>>(new Set());
  const [newFeedUrl, setNewFeedUrl] = useState<string>('');
  const [targetNotesDir, setTargetNotesDir] = useState<string>('/storage/emulated/0/Note/Meetings');
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('sync');
  const [statusMsg, setStatusMsg] = useState<string>('');

  // Settings & CalDAV States
  const [hideAllDay, setHideAllDay] = useState<boolean>(false);
  const [hideSolo, setHideSolo] = useState<boolean>(false);
  const [caldavEnabled, setCaldavEnabled] = useState<boolean>(false);
  const [caldavProvider, setCaldavProvider] = useState<CaldavProviderType>('icloud');
  const [caldavAppleId, setCaldavAppleId] = useState<string>('');
  const [caldavPassword, setCaldavPassword] = useState<string>('');
  const [caldavUrl, setCaldavUrl] = useState<string>('');
  const [caldavTaskListUrl, setCaldavTaskListUrl] = useState<string>('');
  // Text captured from a lasso selection, prefilled into the creation modal.
  const [lassoDraftTitle, setLassoDraftTitle] = useState<string>('');
  // Parsed date/time from a lasso capture, used to prefill the modal.
  const [lassoDraftParsed, setLassoDraftParsed] = useState<ParsedCapture | null>(null);
  // Date for a lasso draft, kept off the calendar's own selection.
  const [lassoDraftDate, setLassoDraftDate] = useState<Date | null>(null);
  const [tasks, setTasks] = useState<CalendarTask[]>([]);
  const [pushTasksAsEvents, setPushTasksAsEvents] = useState<boolean>(false);
  const [defaultView, setDefaultView] = useState<CalendarViewMode>('month');
  const [dailyNoteFolder, setDailyNoteFolder] = useState<string>('/storage/emulated/0/Note/Daily Notes');
  const [dailyNoteFormat, setDailyNoteFormat] = useState<string>('YYYY-MM-DD');
  // null while the existence check is in flight, so the button never claims
  // "Create" for a note that is actually there.
  const [dailyNoteExists, setDailyNoteExists] = useState<boolean | null>(null);
  /** Local date keys in the visible month that have a daily note on disk. */
  const [dailyNoteDates, setDailyNoteDates] = useState<Set<string>>(new Set());
  /** The task open in the edit modal, so its pickers open on real values. */
  const [editingTask, setEditingTask] = useState<CalendarTask | null>(null);
  /** Confirms whether an event's generated note goes with it. */
  const [showDeleteNoteModal, setShowDeleteNoteModal] = useState<boolean>(false);
  const [showTaskList, setShowTaskList] = useState<boolean>(false);
  const [areas, setAreas] = useState<Area[]>([]);
  /** Bumped when membership changes, so the list and pickers re-read. */
  const [membershipRevision, setMembershipRevision] = useState<number>(0);
  /** Note kind per event uid, for the month grid's M/C badges. */
  const [noteKindByEvent, setNoteKindByEvent] = useState<Record<string, NoteKind | undefined>>({});
  // Note paths found on disk for the day's events, keyed by event uid. The
  // stored mapping is not enough: it is lost if a note was made outside the
  // plugin or the mapping never got written, and the row would then offer
  // "Create" and produce a duplicate beside the existing note.
  const [eventNotePaths, setEventNotePaths] = useState<Record<string, string>>({});
  // Event opened in the detail modal, where the low-frequency actions live.
  // Non-null while the modal is editing an existing item rather than creating.
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [caldavCustomUrl, setCaldavCustomUrl] = useState<string>('');

  // Bound, not discarded: this is the token the note-existence checks depend
  // on. Discarding it meant creating a note re-rendered but never re-checked,
  // so the row kept saying "Create Note" until the date changed.
  const [refreshState, setRefreshState] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
    // Hydrate from AsyncStorage before reading anything — getSettings() is a
    // synchronous cache read and returns defaults until load() resolves.
    await calendarStorage.load();
    if (cancelled) return;

    const settings = calendarStorage.getSettings();
    setViewMode(settings.defaultViewMode || 'month');
    setThemeMode(settings.themeMode || 'business');
    setHideAllDay(settings.hideAllDayEvents);
    setHideSolo(settings.hideSoloEvents);
    setTargetNotesDir(settings.notesDirectory || '/storage/emulated/0/Note/Meetings');
    setCaldavEnabled(Boolean(settings.caldavEnabled));
    setCaldavProvider(settings.caldavProvider || 'icloud');
    setCaldavAppleId(settings.caldavAppleId || '');
    setCaldavPassword(settings.caldavPassword || '');
    setCaldavUrl(settings.caldavCalendarUrl || '');
    setCaldavTaskListUrl(settings.caldavTaskListUrl || '');
    setPushTasksAsEvents(Boolean(settings.pushTasksAsEvents));
    setDefaultView(settings.defaultViewMode || 'month');
    setDailyNoteFolder(settings.dailyNoteFolder || '/storage/emulated/0/Note/Daily Notes');
    setDailyNoteFormat(settings.dailyNoteFormat || 'YYYY-MM-DD');
    setCaldavCustomUrl(settings.caldavCustomUrl || '');

    // Load persisted user events
    setTasks([...calendarStorage.getTasks()]);
    setAreas([...calendarStorage.getAreas()]);

    const savedUserEvts = calendarStorage.getUserEvents();
    // The cached CalDAV read goes on screen immediately. Without it the
    // calendar sits empty until a sync completes, and shows nothing at all
    // with no network — the subscribed feed used to cover that gap.
    const cachedCaldav = calendarStorage.getCaldavEvents();
    feedUidsRef.current = new Set();
    if (savedUserEvts.length > 0 || cachedCaldav.length > 0) {
      // User events first: dedupeEvents keeps the first UID it sees, so a
      // device-side edit wins over the server's copy of the same event.
      setAllParsedEvents([...savedUserEvts, ...cachedCaldav]);
    }

    // The button itself is registered in index.js at startup; only the press
    // handler lives here, because it needs component state.
    try {
      if (PluginManager && PluginManager.registerButtonListener) {
        PluginManager.registerButtonListener({
          onButtonPress: async (msg: any) => {
            // The SDK sends { id, name, icon, pressEvent }. The previous guard
            // tested msg.action and msg.buttonId — neither field exists, so it
            // returned on every press and the handler never ran.
            if (!msg || msg.id !== LASSO_BUTTON_ID || msg.pressEvent !== LASSO_PRESS_EVENT) {
              return;
            }

            setStatusMsg('Reading selection...');
            const capture = await captureLassoText();

            if (!capture.text) {
              setStatusMsg('Nothing recognised in that selection — try selecting the writing again.');
              return;
            }

            // Pull a date/time out of the writing so the modal opens ready to
            // save, rather than making the user navigate to a date.
            const parsed = parseCapturedText(capture.text, {
              dateOrder: resolveDateOrder(calendarStorage.getSettings().dateOrder),
            });

            setStatusMsg(
              `${capture.source === 'ocr' ? 'Recognised' : 'Captured'}: "${capture.text}" → ${parsed.interpretation}`
            );

            setEditingEvent(null);
            setLassoDraftTitle(parsed.title || capture.text);
            setLassoDraftParsed({ ...parsed, sourceText: capture.text, hasDate: Boolean(parsed.date) });
            // Nothing date-like means a to-do, not an appointment.
            setCreationType(parsed.kind);
            // Carry the date on the draft rather than moving the calendar's
            // selection: an undated capture must land on today, not on
            // whatever day a previous capture left the grid sitting on.
            // An undated capture stays undated now that a No Date section exists —
            // defaulting to today buried it among things actually due today.
            setLassoDraftDate(parsed.date ?? null);
            setShowItemCreationModal(true);
          },
        });
      }
    } catch (e) {}

      await refreshFeeds();
      // Same job the subscribed feed used to do for iCloud: populate the
      // calendar on open. Silent because a cold start has no stored password,
      // and the cached read is already on screen.
      await handlePullCaldavEvents({ silent: true });
    };

    void init();

    return () => {
      cancelled = true;
    };
    // Mount-only: this loads storage, registers the lasso button and performs
    // the opening sync. Listing refreshFeeds/handlePullCaldavEvents as deps
    // would re-run all of that on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const settings = calendarStorage.getSettings();
    const activeSettings = {
      ...settings,
      hideAllDayEvents: hideAllDay,
      hideSoloEvents: hideSolo,
    };

    const filteredAll = filterEvents(allParsedEvents, activeSettings);
    const todays = expandEventsForDate(filteredAll, selectedDate);
    setEvents(todays);
  }, [selectedDate, allParsedEvents, hideAllDay, hideSolo]);

  // Synchronous Date Selection Handler to open Day View tab
  const handleSelectDate = (d: Date) => {
    setSelectedDate(d);
    setViewMode('agenda');
  };

  const handlePrevDay = () => {
    const d = new Date(selectedDate);
    if (viewMode === 'month') {
      d.setMonth(d.getMonth() - 1);
    } else {
      d.setDate(d.getDate() - 1);
    }
    setSelectedDate(d);
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate);
    if (viewMode === 'month') {
      d.setMonth(d.getMonth() + 1);
    } else {
      d.setDate(d.getDate() + 1);
    }
    setSelectedDate(d);
  };

  const handleToday = () => {
    const now = new Date();
    setSelectedDate(now);
    setShowDatePickerModal(false);
  };

  const handleOpenDatePicker = () => {
    setShowDatePickerModal(true);
  };

  // Picking a month reveals that month's days rather than jumping straight
  // there — the old behaviour left you on whatever day number you happened to
  // be on, which is rarely the one you wanted.


  const handleClosePlugin = () => {
    try {
      PluginManager.closePluginView();
    } catch (e) {}
  };

  const jumpToNextUpcomingEventFromToday = (newEvts: CalendarEvent[]) => {
    if (newEvts.length === 0) return;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

    const upcoming = newEvts
      .filter(e => e.start >= todayStart)
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    if (upcoming.length > 0) {
      setSelectedDate(upcoming[0].start);
    } else {
      setSelectedDate(now);
    }
  };

  const [diagLogs, setDiagLogs] = useState<string[]>([]);
  // Collapsed by default — the full trace is long enough to push the rest of
  // the Feeds / Config page off screen.
  const [showDiagLogs, setShowDiagLogs] = useState<boolean>(false);
  /** Raw output of the template/device probe, shown verbatim under the chooser. */
  const [templateProbe, setTemplateProbe] = useState<string[]>([]);
  /** Which note kind's template chooser is open, if any. */
  const [templatePickerKind, setTemplatePickerKind] = useState<NoteKind | null>(null);
  /** Event awaiting a Meeting-or-Class answer before its note is created. */
  const [kindPromptEvent, setKindPromptEvent] = useState<CalendarEvent | null>(null);
  /** In-progress folder edits, so typing is not fought by the stored value. */
  const [folderDrafts, setFolderDrafts] = useState<Partial<Record<NoteKind, string>>>({});
  const [systemTemplates, setSystemTemplates] = useState<SystemTemplate[]>([]);
  /** Bumped on every template/folder write so the settings rows re-read. */
  const [templateRevision, setTemplateRevision] = useState<number>(0);

  /**
   * Swaps in a freshly fetched batch of feed events.
   *
   * Feeds used to be appended, which was harmless when they were fetched once
   * on open but duplicates on every refresh. Events held in storage are left
   * alone: those are the user's own and never came from a feed.
   */
  const applyFeedBatch = (fetched: CalendarEvent[]) => {
    const ownUids = new Set(calendarStorage.getUserEvents().map(e => e.uid));
    const stale = new Set([...feedUidsRef.current].filter(uid => !ownUids.has(uid)));
    feedUidsRef.current = new Set(fetched.map(e => e.uid).filter(Boolean));
    setHasSubscribedFeeds(fetched.length > 0);

    setAllParsedEvents(prev => [...prev.filter(e => !stale.has(e.uid)), ...fetched]);
  };

  /**
   * Fetches every subscribed feed. Feeds are how Google calendars reach the
   * plugin, since Google CalDAV needs OAuth; this runs on open and again
   * whenever Sync Now is pressed.
   */
  const refreshFeeds = async () => {

    const settings = calendarStorage.getSettings();
    const savedFeeds = settings.feeds || [];
    const fetched: CalendarEvent[] = [];

    // Reflects configuration, not the outcome: a feed that fails to load today
    // is still a reason to offer Sync Now.
    if (savedFeeds.some(f => f.url && f.enabled && !f.id.startsWith('default-') && f.id !== 'primary-cal')) {
      setHasSubscribedFeeds(true);
    }

    for (const feed of savedFeeds) {
      if (feed.url && feed.enabled && !feed.id.startsWith('default-') && feed.id !== 'primary-cal') {
        try {
          const res = await fetch(feed.url);
          const text = await res.text();
          const evts = parseIcsContent(text, feed.name || 'Saved Feed');
          fetched.push(...evts);
        } catch (e) {}
      }
    }

    if (fetched.length > 0) {
      applyFeedBatch(fetched);
      setStatusMsg(`Refreshed ${fetched.length} event(s) from subscribed feeds.`);
    } else {
      try {
        const localFilePath = 'file:///storage/emulated/0/Document/feeds.txt';
        const res = await fetch(localFilePath);
        const content = await res.text();
        const lines = content.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);

        const collected: CalendarEvent[] = [];
        let failedCount = 0;

        for (const line of lines) {
          if (line.startsWith('http://') || line.startsWith('https://') || line.startsWith('webcal://')) {
            // Per-URL try: a single bad feed must not abort the ones after it.
            try {
              const httpsUrl = line.replace(/^webcal:\/\//i, 'https://');
              const feedRes = await fetch(httpsUrl);
              const feedText = await feedRes.text();
              collected.push(...parseIcsContent(feedText, 'feeds.txt'));
            } catch (feedErr) {
              failedCount++;
            }
          }
        }

        if (collected.length > 0) {
          applyFeedBatch(collected);
        }

        if (collected.length > 0 && failedCount > 0) {
          setStatusMsg(`Synced ${collected.length} events from feeds.txt — ${failedCount} URL(s) failed.`);
        } else if (collected.length > 0) {
          setStatusMsg(`Auto-synced ${collected.length} events from feeds.txt!`);
        } else if (failedCount > 0) {
          setStatusMsg(`feeds.txt: all ${failedCount} URL(s) failed to load. Check the URLs.`);
        }
      } catch (e) {}
    }
  };

  /**
   * Uploads user events that are new or edited since their last successful
   * push, using the collection already saved by Test Connection.
   *
   * Deliberately does no discovery: re-running the principal lookup on every
   * sync cost several round trips to rediscover a URL already in settings.
   */
  const pushPendingItems = async (): Promise<{
    pushed: number;
    attempted: number;
    error: string;
  }> => {
    const settings = calendarStorage.getSettings();
    const collectionUrl = settings.caldavCalendarUrl;

    if (!settings.caldavEnabled || !collectionUrl || !settings.caldavAppleId || !settings.caldavPassword) {
      return { pushed: 0, attempted: 0, error: '' };
    }

    const allUserEvts = calendarStorage.getUserEvents();

    // Upload only what is new or edited since the last successful push.
    // Re-pushing everything used to resurrect items deleted on the phone,
    // because a server-side delete leaves the local copy untouched.
    let pushState = calendarStorage.getPushState(collectionUrl);
    const pending = selectItemsToPush(allUserEvts, pushState);

    let pushed = 0;
    let error = '';
    for (const evt of pending) {
      const pushRes = await caldavService.pushIcloudEvent(evt, {
        provider: settings.caldavProvider as CaldavProviderType,
        appleId: settings.caldavAppleId,
        appPassword: settings.caldavPassword,
        calendarUrl: collectionUrl,
        taskListUrl: settings.caldavTaskListUrl,
      });
      if (pushRes.success) {
        pushed++;
        // Recorded only on success, so a failed item retries next sync.
        pushState = recordPush(pushState, evt);
      } else {
        error = pushRes.message;
      }
    }

    pushState = prunePushState(pushState, allUserEvts.map(e => e.uid));
    calendarStorage.setPushState(pushState);

    return { pushed, attempted: pending.length, error };
  };

  const handleRunDiagnostics = async () => {
    if (!caldavAppleId.trim() || !caldavPassword.trim()) {
      setStatusMsg('Please enter your Email/Username and App-Specific Password first.');
      return;
    }
    setStatusMsg('Running step-by-step CalDAV Diagnostic probe...');
    const logs = await caldavService.runCalDavDiagnostics({
      provider: caldavProvider,
      appleId: caldavAppleId.trim(),
      appPassword: caldavPassword.trim(),
      customUrl: caldavCustomUrl.trim(),
    });
    setDiagLogs(logs);
    setStatusMsg(`Diagnostic completed (${logs.length} trace steps recorded).`);
  };

  const handleTestCaldavConnection = async () => {
    if (!caldavAppleId.trim() || !caldavPassword.trim()) {
      setStatusMsg('Please enter your Email/Username and App-Specific Password.');
      return;
    }

    const providerName = caldavProvider.toUpperCase();
    setStatusMsg(`Connecting to ${providerName} CalDAV...`);
    const res = await caldavService.discoverIcloudCalendarUrl({
      provider: caldavProvider,
      appleId: caldavAppleId.trim(),
      appPassword: caldavPassword.trim(),
      customUrl: caldavCustomUrl.trim(),
    });

    if (res.success) {
      const resolvedUrl = res.calendarUrl || caldavService.resolveProviderInitialUrl(caldavProvider, caldavCustomUrl);
      const resolvedTaskUrl = res.taskListUrl || '';
      setCaldavUrl(resolvedUrl);
      setCaldavTaskListUrl(resolvedTaskUrl);
      setCaldavEnabled(true);

      calendarStorage.updateSettings({
        caldavEnabled: true,
        caldavProvider,
        caldavAppleId: caldavAppleId.trim(),
        caldavPassword: caldavPassword.trim(),
        caldavCalendarUrl: resolvedUrl,
        caldavTaskListUrl: resolvedTaskUrl,
        caldavCustomUrl: caldavCustomUrl.trim(),
      });

      const push = await pushPendingItems();

      // res.message names the chosen calendar AND the Reminders list; it used
      // to be thrown away here, which hid whether tasks had a destination.
      if (push.pushed > 0) {
        setStatusMsg(`${res.message} Synced ${push.pushed} of ${push.attempted} changed items.`);
      } else if (push.attempted > 0) {
        setStatusMsg(`${res.message} Sync error: ${push.error}`);
      } else {
        setStatusMsg(`${res.message} Everything already up to date.`);
      }
    } else {
      setStatusMsg(`CalDAV Connection Failed: ${res.message}`);
    }
  };

  /**
   * Pulls events down from CalDAV.
   *
   * Everything before this only ever wrote to CalDAV; what appeared on the
   * device came from a subscribed .ics feed. A calendar-query REPORT asks the
   * server for the events themselves, and the time-range filter keeps the
   * response to the window below rather than the whole calendar.
   *
   * Uses the collection already saved by Test Connection, so a routine sync
   * costs one request instead of re-running principal discovery.
   */
  const handlePullCaldavEvents = async (options: { silent?: boolean } = {}) => {
    const { silent = false } = options;
    const settings = calendarStorage.getSettings();
    const collectionUrl = settings.caldavCalendarUrl;

    if (!settings.caldavEnabled || !collectionUrl || !settings.caldavAppleId || !settings.caldavPassword) {
      // The password is never written to disk, so a cold start has no
      // credentials until Test Connection runs again. On the automatic pull
      // that is ordinary, not an error worth interrupting the user over.
      if (!silent) setStatusMsg('Connect a CalDAV account first (Calendar & Sync).');
      return;
    }

    if (!silent) setStatusMsg('Reading events from CalDAV...');

    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - CALDAV_WINDOW_PAST_DAYS);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + CALDAV_WINDOW_FUTURE_DAYS);

    const { events: pulled, error } = await caldavService.fetchEventsInRange(
      collectionUrl,
      {
        provider: settings.caldavProvider as CaldavProviderType,
        appleId: settings.caldavAppleId,
        appPassword: settings.caldavPassword,
        calendarUrl: collectionUrl,
      },
      start,
      end,
      'CalDAV'
    );

    if (error) {
      if (!silent) setStatusMsg(`CalDAV read failed: ${error}`);
      return;
    }

    // Items the plugin pushed itself come back as ordinary VEVENTs carrying
    // the legacy "[TASK] " prefix. They already exist locally, and dedupeEvents
    // keeps the local copy, so they are dropped here rather than re-added as
    // appointments.
    const incoming = pulled.filter(e => !isTaskItem(e));

    // Reconcile deletions. The read is the authoritative list of what exists
    // in the window, so anything known to be server-backed and missing from it
    // was deleted elsewhere and must go here too. Only reached on a successful
    // read: a network failure returned above, so it can never be mistaken for
    // an empty calendar.
    const serverUids = pulled.map(e => e.uid).filter(Boolean);

    // Compared against stored state rather than the rendered list: the pull on
    // open runs inside the mount effect, where the allParsedEvents closure is
    // still the empty initial value. These two collections are also exactly
    // the items that can be server-backed.
    const reconcilable = [...calendarStorage.getUserEvents(), ...calendarStorage.getCaldavEvents()];

    const removed = selectRemovedUids({
      local: reconcilable,
      serverUids,
      state: calendarStorage.getPushState(collectionUrl),
      windowStart: start,
      windowEnd: end,
    });

    for (const uid of removed) {
      // Drops the stored copy and its push record together, so a later
      // re-create uploads instead of looking already-synced.
      calendarStorage.removeUserEvent(uid);
    }

    // Drop the previous read's events before adding this one, so repeated
    // syncs replace rather than stack up. Events held in storage are excluded:
    // those are the user's own, and a server copy must not displace an edit
    // made on the device.
    const ownUids = new Set(calendarStorage.getUserEvents().map(e => e.uid));
    const stale = new Set(
      calendarStorage
        .getCaldavEvents()
        .map(e => e.uid)
        .filter(uid => !ownUids.has(uid))
    );
    const gone = new Set([...removed, ...stale]);

    setAllParsedEvents(prev => {
      // Local edits load first and dedupeEvents keeps the first UID it sees,
      // so appending leaves anything edited on the device untouched.
      const kept = prev.filter(e => !gone.has(e.uid));
      return [...kept, ...incoming];
    });

    // Cache the read so the calendar is populated the next time the plugin
    // opens, instead of staying blank until a sync finishes.
    calendarStorage.setCaldavEvents(incoming);

    // Remember what the server holds now, so the next read can tell a deletion
    // apart from an item it has simply never seen.
    calendarStorage.setPushState(
      recordPullSnapshot(calendarStorage.getPushState(collectionUrl), serverUids)
    );

    const parts: string[] = [];
    parts.push(
      incoming.length > 0
        ? `Read ${incoming.length} event(s) from CalDAV.`
        : 'CalDAV connected — no events in the sync window.'
    );
    if (removed.length > 0) parts.push(`Removed ${removed.length} deleted elsewhere.`);
    if (!silent) setStatusMsg(parts.join(' '));
  };

  /**
   * Sync Now: refresh everything the plugin knows about, in one press.
   *
   * Covers both providers, which is why it is no longer called Sync CalDAV.
   * Google reaches the plugin as a subscribed feed because Google CalDAV needs
   * OAuth, and feeds previously refreshed only when the plugin opened.
   *
   * Push runs before pull on purpose: pushing sends local changes up, and the
   * pull that follows is then reconciling against a server that already has
   * them, so an item is never judged missing merely because it had not been
   * uploaded yet.
   */
  const handleSyncNow = async () => {
    setStatusMsg('Syncing...');
    await refreshFeeds();

    const settings = calendarStorage.getSettings();
    const caldavReady =
      settings.caldavEnabled &&
      settings.caldavCalendarUrl &&
      settings.caldavAppleId &&
      settings.caldavPassword;

    if (!caldavReady) {
      // Feed-only setups are a complete configuration, not a broken one.
      if (settings.caldavEnabled && !settings.caldavPassword) {
        setStatusMsg('Feeds refreshed. Re-enter your CalDAV password to sync that account.');
      }
      return;
    }

    const push = await pushPendingItems();
    await handlePullCaldavEvents();

    if (push.attempted > 0 && push.pushed === 0) {
      setStatusMsg(`Sync error while uploading: ${push.error}`);
    }
  };

  /**
   * Picks a .txt off the device and subscribes to every calendar URL in it,
   * one per line. Saves the hassle of typing a long iCal secret address into
   * a text box on an e-ink keyboard.
   */
  const handleImportFeedsFromTxt = async () => {
    try {
      if (!RattaFileSelector || !RattaFileSelector.selectFile) {
        setStatusMsg('Native file picker unavailable on this device.');
        return;
      }

      setStatusMsg('Opening file picker...');

      const result: any = await RattaFileSelector.selectFile({
        // selectType MUST be 0. Mode 1 ("single file") opens the picked file
        // in the NOTE app and never resolves the promise — root-caused in
        // sn-pages 2026-07-12 after it broke sn-merge the same way.
        selectType: 0,
        maxNum: 1,
        title: 'Select a .txt of calendar URLs, or an .ics file',
        rightButtonText: 'Import',
        needSelectFolder: '/storage/emulated/0',
        suffixList: ['txt', 'ics'],
      });

      // The picker's return shape is not guaranteed to be string[]; surface
      // whatever came back rather than returning silently, which is what made
      // this look like "nothing happened".
      const chosenPath: string | undefined = Array.isArray(result)
        ? typeof result[0] === 'string'
          ? result[0]
          : result[0]?.path || result[0]?.uri || result[0]?.filePath
        : typeof result === 'string'
          ? result
          : result?.path || result?.uri || result?.filePath;

      if (!chosenPath) {
        setStatusMsg(`No file selected (picker returned: ${JSON.stringify(result)?.slice(0, 120)})`);
        return;
      }

      setStatusMsg(`Reading ${chosenPath.split('/').pop()}...`);

      let content = '';
      try {
        const fileRes = await fetch(chosenPath.startsWith('file://') ? chosenPath : `file://${chosenPath}`);
        content = await fileRes.text();
      } catch (readErr: any) {
        setStatusMsg(`Could not read ${chosenPath}: ${readErr?.message || 'read failed'}`);
        return;
      }

      if (!content.trim()) {
        setStatusMsg(`${chosenPath.split('/').pop()} is empty.`);
        return;
      }

      const fileName = chosenPath.split('/').pop() || 'file';

      // An .ics holds calendar data directly; a .txt holds URLs to subscribe
      // to. Sniff the content rather than trusting the extension.
      if (content.includes('BEGIN:VCALENDAR') || content.includes('BEGIN:VEVENT')) {
        const evts = parseIcsContent(content, fileName);
        if (evts.length === 0) {
          setStatusMsg(`${fileName} looks like a calendar but no events parsed out of it.`);
          return;
        }
        setAllParsedEvents(prev => [...prev, ...evts]);
        jumpToNextUpcomingEventFromToday(evts);
        setStatusMsg(`Loaded ${evts.length} events from ${fileName}.`);
        return;
      }

      const urls = content
        .trim()
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => /^(https?|webcal):\/\//i.test(l));

      if (urls.length === 0) {
        setStatusMsg(`No calendar data and no http(s)://  or webcal:// URLs found in ${fileName}.`);
        return;
      }

      const existing = calendarStorage.getSettings().feeds;
      let added = 0;
      let failed = 0;
      const imported: CalendarEvent[] = [];

      for (const rawUrl of urls) {
        const httpsUrl = rawUrl.replace(/^webcal:\/\//i, 'https://');

        if (existing.some(f => f.url === httpsUrl)) {
          continue;
        }

        // Validate by fetching before saving, so a bad URL never becomes a
        // stored feed that fails silently on every future startup.
        try {
          const feedRes = await fetch(httpsUrl);
          const feedText = await feedRes.text();
          const evts = parseIcsContent(feedText, `Imported ${added + 1}`);

          calendarStorage.addFeed({
            id: `feed-import-${Date.now()}-${added}`,
            name: `Imported ${added + 1}`,
            url: httpsUrl,
            enabled: true,
            lastFetched: new Date().toISOString(),
          });

          imported.push(...evts);
          added++;
        } catch (feedErr) {
          failed++;
        }
      }

      if (imported.length > 0) {
        setAllParsedEvents(prev => [...prev, ...imported]);
      }
      setRefreshState(n => n + 1);

      if (added > 0) {
        setStatusMsg(
          `Imported ${added} feed(s), ${imported.length} events${failed > 0 ? ` — ${failed} URL(s) failed` : ''}.`
        );
      } else if (failed > 0) {
        setStatusMsg(`All ${failed} URL(s) failed to load. Check the URLs in that file.`);
      } else {
        setStatusMsg('Those feeds are already subscribed.');
      }
    } catch (e: any) {
      setStatusMsg(`Import failed: ${e?.message || 'Picker closed'}`);
    }
  };

  /**
   * Reports what the device actually offers, rather than what we assume.
   *
   * Two open questions in one press. First, the built-in templates: the SDK
   * exposes getNoteSystemTemplates() and createNote documents its `template`
   * as a system template *name* or an image path, but the plugin has only ever
   * passed paths — so the 8mm ruled preset has never been asked for. The raw
   * result is printed unparsed because the shape is exactly what is unknown.
   *
   * Second, screen size: the reference docs give page pixels (Nomad 1404x1872,
   * Manta 1920x2560) while layout works in dp, and only the Manta's dp width
   * has ever been measured. `scale` is the density that connects the two.
   */
  useEffect(() => {
    let cancelled = false;
    meetingNoteService
      .getSystemTemplates()
      .then(list => {
        if (!cancelled) setSystemTemplates(list);
      })
      .catch(() => {
        // An empty list leaves only the custom-PNG option, which still works.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleProbeDevice = async () => {
    const lines: string[] = [];

    const win = Dimensions.get('window');
    const scr = Dimensions.get('screen');
    lines.push(`window: ${win.width} x ${win.height} dp`);
    lines.push(`screen: ${scr.width} x ${scr.height} dp`);
    lines.push(`scale (density): ${win.scale} · fontScale: ${win.fontScale}`);
    lines.push(`implied pixels: ${Math.round(win.width * win.scale)} x ${Math.round(win.height * win.scale)}`);
    lines.push('---');

    try {
      const templates: any = await PluginCommAPI.getNoteSystemTemplates();

      if (templates === null || templates === undefined) {
        lines.push('getNoteSystemTemplates returned null/undefined');
      } else if (!Array.isArray(templates)) {
        lines.push(`unexpected shape (${typeof templates}):`);
        lines.push(`  ${JSON.stringify(templates).slice(0, 400)}`);
      } else if (templates.length === 0) {
        lines.push('getNoteSystemTemplates returned an empty array');
      } else {
        lines.push(`${templates.length} system template(s):`);
        templates.forEach((t: any, i: number) => {
          lines.push(`  [${i}] ${JSON.stringify(t)}`);
        });
      }
    } catch (e: any) {
      lines.push(`getNoteSystemTemplates threw: ${e?.message || 'unknown error'}`);
    }

    setTemplateProbe(lines);
    setStatusMsg(`Probe complete (${lines.length} lines).`);
  };

  const noteTemplateFor = (kind: NoteKind): string => {
    const settings = calendarStorage.getSettings();
    // templateRevision is read so the row re-renders after a write.
    void templateRevision;
    return (settings[templateSettingKey(kind)] as string) || DEFAULT_SYSTEM_TEMPLATE;
  };

  const noteFolderFor = (kind: NoteKind): string => {
    const settings = calendarStorage.getSettings();
    void templateRevision;
    if (kind === 'daily') return settings.dailyNoteFolder || '/storage/emulated/0/Note/Daily Notes';
    if (kind === 'class') {
      return settings.classNotesDirectory || '/storage/emulated/0/Note/Classes';
    }
    return settings.notesDirectory || '/storage/emulated/0/Note/Meetings';
  };

  const setNoteTemplate = (kind: NoteKind, value: string) => {
    calendarStorage.updateSettings({ [templateSettingKey(kind)]: value });
    setTemplateRevision(n => n + 1);
    setTemplatePickerKind(null);
    setStatusMsg(`${kind} template set to ${templateLabel(value)}.`);
  };

  /**
   * Folder picker per note kind. The device's own browser is the only picker
   * available — the SDK exposes no folder-creation call of its own — so if it
   * cannot make a folder, ensureDirectory creates the chosen path anyway.
   */
  const saveNoteFolder = async (kind: NoteKind, folder: string) => {
    const trimmed = folder.trim().replace(/\/+$/, '');
    if (!trimmed.startsWith('/')) {
      setStatusMsg('Folder must be a full path, e.g. /storage/emulated/0/Note/Classes');
      return;
    }

    // Typed folders may not exist yet — creating one here is the only way to
    // name a new folder at all, since no folder picker exists.
    await meetingNoteService.ensureDirectory(trimmed);
    applyNoteFolder(kind, trimmed);
  };

  /**
   * "Browse" for a folder by picking any file inside it and taking its parent.
   *
   * There is no folder picker in the SDK — the file selector always returns
   * files, and sn-shelf reaches a folder the same way, from the path of the
   * note you are in. A folder that does not exist yet cannot be reached at
   * all this way, which is why the path is editable above.
   */
  const handleChooseNoteFolder = async (kind: NoteKind) => {
    try {
      if (!RattaFileSelector || !RattaFileSelector.selectFile) {
        setStatusMsg('Native file picker unavailable on this device.');
        return;
      }

      const result: any = await RattaFileSelector.selectFile({
        // selectType MUST be 0. Mode 1 ("single file") opens the picked file
        // in the NOTE app and never resolves the promise — root-caused in
        // sn-pages 2026-07-12 after it broke sn-merge the same way.
        selectType: 0,
        maxNum: 1,
        title: `Pick any file in the ${kind} notes folder`,
        rightButtonText: 'Use folder',
        needSelectFolder: noteFolderFor(kind),
      });

      if (!result || !Array.isArray(result) || result.length === 0 || typeof result[0] !== 'string') {
        setStatusMsg('No file chosen — folder unchanged.');
        return;
      }

      const picked = result[0];
      const slash = picked.lastIndexOf('/');
      const chosen = slash > 0 ? picked.slice(0, slash) : '';

      if (!chosen || chosen === '/storage/emulated/0') {
        setStatusMsg('Could not determine a usable folder from that file.');
        return;
      }

      applyNoteFolder(kind, chosen);

    } catch (e: any) {
      setStatusMsg(`Folder picker error: ${e?.message || 'Picker closed'}`);
    }
  };

  const applyNoteFolder = (kind: NoteKind, folder: string) => {
    if (kind === 'daily') {
      setDailyNoteFolder(folder);
      calendarStorage.updateSettings({ dailyNoteFolder: folder });
    } else if (kind === 'class') {
      calendarStorage.updateSettings({ classNotesDirectory: folder });
    } else {
      setTargetNotesDir(folder);
      calendarStorage.updateSettings({ notesDirectory: folder });
    }

    setFolderDrafts(prev => ({ ...prev, [kind]: folder }));
    setTemplateRevision(n => n + 1);
    setStatusMsg(`${kind} notes folder: ${folder}`);
  };

  const handleChooseCustomTemplate = async (kind: NoteKind) => {
    try {
      if (!RattaFileSelector || !RattaFileSelector.selectFile) {
        setStatusMsg('Native file picker unavailable on this device.');
        return;
      }
      const result: any = await RattaFileSelector.selectFile({
        // selectType MUST be 0. Mode 1 ("single file") opens the picked file
        // in the NOTE app and never resolves the promise — root-caused in
        // sn-pages 2026-07-12 after it broke sn-merge the same way.
        selectType: 0,
        maxNum: 1,
        title: 'Select Background Template PNG',
        rightButtonText: 'Select',
      });
      if (result && Array.isArray(result) && result.length > 0 && typeof result[0] === 'string') {
        setNoteTemplate(kind, result[0]);
      }
    } catch (e: any) {
      setStatusMsg(`Template picker error: ${e?.message || 'Picker closed'}`);
    }
  };

  /**
   * Creates a note, asking what kind it is the first time and remembering the
   * answer. A recurring class is answered once rather than every week.
   */
  const handleRequestNoteCreation = (event: CalendarEvent) => {
    setShowDateActionSheet(false);
    // Keyed on the series, so a weekly class is asked once rather than
    // every occurrence.
    const known = calendarStorage.getEventKind(noteIdentity(event));
    if (known) {
      void handleExecuteNoteCreation(event, known);
      return;
    }
    setKindPromptEvent(event);
  };

  const handleAnswerNoteKind = (kind: NoteKind) => {
    const event = kindPromptEvent;
    setKindPromptEvent(null);
    if (!event) return;
    calendarStorage.setEventKind(noteIdentity(event), kind);
    setNoteKindByEvent(prev => ({ ...prev, [noteIdentity(event)]: kind }));
    void handleExecuteNoteCreation(event, kind);
  };

  const handleExecuteNoteCreation = async (event: CalendarEvent, kind: NoteKind = 'meeting') => {
    setShowDateActionSheet(false);
    setStatusMsg(`Creating ${kind} note...`);

    const result = await meetingNoteService.createOrAppendMeetingNote(event, false, kind);
    if (result.success) {
      const actionText = result.isNewFile ? 'Created' : `Appended page ${result.pageNum} of`;
      setRefreshState(prev => prev + 1);

      // Optimistic, so the row flips to "Open Note" straight away rather than
      // waiting for the next existence sweep.
      setEventNotePaths(prev => ({ ...prev, [event.uid]: result.notePath }));

      // Open it the way daily notes do — through the native intent. The service
      // used to call openFilePath, which drops you in the file manager.
      const opened = await openNoteInEditor(result.notePath);
      // The panel sits in front of the note app, so without this the note
      // opens behind the calendar and looks like nothing happened.
      if (opened.success) closePanel();
      setStatusMsg(
        opened.success
          ? `${actionText} ${result.notePath.split('/').pop()}`
          : `${actionText} ${result.notePath.split('/').pop()} — could not open it: ${opened.message}`
      );
    } else {
      setStatusMsg(`Could not create note: ${result.error || 'Unknown error'}`);
    }
  };

  const isWideScreen = Dimensions.get('window').width >= 800;

  // Fifteen days forward from whichever day is selected, so the one- and
  // two-week marks mean "from the day you are looking at" rather than always
  // from today. Forward-only: past days are not worth the strip space.
  const weekDays = (() => {
    const base = new Date(selectedDate);
    base.setHours(0, 0, 0, 0);
    return Array.from({ length: 15 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return d;
    });
  })();

  /**
   * Opens the day's journal note, creating it if absent. The plugin cannot
   * list a directory (FileUtils.listFiles is unavailable), so the path is
   * computed from the configured folder and format and checked with exists().
   */
  // Whether the day's journal note already exists, so the button can say
  // Create rather than Open. Re-checked when the day or naming settings
  // change; exists() is async, so the answer has to be held in state.
  const visibleYear = selectedDate.getFullYear();
  const visibleMonth = selectedDate.getMonth();

  useEffect(() => {
    let cancelled = false;
    const path = dailyNotePath(dailyNoteFolder, dailyNoteFormat, selectedDate);

    setDailyNoteExists(null);
    Promise.resolve(FileUtils.exists(path))
      .then((found: any) => {
        if (!cancelled) setDailyNoteExists(Boolean(found));
      })
      .catch(() => {
        // A failed check is not proof of absence — leave it unknown rather
        // than offering "Create" for a note that is really there.
        if (!cancelled) setDailyNoteExists(null);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedDate, dailyNoteFolder, dailyNoteFormat]);

  // Mappings are the only record of which events have notes; unlike the daily
  // check this costs nothing, since they are already in memory. Rebuilt when
  // the notes directory or theme changes, both of which follow note creation.
  useEffect(() => {
    // Mappings only — a badge means a note exists on that day. An event that
    // merely has a kind recorded has no note behind it, so badging it would
    // make the flag say something it does not mean.
    const mappings = calendarStorage.getAllMappings();
    const byEvent: Record<string, NoteKind | undefined> = {};
    for (const mapping of Object.values(mappings)) {
      if (!mapping?.eventUid) continue;
      const identity = mapping.seriesId || mapping.eventUid;
      byEvent[identity] = mapping.kind;
    }
    setNoteKindByEvent(byEvent);
  }, [events, themeMode, targetNotesDir, eventNotePaths, refreshState]);

  // Same check as above, across the whole visible month so the grid can badge
  // the days that have one. There is no index to consult — listFiles is
  // unavailable — so this is one exists() per day, roughly thirty native calls
  // whenever the month changes. Only days of the month itself are checked; the
  // greyed spill from neighbouring months is left unbadged.
  useEffect(() => {
    let cancelled = false;

    const daysInMonth = new Date(visibleYear, visibleMonth + 1, 0).getDate();
    const days = Array.from({ length: daysInMonth }, (_, i) => new Date(visibleYear, visibleMonth, i + 1));

    Promise.all(
      days.map(async day => {
        try {
          const found = await FileUtils.exists(dailyNotePath(dailyNoteFolder, dailyNoteFormat, day));
          return found ? dateKey(day) : null;
        } catch (e) {
          // A failed check reads as "no badge". The button still re-checks at
          // press time, so nothing acts on this being wrong.
          return null;
        }
      })
    ).then(keys => {
      if (!cancelled) setDailyNoteDates(new Set(keys.filter((k): k is string => k !== null)));
    });

    return () => {
      cancelled = true;
    };
  }, [visibleYear, visibleMonth, dailyNoteFolder, dailyNoteFormat]);

  // Look for an existing note per event, by the same deterministic filename
  // the plugin would create. Runs for the visible day only — a handful of
  // exists() calls, not a directory scan, which is not available anyway.
  useEffect(() => {
    let cancelled = false;
    const settings = calendarStorage.getSettings();
    const dir = (settings.notesDirectory || '/storage/emulated/0/Note/Meetings').replace(/\/+$/, '');

    const check = async () => {
      const found: Record<string, string> = {};

      for (const evt of events) {
        const mapped =
          calendarStorage.getMapping(evt.uid) ||
          (evt.recurringSeriesId ? calendarStorage.getMapping(evt.recurringSeriesId) : undefined);
        if (mapped?.notePath) {
          found[evt.uid] = mapped.notePath;
          continue;
        }

        const name = generateNoteFilename(
          evt,
          Boolean(evt.recurringSeriesId),
          settings.seriesNotebookPrefix,
          // Inlined rather than calling kindForEvent: that helper is rebuilt
          // every render, so listing it as a dependency would re-run this
          // sweep continuously. themeMode, its only reactive input, is
          // already in the dependency list below.
          calendarStorage.getEventKind(noteIdentity(evt)) ||
            (themeMode === 'academic' ? 'class' : 'meeting')
        );
        const path = `${dir}/${name}`;
        try {
          if (await FileUtils.exists(path)) {
            found[evt.uid] = path;
          }
        } catch (e) {
          // Unknown rather than absent; leaving it out means the row offers
          // Create, which is the safe default only when we truly cannot tell.
        }
      }

      if (!cancelled) setEventNotePaths(found);
    };

    void check();
    return () => {
      cancelled = true;
    };
  }, [events, themeMode, targetNotesDir, refreshState]);

  const handleOpenDailyNote = async () => {
    const settings = calendarStorage.getSettings();
    const folder = settings.dailyNoteFolder || '/storage/emulated/0/Note/Daily Notes';
    const format = settings.dailyNoteFormat || 'YYYY-MM-DD';
    const fileName = formatDailyNoteName(format, selectedDate);
    const path = dailyNotePath(folder, format, selectedDate);

    try {
      const exists = await FileUtils.exists(path);
      if (exists) {
        await handleOpenExistingNote(path);
        return;
      }
    } catch (e) {
      // exists() failing is not fatal; fall through to creation.
    }

    setStatusMsg(`Creating ${fileName}.note...`);
    const res = await meetingNoteService.createDailyNote(path, calendarStorage.getSettings());
    if (!res.success) {
      setStatusMsg(`Could not create daily note: ${res.error}`);
      return;
    }
    // The month check ran before this note existed, so add it now rather than
    // making the user page away and back to see the badge.
    setDailyNoteExists(true);
    setDailyNoteDates(prev => new Set(prev).add(dateKey(selectedDate)));

    const opened = await openNoteInEditor(path);
    setStatusMsg(opened.success ? `Created and opened ${fileName}.note` : opened.message);
    if (opened.success) closePanel();
  };

  // Tasks are grouped by the day being viewed. Past Due and No Date only
  // surface on today — see sectionTasksForDay for why.
  const daySections = sectionTasksForDay(tasks, selectedDate);
  // Always relative to today, regardless of which month the grid is showing.
  const todayTaskSections = sectionTasksForDay(tasks, new Date());

  /**
   * Optionally mirrors a task onto the calendar as an all-day event. Apple
   * Reminders is unreachable over CalDAV, so an event is the only way to get a
   * task onto a phone — off by default for people who keep tasks elsewhere.
   * Completion is reflected with a ✓ in the title, matching the in-app check.
   */
  const pushTaskAsEvent = async (task: CalendarTask) => {
    if (!calendarStorage.getSettings().pushTasksAsEvents) return;
    if (!caldavEnabled || !caldavAppleId || !caldavPassword) return;
    // An undated task has no day to occupy on a calendar.
    if (!task.dueDate) return;

    const start = new Date(task.dueDate);
    start.setHours(9, 0, 0, 0);

    await caldavService.pushIcloudEvent(
      {
        uid: task.uid,
        summary: `${task.completed ? '✓ ' : ''}${task.title}`,
        description: task.notes,
        start,
        end: new Date(start.getTime() + 30 * 60 * 1000),
        allDay: true,
        attendees: [],
      },
      {
        provider: caldavProvider,
        appleId: caldavAppleId,
        appPassword: caldavPassword,
        calendarUrl: caldavUrl,
        taskListUrl: caldavTaskListUrl,
      }
    );
  };

  /**
   * Tap always settles the common case in one press: anything not done becomes
   * done, and a done task reopens. Reaching In Progress by tapping would cost
   * two presses to finish a task, which is the action people take most.
   */
  const handleToggleTask = async (task: CalendarTask) => {
    const next = withStatus(task, isDone(task) ? 'todo' : 'done');
    calendarStorage.upsertTask(next);
    setTasks([...calendarStorage.getTasks()]);
    setStatusMsg(next.completed ? `Done: "${next.title}"` : `Reopened: "${next.title}"`);
    await pushTaskAsEvent(next);
  };

  /**
   * Opens a task in the creation modal. The modal still speaks CalendarEvent,
   * so the task is projected into that shape and diverted back on save by uid.
   */
  const handleEditTask = (task: CalendarTask) => {
    // Held so the form can show the task's real status and priority, and
    // offer Delete. Without it editingTask stays null and both are missing.
    setEditingTask(task);
    const due = task.dueDate ? new Date(task.dueDate) : undefined;
    setEditingEvent({
      uid: task.uid,
      summary: `[TASK] ${task.title}`,
      isTask: true,
      completed: task.completed,
      description: task.notes,
      start: due ?? new Date(),
      end: due ?? new Date(),
      // An undated task opens as all-day; giving it a date is what moves it
      // out of the No Date section.
      allDay: !due || true,
      attendees: [],
    });
    setLassoDraftTitle('');
    setLassoDraftParsed(null);
    setLassoDraftDate(due ?? null);
    setCreationType('task');
    setShowItemCreationModal(true);
  };

  const handleDeleteTask = (task: CalendarTask) => {
    calendarStorage.removeTask(task.uid);
    setTasks([...calendarStorage.getTasks()]);
    setStatusMsg(`Deleted task "${task.title}".`);
  };

  const handleEditItem = (event: CalendarEvent) => {
    // Editing an event must not leave a task from a previous open behind.
    setEditingTask(null);
    // The event argument used to be dropped here, so "Edit" opened a blank
    // create form and saving minted a new uid — the original never changed.
    setEditingEvent(event);
    setLassoDraftTitle('');
    setLassoDraftParsed(null);
    setCreationType(isTaskItem(event) ? 'task' : 'event');
    setShowItemCreationModal(true);
  };

  /**
   * Removes the note generated for an event, if there is one.
   *
   * Handwritten pages cannot be recovered and there is no undo, so this only
   * ever runs against a path the mapping actually records — never a guessed
   * filename — and the caller confirms first.
   */
  const deleteNoteForEvent = async (event: CalendarEvent): Promise<string | null> => {
    const mapping = calendarStorage.getMapping(noteIdentity(event));
    const path = mapping?.notePath;
    if (!path) return null;

    try {
      if (FileUtils.deleteFile) await FileUtils.deleteFile(path);
      calendarStorage.setMapping({ ...mapping, notePath: '' });
      // The recorded kind goes with the note. Without this a wrong answer to
      // the Meeting-or-Class prompt could never be corrected: the prompt only
      // fires when nothing is recorded.
      calendarStorage.clearEventKind(noteIdentity(event));
      setNoteKindByEvent(prev => {
        const next = { ...prev };
        delete next[noteIdentity(event)];
        return next;
      });
      setEventNotePaths(prev => {
        const next = { ...prev };
        delete next[event.uid];
        return next;
      });
      return path;
    } catch (e) {
      return null;
    }
  };

  const removeEventEverywhere = (event: CalendarEvent) => {
    setAllParsedEvents(prev => prev.filter(e => e.uid !== event.uid));
    calendarStorage.removeUserEvent(event.uid);

    if (caldavEnabled && caldavAppleId && caldavPassword) {
      caldavService.deleteIcloudEvent(
        event.uid,
        {
          provider: caldavProvider,
          appleId: caldavAppleId,
          appPassword: caldavPassword,
          calendarUrl: caldavUrl,
          taskListUrl: caldavTaskListUrl,
        },
        isTaskItem(event)
      );
    }
  };

  const handleConfirmDeleteWithNote = async (alsoDeleteNote: boolean) => {
    const event = pendingDeleteEvent;
    setShowDeleteNoteModal(false);
    setPendingDeleteEvent(null);
    if (!event) return;

    const removedNote = alsoDeleteNote ? await deleteNoteForEvent(event) : null;
    removeEventEverywhere(event);

    setStatusMsg(
      removedNote
        ? `Deleted "${event.summary}" and its note.`
        : `Deleted "${event.summary}". Its note was kept.`
    );
  };

  const handleDeleteItem = (event: CalendarEvent) => {
    // A note is the one thing here that cannot be recreated, so its presence
    // is checked rather than assumed and the user is asked by name.
    const notePath = calendarStorage.getMapping(noteIdentity(event))?.notePath;
    if (notePath && !event.recurringSeriesId && !event.rrule) {
      setPendingDeleteEvent(event);
      setShowDeleteNoteModal(true);
      return;
    }

    if (event.recurringSeriesId || event.rrule) {
      setPendingDeleteEvent(event);
      setShowDeleteModal(true);
    } else {
      setAllParsedEvents(prev => prev.filter(e => e.uid !== event.uid));
      calendarStorage.removeUserEvent(event.uid);
      setStatusMsg(`Deleted event "${event.summary}".`);

      if (caldavEnabled && caldavAppleId && caldavPassword) {
        // Must match the collection it was PUT into, or the DELETE hits the
        // wrong list and the item survives on the server.
        caldavService.deleteIcloudEvent(
          event.uid,
          {
            provider: caldavProvider,
            appleId: caldavAppleId,
            appPassword: caldavPassword,
            calendarUrl: caldavUrl,
            taskListUrl: caldavTaskListUrl,
          },
          isTaskItem(event)
        );
      }
    }
  };

  const handleDeleteSingleOccurrence = () => {
    if (!pendingDeleteEvent) return;
    const dateStr = selectedDate.toISOString().slice(0, 10);

    setAllParsedEvents(prev =>
      prev.map(evt => {
        if (evt.uid === pendingDeleteEvent.uid || evt.uid === pendingDeleteEvent.recurringSeriesId) {
          const currentExceptions = evt.exceptionDates || [];
          return {
            ...evt,
            exceptionDates: [...currentExceptions, dateStr],
          };
        }
        return evt;
      })
    );

    setStatusMsg(`Deleted occurrence for ${selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`);
    setShowDeleteModal(false);
    setPendingDeleteEvent(null);
  };

  const handleDeleteEntireSeries = () => {
    if (!pendingDeleteEvent) return;
    const targetId = pendingDeleteEvent.recurringSeriesId || pendingDeleteEvent.uid;

    setAllParsedEvents(prev =>
      prev.filter(evt => evt.uid !== targetId && evt.recurringSeriesId !== targetId && !evt.uid.startsWith(targetId))
    );
    calendarStorage.removeUserEvent(targetId);

    if (caldavEnabled && caldavAppleId && caldavPassword) {
      caldavService.deleteIcloudEvent(
        targetId,
        {
          provider: caldavProvider,
          appleId: caldavAppleId,
          appPassword: caldavPassword,
          calendarUrl: caldavUrl,
          taskListUrl: caldavTaskListUrl,
        },
        isTaskItem(pendingDeleteEvent)
      );
    }

    setStatusMsg(`Deleted entire recurring series "${pendingDeleteEvent.summary}".`);
    setShowDeleteModal(false);
    setPendingDeleteEvent(null);
  };

  const handleCreateNewEvent = async (newEvent: CalendarEvent, targetFeedId: string) => {
    // Same uid means this is an edit: replace in place rather than appending a
    // second copy. addUserEvent already upserts by uid.
    // The modal still builds the event shape. Tasks now live in their own
    // store, so divert them here rather than reworking the modal's output.
    if (isTaskItem(newEvent)) {
      const existing = calendarStorage.getTasks().find(t => t.uid === newEvent.uid);
      const asTask: CalendarTask = {
        uid: newEvent.uid,
        title: newEvent.summary.replace(/^\[TASK\]\s*/i, '').trim(),
        // An all-day task carries a due date; a timed one keeps the time too.
        dueDate: newEvent.start ? new Date(newEvent.start) : undefined,
        completed: existing?.completed ?? false,
        completedAt: existing?.completedAt,
        parentId: existing?.parentId,
        createdAt: existing?.createdAt ?? new Date(),
        notes: newEvent.description,
      };

      calendarStorage.upsertTask(asTask);
      setTasks([...calendarStorage.getTasks()]);
      setStatusMsg(`${existing ? 'Updated' : 'Added'} task "${asTask.title}".`);

      if (lassoDraftParsed !== null) {
        setLassoDraftParsed(null);
        setLassoDraftTitle('');
        setLassoDraftDate(null);
        try {
          PluginManager.closePluginView();
        } catch (e) {}
      }
      return;
    }

    const isUpdate = allParsedEvents.some(e => e.uid === newEvent.uid);
    const verb = isUpdate ? 'Updated' : 'Created';
    // A lasso capture is an interruption mid-writing; hand the user back to
    // their note rather than leaving them parked in the calendar.
    const cameFromLasso = lassoDraftParsed !== null;

    setAllParsedEvents(prev =>
      isUpdate ? prev.map(e => (e.uid === newEvent.uid ? newEvent : e)) : [...prev, newEvent]
    );
    calendarStorage.addUserEvent(newEvent);
    setStatusMsg(`${verb} "${newEvent.summary}".`);

    if (caldavEnabled && caldavAppleId && caldavPassword) {
      const syncRes = await caldavService.pushIcloudEvent(newEvent, {
        provider: caldavProvider,
        appleId: caldavAppleId,
        appPassword: caldavPassword,
        calendarUrl: caldavUrl,
        taskListUrl: caldavTaskListUrl,
      });
      if (syncRes.success) {
        // Already on the server, so the next sync has nothing to do for it.
        calendarStorage.setPushState(
          recordPush(calendarStorage.getPushState(caldavUrl), newEvent)
        );
        setStatusMsg(`${verb} "${newEvent.summary}" — ${syncRes.message}`);
      } else {
        setStatusMsg(`${verb} "${newEvent.summary}" locally. CalDAV: ${syncRes.message}`);
      }
    }

    if (cameFromLasso) {
      setLassoDraftParsed(null);
      setLassoDraftTitle('');
      try {
        PluginManager.closePluginView();
      } catch (e) {}
    }
  };

  const areaOfTask = (uid: string): string | undefined => {
    void membershipRevision;
    return calendarStorage.getMembership(uid).areaId;
  };

  const handleCreateArea = (name: string): string => {
    const area: Area = { id: `area-${Date.now()}`, name, createdAt: new Date() };
    calendarStorage.upsertArea(area);
    setAreas([...calendarStorage.getAreas()]);
    return area.id;
  };

  const handleCreateNewTask = (input: {
    uid?: string;
    title: string;
    dueDate?: Date;
    notes?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    areaId?: string;
  }) => {
    const existing = input.uid ? calendarStorage.getTasks().find(t => t.uid === input.uid) : undefined;

    const task: CalendarTask = {
      uid: input.uid ?? `task-${Date.now()}`,
      title: input.title,
      // Undefined stays undefined — that is what puts it in No Date.
      dueDate: input.dueDate,
      completed: existing?.completed ?? false,
      completedAt: existing?.completedAt,
      parentId: existing?.parentId,
      createdAt: existing?.createdAt ?? new Date(),
      notes: input.notes,
      priority: input.priority && input.priority > 1 ? input.priority : undefined,
    };

    // withStatus rather than assigning the field: completed and completedAt
    // have to move with it, and they are what the rest of the app reads.
    const withState = withStatus(task, input.status || taskStatus(task));

    calendarStorage.upsertTask(withState);
    // Membership is stored beside the task, not on it, so that one mechanism
    // serves events and notes too and survives a sync rebuilding them.
    calendarStorage.setMembership(withState.uid, { areaId: input.areaId });
    setMembershipRevision(n => n + 1);
    setTasks([...calendarStorage.getTasks()]);
    setStatusMsg(`${existing ? 'Updated' : 'Added'} task "${task.title}".`);
    void pushTaskAsEvent(task);

    if (lassoDraftParsed !== null) {
      setLassoDraftParsed(null);
      setLassoDraftTitle('');
      setLassoDraftDate(null);
      try {
        PluginManager.closePluginView();
      } catch (e) {}
    }
  };

  /**
   * Hides the plugin panel. Required whenever a note is opened: the panel sits
   * in front of the note app, so the note otherwise launches behind it and
   * looks like the tap did nothing.
   */
  const closePanel = () => {
    try {
      PluginManager.closePluginView();
    } catch (e) {}
  };

  const handleOpenExistingNote = async (notePath: string) => {
    setShowDateActionSheet(false);
    const res = await openNoteInEditor(notePath);
    setStatusMsg(res.message);
    if (res.success) closePanel();
  };

  const handleFetchFeedUrl = async () => {
    if (!newFeedUrl.trim()) return;
    setStatusMsg(`Fetching feed from ${newFeedUrl}...`);
    try {
      const res = await fetch(newFeedUrl.trim());
      const text = await res.text();
      const newEvts = parseIcsContent(text, 'Subscribed Calendar');
      setAllParsedEvents(prev => [...prev, ...newEvts]);
      jumpToNextUpcomingEventFromToday(newEvts);
      calendarStorage.addFeed({
        id: `url-${Date.now()}`,
        name: 'iCal Feed',
        url: newFeedUrl.trim(),
        enabled: true,
      });
      setNewFeedUrl('');
      setStatusMsg(`Loaded ${newEvts.length} events from feed!`);
    } catch (err: any) {
      setStatusMsg(`Failed to fetch feed: ${err?.message || 'Network error'}`);
    }
  };


  const handleToggleHideAllDay = (val: boolean) => {
    setHideAllDay(val);
    calendarStorage.updateSettings({ hideAllDayEvents: val });
  };

  const handleToggleHideSolo = (val: boolean) => {
    setHideSolo(val);
    calendarStorage.updateSettings({ hideSoloEvents: val });
  };

  const handleToggleThemeMode = (mode: ProfileThemeMode) => {
    setThemeMode(mode);
    calendarStorage.updateSettings({ themeMode: mode });
  };

  const dateHeading =
    viewMode === 'month'
      ? selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : selectedDate.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });

  return (
    <SafeAreaView style={styles.root}>
      {/* Top Header Bar */}
      <View style={styles.headerBar}>
        <View style={styles.titleWithSwitcher}>
          <Text style={styles.appTitle}>Calendar</Text>
          <View style={styles.viewSwitcherBar}>
            <TouchableOpacity
              style={[styles.switcherBtn, viewMode === 'month' && styles.switcherBtnActive]}
              onPress={() => setViewMode('month')}
            >
              <Text style={[styles.switcherBtnText, viewMode === 'month' && styles.switcherBtnTextActive]}>
                📅 Month
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.switcherBtn, viewMode === 'agenda' && styles.switcherBtnActive]}
              onPress={() => setViewMode('agenda')}
            >
              <Text style={[styles.switcherBtnText, viewMode === 'agenda' && styles.switcherBtnTextActive]}>
                📋 Day View
              </Text>
            </TouchableOpacity>

            {/* Beside the view switcher rather than with the header actions:
                it opens a view of your work, not a setting or a sync. */}
            <TouchableOpacity style={styles.switcherBtn} onPress={() => setShowTaskList(true)}>
              <Text style={styles.switcherBtnText}>☑ Tasks</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.headerBtnGroup}>
          {(caldavEnabled || hasSubscribedFeeds) && (
            <TouchableOpacity style={styles.syncNowBtn} onPress={handleSyncNow}>
              <Text style={styles.syncNowBtnText}>🔄 Sync Now</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.settingsBtn} onPress={() => setShowSettings(!showSettings)}>
            <Text style={styles.settingsBtnText}>{showSettings ? 'Close Feeds' : 'Feeds / Config'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.closePluginBtn} onPress={handleClosePlugin}>
            <Text style={styles.closePluginBtnText}>✕ Exit</Text>
          </TouchableOpacity>
        </View>
      </View>

      {statusMsg !== '' && (
        <View style={styles.statusBanner}>
          <Text style={styles.statusText}>{statusMsg}</Text>
        </View>
      )}

      {/* Deleting an event that generated a note. Handwritten pages cannot be
          recovered and there is no undo, so the file is named and keeping it
          is offered as a first-class choice rather than a cancel. */}
      <Modal visible={showDeleteNoteModal} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            setShowDeleteNoteModal(false);
            setPendingDeleteEvent(null);
          }}
        >
          <View style={styles.actionSheetContentCompact}>
            <Text style={styles.actionSheetTitle}>Delete this event?</Text>
            <Text style={styles.bodyTextCenter} numberOfLines={2}>
              "{pendingDeleteEvent?.summary}"
            </Text>
            <Text style={styles.previewHint}>
              It has a note:{' '}
              {pendingDeleteEvent
                ? calendarStorage
                    .getMapping(noteIdentity(pendingDeleteEvent))
                    ?.notePath?.split('/')
                    .pop()
                : ''}
            </Text>

            <TouchableOpacity
              style={styles.deleteOptionBtn}
              onPress={() => handleConfirmDeleteWithNote(false)}
            >
              <Text style={styles.deleteOptionBtnText}>🗑️ Delete event, keep the note</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.deleteOptionBtnDanger}
              onPress={() => handleConfirmDeleteWithNote(true)}
            >
              <Text style={styles.deleteOptionBtnTextDanger}>🗑️ Delete both</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => {
                setShowDeleteNoteModal(false);
                setPendingDeleteEvent(null);
              }}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <TaskListModal
        visible={showTaskList}
        tasks={tasks}
        areas={areas}
        areaOf={areaOfTask}
        onClose={() => setShowTaskList(false)}
        onToggle={handleToggleTask}
        onEdit={task => {
          setShowTaskList(false);
          handleEditTask(task);
        }}
      />

      {/* Asked once per event, then remembered. Replaces the global
          Business/Academic mode deciding this for every note at once. */}
      <Modal visible={kindPromptEvent !== null} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setKindPromptEvent(null)}
        >
          <View style={styles.actionSheetContentCompact}>
            <Text style={styles.actionSheetTitle}>What kind of note?</Text>
            <Text style={styles.bodyTextCenter} numberOfLines={2}>
              "{kindPromptEvent?.summary}"
            </Text>

            <TouchableOpacity style={styles.deleteOptionBtn} onPress={() => handleAnswerNoteKind('meeting')}>
              <Text style={styles.deleteOptionBtnText}>🏢 Meeting Note</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.deleteOptionBtn} onPress={() => handleAnswerNoteKind('class')}>
              <Text style={styles.deleteOptionBtnText}>🎓 Class Note</Text>
            </TouchableOpacity>

            <Text style={styles.previewHint}>
              Remembered for this event — a recurring class is only asked once. Change it later
              from the event's details.
            </Text>

            <TouchableOpacity style={styles.cancelBtn} onPress={() => setKindPromptEvent(null)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Template chooser. Rendered outside the settings/calendar ternary: it is
          opened from Settings, and living in the calendar branch meant it was
          never mounted while Settings was open. The SDK exposes the built-in
          template list but no native picker UI for it, so the list is ours;
          the file picker survives as the custom-PNG option at the bottom. */}
        <Modal visible={templatePickerKind !== null} transparent animationType="fade">
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setTemplatePickerKind(null)}
          >
            <View style={styles.actionSheetContentCompact}>
              <Text style={styles.actionSheetTitle}>
                {templatePickerKind === 'daily'
                  ? 'Daily'
                  : templatePickerKind === 'class'
                  ? 'Class'
                  : 'Meeting'}{' '}
                Note Template
              </Text>

              <ScrollView style={styles.templateScroll} keyboardShouldPersistTaps="handled">
                {systemTemplates.length === 0 && (
                  <Text style={styles.bodyTextCenter}>
                    No built-in templates reported by this device. A custom PNG still works.
                  </Text>
                )}

                {systemTemplates.map(tpl => {
                  const active =
                    templatePickerKind !== null && noteTemplateFor(templatePickerKind) === tpl.name;
                  return (
                    <TouchableOpacity
                      key={tpl.name}
                      style={[styles.templateOptionRow, active && styles.templateOptionRowActive]}
                      onPress={() => templatePickerKind && setNoteTemplate(templatePickerKind, tpl.name)}
                    >
                      <Text
                        style={[styles.templateOptionText, active && styles.templateOptionTextActive]}
                      >
                        {active ? '✓ ' : ''}
                        {templateLabel(tpl.name)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <TouchableOpacity
                style={styles.pickerOpenBtn}
                onPress={() => templatePickerKind && handleChooseCustomTemplate(templatePickerKind)}
              >
                <Text style={styles.pickerOpenBtnText}>🎨 Custom PNG...</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.cancelBtn} onPress={() => setTemplatePickerKind(null)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

      {showSettings ? (
        <ScrollView
          style={styles.settingsContainer}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.settingsContent}
        >
          <View style={styles.settingsHeader}>
            <Text style={styles.settingsHeaderTitle}>⚙️ SETTINGS &amp; CONFIGURATION</Text>
            <TouchableOpacity onPress={() => setShowSettings(false)}>
              <Text style={styles.settingsHeaderClose}>✕ Close</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.settingsTabRow}>
            {([
              ['sync', '🔄 Calendars & Sync'],
              ['notes', '📁 Notes & Storage'],
              ['app', '🎨 App & View'],
              ['help', '🛠 Help / Logs'],
            ] as Array<[SettingsTab, string]>).map(([key, label]) => (
              <TouchableOpacity
                key={key}
                style={[styles.settingsTab, settingsTab === key && styles.settingsTabActive]}
                onPress={() => setSettingsTab(key)}
              >
                <Text style={[styles.settingsTabText, settingsTab === key && styles.settingsTabTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {settingsTab === 'sync' && (
            <>
          <Text style={styles.sectionTitle}>Universal CalDAV Two-Way Sync</Text>
          <Text style={styles.bodyText}>Select your Calendar Provider:</Text>

          {/* Provider Preset Selector Row */}
          <View style={styles.providerGrid}>
            <TouchableOpacity
              style={[styles.providerBtn, caldavProvider === 'icloud' && styles.providerBtnActive]}
              onPress={() => {
                setCaldavProvider('icloud');
                calendarStorage.updateSettings({ caldavProvider: 'icloud' });
              }}
            >
              <Text style={[styles.providerBtnText, caldavProvider === 'icloud' && styles.providerBtnTextActive]}>
                🍏 Apple iCloud
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.providerBtn, caldavProvider === 'custom' && styles.providerBtnActive]}
              onPress={() => {
                setCaldavProvider('custom');
                calendarStorage.updateSettings({ caldavProvider: 'custom' });
              }}
            >
              <Text style={[styles.providerBtnText, caldavProvider === 'custom' && styles.providerBtnTextActive]}>
                📧 Custom / Other
              </Text>
            </TouchableOpacity>
          </View>

          {caldavProvider === 'custom' && (
            <View style={styles.inputRow}>
              <TextInput
                style={styles.textInput}
                value={caldavCustomUrl}
                onChangeText={setCaldavCustomUrl}
                placeholder="CalDAV Server URL (e.g. https://caldav.fastmail.com/)"
                placeholderTextColor="#707070"
                autoCapitalize="none"
              />
            </View>
          )}

          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              value={caldavAppleId}
              onChangeText={setCaldavAppleId}
              placeholder={caldavProvider === 'google' ? 'Google Account Email' : 'Account Email / Username'}
              placeholderTextColor="#707070"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              value={caldavPassword}
              onChangeText={setCaldavPassword}
              placeholder="App-Specific Password / Passcode"
              placeholderTextColor="#707070"
              secureTextEntry
              autoCapitalize="none"
            />
          </View>

          <TouchableOpacity style={styles.connectCaldavBtn} onPress={handleTestCaldavConnection}>
            <Text style={styles.connectCaldavBtnText}>
              🔒 Connect & Test {caldavProvider.toUpperCase()} CalDAV
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.diagRunBtn} onPress={handleRunDiagnostics}>
            <Text style={styles.diagRunBtnText}>
              🔍 Run CalDAV Diagnostic Test (Trace HTTP Steps)
            </Text>
          </TouchableOpacity>

          {caldavEnabled && (
            <View style={styles.caldavActiveBadge}>
              <Text style={styles.caldavActiveBadgeText}>
                ✓ {caldavProvider.toUpperCase()} CalDAV Push Active
              </Text>
              {/* Persistent readout — a status message scrolls away, and
                  whether tasks have a destination must stay checkable. */}
              <Text style={styles.caldavTargetText}>
                Events → {caldavUrl ? decodeURIComponent(caldavUrl.replace(/\/$/, '').split('/').pop() || '?') : 'not set'}
              </Text>
              <Text style={styles.caldavTargetText}>
                Reminders →{' '}
                {caldavTaskListUrl
                  ? decodeURIComponent(caldavTaskListUrl.replace(/\/$/, '').split('/').pop() || '?')
                  : 'NOT SET — run Connect & Test'}
              </Text>
            </View>
          )}

          <Text style={[styles.sectionTitle, { marginTop: 15 }]}>Add a Calendar</Text>
          <TouchableOpacity style={styles.pickerOpenBtn} onPress={handleImportFeedsFromTxt}>
            <Text style={styles.pickerOpenBtnText}>📂 Import from File (.txt or .ics)...</Text>
          </TouchableOpacity>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              value={newFeedUrl}
              onChangeText={setNewFeedUrl}
              placeholder="https://example.com/calendar.ics"
              placeholderTextColor="#707070"
            />
            <TouchableOpacity style={styles.addBtn} onPress={handleFetchFeedUrl}>
              <Text style={styles.addBtnText}>Subscribe</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 15 }]}>Smart Event Filters</Text>
          <View style={styles.filterToggleRow}>
            <Text style={styles.bodyText}>Hide All-Day Events (Holidays, Reminders):</Text>
            <Switch value={hideAllDay} onValueChange={handleToggleHideAllDay} />
          </View>
          <View style={styles.filterToggleRow}>
            <Text style={styles.bodyText}>Hide Solo Events (0 Attendees):</Text>
            <Switch value={hideSolo} onValueChange={handleToggleHideSolo} />
          </View>
            </>
          )}

          {settingsTab === 'notes' && (
            <>
          {/* Named for the filename alone: the folder and template for daily
              notes live in the per-kind blocks below, alongside meeting and
              class, so there is only one place to set each. */}
          <Text style={[styles.sectionTitle, { marginTop: 15 }]}>Daily Note Filename</Text>
          <Text style={styles.bodyText}>
            The Day View's Daily Log button opens that day's journal note, creating it only if it
            isn't already there. The plugin cannot search your folders, so this has to match your
            existing filenames exactly. Check the preview below against a real note first.
          </Text>
          <Text style={styles.bodyText}>
            Two rules: leave off the <Text style={styles.bodyStrong}>.note</Text> extension — it is
            added for you — and put any literal word in{' '}
            <Text style={styles.bodyStrong}>[square brackets]</Text>, or its letters get read as
            date codes. "Daily" becomes "5aily" on the 5th; write{' '}
            <Text style={styles.bodyStrong}>[Daily] YYYY-MM-DD</Text> instead.
          </Text>

          <Text style={styles.fieldLabel}>Filename format</Text>
          <TextInput
            style={styles.textInput}
            value={dailyNoteFormat}
            onChangeText={value => {
              setDailyNoteFormat(value);
              calendarStorage.updateSettings({ dailyNoteFormat: value });
            }}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#707070"
            autoCapitalize="none"
          />

          <View style={styles.formatPresetRow}>
            {DAILY_NOTE_PRESETS.map(preset => (
              <TouchableOpacity
                key={preset}
                style={[styles.formatPreset, dailyNoteFormat === preset && styles.formatPresetActive]}
                onPress={() => {
                  setDailyNoteFormat(preset);
                  calendarStorage.updateSettings({ dailyNoteFormat: preset });
                }}
              >
                <Text
                  style={[
                    styles.formatPresetText,
                    dailyNoteFormat === preset && styles.formatPresetTextActive,
                  ]}
                >
                  {preset}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Live preview: the single thing that tells the user whether this
              will find their journal or create a duplicate beside it. */}
          <View style={styles.previewBox}>
            <Text style={styles.previewLabel}>Today would open</Text>
            <Text style={styles.previewPath}>{dailyNotePath(dailyNoteFolder, dailyNoteFormat, new Date())}</Text>
            {looksMangled(formatDailyNoteName(dailyNoteFormat, new Date())) ? (
              <Text style={styles.previewWarn}>
                ⚠ A word in your format is being read as date codes. Put it in [brackets].
              </Text>
            ) : null}
            {/\.note$/i.test(dailyNoteFormat.trim()) ? (
              <Text style={styles.previewWarn}>
                ⚠ Remove ".note" from the format — the extension is added automatically.
              </Text>
            ) : null}
            <Text style={styles.previewHint}>
              Tokens: YYYY YY MMMM MMM MM M DD D dddd ddd · literal words go in [brackets]
            </Text>
          </View>

          {/* One block per note kind: template first, then where the notes are
              filed. Daily notes keep their own folder above, since that folder
              usually predates the plugin. */}
          <Text style={styles.previewHint}>
            Folder: type a full path and it is created if it does not exist. Browse picks any
            file and uses the folder it sits in — the device offers no folder picker.
          </Text>
          {(['daily', 'meeting', 'class'] as NoteKind[]).map(kind => {
            const label = kind === 'daily' ? 'Daily' : kind === 'class' ? 'Class' : 'Meeting';
            const value = noteTemplateFor(kind);
            const folder = noteFolderFor(kind);

            return (
              <View key={kind} style={styles.templateBlock}>
                <Text style={[styles.sectionTitle, { marginTop: 12 }]}>{label} Notes</Text>

                {/* Template and folder side by side: stacked, the three kinds
                    ran past the bottom of the page and forced a scroll. */}
                <View style={styles.templateColumns}>
                  <View style={styles.templateCol}>
                    <Text style={styles.fieldLabel}>Template</Text>
                    <Text style={styles.bodyText} numberOfLines={1}>
                      {templateLabel(value)}
                    </Text>
                    <TouchableOpacity
                      style={styles.pickerOpenBtn}
                      onPress={() => setTemplatePickerKind(kind)}
                    >
                      <Text style={styles.pickerOpenBtnText}>🎨 Choose Template...</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.templateCol}>
                    <Text style={styles.fieldLabel}>Folder</Text>
                    <TextInput
                      style={[styles.textInput, styles.folderInput]}
                      value={folderDrafts[kind] ?? folder}
                      onChangeText={text => setFolderDrafts(prev => ({ ...prev, [kind]: text }))}
                      onEndEditing={() => saveNoteFolder(kind, folderDrafts[kind] ?? folder)}
                      placeholder="/storage/emulated/0/Note/..."
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TouchableOpacity
                      style={styles.pickerOpenBtn}
                      onPress={() => handleChooseNoteFolder(kind)}
                    >
                      <Text style={styles.pickerOpenBtnText}>📁 Browse...</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })}

          {SHOW_DEV_PROBE && (
            <>
          <Text style={[styles.sectionTitle, { marginTop: 15 }]}>Device &amp; Template Probe</Text>
          <Text style={styles.bodyText}>
            Lists the built-in note templates this device offers, and reports the real screen
            size in dp. Read-only — nothing is changed.
          </Text>
          <TouchableOpacity style={styles.diagRunBtn} onPress={handleProbeDevice}>
            <Text style={styles.diagRunBtnText}>🔍 Probe Templates &amp; Screen Size</Text>
          </TouchableOpacity>

          {templateProbe.length > 0 && (
            <View style={styles.diagLogBox}>
              {templateProbe.map((line, idx) => (
                <Text key={`probe-${idx}`} style={styles.diagLogLine}>
                  {line}
                </Text>
              ))}
            </View>
          )}
            </>
          )}

            </>
          )}

          {settingsTab === 'app' && (
            <>
          <Text style={[styles.sectionTitle, { marginTop: 15 }]}>Opening View</Text>
          <View style={styles.providerGrid}>
            {(['month', 'agenda'] as CalendarViewMode[]).map(mode => (
              <TouchableOpacity
                key={mode}
                style={[styles.providerBtn, defaultView === mode && styles.providerBtnActive]}
                onPress={() => {
                  setDefaultView(mode);
                  calendarStorage.updateSettings({ defaultViewMode: mode });
                }}
              >
                <Text style={[styles.providerBtnText, defaultView === mode && styles.providerBtnTextActive]}>
                  {mode === 'month' ? '📅 Month Grid' : '📋 Day View'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 15 }]}>Theme & Profile Mode</Text>
          <View style={styles.themeToggleRow}>
            <TouchableOpacity
              style={[styles.themeBtn, themeMode === 'business' && styles.themeBtnActive]}
              onPress={() => handleToggleThemeMode('business')}
            >
              <Text style={[styles.themeBtnText, themeMode === 'business' && styles.themeBtnTextActive]}>
                🏢 Business Mode
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.themeBtn, themeMode === 'academic' && styles.themeBtnActive]}
              onPress={() => handleToggleThemeMode('academic')}
            >
              <Text style={[styles.themeBtnText, themeMode === 'academic' && styles.themeBtnTextActive]}>
                🎓 Academic / School Mode
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 15 }]}>Tasks</Text>
          <TouchableOpacity
            style={styles.checkSettingRow}
            onPress={() => {
              const next = !pushTasksAsEvents;
              setPushTasksAsEvents(next);
              calendarStorage.updateSettings({ pushTasksAsEvents: next });
            }}
          >
            <Text style={styles.checkSettingBox}>{pushTasksAsEvents ? '☑' : '☐'}</Text>
            <View style={styles.checkSettingBody}>
              <Text style={styles.checkSettingLabel}>Push tasks to my calendar as events</Text>
              <Text style={styles.checkSettingHint}>
                Apple Reminders can't be reached by any third-party app, so an all-day event is the
                only way to see tasks on your phone. Completed tasks get a ✓ in the title. Undated
                tasks are never pushed — there's no day to put them on.
              </Text>
            </View>
          </TouchableOpacity>

            </>
          )}

          {settingsTab === 'help' && (
            <>
          <Text style={[styles.sectionTitle, { marginTop: 15 }]}>Adding Items by Handwriting</Text>
          <View style={styles.hintBox}>
            <Text style={styles.hintTitle}>Write it on one line</Text>
            <Text style={styles.hintText}>
              Lasso your writing, then tap Add to Calendar. Keep the date, time and title on a
              single line:
            </Text>
            <Text style={styles.hintExample}>08-20-2026 10:00A Meeting B</Text>
            <Text style={styles.hintText}>
              Splitting them across lines confuses the handwriting recogniser and it misreads
              times. With no date or time, the item becomes a task dated today.
            </Text>
          </View>

          {diagLogs.length > 0 && (
            <View style={styles.diagLogBox}>
              <TouchableOpacity onPress={() => setShowDiagLogs(!showDiagLogs)}>
                <Text style={styles.diagLogTitle}>
                  {showDiagLogs ? '▾' : '▸'} CalDAV Diagnostic Trace Log ({diagLogs.length} lines) —
                  tap to {showDiagLogs ? 'hide' : 'show'}
                </Text>
              </TouchableOpacity>
              {showDiagLogs &&
                diagLogs.map((logLine, idx) => (
                  <Text key={idx} style={styles.diagLogLine}>
                    {logLine}
                  </Text>
                ))}
            </View>
          )}

            </>
          )}

        </ScrollView>
      ) : (
        <View style={styles.mainContent}>
          {/* Touch Navigation Bar */}
          {/* Equal-weight side groups so the date sits optically centred.
              Previously Prev on the left and Today+Next on the right were
              different widths, pushing the heading off-centre. */}
          <View style={styles.dateNavRow}>
            <View style={styles.dateNavSide}>
              <TouchableOpacity style={styles.navBtn} onPress={handlePrevDay}>
                <Text style={styles.navBtnText}>‹ Prev</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.dateNavCenter} onPress={handleOpenDatePicker}>
              <Text style={styles.todayBtnText}>{dateHeading} ▾</Text>
            </TouchableOpacity>

            <View style={[styles.dateNavSide, styles.dateNavSideRight]}>
              <TouchableOpacity style={styles.jumpTodayHeaderBtn} onPress={handleToday}>
                <Text style={styles.jumpTodayHeaderBtnText}>🎯 Today</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.navBtn} onPress={handleNextDay}>
                <Text style={styles.navBtnText}>Next ›</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Recurring Deletion Modal */}
          <Modal visible={showDeleteModal} transparent animationType="fade">
            <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowDeleteModal(false)}>
              <View style={styles.actionSheetContentCompact}>
                <Text style={styles.actionSheetTitle}>Delete Recurring Event</Text>
                <Text style={styles.bodyTextCenter}>"{pendingDeleteEvent?.summary}"</Text>

                <TouchableOpacity style={styles.deleteOptionBtn} onPress={handleDeleteSingleOccurrence}>
                  <Text style={styles.deleteOptionBtnText}>
                    🗑️ Delete This Occurrence Only ({selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.deleteOptionBtnDanger} onPress={handleDeleteEntireSeries}>
                  <Text style={styles.deleteOptionBtnTextDanger}>🗑️ Delete Entire Recurring Series</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowDeleteModal(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </Modal>

          {/* Date Long-Press Action Sheet (Compact Half-Width: 52%) */}
          <Modal visible={showDateActionSheet} transparent animationType="fade">
            <TouchableOpacity
              style={styles.modalOverlay}
              activeOpacity={1}
              onPress={() => setShowDateActionSheet(false)}
            >
              <View style={styles.actionSheetContentCompact}>
                <Text style={styles.actionSheetTitle}>
                  Create Item for {selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </Text>

                <TouchableOpacity
                  style={styles.actionSheetBtn}
                  onPress={() => {
                    setShowDateActionSheet(false);
                    const blankEvt: CalendarEvent = {
                      uid: `blank-${Date.now()}`,
                      summary: 'Notes',
                      start: selectedDate,
                      end: new Date(selectedDate.getTime() + 60 * 60 * 1000),
                      allDay: false,
                      attendees: [],
                    };
                    handleRequestNoteCreation(blankEvt);
                  }}
                >
                  <Text style={styles.actionSheetBtnText}>📝 Create Blank Note</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionSheetBtn}
                  onPress={() => {
                    setShowDateActionSheet(false);
                    setEditingEvent(null);
                    setLassoDraftTitle('');
                    setLassoDraftParsed(null);
                    setCreationType('event');
                    setShowItemCreationModal(true);
                  }}
                >
                  <Text style={styles.actionSheetBtnText}>📅 Add Event</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionSheetBtn}
                  onPress={() => {
                    setShowDateActionSheet(false);
                    setEditingEvent(null);
                    setLassoDraftTitle('');
                    setLassoDraftParsed(null);
                    setCreationType('task');
                    setShowItemCreationModal(true);
                  }}
                >
                  <Text style={styles.actionSheetBtnText}>☑️ Add Task</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </Modal>

          {/* Quick Date Picker Overlay Modal */}
          <DatePickerModal
            visible={showDatePickerModal}
            value={selectedDate}
            onSelect={setSelectedDate}
            onClose={() => setShowDatePickerModal(false)}
          />


          {/* Item Creation Modal (Events & Tasks) */}
          <ItemCreationModal
            visible={showItemCreationModal}
            type={creationType}
            targetDate={lassoDraftDate ?? selectedDate}
            initialTitle={lassoDraftTitle}
            initialParsed={lassoDraftParsed}
            editingEvent={editingEvent}
            availableFeeds={calendarStorage.getSettings().feeds}
            onClose={() => {
              setShowItemCreationModal(false);
              setLassoDraftTitle('');
              setLassoDraftParsed(null);
              setLassoDraftDate(null);
              setEditingEvent(null);
              setEditingTask(null);
            }}
            onCreateEvent={handleCreateNewEvent}
            onCreateTask={handleCreateNewTask}
            editingTask={editingTask}
            areas={areas}
            taskAreaId={editingTask ? areaOfTask(editingTask.uid) : undefined}
            onCreateArea={handleCreateArea}
            onDeleteTask={uid => {
              const task = calendarStorage.getTasks().find(t => t.uid === uid);
              if (task) handleDeleteTask(task);
            }}
          />

          {/* Month view scrolls as one page: grid plus the task strip below it.
              Previously both competed for a fixed screen height, so shrinking
              the cells only revealed a strip that was still clipped and could
              never show more than a row. */}
          {viewMode === 'month' && (
            <ScrollView
              style={styles.monthScroll}
              contentContainerStyle={styles.monthScrollContent}
              keyboardShouldPersistTaps="handled"
            >
            <MonthGridView
              allTasks={tasks}
              currentDate={selectedDate}
              selectedDate={selectedDate}
              dailyNoteDates={dailyNoteDates}
              noteKindByEvent={noteKindByEvent}
              allEvents={filterEvents(allParsedEvents, {
                ...calendarStorage.getSettings(),
                hideAllDayEvents: hideAllDay,
                hideSoloEvents: hideSolo,
              })}
              onSelectDate={handleSelectDate}
              onOpenActionSheet={d => {
                setSelectedDate(d);
                setShowDateActionSheet(true);
              }}
            />

            {/* The two task pools a date grid structurally cannot show: undated
                tasks have no cell to sit in, and overdue ones are stranded on a
                past date nobody is looking at. Without this they are invisible
                unless you happen to be on today's Day View. */}
            <View style={styles.gridStrip}>
              {([
                ['Today', todayTaskSections.dueToday, false],
                ['Upcoming', todayTaskSections.upcoming, true],
                ['No Date', todayTaskSections.noDate, false],
                ['Past Due', todayTaskSections.pastDue, true],
              ] as Array<[string, CalendarTask[], boolean]>).map(([label, items, showDate]) => (
                <View key={label} style={styles.gridStripCol}>
                  <Text style={styles.gridStripLabel}>
                    {label} ({items.length})
                  </Text>

                  {items.length === 0 ? (
                    <Text style={styles.gridStripEmpty}>—</Text>
                  ) : (
                    <>
                      {items.slice(0, STRIP_TASK_LIMIT).map(task => (
                        <View key={task.uid} style={styles.gridStripRow}>
                          <TouchableOpacity
                            onPress={() => handleToggleTask(task)}
                          >
                            <Text style={styles.gridStripCheck}>{statusGlyph(taskStatus(task))}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.gridStripBody} onPress={() => handleEditTask(task)}>
                            {/* One string, date first. As a separate element
                                after the body the date floated at the right
                                edge of the column and read as belonging to the
                                next one. */}
                            <Text style={styles.gridStripText} numberOfLines={1}>
                              {taskRowLabel(task, showDate)}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                      {items.length > STRIP_TASK_LIMIT && (
                        <Text style={styles.gridStripEmpty}>
                          +{items.length - STRIP_TASK_LIMIT} more
                        </Text>
                      )}
                    </>
                  )}
                </View>
              ))}
            </View>
            </ScrollView>
          )}

          {/* ── Day View: planner layout ─────────────────────────────
              Two framed panels side by side on a Manta; stacked on a Nomad,
              where 1404px cannot carry two columns without wrapping badly. */}
          {viewMode === 'agenda' && (
            <ScrollView style={styles.agendaViewList} keyboardShouldPersistTaps="handled">
              {/* Weekday strip for jumping within the current week. */}
              <View style={styles.weekStrip}>
                {weekDays.map((d, offset) => {
                  const isSel = offset === 0;
                  const isToday = isSameCalendarDay(d, new Date());
                  // Marks measured from today, not from the selected day.
                  const milestone = offset === 7 ? '1 week' : offset === 14 ? '2 weeks' : null;
                  return (
                    <TouchableOpacity
                      key={d.toISOString()}
                      style={[styles.weekDayCell, isSel && styles.weekDayCellActive]}
                      onPress={() => setSelectedDate(d)}
                    >
                      <Text style={[styles.weekDayLetter, isSel && styles.weekDayTextActive]}>
                        {DAY_LETTERS[d.getDay()]}
                      </Text>
                      <Text style={[styles.weekDayNum, isSel && styles.weekDayTextActive]}>
                        {isToday ? `(${d.getDate()})` : d.getDate()}
                      </Text>
                      {milestone ? (
                        <Text style={[styles.weekDayMilestone, isSel && styles.weekDayTextActive]}>
                          {milestone}
                        </Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={isWideScreen ? styles.planeRow : styles.planeStack}>
                {/* ── SCHEDULE ─────────────────────────────────────────── */}
                <View style={[styles.panel, isWideScreen && styles.panelHalf]}>
                  <View style={styles.panelHeader}>
                    <Text style={styles.panelHeaderText}>SCHEDULE ({events.length} Events)</Text>
                    <TouchableOpacity
                      onPress={() => {
                        setEditingEvent(null);
                        setLassoDraftTitle('');
                        setLassoDraftParsed(null);
                        setLassoDraftDate(null);
                        setCreationType('event');
                        setShowItemCreationModal(true);
                      }}
                    >
                      <Text style={styles.panelHeaderAction}>+ Event</Text>
                    </TouchableOpacity>
                  </View>

                  {events.length === 0 ? (
                    <Text style={styles.panelEmpty}>Nothing scheduled.</Text>
                  ) : (
                    <>
                      {/* All-day items pinned above the timed schedule. */}
                      {events.filter(e => e.allDay).map((evt, idx) => (
                        <TouchableOpacity
                          key={`allday-${evt.uid}-${idx}`}
                          style={styles.allDayRow}
                          onPress={() => handleEditItem(evt)}
                        >
                          <Text style={styles.allDayTag}>[ALL DAY]</Text>
                          <Text style={styles.allDayTitle} numberOfLines={1}>
                            📌 {evt.summary}
                          </Text>
                        </TouchableOpacity>
                      ))}

                      {events
                        .filter(e => !e.allDay)
                        .map((evt, idx) => {
                          const existingNotePath = eventNotePaths[evt.uid];

                          return (
                            <View key={`${evt.uid}-${idx}`} style={styles.scheduleRow}>
                              {/* Start above end, as on a paper planner. */}
                              <View style={styles.scheduleGutter}>
                                {/* One line each. The gutter was too narrow
                                    for "9:00 AM", so the meridiem wrapped onto
                                    a line of its own and the column read as
                                    three unrelated values. */}
                                <Text style={styles.scheduleTime} numberOfLines={1}>
                                  {formatTimeOfDay(minutesFromDate(evt.start))}
                                </Text>
                                <Text style={styles.scheduleEndTime} numberOfLines={1}>
                                  {formatTimeOfDay(minutesFromDate(evt.end))}
                                </Text>
                              </View>

                              <TouchableOpacity
                                style={styles.scheduleBody}
                                onPress={() => handleEditItem(evt)}
                              >
                                <Text style={styles.scheduleTitle} numberOfLines={1}>
                                  {evt.summary}
                                </Text>
                                <Text style={styles.scheduleMeta} numberOfLines={1}>
                                  {[
                                    evt.location || null,
                                    evt.attendees.length > 0 ? `${evt.attendees.length} Attendees` : null,
                                    evt.organizer?.name ? `Host: ${evt.organizer.name}` : null,
                                  ]
                                    .filter(Boolean)
                                    .join(' · ') || 'tap to edit'}
                                </Text>

                                <TouchableOpacity
                                  style={styles.scheduleInlineAction}
                                  onPress={() => {
                                    if (existingNotePath) {
                                      handleOpenExistingNote(existingNotePath);
                                    } else {
                                      // Asks Meeting or Class the first time,
                                      // then remembers the answer for this event.
                                      handleRequestNoteCreation(evt);
                                    }
                                  }}
                                >
                                  <Text style={styles.scheduleInlineActionText}>
                                    └ {existingNotePath ? '📂 Open Note' : '📝 Create Note'}
                                  </Text>
                                </TouchableOpacity>
                              </TouchableOpacity>

                              {/* Inline, as task rows already have. The detail
                                  sheet that used to hold this is gone: it cost
                                  a second tap to reach actions that fit on the
                                  row itself. */}
                              <TouchableOpacity
                                style={styles.focusTaskDelete}
                                onPress={() => handleDeleteItem(evt)}
                              >
                                <Text style={styles.focusTaskDeleteText}>✕</Text>
                              </TouchableOpacity>
                            </View>
                          );
                        })}
                    </>
                  )}
                </View>

                {/* ── DAY FOCUS & TASKS ────────────────────────────────── */}
                <View style={[styles.panel, isWideScreen && styles.panelHalf]}>
                  <View style={styles.panelHeader}>
                    <Text style={styles.panelHeaderText}>DAY FOCUS &amp; TASKS</Text>
                  </View>

                  <Text style={styles.focusSummary}>
                    📊 {events.length} {events.length === 1 ? 'Event' : 'Events'} ·{' '}
                    {countOpenTasks(daySections)} Tasks Open
                  </Text>

                  <View style={styles.subHeader}>
                    <Text style={styles.subHeaderText}>
                      TASKS ({countOpenTasks(daySections)})
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        setEditingEvent(null);
                        setLassoDraftTitle('');
                        setLassoDraftParsed(null);
                        setLassoDraftDate(null);
                        setCreationType('task');
                        setShowItemCreationModal(true);
                      }}
                    >
                      <Text style={styles.panelHeaderAction}>+ Add Task</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Upcoming is counted here but deliberately not in
                      countOpenTasks: the header badge means "needs attention
                      now", while the empty state must not claim there is
                      nothing when a section below it has rows. */}
                  {countOpenTasks(daySections) === 0 &&
                  daySections.completed.length === 0 &&
                  daySections.upcoming.length === 0 ? (
                    <Text style={styles.panelEmpty}>Nothing to do.</Text>
                  ) : (
                    ([
                      // Same labels and order as the month-grid strip, so the
                      // two task surfaces read as one system.
                      ['Today', daySections.dueToday, false],
                      ['Upcoming', daySections.upcoming, true],
                      ['No Date', daySections.noDate, false],
                      ['Past Due', daySections.pastDue, true],
                      ['Completed', daySections.completed, false],
                    ] as Array<[string, CalendarTask[], boolean]>).map(([label, items, showDate]) =>
                      items.length === 0 ? null : (
                        <View key={label || 'due'}>
                          {label ? <Text style={styles.taskGroupLabel}>{label}</Text> : null}
                          {items.map(task => (
                            <View key={task.uid} style={styles.focusTaskRow}>
                              <TouchableOpacity
                                onPress={() => handleToggleTask(task)}
                              >
                                <Text style={styles.focusCheck}>{statusGlyph(taskStatus(task))}</Text>
                              </TouchableOpacity>
                              <TouchableOpacity style={styles.focusTaskBody} onPress={() => handleEditTask(task)}>
                                <Text
                                  style={[styles.focusTaskText, task.completed && styles.focusTaskDone]}
                                  numberOfLines={1}
                                >
                                  {taskRowLabel(task, showDate)}
                                </Text>
                              </TouchableOpacity>

                              <TouchableOpacity
                                style={styles.focusTaskDelete}
                                onPress={() => handleDeleteTask(task)}
                              >
                                <Text style={styles.focusTaskDeleteText}>✕</Text>
                              </TouchableOpacity>
                            </View>
                          ))}
                        </View>
                      )
                    )
                  )}

                  <View style={styles.subHeader}>
                    <Text style={styles.subHeaderText}>DAILY NOTE</Text>
                  </View>
                  <TouchableOpacity style={styles.dailyNoteBtn} onPress={handleOpenDailyNote}>
                    <Text style={styles.dailyNoteBtnText}>
                      📝 {dailyNoteExists === false ? 'Create' : 'Open'}{' '}
                      {selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} Daily Note
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          )}


        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#ffffff',
    padding: 10,
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: '#000000',
    marginBottom: 10,
  },
  titleWithSwitcher: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  appTitle: {
    color: '#000000',
    fontSize: 20,
    fontWeight: 'bold',
  },
  viewSwitcherBar: {
    flexDirection: 'row',
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    overflow: 'hidden',
  },
  switcherBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
    minHeight: 44,
    justifyContent: 'center',
  },
  switcherBtnActive: {
    backgroundColor: '#000000',
  },
  switcherBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000000',
  },
  switcherBtnTextActive: {
    color: '#ffffff',
  },
  headerBtnGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  syncNowBtn: {
    backgroundColor: '#000000',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  syncNowBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  settingsBtn: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  settingsBtnText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: 'bold',
  },
  closePluginBtn: {
    backgroundColor: '#000000',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  closePluginBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  statusBanner: {
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 4,
    padding: 10,
    marginBottom: 10,
  },
  statusText: {
    color: '#000000',
    fontSize: 13,
  },
  mainContent: {
    flex: 1,
  },
  dateNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  // Equal flex on both sides is what actually centres the heading; the
  // buttons inside them differ in width.
  dateNavSide: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateNavSideRight: {
    justifyContent: 'flex-end',
  },
  dateNavCenter: {
    flexShrink: 0,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  navBtn: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  navBtnText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: 'bold',
  },
  todayBtn: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  todayBtnText: {
    color: '#000000',
    fontSize: 17,
    fontWeight: 'bold',
  },
  jumpTodayHeaderBtn: {
    marginRight: 10,
    backgroundColor: '#000000',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  jumpTodayHeaderBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  agendaViewList: {
    flex: 1,
  },
  eventsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#d0d0d0',
    paddingBottom: 6,
    marginBottom: 8,
  },
  eventsHeaderTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#000000',
  },
  dayViewHeaderGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  backMonthBtn: {
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#ffffff',
  },
  backMonthBtnText: {
    color: '#000000',
    fontWeight: 'bold',
    fontSize: 12,
  },
  addSmallBtn: {
    backgroundColor: '#000000',
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addSmallBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  emptyState: {
    padding: 24,
    alignItems: 'center',
  },
  emptyStateText: {
    color: '#505050',
    fontSize: 15,
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 12,
  },
  emptyTodayBtn: {
    backgroundColor: '#000000',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 6,
  },
  emptyTodayBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  eventCard: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    backgroundColor: '#ffffff',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeBadge: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#000000',
  },
  createdBadge: {
    fontSize: 11,
    fontWeight: 'bold',
    backgroundColor: '#000000',
    color: '#ffffff',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  recurringTag: {
    fontSize: 11,
    fontWeight: 'bold',
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  eventTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 4,
  },
  eventLocation: {
    fontSize: 13,
    color: '#202020',
    marginBottom: 4,
  },
  attendeeSummary: {
    fontSize: 13,
    color: '#303030',
    marginBottom: 6,
  },
  eventDescSnippet: {
    fontSize: 12,
    color: '#505050',
    fontStyle: 'italic',
    marginBottom: 10,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 6,
  },
  iconBtn: {
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    justifyContent: 'center',
    backgroundColor: '#f8f8f8',
  },
  iconBtnText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: 'bold',
  },
  exportDropdownBtn: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
  },
  exportDropdownBtnText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: 'bold',
  },
  createNoteBtn: {
    backgroundColor: '#000000',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  createNoteBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  openNoteBtn: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  openNoteBtnText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: 'bold',
  },
  exportFormatMenu: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 6,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  exportFormatOption: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  exportFormatText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#000000',
  },
  settingsContainer: {
    flex: 1,
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 8,
  },
  bodyText: {
    fontSize: 14,
    color: '#202020',
    marginBottom: 6,
  },
  bodyTextCenter: {
    fontSize: 14,
    color: '#202020',
    marginBottom: 12,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  providerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  providerBtn: {
    alignSelf: 'flex-start',
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginRight: 8,
    marginBottom: 6,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  providerBtnActive: {
    backgroundColor: '#000000',
  },
  providerBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#000000',
  },
  providerBtnTextActive: {
    color: '#ffffff',
  },
  connectCaldavBtn: {
    backgroundColor: '#000000',
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  connectCaldavBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  caldavActiveBadge: {
    backgroundColor: '#e6ffe6',
    borderWidth: 1,
    borderColor: '#008000',
    borderRadius: 6,
    padding: 8,
    marginBottom: 14,
  },
  taskSection: {
    marginBottom: 10,
  },
  taskSectionLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#303030',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#303030',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 6,
    backgroundColor: '#ffffff',
  },
  taskCheckbox: {
    paddingRight: 10,
    paddingVertical: 2,
  },
  taskCheckboxText: {
    fontSize: 22,
    color: '#000000',
  },
  taskBody: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 15,
    color: '#000000',
  },
  taskTitleDone: {
    textDecorationLine: 'line-through',
    color: '#606060',
  },
  taskMeta: {
    fontSize: 11,
    color: '#505050',
    marginTop: 2,
  },
  taskDeleteBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  taskDeleteBtnText: {
    fontSize: 16,
    color: '#404040',
  },
  fieldLabel: { fontSize: 12, fontWeight: 'bold', color: '#303030', marginTop: 8, marginBottom: 4 },
  formatPresetRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  formatPreset: { borderWidth: 1, borderColor: '#000000', borderRadius: 4, paddingVertical: 4, paddingHorizontal: 8, marginRight: 6, marginBottom: 6 },
  formatPresetActive: { backgroundColor: '#000000' },
  formatPresetText: { fontSize: 11, fontFamily: 'monospace', color: '#000000' },
  formatPresetTextActive: { color: '#ffffff' },
  previewBox: { alignSelf: 'flex-start', maxWidth: 560, borderWidth: 2, borderColor: '#000000', borderRadius: 6, padding: 8, marginTop: 4, backgroundColor: '#f5f5f5' },
  previewLabel: { fontSize: 11, fontWeight: 'bold', color: '#303030' },
  previewPath: { fontSize: 12, fontFamily: 'monospace', color: '#000000', marginVertical: 3 },
  previewHint: { fontSize: 10, color: '#505050' },
  previewWarn: { fontSize: 11, fontWeight: 'bold', color: '#000000', marginBottom: 3 },
  bodyStrong: { fontWeight: 'bold' },
  settingsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 2, borderColor: '#000000', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 6, backgroundColor: '#ffffff' },
  settingsHeaderTitle: { fontSize: 14, fontWeight: 'bold', color: '#000000' },
  settingsHeaderClose: { fontSize: 13, fontWeight: 'bold', color: '#000000' },
  settingsTabRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 },
  settingsTab: { borderWidth: 2, borderColor: '#000000', borderRadius: 6, paddingVertical: 6, paddingHorizontal: 12, marginRight: 6, marginBottom: 6, backgroundColor: '#ffffff' },
  settingsTabActive: { backgroundColor: '#000000' },
  settingsTabText: { fontSize: 12, fontWeight: 'bold', color: '#000000' },
  settingsTabTextActive: { color: '#ffffff' },
  weekStrip: { flexDirection: 'row', marginBottom: 8 },
  weekDayCell: { flex: 1, alignItems: 'center', paddingVertical: 3, borderWidth: 1, borderColor: '#000000', borderRadius: 3, marginHorizontal: 1, backgroundColor: '#ffffff' },
  weekDayCellActive: { backgroundColor: '#000000' },
  weekDayLetter: { fontSize: 9, fontWeight: 'bold', color: '#000000' },
  weekDayNum: { fontSize: 12, color: '#000000' },
  weekDayMilestone: { fontSize: 7, color: '#404040' },
  weekDayTextActive: { color: '#ffffff' },
  planeRow: { flexDirection: 'row' },
  planeStack: { flexDirection: 'column' },
  panel: { borderWidth: 2, borderColor: '#000000', borderRadius: 6, backgroundColor: '#ffffff', marginBottom: 10, marginHorizontal: 3 },
  panelHalf: { flex: 1 },
  panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 2, borderBottomColor: '#000000', paddingHorizontal: 10, paddingVertical: 8 },
  panelHeaderText: { fontSize: 13, fontWeight: 'bold', color: '#000000' },
  panelHeaderAction: { fontSize: 13, fontWeight: 'bold', color: '#000000' },
  panelEmpty: { fontSize: 12, color: '#606060', padding: 10 },
  allDayRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#000000' },
  allDayTag: { fontSize: 11, fontWeight: 'bold', color: '#000000', marginRight: 8 },
  allDayTitle: { flex: 1, fontSize: 14, color: '#000000' },
  scheduleInlineAction: { marginTop: 4 },
  scheduleInlineActionText: { fontSize: 12, fontWeight: 'bold', color: '#000000' },
  scheduleEndTime: { fontSize: 13, color: '#404040' },
  focusSummary: { fontSize: 13, fontWeight: 'bold', color: '#000000', padding: 10 },
  subHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#000000', paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#f2f2f2' },
  subHeaderText: { fontSize: 12, fontWeight: 'bold', color: '#000000' },
  taskGroupLabel: { fontSize: 11, fontWeight: 'bold', color: '#303030', paddingHorizontal: 10, paddingTop: 6 },
  focusTaskRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4 },
  focusCheck: { fontSize: 17, color: '#000000', marginRight: 8 },
  focusTaskBody: { flex: 1 },
  focusTaskDelete: { paddingHorizontal: 6, paddingVertical: 2 },
  focusTaskDeleteText: { fontSize: 13, color: '#606060' },
  focusTaskText: { fontSize: 13, color: '#000000' },
  focusTaskDone: { textDecorationLine: 'line-through', color: '#606060' },
  dailyNoteBtn: { alignSelf: 'flex-start', margin: 10, paddingHorizontal: 16, borderWidth: 2, borderColor: '#000000', borderRadius: 6, paddingVertical: 10, alignItems: 'center' },
  dailyNoteBtnText: { fontSize: 13, fontWeight: 'bold', color: '#000000' },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderWidth: 1,
    borderColor: '#303030',
    borderRadius: 6,
    marginBottom: 6,
    backgroundColor: '#ffffff',
  },
  // A fixed-width time gutter is what makes a list read as a schedule.
  scheduleGutter: {
    // Wide enough for "12:00 AM" on one line at the sizes below.
    width: 96,
    borderRightWidth: 1,
    borderRightColor: '#303030',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    backgroundColor: '#f2f2f2',
  },
  scheduleTime: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000000',
  },
  scheduleBody: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  scheduleTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#000000',
  },
  scheduleMeta: {
    fontSize: 11,
    color: '#505050',
    marginTop: 2,
  },
  scheduleNoteBtn: {
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderLeftWidth: 1,
    borderLeftColor: '#303030',
  },
  scheduleNoteBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#000000',
  },
  monthScroll: {
    flex: 1,
  },
  monthScrollContent: {
    paddingBottom: 12,
  },
  gridStrip: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    marginTop: 8,
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    padding: 8,
    backgroundColor: '#ffffff',
  },
  gridStripCol: {
    flex: 1,
    paddingHorizontal: 4,
  },
  gridStripLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  gridStripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  gridStripCheck: {
    fontSize: 16,
    color: '#000000',
    marginRight: 6,
  },
  gridStripBody: {
    flex: 1,
  },
  gridStripText: {
    fontSize: 12,
    color: '#000000',
  },
  gridStripDate: {
    fontSize: 10,
    color: '#505050',
    marginLeft: 6,
  },
  gridStripEmpty: {
    fontSize: 11,
    color: '#707070',
  },
  checkSettingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
    maxWidth: 560,
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
    backgroundColor: '#ffffff',
  },
  checkSettingBox: {
    fontSize: 20,
    color: '#000000',
    marginRight: 8,
  },
  checkSettingBody: {
    flex: 1,
  },
  checkSettingLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 2,
  },
  checkSettingHint: {
    fontSize: 12,
    color: '#404040',
  },
  dayGridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    marginBottom: 8,
  },
  dayPickCell: {
    width: '13.5%',
    aspectRatio: 1,
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 4,
    margin: '0.5%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  dayPickCellActive: {
    backgroundColor: '#000000',
  },
  dayPickText: {
    fontSize: 14,
    color: '#000000',
  },
  dayPickTextActive: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
  pickerBackBtn: {
    paddingVertical: 6,
    marginBottom: 6,
  },
  pickerBackBtnText: {
    fontSize: 13,
    color: '#101010',
  },
  hidden: {
    display: 'none',
  },
  hintBox: {
    alignSelf: 'flex-start',
    maxWidth: 560,
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    backgroundColor: '#f5f5f5',
    padding: 10,
    marginBottom: 8,
  },
  hintTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 4,
  },
  hintText: {
    fontSize: 13,
    color: '#202020',
    marginBottom: 4,
  },
  hintExample: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#000000',
    marginBottom: 6,
  },
  caldavTargetText: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#101010',
    marginTop: 3,
  },
  caldavActiveBadgeText: {
    color: '#006000',
    fontWeight: 'bold',
    fontSize: 13,
    textAlign: 'center',
  },
  themeToggleRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  themeBtn: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  themeBtnActive: {
    backgroundColor: '#000000',
  },
  themeBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000000',
  },
  themeBtnTextActive: {
    color: '#ffffff',
  },
  pickerOpenBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#000000',
    borderRadius: 6,
    paddingVertical: 7,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  pickerOpenBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  filterToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  importBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  importFileBtn: {
    flex: 1,
    backgroundColor: '#000000',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  importFileBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  inputRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  textInput: {
    maxWidth: 560,
    flex: 1,
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: '#000000',
    fontSize: 14,
    marginRight: 8,
  },
  addBtn: {
    backgroundColor: '#000000',
    borderRadius: 6,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  addBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  codePath: {
    maxWidth: 560,
    fontFamily: 'monospace',
    backgroundColor: '#e8e8e8',
    padding: 6,
    borderRadius: 4,
    marginBottom: 6,
    color: '#000000',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  actionSheetContentCompact: {
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 8,
    padding: 16,
    width: '65%',
  },
  actionSheetTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 8,
    textAlign: 'center',
  },
  actionSheetBtn: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 8,
    backgroundColor: '#ffffff',
  },
  actionSheetBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#000000',
  },
  deleteOptionBtn: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
    marginBottom: 8,
    backgroundColor: '#ffffff',
  },
  deleteOptionBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000000',
  },
  deleteOptionBtnDanger: {
    backgroundColor: '#000000',
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
    marginBottom: 8,
  },
  deleteOptionBtnTextDanger: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  cancelBtn: {
    borderWidth: 1,
    borderColor: '#707070',
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#505050',
  },
  pickerModalContent: {
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 8,
    padding: 16,
    width: '90%',
  },
  pickerModalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 12,
    textAlign: 'center',
  },
  yearPickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  yearBtn: {
    borderWidth: 2,
    borderColor: '#000000',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  yearBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000000',
  },
  currentYearText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000000',
  },
  monthGridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 14,
  },
  monthCell: {
    width: '22%',
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  monthCellActive: {
    backgroundColor: '#000000',
  },
  monthCellText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000000',
  },
  monthCellTextActive: {
    color: '#ffffff',
  },
  pickerTodayBtn: {
    backgroundColor: '#000000',
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  pickerTodayBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  diagRunBtn: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 10,
    backgroundColor: '#ffffff',
  },
  diagRunBtnText: {
    color: '#000000',
    fontWeight: 'bold',
    fontSize: 13,
  },
  // Room to lift the last settings field above the on-screen keyboard.
  settingsContent: {
    paddingBottom: 260,
  },
  templateScroll: {
    maxHeight: 360,
    marginBottom: 8,
  },
  templateColumns: {
    flexDirection: 'row',
  },
  templateCol: {
    flex: 1,
    paddingRight: 8,
  },
  // Half-width: the full path rarely needs reading in full, and two columns
  // only fit if the field stops claiming the whole row.
  folderInput: {
    fontSize: 12,
  },
  templateBlock: {
    borderTopWidth: 1,
    borderTopColor: '#c0c0c0',
    paddingTop: 4,
  },
  templateOptionRow: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
    backgroundColor: '#ffffff',
  },
  templateOptionRowActive: {
    backgroundColor: '#000000',
  },
  templateOptionText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000000',
  },
  templateOptionTextActive: {
    color: '#ffffff',
  },
  diagLogBox: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    padding: 10,
    backgroundColor: '#f5f5f5',
    marginBottom: 12,
  },
  diagLogTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 6,
  },
  diagLogLine: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#101010',
    marginBottom: 2,
  },
});
