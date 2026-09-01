import { CalendarSettings, NoteKind } from './types';
import { normaliseFolderPath, safeFolderName } from './paraStorage';

/**
 * Keeps a user-entered subpath relative and safe without reducing it to one
 * folder. Traversal and empty segments are discarded; each real segment uses
 * the same filename rules as PARA item folders.
 */
export function cleanRelativeNoteSubpath(value: string | undefined): string {
  return (value || '')
    .replace(/\\/g, '/')
    .split('/')
    .map(segment => segment.trim())
    .filter(segment => Boolean(segment) && segment !== '.' && segment !== '..')
    .map(safeFolderName)
    .join('/');
}

/** Project wins over Area. No container means the caller uses its normal fallback. */
export function paraEventNoteFolder(
  settings: CalendarSettings,
  kind: NoteKind,
  projectFolder?: string,
  areaFolder?: string
): string | undefined {
  if (kind === 'daily') return undefined;
  const base = projectFolder || areaFolder;
  if (!base) return undefined;
  const subpath = cleanRelativeNoteSubpath(
    kind === 'class' ? settings.classParaSubpath : settings.meetingParaSubpath
  );
  const root = normaliseFolderPath(base);
  return subpath ? `${root}/${subpath}` : root;
}

/** Applies the user's default policy; a per-note choice may call paraEventNoteFolder directly. */
export function routedEventNoteFolder(
  settings: CalendarSettings,
  kind: NoteKind,
  projectFolder?: string,
  areaFolder?: string
): string | undefined {
  if (!settings.routeEventNotesToPara) return undefined;
  return paraEventNoteFolder(settings, kind, projectFolder, areaFolder);
}
