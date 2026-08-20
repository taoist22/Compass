import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Area, Project, ProjectStatus } from '../domain/types';
import { projectOverdue, projectsByArea } from '../domain/taskListView';

/** Short, unambiguous, and what the field accepts back. */
function formatProjectDue(due?: Date): string {
  if (!due) return '';
  return `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(
    due.getDate()
  ).padStart(2, '0')}`;
}

interface AreaManagerModalProps {
  visible: boolean;
  areas: Area[];
  projects: Project[];
  /** Done and total for a project, so progress is visible where it matters. */
  progressFor: (projectId: string) => { done: number; total: number };
  onRenameProject: (projectId: string, name: string) => void;
  onSetProjectStatus: (projectId: string, status: ProjectStatus) => void;
  onDeleteProject: (projectId: string) => void;
  onCreateProject: (name: string) => void;
  onSetProjectDue: (projectId: string, text: string) => void;
  /** Moves a project to the next area; areas are few, so a tap beats a picker. */
  onCycleProjectArea: (projectId: string) => void;
  /** How many tasks each area holds, so deleting can say what it affects. */
  countFor: (areaId: string) => number;
  onRename: (areaId: string, name: string) => void;
  onDelete: (areaId: string) => void;
  onCreate: (name: string) => void;
  onClose: () => void;
}

/**
 * Renaming and deleting areas.
 *
 * Deliberately not nested inside the task list: two modals stacked at once is
 * unreliable on this runtime, so the caller closes the list first and reopens
 * it afterwards, which reads as one continuous place.
 */
