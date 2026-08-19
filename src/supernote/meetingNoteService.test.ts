import { meetingNoteService } from './meetingNoteService';
import { CalendarEvent } from '../domain/types';
import { calendarStorage } from '../storage/calendarStorage';
import { PluginFileAPI, PluginNoteAPI, FileUtils } from 'sn-plugin-lib';

jest.mock('sn-plugin-lib', () => ({
  PluginFileAPI: {
    createNote: jest.fn().mockResolvedValue({ success: true }),
    getNoteTotalPageNum: jest.fn().mockResolvedValue({ success: false }),
    insertNotePage: jest.fn().mockResolvedValue({ success: true }),
    insertElements: jest.fn().mockResolvedValue({ success: true }),
    generateNoteTemplatePng: jest.fn().mockResolvedValue({ success: true }),
  },
  PluginNoteAPI: {
    insertText: jest.fn().mockResolvedValue({ success: true }),
  },
  PluginCommAPI: {
    createElement: jest.fn().mockResolvedValue({ success: true, data: { textBox: {} } }),
    getNoteSystemTemplates: jest.fn().mockResolvedValue([
      {
        name: 'style_8mm_ruled_line',
        hUri: 'android.resource://com.ratta.supernote.pluginhost/drawable/style_h_8mm_ruled_line',
        vUri: 'android.resource://com.ratta.supernote.pluginhost/drawable/style_8mm_ruled_line',
      },
    ]),
  },
  // listFiles is deliberately absent: it does not exist on the device, and
  // mocking it previously made a dead code path look tested.
  FileUtils: {
    makeDir: jest.fn().mockResolvedValue(true),
    openFilePath: jest.fn().mockResolvedValue(true),
  },
}));

describe('meetingNoteService', () => {
  const sampleEvent: CalendarEvent = {
    uid: 'evt-300',
    summary: 'Design Review',
    description: 'Review UI mockups',
    start: new Date('2026-08-16T15:00:00Z'),
    end: new Date('2026-08-16T16:00:00Z'),
    allDay: false,
    attendees: [{ name: 'Bob', email: 'bob@example.com' }],
  };

  test('creates a meeting note with the configured system template', async () => {
    (PluginFileAPI.createNote as jest.Mock).mockClear();
    await meetingNoteService.createOrAppendMeetingNote(sampleEvent);

    const [args] = (PluginFileAPI.createNote as jest.Mock).mock.calls[0];
    // The built-in name, not a PNG path — the whole point of the change.
    expect(args.template).toBe('style_8mm_ruled_line');
    expect(args.isPortrait).toBe(true);
  });

  test('falls back to the portrait resource URI when the name is rejected', async () => {
    // createNote is documented as taking a "path" while insertNotePage takes a
    // "name", so a rejected name must not leave the note uncreated.
    (PluginFileAPI.createNote as jest.Mock)
      .mockClear()
      .mockResolvedValueOnce({ success: false, error: { message: 'bad template' } })
      .mockResolvedValueOnce({ success: true });

    const res = await meetingNoteService.createOrAppendMeetingNote({ ...sampleEvent, uid: 'evt-301' });

    expect(res.success).toBe(true);
    const attempts = (PluginFileAPI.createNote as jest.Mock).mock.calls.map(c => c[0].template);
    expect(attempts[0]).toBe('style_8mm_ruled_line');
    expect(attempts[1]).toContain('drawable/style_8mm_ruled_line');
  });

  test('records what kind of note was created', async () => {
    (PluginFileAPI.createNote as jest.Mock).mockClear().mockResolvedValue({ success: true });
    await meetingNoteService.createOrAppendMeetingNote({ ...sampleEvent, uid: 'evt-302' });

    // themeMode defaults to business, so this is a meeting rather than a class.
    expect(calendarStorage.getMapping('evt-302')?.kind).toBe('meeting');
  });

  test('creates new meeting note file when notebook does not exist', async () => {
    const res = await meetingNoteService.createOrAppendMeetingNote(sampleEvent);
    expect(res.success).toBe(true);
    expect(res.isNewFile).toBe(true);
    expect(res.pageNum).toBe(1);
    expect(PluginFileAPI.createNote).toHaveBeenCalled();
    expect(PluginNoteAPI.insertText).toHaveBeenCalled();
  });

  test('appends page to existing recurring meeting notebook', async () => {
    (PluginFileAPI.getNoteTotalPageNum as jest.Mock).mockResolvedValueOnce({
      success: true,
      data: 3,
    });

    const recurringEvent: CalendarEvent = {
      ...sampleEvent,
      recurringSeriesId: 'series-400',
    };

    const res = await meetingNoteService.createOrAppendMeetingNote(recurringEvent);
    expect(res.success).toBe(true);
    expect(res.isNewFile).toBe(false);
    expect(res.pageNum).toBe(4);
    expect(PluginFileAPI.insertNotePage).toHaveBeenCalled();
  });
});
