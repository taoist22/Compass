export type CalendarViewMode = 'month' | 'agenda';
export type ProfileThemeMode = 'business' | 'academic';

export interface Attendee {
  name?: string;
  email?: string;
  role?: string;
  status?: 'ACCEPTED' | 'DECLINED' | 'TENTATIVE' | 'NEEDS-ACTION';
}

/**
 * A to-do. Deliberately not a CalendarEvent: a task may have no date at all,
 * whereas an event's start and end are mandatory. Forcing tasks through the
 * event type meant inventing a start time for undated items.
 */
export interface CalendarTask {
  uid: string;
  title: string;
  /** Undefined means no date — the task sits in the "No date" section. */
  dueDate?: Date;
  completed: boolean;
  /**
   * When it was ticked off. Drives which day the completed task is shown on,
   * so finished work appears on the day you did it rather than lingering in
   * Past Due forever.
   */
  completedAt?: Date;
  /** Reserved for subtasks. Not surfaced in the UI yet; present so adding
   *  them later is additive rather than a stored-data migration. */
  parentId?: string;
  createdAt: Date;
  notes?: string;
  /** Manual ordering within a section; lower sorts first. */
  order?: number;
}

export interface CalendarEvent {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
  allDay: boolean;
  organizer?: {
    name?: string;
    email?: string;
  };
  attendees: Attendee[];
  actionItems?: string[];
  /**
   * True for items that are tasks rather than calendar events. Drives the
   * VTODO-vs-VEVENT split on push, so a task reaches Apple Reminders instead
   * of showing up as an event. Older stored items predate this flag and are
   * still detected by the legacy "[TASK] " summary prefix.
   */
  isTask?: boolean;
  completed?: boolean;
  rrule?: string;
  recurringSeriesId?: string;
  exceptionDates?: string[];
  calendarName?: string;
  calendarColor?: string;
}

export interface MeetingSnapshot {
  eventUid: string;
  seriesId: string;
  title: string;
  dateStr: string;
  timeStr: string;
  organizerStr: string;
  attendeesStr: string;
  locationStr: string;
  descriptionStr: string;
  actionItemsStr: string;
  formattedHeaderText: string;
}

export interface CalendarFeed {
  id: string;
  name: string;
  url?: string;
  localPath?: string;
  color?: string;
  enabled: boolean;
  lastFetched?: string;
}

export interface CalendarSettings {
  feeds: CalendarFeed[];
  notesDirectory: string; // default: "/storage/emulated/0/Note/Meetings"
  defaultTemplate: string; // default: ""
  seriesNotebookPrefix: string; // default: "Series - "
  defaultViewMode: CalendarViewMode; // default: "agenda"
  themeMode: ProfileThemeMode; // default: "business"
  hideAllDayEvents: boolean; // default: false
  hideSoloEvents: boolean; // default: false
  caldavEnabled?: boolean;
  caldavProvider?: 'icloud' | 'google' | 'nextcloud' | 'fastmail' | 'yahoo' | 'custom';
  caldavAppleId?: string;
  caldavPassword?: string;
  caldavCalendarUrl?: string;
  /** VTODO-capable collection (Apple Reminders); separate from the calendar. */
  caldavTaskListUrl?: string;
  caldavCustomUrl?: string;
  /** Tie-breaker for ambiguous all-numeric dates; 'auto' uses device region. */
  dateOrder?: 'MDY' | 'DMY' | 'auto';
  /** Mirror tasks onto the calendar as all-day events. Off by default. */
  pushTasksAsEvents?: boolean;
  /** Where the user's daily journal notes live. */
  dailyNoteFolder?: string;
  /** Filename pattern for daily notes; [literals] in brackets. */
  dailyNoteFormat?: string;
  /**
   * Background template for each kind of note. A value is either a system
   * template name from getNoteSystemTemplates (e.g. "style_8mm_ruled_line") or
   * an absolute path to a custom PNG.
   *
   * dailyNoteTemplate predates the other two; meetingTemplate and classTemplate
   * replace the single shared defaultTemplate, which is kept only so an
   * existing setting is not silently discarded.
   */
  dailyNoteTemplate?: string;
  meetingTemplate?: string;
  classTemplate?: string;
  /** Where class notes are filed. Meeting notes use notesDirectory. */
  classNotesDirectory?: string;
}

/**
 * What a generated note is. Recorded at creation because it is decided by the
 * theme mode at that moment and cannot be recovered afterwards — which is why
 * per-type templates and the grid's M/C badges both needed it.
 */
export type NoteKind = 'meeting' | 'class' | 'daily';

export interface MeetingNoteMapping {
  eventUid: string;
  /** Absent on mappings written before note kinds were recorded. */
  kind?: NoteKind;
  seriesId: string;
  notePath: string;
  lastPageNum: number;
  lastCreatedIso: string;
}
