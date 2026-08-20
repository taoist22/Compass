import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Area, CalendarTask, Project } from '../domain/types';
import { isDone, statusGlyph, taskStatus } from '../domain/taskModel';
import {
  activeProjects,
  archivedProjects,
  areaProjectCounts,
  projectOverdue,
  projectProgress,
  projectsByArea,
  ProjectLookup,
} from '../domain/taskListView';

interface ParaViewProps {
  areas: Area[];
  projects: Project[];
  tasks: CalendarTask[];
  projectOf: (uid: string) => string | undefined;
  /** null means "all areas". */
  selectedAreaId: string | null;
  onSelectArea: (areaId: string | null) => void;
  showArchive: boolean;
  onToggleArchive: () => void;
  onNewProject: () => void;
  onNewArea: () => void;
  onOpenProject: (project: Project) => void;
  onToggleTask: (task: CalendarTask) => void;
  onEditTask: (task: CalendarTask) => void;
  onAddTaskToProject: (project: Project) => void;
}

/**
 * Areas and Projects as a place you browse, not a filter row.
 *
 * A peer of Month and Day View rather than a modal — it sat in the view
 * switcher but opened an overlay, which is what made it feel bolted on.
 *
 * Grouping tasks *by* project showed tasks. This shows projects as things:
 * how far along, when due, what is in them.
 */
