import { CalendarTask, Project } from './types';
import { dailyFocusTasks, plannerWeekRange, projectsNeedingAttention, weeklyTaskSummary } from './plannerReview';

function task(uid: string, due: string | undefined, priority: 1 | 2 | 3 | 4 = 1, completedAt?: string): CalendarTask {
  return {
    uid,
    title: uid,
    dueDate: due ? new Date(`${due}T12:00:00`) : undefined,
    createdAt: new Date('2026-08-01T12:00:00'),
    completed: Boolean(completedAt),
    completedAt: completedAt ? new Date(`${completedAt}T12:00:00`) : undefined,
    priority,
  };
}

function project(id: string, due?: string): Project {
  return {
    id,
    name: id,
    status: 'active',
    dueDate: due ? new Date(`${due}T12:00:00`) : undefined,
    createdAt: new Date('2026-08-01T12:00:00'),
  };
}

describe('planner review helpers', () => {
  test('uses Monday through Sunday for a planner week', () => {
    const range = plannerWeekRange(new Date('2026-08-26T12:00:00'));
    expect(range.start.toDateString()).toBe(new Date('2026-08-24T00:00:00').toDateString());
    expect(range.endExclusive.toDateString()).toBe(new Date('2026-08-31T00:00:00').toDateString());
  });

  test('supports a configured Sunday week start', () => {
    const range = plannerWeekRange(new Date('2026-08-26T12:00:00'), 0);
    expect(range.start.toDateString()).toBe(new Date('2026-08-23T00:00:00').toDateString());
  });

  test('summarizes completed, due, and overdue work independently', () => {
    const summary = weeklyTaskSummary([
      task('done', '2026-08-25', 1, '2026-08-25'),
      task('due', '2026-08-29'),
      task('late', '2026-08-20'),
    ], new Date('2026-08-26T12:00:00'), new Date('2026-08-26T12:00:00'));
    expect(summary.completed.map(item => item.uid)).toEqual(['done']);
    expect(summary.due.map(item => item.uid)).toEqual(['due']);
    expect(summary.overdue.map(item => item.uid)).toEqual(['late']);
  });

  test('focus favors high-priority work before ordinary work', () => {
    const result = dailyFocusTasks([
      task('ordinary', '2026-08-26'),
      task('important', '2026-08-26', 4),
    ], new Date('2026-08-26T12:00:00'));
    expect(result.map(item => item.uid)).toEqual(['important', 'ordinary']);
  });

  test('flags active projects with no next action or a near deadline', () => {
    const projects = [project('empty'), project('near', '2026-08-28'), project('later', '2026-10-01')];
    const tasks = [task('near-task', '2026-08-28'), task('later-task', '2026-10-01')];
    const result = projectsNeedingAttention(
      projects,
      tasks,
      uid => uid.startsWith('near') ? 'near' : uid.startsWith('later') ? 'later' : undefined,
      new Date('2026-08-26T12:00:00')
    );
    expect(result.map(item => item.id)).toEqual(['near', 'empty']);
  });
});
