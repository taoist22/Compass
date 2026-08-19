import { parseCapturedText, resolveDateOrder } from './captureParser';

// Fixed "now" so relative defaults are deterministic: Mon 17 Aug 2026.
const NOW = new Date(2026, 7, 17, 9, 0, 0);
const parse = (text: string, dateOrder?: 'MDY' | 'DMY') =>
  parseCapturedText(text, { now: NOW, dateOrder });

describe('captureParser — kind inference', () => {
  test('no date and no time means a task, not an event', () => {
    const r = parse('email the professor about chapter 4');
    expect(r.kind).toBe('task');
    expect(r.title).toBe('email the professor about chapter 4');
    expect(r.date).toBeUndefined();
  });

  test('a date makes it an event', () => {
    expect(parse('Meeting A 09/22/2026').kind).toBe('event');
  });

  test('a time alone makes it an event dated today', () => {
    const r = parse('standup at 9:30am');
    expect(r.kind).toBe('event');
    expect(r.date?.getFullYear()).toBe(2026);
    expect(r.date?.getMonth()).toBe(7);
    expect(r.date?.getDate()).toBe(17);
    expect(r.hours).toBe(9);
    expect(r.minutes).toBe(30);
  });

  test('a date without a time is an all-day event', () => {
    const r = parse('conference Sep 22 2026');
    expect(r.allDay).toBe(true);
    expect(r.hours).toBeUndefined();
  });
});

describe('captureParser — the worked example', () => {
  test('Meeting A 09/22/2026 10:00A parses fully', () => {
    const r = parse('Meeting A 09/22/2026 10:00A');
    expect(r.title).toBe('Meeting A');
    expect(r.date?.getMonth()).toBe(8); // September
    expect(r.date?.getDate()).toBe(22);
    expect(r.date?.getFullYear()).toBe(2026);
    expect(r.hours).toBe(10);
    expect(r.minutes).toBe(0);
    expect(r.allDay).toBe(false);
    expect(r.kind).toBe('event');
    expect(r.interpretation).toContain('10:00 AM');
  });
});

describe('captureParser — US vs European date order', () => {
  test('a value over 12 resolves the order with no preference needed', () => {
    const eu = parse('review 22/09/2026');
    expect(eu.date?.getDate()).toBe(22);
    expect(eu.date?.getMonth()).toBe(8);
    expect(eu.ambiguousDateOrder).toBe(false);

    const us = parse('review 09/22/2026');
    expect(us.date?.getDate()).toBe(22);
    expect(us.date?.getMonth()).toBe(8);
    expect(us.ambiguousDateOrder).toBe(false);
  });

  test('both values under 12 is genuinely ambiguous and follows the preference', () => {
    const mdy = parse('review 09/10/2026', 'MDY');
    expect(mdy.date?.getMonth()).toBe(8); // September
    expect(mdy.date?.getDate()).toBe(10);
    expect(mdy.ambiguousDateOrder).toBe(true);

    const dmy = parse('review 09/10/2026', 'DMY');
    expect(dmy.date?.getMonth()).toBe(9); // October
    expect(dmy.date?.getDate()).toBe(9);
    expect(dmy.ambiguousDateOrder).toBe(true);
  });

  test('an ambiguous guess is surfaced in the interpretation line', () => {
    expect(parse('review 09/10/2026', 'DMY').interpretation).toContain('date order assumed');
    expect(parse('review 22/09/2026', 'DMY').interpretation).not.toContain('assumed');
  });

  test('dot separators, common in Europe, are accepted', () => {
    const r = parse('Zahnarzt 22.09.2026');
    expect(r.date?.getDate()).toBe(22);
    expect(r.date?.getMonth()).toBe(8);
  });

  test('ISO dates are never ambiguous', () => {
    const r = parse('deadline 2026-09-22');
    expect(r.date?.getMonth()).toBe(8);
    expect(r.date?.getDate()).toBe(22);
    expect(r.ambiguousDateOrder).toBe(false);
  });
});

describe('captureParser — times', () => {
  test('24-hour times are accepted', () => {
    const r = parse('lecture 14:00');
    expect(r.hours).toBe(14);
    expect(r.minutes).toBe(0);
  });

  test('European 14h00 form is accepted', () => {
    const r = parse('cours 14h00');
    expect(r.hours).toBe(14);
  });

  test('meridiem handling around noon and midnight', () => {
    expect(parse('x 12:30am').hours).toBe(0);
    expect(parse('x 12:30pm').hours).toBe(12);
    expect(parse('x 1:05pm').hours).toBe(13);
  });

  test('a bare number is not treated as a time without a marker', () => {
    // "chapter 1000" must not become 10:00.
    const r = parse('read chapter 1000');
    expect(r.kind).toBe('task');
    expect(r.hours).toBeUndefined();
  });

  test('an explicit "at" allows the bare 4-digit form', () => {
    const r = parse('standup at 0930');
    expect(r.hours).toBe(9);
    expect(r.minutes).toBe(30);
  });
});

