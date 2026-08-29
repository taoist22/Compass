import React from 'react';
import { FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ParaFolderEntry } from '../supernote/exportService';
import { ParaRootKind } from '../domain/paraStorage';

interface ExistingParaFoldersModalProps {
  visible: boolean;
  kind: ParaRootKind;
  root: string;
  folders: ParaFolderEntry[];
  existing: Array<{ name: string; folder?: string }>;
  onClose: () => void;
  onImport: (folder: ParaFolderEntry, archiveAs?: 'project' | 'area' | 'resource') => void;
}

export function ExistingParaFoldersModal({
  visible,
  kind,
  root,
  folders,
  existing,
  onClose,
  onImport,
}: ExistingParaFoldersModalProps): React.JSX.Element {
  const linkedPaths = new Set(existing.map(item => item.folder).filter(Boolean));
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headingText}>
              <Text allowFontScaling={false} style={styles.title}>Existing {kind}</Text>
              <Text allowFontScaling={false} style={styles.root} numberOfLines={2}>{root}</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text allowFontScaling={false} style={styles.closeText}>Done</Text>
            </TouchableOpacity>
          </View>
          <Text allowFontScaling={false} style={styles.help}>
            {kind === 'archive'
              ? 'Choose what each archived folder represents. Nothing is inferred from its name.'
              : 'Nothing is assumed. Add or associate only the folders you choose below.'}
          </Text>
          {folders.length === 0 ? (
            <Text allowFontScaling={false} style={styles.empty}>No child folders found.</Text>
          ) : (
            <FlatList
              data={folders}
              keyExtractor={item => item.path}
              renderItem={({ item }) => {
                const linked = linkedPaths.has(item.path);
                const sameName = existing.some(current => current.name.toLowerCase() === item.name.toLowerCase());
                return (
                  <View style={[styles.row, kind === 'archive' && styles.archiveRow]}>
                    <Text allowFontScaling={false} style={styles.name} numberOfLines={1}>📁 {item.name}</Text>
                    {kind === 'archive' ? (
                      <View style={styles.archiveActions}>
                        {linked ? (
                          <View style={[styles.action, styles.actionDisabled]}>
                            <Text allowFontScaling={false} style={styles.actionText}>Linked</Text>
                          </View>
                        ) : (['project', 'area', 'resource'] as const).map(type => (
                          <TouchableOpacity key={type} style={styles.archiveAction} onPress={() => onImport(item, type)}>
                            <Text allowFontScaling={false} style={styles.actionText}>{type[0].toUpperCase()}{type.slice(1)}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : (
                      <TouchableOpacity
                        disabled={linked}
                        style={[styles.action, linked && styles.actionDisabled]}
                        onPress={() => onImport(item)}
                      >
                        <Text allowFontScaling={false} style={styles.actionText}>
                          {linked ? 'Linked' : sameName ? 'Associate' : 'Add'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', padding: 24, justifyContent: 'center' },
  card: { maxHeight: '82%', backgroundColor: '#ffffff', borderWidth: 2, borderColor: '#000000', borderRadius: 8, padding: 12 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  headingText: { flex: 1 },
  title: { fontSize: 17, fontWeight: 'bold', color: '#000000', textTransform: 'capitalize' },
  root: { fontSize: 11, fontFamily: 'monospace', color: '#404040', marginTop: 2 },
  closeButton: { borderWidth: 1, borderColor: '#000000', borderRadius: 5, paddingVertical: 7, paddingHorizontal: 14 },
  closeText: { fontSize: 13, fontWeight: 'bold', color: '#000000' },
  help: { fontSize: 13, color: '#202020', marginBottom: 8 },
  empty: { fontSize: 14, color: '#505050', paddingVertical: 18 },
  row: { minHeight: 46, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#c0c0c0', paddingVertical: 5 },
  archiveRow: { minHeight: 54 },
  name: { flex: 1, fontSize: 14, color: '#000000', paddingRight: 8 },
  action: { minWidth: 84, backgroundColor: '#000000', borderRadius: 5, paddingVertical: 8, paddingHorizontal: 10, alignItems: 'center' },
  actionDisabled: { backgroundColor: '#707070' },
  actionText: { fontSize: 12, fontWeight: 'bold', color: '#ffffff' },
  archiveActions: { flexDirection: 'row', alignItems: 'center' },
  archiveAction: { backgroundColor: '#000000', borderRadius: 5, paddingVertical: 8, paddingHorizontal: 9, marginLeft: 5 },
});
