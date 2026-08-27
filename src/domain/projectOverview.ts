import { CalendarEvent, CalendarTask } from './types';
import { isDone } from './taskModel';

export function projectOverviewItems(
  projectId: string,
  tasks: CalendarTask[],
  events: CalendarEvent[],
  projectOfTask: (uid: string) => string | undefined,
  projectOfEvent: (event: CalendarEvent) => string | undefined
) {
  const projectTasks = tasks.filter(task => projectOfTask(task.uid) === projectId);
  const openTasks = projectTasks
    .filter(task => !isDone(task))
    .sort((a, b) =>
      (a.dueDate?.getTime() ?? Number.POSITIVE_INFINITY) -
      (b.dueDate?.getTime() ?? Number.POSITIVE_INFINITY)
    );
  const completedTasks = projectTasks
    .filter(isDone)
    .sort((a, b) =>
      (b.completedAt?.getTime() ?? b.dueDate?.getTime() ?? 0) -
      (a.completedAt?.getTime() ?? a.dueDate?.getTime() ?? 0)
    );
  const upcomingEvents = events
    .filter(event => projectOfEvent(event) === projectId)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  return { openTasks, completedTasks, upcomingEvents };
}