export function ParaView({
  areas,
  projects,
  tasks,
  projectOf,
  selectedAreaId,
  onSelectArea,
  showArchive,
  onToggleArchive,
  onNewProject,
  onNewArea,
  onOpenProject,
  onToggleTask,
  onEditTask,
  onAddTaskToProject,
}: ParaViewProps): React.JSX.Element {
  const lookup: ProjectLookup = {
    projectOf,
    nameOf: (id: string) => projects.find(p => p.id === id)?.name || 'Project',
  };

  const counts = areaProjectCounts(areas, projects);
  const totalActive = activeProjects(projects).length;

  const shown = showArchive
    ? archivedProjects(projects)
    : activeProjects(projects).filter(p => !selectedAreaId || p.areaId === selectedAreaId);

  const grouped = projectsByArea(shown, areas);

  const tasksOf = (projectId: string) => tasks.filter(t => projectOf(t.uid) === projectId);

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <Text allowFontScaling={false} style={styles.topTitle}>
          📁 Projects &amp; Areas
        </Text>
        <View style={styles.topActions}>
          <TouchableOpacity style={styles.topBtn} onPress={onNewProject}>
            <Text allowFontScaling={false} style={styles.topBtnText}>
              + New Project
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.topBtn} onPress={onNewArea}>
            <Text allowFontScaling={false} style={styles.topBtnText}>
              + Area
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.columns}>
        <View style={styles.leftPane}>
          <Text allowFontScaling={false} style={styles.paneHeading}>
            🌐 Areas of Responsibility
          </Text>

          <ScrollView style={styles.paneScroll}>
            <TouchableOpacity
              style={[styles.areaRow, selectedAreaId === null && !showArchive && styles.areaRowActive]}
              onPress={() => onSelectArea(null)}
            >
              <Text
                allowFontScaling={false}
                style={[
                  styles.areaText,
                  selectedAreaId === null && !showArchive && styles.areaTextActive,
                ]}
              >
                All Areas ({totalActive})
              </Text>
            </TouchableOpacity>

            {counts.map(({ area, count }) => {
              const active = selectedAreaId === area.id && !showArchive;
              return (
                <TouchableOpacity
                  key={area.id}
                  style={[styles.areaRow, active && styles.areaRowActive]}
                  onPress={() => onSelectArea(area.id)}
                >
                  {/* Empty areas still listed: vanishing would make one look
                      deleted rather than merely idle. */}
                  <Text
                    allowFontScaling={false}
                    style={[styles.areaText, active && styles.areaTextActive]}
                  >
                    {area.name} ({count})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text allowFontScaling={false} style={styles.paneHeading}>
            📦 Archive
          </Text>
          <TouchableOpacity
            style={[styles.areaRow, showArchive && styles.areaRowActive]}
            onPress={onToggleArchive}
          >
            <Text
              allowFontScaling={false}
              style={[styles.areaText, showArchive && styles.areaTextActive]}
            >
              {showArchive ? 'Back to active' : 'View completed / archived'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.rightPane}>
          <Text allowFontScaling={false} style={styles.paneHeading}>
            {showArchive ? '📦 Completed & Archived' : '🚀 Active Projects'}
          </Text>

          <ScrollView style={styles.paneScroll}>
            {grouped.length === 0 && (
              <Text allowFontScaling={false} style={styles.empty}>
                {showArchive
                  ? 'Nothing finished yet.'
                  : selectedAreaId
                  ? 'No active projects in this area.'
                  : 'No active projects. An area never finishes; a project does.'}
              </Text>
            )}

            {grouped.map(group => (
              <View key={group.areaId || '__none'}>
                <Text allowFontScaling={false} style={styles.groupHeading}>
                  {group.label}
                </Text>

                {group.projects.map(project => {
                  const progress = projectProgress(tasks, project.id, lookup);
                  const projectTasks = tasksOf(project.id);
                  const overdue = projectOverdue(project);

                  return (
                    <View key={project.id} style={styles.projectCard}>
                      <TouchableOpacity onPress={() => onOpenProject(project)}>
                        <Text allowFontScaling={false} style={styles.projectName}>
                          {project.name}
                        </Text>
                        <Text allowFontScaling={false} style={styles.projectMeta}>
                          {project.dueDate
                            ? `${overdue ? '⚠ ' : '📅 '}${project.dueDate.toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                              })} · `
                            : ''}
                          {progressBar(progress.percent)} {progress.done}/{progress.total} tasks (
                          {progress.percent}%)
                        </Text>
                      </TouchableOpacity>

                      {projectTasks.map(task => (
                        <View key={task.uid} style={styles.taskRow}>
                          <TouchableOpacity onPress={() => onToggleTask(task)}>
                            <Text allowFontScaling={false} style={styles.taskGlyph}>
                              {statusGlyph(taskStatus(task))}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.taskBody} onPress={() => onEditTask(task)}>
                            <Text
                              allowFontScaling={false}
                              numberOfLines={1}
                              style={[styles.taskText, isDone(task) && styles.taskTextDone]}
                            >
                              {task.title}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ))}

                      <TouchableOpacity
                        style={styles.addTaskRow}
                        onPress={() => onAddTaskToProject(project)}
                      >
                        <Text allowFontScaling={false} style={styles.addTaskText}>
                          + Add task to project…
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

/**
 * Progress as blocks rather than a drawn bar.
 *
 * A View-based bar renders as a grey smear on e-ink at these widths; solid
 * block characters stay legible and cost nothing to repaint.
 */
function progressBar(percent: number): string {
  const filled = Math.round((percent / 100) * 5);
  return '█'.repeat(filled) + '░'.repeat(5 - filled);
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: '#000000',
    paddingBottom: 6,
    marginBottom: 6,
  },
  topTitle: { fontSize: 15, fontWeight: 'bold', color: '#000000' },
  topActions: { flexDirection: 'row' },
  topBtn: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginLeft: 6,
    backgroundColor: '#ffffff',
  },
  topBtnText: { fontSize: 12, fontWeight: 'bold', color: '#000000' },
  columns: { flex: 1, flexDirection: 'row' },
  leftPane: {
    width: '32%',
    borderRightWidth: 2,
    borderRightColor: '#000000',
    paddingRight: 8,
  },
  rightPane: { flex: 1, paddingLeft: 10 },
  paneHeading: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000000',
    backgroundColor: '#e8e8e8',
    paddingVertical: 3,
    paddingHorizontal: 6,
    marginBottom: 4,
    marginTop: 4,
  },
  paneScroll: { flex: 1 },
  areaRow: {
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 4,
    paddingVertical: 7,
    paddingHorizontal: 8,
    marginBottom: 4,
    backgroundColor: '#ffffff',
  },
  areaRowActive: { backgroundColor: '#000000' },
  areaText: { fontSize: 12, fontWeight: 'bold', color: '#000000' },
  areaTextActive: { color: '#ffffff' },
  groupHeading: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#303030',
    marginTop: 6,
    marginBottom: 2,
  },
  projectCard: {
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 6,
    padding: 8,
    marginBottom: 8,
    backgroundColor: '#ffffff',
  },
  projectName: { fontSize: 14, fontWeight: 'bold', color: '#000000' },
  projectMeta: { fontSize: 11, color: '#303030', marginTop: 2 },
  taskRow: { flexDirection: 'row', alignItems: 'center', marginTop: 5 },
  taskGlyph: { fontSize: 14, color: '#000000', marginRight: 6 },
  taskBody: { flex: 1 },
  taskText: { fontSize: 12, color: '#000000' },
  taskTextDone: { textDecorationLine: 'line-through', color: '#606060' },
  addTaskRow: { marginTop: 6 },
  addTaskText: { fontSize: 11, color: '#505050' },
  empty: { fontSize: 12, color: '#505050', paddingVertical: 14 },
});
