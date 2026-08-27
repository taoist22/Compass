import {
  deriveProjectShortLabel,
  normalizeProjectShortLabel,
  projectDisplayLabel,
} from './projectLabel';

describe('project short labels', () => {
  it('derives a course code from the first word of a project name', () => {
    expect(deriveProjectShortLabel('MGT120 Principles of Management')).toBe('MGT120');
  });

  it('uses an explicit short label when provided', () => {
    expect(projectDisplayLabel({ name: 'Principles of Management', shortLabel: 'MGT 120' })).toBe(
      'MGT 120'
    );
  });

  it('falls back to the derived label when the override is blank', () => {
    expect(projectDisplayLabel({ name: 'Website Redesign', shortLabel: '   ' })).toBe('Website');
  });

  it('normalizes and bounds labels for compact task rows', () => {
    expect(normalizeProjectShortLabel('  Fall   Management Coursework  ')).toBe('Fall Management');
  });
});
