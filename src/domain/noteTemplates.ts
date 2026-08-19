import { NoteKind } from './types';

/**
 * Background templates for generated notes.
 *
 * The device ships 28 built-ins, reported by PluginCommAPI.getNoteSystemTemplates()
 * as `{ hUri, vUri, name }` — landscape resource, portrait resource, and a
 * canonical name. The plugin previously passed only file paths, so none of them
 * was ever reachable and every note fell back to a PNG.
 *
 * `name` is the identifier to use, and it cannot be derived from the resource
 * path: style_h_3_by_3_grid is named style_nine_palace_lattice, and
 * style_h_hand_drawn_diary is style_hand_sketch_diary. getNotePageTemplate
 * corroborates this — it reports a system template by name with `md5: 0`,
 * reserving the md5 for custom ones.
 */
export interface SystemTemplate {
  name: string;
  hUri?: string;
  vUri?: string;
}

/** 8mm ruled: the default for every note kind. */
export const DEFAULT_SYSTEM_TEMPLATE = 'style_8mm_ruled_line';

/**
 * True when a template setting names a built-in rather than pointing at a
 * custom PNG. Custom values are absolute paths, so the leading slash decides.
 */
export function isSystemTemplate(value: string): boolean {
  const trimmed = (value || '').trim();
  return trimmed.length > 0 && !trimmed.startsWith('/');
}

/**
 * Human label for a template value.
 *
 * Built-in names arrive as snake_case identifiers; a custom template shows its
 * filename, since the full path is far too long for a settings row.
 */
export function templateLabel(value: string): string {
  const trimmed = (value || '').trim();
  if (!trimmed) return 'Built-in default';

  if (!isSystemTemplate(trimmed)) {
    return trimmed.split('/').pop() || trimmed;
  }

  const words = trimmed
    .replace(/^style_/, '')
    .split('_')
    .filter(Boolean)
    .map(word => {
      // Measurements read better tight: "8mm" not "8 Mm".
      if (/^\d+mm$/i.test(word)) return word.toLowerCase();
      if (word.length <= 2) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    });

  return words.join(' ') || trimmed;
}

/** Settings key holding the template for a given note kind. */
export function templateSettingKey(kind: NoteKind): 'meetingTemplate' | 'classTemplate' | 'dailyNoteTemplate' {
  switch (kind) {
    case 'class':
      return 'classTemplate';
    case 'daily':
      return 'dailyNoteTemplate';
    default:
      return 'meetingTemplate';
  }
}

/**
 * The values to try when creating a note, best first.
 *
 * The SDK is ambiguous about what `createNote` wants: its type definition calls
 * the parameter a "Template path" while insertNotePage calls the same field a
 * "template name", and the published quick-reference says either is accepted.
 * A custom PNG is unambiguous, but a built-in is worth retrying as its portrait
 * resource URI if the bare name is rejected.
 */
export function templateCandidates(value: string, available: SystemTemplate[] = []): string[] {
  const trimmed = (value || '').trim();
  if (!trimmed) return [DEFAULT_SYSTEM_TEMPLATE];
  if (!isSystemTemplate(trimmed)) return [trimmed];

  const match = available.find(t => t.name === trimmed);
  const candidates = [trimmed];
  if (match?.vUri) candidates.push(match.vUri);
  return candidates;
}

/** Normalises whatever getNoteSystemTemplates returns into a usable list. */
export function parseSystemTemplates(raw: unknown): SystemTemplate[] {
  if (!Array.isArray(raw)) return [];

  const templates: SystemTemplate[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    if (!name) continue;
    templates.push({
      name,
      hUri: typeof record.hUri === 'string' ? record.hUri : undefined,
      vUri: typeof record.vUri === 'string' ? record.vUri : undefined,
    });
  }
  return templates;
}
