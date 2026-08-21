import { Attendee, CalendarEvent } from './types';

/**
 * Unfolds folded lines in ICS files as specified in RFC 5545 (line ending + whitespace)
 */
export function unfoldIcsContent(icsData: string): string[] {
  const lines = icsData.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const unfolded: string[] = [];

  for (const line of lines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1);
    } else {
      unfolded.push(line);
    }
  }

  return unfolded;
}

/**
 * Unescapes ICS string values
 */
export function unescapeIcsValue(val: string): string {
  return val
    .replace(/\\\\/g, '\\')
    .replace(/\\;/g, ';')
    .replace(/\\,/g, ',')
    .replace(/\\n/gi, '\n');
}

/**
 * Parses ICS date strings into JS Date objects
 */
export function parseIcsDate(datePropStr: string): { date: Date; allDay: boolean } {
  let valStr = datePropStr;
  let allDay = false;

  if (datePropStr.includes(':')) {
    const parts = datePropStr.split(':');
    const paramPart = parts[0];
    valStr = parts.slice(1).join(':');

    if (paramPart.includes('VALUE=DATE')) {
      allDay = true;
    }
  }

  valStr = valStr.trim();

  // All day YYYYMMDD
  if (valStr.length === 8 && !valStr.includes('T')) {
    const yr = parseInt(valStr.slice(0, 4), 10);
    const mo = parseInt(valStr.slice(4, 6), 10) - 1;
    const dy = parseInt(valStr.slice(6, 8), 10);
    return { date: new Date(yr, mo, dy, 0, 0, 0), allDay: true };
  }

  // YYYYMMDDTHHMMSS or YYYYMMDDTHHMMSSZ
  const match = valStr.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (match) {
    const yr = parseInt(match[1], 10);
    const mo = parseInt(match[2], 10) - 1;
    const dy = parseInt(match[3], 10);
    const hr = parseInt(match[4], 10);
    const mn = parseInt(match[5], 10);
    const sc = parseInt(match[6], 10);
    const isUtc = match[7] === 'Z';

    if (isUtc) {
      return { date: new Date(Date.UTC(yr, mo, dy, hr, mn, sc)), allDay };
    }
    const tzid = datePropStr.match(/(?:^|;)TZID=([^;:]+)/i)?.[1]?.replace(/^"|"$/g, '');
    if (tzid) {
      return { date: zonedDate(yr, mo, dy, hr, mn, sc, tzid), allDay };
    }
    return { date: new Date(yr, mo, dy, hr, mn, sc), allDay };
  }

  const fallback = new Date(valStr);
  return { date: fallback, allDay };
}

/** Converts wall-clock fields in an IANA zone to an absolute Date. */
function zonedDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): Date {
  const desired = Date.UTC(year, month, day, hour, minute, second);
  let guess = desired;
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
    // A second pass resolves offsets on the far side of a DST transition.
    for (let pass = 0; pass < 2; pass++) {
      const parts = Object.fromEntries(
        formatter.formatToParts(new Date(guess)).map(p => [p.type, p.value])
      );
      const represented = Date.UTC(
        Number(parts.year), Number(parts.month) - 1, Number(parts.day),
        Number(parts.hour), Number(parts.minute), Number(parts.second)
      );
      guess += desired - represented;
    }
    return new Date(guess);
  } catch (_error) {
    // Unknown zones remain usable as floating/device-local times.
    return new Date(year, month, day, hour, minute, second);
  }
}

