import { CalendarTask, TaskPriority, TaskStatus } from './types';

/**
 * Task status and priority.
 *
 * `completed` predates statuses and is read in roughly two dozen places, plus
 * written into the outbound VTODO. Rather than change all of them at once, it
 * stays the stored source of done-ness and `status` is kept in step with it.
 * Everything here maintains that invariant; nothing else should write either
 * field directly.
 */

export const TASK_STATUSES: TaskStatus[] = ['todo', 'in-progress', 'done'];

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To Do',
  'in-progress': 'In Progress',
  done: 'Done',
};

export function statusLabel(status: TaskStatus): string {
  return STATUS_LABELS[status];
}

/**
 * The status of a task, derived when absent.
 *
 * Tasks stored before statuses existed have no `status`, so `completed` is the
 * only evidence. An in-progress task is never `completed`, so the derivation
 * cannot lose information.
 */
export function taskStatus(task: CalendarTask): TaskStatus {
  if (task.status) return task.status;
  return task.completed ? 'done' : 'todo';
}

export function isDone(task: CalendarTask): boolean {
  return taskStatus(task) === 'done';
}

/**
 * Moves a task to a status, keeping `completed` and `completedAt` consistent.
 *
 * Returns a new task; the input is not mutated. `completedAt` drives which day
 * finished work appears on, so it is set on the way into `done` and cleared on
 * the way out — otherwise reopening a task would leave it displayed on the day
 * it was previously ticked off.
 */
export function withStatus(
  task: CalendarTask,
  status: TaskStatus,
  at: Date = new Date()
): CalendarTask {
  const done = status === 'done';
  return {
    ...task,
    status,
    completed: done,
    completedAt: done ? task.completedAt || at : undefined,
  };
}

/** Cycles To Do → In Progress → Done → To Do, for a single tap control. */
export function nextStatus(status: TaskStatus): TaskStatus {
  const idx = TASK_STATUSES.indexOf(status);
  return TASK_STATUSES[(idx + 1) % TASK_STATUSES.length];
}

/**
 * Normalises a task read from storage.
 *
 * Both directions matter: a task saved before statuses existed needs one
 * derived, and a task whose `status` and `completed` disagree — which can only
 * happen if something wrote one without the other — is repaired in favour of
 * `status`, the more specific of the two.
 */
export function normaliseTask(task: CalendarTask): CalendarTask {
  const status = taskStatus(task);
  const done = status === 'done';
  if (task.status === status && task.completed === done) return task;
  return { ...task, status, completed: done };
}

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  1: 'None',
  2: 'Low',
  3: 'Medium',
  4: 'High',
};

export const TASK_PRIORITIES: TaskPriority[] = [4, 3, 2, 1];

export function priorityLabel(priority?: TaskPriority): string {
  return PRIORITY_LABELS[priority || 1];
}

/** Unset sorts as "normal", so untouched tasks sit below anything raised. */
export function priorityRank(task: CalendarTask): number {
  return task.priority || 1;
}

/**
 * Orders a list for display: highest priority first, then by due date, then by
 * the manual `order` field, then title.
 *
 * Undated tasks sort after dated ones — a deadline is more urgent than none —
 * rather than being treated as due at the epoch.
 */
export function compareTasks(a: CalendarTask, b: CalendarTask): number {
  const byPriority = priorityRank(b) - priorityRank(a);
  if (byPriority !== 0) return byPriority;

  const aDue = a.dueDate ? a.dueDate.getTime() : Infinity;
  const bDue = b.dueDate ? b.dueDate.getTime() : Infinity;
  if (aDue !== bDue) return aDue - bDue;

  const byOrder = (a.order ?? 0) - (b.order ?? 0);
  if (byOrder !== 0) return byOrder;

  return a.title.localeCompare(b.title);
}

export function sortTasks(tasks: CalendarTask[]): CalendarTask[] {
  return [...tasks].sort(compareTasks);
}

/**
 * Row glyph for a status.
 *
 * Drawn from families already proven to render on these devices — the existing
 * rows use ☐ and ☑, and ▶ appears in the month navigation. An untested glyph
 * that falls back to a tofu box would be worse than a plain one.
 */
export function statusGlyph(status: TaskStatus): string {
  switch (status) {
    case 'in-progress':
      return '▶';
    case 'done':
      return '☑';
    default:
      return '☐';
  }
}

/**
 * Compact priority marker for a row.
 *
 * Only High and Medium are marked. Low and None get nothing: a marker on every
 * row carries no information and costs width that a Nomad cell does not have.
 */
export function priorityMarker(priority?: TaskPriority): string {
  if (priority === 4) return '!!';
  if (priority === 3) return '!';
  return '';
}
