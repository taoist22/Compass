import { taskFromCaldavItem, taskToCaldavItem } from './taskSync';

describe('task CalDAV conversion', () => {
  test('preserves due date, completion, priority and notes', () => {
    const due = new Date(2026, 7, 20, 15, 30);
    const item = taskToCaldavItem({
      uid: 't1', title: 'Ship release', dueDate: due, completed: true,
      status: 'done', priority: 4, notes: 'Double check package', createdAt: new Date(),
    });
    expect(item.isTask).toBe(true);
    expect(item.completed).toBe(true);
    expect(item.priority).toBe(4);
    const task = taskFromCaldavItem(item);
    expect(task.dueDate).toEqual(due);
    expect(task.status).toBe('done');
    expect(task.notes).toBe('Double check package');
  });

  test('preserves an undated task without inventing a due date', () => {
    const item = taskToCaldavItem({
      uid: 't2', title: 'Someday', completed: false, createdAt: new Date(),
    });
    expect(item.undatedTask).toBe(true);
    expect(taskFromCaldavItem(item).dueDate).toBeUndefined();
  });
});
