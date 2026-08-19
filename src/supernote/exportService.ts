import { NativeModules } from 'react-native';
import { FileUtils } from 'sn-plugin-lib';

type CalendarFileModule = {
  writeTextFile(path: string, content: string): Promise<string>;
  openNote(path: string, page: number): Promise<boolean>;
};

const CalendarFile = NativeModules.CalendarFile as CalendarFileModule | undefined;

/** Fallback if getExportPath is unavailable; the standard user-visible area. */
const FALLBACK_EXPORT_ROOT = '/storage/emulated/0/Export';

export interface ExportResult {
  success: boolean;
  /** Where the file actually landed, as reported by the native writer. */
  path?: string;
  message: string;
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