describe('captureParser — month names', () => {
  test('month-first and day-first both work', () => {
    const a = parse('Physics midterm Sept 22');
    expect(a.date?.getMonth()).toBe(8);
    expect(a.date?.getDate()).toBe(22);
    expect(a.title).toBe('Physics midterm');

    const b = parse('Physics midterm 22 September 2026');
    expect(b.date?.getMonth()).toBe(8);
    expect(b.date?.getDate()).toBe(22);
    expect(b.title).toBe('Physics midterm');
  });

  test('an ordinal suffix is tolerated', () => {
    const r = parse('party Oct 3rd');
    expect(r.date?.getMonth()).toBe(9);
    expect(r.date?.getDate()).toBe(3);
  });

  test('a missing year defaults to the current one', () => {
    expect(parse('thing Sep 22').date?.getFullYear()).toBe(2026);
  });
});

// Captured verbatim from recognizeElements on a Manta, 2026-08-17. These are
// what the device actually returns — invented strings hid the stranded-slash
// bug below, and the dot-separated time was a form I would not have guessed.
describe('captureParser — real OCR output from the device', () => {
  test('single-line capture: "08-20-2026 10.00A Meeting B"', () => {
    const r = parse('08-20-2026 10.00A Meeting B');
    expect(r.title).toBe('Meeting B');
    expect(r.date?.getMonth()).toBe(7); // August
    expect(r.date?.getDate()).toBe(20);
    expect(r.hours).toBe(10);
    expect(r.minutes).toBe(0);
    expect(r.kind).toBe('event');
  });

  test('multi-line capture leaves no stranded separator in the title', () => {
    const r = parse('09-01-2026\n / 1:00AM\nDentist');
    expect(r.title).toBe('Dentist');
    expect(r.date?.getMonth()).toBe(8); // September, under MDY
    expect(r.date?.getDate()).toBe(1);
    expect(r.hours).toBe(1);
    expect(r.minutes).toBe(0);
    expect(r.ambiguousDateOrder).toBe(true);
  });

  test('a lone separator never survives anywhere in the title', () => {
    expect(parse('09-01-2026 | 1:00AM Dentist').title).toBe('Dentist');
    expect(parse('Dentist - 09-01-2026').title).toBe('Dentist');
    expect(parse('09-01-2026 · Dentist · 1:00AM').title).toBe('Dentist');
  });
});

describe('captureParser — multi-line capture', () => {
  test('a date split across written lines still parses as one item', () => {
    // OCR of writing on separate ruled lines comes back with newlines.
    const r = parse('Meeting A\n09/22/2026\n10:00A');
    expect(r.title).toBe('Meeting A');
    expect(r.date?.getDate()).toBe(22);
    expect(r.hours).toBe(10);
    expect(r.kind).toBe('event');
  });

  test('newlines never survive into the title', () => {
    expect(parse('call the\ndentist').title).toBe('call the dentist');
  });
});

describe('captureParser — device date order', () => {
  test('an explicit preference is used verbatim', () => {
    expect(resolveDateOrder('DMY')).toBe('DMY');
    expect(resolveDateOrder('MDY')).toBe('MDY');
  });

  test('auto and undefined both fall back to detection, never throwing', () => {
    expect(['MDY', 'DMY']).toContain(resolveDateOrder('auto'));
    expect(['MDY', 'DMY']).toContain(resolveDateOrder(undefined));
  });
});

describe('captureParser — title extraction and robustness', () => {
  test('date and time are stripped out of the title', () => {
    expect(parse('Team sync 09/22/2026 10:00A').title).toBe('Team sync');
    expect(parse('09/22/2026 Team sync').title).toBe('Team sync');
  });

  test('trailing punctuation left behind is tidied', () => {
    expect(parse('Dentist - 22.09.2026').title).toBe('Dentist');
  });

  test('an impossible date is rejected rather than guessed', () => {
    // 31 February — must not silently roll into March.
    const r = parse('thing 02/31/2026');
    expect(r.kind).toBe('task');
    expect(r.date).toBeUndefined();
  });

  test('empty input does not throw', () => {
    const r = parse('');
    expect(r.kind).toBe('task');
    expect(r.title).toBe('');
  });

  test('two-digit years are read as this century', () => {
    expect(parse('thing 09/22/26').date?.getFullYear()).toBe(2026);
  });
});
