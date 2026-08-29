import { CalendarSettings } from './types';

export type ParaRootKind = 'projects' | 'areas' | 'resources' | 'archive';

export const PARA_ROOT_KINDS: ParaRootKind[] = ['projects', 'areas', 'resources', 'archive'];

export const DEFAULT_PARA_ROOTS: Record<ParaRootKind, string> = {
  projects: '/storage/emulated/0/Note/SNFolio/Projects',
  areas: '/storage/emulated/0/Note/SNFolio/Areas',
  resources: '/storage/emulated/0/Note/SNFolio/Resources',
  archive: '/storage/emulated/0/Note/SNFolio/Archive',
};

export const PARA_ROOT_SETTING: Record<ParaRootKind, keyof CalendarSettings> = {
  projects: 'projectsDirectory',
  areas: 'areasDirectory',
  resources: 'resourcesDirectory',
  archive: 'archiveDirectory',
};

export function normaliseFolderPath(path: string): string {
  const trimmed = path.trim();
  if (trimmed === '/') return trimmed;
  return trimmed.replace(/\/+$/, '');
}

export function paraRoot(settings: CalendarSettings, kind: ParaRootKind): string {
  const value = settings[PARA_ROOT_SETTING[kind]];
  return normaliseFolderPath(typeof value === 'string' && value ? value : DEFAULT_PARA_ROOTS[kind]);
}

export function safeFolderName(name: string): string {
  return name
    .replace(/[/\\?%*:|"<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'Untitled';
}

export function paraChildFolder(settings: CalendarSettings, kind: Exclude<ParaRootKind, 'archive'>, name: string): string {
  return `${paraRoot(settings, kind)}/${safeFolderName(name)}`;
}
