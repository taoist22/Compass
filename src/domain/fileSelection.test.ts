import { firstPickedFilePath, parentFolderFromPicker } from './fileSelection';

describe('file picker result normalization', () => {
  test('accepts the SDK string-array result', () => {
    expect(parentFolderFromPicker(['/storage/emulated/0/Note/Recipes/Soup.pdf']))
      .toBe('/storage/emulated/0/Note/Recipes');
  });

  test('accepts object and direct-string results from firmware variants', () => {
    expect(parentFolderFromPicker([{ path: '/storage/emulated/0/Note/Recipes/Soup.pdf' }]))
      .toBe('/storage/emulated/0/Note/Recipes');
    expect(firstPickedFilePath('/storage/emulated/0/Note/Recipes/Soup.pdf'))
      .toBe('/storage/emulated/0/Note/Recipes/Soup.pdf');
  });

  test('normalizes a file URI before taking its parent', () => {
    expect(parentFolderFromPicker('file:///storage/emulated/0/Note/My%20Recipes/Soup.pdf'))
      .toBe('/storage/emulated/0/Note/My Recipes');
  });

  test('rejects empty and malformed results', () => {
    expect(firstPickedFilePath([])).toBeUndefined();
    expect(parentFolderFromPicker({ nope: true })).toBeUndefined();
  });
});
