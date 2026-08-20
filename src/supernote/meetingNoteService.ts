import { FileUtils, PluginCommAPI, PluginFileAPI, PluginNoteAPI } from 'sn-plugin-lib';
import { CalendarEvent, CalendarSettings, EventType, MeetingSnapshot, NoteKind } from '../domain/types';
import { createMeetingSnapshot, generateNoteFilename } from '../domain/meetingSnapshot';
import {
  DEFAULT_SYSTEM_TEMPLATE,
  resolveNoteDestination,
  parseSystemTemplates,
  SystemTemplate,
  templateCandidates,
} from '../domain/noteTemplates';
import { calendarStorage } from '../storage/calendarStorage';

export interface MeetingNoteResult {
  success: boolean;
  notePath: string;
  pageNum: number;
  isNewFile: boolean;
  error?: string;
}

export class MeetingNoteService {
  async ensureDirectory(dirPath: string): Promise<boolean> {
    try {
      if (FileUtils.makeDir) {
        await FileUtils.makeDir(dirPath);
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Templates the device offers, fetched once and reused.
   *
   * Only needed to resolve a built-in's portrait URI if createNote rejects the
   * bare name, so a failure here is not fatal — the name is tried regardless.
   */
  private systemTemplates: SystemTemplate[] | null = null;

  async getSystemTemplates(): Promise<SystemTemplate[]> {
    if (this.systemTemplates) return this.systemTemplates;
    try {
      const raw = await PluginCommAPI.getNoteSystemTemplates();
      this.systemTemplates = parseSystemTemplates(raw);
    } catch (e) {
      this.systemTemplates = [];
    }
    return this.systemTemplates;
  }

  /**
   * Creates a note, trying each candidate template in turn.
   *
   * Previously this resolved a PNG path through two strategies that both called
   * FileUtils.listFiles — unavailable on device — so both silently skipped and
   * every note fell through to a hardcoded PNG that may not even exist. The
   * built-in templates were reachable all along via their name.
   */
  private async createNoteWithTemplate(
    notePath: string,
    templateValue: string,
    isPortrait = true
  ): Promise<{ success: boolean; usedTemplate?: string; error?: string }> {
    const candidates = templateCandidates(templateValue, await this.getSystemTemplates());
    let lastError = 'createNote failed';

    for (const candidate of candidates) {
      try {
        const res: any = await PluginFileAPI.createNote({
          notePath,
          template: candidate,
          mode: 0,
          isPortrait,
        });
        if (res && res.success) {
          return { success: true, usedTemplate: candidate };
        }
        lastError = res?.error?.message || lastError;
      } catch (e: any) {
        lastError = e?.message || lastError;
      }
    }

    return { success: false, error: lastError };
  }

  /**
   * Creates the day's journal note and opens it. Used by the Day View's Daily
   * Note action when exists() reports the file is not already there.
   */
  async createDailyNote(
    notePath: string,
    settings: CalendarSettings
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // A journal page wants its own background, not the meeting-note one.
      const createRes = await this.createNoteWithTemplate(
        notePath,
        settings.dailyNoteTemplate || DEFAULT_SYSTEM_TEMPLATE
      );

      if (!createRes.success) {
        return { success: false, error: createRes.error };
      }

      // openFilePath only reaches the file manager; the caller opens the note
      // through the native activity intent instead.
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'unknown error' };
    }
  }

  /**
   * @param kind What this note is. Passed in rather than derived from a global
   *   mode, so a class note stays a class note whatever the settings say later.
   */
  /**
   * Creates a project's own notebook.
   *
   * A project that holds only tasks is a to-do list with a name; the notebook
   * is what makes it the container it is meant to be. Filed in the project's
   * folder with its template when it has them, which is what finally makes
   * those two fields mean something.
   */
  async createProjectNote(
    projectName: string,
    folder: string,
    template: string
  ): Promise<{ success: boolean; notePath?: string; error?: string }> {
    const dir = folder || '/storage/emulated/0/Note';
    await this.ensureDirectory(dir);

    const safe = projectName.replace(/[/\\?%*:|"<>]/g, '').replace(/\s+/g, ' ').trim() || 'Project';
    const notePath = `${dir}/${safe}.note`;

    const res = await this.createNoteWithTemplate(notePath, template || DEFAULT_SYSTEM_TEMPLATE);
    return res.success ? { success: true, notePath } : { success: false, error: res.error };
  }

  async createOrAppendMeetingNote(
    event: CalendarEvent,
    forceNewFile = false,
    kind: NoteKind = 'meeting',
    /** The event's type, when it has one; its folder and template win. */
    eventType?: EventType
  ): Promise<MeetingNoteResult> {
    const settings = calendarStorage.getSettings();
    // An event type answers both questions, so a typed event needs no prompt.
    // Falls back to the per-kind settings when it has no type, or when its type
    // has no preference of its own.
    const destination = resolveNoteDestination(eventType, {
      folder:
        (kind === 'class'
          ? settings.classNotesDirectory || settings.notesDirectory
          : settings.notesDirectory) || '/storage/emulated/0/Note/Meetings',
      template:
        (kind === 'class' ? settings.classTemplate : settings.meetingTemplate) ||
        DEFAULT_SYSTEM_TEMPLATE,
    });

    const targetDir = destination.folder;
    await this.ensureDirectory(targetDir);

    const templateValue = destination.template;

    const isRecurringSeries = Boolean(event.recurringSeriesId && !forceNewFile);
    const filename = generateNoteFilename(event, isRecurringSeries, settings.seriesNotebookPrefix, kind);
    const notePath = `${targetDir}/${filename}`;

    // Both of these previously omitted the mode entirely and silently fell back
    // to business wording, so a class note got meeting headings inside it.
    const snapshot: MeetingSnapshot = createMeetingSnapshot(event, kind);

    try {
      let pageNum = 1;
      let isNewFile = false;

      // Check total page num to see if notebook exists
      const totalPagesRes: any = await PluginFileAPI.getNoteTotalPageNum(notePath);

      if (totalPagesRes && totalPagesRes.success && typeof totalPagesRes.data === 'number' && totalPagesRes.data > 0) {
        // File exists -> Append page to existing series notebook
        const lastPage = totalPagesRes.data;
        // insertNotePage documents its template as a name, so the configured
        // value goes straight through; a custom PNG path is passed as-is too.
        const insertRes: any = await PluginFileAPI.insertNotePage({
          notePath,
          page: lastPage,
          template: templateValue,
        });

        if (insertRes && insertRes.success) {
          pageNum = lastPage + 1;
        } else {
          pageNum = lastPage;
        }
      } else {
        // File does not exist -> Create new note file
        isNewFile = true;
        const createRes = await this.createNoteWithTemplate(notePath, templateValue);

        if (!createRes.success) {
          return {
            success: false,
            notePath,
            pageNum: 1,
            isNewFile: true,
            error: createRes.error || `Failed to create note file using template ${templateValue}.`,
          };
        }
        pageNum = 1;
      }

      // Insert snapshot header as text box element
      const textRect = {
        x: 60,
        y: 60,
        width: 1200,
        height: 800,
      };

      try {
        await PluginNoteAPI.insertText({
          textContentFull: snapshot.formattedHeaderText,
          textRect,
          fontSize: 20,
          textAlign: 0,
          textFrameWidthType: 0,
          textFrameStyle: 0,
          textEditable: 0,
        });
      } catch (err) {
        // Fallback to createElement if insertText fails
        const elRes: any = await PluginCommAPI.createElement(500);
        if (elRes && elRes.success && elRes.data) {
          const el = elRes.data;
          if (el.textBox) {
            el.textBox.textContentFull = snapshot.formattedHeaderText;
            el.textBox.textRect = textRect;
            await PluginFileAPI.insertElements(notePath, pageNum, [el]);
          }
        }
      }

      // Record mapping
      calendarStorage.setMapping({
        eventUid: event.uid,
        // Recorded now because themeMode may change later, and the grid badge
        // and per-type templates both need to know what this note was.
        kind,
        seriesId: event.recurringSeriesId || event.uid,
        notePath,
        lastPageNum: pageNum,
        lastCreatedIso: new Date().toISOString(),
      });

      // Opening is the caller's job. openFilePath only reaches the file
      // manager, which is what made a successful creation look like nothing
      // had happened; the screen opens the note through the native intent
      // instead, exactly as daily notes already do.

      return {
        success: true,
        notePath,
        pageNum,
        isNewFile,
      };
    } catch (err: any) {
      return {
        success: false,
        notePath,
        pageNum: 1,
        isNewFile: false,
        error: err?.message || 'Unexpected error creating meeting note.',
      };
    }
  }
}

export const meetingNoteService = new MeetingNoteService();
