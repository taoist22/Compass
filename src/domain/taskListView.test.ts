import {
  countGrouped,
  filterByScope,
  groupTasks,
  groupingLabel,
  scopeLabel,
} from './taskListView';
import { withStatus } from './taskModel';
import { CalendarTask } from './types';

const NOW = new Date(2026, 7, 19, 10, 0);
const day = (offset: number) => new Date(2026, 7, 19 + offset);

function makeTask(uid: string, over: Partial<CalendarTask> = {}): CalendarTask {
  return {
    uid,
    title: uid,
    completed: false,
    createdAt: new Date(2026, 7, 1),
    ...over,
  };
}

describe('filterByScope', () => {
  const overdue = makeTask('overdue', { dueDate: day(-3) });
  const today = makeTask('today', { dueDate: day(0) });
  const soon = makeTask('soon', { dueDate: day(4) });
  const undated = makeTask('undated');
  const finished = withStatus(makeTask('finished', { dueDate: day(-1) }), 'done');
  const all = [overdue, today, soon, undated, finished];

  test('open excludes finished work', () => {
    expect(filterByScope(all, 'open', NOW).map(t => t.uid)).toEqual([
      'overdue',
      'today',
      'soon',
      'undated',
    ]);
  });

  test('open keeps undated tasks', () => {
    // They are the easiest to forget; a list that hides them is how a No Date
    // pile grows unnoticed.
    expect(filterByScope(all, 'open', NOW).map(t => t.uid)).toContain('undated');
  });

  test('today includes overdue work', () => {
    // Something you should have done yesterday is part of today's problem.
    expect(filterByScope(all, 'today', NOW).map(t => t.uid)).toEqual(['overdue', 'today']);
  });

  test('today excludes undated tasks', () => {
    expect(filterByScope(all, 'today', NOW).map(t => t.uid)).not.toContain('undated');
  });

  test('upcoming is strictly after today', () => {
    expect(filterByScope(all, 'upcoming', NOW).map(t => t.uid)).toEqual(['soon']);
  });

  test('done shows only finished work', () => {
    expect(filterByScope(all, 'done', NOW).map(t => t.uid)).toEqual(['finished']);
  });

  test('all returns everything untouched', () => {
    expect(filterByScope(all, 'all', NOW)).toHaveLength(5);
  });

  test('an empty list stays empty in every scope', () => {
    for (const scope of ['open', 'today', 'upcoming', 'done', 'all'] as const) {
      expect(filterByScope([], scope, NOW)).toEqual([]);
    }
  });
});

describe('groupTasks', () => {
  test('flat grouping returns one unlabelled group', () => {
    const groups = groupTasks([makeTask('a'), makeTask('b')], 'none', NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0].tasks).toHaveLength(2);
  });

  test('flat grouping of nothing produces no groups at all', () => {
    expect(groupTasks([], 'none', NOW)).toEqual([]);
  });

  test('status grouping leads with In Progress', () => {
    // What you are part-way through matters more than what you have not begun.
    const tasks = [
      makeTask('a'),
      withStatus(makeTask('b'), 'in-progress'),
      withStatus(makeTask('c'), 'done'),
    ];
    expect(groupTasks(tasks, 'status', NOW).map(g => g.label)).toEqual([
      'In Progress',
      'To Do',
      'Done',
    ]);
  });

  test('empty groups are omitted rather than shown as bare headings', () => {
    const groups = groupTasks([makeTask('a')], 'status', NOW);
    expect(groups.map(g => g.label)).toEqual(['To Do']);
  });

  test('priority groups run high to low, with unset last', () => {
    const tasks = [
      makeTask('none'),
      makeTask('high', { priority: 4 }),
      makeTask('low', { priority: 2 }),
      makeTask('med', { priority: 3 }),
    ];
    expect(groupTasks(tasks, 'priority', NOW).map(g => g.label)).toEqual([
      'High',
      'Medium',
      'Low',
      'No Priority',
    ]);
  });

  test('priority 1 and unset share the same group', () => {
    const tasks = [makeTask('a', { priority: 1 }), makeTask('b')];
    const groups = groupTasks(tasks, 'priority', NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0].tasks).toHaveLength(2);
  });

  test('due grouping runs overdue, today, this week, later, no date', () => {
    const tasks = [
      makeTask('later', { dueDate: day(30) }),
      makeTask('none'),
      makeTask('today', { dueDate: day(0) }),
      makeTask('overdue', { dueDate: day(-2) }),
      makeTask('week', { dueDate: day(3) }),
    ];
    expect(groupTasks(tasks, 'due', NOW).map(g => g.label)).toEqual([
      'Overdue',
      'Today',
      'This Week',
      'Later',
      'No Date',
    ]);
  });

  test('exactly seven days out is still This Week', () => {
    const groups = groupTasks([makeTask('edge', { dueDate: day(7) })], 'due', NOW);
    expect(groups[0].label).toBe('This Week');
  });

  test('eight days out is Later', () => {
    const groups = groupTasks([makeTask('edge', { dueDate: day(8) })], 'due', NOW);
    expect(groups[0].label).toBe('Later');
  });

  test('grouping sorts within a group by priority', () => {
    const tasks = [
      makeTask('low', { dueDate: day(0), priority: 2 }),
      makeTask('high', { dueDate: day(0), priority: 4 }),
    ];
    const groups = groupTasks(tasks, 'due', NOW);
    expect(groups[0].tasks.map(t => t.uid)).toEqual(['high', 'low']);
  });

  test('grouping never loses or duplicates a task', () => {
    const tasks = [
      makeTask('a', { dueDate: day(-1) }),
      makeTask('b', { dueDate: day(0), priority: 4 }),
      makeTask('c'),
      withStatus(makeTask('d'), 'done'),
    ];
    for (const grouping of ['none', 'status', 'priority', 'due'] as const) {
      const groups = groupTasks(tasks, grouping, NOW);
      expect(countGrouped(groups)).toBe(4);
      const uids = groups.flatMap(g => g.tasks.map(t => t.uid));
      expect(new Set(uids).size).toBe(4);
    }
  });

  test('grouping does not mutate the input array', () => {
    const tasks = [makeTask('b', { priority: 2 }), makeTask('a', { priority: 4 })];
    groupTasks(tasks, 'priority', NOW);
    expect(tasks.map(t => t.uid)).toEqual(['b', 'a']);
  });
});

describe('labels', () => {
  test('scopes read as plain words', () => {
    expect(scopeLabel('open')).toBe('Open');
    expect(scopeLabel('upcoming')).toBe('Upcoming');
  });

  test('groupings read as plain words', () => {
    expect(groupingLabel('none')).toBe('Flat');
    expect(groupingLabel('due')).toBe('Due');
  });
});
