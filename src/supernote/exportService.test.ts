import { safeFileName } from './exportService';

// sn-plugin-lib resolves native modules at import time, which jest has none of.
jest.mock('sn-plugin-lib', () => ({
  FileUtils: { getExportPath: jest.fn().mockResolvedValue('/storage/emulated/0/Export') },
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
