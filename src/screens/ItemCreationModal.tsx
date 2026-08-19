import React, { useEffect, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CalendarEvent, CalendarFeed } from '../domain/types';
import { DatePickerModal } from './DatePickerModal';

interface ItemCreationModalProps {
  visible: boolean;
  type: 'event' | 'task';
  targetDate: Date;
  availableFeeds: CalendarFeed[];
  /**
   * Text captured from a lasso selection. Prefills the title so the user can
   * correct it before saving — OCR is fallible and must never be committed
   * silently.
   */
  initialTitle?: string;
  /** Date/time parsed from a lasso capture; seeds the time controls. */
  initialParsed?: {
    hours?: number;
    minutes?: number;
    allDay: boolean;
    /** Raw recognised text, so a bad OCR read is visible before saving. */
    sourceText?: string;
    interpretation?: string;
    hasDate?: boolean;
    ambiguousDateOrder?: boolean;
  } | null;
  /**
   * When set, the modal edits this item instead of creating one. Its uid is
   * preserved so the CalDAV PUT overwrites the same .ics rather than creating
   * a second copy on the server.
   */
  editingEvent?: CalendarEvent | null;
  onClose: () => void;
  onCreateEvent: (event: CalendarEvent, targetFeedId: string) => void;
  /** dueDate omitted means a genuinely undated task, not one dated today. */
  onCreateTask: (task: { uid?: string; title: string; dueDate?: Date; notes?: string }) => void;
}

const HOURS = ['08', '09', '10', '11', '12', '01', '02', '03', '04', '05', '06', '07'];
const MINUTES = ['00', '15', '30', '45'];
const DURATIONS = [
  { label: '30 min', mins: 30 },
  { label: '1 hour', mins: 60 },
  { label: '1.5 hrs', mins: 90 },
  { label: '2 hours', mins: 120 },
];

