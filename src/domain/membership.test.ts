import { areaIsDerived, resolveArea, resolveAreaId } from './membership';
import { Area, EventType, Project } from './types';

const HOUSE: Area = { id: 'area-house', name: 'House', createdAt: new Date() };
const WORK: Area = { id: 'area-work', name: 'Work', createdAt: new Date() };
const AREAS = [HOUSE, WORK];

const PROJECTS: Project[] = [
  { id: 'proj-house', name: 'House', areaId: HOUSE.id, status: 'active', createdAt: new Date() },
  { id: 'proj-loose', name: 'Thailand Move', status: 'active', createdAt: new Date() },
];

const TYPES: EventType[] = [
  { id: 'type-class', name: 'Class', defaultAreaId: WORK.id, createdAt: new Date() },
  { id: 'type-bare', name: 'Errand', createdAt: new Date() },
];

describe('resolveAreaId', () => {
  test('a project decides the area outright', () => {
    expect(resolveAreaId({ projectId: 'proj-house' }, PROJECTS, TYPES)).toBe(HOUSE.id);
  });

  test('a project overrules an area stored alongside it', () => {
    // The contradiction this whole rule exists to make unrepresentable: filed
    // in the House project but recorded under Work.
    expect(
      resolveAreaId({ projectId: 'proj-house', areaId: WORK.id }, PROJECTS, TYPES)
    ).toBe(HOUSE.id);
  });

  test('a project with no area leaves the item unfiled', () => {
    // Being in a project is the stronger statement, so it does not fall
    // through to a stale stored area.
    expect(resolveAreaId({ projectId: 'proj-loose', areaId: WORK.id }, PROJECTS, TYPES)).toBeUndefined();
  });

  test('a deleted project falls through rather than stranding the item', () => {
    expect(resolveAreaId({ projectId: 'gone', areaId: WORK.id }, PROJECTS, TYPES)).toBe(WORK.id);
  });

  test("an event's area comes from its type", () => {
    expect(resolveAreaId({ typeId: 'type-class' }, PROJECTS, TYPES)).toBe(WORK.id);
  });

  test('a retagged event follows its new type instead of staying frozen', () => {
    // The old code wrote the type's area into the record and then guarded it
    // with `existingArea ||`, so the first type an event was given decided its
    // area permanently. Reading through the type undoes that.
    expect(resolveAreaId({ typeId: 'type-class', areaId: HOUSE.id }, PROJECTS, TYPES)).toBe(WORK.id);
  });

  test('a type with no default area files nothing', () => {
    expect(resolveAreaId({ typeId: 'type-bare' }, PROJECTS, TYPES)).toBeUndefined();
  });

  test('a task with no project keeps the area it was given', () => {
    // Tasks carry no type, so a directly chosen area is the whole answer.
    expect(resolveAreaId({ areaId: HOUSE.id }, PROJECTS, TYPES)).toBe(HOUSE.id);
  });

  test('an unfiled item resolves to nothing', () => {
    expect(resolveAreaId({}, PROJECTS, TYPES)).toBeUndefined();
    expect(resolveAreaId(undefined, PROJECTS, TYPES)).toBeUndefined();
  });
});

describe('areaIsDerived', () => {
  test('true once a real project is chosen', () => {
    expect(areaIsDerived({ projectId: 'proj-house' }, PROJECTS)).toBe(true);
    // A project with no area still decides: the answer is "unfiled".
    expect(areaIsDerived({ projectId: 'proj-loose' }, PROJECTS)).toBe(true);
  });

  test('false with no project, or one that no longer exists', () => {
    expect(areaIsDerived({ areaId: HOUSE.id }, PROJECTS)).toBe(false);
    expect(areaIsDerived({ projectId: 'gone' }, PROJECTS)).toBe(false);
  });
});

describe('resolveArea', () => {
  test('returns the area itself for labelling', () => {
    expect(resolveArea({ projectId: 'proj-house' }, PROJECTS, AREAS, TYPES)?.name).toBe('House');
  });

  test('an area that has since been deleted is not invented', () => {
    expect(resolveArea({ areaId: 'area-gone' }, PROJECTS, AREAS, TYPES)).toBeUndefined();
  });
});
