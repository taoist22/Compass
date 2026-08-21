import React from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Area, CalendarTask, Project } from '../domain/types';
import { isDone, statusGlyph, taskStatus } from '../domain/taskModel';
import { projectOverdue, projectProgress, ProjectLookup } from '../domain/taskListView';

interface ProjectDetailViewProps {
  project: Project;
  area?: Area;
  tasks: CalendarTask[];
  projectOf: (uid: string) => string | undefined;
  /** Notes belonging to this project's events: the meeting ledger. */
  linkedNotes: Array<{ label: string; path: string }>;
  onBack: () => void;
  onSetDue: () => void;
  /** Moves the project to the next area. Shown in the breadcrumb, where the
   *  wrong one is noticed. */
  onCycleArea: () => void;
  /** A project is renamed, finished and deleted here, where it lives. */
  onRename: (name: string) => void;
  onToggleStatus: () => void;
  onDelete: () => void;
  onOpenNotebook: () => void;
  onOpenNote: (path: string) => void;
  onAddTask: () => void;
  onToggleTask: (task: CalendarTask) => void;
  onEditTask: (task: CalendarTask) => void;
}

/**
 * One project: what it is for, how far along, what is written about it, and
 * what is left to do.
 *
 * The notebooks are the reason this screen exists rather than being a filtered
 * task list. A project that holds only tasks is a to-do list with a name.
 */
