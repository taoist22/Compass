import { normaliseFeedUrl } from './feedService';

export interface ImportedFeedDefinition {
  name: string;
  url: string;
}

export interface SetupFileResult {
  feeds: ImportedFeedDefinition[];
  invalidLines: number;
}

/**
 * Parses a setup text file without ever logging its contents. A feed may be a
 * bare URL or `Display Name|URL`; blank lines and # comments are ignored.
 */
export function parseCalendarSetupFile(content: string): SetupFileResult {
  const feeds: ImportedFeedDefinition[] = [];
  let invalidLines = 0;

  for (const rawLine of content.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separator = line.indexOf('|');
    const proposedName = separator >= 0 ? line.slice(0, separator).trim() : '';
    const proposedUrl = separator >= 0 ? line.slice(separator + 1).trim() : line;
    const url = normaliseFeedUrl(proposedUrl);
    if (!url) {
      invalidLines++;
      continue;
    }

    feeds.push({
      name: proposedName || `Calendar ${feeds.length + 1}`,
      url,
    });
  }

  return { feeds, invalidLines };
}

export function isIcsCalendarContent(content: string): boolean {
  return /BEGIN:VCALENDAR/i.test(content) && /BEGIN:(?:VEVENT|VTODO)/i.test(content);
}
