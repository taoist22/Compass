import {
  countOpenTasks,
  isLegacyTaskEvent,
  sectionTasksForDay,
  taskFromLegacyEvent,
  tasksForCalendarDay,
  toggleTaskCompletion,
} from './taskFilters';
import { CalendarTask } from './types';

const TODAY = new Date(2026, 7, 17); // Mon 17 Aug 2026
const d = (day: number) => new Date(2026, 7, day);

const task = (over: Partial<CalendarTask> & { uid: string }): CalendarTask => ({
  title: over.uid,
  completed: false,
  createdAt: new Date(2026, 7, 1),
  ...over,
});

describe('sectionTasksForDay', () => {
  test('an overdue task keeps its original date and surfaces under Past Due', () => {
    const overdue = task({ uid: 'a', dueDate: d(12) });
    const s = sectionTasksForDay([overdue], TODAY, TODAY);

    expect(s.pastDue.map(t => t.uid)).toEqual(['a']);
    // The date must not be rewritten — the view surfaces it, nothing mutates.
    expect(s.pastDue[0].dueDate).toEqual(d(12));
  });

  test('tasks due on the viewed day land in Due Today', () => {
    const s = sectionTasksForDay([task({ uid: 'a', dueDate: d(17) })], TODAY, TODAY);
    expect(s.dueToday.map(t => t.uid)).toEqual(['a']);
  });

  test('undated tasks appear only when looking at today', () => {
    const undated = [task({ uid: 'a' })];
    expect(sectionTasksForDay(undated, TODAY, TODAY).noDate).toHaveLength(1);
    // Browsing a future day should not repeat the undated pool.
    expect(sectionTasksForDay(undated, d(20), TODAY).noDate).toHaveLength(0);
  });

  test('Past Due does not appear when browsing another day', () => {
    const overdue = [task({ uid: 'a', dueDate: d(12) })];
    expect(sectionTasksForDay(overdue, d(20), TODAY).pastDue).toHaveLength(0);
  });

  test('a completed task shows on the day it was completed, not when it was due', () => {
    const done = task({ uid: 'a', dueDate: d(12), completed: true, completedAt: d(17) });

    expect(sectionTasksForDay([done], TODAY, TODAY).completed.map(t => t.uid)).toEqual(['a']);
    // Not still sitting in Past Due on its original date.
    expect(sectionTasksForDay([done], d(12), TODAY).completed).toHaveLength(0);
    expect(sectionTasksForDay([done], TODAY, TODAY).pastDue).toHaveLength(0);
  });

  test('a completed task with no completedAt falls back to its due date', () => {
    const legacy = task({ uid: 'a', dueDate: d(15), completed: true });
    expect(sectionTasksForDay([legacy], d(15), TODAY).completed).toHaveLength(1);
  });

  test('sections are ordered by due date then creation', () => {
    const s = sectionTasksForDay(
      [
        task({ uid: 'later', dueDate: d(10) }),
        task({ uid: 'earlier', dueDate: d(5) }),
      ],
      TODAY,
      TODAY
    );
    expect(s.pastDue.map(t => t.uid)).toEqual(['earlier', 'later']);
  });

  test('an explicit order wins over dates', () => {
    const s = sectionTasksForDay(
      [
        task({ uid: 'second', dueDate: d(5), order: 2 }),
        task({ uid: 'first', dueDate: d(10), order: 1 }),
      ],
      TODAY,
      TODAY
    );
    expect(s.pastDue.map(t => t.uid)).toEqual(['first', 'second']);
  });

  test('countOpenTasks excludes completed work', () => {
    const s = sectionTasksForDay(
      [
        task({ uid: 'a', dueDate: d(12) }),
        task({ uid: 'b', dueDate: d(17) }),
        task({ uid: 'c' }),
        task({ uid: 'd', completed: true, completedAt: d(17) }),
      ],
      TODAY,
      TODAY
    );
    expect(countOpenTasks(s)).toBe(3);
  });
});

describe('tasksForCalendarDay', () => {
  test('shows tasks due that day, past or future, regardless of today', () => {
    const past = task({ uid: 'past', dueDate: d(12) });
    const future = task({ uid: 'future', dueDate: d(25) });

    expect(tasksForCalendarDay([past, future], d(12)).map(t => t.uid)).toEqual(['past']);
    expect(tasksForCalendarDay([past, future], d(25)).map(t => t.uid)).toEqual(['future']);
  });

  test('shows completed tasks on the day they were completed', () => {
    const done = task({ uid: 'done', dueDate: d(12), completed: true, completedAt: d(17) });
    expect(tasksForCalendarDay([done], d(17)).map(t => t.uid)).toEqual(['done']);
    expect(tasksForCalendarDay([done], d(12))).toHaveLength(0);
  });

  test('undated tasks never appear on the grid', () => {
    expect(tasksForCalendarDay([task({ uid: 'a' })], d(17))).toHaveLength(0);
  });

  test('open work sorts above completed so it is not buried', () => {
    const items = [
      task({ uid: 'done', completed: true, completedAt: d(17) }),
      task({ uid: 'open', dueDate: d(17) }),
    ];
    expect(tasksForCalendarDay(items, d(17)).map(t => t.uid)).toEqual(['open', 'done']);
  });
});

describe('toggleTaskCompletion', () => {
  test('completing stamps the time', () => {
    const done = toggleTaskCompletion(task({ uid: 'a' }), TODAY);
    expect(done.completed).toBe(true);
    expect(done.completedAt).toEqual(TODAY);
  });

  test('un-completing clears the stamp so it stops showing as done that day', () => {
    const done = toggleTaskCompletion(task({ uid: 'a' }), TODAY);
    const undone = toggleTaskCompletion(done, TODAY);
    expect(undone.completed).toBe(false);
    expect(undone.completedAt).toBeUndefined();
  });
});

describe('legacy task migration', () => {
  const legacyEvent = {
    uid: 'task-user-1',
    summary: '[TASK] Submit lab report',
    isTask: true,
    completed: false,
    start: d(12),
    end: d(12),
    allDay: true,
    attendees: [],
    description: 'chapter 4',
  };

  test('detects both the flag and the legacy summary prefix', () => {
    expect(isLegacyTaskEvent(legacyEvent)).toBe(true);
    expect(isLegacyTaskEvent({ ...legacyEvent, isTask: undefined })).toBe(true);
    expect(isLegacyTaskEvent({ ...legacyEvent, isTask: undefined, summary: 'Standup' })).toBe(false);
  });

  test('converts to a task, stripping the display prefix', () => {
    const t = taskFromLegacyEvent(legacyEvent);
    expect(t.uid).toBe('task-user-1');
    expect(t.title).toBe('Submit lab report');
    expect(t.dueDate).toEqual(d(12));
    expect(t.completed).toBe(false);
    expect(t.notes).toBe('chapter 4');
  });

  test('a migrated task then sections correctly as overdue', () => {
    const t = taskFromLegacyEvent(legacyEvent);
    expect(sectionTasksForDay([t], TODAY, TODAY).pastDue.map(x => x.uid)).toEqual(['task-user-1']);
  });
});
