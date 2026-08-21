import React from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Area, CalendarTask, Project } from '../domain/types';
import { isDone, statusGlyph, taskStatus } from '../domain/taskModel';
import { ICON_CHOICES } from '../domain/noteTemplates';
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
  onNewProject: (name: string) => void;
  onNewArea: (name: string) => void;
  /** Editing an area happens on the area, not in a sheet about all of them. */
  onRenameArea: (areaId: string, name: string, icon?: string) => void;
  onDeleteArea: (areaId: string) => void;
  /** Tasks filed under an area, so deleting one can say what it detaches. */
  areaTaskCount: (areaId: string) => number;
  onOpenProject: (project: Project) => void;
  onProjectNote: (project: Project) => void;
  onSetProjectDue: (project: Project) => void;
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
  onRenameArea,
  onDeleteArea,
  areaTaskCount,
  onOpenProject,
  onProjectNote,
  onSetProjectDue,
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
  const selectedArea = areas.find(a => a.id === selectedAreaId);
  const [editingAreaId, setEditingAreaId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState<string>('');
  const [iconOpen, setIconOpen] = React.useState<boolean>(false);
  const [confirmingAreaId, setConfirmingAreaId] = React.useState<string | null>(null);

  const closeAreaEditor = () => {
    setEditingAreaId(null);
    setIconOpen(false);
    setConfirmingAreaId(null);
  };
  const [adding, setAdding] = React.useState<'project' | 'area' | null>(null);
  const [newName, setNewName] = React.useState<string>('');

  const areaIconFor = (areaId: string | null) => {
    const icon = areaId ? areas.find(a => a.id === areaId)?.icon : undefined;
    return icon ? `${icon} ` : '';
  };

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <Text allowFontScaling={false} style={styles.topTitle}>
          📁 Projects &amp; Areas
        </Text>
        <View style={styles.topActions}>
          {/* "+ New" used to open the manage sheet, which is not what it says.
              It creates now, and managing has a door of its own. */}
          <TouchableOpacity style={styles.topBtn} onPress={() => setAdding('project')}>
            <Text allowFontScaling={false} style={styles.topBtnText}>
              + New Project
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.topBtn} onPress={() => setAdding('area')}>
            <Text allowFontScaling={false} style={styles.topBtnText}>
              + Area
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Named inline rather than in a sheet, as creating from a task form
          already does. */}
      {adding && (
        <View style={styles.addRow}>
          <TextInput
            style={styles.addInput}
            value={newName}
            onChangeText={setNewName}
            placeholder={
              adding === 'area'
                ? 'New area name'
                : // Says where it will land, because a project quietly filed
                  // under nothing is the thing that goes missing.
                  selectedArea
                  ? `New project in ${selectedArea.name}`
                  : 'New project name'
            }
            placeholderTextColor="#707070"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={styles.topBtn}
            onPress={() => {
              const name = newName.trim();
              if (name) (adding === 'project' ? onNewProject : onNewArea)(name);
              setNewName('');
              setAdding(null);
            }}
          >
            <Text allowFontScaling={false} style={styles.topBtnText}>
              Add
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.topBtn}
            onPress={() => {
              setNewName('');
              setAdding(null);
            }}
          >
            <Text allowFontScaling={false} style={styles.topBtnText}>
              Cancel
            </Text>
          </TouchableOpacity>
        </View>
      )}

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
              const editing = editingAreaId === area.id;

              if (confirmingAreaId === area.id) {
                // Confirmed on the row rather than in a dialog, so you can see
                // which area you are about to delete while deciding.
                const owed = areaTaskCount(area.id);
                return (
                  <View key={area.id} style={styles.areaConfirm}>
                    <Text allowFontScaling={false} style={styles.areaConfirmText}>
                      Delete "{area.name}"? Its {owed} task{owed === 1 ? '' : 's'} and any
                      projects are kept, just unfiled.
                    </Text>
                    <View style={styles.areaEditRow}>
                      <TouchableOpacity
                        style={styles.rowBtn}
                        onPress={() => {
                          onDeleteArea(area.id);
                          closeAreaEditor();
                        }}
                      >
                        <Text allowFontScaling={false} style={styles.rowBtnText}>
                          Delete
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.rowBtn}
                        onPress={() => setConfirmingAreaId(null)}
                      >
                        <Text allowFontScaling={false} style={styles.rowBtnText}>
                          Cancel
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              }

              if (editing) {
                return (
                  <View key={area.id} style={styles.areaEditing}>
                    <View style={styles.areaEditRow}>
                      <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={() => setIconOpen(open => !open)}
                      >
                        <Text allowFontScaling={false} style={styles.iconBtnText}>
                          {area.icon || '+'}
                        </Text>
                      </TouchableOpacity>
                      <TextInput
                        style={styles.areaInput}
                        value={editName}
                        onChangeText={setEditName}
                        autoCorrect={false}
                      />
                    </View>

                    {iconOpen && (
                      <View style={styles.iconStrip}>
                        {ICON_CHOICES.map(icon => (
                          <TouchableOpacity
                            key={icon}
                            style={styles.iconChoice}
                            onPress={() => {
                              onRenameArea(area.id, editName.trim() || area.name, icon);
                              setIconOpen(false);
                            }}
                          >
                            <Text allowFontScaling={false} style={styles.iconChoiceText}>
                              {icon}
                            </Text>
                          </TouchableOpacity>
                        ))}
                        <TouchableOpacity
                          style={styles.iconChoice}
                          onPress={() => {
                            onRenameArea(area.id, editName.trim() || area.name, '');
                            setIconOpen(false);
                          }}
                        >
                          <Text allowFontScaling={false} style={styles.iconChoiceText}>
                            —
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    <View style={styles.areaEditRow}>
                      <TouchableOpacity
                        style={styles.rowBtn}
                        onPress={() => {
                          const next = editName.trim();
                          if (next && next !== area.name) onRenameArea(area.id, next, area.icon);
                          closeAreaEditor();
                        }}
                      >
                        <Text allowFontScaling={false} style={styles.rowBtnText}>
                          Done
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.rowBtn}
                        onPress={() => setConfirmingAreaId(area.id)}
                      >
                        <Text allowFontScaling={false} style={styles.rowBtnText}>
                          Delete
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              }

              return (
                <View
                  key={area.id}
                  style={[styles.areaRow, active && styles.areaRowActive]}
                >
                  {/* Empty areas still listed: vanishing would make one look
                      deleted rather than merely idle. */}
                  <TouchableOpacity style={styles.areaTap} onPress={() => onSelectArea(area.id)}>
                    <Text
                      allowFontScaling={false}
                      numberOfLines={1}
                      style={[styles.areaText, active && styles.areaTextActive]}
                    >
                      {area.icon ? `${area.icon} ` : ''}
                      {area.name} ({count})
                    </Text>
                  </TouchableOpacity>

                  {/* Only on the area you are already looking at: an Edit on
                      every row would be five buttons competing with the list. */}
                  {active && (
                    <TouchableOpacity
                      onPress={() => {
                        setEditingAreaId(area.id);
                        setEditName(area.name);
                      }}
                    >
                      <Text allowFontScaling={false} style={styles.areaEditLink}>
                        Edit
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
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
                  {areaIconFor(group.areaId)}
                  {group.label}
                </Text>

                {group.projects.map(project => {
                  const progress = projectProgress(tasks, project.id, lookup);
                  const projectTasks = tasksOf(project.id);
                  const overdue = projectOverdue(project);

                  return (
                    <View key={project.id} style={styles.projectCard}>
                      <View style={styles.projectHead}>
                        <TouchableOpacity
                          style={styles.projectNameBtn}
                          onPress={() => onOpenProject(project)}
                        >
                          <Text allowFontScaling={false} style={styles.projectName} numberOfLines={1}>
                            {project.name}
                          </Text>
                        </TouchableOpacity>

                        {/* Due lives on the card, where projects are actually
                            looked at — and the shared picker cannot open from
                            the manage sheet, which is itself a modal. */}
                        <TouchableOpacity
                          style={styles.projectDueBtn}
                          onPress={() => onSetProjectDue(project)}
                        >
                          <Text allowFontScaling={false} style={styles.projectDueText}>
                            {project.dueDate
                              ? `${overdue ? '⚠ ' : '📅 '}${project.dueDate.toLocaleDateString(
                                  'en-US',
                                  { month: 'short', day: 'numeric' }
                                )}`
                              : '📅 Due…'}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      <View style={styles.projectHead}>
                        <Text allowFontScaling={false} style={styles.projectMeta}>
                          {progressBar(progress.percent)} {progress.done}/{progress.total} tasks (
                          {progress.percent}%)
                        </Text>
                        <TouchableOpacity
                          style={styles.projectNoteBtn}
                          onPress={() => onProjectNote(project)}
                        >
                          <Text allowFontScaling={false} style={styles.projectNoteText}>
                            {project.notePath ? '📂 Note' : '📝 Note'}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {projectTasks.map((task, idx) => (
                        <View key={task.uid} style={styles.taskRow}>
                          <Text allowFontScaling={false} style={styles.treeStem}>
                            {idx === projectTasks.length - 1 ? '└─' : '├─'}
                          </Text>
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
                          {'   + Add task to project…'}
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
  areaTap: { flex: 1 },
  areaEditLink: { fontSize: 11, fontWeight: 'bold', color: '#000000', paddingLeft: 6 },
  areaEditing: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    padding: 6,
    marginBottom: 4,
    backgroundColor: '#ffffff',
  },
  areaEditRow: { flexDirection: 'row', alignItems: 'center' },
  areaInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
    fontSize: 12,
    color: '#000000',
  },
  iconBtn: {
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: 6,
  },
  iconBtnText: { fontSize: 14, color: '#000000' },
  iconStrip: { flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 4 },
  iconChoice: {
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginRight: 4,
    marginBottom: 4,
  },
  iconChoiceText: { fontSize: 14, color: '#000000' },
  areaConfirm: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    padding: 6,
    marginBottom: 4,
    backgroundColor: '#ffffff',
  },
  areaConfirmText: { fontSize: 11, color: '#000000', marginBottom: 6 },
  rowBtn: {
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 6,
    marginTop: 6,
  },
  rowBtnText: { fontSize: 11, fontWeight: 'bold', color: '#000000' },
  addRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  addInput: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginRight: 6,
    fontSize: 13,
    color: '#000000',
  },
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
    flexDirection: 'row',
    alignItems: 'center',
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
  projectHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  projectNameBtn: { flex: 1, paddingRight: 6 },
  projectName: { fontSize: 14, fontWeight: 'bold', color: '#000000' },
  projectDueBtn: {
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  projectDueText: { fontSize: 11, fontWeight: 'bold', color: '#000000' },
  projectNoteBtn: {
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  projectNoteText: { fontSize: 11, fontWeight: 'bold', color: '#000000' },
  treeStem: { fontSize: 11, color: '#606060', marginRight: 4 },
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
