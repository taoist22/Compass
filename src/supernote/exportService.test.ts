import { NativeModules } from 'react-native';
import {
  listParaFolderEntries,
  listResourceFiles,
  listStorageRoots,
  moveParaFolder,
  openResourceFile,
  safeFileName,
} from './exportService';

// sn-plugin-lib resolves native modules at import time, which jest has none of.
jest.mock('sn-plugin-lib', () => ({
  PluginManager: {
    hasPermission: jest.fn().mockResolvedValue(1),
    requestPermission: jest.fn().mockResolvedValue(1),
  },
  FileUtils: {
    getExportPath: jest.fn().mockResolvedValue('/storage/emulated/0/Export'),
    listFiles: jest.fn().mockResolvedValue(null),
    openFilePath: jest.fn().mockResolvedValue(true),
    exists: jest.fn().mockResolvedValue(false),
    makeDir: jest.fn().mockResolvedValue(true),
    renameToFile: jest.fn().mockResolvedValue(true),
  },
}));


describe('safeFileName', () => {
  test('strips characters Android will not accept in a filename', () => {
    expect(safeFileName('Q3 Review: Plan/Budget?')).toBe('Q3 Review PlanBudget');
  });

  test('collapses whitespace and trims', () => {
    expect(safeFileName('  Team    Standup  ')).toBe('Team Standup');
  });

  test('never returns an empty name', () => {
    expect(safeFileName('')).toBe('export');
    expect(safeFileName('///')).toBe('export');
  });

  test('caps length so the path cannot overflow', () => {
    expect(safeFileName('x'.repeat(400)).length).toBeLessThanOrEqual(120);
  });
});

describe('listResourceFiles', () => {
  test('normalizes the object entries returned by the Android SDK', async () => {
    const { FileUtils } = require('sn-plugin-lib');
    FileUtils.listFiles.mockResolvedValueOnce([
      { path: '/storage/emulated/0/Note/Recipes/Soup.note', type: 1 },
      { path: '/storage/emulated/0/Note/Recipes/photo.png', type: 1 },
      { path: '/storage/emulated/0/Note/Recipes/Soup.mark', type: 1 },
      { path: '/storage/emulated/0/Note/Recipes/Banana Bread.note', type: 1 },
    ]);

    await expect(listResourceFiles('/storage/emulated/0/Note/Recipes')).resolves.toEqual([
      '/storage/emulated/0/Note/Recipes/Banana Bread.note',
      '/storage/emulated/0/Note/Recipes/photo.png',
      '/storage/emulated/0/Note/Recipes/Soup.note',
    ]);
    expect(NativeModules.CalendarFile.listNoteFiles).not.toHaveBeenCalled();
  });

  test('returns the native folder listing', async () => {
    NativeModules.CalendarFile.listNoteFiles.mockResolvedValueOnce([
      '/storage/emulated/0/Note/Recipes/Banana Bread.note',
      '/storage/emulated/0/Note/Recipes/Banana Bread.mark',
      '/storage/emulated/0/Note/Recipes/Soup.note',
    ]);

    await expect(listResourceFiles('/storage/emulated/0/Note/Recipes')).resolves.toEqual([
      '/storage/emulated/0/Note/Recipes/Banana Bread.note',
      '/storage/emulated/0/Note/Recipes/Soup.note',
    ]);
  });

  test('fails closed when the folder cannot be read', async () => {
    NativeModules.CalendarFile.listNoteFiles.mockRejectedValueOnce(new Error('denied'));
    await expect(listResourceFiles('/storage/emulated/0/Note/Recipes')).resolves.toEqual([]);
  });
});

