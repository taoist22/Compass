/** Extracts the first usable path across the picker shapes seen on firmware versions. */
export function firstPickedFilePath(result: unknown): string | undefined {
  const first = Array.isArray(result) ? result[0] : result;
  const raw = typeof first === 'string'
    ? first
    : first && typeof first === 'object'
      ? (first as any).path || (first as any).uri || (first as any).filePath
      : undefined;

  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('file://')) return trimmed;

  try {
    return decodeURIComponent(trimmed.slice('file://'.length));
  } catch (e) {
    return trimmed.slice('file://'.length);
  }
}

/** Folder containing the file selected as a stand-in for folder selection. */
export function parentFolderFromPicker(result: unknown): string | undefined {
  const path = firstPickedFilePath(result)?.replace(/\/+$/, '');
  if (!path) return undefined;
  const slash = path.lastIndexOf('/');
  return slash > 0 ? path.slice(0, slash) : undefined;
}
