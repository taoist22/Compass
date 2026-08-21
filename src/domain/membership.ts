import { Area, EventType, ItemMembership, Project } from './types';

/**
 * Which Area an item is filed under.
 *
 * PARA does not treat area and project as independent facts: a project
 * belongs to an area, so anything in a project is already in that area.
 * Storing both let them disagree — a task could sit in the House project
 * while filed under Work, and moving a project between areas left its tasks
 * behind. So the area is derived, not stored, wherever something else already
 * decides it.
 *
 * Order of authority:
 *   1. the item's project, which owns the answer outright
 *   2. its event type's default area
 *   3. an area chosen directly, which is how a task with no project is filed
 *
 * A type outranks a stored area because only events carry a type, and the only
 * way an event ever acquired a stored area was an earlier version writing the
 * type's area into the record. Preferring the type re-reads that from source
 * and lets a retagged event follow its new type instead of staying frozen on
 * whichever type it was given first.
 */
export function resolveAreaId(
  membership: ItemMembership | undefined,
  projects: Project[],
  eventTypes: EventType[] = []
): string | undefined {
  if (!membership) return undefined;

  if (membership.projectId) {
    const project = projects.find(p => p.id === membership.projectId);
    // A project with no area of its own leaves the item unfiled rather than
    // falling through — being in a project is the stronger statement.
    if (project) return project.areaId;
  }

  if (membership.typeId) {
    const type = eventTypes.find(t => t.id === membership.typeId);
    if (type) return type.defaultAreaId;
  }

  return membership.areaId;
}

/**
 * True when the area is decided elsewhere and cannot be picked directly.
 *
 * The task form uses this to show the derived area and stop offering a choice
 * that would be silently ignored.
 */
export function areaIsDerived(membership: ItemMembership | undefined, projects: Project[]): boolean {
  if (!membership?.projectId) return false;
  return projects.some(p => p.id === membership.projectId);
}

/** The area itself, for labelling. */
export function resolveArea(
  membership: ItemMembership | undefined,
  projects: Project[],
  areas: Area[],
  eventTypes: EventType[] = []
): Area | undefined {
  const id = resolveAreaId(membership, projects, eventTypes);
  return id ? areas.find(a => a.id === id) : undefined;
}
