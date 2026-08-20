import { CalendarEvent } from './types';


const pad = (n: number) => String(n).padStart(2, '0');

/** RFC 5545 UTC date-time form, e.g. 20260825T100000Z */
function formatIcsDateTime(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(
    d.getUTCMinutes()
  )}${pad(d.getUTCSeconds())}Z`;
}

/** RFC 5545 DATE form for all-day events, e.g. 20260825 */
function formatIcsDate(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

/**
 * Escapes an RFC 5545 TEXT value. Backslash must be escaped first so the
 * escapes introduced below are not themselves re-escaped.
 */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Folds a content line to 75 octets per RFC 5545 section 3.1. Counting is by
 * UTF-8 byte length, not characters, and a multi-byte sequence is never split
 * across a fold boundary.
 */
export function foldIcsLine(line: string): string {
  const octets = (s: string) => {
    let n = 0;
    for (const ch of s) {
      const cp = ch.codePointAt(0) as number;
      n += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    }
    return n;
  };

  if (octets(line) <= 75) return line;

  const parts: string[] = [];
  let current = '';
  let limit = 75;

  for (const ch of line) {
    if (octets(current) + octets(ch) > limit) {
      parts.push(current);
      current = '';
      // Continuation lines carry a leading space that counts toward the 75.
      limit = 74;
    }
    current += ch;
  }
  if (current) parts.push(current);

  return parts.join('\r\n ');
}


/**
 * Generates an RFC 5545 VCALENDAR / VEVENT ICS string for outbound CalDAV export.
 *
 * DTSTAMP is mandatory in a VEVENT; iCloud rejects the PUT with HTTP 400 without it.
 * All-day events use the DATE value type with a non-inclusive DTEND, per spec.
 */
export function generateOutboundIcsEvent(event: CalendarEvent): string {
  const dtStamp = formatIcsDateTime(new Date());

  const dateLines = event.allDay
    ? [`DTSTART;VALUE=DATE:${formatIcsDate(event.start)}`, `DTEND;VALUE=DATE:${formatIcsDate(event.end)}`]
    : [`DTSTART:${formatIcsDateTime(event.start)}`, `DTEND:${formatIcsDateTime(event.end)}`];

  const lines = [
    `BEGIN:VCALENDAR`,
    `VERSION:2.0`,
    `PRODID:-//Supernote Calendar Plugin//EN`,
    `CALSCALE:GREGORIAN`,
    `BEGIN:VEVENT`,
    `UID:${escapeIcsText(event.uid)}`,
    `DTSTAMP:${dtStamp}`,
    `SUMMARY:${escapeIcsText(event.summary)}`,
    ...dateLines,
    event.location ? `LOCATION:${escapeIcsText(event.location)}` : '',
    event.description ? `DESCRIPTION:${escapeIcsText(event.description)}` : '',
    `END:VEVENT`,
    `END:VCALENDAR`,
  ].filter(Boolean);

  // Trailing CRLF: every content line is terminated, including the last.
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}

/**
 * Generates an RFC 5545 VCALENDAR / VTODO string for outbound CalDAV export.
 *
 * A task is a VTODO, not a VEVENT — that is what makes it land in Apple
 * Reminders rather than appearing as an event on the calendar. VTODO uses DUE
 * for its deadline and has no DTEND; a start time is optional and omitted here
 * because the plugin only captures a due date.
 */
export function generateOutboundIcsTodo(task: CalendarEvent): string {
  const dtStamp = formatIcsDateTime(new Date());
  const completed = task.completed === true;

  // Strip the legacy display marker so Reminders shows a clean title.
  const summary = task.summary.replace(/^\[TASK\]\s*/i, '');

  const dueLine = task.allDay
    ? `DUE;VALUE=DATE:${formatIcsDate(task.start)}`
    : `DUE:${formatIcsDateTime(task.start)}`;

  const lines = [
    `BEGIN:VCALENDAR`,
    `VERSION:2.0`,
    `PRODID:-//Supernote Calendar Plugin//EN`,
    `CALSCALE:GREGORIAN`,
    `BEGIN:VTODO`,
    `UID:${escapeIcsText(task.uid)}`,
    `DTSTAMP:${dtStamp}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    dueLine,
    `STATUS:${completed ? 'COMPLETED' : 'NEEDS-ACTION'}`,
    `PERCENT-COMPLETE:${completed ? 100 : 0}`,
    completed ? `COMPLETED:${dtStamp}` : '',
    task.description ? `DESCRIPTION:${escapeIcsText(task.description)}` : '',
    `END:VTODO`,
    `END:VCALENDAR`,
  ].filter(Boolean);

  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}
