import { fetchCalendarFeed, normaliseFeedUrl, refreshCalendarFeeds } from './feedService';

const emptyCalendar = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n';
const oneEventCalendar = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'UID:feed-event-1',
  'DTSTART:20260824T120000Z',
  'DTEND:20260824T130000Z',
  'SUMMARY:Feed Event',
  'END:VEVENT',
  'END:VCALENDAR',
  '',
].join('\r\n');

describe('calendar feed service', () => {
  test('requires encrypted transport and upgrades webcal', () => {
    expect(normaliseFeedUrl('webcal://example.com/private.ics')).toBe('https://example.com/private.ics');
    expect(normaliseFeedUrl('http://example.com/private.ics')).toBeNull();
  });

  test('rejects HTTP errors and non-calendar bodies', async () => {
    await expect(fetchCalendarFeed('https://example.com/x', 'X', jest.fn().mockResolvedValue({
      ok: false, status: 404, text: async () => 'not found',
    }) as any)).rejects.toThrow('HTTP 404');
    await expect(fetchCalendarFeed('https://example.com/x', 'X', jest.fn().mockResolvedValue({
      ok: true, status: 200, text: async () => '<html>login</html>',
    }) as any)).rejects.toThrow('not an iCalendar');
  });

  test('distinguishes a successful empty calendar from a failed refresh', async () => {
    const fetcher = jest.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => emptyCalendar })
      .mockRejectedValueOnce(new Error('offline')) as any;
    const result = await refreshCalendarFeeds([
      { id: 'empty', name: 'Empty', url: 'https://example.com/empty', enabled: true },
      { id: 'down', name: 'Down', url: 'https://example.com/down', enabled: true },
    ], fetcher);
    expect(result).toEqual({ events: [], successful: 1, failed: 1 });
  });

  test('tags refreshed events with the feed that produced them', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => oneEventCalendar,
    }) as any;
    const result = await refreshCalendarFeeds([
      { id: 'work-feed', name: 'Work', url: 'https://example.com/work', enabled: true },
    ], fetcher);

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      uid: 'feed-event-1',
      calendarName: 'Work',
      sourceKind: 'feed',
      sourceFeedId: 'work-feed',
    });
  });
});
