import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Area } from '../domain/types';

interface AreaManagerModalProps {
  visible: boolean;
  areas: Area[];
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
  countFor,
  onRename,
  onDelete,
  onCreate,
  onClose,
}: AreaManagerModalProps): React.JSX.Element {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [newName, setNewName] = useState<string>('');

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
              Manage Areas
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
});
