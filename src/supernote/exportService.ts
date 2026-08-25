import { NativeModules } from 'react-native';
import { FileUtils } from 'sn-plugin-lib';
import { ensureFileReadPermission, ensureFileWritePermission } from './pluginPermissions';

type CalendarFileModule = {
  writeTextFile(path: string, content: string): Promise<string>;
  openNote(path: string, page: number): Promise<boolean>;
  openDocument(path: string): Promise<boolean>;
  listNoteFiles(path: string): Promise<string[]>;
  listFolderEntries(path: string): Promise<ParaFolderEntry[]>;
};

const CalendarFile = NativeModules.CalendarFile as CalendarFileModule | undefined;

function isVisibleResourcePath(path: unknown): path is string {
  if (typeof path !== 'string') return false;
  const name = path.split('/').pop() || '';
  return Boolean(name) && !name.startsWith('.') && !name.toLowerCase().endsWith('.mark');
}

/** Fallback if getExportPath is unavailable; the standard user-visible area. */
const FALLBACK_EXPORT_ROOT = '/storage/emulated/0/Export';

export interface ExportResult {
  success: boolean;
  /** Where the file actually landed, as reported by the native writer. */
  path?: string;
  message: string;
}

export interface ParaFolderEntry {
  name: string;
  path: string;
  isFolder: boolean;
}

/** One navigable level of a PARA folder, including subfolders and files. */
export async function listParaFolderEntries(folder: string): Promise<ParaFolderEntry[]> {
  if (!(await ensureFileReadPermission())) {
    throw new Error('File access was not allowed. Grant file access to browse PARA folders.');
  }

  if (CalendarFile?.listFolderEntries) {
    try {
      const entries = await CalendarFile.listFolderEntries(folder);
      return Array.isArray(entries)
        ? entries
            .filter(entry => entry && isVisibleResourcePath(entry.path))
            .sort((a, b) => Number(b.isFolder) - Number(a.isFolder) || a.name.localeCompare(b.name))
        : [];
    } catch (e) {
      // Fall through to the public SDK for older native builds.
    }
  }

  try {
    const raw: any = await FileUtils.listFiles(folder);
    if (!Array.isArray(raw)) return [];
    return raw
      .map((entry: any): ParaFolderEntry | undefined => {
        const path = typeof entry === 'string' ? entry : entry?.path;
        if (!isVisibleResourcePath(path)) return undefined;
        const name = path.split('/').pop() || path;
        return {
          name,
          path,
          isFolder: typeof entry !== 'string' && entry?.type === 0 && !name.toLowerCase().endsWith('.note'),
        };
      })
      .filter((entry: ParaFolderEntry | undefined): entry is ParaFolderEntry => Boolean(entry))
      .sort((a, b) => Number(b.isFolder) - Number(a.isFolder) || a.name.localeCompare(b.name));
  } catch (e) {
    return [];
  }
}

/**
 * Opens a note in the editor.
 *
 * FileUtils.openFilePath() only reaches the file manager — it navigates to the
 * containing folder without opening anything, which is why "Open Note" has
 * been dropping users into a file list. The native module launches the note
 * activity directly instead.
 */
export async function openNoteInEditor(path: string, page = 0): Promise<ExportResult> {
  if (!(await ensureFileReadPermission())) {
    return { success: false, path, message: 'File access was not allowed.' };
  }
  if (!CalendarFile?.openNote) {
    return { success: false, message: 'Cannot open notes — this build is missing its native module.' };
  }
  try {
    await CalendarFile.openNote(path, page);
    return { success: true, path, message: `Opened ${path.split('/').pop()}` };
  } catch (e: any) {
    return { success: false, message: `Could not open note: ${e?.message || 'open failed'}` };
  }
}

export async function listResourceFiles(folder: string): Promise<string[]> {
  if (!(await ensureFileReadPermission())) {
    throw new Error('File access was not allowed. Grant file access to browse Resources.');
  }

  // The SDK declaration claims string[], but its Android implementation sends
  // [{ path, type }]. Accept both so this works across plugin-lib versions.
  try {
    const raw: any = await FileUtils.listFiles(folder);
    if (Array.isArray(raw)) {
      const sdkPaths = raw
        .filter(entry => typeof entry === 'string' || entry?.type !== 0 || entry?.path?.toLowerCase().endsWith('.note'))
        .map(entry => (typeof entry === 'string' ? entry : entry?.path))
        .filter(isVisibleResourcePath)
        .sort((a, b) => a.localeCompare(b));
      if (sdkPaths.length > 0) return sdkPaths;
    }
  } catch (e) {
    // Older firmware can reject the public list call; use our narrow native
    // .note-only reader below.
  }

  if (CalendarFile?.listNoteFiles) {
    try {
      const paths = await CalendarFile.listNoteFiles(folder);
      return Array.isArray(paths)
        ? paths
            .filter(isVisibleResourcePath)
            .sort((a, b) => a.localeCompare(b))
        : [];
    } catch (e) {
      return [];
    }
  }
  return [];
}

export async function openResourceFile(path: string): Promise<ExportResult> {
  if (!(await ensureFileReadPermission())) {
    return { success: false, path, message: 'File access was not allowed.' };
  }
  if (path.toLowerCase().endsWith('.note')) return openNoteInEditor(path);
  if (!CalendarFile?.openDocument) {
    return { success: false, path, message: 'Cannot open documents — this build is missing its native module.' };
  }
  try {
    await CalendarFile.openDocument(path);
    return { success: true, path, message: `Opened ${path.split('/').pop()}` };
  } catch (e: any) {
    return { success: false, path, message: `Could not open file: ${e?.message || 'open failed'}` };
  }
}

/** Strips characters that are illegal in Android filenames. */
export function safeFileName(name: string): string {
  return (name || 'export')
    .replace(/[/\\?%*:|"<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'export';
}

async function exportRoot(): Promise<string> {
  try {
    const base = await FileUtils.getExportPath();
    if (typeof base === 'string' && base) return `${base}/sn-calendar`;
  } catch (e) {
    // getExportPath is not guaranteed; fall through.
  }
  return `${FALLBACK_EXPORT_ROOT}/sn-calendar`;
}

/**
 * Writes text to the user-visible export area.
 *
 * The export area rather than the plugin sandbox, so files survive a plugin
 * reinstall and can be pulled off the device over Browse & Access — the same
 * reasoning as the ink-capture destination.
 */
export async function writeExport(fileName: string, content: string): Promise<ExportResult> {
  if (!(await ensureFileWritePermission())) {
    return { success: false, message: 'File access was not allowed.' };
  }
  if (!CalendarFile?.writeTextFile) {
    return {
      success: false,
      message: 'File writing is unavailable — this build is missing its native module.',
    };
  }

  try {
    const dir = await exportRoot();
    const path = `${dir}/${safeFileName(fileName)}`;
    const written = await CalendarFile.writeTextFile(path, content);
    return { success: true, path: written, message: `Exported to ${written}` };
  } catch (e: any) {
    return { success: false, message: `Export failed: ${e?.message || 'write error'}` };
  }
}