describe('listParaFolderEntries', () => {
  test('keeps folders navigable, treats note packages as files, and hides mark sidecars', async () => {
    NativeModules.CalendarFile.listFolderEntries.mockResolvedValueOnce([
      { name: 'Desserts', path: '/storage/emulated/0/Note/Recipes/Desserts', isFolder: true },
      { name: 'Soup.note', path: '/storage/emulated/0/Note/Recipes/Soup.note', isFolder: false },
      { name: 'Soup.mark', path: '/storage/emulated/0/Note/Recipes/Soup.mark', isFolder: false },
      { name: 'Dinner.pdf', path: '/storage/emulated/0/Note/Recipes/Dinner.pdf', isFolder: false },
    ]);

    await expect(listParaFolderEntries('/storage/emulated/0/Note/Recipes')).resolves.toEqual([
      { name: 'Desserts', path: '/storage/emulated/0/Note/Recipes/Desserts', isFolder: true },
      { name: 'Dinner.pdf', path: '/storage/emulated/0/Note/Recipes/Dinner.pdf', isFolder: false },
      { name: 'Soup.note', path: '/storage/emulated/0/Note/Recipes/Soup.note', isFolder: false },
    ]);
  });
});

describe('listStorageRoots', () => {
  test('returns internal storage and detected SD-card roots without duplicates', async () => {
    NativeModules.CalendarFile.getStorageRoots.mockResolvedValueOnce([
      '/storage/emulated/0',
      '/storage/1234-ABCD',
    ]);
    await expect(listStorageRoots()).resolves.toEqual([
      '/storage/emulated/0',
      '/storage/1234-ABCD',
    ]);
  });
});

describe('moveParaFolder', () => {
  beforeEach(() => {
    const { FileUtils, PluginManager } = require('sn-plugin-lib');
    PluginManager.hasPermission.mockReset().mockResolvedValue(1);
    PluginManager.requestPermission.mockReset().mockResolvedValue(1);
    FileUtils.exists.mockReset();
    FileUtils.exists
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    FileUtils.makeDir.mockReset().mockResolvedValue(true);
    FileUtils.renameToFile.mockReset().mockResolvedValue(true);
  });

  test('returns the destination reported by the native same-storage move', async () => {
    const source = '/storage/emulated/0/Note/Projects/Acme';
    const destination = '/storage/emulated/0/Note/Archive/Projects/Acme';

    await expect(moveParaFolder(source, destination)).resolves.toEqual({
      success: true,
      path: destination,
      message: `Moved folder to ${destination}`,
    });
    const { FileUtils } = require('sn-plugin-lib');
    expect(FileUtils.renameToFile).toHaveBeenCalledWith(source, destination);
  });

  test('surfaces a native collision without pretending the move succeeded', async () => {
    const { FileUtils } = require('sn-plugin-lib');
    FileUtils.exists.mockReset().mockResolvedValueOnce(true).mockResolvedValueOnce(true);

    await expect(moveParaFolder('/storage/source', '/storage/destination')).resolves.toEqual({
      success: false,
      message: 'Archive destination already exists: /storage/destination',
    });
  });

  test('reports an ungranted delete permission before touching storage', async () => {
    const { PluginManager, FileUtils } = require('sn-plugin-lib');
    PluginManager.hasPermission.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    PluginManager.requestPermission.mockResolvedValueOnce(0);

    await expect(moveParaFolder('/storage/source', '/storage/destination')).resolves.toEqual({
      success: false,
      message: 'Folder moves need both File Write and File Delete permission.',
    });
    expect(FileUtils.renameToFile).not.toHaveBeenCalled();
  });
});

describe('openResourceFile', () => {
  beforeEach(() => {
    NativeModules.CalendarFile.openNote.mockClear();
    NativeModules.CalendarFile.openDocument.mockClear();
    const { FileUtils } = require('sn-plugin-lib');
    FileUtils.openFilePath.mockClear();
  });

  test('opens PDFs and other documents directly in the native document reader', async () => {
    const { FileUtils } = require('sn-plugin-lib');
    const result = await openResourceFile('/storage/emulated/0/Note/Recipes/Soup.pdf');
    expect(NativeModules.CalendarFile.openDocument).toHaveBeenCalledWith(
      '/storage/emulated/0/Note/Recipes/Soup.pdf',
    );
    expect(FileUtils.openFilePath).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  test('opens Supernote notebooks directly in the note editor', async () => {
    const result = await openResourceFile('/storage/emulated/0/Note/Recipes/Soup.note');
    expect(NativeModules.CalendarFile.openNote).toHaveBeenCalledWith(
      '/storage/emulated/0/Note/Recipes/Soup.note',
      0,
    );
    expect(NativeModules.CalendarFile.openDocument).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });
});
