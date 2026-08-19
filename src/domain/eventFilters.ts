import { CalendarEvent, CalendarSettings } from './types';

/**
 * Collapses items that appear more than once by UID, keeping the first.
 *
 * An item created in the plugin is held locally AND pushed to CalDAV, then
 * comes back down through the subscribed webcal feed on the next refresh —
 * same UID, two copies. Locally-created items are loaded before feeds are
 * fetched, so keeping the first occurrence keeps the local copy, which is the
 * one carrying isTask and any edits made on the device.
 *
 * Safe against recurrence: parseIcsContent emits one entry per VEVENT with an
 * rrule field, and expandEventsForDate runs after filtering, so distinct
 * occurrences do not exist yet at this point.
 */
export function dedupeEvents(events: CalendarEvent[]): CalendarEvent[] {
  const seen = new Set<string>();
  const result: CalendarEvent[] = [];

  for (const event of events) {
    const key = event.uid;
    if (!key) {
      result.push(event);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(event);
  }

  return result;
}

/**
 * Filters calendar events based on user preferences (all-day events, solo events)
 */
export function filterEvents(events: CalendarEvent[], settings: CalendarSettings): CalendarEvent[] {
  return dedupeEvents(events).filter(event => {
    if (settings.hideAllDayEvents && event.allDay) {
      return false;
    }
    if (settings.hideSoloEvents && event.attendees.length === 0) {
      return false;
    }
    return true;
  });
}
