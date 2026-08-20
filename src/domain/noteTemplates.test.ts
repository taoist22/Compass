import {
  DEFAULT_SYSTEM_TEMPLATE,
  isSystemTemplate,
  parseSystemTemplates,
  templateCandidates,
  templateLabel,
  resolveNoteDestination,
  templateSettingKey,
} from './noteTemplates';

/**
 * Verbatim entries from the device probe run on 2026-08-18, including the three
 * whose name does not match their resource path — the reason names are never
 * constructed from the URI.
 */
const PROBE_SAMPLE = [
  {
    hUri: 'android.resource://com.ratta.supernote.pluginhost/drawable/style_h_8mm_ruled_line',
    vUri: 'android.resource://com.ratta.supernote.pluginhost/drawable/style_8mm_ruled_line',
    name: 'style_8mm_ruled_line',
  },
  {
    hUri: 'android.resource://com.ratta.supernote.pluginhost/drawable/style_h_3_by_3_grid',
    vUri: 'android.resource://com.ratta.supernote.pluginhost/drawable/style_by_3_grid',
    name: 'style_nine_palace_lattice',
  },
  {
    hUri: 'android.resource://com.ratta.supernote.pluginhost/drawable/style_h_meeting_notes',
    vUri: 'android.resource://com.ratta.supernote.pluginhost/drawable/style_meeting_notes',
    name: 'style_meeting_notes',
  },
];

describe('system template identification', () => {
  test('a built-in name is not a path', () => {
    expect(isSystemTemplate('style_8mm_ruled_line')).toBe(true);
    expect(isSystemTemplate('style_daily_calendar')).toBe(true);
  });

  test('a custom template is an absolute path', () => {
    expect(isSystemTemplate('/storage/emulated/0/MyStyle/mine.png')).toBe(false);
  });

  test('an empty value is neither', () => {
    expect(isSystemTemplate('')).toBe(false);
    expect(isSystemTemplate('   ')).toBe(false);
  });
});

describe('templateLabel', () => {
  test('turns a built-in name into a readable label', () => {
    expect(templateLabel('style_college_ruled')).toBe('College Ruled');
    expect(templateLabel('style_meeting_notes')).toBe('Meeting Notes');
    expect(templateLabel('style_daily_calendar')).toBe('Daily Calendar');
  });

  test('keeps measurements tight rather than title-casing them', () => {
    expect(templateLabel('style_8mm_ruled_line')).toBe('8mm Ruled Line');
    expect(templateLabel('style_5mm_engineering_grid')).toBe('5mm Engineering Grid');
  });

  test('shows only the filename for a custom PNG', () => {
    expect(templateLabel('/storage/emulated/0/MyStyle/my_grid.png')).toBe('my_grid.png');
  });

  test('falls back to a plain description when nothing is set', () => {
    expect(templateLabel('')).toBe('Built-in default');
  });
});

describe('templateSettingKey', () => {
  test('maps each note kind to its own setting', () => {
    expect(templateSettingKey('meeting')).toBe('meetingTemplate');
    expect(templateSettingKey('class')).toBe('classTemplate');
    expect(templateSettingKey('daily')).toBe('dailyNoteTemplate');
  });
});

describe('templateCandidates', () => {
  test('offers the portrait URI as a fallback for a built-in', () => {
    // createNote is documented as taking a "path" while insertNotePage takes a
    // "name", so the second attempt covers the ambiguity.
    const candidates = templateCandidates('style_8mm_ruled_line', PROBE_SAMPLE);
    expect(candidates[0]).toBe('style_8mm_ruled_line');
    expect(candidates[1]).toContain('drawable/style_8mm_ruled_line');
  });

  test('does not invent a fallback for an unknown built-in', () => {
    expect(templateCandidates('style_not_on_this_device', PROBE_SAMPLE)).toEqual([
      'style_not_on_this_device',
    ]);
  });

  test('a custom PNG is used as given, with no fallback', () => {
    const path = '/storage/emulated/0/MyStyle/mine.png';
    expect(templateCandidates(path, PROBE_SAMPLE)).toEqual([path]);
  });

  test('an unset template falls back to 8mm ruled', () => {
    expect(templateCandidates('', PROBE_SAMPLE)).toEqual([DEFAULT_SYSTEM_TEMPLATE]);
  });
});

describe('parseSystemTemplates', () => {
  test('reads the shape the device actually returns', () => {
    const parsed = parseSystemTemplates(PROBE_SAMPLE);
    expect(parsed).toHaveLength(3);
    expect(parsed[0].name).toBe('style_8mm_ruled_line');
    expect(parsed[0].vUri).toContain('style_8mm_ruled_line');
  });

  test('keeps names that do not match their resource path', () => {
    // style_h_3_by_3_grid is named style_nine_palace_lattice; deriving the name
    // from the URI would have produced the wrong identifier.
    const parsed = parseSystemTemplates(PROBE_SAMPLE);
    expect(parsed.map(t => t.name)).toContain('style_nine_palace_lattice');
  });

  test('survives the API returning nothing usable', () => {
    expect(parseSystemTemplates(null)).toEqual([]);
    expect(parseSystemTemplates(undefined)).toEqual([]);
    expect(parseSystemTemplates('not an array')).toEqual([]);
    expect(parseSystemTemplates([])).toEqual([]);
  });

  test('skips malformed entries rather than failing wholesale', () => {
    const parsed = parseSystemTemplates([null, {}, { name: '' }, { name: 'style_white' }]);
    expect(parsed).toEqual([{ name: 'style_white', hUri: undefined, vUri: undefined }]);
  });
});

describe('resolveNoteDestination', () => {
  const fallback = { folder: '/Note/Meetings', template: DEFAULT_SYSTEM_TEMPLATE };

  test('an event type overrides both', () => {
    expect(
      resolveNoteDestination({ folder: '/Note/SNHU', template: 'style_college_ruled' }, fallback)
    ).toEqual({ folder: '/Note/SNHU', template: 'style_college_ruled' });
  });

  test('a type may override only one', () => {
    // A type that only cares where its notes land keeps the default look.
    expect(resolveNoteDestination({ folder: '/Note/SNHU' }, fallback)).toEqual({
      folder: '/Note/SNHU',
      template: DEFAULT_SYSTEM_TEMPLATE,
    });
  });

  test('an untyped event falls back entirely', () => {
    expect(resolveNoteDestination(undefined, fallback)).toEqual(fallback);
  });

  test('blank settings are treated as unset, not as an empty path', () => {
    // Otherwise a cleared field files notes at the filesystem root.
    expect(resolveNoteDestination({ folder: '   ', template: '' }, fallback)).toEqual(fallback);
  });
});
