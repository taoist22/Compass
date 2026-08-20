import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CalendarTask } from '../domain/types';
import { statusGlyph, taskRowLabel, taskStatus } from '../domain/taskModel';
import {
  TASK_GROUPINGS,
  TASK_SCOPES,
  TaskGrouping,
  TaskScope,
  countGrouped,
  filterByScope,
  groupTasks,
  groupingLabel,
  scopeLabel,
} from '../domain/taskListView';

interface TaskListModalProps {
  visible: boolean;
  tasks: CalendarTask[];
  onClose: () => void;
  onToggle: (task: CalendarTask) => void;
  onEdit: (task: CalendarTask) => void;
}

/**
 * Every task in one place, which is where status and priority finally become
 * useful — until now they were a glyph on rows scattered across the Day View
 * and the month strip.
 *
 * Driven entirely by discrete taps. This display ghosts badly on frequent
 * redraws, so there is no search-as-you-type: you pick a scope and a grouping,
 * and the list repaints once.
 */
export function TaskListModal({
  visible,
  tasks,
  onClose,
  onToggle,
  onEdit,
}: TaskListModalProps): React.JSX.Element {
  const [scope, setScope] = useState<TaskScope>('open');
  const [grouping, setGrouping] = useState<TaskGrouping>('due');

  const groups = groupTasks(filterByScope(tasks, scope), grouping);
  const total = countGrouped(groups);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text allowFontScaling={false} style={styles.headerTitle}>
              ☑ All Tasks ({total})
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Text allowFontScaling={false} style={styles.close}>
                ✕ Close
              </Text>
            </TouchableOpacity>
          </View>

          <Text allowFontScaling={false} style={styles.filterLabel}>
            Show
          </Text>
          <View style={styles.chipRow}>
            {TASK_SCOPES.map(s => (
              <TouchableOpacity
                key={s}
                style={[styles.chip, scope === s && styles.chipActive]}
                onPress={() => setScope(s)}
              >
                <Text
                  allowFontScaling={false}
                  style={[styles.chipText, scope === s && styles.chipTextActive]}
                >
                  {scopeLabel(s)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text allowFontScaling={false} style={styles.filterLabel}>
            Group by
          </Text>
          <View style={styles.chipRow}>
            {TASK_GROUPINGS.map(g => (
              <TouchableOpacity
                key={g}
                style={[styles.chip, grouping === g && styles.chipActive]}
                onPress={() => setGrouping(g)}
              >
                <Text
                  allowFontScaling={false}
                  style={[styles.chipText, grouping === g && styles.chipTextActive]}
                >
                  {groupingLabel(g)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {groups.length === 0 ? (
              <Text allowFontScaling={false} style={styles.empty}>
                Nothing here.
              </Text>
            ) : (
              groups.map(group => (
                <View key={group.key}>
                  {group.label ? (
                    <Text allowFontScaling={false} style={styles.groupHeading}>
                      {group.label} ({group.tasks.length})
                    </Text>
                  ) : null}

                  {group.tasks.map(task => (
                    <View key={task.uid} style={styles.row}>
                      <TouchableOpacity onPress={() => onToggle(task)} style={styles.check}>
                        <Text allowFontScaling={false} style={styles.checkText}>
                          {statusGlyph(taskStatus(task))}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.rowBody} onPress={() => onEdit(task)}>
                        <Text
                          allowFontScaling={false}
                          numberOfLines={1}
                          style={[styles.rowText, task.completed && styles.rowTextDone]}
                        >
                          {taskRowLabel(task, true)}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ))
            )}
          </ScrollView>
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
    width: '88%',
    maxHeight: '86%',
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
  filterLabel: { fontSize: 11, fontWeight: 'bold', color: '#505050', marginTop: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 },
  chip: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    marginRight: 5,
    marginTop: 4,
    backgroundColor: '#ffffff',
  },
  chipActive: { backgroundColor: '#000000' },
  chipText: { fontSize: 12, fontWeight: 'bold', color: '#000000' },
  chipTextActive: { color: '#ffffff' },
  list: { marginTop: 6 },
  groupHeading: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000000',
    backgroundColor: '#e8e8e8',
    paddingVertical: 3,
    paddingHorizontal: 6,
    marginTop: 8,
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#d0d0d0',
    paddingVertical: 7,
  },
  check: { paddingHorizontal: 6, paddingVertical: 2 },
  checkText: { fontSize: 16, color: '#000000' },
  rowBody: { flex: 1, paddingRight: 4 },
  rowText: { fontSize: 13, color: '#000000' },
  rowTextDone: { textDecorationLine: 'line-through', color: '#606060' },
  empty: { fontSize: 13, color: '#505050', textAlign: 'center', paddingVertical: 20 },
});