function localDateKey(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

function dateKeys(date: Date): string[] {
  return [...new Set([localDateKey(date), date.toISOString().slice(0, 10)])];
}

/**
 * Parses attendee line into Attendee object
 */
export function parseAttendee(line: string): Attendee {
  const colonIdx = line.indexOf(':');
  const paramPart = colonIdx >= 0 ? line.slice(0, colonIdx) : line;
  const valuePart = colonIdx >= 0 ? line.slice(colonIdx + 1) : '';

  let name: string | undefined;
  let email: string | undefined;
  let status: Attendee['status'] = 'NEEDS-ACTION';

  const params = paramPart.split(';');
  for (const param of params) {
    const [k, v] = param.split('=');
    if (!k || !v) continue;
    const cleanV = v.replace(/^"/, '').replace(/"$/, '');
    if (k.toUpperCase() === 'CN') {
      name = cleanV;
    } else if (k.toUpperCase() === 'PARTSTAT') {
      const p = cleanV.toUpperCase();
      if (p === 'ACCEPTED') status = 'ACCEPTED';
      else if (p === 'DECLINED') status = 'DECLINED';
      else if (p === 'TENTATIVE') status = 'TENTATIVE';
      else status = 'NEEDS-ACTION';
    }
  }

  if (valuePart.toLowerCase().startsWith('mailto:')) {
    email = valuePart.slice(7);
  } else if (valuePart) {
    email = valuePart;
  }

  if (!name && email) {
    name = email.split('@')[0];
  }

  return { name, email, status };
}

/**
 * Parses raw ICS content string into an array of CalendarEvents
 */
export function parseIcsContent(icsData: string, calendarName = 'Calendar'): CalendarEvent[] {
  const lines = unfoldIcsContent(icsData);
  const events: CalendarEvent[] = [];

  let inEvent = false;
  let componentKind: 'VEVENT' | 'VTODO' = 'VEVENT';
  let currentEvent: Partial<CalendarEvent> & { actionItems?: string[]; cancelled?: boolean } = {};
  let eventCounter = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === 'BEGIN:VEVENT' || trimmed === 'BEGIN:VTODO') {
      inEvent = true;
      componentKind = trimmed === 'BEGIN:VTODO' ? 'VTODO' : 'VEVENT';
      eventCounter++;
      currentEvent = {
        attendees: [],
        actionItems: [],
        calendarName,
      };
      continue;
    }

    if (trimmed === 'END:VEVENT' || trimmed === 'END:VTODO') {
      if (inEvent) {
        const uid = currentEvent.uid || `evt-auto-${Date.now()}-${eventCounter}`;
        if (componentKind === 'VEVENT' && !currentEvent.start) {
          inEvent = false;
          currentEvent = {};
          continue;
        }
        const start = currentEvent.start || new Date(0);
        const end = currentEvent.end || new Date(start.getTime() + 60 * 60 * 1000);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
          inEvent = false;
          currentEvent = {};
          continue;
        }
        events.push({
          uid,
          summary: currentEvent.summary || '(No Title)',
          description: currentEvent.description,
          location: currentEvent.location,
          start,
          end,
          allDay: currentEvent.allDay || false,
          isTask: componentKind === 'VTODO',
          undatedTask: componentKind === 'VTODO' && !currentEvent.start,
          completed: currentEvent.completed,
          priority: currentEvent.priority,
          organizer: currentEvent.organizer,
          attendees: currentEvent.attendees || [],
          actionItems: currentEvent.actionItems || [],
          rrule: currentEvent.rrule,
          recurringSeriesId: currentEvent.rrule || currentEvent.recurrenceId ? uid : undefined,
          recurrenceId: currentEvent.recurrenceId,
          exceptionDates: currentEvent.exceptionDates,
          timeZone: currentEvent.timeZone,
          // Kept internal until overrides are folded into their master below.
          ...(currentEvent.cancelled ? ({ cancelled: true } as any) : {}),
          calendarName: currentEvent.calendarName,
        });
      }
      inEvent = false;
      currentEvent = {};
      continue;
    }

    if (!inEvent) continue;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const propNameAndParams = trimmed.slice(0, colonIdx);
    const propVal = trimmed.slice(colonIdx + 1);

    const mainProp = propNameAndParams.split(';')[0].toUpperCase();

    switch (mainProp) {
      case 'UID':
        currentEvent.uid = propVal;
        break;
      case 'SUMMARY':
        currentEvent.summary = unescapeIcsValue(propVal);
        break;
      case 'DESCRIPTION': {
        const unescaped = unescapeIcsValue(propVal);
        currentEvent.description = unescaped;
        // Parse line items as action items if bulleted
        const actionLines = unescaped
          .split('\n')
          .map(l => l.trim())
          .filter(l => l.startsWith('-') || l.startsWith('*') || /^\d+\./.test(l));
        if (actionLines.length > 0) {
          currentEvent.actionItems = actionLines.map(l => l.replace(/^[-*\d.]+\s*/, ''));
        }
        break;
      }
      case 'LOCATION':
        currentEvent.location = unescapeIcsValue(propVal);
        break;
      case 'DTSTART':
      case 'DUE': {
        const { date, allDay } = parseIcsDate(trimmed);
        currentEvent.start = date;
        currentEvent.allDay = allDay;
        currentEvent.timeZone = propNameAndParams.match(/(?:^|;)TZID=([^;:]+)/i)?.[1]?.replace(/^"|"$/g, '');
        break;
      }
      case 'DTEND': {
        const { date } = parseIcsDate(trimmed);
        currentEvent.end = date;
        break;
      }
      case 'ORGANIZER': {
        const att = parseAttendee(trimmed);
        currentEvent.organizer = { name: att.name, email: att.email };
        break;
      }
      case 'ATTENDEE': {
        const att = parseAttendee(trimmed);
        if (!currentEvent.attendees) currentEvent.attendees = [];
        currentEvent.attendees.push(att);
        break;
      }
      case 'RRULE': {
        currentEvent.rrule = propVal;
        break;
      }
      case 'EXDATE': {
        const dates = propVal
          .split(',')
          .map(value => parseIcsDate(`${propNameAndParams}:${value}`).date)
          .filter(date => !Number.isNaN(date.getTime()))
          .map(localDateKey);
        currentEvent.exceptionDates = [...(currentEvent.exceptionDates || []), ...dates];
        break;
      }
      case 'RECURRENCE-ID':
        currentEvent.recurrenceId = parseIcsDate(trimmed).date;
        break;
      case 'STATUS':
        if (componentKind === 'VTODO') {
          currentEvent.completed = propVal.toUpperCase() === 'COMPLETED';
        } else {
          currentEvent.cancelled = propVal.toUpperCase() === 'CANCELLED';
        }
        break;
      case 'PERCENT-COMPLETE':
        if (componentKind === 'VTODO' && Number(propVal) >= 100) currentEvent.completed = true;
        break;
      case 'PRIORITY': {
        const icalPriority = Number(propVal);
        if (componentKind === 'VTODO' && icalPriority > 0) {
          currentEvent.priority = icalPriority <= 2 ? 4 : icalPriority <= 5 ? 3 : icalPriority <= 8 ? 2 : 1;
        }
        break;
      }
    }
  }

  // A RECURRENCE-ID VEVENT has the same UID as its master. Fold it into the
  // series as an exception plus a standalone replacement so UID deduplication
  // cannot discard it.
  const masters = new Map(events.filter(e => e.rrule).map(e => [e.uid, e]));
  const output: CalendarEvent[] = [];
  for (const event of events) {
    if (!event.recurrenceId) {
      output.push(event);
      continue;
    }
    const master = masters.get(event.uid);
    const key = localDateKey(event.recurrenceId);
    if (master) master.exceptionDates = [...new Set([...(master.exceptionDates || []), key])];
    if (!(event as any).cancelled) {
      const replacement = { ...event, recurrenceId: undefined };
      output.push({
        ...replacement,
        uid: `${event.uid}_${key}`,
        rrule: undefined,
        recurringSeriesId: event.uid,
      });
    }
  }
  return output;
}

