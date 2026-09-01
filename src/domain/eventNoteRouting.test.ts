import { CalendarSettings } from './types';
import { cleanRelativeNoteSubpath, paraEventNoteFolder, routedEventNoteFolder } from './eventNoteRouting';

const settings = {
  routeEventNotesToPara: true,
  meetingParaSubpath: 'Meetings',
  classParaSubpath: 'Course Notes/Classes',
} as CalendarSettings;

describe('event note routing', () => {
  test('uses the Project folder before the Area folder', () => {
    expect(routedEventNoteFolder(settings, 'meeting', '/Note/Projects/Launch', '/Note/Areas/Work'))
      .toBe('/Note/Projects/Launch/Meetings');
  });

  test('uses the Area folder when there is no Project', () => {
    expect(routedEventNoteFolder(settings, 'class', undefined, '/Note/Areas/School'))
      .toBe('/Note/Areas/School/Course Notes/Classes');
  });

  test('falls back when routing is disabled or no PARA container exists', () => {
    expect(routedEventNoteFolder({ ...settings, routeEventNotesToPara: false }, 'meeting', '/Project'))
      .toBeUndefined();
    expect(routedEventNoteFolder(settings, 'meeting')).toBeUndefined();
  });

  test('resolves a PARA choice even when it is not the configured default', () => {
    expect(paraEventNoteFolder(
      { ...settings, routeEventNotesToPara: false },
      'meeting',
      '/Note/Projects/Launch'
    )).toBe('/Note/Projects/Launch/Meetings');
  });

  test('allows the Project or Area root and removes traversal', () => {
    expect(routedEventNoteFolder({ ...settings, meetingParaSubpath: '' }, 'meeting', '/Project/'))
      .toBe('/Project');
    expect(cleanRelativeNoteSubpath('/Meetings/../Client: Calls/')).toBe('Meetings/Client Calls');
  });
});
