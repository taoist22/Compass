import {
  compareTasks,
  isDone,
  nextStatus,
  normaliseTask,
  priorityLabel,
  sortTasks,
  statusLabel,
  taskStatus,
  withStatus,
  TASK_STATUSES,
  statusGlyph,
  priorityMarker,
  taskRowLabel,
} from './taskModel';
import { CalendarTask } from './types';

function makeTask(over: Partial<CalendarTask> = {}): CalendarTask {
  return {
    uid: 'task-1',
    title: 'Read chapter 4',
    completed: false,
    createdAt: new Date('2026-08-01T09:00:00Z'),
    ...over,
  };
}

describe('task status', () => {
  test('a task stored before statuses existed derives one from completed', () => {
    // No migration on disk: the old shape is only ever `completed`.
    expect(taskStatus(makeTask({ completed: false }))).toBe('todo');
    expect(taskStatus(makeTask({ completed: true }))).toBe('done');
  });

  test('an explicit status wins over the derived one', () => {
    expect(taskStatus(makeTask({ status: 'in-progress' }))).toBe('in-progress');
  });

  test('in-progress is not done', () => {
    expect(isDone(makeTask({ status: 'in-progress' }))).toBe(false);
    expect(isDone(makeTask({ status: 'done' }))).toBe(true);
  });

  test('withStatus keeps completed in step', () => {
    // completed is read in ~two dozen places and written into the outbound
    // VTODO, so it must never drift from status.
    const done = withStatus(makeTask(), 'done');
    expect(done.completed).toBe(true);

    const reopened = withStatus(done, 'in-progress');
    expect(reopened.completed).toBe(false);
  });

  test('completedAt is stamped on finishing and cleared on reopening', () => {
    const at = new Date('2026-08-18T17:00:00Z');
    const done = withStatus(makeTask(), 'done', at);
    expect(done.completedAt).toEqual(at);

    // Otherwise a reopened task keeps showing on the day it was ticked off.
    expect(withStatus(done, 'todo').completedAt).toBeUndefined();
  });

  test('re-finishing keeps the original completion time', () => {
    const first = new Date('2026-08-18T17:00:00Z');
    const done = withStatus(makeTask(), 'done', first);
    const again = withStatus(done, 'done', new Date('2026-08-19T09:00:00Z'));
    expect(again.completedAt).toEqual(first);
  });

  test('withStatus does not mutate its input', () => {
    const task = makeTask();
    withStatus(task, 'done');
    expect(task.completed).toBe(false);
    expect(task.status).toBeUndefined();
  });

  test('status cycles for a single-tap control', () => {
    expect(nextStatus('todo')).toBe('in-progress');
    expect(nextStatus('in-progress')).toBe('done');
    expect(nextStatus('done')).toBe('todo');
  });

  test('labels read as users expect', () => {
    expect(statusLabel('todo')).toBe('To Do');
    expect(statusLabel('in-progress')).toBe('In Progress');
    expect(statusLabel('done')).toBe('Done');
  });
});

describe('normaliseTask', () => {
  test('fills in a missing status without touching anything else', () => {
    const legacy = makeTask({ completed: true, title: 'Old task' });
    const fixed = normaliseTask(legacy);

    expect(fixed.status).toBe('done');
    expect(fixed.title).toBe('Old task');
  });

  test('repairs a disagreement in favour of status', () => {
    // Only reachable if something wrote one field without the other; status is
    // the more specific of the two, so it wins.
    const conflicted = makeTask({ status: 'done', completed: false });
    expect(normaliseTask(conflicted).completed).toBe(true);

    const other = makeTask({ status: 'todo', completed: true });
    expect(normaliseTask(other).completed).toBe(false);
  });

  test('returns the same object when nothing needs changing', () => {
    const consistent = makeTask({ status: 'todo', completed: false });
    expect(normaliseTask(consistent)).toBe(consistent);
  });
});

describe('priority', () => {
  test('uses the Todoist scale so a sync adapter is a straight mapping', () => {
    expect(priorityLabel(4)).toBe('High');
    expect(priorityLabel(3)).toBe('Medium');
    expect(priorityLabel(2)).toBe('Low');
    expect(priorityLabel(1)).toBe('None');
  });

  test('unset reads as None', () => {
    expect(priorityLabel(undefined)).toBe('None');
  });
});

