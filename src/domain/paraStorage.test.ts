import { DEFAULT_PARA_ROOTS, normaliseFolderPath, paraChildFolder, paraRoot, safeFolderName } from './paraStorage';

const settings = {
  projectsDirectory: '/storage/ABCD/Notes/1 Projects/',
} as any;

describe('PARA storage helpers', () => {
  test('uses configured roots and preserves mounted-volume paths', () => {
    expect(paraRoot(settings, 'projects')).toBe('/storage/ABCD/Notes/1 Projects');
    expect(paraChildFolder(settings, 'projects', 'New / Project')).toBe('/storage/ABCD/Notes/1 Projects/New Project');
  });

  test('falls back without migrating existing users', () => {
    expect(paraRoot({} as any, 'areas')).toBe(DEFAULT_PARA_ROOTS.areas);
  });

  test('normalises paths and unsafe folder names', () => {
    expect(normaliseFolderPath('/storage/emulated/0///')).toBe('/storage/emulated/0');
    expect(normaliseFolderPath('/')).toBe('/');
    expect(safeFolderName('  A:*  B  ')).toBe('A B');
  });
});
