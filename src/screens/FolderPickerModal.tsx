import React from 'react';
import { FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { listParaFolderEntries, listStorageRoots, ParaFolderEntry } from '../supernote/exportService';
import { normaliseFolderPath } from '../domain/paraStorage';

interface FolderPickerModalProps {
  visible: boolean;
  title: string;
  initialPath: string;
  onCancel: () => void;
  onSelect: (path: string) => void | Promise<void>;
}

function parentPath(path: string): string | null {
  const clean = normaliseFolderPath(path);
  if (clean === '/' || clean === '/storage') return null;
  const slash = clean.lastIndexOf('/');
  return slash <= 0 ? '/' : clean.slice(0, slash);
}

export function FolderPickerModal({
  visible,
  title,
  initialPath,
  onCancel,
  onSelect,
}: FolderPickerModalProps): React.JSX.Element {
  const [path, setPath] = React.useState(normaliseFolderPath(initialPath));
  const [roots, setRoots] = React.useState<string[]>(['/storage/emulated/0']);
  const [entries, setEntries] = React.useState<ParaFolderEntry[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [selecting, setSelecting] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!visible) return;
    const initial = normaliseFolderPath(initialPath || '/storage/emulated/0');
    setPath(initial);
    setError('');
    setSelecting(false);
    void (async () => {
      try {
        const detected = await listStorageRoots();
        setRoots(detected.map(normaliseFolderPath));
      } catch (_error) {
        setRoots(['/storage/emulated/0']);
      }
    })();
  }, [visible, initialPath]);

  React.useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setBusy(true);
    setError('');
    void listParaFolderEntries(path)
      .then(items => {
        if (!cancelled) setEntries(items.filter(item => item.isFolder));
      })
      .catch(cause => {
        if (!cancelled) {
          setEntries([]);
          setError(cause?.message || `Could not read ${path}.`);
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => { cancelled = true; };
  }, [visible, path]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text allowFontScaling={false} style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onCancel} style={styles.headerButton}>
              <Text allowFontScaling={false} style={styles.headerButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.locationRow}>
            {roots.map((root, index) => (
              <TouchableOpacity disabled={selecting} key={root} style={styles.locationButton} onPress={() => setPath(root)}>
                <Text allowFontScaling={false} style={styles.locationText} numberOfLines={1}>
                  {index === 0 ? 'Internal' : `SD ${index}`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.pathRow}>
            <TouchableOpacity
              disabled={!parentPath(path) || selecting}
              style={[styles.upButton, !parentPath(path) && styles.disabled]}
              onPress={() => {
                const parent = parentPath(path);
                if (parent) setPath(parent);
              }}
            >
              <Text allowFontScaling={false} style={styles.upText}>↑ Up</Text>
            </TouchableOpacity>
            <Text allowFontScaling={false} style={styles.path} numberOfLines={2}>{path}</Text>
          </View>

          {error ? <Text allowFontScaling={false} style={styles.error}>{error}</Text> : null}
          {busy ? <Text allowFontScaling={false} style={styles.message}>Reading folders…</Text> : null}
          {!busy && !error && entries.length === 0 ? (
            <Text allowFontScaling={false} style={styles.message}>No subfolders. You can use this folder.</Text>
          ) : null}

          <FlatList
            style={styles.list}
            data={entries}
            keyExtractor={item => item.path}
            renderItem={({ item }) => (
              <TouchableOpacity disabled={selecting} style={styles.folderRow} onPress={() => setPath(item.path)}>
                <Text allowFontScaling={false} style={styles.folderText} numberOfLines={1}>📁 {item.name}</Text>
                <Text allowFontScaling={false} style={styles.chevron}>›</Text>
              </TouchableOpacity>
            )}
          />

          <TouchableOpacity
            disabled={busy || selecting}
            style={[styles.useButton, (busy || selecting) && styles.useButtonDisabled]}
            onPress={() => {
              setSelecting(true);
              setError('');
              Promise.resolve(onSelect(path)).catch(cause => {
                setError(cause?.message || 'Could not save this folder.');
                setSelecting(false);
              });
            }}
          >
            <Text allowFontScaling={false} style={styles.useText}>{selecting ? 'Saving…' : 'Use This Folder'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', padding: 18, justifyContent: 'center' },
  card: { height: '88%', backgroundColor: '#ffffff', borderWidth: 2, borderColor: '#000000', borderRadius: 8, padding: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { flex: 1, fontSize: 17, fontWeight: 'bold', color: '#000000' },
  headerButton: { paddingVertical: 7, paddingHorizontal: 12, borderWidth: 1, borderColor: '#000000', borderRadius: 5 },
  headerButtonText: { fontSize: 13, fontWeight: 'bold', color: '#000000' },
  locationRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 7 },
  locationButton: { borderWidth: 1, borderColor: '#000000', borderRadius: 4, paddingVertical: 6, paddingHorizontal: 12, marginRight: 6, marginBottom: 4 },
  locationText: { fontSize: 13, fontWeight: 'bold', color: '#000000' },
  pathRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#707070', borderRadius: 5, padding: 6, marginBottom: 7 },
  upButton: { paddingVertical: 7, paddingHorizontal: 10, marginRight: 8, backgroundColor: '#e8e8e8', borderRadius: 4 },
  disabled: { opacity: 0.35 },
  upText: { fontSize: 13, fontWeight: 'bold', color: '#000000' },
  path: { flex: 1, fontSize: 12, fontFamily: 'monospace', color: '#000000' },
  list: { flex: 1, borderTopWidth: 1, borderTopColor: '#b0b0b0' },
  folderRow: { minHeight: 43, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#d0d0d0', paddingHorizontal: 8 },
  folderText: { flex: 1, fontSize: 14, color: '#000000' },
  chevron: { fontSize: 22, color: '#000000' },
  message: { fontSize: 13, color: '#505050', paddingVertical: 10 },
  error: { fontSize: 13, fontWeight: 'bold', color: '#000000', paddingVertical: 8 },
  useButton: { marginTop: 9, backgroundColor: '#000000', borderRadius: 6, paddingVertical: 11, alignItems: 'center' },
  useButtonDisabled: { backgroundColor: '#707070' },
  useText: { fontSize: 14, fontWeight: 'bold', color: '#ffffff' },
});