export function ProjectDetailView({
  project,
  area,
  tasks,
  projectOf,
  linkedNotes,
  onBack,
  onSetDue,
  onCycleArea,
  onRename,
  onToggleStatus,
  onDelete,
  onOpenNotebook,
  onOpenNote,
  onAddTask,
  onToggleTask,
  onEditTask,
}: ProjectDetailViewProps): React.JSX.Element {
  const lookup: ProjectLookup = { projectOf, nameOf: () => project.name };
  const progress = projectProgress(tasks, project.id, lookup);
  const mine = tasks.filter(t => projectOf(t.uid) === project.id);
  const overdue = projectOverdue(project);

  const [renaming, setRenaming] = React.useState<boolean>(false);
  const [draftName, setDraftName] = React.useState<string>(project.name);
  const [confirmingDelete, setConfirmingDelete] = React.useState<boolean>(false);

  const commitRename = () => {
    const next = draftName.trim();
    // A blank field is a mistake, not a request to lose the name.
    if (next && next !== project.name) onRename(next);
    setRenaming(false);
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text allowFontScaling={false} style={styles.breadcrumb}>
            ‹ Back
          </Text>
        </TouchableOpacity>

        {/* Settable here, where a wrong area is actually noticed — the
            breadcrumb already names it, so it should also change it. */}
        <TouchableOpacity style={styles.areaBtn} onPress={onCycleArea}>
          <Text allowFontScaling={false} style={styles.areaBtnText} numberOfLines={1}>
            {area ? `${area.icon ? `${area.icon} ` : ''}${area.name}` : 'No Area'} ›
          </Text>
        </TouchableOpacity>
        {renaming ? (
          <TextInput
            style={styles.titleInput}
            value={draftName}
            onChangeText={setDraftName}
            autoCorrect={false}
            onEndEditing={commitRename}
          />
        ) : (
          <TouchableOpacity
            style={styles.titleTap}
            onPress={() => {
              setDraftName(project.name);
              setRenaming(true);
            }}
          >
            <Text allowFontScaling={false} style={styles.title} numberOfLines={1}>
              🚀 {project.name}
            </Text>
          </TouchableOpacity>
        )}

        {renaming && (
          <TouchableOpacity style={styles.headBtn} onPress={commitRename}>
            <Text allowFontScaling={false} style={styles.headBtnText}>
              Done
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.metaRow}>
        <TouchableOpacity style={styles.dueBtn} onPress={onSetDue}>
          <Text allowFontScaling={false} style={styles.dueText}>
            {project.dueDate
              ? `${overdue ? '⚠' : '📅'} Due ${project.dueDate.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}`
              : '📅 Set a due date'}
          </Text>
        </TouchableOpacity>
        <Text allowFontScaling={false} style={styles.progressText}>
          {bar(progress.percent)} {progress.done}/{progress.total} tasks ({progress.percent}%)
        </Text>

        <View style={styles.metaActions}>
          {/* Finishing is what a project can do that an area cannot. */}
          <TouchableOpacity style={styles.headBtn} onPress={onToggleStatus}>
            <Text allowFontScaling={false} style={styles.headBtnText}>
              {project.status === 'active' ? 'Finish' : 'Reopen'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headBtn} onPress={() => setConfirmingDelete(true)}>
            <Text allowFontScaling={false} style={styles.headBtnText}>
              Delete
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {confirmingDelete && (
        <View style={styles.confirmRow}>
          <Text allowFontScaling={false} style={styles.confirmText}>
            Delete "{project.name}"? Its {mine.length} task{mine.length === 1 ? '' : 's'} and any
            notebooks are kept — only the project goes.
          </Text>
          <View style={styles.metaActions}>
            <TouchableOpacity style={styles.headBtn} onPress={onDelete}>
              <Text allowFontScaling={false} style={styles.headBtnText}>
                Delete
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.headBtn} onPress={() => setConfirmingDelete(false)}>
              <Text allowFontScaling={false} style={styles.headBtnText}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <ScrollView style={styles.body}>
        <Text allowFontScaling={false} style={styles.sectionHeading}>
          📝 Associated Notebooks
        </Text>

        <TouchableOpacity style={styles.noteRow} onPress={onOpenNotebook}>
          <Text allowFontScaling={false} style={styles.noteLabel} numberOfLines={1}>
            {project.notePath
              ? `📂 Project Notebook: ${project.notePath.split('/').pop()}`
              : '📝 Create the project notebook'}
          </Text>
        </TouchableOpacity>

        {/* Notes from this project's events. Empty until events are filed
            under it, which is what the ledger is: a record of what was said. */}
        {linkedNotes.map(note => (
          <TouchableOpacity key={note.path} style={styles.noteRow} onPress={() => onOpenNote(note.path)}>
            <Text allowFontScaling={false} style={styles.noteLabel} numberOfLines={1}>
              📂 {note.label}
            </Text>
          </TouchableOpacity>
        ))}

        {linkedNotes.length === 0 && (
          <Text allowFontScaling={false} style={styles.hint}>
            Meeting notes appear here once an event is filed under this project.
          </Text>
        )}

        <View style={styles.deliverablesHead}>
          <Text allowFontScaling={false} style={styles.sectionHeading}>
            ☑ Actionable Deliverables ({mine.length})
          </Text>
          <TouchableOpacity onPress={onAddTask}>
            <Text allowFontScaling={false} style={styles.addTask}>
              + Add Task
            </Text>
          </TouchableOpacity>
        </View>

        {mine.length === 0 && (
          <Text allowFontScaling={false} style={styles.hint}>
            Nothing to do yet.
          </Text>
        )}

        {mine.map((task, idx) => (
          <View key={task.uid} style={styles.taskRow}>
            <Text allowFontScaling={false} style={styles.stem}>
              {idx === mine.length - 1 ? '└─' : '├─'}
            </Text>
            <TouchableOpacity onPress={() => onToggleTask(task)}>
              <Text allowFontScaling={false} style={styles.glyph}>
                {statusGlyph(taskStatus(task))}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.taskBody} onPress={() => onEditTask(task)}>
              <Text
                allowFontScaling={false}
                numberOfLines={1}
                style={[styles.taskText, isDone(task) && styles.taskDone]}
              >
                {task.title}
              </Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/** Blocks rather than a drawn bar; a View-based bar smears on e-ink. */
function bar(percent: number): string {
  const filled = Math.round((percent / 100) * 5);
  return '█'.repeat(filled) + '░'.repeat(5 - filled);
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: '#000000',
    paddingBottom: 6,
  },
  breadcrumb: { fontSize: 13, fontWeight: 'bold', color: '#000000', marginRight: 8 },
  areaBtn: {
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: 10,
    maxWidth: 180,
  },
  areaBtnText: { fontSize: 12, fontWeight: 'bold', color: '#000000' },
  titleTap: { flex: 1 },
  title: { fontSize: 16, fontWeight: 'bold', color: '#000000' },
  titleInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    fontSize: 15,
    fontWeight: 'bold',
    color: '#000000',
  },
  headBtn: {
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginLeft: 6,
  },
  headBtnText: { fontSize: 11, fontWeight: 'bold', color: '#000000' },
  metaActions: { flexDirection: 'row', alignItems: 'center' },
  confirmRow: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    padding: 8,
    marginBottom: 6,
    backgroundColor: '#ffffff',
  },
  confirmText: { fontSize: 11, color: '#000000' },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  dueBtn: {
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  dueText: { fontSize: 12, fontWeight: 'bold', color: '#000000' },
  progressText: { fontSize: 12, color: '#000000' },
  body: { flex: 1 },
  sectionHeading: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000000',
    backgroundColor: '#e8e8e8',
    paddingVertical: 3,
    paddingHorizontal: 6,
    marginTop: 8,
    marginBottom: 4,
  },
  noteRow: {
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 4,
    paddingVertical: 7,
    paddingHorizontal: 8,
    marginBottom: 5,
    backgroundColor: '#ffffff',
  },
  noteLabel: { fontSize: 12, fontWeight: 'bold', color: '#000000' },
  hint: { fontSize: 11, color: '#505050', paddingHorizontal: 4, paddingBottom: 6 },
  deliverablesHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addTask: { fontSize: 12, fontWeight: 'bold', color: '#000000' },
  taskRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  stem: { fontSize: 11, color: '#606060', marginRight: 4 },
  glyph: { fontSize: 15, color: '#000000', marginRight: 6 },
  taskBody: { flex: 1 },
  taskText: { fontSize: 13, color: '#000000' },
  taskDone: { textDecorationLine: 'line-through', color: '#606060' },
});
