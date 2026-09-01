import { Area, Project } from './types';

export interface ParaFolderTransition {
  source: string;
  destination: string;
}

/** Status changes are independent of whether an optional folder move succeeds. */
export function projectArchiveState(
  project: Project,
  mode: 'archive' | 'restore',
  move?: ParaFolderTransition
): Project {
  if (mode === 'restore') {
    return {
      ...project,
      status: 'active',
      completedAt: undefined,
      folder: move?.destination || project.folder,
      archivedFromFolder: undefined,
    };
  }
  return {
    ...project,
    status: 'archived',
    folder: move?.destination || project.folder,
    archivedFromFolder: move?.source || project.archivedFromFolder,
  };
}

export function areaArchiveState(
  area: Area,
  mode: 'archive' | 'restore',
  move?: ParaFolderTransition
): Area {
  return {
    ...area,
    archived: mode === 'archive',
    folder: move?.destination || area.folder,
    archivedFromFolder: mode === 'archive'
      ? move?.source || area.archivedFromFolder
      : undefined,
  };
}
