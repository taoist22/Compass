import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CalendarEvent, ProfileThemeMode } from '../domain/types';

interface EventDetailModalProps {
  visible: boolean;
  event: CalendarEvent | null;
  themeMode: ProfileThemeMode;
  /** Path of an existing note for this event, if one has been created. */
  existingNotePath?: string;
  onClose: () => void;
  onCreateNote: (event: CalendarEvent) => void;
  onOpenExistingNote: (notePath: string) => void;
  onExport: (event: CalendarEvent, format: 'md' | 'txt') => void;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
}

/**
 * Detail sheet for a single event.
 *
 * Replaces the old dayDetailModal, which was written as a whole-day list and
 * carried a permanent "Create New Item for this Date" button — so opening one
 * event looked like a create screen. This shows one event and its actions,
 * and nothing else.
 */
export function EventDetailModal({
  visible,
  event,
  themeMode,
  existingNotePath,
  onClose,
  onCreateNote,
  onOpenExistingNote,
  onExport,
  onEdit,
  onDelete,
}: EventDetailModalProps): React.JSX.Element {
  const isAcademic = themeMode === 'academic';

  if (!event) {
    return <Modal visible={false} transparent />;
  }

  const timeStr = event.allDay
    ? 'All day'
    : `${event.start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} – ${event.end.toLocaleTimeString(
        'en-US',
        { hour: 'numeric', minute: '2-digit' }
      )}`;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title} numberOfLines={2}>
                {event.summary}
              </Text>
              <Text style={styles.subtitle}>
                {event.start.toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric',
                })}{' '}
                · {timeStr}
              </Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body}>
            {event.location ? (
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Location</Text>
                <Text style={styles.fieldValue}>{event.location}</Text>
              </View>
            ) : null}

            {event.organizer ? (
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{isAcademic ? 'Instructor' : 'Organizer'}</Text>
                <Text style={styles.fieldValue}>
                  {event.organizer.name || event.organizer.email || '—'}
                </Text>
              </View>
            ) : null}

            {event.attendees.length > 0 ? (
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>
                  {isAcademic ? 'Roster' : 'Attendees'} ({event.attendees.length})
                </Text>
                {event.attendees.map((a, i) => (
                  <Text key={`${a.email || a.name || i}`} style={styles.fieldValue}>
                    • {a.name || a.email}
                    {a.status ? ` — ${a.status.toLowerCase()}` : ''}
                  </Text>
                ))}
              </View>
            ) : null}

            {event.description ? (
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Details</Text>
                <Text style={styles.fieldValue}>{event.description}</Text>
              </View>
            ) : null}

            {event.recurringSeriesId || event.rrule ? (
              <Text style={styles.recurringNote}>This is part of a recurring series.</Text>
            ) : null}
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.primaryAction}
              onPress={() => (existingNotePath ? onOpenExistingNote(existingNotePath) : onCreateNote(event))}
            >
              <Text style={styles.primaryActionText}>
                {existingNotePath ? '📂 Open Note' : '📝 Create Note'}
              </Text>
            </TouchableOpacity>

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.action} onPress={() => onEdit(event)}>
                <Text style={styles.actionText}>✏️ Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.action} onPress={() => onExport(event, 'md')}>
                <Text style={styles.actionText}>📄 .md</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.action} onPress={() => onExport(event, 'txt')}>
                <Text style={styles.actionText}>📄 .txt</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.action} onPress={() => onDelete(event)}>
                <Text style={styles.actionText}>🗑️ Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  sheet: { backgroundColor: '#ffffff', borderWidth: 2, borderColor: '#000000', borderRadius: 8, width: '92%', maxHeight: '80%' },
  header: { flexDirection: 'row', alignItems: 'flex-start', borderBottomWidth: 2, borderBottomColor: '#000000', padding: 12 },
  headerText: { flex: 1 },
  title: { fontSize: 17, fontWeight: 'bold', color: '#000000' },
  subtitle: { fontSize: 13, color: '#404040', marginTop: 2 },
  closeBtn: { paddingHorizontal: 8, paddingVertical: 2 },
  closeBtnText: { fontSize: 18, color: '#000000' },
  body: { paddingHorizontal: 12, paddingTop: 10 },
  field: { marginBottom: 10 },
  fieldLabel: { fontSize: 11, fontWeight: 'bold', color: '#505050', textTransform: 'uppercase', marginBottom: 2 },
  fieldValue: { fontSize: 14, color: '#000000' },
  recurringNote: { fontSize: 12, fontStyle: 'italic', color: '#404040', marginBottom: 10 },
  actions: { borderTopWidth: 2, borderTopColor: '#000000', padding: 10 },
  primaryAction: { backgroundColor: '#000000', borderRadius: 6, paddingVertical: 10, alignItems: 'center', marginBottom: 8 },
  primaryActionText: { fontSize: 15, fontWeight: 'bold', color: '#ffffff' },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between' },
  action: { flex: 1, borderWidth: 1, borderColor: '#000000', borderRadius: 6, paddingVertical: 8, marginHorizontal: 2, alignItems: 'center' },
  actionText: { fontSize: 12, fontWeight: 'bold', color: '#000000' },
});
