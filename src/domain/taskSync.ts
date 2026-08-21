import { CalendarEvent, CalendarTask } from './types';
import { taskStatus, withStatus } from './taskModel';

export function taskToCaldavItem(task: CalendarTask): CalendarEvent {
  const due = task.dueDate ? new Date(task.dueDate) : new Date(0);
  return {
    uid: task.uid,
    summary: task.title,
    description: task.notes,
    start: due,
    end: task.dueDate ? new Date(due.getTime() + 30 * 60 * 1000) : new Date(0),
    allDay: task.dueDate ? task.allDay !== false : true,
    attendees: [],
    isTask: true,
    undatedTask: !task.dueDate,
    completed: task.completed,
    priority: task.priority,
    caldavUrl: task.caldavUrl,
    etag: task.etag,
  };
}

export function taskFromCaldavItem(item: CalendarEvent, existing?: CalendarTask): CalendarTask {
  const base: CalendarTask = {
    uid: item.uid,
    title: item.summary.replace(/^\[TASK\]\s*/i, '').trim(),
    dueDate: item.undatedTask ? undefined : new Date(item.start),
    allDay: item.allDay,
    completed: item.completed === true,
    createdAt: existing?.createdAt || new Date(),
    notes: item.description,
    priority: item.priority,
    caldavUrl: item.caldavUrl,
    etag: item.etag,
  };
  return withStatus(base, item.completed ? 'done' : existing ? taskStatus(existing) === 'in-progress' ? 'in-progress' : 'todo' : 'todo');
}
