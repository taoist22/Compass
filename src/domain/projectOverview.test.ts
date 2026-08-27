import { CalendarEvent, CalendarTask } from './types';
import { projectOverviewItems } from './projectOverview';

const task = (uid: string, completed: boolean, due: string, completedAt?: string): CalendarTask => ({
  uid,
  title: uid,
  completed,
  dueDate: new Date(due),
  completedAt: completedAt ? new Date(completedAt) : undefined,
  createdAt: new Date('2026-08-01T12:00:00Z'),
});

const event = (uid: string, start: string): CalendarEvent => ({
  uid,
  summary: uid,
  start: new Date(start),
  end: new Date(new Date(start).getTime() + 3600000),
  allDay: false,
  attendees: [],
});

test('project overview separates and orders open tasks, completed tasks, and events', () => {
  const result = projectOverviewItems(
    'project-a',
    [
      task('open-later', false, '2026-08-29T12:00:00Z'),
      task('done-old', true, '2026-08-20T12:00:00Z', '2026-08-22T12:00:00Z'),
      task('open-sooner', false, '2026-08-27T12:00:00Z'),
      task('done-new', true, '2026-08-21T12:00:00Z', '2026-08-25T12:00:00Z'),
      task('other', false, '2026-08-26T12:00:00Z'),
    ],
    [event('event-later', '2026-08-30T12:00:00Z'), event('event-sooner', '2026-08-28T12:00:00Z')],
    uid => uid === 'other' ? 'project-b' : 'project-a',
    () => 'project-a'
  );

  expect(result.openTasks.map(item => item.uid)).toEqual(['open-sooner', 'open-later']);
  expect(result.completedTasks.map(item => item.uid)).toEqual(['done-new', 'done-old']);
  expect(result.upcomingEvents.map(item => item.uid)).toEqual(['event-sooner', 'event-later']);
});
