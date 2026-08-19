import { dailyNotePath, formatDailyNoteName, looksMangled,
  dateKey,
} from './dailyNote';

const D = new Date(2026, 2, 5); // Thu 5 Mar 2026 — single-digit day and month

describe('formatDailyNoteName', () => {
  test('expands the common ISO pattern', () => {
    expect(formatDailyNoteName('YYYY-MM-DD', D)).toBe('2026-03-05');
  });

  test('literal text in brackets is protected from token substitution', () => {
    // "Daily" contains D — without escaping it becomes "5aily".
    expect(formatDailyNoteName('[Daily Log] YYYY-MM-DD', D)).toBe('Daily Log 2026-03-05');
    expect(formatDailyNoteName('YYYY-MM-DD [Journal]', D)).toBe('2026-03-05 Journal');
  });

  test('separators and punctuation outside brackets pass through', () => {
    expect(formatDailyNoteName('YYYY/MM/DD', D)).toBe('2026/03/05');
    expect(formatDailyNoteName('YYYY.MM.DD', D)).toBe('2026.03.05');
  });

  test('a month name is not re-substituted by later tokens', () => {
    // "March" contains both M and D; a naive sequential replace corrupts it.
    expect(formatDailyNoteName('MMMM D, YYYY', D)).toBe('March 5, 2026');
    expect(formatDailyNoteName('MMM DD', D)).toBe('Mar 05');
  });

  test('padded and unpadded forms differ correctly', () => {
    expect(formatDailyNoteName('D-M-YYYY', D)).toBe('5-3-2026');
    expect(formatDailyNoteName('DD-MM-YYYY', D)).toBe('05-03-2026');
  });

  test('weekday tokens work', () => {
    expect(formatDailyNoteName('dddd', D)).toBe('Thursday');
    expect(formatDailyNoteName('ddd DD', D)).toBe('Thu 05');
  });

  test('two-digit year', () => {
    expect(formatDailyNoteName('YY-MM-DD', D)).toBe('26-03-05');
  });

  test('an empty pattern falls back rather than producing an empty name', () => {
    expect(formatDailyNoteName('', D)).toBe('2026-03-05');
  });
});

describe('looksMangled', () => {
  test('flags a word eaten by token substitution', () => {
    // "Daily" starts with D, so it becomes "5aily" on the 5th.
    expect(looksMangled(formatDailyNoteName('Daily YYYY-MM-DD', D))).toBe(true);
    expect(looksMangled(formatDailyNoteName('Diary YYYY-MM-DD', D))).toBe(true);
    expect(looksMangled(formatDailyNoteName('Memo YYYY-MM-DD', D))).toBe(true);
  });

  test('a word with no token letters survives unbracketed', () => {
    // "Journal" contains no D, M, Y or d — nothing to substitute.
    expect(formatDailyNoteName('Journal YYYY-MM-DD', D)).toBe('Journal 2026-03-05');
    expect(looksMangled(formatDailyNoteName('Journal YYYY-MM-DD', D))).toBe(false);
  });

  test('does not flag correctly bracketed patterns', () => {
    expect(looksMangled(formatDailyNoteName('[Daily] YYYY-MM-DD', D))).toBe(false);
    expect(looksMangled(formatDailyNoteName('YYYY-MM-DD', D))).toBe(false);
    expect(looksMangled(formatDailyNoteName('MMM D YYYY', D))).toBe(false);
  });
});

describe('dailyNotePath', () => {
  test('joins folder and name with the .note extension', () => {
    expect(dailyNotePath('/storage/emulated/0/Note/Daily Notes', 'YYYY-MM-DD', D)).toBe(
      '/storage/emulated/0/Note/Daily Notes/2026-03-05.note'
    );
  });

  test('a trailing slash on the folder does not double up', () => {
    expect(dailyNotePath('/Note/Daily/', 'YYYY-MM-DD', D)).toBe('/Note/Daily/2026-03-05.note');
  });
});

describe('dateKey', () => {
  test('formats a local date as YYYY-MM-DD', () => {
    expect(dateKey(new Date(2026, 7, 18))).toBe('2026-08-18');
    expect(dateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  test('uses the local date, not the UTC one', () => {
    // Late evening local time is already tomorrow in UTC west of Greenwich;
    // the key must still name the day the user is looking at.
    const lateEvening = new Date(2026, 7, 18, 23, 30);
    expect(dateKey(lateEvening)).toBe('2026-08-18');
  });

  test('is stable across a day boundary in either direction', () => {
    expect(dateKey(new Date(2026, 7, 18, 0, 1))).toBe('2026-08-18');
    expect(dateKey(new Date(2026, 7, 18, 23, 59))).toBe('2026-08-18');
  });
});