/**
 * Expands recurring events for a specific target day (or range)
 */
export function expandEventsForDate(events: CalendarEvent[], targetDate: Date): CalendarEvent[] {
  const result: CalendarEvent[] = [];
  const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0);
  const endOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59);

  for (const event of events) {
    if (event.exceptionDates && dateKeys(targetDate).some(key => event.exceptionDates?.includes(key))) {
      continue;
    }

    if (!event.rrule) {
      // Include overnight and multi-day events on every day they overlap. End
      // is exclusive, matching all-day DTEND semantics.
      if (event.start <= endOfDay && event.end > startOfDay) {
        result.push(event);
      }
    } else {
      const expandedInstances = expandRruleInstances(event, startOfDay, endOfDay);
      result.push(...expandedInstances);
    }
  }

  return result.sort((a, b) => a.start.getTime() - b.start.getTime());
}

function expandRruleInstances(event: CalendarEvent, rangeStart: Date, rangeEnd: Date): CalendarEvent[] {
  const instances: CalendarEvent[] = [];
  const rule = Object.fromEntries(
    (event.rrule || '').split(';').map(part => {
      const at = part.indexOf('=');
      return [part.slice(0, at).toUpperCase(), part.slice(at + 1).toUpperCase()];
    })
  );
  const freq = rule.FREQ;
  const interval = Math.max(1, Number.parseInt(rule.INTERVAL || '1', 10) || 1);
  const count = Math.max(0, Number.parseInt(rule.COUNT || '0', 10) || 0);
  const until = rule.UNTIL ? parseIcsDate(rule.UNTIL).date : null;
  const byDays = (rule.BYDAY || '').split(',').filter(Boolean);
  // An absent BYMONTHDAY is represented by an empty string. Number('') is 0,
  // so converting before filtering made a plain FREQ=MONTHLY rule look like
  // BYMONTHDAY=0 — a day that can never match. Keep only actual tokens first;
  // the normal monthly default below can then use DTSTART's day as intended.
  const byMonthDays = (rule.BYMONTHDAY || '')
    .split(',')
    .filter(Boolean)
    .map(Number)
    .filter(Number.isFinite);

  const origStart = event.start;
  const durationMs = event.end.getTime() - event.start.getTime();

  if (origStart > rangeEnd) return instances;

  const weekday = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const startDay = new Date(origStart.getFullYear(), origStart.getMonth(), origStart.getDate());
  const cur = new Date(origStart);
  let generated = 0;
  let examined = 0;
  while (cur <= rangeEnd && examined < 20000) {
    examined++;
    const dayOnly = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate());
    const daysSince = Math.floor((dayOnly.getTime() - startDay.getTime()) / 86400000);
    const monthsSince =
      (cur.getFullYear() - origStart.getFullYear()) * 12 + cur.getMonth() - origStart.getMonth();
    const yearsSince = cur.getFullYear() - origStart.getFullYear();
    const simpleByDays = byDays.map(v => v.replace(/^[+-]?\d+/, ''));
    let matches = false;

    if (freq === 'DAILY') {
      matches = daysSince >= 0 && daysSince % interval === 0 &&
        (simpleByDays.length === 0 || simpleByDays.includes(weekday[cur.getDay()]));
    } else if (freq === 'WEEKLY') {
      const week = Math.floor(daysSince / 7);
      const wanted = simpleByDays.length > 0 ? simpleByDays : [weekday[origStart.getDay()]];
      matches = daysSince >= 0 && week % interval === 0 && wanted.includes(weekday[cur.getDay()]);
    } else if (freq === 'MONTHLY') {
      const wantedDays = byMonthDays.length > 0 ? byMonthDays : [origStart.getDate()];
      const last = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
      const numericMatch = wantedDays.some(d => cur.getDate() === (d < 0 ? last + d + 1 : d));
      const ordinalMatch = byDays.some(token => {
        const m = token.match(/^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/);
        if (!m || weekday[cur.getDay()] !== m[2]) return false;
        if (!m[1]) return true;
        const ordinal = Number(m[1]);
        const occurrence = ordinal > 0
          ? Math.floor((cur.getDate() - 1) / 7) + 1
          : -(Math.floor((last - cur.getDate()) / 7) + 1);
        return occurrence === ordinal;
      });
      matches = monthsSince >= 0 && monthsSince % interval === 0 &&
        (byDays.length === 0 || ordinalMatch) &&
        (byMonthDays.length > 0 ? numericMatch : byDays.length > 0 || numericMatch);
    } else if (freq === 'YEARLY') {
      matches = yearsSince >= 0 && yearsSince % interval === 0 &&
        cur.getMonth() === origStart.getMonth() && cur.getDate() === origStart.getDate();
    }

    if (matches) {
      generated++;
      if ((count > 0 && generated > count) || (until && cur > until)) break;
    }

    if (matches && cur >= rangeStart && cur <= rangeEnd) {
      const dateStr = localDateKey(cur);
      if (!event.exceptionDates || !dateKeys(cur).some(key => event.exceptionDates?.includes(key))) {
        const instStart = new Date(cur);
        const instEnd = new Date(cur.getTime() + durationMs);
        const instanceUid = `${event.uid}_${dateStr}`;

        instances.push({
          ...event,
          uid: instanceUid,
          start: instStart,
          end: instEnd,
          recurringSeriesId: event.uid,
        });
      }
    }

    if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) break;
    cur.setDate(cur.getDate() + 1);
  }

  return instances;
}
