import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Area, CalendarTask, Project } from '../domain/types';
import { isDone, statusGlyph, taskStatus } from '../domain/taskModel';
import { projectOverdue, projectProgress, ProjectLookup } from '../domain/taskListView';
import { ParaFilesPanel } from './ParaFilesPanel';
import { ParaFolderEntry } from '../supernote/exportService';
import { HandwritingTextInput, HandwritingTextInputHandle } from './HandwritingTextInput';
import { deriveProjectShortLabel, normalizeProjectShortLabel } from '../domain/projectLabel';

const DELIVERABLE_PREVIEW_LIMIT = 4;

interface DeliverableTaskRowProps {
  task: CalendarTask;
  index: number;
  total: number;
  onToggle: (task: CalendarTask) => void;
  onEdit: (task: CalendarTask) => void;
}

function DeliverableTaskRow({
  task,
  index,
  total,
  onToggle,
  onEdit,
}: DeliverableTaskRowProps): React.JSX.Element {
  return (
    <View style={styles.taskRow}>
      <Text allowFontScaling={false} style={styles.stem}>
        {index === total - 1 ? '└─' : '├─'}
      </Text>
      <TouchableOpacity onPress={() => onToggle(task)}>
        <Text allowFontScaling={false} style={styles.glyph}>
          {statusGlyph(taskStatus(task))}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.taskBody} onPress={() => onEdit(task)}>
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          style={[styles.taskText, isDone(task) && styles.taskDone]}
        >
          {task.title}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

interface ProjectDetailViewProps {
  project: Project;
  area?: Area;
  areas: Area[];
  tasks: CalendarTask[];
  projectOf: (uid: string) => string | undefined;
  /** Notes associated with this project's events. */
  linkedNotes: Array<{ label: string; path: string }>;
  onBack: () => void;
  onSetDue: () => void;
  /** Assigns the project directly to the selected Area, or removes its Area. */
  onAssignArea: (areaId?: string) => void;
  onCreateArea: (name: string) => string | undefined;
  /** A project is renamed, finished and deleted here, where it lives. */
  onRename: (name: string, shortLabel?: string) => void;
  onToggleStatus: () => void;
  onArchive: () => void;
  /** Repairs a PARA classification without deleting and recreating files. */
  onConvertToArea: () => void;
  onDelete: () => void;
  folder: string;
  onListEntries: (folder: string) => Promise<ParaFolderEntry[]>;
  onNewNote: (name: string, folder: string) => Promise<void>;
  onChooseFolder: (folder: string) => Promise<void>;
  onOpenFile: (path: string) => void;
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
  areas,
  tasks,
  projectOf,
  linkedNotes,
  onBack,
  onSetDue,
  onAssignArea,
  onCreateArea,
  onRename,
  onToggleStatus,
  onArchive,
  onConvertToArea,
  onDelete,
  folder,
  onListEntries,
  onNewNote,
  onChooseFolder,
  onOpenFile,
  onOpenNote,
  onAddTask,
  onToggleTask,
  onEditTask,
}: ProjectDetailViewProps): React.JSX.Element {
  const lookup: ProjectLookup = { projectOf, nameOf: () => project.name };
  const progress = projectProgress(tasks, project.id, lookup);
  const mine = tasks.filter(t => projectOf(t.uid) === project.id);
  const actionableDeliverables = mine.filter(task => !isDone(task));
  const completedDeliverables = mine
    .filter(isDone)
    .sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0));
  const overdue = projectOverdue(project);

  const [renaming, setRenaming] = React.useState<boolean>(false);
  const [draftName, setDraftName] = React.useState<string>(project.name);
  const [draftShortLabel, setDraftShortLabel] = React.useState<string>(project.shortLabel || '');
  const draftNameInputRef = React.useRef<HandwritingTextInputHandle>(null);
  const draftShortLabelInputRef = React.useRef<HandwritingTextInputHandle>(null);
  const [confirmingDelete, setConfirmingDelete] = React.useState<boolean>(false);
  const [confirmingConversion, setConfirmingConversion] = React.useState<boolean>(false);
  const [areaPickerOpen, setAreaPickerOpen] = React.useState<boolean>(false);
  const [addingArea, setAddingArea] = React.useState<boolean>(false);
  const [newAreaName, setNewAreaName] = React.useState<string>('');
  const newAreaInputRef = React.useRef<HandwritingTextInputHandle>(null);
  const [deliverablesView, setDeliverablesView] = React.useState<'actionable' | 'completed' | null>(null);

  const commitRename = () => {
    const next = (draftNameInputRef.current?.getValue() ?? draftName).trim();
    const nextShortLabel = normalizeProjectShortLabel(
      draftShortLabelInputRef.current?.getValue() ?? draftShortLabel
    );
    // A blank field is a mistake, not a request to lose the name.
    if (next) {
      onRename(next, nextShortLabel);
    }
    setRenaming(false);
  };

  if (deliverablesView) {
    const focusedTasks = deliverablesView === 'actionable'
      ? actionableDeliverables
      : completedDeliverables;
    const focusedTitle = deliverablesView === 'actionable'
      ? 'Actionable Deliverables'
      : 'Completed Deliverables';

    return (
      <View style={styles.root}>
        <View style={styles.focusedHeader}>
          <TouchableOpacity style={styles.backBtn} onPress={() => setDeliverablesView(null)}>
            <Text allowFontScaling={false} style={styles.breadcrumb}>‹ Project</Text>
          </TouchableOpacity>
          <Text allowFontScaling={false} style={styles.focusedTitle} numberOfLines={1}>
            {focusedTitle} ({focusedTasks.length})
          </Text>
          {deliverablesView === 'actionable' && (
            <TouchableOpacity style={styles.addTaskBtn} onPress={onAddTask}>
              <Text allowFontScaling={false} style={styles.addTask}>+ Add Task</Text>
            </TouchableOpacity>
          )}
        </View>
        <ScrollView style={styles.focusedList} keyboardShouldPersistTaps="always">
          {focusedTasks.length === 0 && (
            <Text allowFontScaling={false} style={styles.hint}>
              {deliverablesView === 'actionable' ? 'Nothing to do yet.' : 'Nothing completed yet.'}
            </Text>
          )}
          {focusedTasks.map((task, index) => (
            <DeliverableTaskRow
              key={task.uid}
              task={task}
              index={index}
              total={focusedTasks.length}
              onToggle={onToggleTask}
              onEdit={onEditTask}
            />
          ))}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.headerControls}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Text allowFontScaling={false} style={styles.breadcrumb}>
            ‹ Back
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.areaBtn}
          activeOpacity={1}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPressIn={() => setAreaPickerOpen(true)}
        >
          <Text allowFontScaling={false} style={styles.areaBtnText} numberOfLines={1}>
            {area ? `${area.icon ? `${area.icon} ` : ''}${area.name}` : 'No Area'}  {areaPickerOpen ? '▴' : '▾'}
          </Text>
        </TouchableOpacity>
        </View>
        {renaming ? (
          <>
            <HandwritingTextInput
              ref={draftNameInputRef}
              style={styles.titleInput}
              value={draftName}
              onChangeText={setDraftName}
              placeholder="Project name"
              placeholderTextColor="#707070"
              autoCorrect={false}
            />
            <HandwritingTextInput
              ref={draftShortLabelInputRef}
              style={styles.shortLabelInput}
              value={draftShortLabel}
              onChangeText={setDraftShortLabel}
              placeholder={`Day label: ${deriveProjectShortLabel(draftName)}`}
              placeholderTextColor="#707070"
              autoCorrect={false}
            />
            <TouchableOpacity style={styles.headBtn} onPress={commitRename}>
              <Text allowFontScaling={false} style={styles.headBtnText}>
                Done
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text allowFontScaling={false} style={styles.title} numberOfLines={1}>
            🚀 {project.name}
          </Text>
        )}
      </View>

      {areaPickerOpen && (
        <View style={styles.areaPicker}>
          <Text allowFontScaling={false} style={styles.areaPickerTitle}>Assign Project to Area</Text>
          <View style={styles.areaOptions}>
            <TouchableOpacity
              style={[styles.areaOption, styles.areaOptionNoArea, !area && styles.areaOptionSelected]}
              onPress={() => { onAssignArea(undefined); setAreaPickerOpen(false); }}
            >
              <Text allowFontScaling={false} style={styles.areaOptionText}>{!area ? '● ' : '○ '}No Area</Text>
            </TouchableOpacity>
            {areas.filter(candidate => !candidate.archived).map(candidate => {
              const selected = candidate.id === area?.id;
              return (
                <TouchableOpacity
                  key={candidate.id}
                  style={[styles.areaOption, selected && styles.areaOptionSelected]}
                  onPress={() => { onAssignArea(candidate.id); setAreaPickerOpen(false); }}
                >
                  <Text allowFontScaling={false} style={styles.areaOptionText} numberOfLines={1}>
                    {selected ? '● ' : '○ '}{candidate.icon ? `${candidate.icon} ` : ''}{candidate.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {!addingArea && (
              <TouchableOpacity style={[styles.areaOption, styles.addAreaOption]} onPress={() => setAddingArea(true)}>
                <Text allowFontScaling={false} style={styles.areaOptionText}>＋ Add Area</Text>
              </TouchableOpacity>
            )}
          </View>
          {addingArea && (
            <View style={styles.addAreaRow}>
              <HandwritingTextInput
                ref={newAreaInputRef}
                style={styles.addAreaInput}
                value={newAreaName}
                onChangeText={setNewAreaName}
                placeholder="New Area name"
                placeholderTextColor="#707070"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={styles.addAreaButton}
                onPress={() => {
                  const name = (newAreaInputRef.current?.getValue() ?? newAreaName).trim();
                  if (!name) return;
                  const id = onCreateArea(name);
                  if (id) onAssignArea(id);
                  setNewAreaName('');
                  setAddingArea(false);
                  setAreaPickerOpen(false);
                }}
              >
                <Text allowFontScaling={false} style={styles.areaOptionText}>Add</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addAreaButton} onPress={() => { setNewAreaName(''); setAddingArea(false); }}>
                <Text allowFontScaling={false} style={styles.areaOptionText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

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
          <TouchableOpacity
            style={styles.headBtn}
            onPress={() => {
              setDraftName(project.name);
              setDraftShortLabel(project.shortLabel || '');
              setRenaming(true);
            }}
          >
            <Text allowFontScaling={false} style={styles.headBtnText}>
              Rename
            </Text>
          </TouchableOpacity>
          {/* Finishing is what a project can do that an area cannot. */}
          <TouchableOpacity style={styles.headBtn} onPress={onToggleStatus}>
            <Text allowFontScaling={false} style={styles.headBtnText}>
              {project.status === 'active' ? 'Finish' : 'Reopen'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headBtn} onPress={onArchive}>
            <Text allowFontScaling={false} style={styles.headBtnText}>Archive</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headBtn} onPress={() => setConfirmingConversion(true)}>
            <Text allowFontScaling={false} style={styles.headBtnText}>Move to Areas</Text>
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

      {confirmingConversion && (
        <View style={styles.confirmRow}>
          <Text allowFontScaling={false} style={styles.confirmText}>
            Convert “{project.name}” to an ongoing Area? Its folder and filed items will be kept, but project due date and completion status will be removed.
          </Text>
          <View style={styles.metaActions}>
            <TouchableOpacity style={styles.headBtn} onPress={onConvertToArea}>
              <Text allowFontScaling={false} style={styles.headBtnText}>Convert to Area</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.headBtn} onPress={() => setConfirmingConversion(false)}>
              <Text allowFontScaling={false} style={styles.headBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <ScrollView style={styles.body} keyboardShouldPersistTaps="always">
        <Text allowFontScaling={false} style={styles.sectionHeading}>
          📁 Project Files
        </Text>
        <ParaFilesPanel
          itemKey={project.id}
          folder={folder}
          onListEntries={onListEntries}
          onOpenFile={onOpenFile}
          onNewNote={onNewNote}
          onChooseFolder={onChooseFolder}
        />

        <Text allowFontScaling={false} style={styles.sectionHeading}>
          📝 Associated Notes
        </Text>

        {/* Notes from this project's events. Empty until events are filed
            under it. */}
        {linkedNotes.map(note => (
          <TouchableOpacity key={note.path} style={styles.noteRow} onPress={() => onOpenNote(note.path)}>
            <Text allowFontScaling={false} style={styles.noteLabel} numberOfLines={1}>
              📂 {note.label}
            </Text>
          </TouchableOpacity>
        ))}

        {linkedNotes.length === 0 && (
          <Text allowFontScaling={false} style={styles.hint}>
            Notes appear here once an event is filed under this project.
          </Text>
        )}

        <View style={styles.deliverableCards}>
          <View style={[styles.deliverableCard, styles.deliverableCardFirst]}>
            <View style={styles.deliverableCardHeader}>
              <Text allowFontScaling={false} style={styles.deliverableCardTitle} numberOfLines={1}>
                ☑ Actionable Deliverables ({actionableDeliverables.length})
              </Text>
              <TouchableOpacity style={styles.addTaskBtn} onPress={onAddTask}>
                <Text allowFontScaling={false} style={styles.addTask}>+ Add Task</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.deliverablePreview}>
              {actionableDeliverables.length === 0 && (
                <Text allowFontScaling={false} style={styles.hint}>Nothing to do yet.</Text>
              )}
              {actionableDeliverables.slice(0, DELIVERABLE_PREVIEW_LIMIT).map((task, index) => (
                <DeliverableTaskRow
                  key={task.uid}
                  task={task}
                  index={index}
                  total={Math.min(actionableDeliverables.length, DELIVERABLE_PREVIEW_LIMIT)}
                  onToggle={onToggleTask}
                  onEdit={onEditTask}
                />
              ))}
            </View>
            {actionableDeliverables.length > 0 && (
              <TouchableOpacity style={styles.openDeliverablesBtn} onPress={() => setDeliverablesView('actionable')}>
                <Text allowFontScaling={false} style={styles.openDeliverablesText}>
                  Open all {actionableDeliverables.length} ›
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.deliverableCard}>
            <View style={styles.deliverableCardHeader}>
              <Text allowFontScaling={false} style={styles.deliverableCardTitle} numberOfLines={1}>
                ✓ Completed Deliverables ({completedDeliverables.length})
              </Text>
            </View>
            <View style={styles.deliverablePreview}>
              {completedDeliverables.length === 0 && (
                <Text allowFontScaling={false} style={styles.hint}>Nothing completed yet.</Text>
              )}
              {completedDeliverables.slice(0, DELIVERABLE_PREVIEW_LIMIT).map((task, index) => (
                <DeliverableTaskRow
                  key={task.uid}
                  task={task}
                  index={index}
                  total={Math.min(completedDeliverables.length, DELIVERABLE_PREVIEW_LIMIT)}
                  onToggle={onToggleTask}
                  onEdit={onEditTask}
                />
              ))}
            </View>
            {completedDeliverables.length > 0 && (
              <TouchableOpacity style={styles.openDeliverablesBtn} onPress={() => setDeliverablesView('completed')}>
                <Text allowFontScaling={false} style={styles.openDeliverablesText}>
                  Open all {completedDeliverables.length} ›
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
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
    borderBottomWidth: 2,
    borderBottomColor: '#000000',
    paddingBottom: 6,
  },
  headerControls: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  backBtn: { minHeight: 42, minWidth: 104, borderWidth: 1, borderColor: '#000000', borderRadius: 5, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  breadcrumb: { fontSize: 14, fontWeight: 'bold', color: '#000000' },
  areaBtn: {
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 5,
    minHeight: 42,
    width: 104,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  areaBtnText: { fontSize: 14, fontWeight: 'bold', color: '#000000' },
  areaPicker: { borderWidth: 2, borderColor: '#000000', borderRadius: 5, padding: 8, marginBottom: 8, backgroundColor: '#ffffff' },
  areaPickerTitle: { fontSize: 13, fontWeight: 'bold', color: '#000000', marginBottom: 6 },
  areaOptions: { flexDirection: 'row', flexWrap: 'wrap' },
  areaOption: { minHeight: 40, minWidth: 150, borderWidth: 1, borderColor: '#000000', borderRadius: 4, justifyContent: 'center', paddingHorizontal: 10, marginRight: 6, marginBottom: 6 },
  areaOptionNoArea: { minWidth: 0, width: 112 },
  addAreaOption: { minWidth: 0, width: 150, backgroundColor: '#eeeeee' },
  areaOptionSelected: { backgroundColor: '#e2e2e2', borderWidth: 2 },
  areaOptionText: { fontSize: 13, fontWeight: 'bold', color: '#000000' },
  addAreaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  addAreaInput: { flex: 1, minHeight: 40, borderWidth: 1, borderColor: '#000000', paddingHorizontal: 8, fontSize: 13, color: '#000000' },
  addAreaButton: { minHeight: 40, minWidth: 76, borderWidth: 1, borderColor: '#000000', alignItems: 'center', justifyContent: 'center', marginLeft: 6, paddingHorizontal: 8 },
  title: { flex: 1, fontSize: 18, fontWeight: 'bold', color: '#000000' },
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
  shortLabelInput: {
    width: 150,
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginLeft: 6,
    fontSize: 13,
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
  headBtnText: { fontSize: 13, fontWeight: 'bold', color: '#000000' },
  metaActions: { flexDirection: 'row', alignItems: 'center' },
  confirmRow: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    padding: 8,
    marginBottom: 6,
    backgroundColor: '#ffffff',
  },
  confirmText: { fontSize: 14, color: '#000000' },
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
  dueText: { fontSize: 14, fontWeight: 'bold', color: '#000000' },
  progressText: { fontSize: 14, color: '#000000' },
  body: { flex: 1 },
  sectionHeading: {
    fontSize: 15,
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
  noteLabel: { fontSize: 14, fontWeight: 'bold', color: '#000000' },
  hint: { fontSize: 14, color: '#505050', paddingHorizontal: 4, paddingBottom: 6 },
  deliverableCards: { flexDirection: 'row', marginTop: 8, marginBottom: 8 },
  deliverableCard: {
    flex: 1,
    height: 280,
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    padding: 8,
    backgroundColor: '#ffffff',
  },
  deliverableCardFirst: { marginRight: 10 },
  deliverableCardHeader: { minHeight: 40, flexDirection: 'row', alignItems: 'center' },
  deliverableCardTitle: { flex: 1, fontSize: 15, fontWeight: 'bold', color: '#000000' },
  deliverablePreview: { flex: 1 },
  openDeliverablesBtn: {
    minHeight: 36,
    borderTopWidth: 1,
    borderTopColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  openDeliverablesText: { fontSize: 14, fontWeight: 'bold', color: '#000000' },
  addTaskBtn: {
    minHeight: 34,
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 4,
    justifyContent: 'center',
    paddingHorizontal: 10,
    marginLeft: 8,
  },
  addTask: { fontSize: 14, fontWeight: 'bold', color: '#000000' },
  taskRow: { flexDirection: 'row', alignItems: 'center', minHeight: 42, paddingVertical: 5 },
  stem: { fontSize: 13, color: '#606060', marginRight: 4 },
  glyph: { fontSize: 17, color: '#000000', marginRight: 6 },
  taskBody: { flex: 1 },
  taskText: { fontSize: 15, color: '#000000' },
  taskDone: { textDecorationLine: 'line-through', color: '#606060' },
  focusedHeader: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: '#000000',
    paddingBottom: 6,
  },
  focusedTitle: { flex: 1, fontSize: 18, fontWeight: 'bold', color: '#000000' },
  focusedList: { flex: 1, paddingTop: 8 },
});
