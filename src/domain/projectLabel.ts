import { Project } from './types';

export const MAX_PROJECT_SHORT_LABEL_LENGTH = 16;

/**
 * Produces a useful compact default without requiring another field during
 * project creation. Course-style names such as "MGT120 Principles of
 * Management" naturally become "MGT120".
 */
export function deriveProjectShortLabel(name: string): string {
  const firstWord = name.trim().split(/\s+/)[0] || 'Project';
  return firstWord.slice(0, MAX_PROJECT_SHORT_LABEL_LENGTH);
}

/** Blank means "keep deriving it from the full name" rather than storing it. */
export function normalizeProjectShortLabel(label?: string): string | undefined {
  const normalized = label?.trim().replace(/\s+/g, ' ');
  return normalized
    ? normalized.slice(0, MAX_PROJECT_SHORT_LABEL_LENGTH).trimEnd()
    : undefined;
}

export function projectDisplayLabel(project: Pick<Project, 'name' | 'shortLabel'>): string {
  return normalizeProjectShortLabel(project.shortLabel) || deriveProjectShortLabel(project.name);
}