describe('sorting', () => {
  test('higher priority comes first', () => {
    const low = makeTask({ uid: 'a', priority: 2 });
    const high = makeTask({ uid: 'b', priority: 4 });
    expect(sortTasks([low, high]).map(t => t.uid)).toEqual(['b', 'a']);
  });

  test('equal priority falls back to the earlier due date', () => {
    const later = makeTask({ uid: 'a', dueDate: new Date('2026-09-10T00:00:00Z') });
    const sooner = makeTask({ uid: 'b', dueDate: new Date('2026-09-01T00:00:00Z') });
    expect(sortTasks([later, sooner]).map(t => t.uid)).toEqual(['b', 'a']);
  });

  test('undated tasks sort after dated ones', () => {
    // A deadline is more urgent than none — treating undated as the epoch
    // would float them to the top of every list.
    const undated = makeTask({ uid: 'a' });
    const dated = makeTask({ uid: 'b', dueDate: new Date('2027-01-01T00:00:00Z') });
    expect(sortTasks([undated, dated]).map(t => t.uid)).toEqual(['b', 'a']);
  });

  test('manual order breaks a tie before the title does', () => {
    const second = makeTask({ uid: 'a', title: 'Aaa', order: 2 });
    const first = makeTask({ uid: 'b', title: 'Zzz', order: 1 });
    expect(sortTasks([second, first]).map(t => t.uid)).toEqual(['b', 'a']);
  });

  test('title is the last resort, so ordering is stable', () => {
    const b = makeTask({ uid: 'a', title: 'Beta' });
    const a = makeTask({ uid: 'b', title: 'Alpha' });
    expect(sortTasks([b, a]).map(t => t.title)).toEqual(['Alpha', 'Beta']);
  });

  test('sortTasks does not mutate the array it is given', () => {
    const tasks = [makeTask({ uid: 'a', priority: 2 }), makeTask({ uid: 'b', priority: 4 })];
    sortTasks(tasks);
    expect(tasks.map(t => t.uid)).toEqual(['a', 'b']);
  });

  test('compareTasks is consistent in both directions', () => {
    const a = makeTask({ uid: 'a', priority: 4 });
    const b = makeTask({ uid: 'b', priority: 2 });
    expect(Math.sign(compareTasks(a, b))).toBe(-Math.sign(compareTasks(b, a)));
  });
});

describe('row presentation', () => {
  test('each status has its own glyph', () => {
    const glyphs = TASK_STATUSES.map(statusGlyph);
    expect(new Set(glyphs).size).toBe(3);
    expect(statusGlyph('todo')).toBe('☐');
    expect(statusGlyph('done')).toBe('☑');
  });

  test('only high and medium are marked', () => {
    // A marker on every row carries no information and costs width.
    expect(priorityMarker(4)).toBe('!!');
    expect(priorityMarker(3)).toBe('!');
    expect(priorityMarker(2)).toBe('');
    expect(priorityMarker(1)).toBe('');
    expect(priorityMarker(undefined)).toBe('');
  });
});

describe('taskRowLabel', () => {
  const due = new Date(2026, 7, 25);

  test('is a single string, not a set of fragments', () => {
    // Multiple expression children in a <Text> have broken button
    // registration in these plugins before.
    expect(typeof taskRowLabel(makeTask())).toBe('string');
  });

  test('leads with the date when one is shown', () => {
    const label = taskRowLabel(makeTask({ dueDate: due }), true);
    expect(label.startsWith('Aug 25 ·')).toBe(true);
    expect(label.endsWith('Read chapter 4')).toBe(true);
  });

  test('omits the date when not asked for', () => {
    expect(taskRowLabel(makeTask({ dueDate: due }), false)).toBe('Read chapter 4');
  });

  test('places the priority marker between date and title', () => {
    const label = taskRowLabel(makeTask({ dueDate: due, priority: 4 }), true);
    expect(label).toBe('Aug 25 · !! Read chapter 4');
  });

  test('an unprioritised, undated task is just its title', () => {
    expect(taskRowLabel(makeTask())).toBe('Read chapter 4');
  });

  test('puts project context before the task on current-day rows', () => {
    expect(taskRowLabel(makeTask({ dueDate: due }), false, 'MGT120')).toBe(
      'MGT120 — Read chapter 4'
    );
  });

  test('puts the date before project context when a date is needed', () => {
    expect(taskRowLabel(makeTask({ dueDate: due }), true, 'MGT120')).toBe(
      'Aug 25 · MGT120 — Read chapter 4'
    );
  });

  test('keeps priority beside the task rather than the project context', () => {
    expect(taskRowLabel(makeTask({ dueDate: due, priority: 4 }), true, 'MGT120')).toBe(
      'Aug 25 · MGT120 — !! Read chapter 4'
    );
  });
});
