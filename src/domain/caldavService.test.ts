import {
  caldavService,
  chooseDefaultCollection,
  chooseDefaultTaskList,
  extractHrefFromXml,
  isTaskItem,
  isTaskMirrorEvent,
  resolveUrl,
} from './caldavService';
import { CalendarEvent } from './types';

describe('CaldavService', () => {
  const originalFetch = (globalThis as any).fetch;

  afterEach(() => {
    (globalThis as any).fetch = originalFetch;
  });

  test('resolveProviderInitialUrl returns correct endpoint for each provider', () => {
    expect(caldavService.resolveProviderInitialUrl('google')).toBe('https://apidata.googleusercontent.com/caldav/v2/');
    expect(caldavService.resolveProviderInitialUrl('fastmail')).toBe('https://caldav.fastmail.com/');
    expect(caldavService.resolveProviderInitialUrl('yahoo')).toBe('https://caldav.calendar.yahoo.com/');
    expect(caldavService.resolveProviderInitialUrl('custom', 'my-cloud.example.com/dav')).toBe('https://my-cloud.example.com/dav');
    expect(caldavService.resolveProviderInitialUrl('icloud')).toBe('https://caldav.icloud.com/');
  });

  test('discoverIcloudCalendarUrl handles missing credentials', async () => {
    const res = await caldavService.discoverIcloudCalendarUrl({ appleId: '', appPassword: '' });
    expect(res.success).toBe(false);
    expect(res.message).toContain('Please provide both');
  });

  test('discoverIcloudCalendarUrl handles 401 unauthorized response', async () => {
    (globalThis as any).fetch = jest.fn().mockResolvedValue({
      status: 401,
      text: async () => 'Unauthorized',
    } as any);

    const res = await caldavService.discoverIcloudCalendarUrl({
      appleId: 'user@example.com',
      appPassword: 'wrong-password',
    });

    expect(res.success).toBe(false);
    expect(res.message).toContain('Authentication failed');
  });

  test('discoverIcloudCalendarUrl parses principal href on successful PROPFIND', async () => {
    const xmlResponse1 = `<?xml version="1.0" encoding="utf-8"?>
<multistatus xmlns="DAV:">
  <response>
    <href>/</href>
    <propstat>
      <prop>
        <current-user-principal><href>/123456789/principal/</href></current-user-principal>
      </prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>
</multistatus>`;

    const xmlResponse2 = `<?xml version="1.0" encoding="utf-8"?>
<multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <response>
    <href>/123456789/principal/</href>
    <propstat>
      <prop>
        <C:calendar-home-set><href>https://p54-caldav.icloud.com/123456789/calendars/</href></C:calendar-home-set>
      </prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>
</multistatus>`;

    const xmlResponse3 = `<?xml version="1.0" encoding="utf-8"?>
<multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <response>
    <href>/123456789/calendars/home/</href>
    <propstat>
      <prop>
        <resourcetype><collection/><C:calendar/></resourcetype>
        <displayname>Personal</displayname>
      </prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>
</multistatus>`;

    let callCount = 0;
    (globalThis as any).fetch = jest.fn().mockImplementation(() => {
      callCount++;
      const text = callCount === 1 ? xmlResponse1 : callCount === 2 ? xmlResponse2 : xmlResponse3;
      return Promise.resolve({
        status: 200,
        text: async () => text,
      });
    });

    const res = await caldavService.discoverIcloudCalendarUrl({
      appleId: 'user@example.com',
      appPassword: 'abcd-efgh-ijkl-mnop',
    });

    expect(res.success).toBe(true);
    expect(res.calendarUrl).toContain('/123456789/calendars/');
  });

  test('task-target discovery succeeds for a VTODO-only CalDAV account', async () => {
    const principal = `<multistatus xmlns="DAV:"><response><propstat><prop>
      <current-user-principal><href>/u/principal/</href></current-user-principal>
    </prop></propstat></response></multistatus>`;
    const home = `<multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><response><propstat><prop>
      <C:calendar-home-set><href>https://tasks.example.com/u/calendars/</href></C:calendar-home-set>
    </prop></propstat></response></multistatus>`;
    const lists = `<multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><response>
      <href>/u/calendars/todos/</href><propstat><prop>
      <resourcetype><collection/><C:calendar/></resourcetype><displayname>Shared Tasks</displayname>
      <C:supported-calendar-component-set><C:comp name="VTODO"/></C:supported-calendar-component-set>
      </prop></propstat></response></multistatus>`;
    let call = 0;
    (globalThis as any).fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({ status: 207, text: async () => [principal, home, lists][call++] })
    );

    const res = await caldavService.discoverIcloudCalendarUrl({
      provider: 'custom', appleId: 'u', appPassword: 'p', customUrl: 'https://tasks.example.com/'
    }, 'tasks');

    expect(res.success).toBe(true);
    expect(res.calendarUrl).toBeUndefined();
    expect(res.taskListUrl).toBe('https://tasks.example.com/u/calendars/todos/');
  });

  test('iCloud event discovery does not activate its legacy VTODO collection', async () => {
    const principal = `<multistatus xmlns="DAV:"><response><propstat><prop>
      <current-user-principal><href>/u/principal/</href></current-user-principal>
    </prop></propstat></response></multistatus>`;
    const home = `<multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><response><propstat><prop>
      <C:calendar-home-set><href>https://p.test/u/calendars/</href></C:calendar-home-set>
    </prop></propstat></response></multistatus>`;
    const lists = `<multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
      <response><href>/u/calendars/events/</href><propstat><prop><resourcetype><collection/><C:calendar/></resourcetype>
      <displayname>Calendar</displayname><C:supported-calendar-component-set><C:comp name="VEVENT"/></C:supported-calendar-component-set>
      </prop></propstat></response>
      <response><href>/u/calendars/legacy-tasks/</href><propstat><prop><resourcetype><collection/><C:calendar/></resourcetype>
      <displayname>Reminders</displayname><C:supported-calendar-component-set><C:comp name="VTODO"/></C:supported-calendar-component-set>
      </prop></propstat></response></multistatus>`;
    let call = 0;
    (globalThis as any).fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({ status: 207, text: async () => [principal, home, lists][call++] })
    );

    const res = await caldavService.discoverIcloudCalendarUrl({
      provider: 'icloud', appleId: 'u', appPassword: 'p'
    });

    expect(res.success).toBe(true);
    expect(res.calendarUrl).toContain('/events/');
    expect(res.taskListUrl).toBeUndefined();
    expect(res.message).toContain('legacy VTODO');
  });

  test('pushIcloudEvent sends HTTP PUT with VEVENT payload', async () => {
    (globalThis as any).fetch = jest.fn().mockResolvedValue({
      status: 201,
      text: async () => 'Created',
    } as any);

    const mockEvent: CalendarEvent = {
      uid: 'evt-test-100',
      summary: 'Product Roadmap Sync',
      start: new Date('2026-08-16T14:00:00Z'),
      end: new Date('2026-08-16T15:00:00Z'),
      allDay: false,
      attendees: [],
    };

    const res = await caldavService.pushIcloudEvent(mockEvent, {
      appleId: 'user@example.com',
      appPassword: 'abcd-efgh-ijkl-mnop',
      calendarUrl: 'https://caldav.icloud.com/123456789/principal/',
    });

    expect(res.success).toBe(true);
    expect((globalThis as any).fetch).toHaveBeenCalledWith(
      expect.stringContaining('evt-test-100.ics'),
      expect.objectContaining({ method: 'PUT' })
    );
  });

  test('deleteIcloudEvent sends HTTP DELETE request', async () => {
    (globalThis as any).fetch = jest.fn().mockResolvedValue({
      status: 204,
      text: async () => '',
    } as any);

    const res = await caldavService.deleteIcloudEvent('evt-test-100', {
      appleId: 'user@example.com',
      appPassword: 'abcd-efgh-ijkl-mnop',
      calendarUrl: 'https://caldav.icloud.com/123456789/principal/',
    });

    expect(res.success).toBe(true);
    expect((globalThis as any).fetch).toHaveBeenCalledWith(
      expect.stringContaining('evt-test-100.ics'),
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  test('updates and deletes discovered resources with ETag conflict protection', async () => {
    (globalThis as any).fetch = jest.fn().mockResolvedValue({
      status: 204,
      text: async () => '',
      headers: { get: () => '"v3"' },
    } as any);
    const resource = 'https://caldav.example.test/cal/opaque-name.ics';
    const event: CalendarEvent = {
      uid: 'uid-does-not-match-file', summary: 'Protected',
      start: new Date(), end: new Date(Date.now() + 3600000), allDay: false,
      attendees: [], caldavUrl: resource, etag: '"v2"',
    };

    const pushed = await caldavService.pushIcloudEvent(event, {
      appleId: 'user', appPassword: 'pass', calendarUrl: 'https://caldav.example.test/cal/',
    });
    expect(pushed.etag).toBe('"v3"');
    expect((globalThis as any).fetch).toHaveBeenLastCalledWith(resource, expect.objectContaining({
      headers: expect.objectContaining({ 'If-Match': '"v2"' }),
    }));

    await caldavService.deleteIcloudEvent(event.uid, {
      appleId: 'user', appPassword: 'pass', calendarUrl: 'https://caldav.example.test/cal/',
    }, false, { url: resource, etag: '"v3"' });
    expect((globalThis as any).fetch).toHaveBeenLastCalledWith(resource, expect.objectContaining({
      method: 'DELETE',
      headers: expect.objectContaining({ 'If-Match': '"v3"' }),
    }));
  });

  test('pushIcloudEvent and deleteIcloudEvent handle HTTP server errors and network failures', async () => {
    (globalThis as any).fetch = jest.fn().mockResolvedValue({
      status: 500,
      text: async () => 'Internal Server Error',
    } as any);

    const pushFail = await caldavService.pushIcloudEvent(
      { uid: 'evt-500', summary: 'Err', start: new Date(), end: new Date(), allDay: false, attendees: [] },
      { appleId: 'user@example.com', appPassword: 'pass' }
    );
    expect(pushFail.success).toBe(false);

    const delFail = await caldavService.deleteIcloudEvent('evt-500', { appleId: 'user@example.com', appPassword: 'pass' });
    expect(delFail.success).toBe(false);
  });

  test('runCalDavDiagnostics produces detailed diagnostic trace', async () => {
    (globalThis as any).fetch = jest.fn().mockResolvedValue({
      status: 200,
      text: async () => '<current-user-principal><href>/123/principal/</href></current-user-principal>',
    } as any);

    const logs = await caldavService.runCalDavDiagnostics({ appleId: 'user@example.com', appPassword: 'pass' });
    expect(logs.length).toBeGreaterThan(3);
    expect(logs[0]).toContain('Starting CalDAV Diagnostics');

    const emptyLogs = await caldavService.runCalDavDiagnostics({ appleId: '', appPassword: '' });
    expect(emptyLogs.some(l => l.includes('Missing credentials'))).toBe(true);
  });

  // Captured verbatim from iCloud on 2026-08-16. Note the single-quoted
  // name='VEVENT' inside a double-quoted parent element — an earlier
  // hand-written fixture used double quotes throughout and hid a real bug.
  const ICLOUD_HOME_SET_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<multistatus xmlns="DAV:">
    <response xmlns="DAV:">
        <href>/123456789/calendars/</href>
        <propstat><prop>
            <resourcetype xmlns="DAV:"><collection/></resourcetype>
            <displayname xmlns="DAV:">CT Reatherford</displayname>
            <supported-calendar-component-set xmlns="urn:ietf:params:xml:ns:caldav"><comp name='VEVENT' xmlns='urn:ietf:params:xml:ns:caldav'/><comp name='VTODO' xmlns='urn:ietf:params:xml:ns:caldav'/></supported-calendar-component-set>
        </prop><status>HTTP/1.1 200 OK</status></propstat>
    </response>
    <response xmlns="DAV:">
        <href>/123456789/calendars/2D8B96A5-FD83-4DCA-BEED-DDEB6F36AABB/</href>
        <propstat><prop>
            <resourcetype xmlns="DAV:"><collection/><calendar xmlns="urn:ietf:params:xml:ns:caldav"/></resourcetype>
            <displayname xmlns="DAV:">Zepp</displayname>
            <supported-calendar-component-set xmlns="urn:ietf:params:xml:ns:caldav"><comp name='VEVENT' xmlns='urn:ietf:params:xml:ns:caldav'/></supported-calendar-component-set>
        </prop><status>HTTP/1.1 200 OK</status></propstat>
    </response>
    <response xmlns="DAV:">
        <href>/123456789/calendars/11111111-2222-4333-8444-555555555555/</href>
        <propstat><prop>
            <resourcetype xmlns="DAV:"><collection/><calendar xmlns="urn:ietf:params:xml:ns:caldav"/></resourcetype>
            <displayname xmlns="DAV:">Reminders</displayname>
            <supported-calendar-component-set xmlns="urn:ietf:params:xml:ns:caldav"><comp name='VTODO' xmlns='urn:ietf:params:xml:ns:caldav'/></supported-calendar-component-set>
        </prop><status>HTTP/1.1 200 OK</status></propstat>
    </response>
    <response xmlns="DAV:">
        <href>/123456789/calendars/inbox/</href>
        <propstat><prop>
            <resourcetype xmlns="DAV:"><collection/><schedule-inbox xmlns="urn:ietf:params:xml:ns:caldav"/></resourcetype>
            <supported-calendar-component-set xmlns="urn:ietf:params:xml:ns:caldav"><comp name='VEVENT' xmlns='urn:ietf:params:xml:ns:caldav'/></supported-calendar-component-set>
        </prop><status>HTTP/1.1 200 OK</status></propstat>
        <propstat><prop><displayname xmlns="DAV:"/></prop><status>HTTP/1.1 404 Not Found</status></propstat>
    </response>
    <response xmlns="DAV:">
        <href>/123456789/calendars/notification/</href>
        <propstat><prop>
            <resourcetype xmlns="DAV:"><collection/><notification xmlns="http://calendarserver.org/ns/"/></resourcetype>
        </prop><status>HTTP/1.1 200 OK</status></propstat>
    </response>
    <response xmlns="DAV:">
        <href>/123456789/calendars/work/</href>
        <propstat><prop>
            <resourcetype xmlns="DAV:"><collection/><calendar xmlns="urn:ietf:params:xml:ns:caldav"/></resourcetype>
            <displayname xmlns="DAV:">Work</displayname>
            <supported-calendar-component-set xmlns="urn:ietf:params:xml:ns:caldav"><comp name='VEVENT' xmlns='urn:ietf:params:xml:ns:caldav'/></supported-calendar-component-set>
        </prop><status>HTTP/1.1 200 OK</status></propstat>
    </response>
    <response xmlns="DAV:">
        <href>/123456789/calendars/outbox/</href>
        <propstat><prop>
            <resourcetype xmlns="DAV:"><collection/><schedule-outbox xmlns="urn:ietf:params:xml:ns:caldav"/></resourcetype>
            <supported-calendar-component-set xmlns="urn:ietf:params:xml:ns:caldav"><comp name='VEVENT' xmlns='urn:ietf:params:xml:ns:caldav'/></supported-calendar-component-set>
        </prop><status>HTTP/1.1 200 OK</status></propstat>
    </response>
</multistatus>`;

  test('listCalendarCollections parses real iCloud markup with single-quoted comp names', async () => {
    (globalThis as any).fetch = jest.fn().mockResolvedValue({
      status: 207,
      text: async () => ICLOUD_HOME_SET_XML,
    } as any);

    const collections = await caldavService.listCalendarCollections(
      'https://p02-caldav.icloud.com:443/123456789/calendars/',
      'Basic xxx'
    );

    expect(collections).toEqual([
      {
        url: 'https://p02-caldav.icloud.com:443/123456789/calendars/2D8B96A5-FD83-4DCA-BEED-DDEB6F36AABB/',
        displayName: 'Zepp',
        supportsVEvent: true,
        supportsVTodo: false,
      },
      {
        url: 'https://p02-caldav.icloud.com:443/123456789/calendars/11111111-2222-4333-8444-555555555555/',
        displayName: 'Reminders',
        supportsVEvent: false,
        supportsVTodo: true,
      },
      {
        url: 'https://p02-caldav.icloud.com:443/123456789/calendars/work/',
        displayName: 'Work',
        supportsVEvent: true,
        supportsVTodo: false,
      },
    ]);
  });

  test('the real iCloud Reminders list is selected as the task target', async () => {
    (globalThis as any).fetch = jest.fn().mockResolvedValue({
      status: 207,
      text: async () => ICLOUD_HOME_SET_XML,
    } as any);

    const collections = await caldavService.listCalendarCollections(
      'https://p02-caldav.icloud.com:443/123456789/calendars/',
      'Basic xxx'
    );

    expect(chooseDefaultTaskList(collections)?.url).toContain('11111111-2222-4333-8444-555555555555');
    expect(chooseDefaultCollection(collections)?.displayName).toBe('Zepp');
  });

  test('listCalendarCollections excludes the home container, inbox, outbox and notification', async () => {
    (globalThis as any).fetch = jest.fn().mockResolvedValue({
      status: 207,
      text: async () => ICLOUD_HOME_SET_XML,
    } as any);

    const urls = (
      await caldavService.listCalendarCollections(
        'https://p02-caldav.icloud.com:443/123456789/calendars/',
        'Basic xxx'
      )
    ).map(c => c.url);

    expect(urls.some(u => u.endsWith('/calendars/'))).toBe(false);
    expect(urls.some(u => u.includes('/inbox/'))).toBe(false);
    expect(urls.some(u => u.includes('/outbox/'))).toBe(false);
    expect(urls.some(u => u.includes('/notification/'))).toBe(false);

    // The VTODO-only Reminders list IS kept — it is the task target — but it
    // must be flagged so it is never chosen as the event calendar.
    expect(urls.some(u => u.includes('11111111'))).toBe(true);
  });

  test('discoverIcloudCalendarUrl reports failure when the home set holds no calendar', async () => {
    const principalXml = `<multistatus xmlns="DAV:"><response><href>/</href><propstat><prop>
      <current-user-principal><href>/123456789/principal/</href></current-user-principal>
    </prop></propstat></response></multistatus>`;

    const homeXml = `<multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><response><href>/123456789/principal/</href><propstat><prop>
      <C:calendar-home-set><href>https://p54-caldav.icloud.com/123456789/calendars/</href></C:calendar-home-set>
    </prop></propstat></response></multistatus>`;

    const emptyHomeXml = `<multistatus xmlns="DAV:"><response><href>/123456789/calendars/</href>
      <propstat><prop><resourcetype><collection/></resourcetype></prop></propstat></response></multistatus>`;

    let callCount = 0;
    (globalThis as any).fetch = jest.fn().mockImplementation(() => {
      callCount++;
      const text = callCount === 1 ? principalXml : callCount === 2 ? homeXml : emptyHomeXml;
      return Promise.resolve({ status: 207, text: async () => text });
    });

    const res = await caldavService.discoverIcloudCalendarUrl({
      appleId: 'user@example.com',
      appPassword: 'abcd-efgh-ijkl-mnop',
    });

    expect(res.success).toBe(false);
    expect(res.message).toContain('no writable VEVENT calendar');
  });

  test('pushIcloudEvent refuses to guess a collection URL when none was discovered', async () => {
    (globalThis as any).fetch = jest.fn();

    const res = await caldavService.pushIcloudEvent(
      { uid: 'evt-1', summary: 'X', start: new Date(), end: new Date(), allDay: false, attendees: [] },
      { appleId: 'user@example.com', appPassword: 'pass' }
    );

    expect(res.success).toBe(false);
    expect(res.message).toContain('No calendar selected');
    expect((globalThis as any).fetch).not.toHaveBeenCalled();
  });

  const evt = (url: string, displayName: string) => ({
    url,
    displayName,
    supportsVEvent: true,
    supportsVTodo: false,
  });

  test('chooseDefaultCollection prefers the calendar named Calendar over document order', () => {
    const collections = [
      evt('https://x/cal/zepp/', 'Zepp'),
      evt('https://x/cal/work/', 'Work'),
      evt('https://x/cal/z-2013/', 'Calendar'),
      evt('https://x/cal/holidays/', 'US Holidays'),
    ];

    expect(chooseDefaultCollection(collections)?.displayName).toBe('Calendar');
    expect(chooseDefaultCollection([collections[0], collections[1]])?.displayName).toBe('Zepp');
    expect(chooseDefaultCollection([])).toBeUndefined();
  });

  test('chooseDefaultCollection ignores VTODO-only collections', () => {
    const collections = [
      { url: 'https://x/cal/reminders/', displayName: 'Reminders', supportsVEvent: false, supportsVTodo: true },
      evt('https://x/cal/work/', 'Work'),
    ];

    expect(chooseDefaultCollection(collections)?.displayName).toBe('Work');
  });

  test('chooseDefaultTaskList picks the VTODO-only list, not a dual-capable calendar', () => {
    const collections = [
      { url: 'https://x/cal/home/', displayName: 'Home', supportsVEvent: true, supportsVTodo: true },
      { url: 'https://x/cal/reminders/', displayName: 'Reminders', supportsVEvent: false, supportsVTodo: true },
      evt('https://x/cal/work/', 'Work'),
    ];

    expect(chooseDefaultTaskList(collections)?.displayName).toBe('Reminders');
    // With no VTODO-only list, fall back to anything that accepts VTODO.
    expect(chooseDefaultTaskList([collections[0], collections[2]])?.displayName).toBe('Home');
    expect(chooseDefaultTaskList([collections[2]])).toBeUndefined();
  });

  test('isTaskItem recognises both the isTask flag and the legacy [TASK] prefix', () => {
    const base = { uid: 'x', start: new Date(), end: new Date(), allDay: false, attendees: [] };

    expect(isTaskItem({ ...base, summary: 'Standup', isTask: true })).toBe(true);
    // Items stored before the flag existed must still route to Reminders.
    expect(isTaskItem({ ...base, summary: '[TASK] Buy milk' })).toBe(true);
    expect(isTaskItem({ ...base, summary: 'Buy milk' })).toBe(false);
    expect(isTaskItem({ ...base, summary: 'Talk about [TASK] naming' })).toBe(false);
  });

  test('recognises marked mirrors and legacy SNFolio task UIDs without hiding unrelated feeds', () => {
    const base = {
      uid: 'calendar-item',
      summary: 'Buy milk',
      start: new Date(),
      end: new Date(),
      allDay: false,
      attendees: [],
    };

    expect(isTaskMirrorEvent({ ...base, isTaskMirror: true })).toBe(true);
    expect(isTaskMirrorEvent({ ...base, uid: 'task-1787558400000', sourceKind: 'caldav' })).toBe(true);
    expect(isTaskMirrorEvent({ ...base, uid: 'task-1787558400000', sourceKind: 'feed' })).toBe(false);
    expect(isTaskMirrorEvent({ ...base, uid: 'task-planning', sourceKind: 'caldav' })).toBe(false);
  });

  test('pushIcloudEvent sends a VTODO to the task list, not the calendar', async () => {
    (globalThis as any).fetch = jest.fn().mockResolvedValue({ status: 201, text: async () => '' } as any);

    const res = await caldavService.pushIcloudEvent(
      {
        uid: 'task-9',
        summary: '[TASK] Submit report',
        isTask: true,
        start: new Date('2026-08-25T10:00:00Z'),
        end: new Date('2026-08-25T10:30:00Z'),
        allDay: false,
        attendees: [],
      },
      {
        appleId: 'user@icloud.com',
        appPassword: 'pass',
        calendarUrl: 'https://p165.icloud.com/1/calendars/work/',
        taskListUrl: 'https://p165.icloud.com/1/calendars/reminders/',
      }
    );

    expect(res.success).toBe(true);

    const [url, init] = (globalThis as any).fetch.mock.calls[0];
    expect(url).toBe('https://p165.icloud.com/1/calendars/reminders/task-9.ics');
    expect(init.body).toContain('BEGIN:VTODO');
    expect(init.body).not.toContain('VEVENT');
  });

  test('pushIcloudEvent fails clearly when no separate VTODO list is selected', async () => {
    (globalThis as any).fetch = jest.fn();

    const res = await caldavService.pushIcloudEvent(
      {
        uid: 'task-10',
        summary: '[TASK] Orphan',
        isTask: true,
        start: new Date(),
        end: new Date(),
        allDay: false,
        attendees: [],
      },
      { appleId: 'user@icloud.com', appPassword: 'pass', calendarUrl: 'https://p165.icloud.com/1/calendars/work/' }
    );

    expect(res.success).toBe(false);
    expect(res.message).toContain('No VTODO task list');
    // Must not silently fall back to the calendar and create a stray event.
    expect((globalThis as any).fetch).not.toHaveBeenCalled();
  });

  test('deleteIcloudEvent targets the task list for tasks', async () => {
    (globalThis as any).fetch = jest.fn().mockResolvedValue({ status: 204, text: async () => '' } as any);

    await caldavService.deleteIcloudEvent(
      'task-9',
      {
        appleId: 'user@icloud.com',
        appPassword: 'pass',
        calendarUrl: 'https://p165.icloud.com/1/calendars/work/',
        taskListUrl: 'https://p165.icloud.com/1/calendars/reminders/',
      },
      true
    );

    expect((globalThis as any).fetch).toHaveBeenCalledWith(
      'https://p165.icloud.com/1/calendars/reminders/task-9.ics',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  test('resolveUrl follows the responding host, not the entry host', () => {
    expect(resolveUrl('https://caldav.icloud.com/', '/123/principal/')).toBe(
      'https://caldav.icloud.com/123/principal/'
    );
    expect(resolveUrl('https://p54-caldav.icloud.com/123/principal/', '/123/calendars/')).toBe(
      'https://p54-caldav.icloud.com/123/calendars/'
    );
    expect(resolveUrl('https://caldav.icloud.com/', 'https://p54-caldav.icloud.com/123/calendars/')).toBe(
      'https://p54-caldav.icloud.com/123/calendars/'
    );
  });

  test('extractHrefFromXml parses XML with various namespace prefixes', () => {
    expect(extractHrefFromXml('', 'current-user-principal')).toBeNull();
    expect(extractHrefFromXml('<xml></xml>', 'unknown-tag')).toBeNull();
    expect(extractHrefFromXml('<xml><href>/104928471/principal/</href></xml>', 'current-user-principal')).toBe('/104928471/principal/');
    expect(extractHrefFromXml('<xml><href>/104928471/calendars/</href></xml>', 'calendar-home-set')).toBe('/104928471/calendars/');

    const xmlWithDAV = `<DAV:response xmlns:DAV="DAV:"><DAV:propstat><DAV:prop><DAV:current-user-principal><DAV:href>/104928471/principal/</DAV:href></DAV:current-user-principal></DAV:prop></DAV:propstat></DAV:response>`;
    expect(extractHrefFromXml(xmlWithDAV, 'current-user-principal')).toBe('/104928471/principal/');

    const xmlWithD = `<D:response xmlns:D="DAV:"><D:propstat><D:prop><C:calendar-home-set xmlns:C="urn:ietf:params:xml:ns:caldav"><D:href>/104928471/calendars/</D:href></C:calendar-home-set></D:prop></D:propstat></D:response>`;
    expect(extractHrefFromXml(xmlWithD, 'calendar-home-set')).toBe('/104928471/calendars/');
  });
});
