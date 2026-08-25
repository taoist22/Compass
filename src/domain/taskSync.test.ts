import {
  inferTaskCollectionUrl,
  taskBelongsToCollection,
  taskFromCaldavItem,
  taskToCaldavItem,
} from './taskSync';

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

  test('ties an imported task to its source collection', () => {
    const collection = 'https://dav.example.test/user/tasks/';
    const task = taskFromCaldavItem({
      uid: 'remote', summary: 'Remote', start: new Date(0), end: new Date(0),
      allDay: true, attendees: [], isTask: true, undatedTask: true,
      caldavUrl: `${collection}remote.ics`,
    }, undefined, collection);

    expect(task.caldavCollectionUrl).toBe(collection);
    expect(taskBelongsToCollection(task, collection)).toBe(true);
    expect(taskBelongsToCollection(task, 'https://other.example.test/tasks/')).toBe(false);
  });

  test('infers ownership for tasks stored before collection tracking existed', () => {
    expect(inferTaskCollectionUrl('https://dav.example.test/tasks/old.ics?token=x'))
      .toBe('https://dav.example.test/tasks/');
  });
});
