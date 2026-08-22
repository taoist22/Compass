import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ParaFolderEntry } from '../supernote/exportService';
import { HandwritingTextInput, HandwritingTextInputHandle } from './HandwritingTextInput';

interface ParaFilesPanelProps {
  itemKey: string;
  folder: string;
  onListEntries: (folder: string) => Promise<ParaFolderEntry[]>;
  onOpenFile: (path: string) => void;
  onNewNote: (name: string, folder: string) => Promise<void>;
  onChooseFolder: (folder: string) => Promise<void>;
}

function parentFolder(path: string): string | undefined {
  const normalized = path.replace(/\/+$/, '');
  const slash = normalized.lastIndexOf('/');
  return slash > 0 ? normalized.slice(0, slash) : undefined;
}

/** Shared, navigable folder UI for Projects, Areas, and Resources. */
export function ParaFilesPanel({
  itemKey,
  folder,
  onListEntries,
  onOpenFile,
  onNewNote,
  onChooseFolder,
}: ParaFilesPanelProps): React.JSX.Element {
  const [entries, setEntries] = React.useState<ParaFolderEntry[]>([]);
  const [viewFolder, setViewFolder] = React.useState<string>(folder);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [adding, setAdding] = React.useState<boolean>(false);
  const [choosing, setChoosing] = React.useState<boolean>(false);
  const [noteName, setNoteName] = React.useState<string>('');
  const noteNameInputRef = React.useRef<HandwritingTextInputHandle>(null);

  const refresh = React.useCallback(async (target: string) => {
    setLoading(true);
    try {
      setEntries(await onListEntries(target));
    } finally {
      setLoading(false);
    }
  }, [onListEntries]);

  React.useEffect(() => {
    setViewFolder(folder);
    setChoosing(false);
    setAdding(false);
  }, [itemKey, folder]);

  React.useEffect(() => {
    void refresh(viewFolder);
  }, [viewFolder, refresh]);

  const up = parentFolder(viewFolder);
  const canGoUp = choosing
    ? Boolean(up && viewFolder !== '/storage/emulated/0')
    : viewFolder !== folder && Boolean(up);

  const cancelChoosing = () => {
    setChoosing(false);
    setViewFolder(folder);
  };

  const commitCurrentFolder = async () => {
    await onChooseFolder(viewFolder);
    setChoosing(false);
  };

  return (
    <View style={styles.root}>
      <Text allowFontScaling={false} style={styles.folder} numberOfLines={2}>
        📁 {viewFolder}
      </Text>
      <View style={styles.actions}>
        {canGoUp && up ? (
          <TouchableOpacity style={styles.button} onPress={() => setViewFolder(up)}>
            <Text allowFontScaling={false} style={styles.buttonText}>↑ Up</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={styles.button} onPress={() => void refresh(viewFolder)}>
          <Text allowFontScaling={false} style={styles.buttonText}>↻ Refresh</Text>
        </TouchableOpacity>
        {choosing ? (
          <>
            <TouchableOpacity style={styles.primaryButton} onPress={() => void commitCurrentFolder()}>
              <Text allowFontScaling={false} style={styles.primaryButtonText}>Use This Folder</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.button} onPress={cancelChoosing}>
              <Text allowFontScaling={false} style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity style={styles.button} onPress={() => {
              setAdding(true);
              setNoteName('');
            }}>
              <Text allowFontScaling={false} style={styles.buttonText}>+ New Note</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.button} onPress={() => {
              setAdding(false);
              setChoosing(true);
              setViewFolder(folder);
            }}>
              <Text allowFontScaling={false} style={styles.buttonText}>Choose Folder</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {choosing && (
        <Text allowFontScaling={false} style={styles.hint}>
          Open folders below, then tap Use This Folder. Use Up to browse elsewhere.
        </Text>
      )}

      {adding && !choosing && (
        <View style={styles.newRow}>
          <HandwritingTextInput
            ref={noteNameInputRef}
            style={styles.input}
            value={noteName}
            onChangeText={setNoteName}
            placeholder="Note name"
            placeholderTextColor="#707070"
            autoCorrect={false}
          />
          <TouchableOpacity style={styles.button} onPress={async () => {
            const name = (noteNameInputRef.current?.getValue() ?? noteName).trim();
            if (name) {
              await onNewNote(name, viewFolder);
              await refresh(viewFolder);
            }
            setAdding(false);
            setNoteName('');
          }}>
            <Text allowFontScaling={false} style={styles.buttonText}>Create</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={() => setAdding(false)}>
            <Text allowFontScaling={false} style={styles.buttonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading && <Text allowFontScaling={false} style={styles.hint}>Reading folder…</Text>}
      {!loading && entries.length === 0 && (
        <Text allowFontScaling={false} style={styles.hint}>No visible files or folders here.</Text>
      )}
      {!loading && entries.map(entry => (
        <TouchableOpacity
          key={entry.path}
          style={styles.fileRow}
          onPress={() => entry.isFolder ? setViewFolder(entry.path) : onOpenFile(entry.path)}
        >
          <Text allowFontScaling={false} style={styles.fileIcon}>
            {entry.isFolder ? '📁' : fileIcon(entry.path)}
          </Text>
          <Text allowFontScaling={false} style={styles.fileName} numberOfLines={1}>{entry.name}</Text>
          <Text allowFontScaling={false} style={styles.openText}>{entry.isFolder ? 'Browse' : 'Open'}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function fileIcon(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase();
  if (extension === 'note') return '📝';
  if (extension === 'pdf') return '📕';
  if (extension === 'epub') return '📖';
  if (extension === 'doc' || extension === 'docx' || extension === 'txt' || extension === 'md') return '📄';
  if (extension === 'png' || extension === 'jpg' || extension === 'jpeg' || extension === 'gif') return '🖼';
  return '📎';
}

const styles = StyleSheet.create({
  root: { marginTop: 7 },
  folder: { fontSize: 11, color: '#303030', marginBottom: 5 },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 },
  button: {
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: 5,
    marginBottom: 4,
  },
  buttonText: { fontSize: 11, fontWeight: 'bold', color: '#000000' },
  primaryButton: {
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: 5,
    marginBottom: 4,
  },
  primaryButtonText: { fontSize: 11, fontWeight: 'bold', color: '#ffffff' },
  newRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 7 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 4,
    marginRight: 5,
    fontSize: 12,
    color: '#000000',
  },
  hint: { fontSize: 11, color: '#505050', paddingVertical: 8 },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 5,
    paddingVertical: 7,
    paddingHorizontal: 8,
    marginBottom: 4,
    backgroundColor: '#ffffff',
  },
  fileIcon: { fontSize: 14, marginRight: 7 },
  fileName: { flex: 1, fontSize: 12, color: '#000000' },
  openText: { fontSize: 11, fontWeight: 'bold', color: '#000000' },
});