export function ItemCreationModal({
  visible,
  type,
  targetDate,
  availableFeeds,
  initialTitle,
  initialParsed,
  editingEvent,
  onClose,
  onCreateEvent,
  onCreateTask,
}: ItemCreationModalProps): React.JSX.Element {
  const [title, setTitle] = useState<string>('');

  // The caller's `type` is only the starting point — the user picks Event or
  // Task in the modal, which decides whether it becomes a calendar event or
  // a to-do in the task list.
  const [itemKind, setItemKind] = useState<'event' | 'task'>(type);
  const [location, setLocation] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [isAllDay, setIsAllDay] = useState<boolean>(type === 'task');
  const [startHour, setStartHour] = useState<string>('09');
  const [startMin, setStartMin] = useState<string>('00');
  const [startAmPm, setStartAmPm] = useState<'AM' | 'PM'>('AM');
  const [durationMins, setDurationMins] = useState<number>(30);

  // The date is editable here rather than inherited from the calendar
  // selection — a lasso can happen on any page with no idea what day the grid
  // is sitting on, and editing an item must be able to move it.
  const [itemDate, setItemDate] = useState<Date>(targetDate);
  // Tasks may have no date at all; events always have one.
  const [noDueDate, setNoDueDate] = useState<boolean>(false);
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);

  // Reseed every time the modal opens: with the edited item's values, or with
  // freshly captured lasso text, so a second open never shows stale state.
  useEffect(() => {
    if (!visible) return;

    if (editingEvent) {
      const isEditingTask = editingEvent.isTask === true || /^\[TASK\]\s*/i.test(editingEvent.summary);
      setTitle(editingEvent.summary.replace(/^\[TASK\]\s*/i, ''));
      setItemKind(isEditingTask ? 'task' : 'event');
      setLocation(editingEvent.location || '');
      setDescription(editingEvent.description || '');
      setIsAllDay(editingEvent.allDay);
      setItemDate(new Date(editingEvent.start));

      const start = new Date(editingEvent.start);
      const hour24 = start.getHours();
      const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
      setStartHour(String(hour12).padStart(2, '0'));
      setStartMin(String(Math.floor(start.getMinutes() / 15) * 15).padStart(2, '0'));
      setStartAmPm(hour24 >= 12 ? 'PM' : 'AM');

      const mins = Math.round((new Date(editingEvent.end).getTime() - start.getTime()) / 60000);
      setDurationMins(mins > 0 ? mins : 30);
      setNoDueDate(false);
      return;
    }

    setTitle(initialTitle || '');
    setItemKind(type);
    setLocation('');
    setDescription('');
    setItemDate(targetDate);
    // A lasso capture with no recognised date opens as an undated task.
    setNoDueDate(type === 'task' && !initialParsed?.hasDate && Boolean(initialParsed));

    // A lasso capture may already carry a time; seed the controls from it so
    // the user only has to confirm rather than re-enter what they wrote.
    if (initialParsed && !initialParsed.allDay && initialParsed.hours !== undefined) {
      const h24 = initialParsed.hours;
      const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
      setStartHour(String(h12).padStart(2, '0'));
      setStartMin(String(Math.floor((initialParsed.minutes ?? 0) / 15) * 15).padStart(2, '0'));
      setStartAmPm(h24 >= 12 ? 'PM' : 'AM');
      setIsAllDay(false);
    } else {
      setIsAllDay(initialParsed ? initialParsed.allDay : type === 'task');
    }
  }, [visible, initialTitle, initialParsed, type, editingEvent, targetDate]);

  const shiftDate = (days: number) => {
    setItemDate(prev => {
      const next = new Date(prev);
      next.setDate(next.getDate() + days);
      return next;
    });
  };

  const cleanFeeds = availableFeeds.length > 0
    ? availableFeeds.filter(f => f.name && !f.id.startsWith('default-sample'))
    : [{ id: 'primary-cal', name: 'Primary Calendar', enabled: true }];

  const [selectedFeedId, setSelectedFeedId] = useState<string>(cleanFeeds[0]?.id || 'primary-cal');

  const handleSave = () => {
    if (!title.trim()) return;

    const start = new Date(itemDate);
    if (!isAllDay) {
      let hour = parseInt(startHour, 10);
      if (startAmPm === 'PM' && hour < 12) hour += 12;
      if (startAmPm === 'AM' && hour === 12) hour = 0;
      start.setHours(hour, parseInt(startMin, 10), 0, 0);
    } else {
      start.setHours(9, 0, 0, 0);
    }

    const end = new Date(start.getTime() + durationMins * 60 * 1000);

    if (itemKind === 'event') {
      const newEvt: CalendarEvent = {
        // Reuse the uid when editing so the CalDAV PUT overwrites the same
        // .ics; a fresh uid would leave the original behind as a duplicate.
        uid: editingEvent ? editingEvent.uid : `evt-user-${Date.now()}`,
        summary: title.trim(),
        location: location.trim() || undefined,
        description: description.trim() || undefined,
        start,
        end,
        allDay: isAllDay,
        attendees: editingEvent?.attendees || [],
        recurringSeriesId: editingEvent?.recurringSeriesId,
        rrule: editingEvent?.rrule,
        calendarName:
          editingEvent?.calendarName ||
          cleanFeeds.find(f => f.id === selectedFeedId)?.name ||
          'Primary Calendar',
      };

      onCreateEvent(newEvt, selectedFeedId);
    } else {
      onCreateTask({
        uid: editingEvent?.uid,
        title: title.trim(),
        // Omitted entirely when the user has said it has no due date, so the
        // task lands in No Date rather than being silently dated today.
        dueDate: noDueDate ? undefined : start,
        notes: description.trim() || undefined,
      });
    }

    setTitle('');
    setLocation('');
    setDescription('');
    onClose();
  };

  const formattedDateStr = itemDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              Create {itemKind === 'event' ? 'Calendar Event' : 'Task'}
            </Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>✕ Close</Text>
            </TouchableOpacity>
          </View>

          {/* What the handwriting was read as. This lives in the modal, not in
              the screen's status line, because the modal covers that line —
              the check was invisible exactly when it mattered. */}
          {initialParsed?.interpretation ? (
            <View style={styles.captureBox}>
              {initialParsed.sourceText ? (
                <Text style={styles.captureRead}>read: "{initialParsed.sourceText}"</Text>
              ) : null}
              <Text style={styles.captureInterp}>→ {initialParsed.interpretation}</Text>
              {initialParsed.ambiguousDateOrder ? (
                <Text style={styles.captureWarn}>
                  ⚠ Ambiguous date — check the day and month are the right way round.
                </Text>
              ) : null}
            </View>
          ) : null}

          {/* Date is adjustable here: a lasso has no idea which day the grid
              is on, and an edit must be able to move the item. */}
          {/* Tapping the date opens the full picker. Single-day arrows stay
              for nudging; the week/month jump row is redundant now that any
              date is two taps away. */}
          {!(itemKind === 'task' && noDueDate) && (
            <View style={styles.dateRow}>
              <TouchableOpacity style={styles.dateNavBtn} onPress={() => shiftDate(-1)}>
                <Text style={styles.dateNavBtnText}>◀</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.dateDisplay} onPress={() => setShowDatePicker(true)}>
                <Text style={styles.dateLabel}>{formattedDateStr} ▾</Text>
                <Text style={styles.dateHint}>tap to change</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.dateNavBtn} onPress={() => shiftDate(1)}>
                <Text style={styles.dateNavBtnText}>▶</Text>
              </TouchableOpacity>
            </View>
          )}

          <DatePickerModal
            visible={showDatePicker}
            value={itemDate}
            onSelect={setItemDate}
            onClose={() => setShowDatePicker(false)}
          />

          {/* Event vs Task: decides which store the item lands in. */}
          <View style={styles.kindToggleRow}>
            <TouchableOpacity
              style={[styles.kindBtn, itemKind === 'event' && styles.kindBtnActive]}
              onPress={() => setItemKind('event')}
            >
              <Text style={[styles.kindBtnText, itemKind === 'event' && styles.kindBtnTextActive]}>
                📅 Calendar Event
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.kindBtn, itemKind === 'task' && styles.kindBtnActive]}
              onPress={() => setItemKind('task')}
            >
              <Text style={[styles.kindBtnText, itemKind === 'task' && styles.kindBtnTextActive]}>
                ✅ Task
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.formContent}>
            <Text style={styles.label}>{itemKind === 'event' ? 'Event Title:' : 'Task Name:'}</Text>
            <TextInput
              style={styles.textInput}
              value={title}
              onChangeText={setTitle}
              placeholder={itemKind === 'event' ? 'e.g. Executive Sync' : 'e.g. Submit Lab Report'}
              placeholderTextColor="#707070"
            />

            {/* Compact checkbox toggles. A full-width Switch row read as an
                unrelated setting rather than an on/off for this item. */}
            <View style={styles.checkRow}>
              {itemKind === 'task' && (
                <TouchableOpacity style={styles.checkToggle} onPress={() => setNoDueDate(!noDueDate)}>
                  <Text style={styles.checkToggleBox}>{noDueDate ? '☑' : '☐'}</Text>
                  <Text style={styles.checkToggleLabel}>No due date</Text>
                </TouchableOpacity>
              )}

              {!(itemKind === 'task' && noDueDate) && (
                <TouchableOpacity style={styles.checkToggle} onPress={() => setIsAllDay(!isAllDay)}>
                  <Text style={styles.checkToggleBox}>{isAllDay ? '☑' : '☐'}</Text>
                  <Text style={styles.checkToggleLabel}>
                    {itemKind === 'task' ? 'No specific time' : 'All day'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {!isAllDay && !(itemKind === 'task' && noDueDate) && (
              <>
                <Text style={styles.label}>{itemKind === 'event' ? 'Start Time:' : 'Due Time:'}</Text>
                <View style={styles.timePickerRow}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                    {HOURS.map(h => (
                      <TouchableOpacity
                        key={h}
                        style={[styles.timeChip, startHour === h && styles.timeChipSelected]}
                        onPress={() => setStartHour(h)}
                      >
                        <Text style={[styles.timeChipText, startHour === h && styles.timeChipTextSelected]}>
                          {h}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  <View style={styles.colonContainer}>
                    <Text style={styles.colonText}>:</Text>
                  </View>

                  {MINUTES.map(m => (
                    <TouchableOpacity
                      key={m}
                      style={[styles.timeChipMin, startMin === m && styles.timeChipSelected]}
                      onPress={() => setStartMin(m)}
                    >
                      <Text style={[styles.timeChipText, startMin === m && styles.timeChipTextSelected]}>
                        {m}
                      </Text>
                    </TouchableOpacity>
                  ))}

                  <TouchableOpacity
                    style={[styles.ampmBtn, startAmPm === 'AM' && styles.ampmBtnActive]}
                    onPress={() => setStartAmPm('AM')}
                  >
                    <Text style={[styles.ampmBtnText, startAmPm === 'AM' && styles.ampmBtnTextActive]}>AM</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.ampmBtn, startAmPm === 'PM' && styles.ampmBtnActive]}
                    onPress={() => setStartAmPm('PM')}
                  >
                    <Text style={[styles.ampmBtnText, startAmPm === 'PM' && styles.ampmBtnTextActive]}>PM</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.label}>Time Duration / Period:</Text>
                <View style={styles.durationRow}>
                  {DURATIONS.map(d => (
                    <TouchableOpacity
                      key={d.label}
                      style={[styles.durationChip, durationMins === d.mins && styles.durationChipSelected]}
                      onPress={() => setDurationMins(d.mins)}
                    >
                      <Text style={[styles.durationChipText, durationMins === d.mins && styles.durationChipTextSelected]}>
                        {d.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {itemKind === 'event' && (
              <>
                <Text style={styles.label}>Location / Room (Optional):</Text>
                <TextInput
                  style={styles.textInput}
                  value={location}
                  onChangeText={setLocation}
                  placeholder="e.g. Room 204 or Zoom"
                  placeholderTextColor="#707070"
                />
              </>
            )}

            <Text style={styles.label}>Description / Details:</Text>
            <TextInput
              style={[styles.textInput, styles.multilineInput]}
              value={description}
              onChangeText={setDescription}
              placeholder="Item details..."
              placeholderTextColor="#707070"
              multiline
              numberOfLines={3}
            />
          </ScrollView>

          <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
            <Text style={styles.saveBtnText}>
              💾 Save {itemKind === 'event' ? 'Event' : 'Task'}
            </Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 8,
    padding: 16,
    width: '92%',
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
    paddingBottom: 6,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000000',
  },
  closeBtn: {
    backgroundColor: '#000000',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
  },
  closeBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  dateLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#303030',
    marginBottom: 10,
  },
  checkRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  checkToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginRight: 8,
    backgroundColor: '#ffffff',
  },
  checkToggleBox: {
    fontSize: 18,
    color: '#000000',
    marginRight: 6,
  },
  checkToggleLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#000000',
  },
  captureBox: {
    borderWidth: 1,
    borderColor: '#404040',
    borderRadius: 6,
    backgroundColor: '#f2f2f2',
    padding: 8,
    marginBottom: 10,
  },
  captureRead: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#404040',
  },
  captureInterp: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#000000',
    marginTop: 2,
  },
  captureWarn: {
    fontSize: 11,
    color: '#000000',
    marginTop: 4,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  dateNavBtn: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 18,
    backgroundColor: '#ffffff',
  },
  dateNavBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000000',
  },
  dateDisplay: {
    flex: 1,
    alignItems: 'center',
  },
  dateHint: {
    fontSize: 10,
    color: '#606060',
  },
  dateJumpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 12,
  },
  dateJumpBtn: {
    borderWidth: 1,
    borderColor: '#404040',
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 12,
    marginHorizontal: 4,
  },
  dateJumpBtnText: {
    fontSize: 12,
    color: '#101010',
  },
  kindToggleRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  kindBtn: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    paddingVertical: 10,
    marginRight: 8,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  kindBtnActive: {
    backgroundColor: '#000000',
  },
  kindBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000000',
  },
  kindBtnTextActive: {
    color: '#ffffff',
  },
  formContent: {
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 4,
    marginTop: 6,
  },
  labelInline: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000000',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 6,
  },
  textInput: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: '#000000',
    fontSize: 14,
    marginBottom: 8,
  },
  multilineInput: {
    height: 60,
    textAlignVertical: 'top',
  },
  timePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  chipScroll: {
    flexGrow: 0,
  },
  timeChip: {
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginRight: 4,
    backgroundColor: '#ffffff',
  },
  timeChipMin: {
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 6,
    backgroundColor: '#ffffff',
  },
  timeChipSelected: {
    backgroundColor: '#000000',
  },
  timeChipText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000000',
  },
  timeChipTextSelected: {
    color: '#ffffff',
  },
  colonContainer: {
    paddingHorizontal: 2,
  },
  colonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000000',
  },
  ampmBtn: {
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#ffffff',
  },
  ampmBtnActive: {
    backgroundColor: '#000000',
  },
  ampmBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000000',
  },
  ampmBtnTextActive: {
    color: '#ffffff',
  },
  durationRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  durationChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 4,
    paddingVertical: 6,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  durationChipSelected: {
    backgroundColor: '#000000',
  },
  durationChipText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000000',
  },
  durationChipTextSelected: {
    color: '#ffffff',
  },
  saveBtn: {
    backgroundColor: '#000000',
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 15,
  },
});
