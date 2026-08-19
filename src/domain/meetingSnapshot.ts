import { CalendarEvent, MeetingSnapshot, NoteKind } from './types';

/**
 * Generates a clean, filesystem-safe filename for a meeting or class note.
 */
export function generateNoteFilename(
  event: CalendarEvent,
  isSeries = false,
  seriesPrefix = 'Series - ',
  kind: NoteKind = 'meeting'
): string {
  const sanitize = (s: string) =>
    s
      .replace(/[/\\?%*:|"<>]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const prefix = kind === 'class' && seriesPrefix === 'Series - ' ? 'Course - ' : seriesPrefix;

  if (isSeries && event.recurringSeriesId) {
    const cleanTitle = sanitize(event.summary);
    return `${prefix}${cleanTitle}.note`;
  }

  const yyyy = event.start.getFullYear();
  const mm = String(event.start.getMonth() + 1).padStart(2, '0');
  const dd = String(event.start.getDate()).padStart(2, '0');
  const datePrefix = `${yyyy}-${mm}-${dd}`;
  const cleanTitle = sanitize(event.summary);

  return `${datePrefix} - ${cleanTitle}.note`;
}

/**
 * Creates an immutable MeetingSnapshot from a CalendarEvent, supporting Business vs Academic terminology
 */
export function createMeetingSnapshot(
  event: CalendarEvent,
  kind: NoteKind = 'meeting'
): MeetingSnapshot {
  const dateOptions: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  };
  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  };

  const dateStr = event.start.toLocaleDateString('en-US', dateOptions);
  const startTimeStr = event.start.toLocaleTimeString('en-US', timeOptions);
  const endTimeStr = event.end.toLocaleTimeString('en-US', timeOptions);
  const timeStr = event.allDay ? 'All Day' : `${startTimeStr} – ${endTimeStr}`;

  const isAcademic = kind === 'class';

  const hostLabel = isAcademic ? 'Instructor / Professor' : 'Organizer';
  const attendeeLabel = isAcademic ? 'Class Roster / Students' : 'Attendees';
  const eventHeaderLabel = isAcademic ? 'CLASS / LECTURE' : 'MEETING';
  const agendaLabel = isAcademic ? 'SYLLABUS / LECTURE TOPICS' : 'AGENDA / DESCRIPTION';

  const organizerStr = event.organizer
    ? `${event.organizer.name || hostLabel} (${event.organizer.email || 'N/A'})`
    : 'N/A';

  const attendeeLines = event.attendees.map(a => {
    const statusTag = a.status ? ` [${a.status}]` : '';
    const namePart = a.name ? a.name : a.email || 'Participant';
    const emailPart = a.email && a.name ? ` (${a.email})` : '';
    return `   • ${namePart}${emailPart}${statusTag}`;
  });

  const attendeesStr = attendeeLines.length > 0 ? attendeeLines.join('\n') : '   • No attendees listed';

  const locationStr = event.location || 'N/A';
  const descriptionStr = event.description ? event.description.trim() : 'No agenda or description provided.';

  // Action items / tasks checklist
  const actionItemsLines = (event.actionItems || []).map(item => `   ☐ ${item}`);
  const actionItemsStr = actionItemsLines.length > 0 ? actionItemsLines.join('\n') : '   ☐ Follow-up Notes';

  const timestampIso = new Date().toISOString();

  const formattedHeaderText = [
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `📅 ${eventHeaderLabel}: ${event.summary.toUpperCase()}`,
    `🕒 ${dateStr} | ${timeStr}`,
    `👤 ${hostLabel}: ${organizerStr}`,
    `👥 ${attendeeLabel} (${event.attendees.length}):`,
    attendeesStr,
    `🔗 Location / Room: ${locationStr}`,
    ``,
    `📌 ${agendaLabel}:`,
    `   ${descriptionStr.replace(/\n/g, '\n   ')}`,
    ``,
    `✍️ TASKS & ACTION CHECKLIST:`,
    actionItemsStr,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `[Snapshot Frozen: ${timestampIso}]`,
    ``,
  ].join('\n');

  return {
    eventUid: event.uid,
    seriesId: event.recurringSeriesId || event.uid,
    title: event.summary,
    dateStr,
    timeStr,
    organizerStr,
    attendeesStr,
    locationStr,
    descriptionStr,
    actionItemsStr,
    formattedHeaderText,
  };
}