export function AreaManagerModal({
  visible,
  areas,
  projects,
  progressFor,
  countFor,
  onRenameProject,
  onSetProjectStatus,
  onDeleteProject,
  onCreateProject,
  onSetProjectDue,
  onCycleProjectArea,
  onRename,
  onDelete,
  onCreate,
  onClose,
}: AreaManagerModalProps): React.JSX.Element {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [newName, setNewName] = useState<string>('');
  const [newProjectName, setNewProjectName] = useState<string>('');
  const [dueDrafts, setDueDrafts] = useState<Record<string, string>>({});

  const nameFor = (area: Area) => drafts[area.id] ?? area.name;

  const commitRename = (area: Area) => {
    const next = (drafts[area.id] ?? '').trim();
    // An empty box is a slip, not a request to have an unnamed area.
    if (!next || next === area.name) {
      setDrafts(d => ({ ...d, [area.id]: area.name }));
      return;
    }
    onRename(area.id, next);
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text allowFontScaling={false} style={styles.headerTitle}>
              Areas &amp; Projects
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Text allowFontScaling={false} style={styles.close}>
                ✕ Done
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {areas.length === 0 && (
              <Text allowFontScaling={false} style={styles.empty}>
                No areas yet. Add one below, or from a task.
              </Text>
            )}

            {areas.map(area => (
              <View key={area.id} style={styles.row}>
                {confirmingId === area.id ? (
                  /* Confirmed in place rather than in a second modal, which
                     this runtime does not stack reliably. */
                  <>
                    <Text allowFontScaling={false} style={styles.confirmText}>
                      Delete "{area.name}"? Its {countFor(area.id)} task
                      {countFor(area.id) === 1 ? '' : 's'} stay, unfiled.
                    </Text>
                    <TouchableOpacity
                      style={styles.confirmBtn}
                      onPress={() => {
                        onDelete(area.id);
                        setConfirmingId(null);
                      }}
                    >
                      <Text allowFontScaling={false} style={styles.confirmBtnText}>
                        Delete
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.confirmBtn} onPress={() => setConfirmingId(null)}>
                      <Text allowFontScaling={false} style={styles.confirmBtnText}>
                        Cancel
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TextInput
                      style={styles.nameInput}
                      value={nameFor(area)}
                      onChangeText={text => setDrafts(d => ({ ...d, [area.id]: text }))}
                      onEndEditing={() => commitRename(area)}
                      autoCorrect={false}
                    />
                    <Text allowFontScaling={false} style={styles.count}>
                      {countFor(area.id)}
                    </Text>
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => setConfirmingId(area.id)}
                    >
                      <Text allowFontScaling={false} style={styles.deleteText}>
                        ✕
                      </Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            ))}
          </ScrollView>

          {/* Projects sit below Areas rather than in their own sheet: the
              distinction between them is the point, and seeing both together
              is what teaches it. */}
          <Text allowFontScaling={false} style={styles.sectionHeading}>
            Projects
          </Text>
          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {projects.length === 0 && (
              <Text allowFontScaling={false} style={styles.empty}>
                No projects. An area never finishes; a project does.
              </Text>
            )}

            {projectsByArea(projects, areas).map(group => (
              <View key={group.areaId || '__none'}>
                {/* Nested under the area that holds them: an area contains
                    projects, a project finishes. Two flat lists would make
                    choosing between them arbitrary. */}
                <Text allowFontScaling={false} style={styles.areaHeading}>
                  {group.label}
                </Text>
                {group.projects.map(project => {
              const progress = progressFor(project.id);
              return (
                <View key={project.id} style={styles.row}>
                  {confirmingId === project.id ? (
                    <>
                      <Text allowFontScaling={false} style={styles.confirmText}>
                        Delete "{project.name}"? Its {progress.total} task
                        {progress.total === 1 ? '' : 's'} stay, unassigned.
                      </Text>
                      <TouchableOpacity
                        style={styles.confirmBtn}
                        onPress={() => {
                          onDeleteProject(project.id);
                          setConfirmingId(null);
                        }}
                      >
                        <Text allowFontScaling={false} style={styles.confirmBtnText}>
                          Delete
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.confirmBtn}
                        onPress={() => setConfirmingId(null)}
                      >
                        <Text allowFontScaling={false} style={styles.confirmBtnText}>
                          Cancel
                        </Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <TextInput
                        style={styles.nameInput}
                        value={drafts[project.id] ?? project.name}
                        onChangeText={text => setDrafts(d => ({ ...d, [project.id]: text }))}
                        onEndEditing={() => {
                          const next = (drafts[project.id] ?? '').trim();
                          if (!next || next === project.name) {
                            setDrafts(d => ({ ...d, [project.id]: project.name }));
                            return;
                          }
                          onRenameProject(project.id, next);
                        }}
                        autoCorrect={false}
                      />
                      <TextInput
                        style={styles.dueInput}
                        value={dueDrafts[project.id] ?? formatProjectDue(project.dueDate)}
                        onChangeText={text => setDueDrafts(d => ({ ...d, [project.id]: text }))}
                        onEndEditing={() => onSetProjectDue(project.id, dueDrafts[project.id] ?? '')}
                        placeholder="due"
                        placeholderTextColor="#909090"
                        autoCorrect={false}
                      />
                      <Text
                        allowFontScaling={false}
                        style={[styles.count, projectOverdue(project) && styles.countOverdue]}
                      >
                        {progress.done}/{progress.total}
                        {projectOverdue(project) ? ' !' : ''}
                      </Text>
                      {/* Cycles through the areas. Projects belong to one, and
                          with a handful of areas a tap is cheaper than another
                          picker on a crowded row. */}
                      <TouchableOpacity
                        style={styles.confirmBtn}
                        onPress={() => onCycleProjectArea(project.id)}
                      >
                        <Text allowFontScaling={false} style={styles.confirmBtnText}>
                          ↔
                        </Text>
                      </TouchableOpacity>
                      {/* Finishing is what a project can do that an area cannot. */}
                      <TouchableOpacity
                        style={styles.confirmBtn}
                        onPress={() =>
                          onSetProjectStatus(
                            project.id,
                            project.status === 'active' ? 'done' : 'active'
                          )
                        }
                      >
                        <Text allowFontScaling={false} style={styles.confirmBtnText}>
                          {project.status === 'active' ? 'Done' : 'Reopen'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => setConfirmingId(project.id)}
                      >
                        <Text allowFontScaling={false} style={styles.deleteText}>
                          ✕
                        </Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              );
            })}
              </View>
            ))}
          </ScrollView>

          <View style={styles.addRow}>
            <TextInput
              style={styles.nameInput}
              value={newProjectName}
              onChangeText={setNewProjectName}
              placeholder="New project name"
              placeholderTextColor="#707070"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => {
                const name = newProjectName.trim();
                if (!name) return;
                onCreateProject(name);
                setNewProjectName('');
              }}
            >
              <Text allowFontScaling={false} style={styles.addBtnText}>
                Add
              </Text>
            </TouchableOpacity>
          </View>

          <Text allowFontScaling={false} style={styles.sectionHeading}>
            Areas
          </Text>

          <View style={styles.addRow}>
            <TextInput
              style={styles.nameInput}
              value={newName}
              onChangeText={setNewName}
              placeholder="New area name"
              placeholderTextColor="#707070"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => {
                const name = newName.trim();
                if (!name) return;
                onCreate(name);
                setNewName('');
              }}
            >
              <Text allowFontScaling={false} style={styles.addBtnText}>
                Add
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 8,
    padding: 12,
    width: '84%',
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: '#000000',
    paddingBottom: 6,
    marginBottom: 6,
  },
  headerTitle: { fontSize: 16, fontWeight: 'bold', color: '#000000' },
  close: { fontSize: 14, fontWeight: 'bold', color: '#000000' },
  list: { marginBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#d0d0d0',
    paddingVertical: 6,
  },
  nameInput: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 13,
    color: '#000000',
  },
  count: { fontSize: 12, color: '#505050', paddingHorizontal: 8 },
  deleteBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  deleteText: { fontSize: 14, color: '#606060' },
  confirmText: { flex: 1, fontSize: 12, color: '#000000', paddingRight: 6 },
  confirmBtn: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginLeft: 4,
  },
  confirmBtnText: { fontSize: 12, fontWeight: 'bold', color: '#000000' },
  addRow: { flexDirection: 'row', alignItems: 'center' },
  addBtn: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginLeft: 6,
    backgroundColor: '#ffffff',
  },
  addBtnText: { fontSize: 13, fontWeight: 'bold', color: '#000000' },
  empty: { fontSize: 13, color: '#505050', textAlign: 'center', paddingVertical: 16 },
  areaHeading: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#303030',
    paddingTop: 6,
    paddingHorizontal: 4,
  },
  dueInput: {
    width: 74,
    borderWidth: 1,
    borderColor: '#909090',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    marginLeft: 4,
    fontSize: 11,
    color: '#000000',
  },
  countOverdue: { fontWeight: 'bold', color: '#000000' },
  sectionHeading: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000000',
    backgroundColor: '#e8e8e8',
    paddingVertical: 3,
    paddingHorizontal: 6,
    marginTop: 6,
  },
});
