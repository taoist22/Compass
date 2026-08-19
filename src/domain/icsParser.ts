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
    return { date: new Date(yr, mo, dy, hr, mn, sc), allDay };
  }

  const fallback = new Date(valStr);
  return { date: isNaN(fallback.getTime()) ? new Date() : fallback, allDay };
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
  let currentEvent: Partial<CalendarEvent> & { actionItems?: string[] } = {};
  let eventCounter = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === 'BEGIN:VEVENT' || trimmed === 'BEGIN:VTODO') {
      inEvent = true;
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
        const start = currentEvent.start || new Date();
        const end = currentEvent.end || new Date(start.getTime() + 60 * 60 * 1000);
        events.push({
          uid,
          summary: currentEvent.summary || '(No Title)',
          description: currentEvent.description,
          location: currentEvent.location,
          start,
          end,
          allDay: currentEvent.allDay || false,
          organizer: currentEvent.organizer,
          attendees: currentEvent.attendees || [],
          actionItems: currentEvent.actionItems || [],
          rrule: currentEvent.rrule,
          recurringSeriesId: currentEvent.rrule ? uid : undefined,
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
    }
  }

  return events;
}

/**
 * Expands recurring events for a specific target day (or range)
 */
export function expandEventsForDate(events: CalendarEvent[], targetDate: Date): CalendarEvent[] {
  const result: CalendarEvent[] = [];
  const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0);
  const endOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59);

  for (const event of events) {
    const dateStr = targetDate.toISOString().slice(0, 10);
    if (event.exceptionDates && event.exceptionDates.includes(dateStr)) {
      continue;
    }

    if (!event.rrule) {
      const eventLocalDate = new Date(event.start.getFullYear(), event.start.getMonth(), event.start.getDate());
      const targetLocalDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
      if (eventLocalDate.getTime() === targetLocalDate.getTime()) {
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
  const rruleUpper = (event.rrule || '').toUpperCase();

  const isWeekly = rruleUpper.includes('FREQ=WEEKLY');
  const isDaily = rruleUpper.includes('FREQ=DAILY');
  const isMonthly = rruleUpper.includes('FREQ=MONTHLY');

  const origStart = event.start;
  const durationMs = event.end.getTime() - event.start.getTime();

  if (origStart > rangeEnd) return instances;

  const cur = new Date(origStart);
  let limit = 0;
  while (cur <= rangeEnd && limit < 500) {
    limit++;
    if (cur >= rangeStart && cur <= rangeEnd) {
      const dateStr = cur.toISOString().slice(0, 10);
      if (!event.exceptionDates || !event.exceptionDates.includes(dateStr)) {
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

    if (isDaily) {
      cur.setDate(cur.getDate() + 1);
    } else if (isWeekly) {
      cur.setDate(cur.getDate() + 7);
    } else if (isMonthly) {
      cur.setMonth(cur.getMonth() + 1);
    } else {
      if (origStart >= rangeStart && origStart <= rangeEnd) {
        const dateStr = origStart.toISOString().slice(0, 10);
        if (!event.exceptionDates || !event.exceptionDates.includes(dateStr)) {
          instances.push(event);
        }
      }
      break;
    }
  }

  return instances;
}
