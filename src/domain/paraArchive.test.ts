import { areaArchiveState, projectArchiveState } from './paraArchive';

describe('PARA archive status', () => {
  test('archives a Project even when no folder move completed', () => {
    const project = {
      id: 'project', name: 'Launch', status: 'active' as const,
      folder: '/Note/Projects/Launch', createdAt: new Date(),
    };

    expect(projectArchiveState(project, 'archive')).toEqual(expect.objectContaining({
      status: 'archived',
      folder: '/Note/Projects/Launch',
    }));
  });

  test('archives an Area even when no folder move completed', () => {
    const area = {
      id: 'area', name: 'Work', folder: '/Note/Areas/Work', createdAt: new Date(),
    };

    expect(areaArchiveState(area, 'archive')).toEqual(expect.objectContaining({
      archived: true,
      folder: '/Note/Areas/Work',
    }));
  });

  test('records original and destination folders only after a successful move', () => {
    const project = {
      id: 'project', name: 'Launch', status: 'active' as const,
      folder: '/Note/Projects/Launch', createdAt: new Date(),
    };

    expect(projectArchiveState(project, 'archive', {
      source: '/Note/Projects/Launch',
      destination: '/Note/Archive/Projects/Launch',
    })).toEqual(expect.objectContaining({
      status: 'archived',
      folder: '/Note/Archive/Projects/Launch',
      archivedFromFolder: '/Note/Projects/Launch',
    }));
  });
});
