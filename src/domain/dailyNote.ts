/**
 * Daily-note filename formatting.
 *
 * Everyone's journal is named differently, and the plugin cannot search a
 * folder to find today's file — FileUtils.listFiles is unavailable in the
 * plugin runtime, only exists(). So the name has to be *computed* from a
 * user-supplied pattern and matched exactly, the way Obsidian's daily notes
 * work. Get the pattern wrong and the plugin creates a duplicate beside the
 * user's real journal instead of opening it.
 */

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const pad = (n: number) => String(n).padStart(2, '0');

/** Patterns offered in settings; the user can also type their own. */
export const DAILY_NOTE_PRESETS = [
  'YYYY-MM-DD',
  'YYYY-MM-DD Daily',
  'DD-MM-YYYY',
  'MM-DD-YYYY',
  'MMM D YYYY',
  'YYYY_MM_DD',
];

/**
 * Expands date tokens in a pattern. Anything that is not a token passes
 * through, so "Daily Log YYYY-MM-DD" works as written.
 *
 * Substitution goes via numbered placeholders because a replacement value can
 * itself contain token letters — "March" holds both M and D — and a naive
 * sequential replace would corrupt it.
 */
export function formatDailyNoteName(pattern: string, date: Date): string {
  const replacements: Array<[string, string]> = [
    ['YYYY', String(date.getFullYear())],
    ['YY', String(date.getFullYear()).slice(-2)],
    ['MMMM', MONTHS_LONG[date.getMonth()]],
    ['MMM', MONTHS_LONG[date.getMonth()].slice(0, 3)],
    ['MM', pad(date.getMonth() + 1)],
    ['dddd', DAYS_LONG[date.getDay()]],
    ['ddd', DAYS_LONG[date.getDay()].slice(0, 3)],
    ['DD', pad(date.getDate())],
    ['M', String(date.getMonth() + 1)],
    ['D', String(date.getDate())],
  ];

  let out = pattern || 'YYYY-MM-DD';
  const stash: string[] = [];

  // Literal text in [square brackets] is protected first, matching Obsidian
  // and moment.js. Without it a pattern like "Daily Log YYYY-MM-DD" breaks,
  // because the D of "Daily" is itself a token.
  out = out.replace(/\[([^\]]*)\]/g, (_m, literal) => {
    stash.push(literal);
    return '\u0000' + (stash.length - 1) + '\u0000';
  });

  for (const [token, value] of replacements) {
    while (out.includes(token)) {
      out = out.replace(token, '\u0000' + stash.length + '\u0000');
      stash.push(value);
    }
  }

  return out.replace(/\u0000(\d+)\u0000/g, (_m, i) => stash[Number(i)]);
}

/**
 * True when a formatted name looks like a word was eaten by token
 * substitution — "Daily" becoming "17aily". The signature is a digit sitting
 * directly against letters, which no legitimate pattern produces.
 */
export function looksMangled(formatted: string): boolean {
  return /\d[A-Za-z]{2,}/.test(formatted);
}

/** Full path for a day's note, given the configured folder and pattern. */
export function dailyNotePath(folder: string, pattern: string, date: Date): string {
  const clean = (folder || '').replace(/\/+$/, '');
  return clean + '/' + formatDailyNoteName(pattern, date) + '.note';
}

/**
 * Local-date key, YYYY-MM-DD.
 *
 * toISOString() would convert to UTC first, which shifts the date by a day for
 * anyone west of Greenwich for part of every day — the Manta's Honolulu clock
 * being ten hours out makes that a certainty rather than an edge case.
 */
export function dateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
