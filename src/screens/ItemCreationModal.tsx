import React, { useEffect, useState } from 'react';
import {
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Area,
  CalendarEvent,
  CalendarFeed,
  CalendarTask,
  Project,
  TaskPriority,
  TaskStatus,
} from '../domain/types';
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  priorityLabel,
  statusGlyph,
  statusLabel,
  taskStatus,
} from '../domain/taskModel';
import { DatePickerModal } from './DatePickerModal';
import {
  TimeRange,
  formatClock,
  formatDuration,
  formatTimeOfDay,
  isPm,
  minutesFromDate,
  moveEnd,
  moveStart,
  normaliseRange,
  parseTimeOfDay,
  withMeridiem,
  withTimeOfDay,
} from '../domain/timeOfDay';

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
  onCreateTask: (task: {
    uid?: string;
    title: string;
    dueDate?: Date;
    notes?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    areaId?: string;
    projectId?: string;
  }) => void;
  /**
   * The task being edited, when one is. Passed whole rather than as separate
   * status/priority props so the pickers cannot open showing stale defaults
   * while the real values sit elsewhere.
   */
  editingTask?: CalendarTask | null;
  /** Only offered while editing an existing item, never while creating one. */
  onDeleteTask?: (uid: string) => void;
  /** PARA areas to choose from, and the one this task is filed under. */
  areas?: Area[];
  taskAreaId?: string;
  onCreateArea?: (name: string) => string;
  /** Active projects to file this task under, and its current one. */
  projects?: Project[];
  taskProjectId?: string;
  onCreateProject?: (name: string) => string;
}


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
  onDeleteTask,
  editingTask,
  areas = [],
  taskAreaId,
  onCreateArea,
  projects = [],
  taskProjectId,
  onCreateProject,
}: ItemCreationModalProps): React.JSX.Element {
  const [title, setTitle] = useState<string>('');

  // The caller's `type` is only the starting point — the user picks Event or
  // Task in the modal, which decides whether it becomes a calendar event or
  // a to-do in the task list.
  const [itemKind, setItemKind] = useState<'event' | 'task'>(type);
  const [location, setLocation] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [isAllDay, setIsAllDay] = useState<boolean>(type === 'task');
  const [timeRange, setTimeRange] = useState<TimeRange>({ start: 9 * 60, end: 10 * 60 });
  // What the user is typing, kept apart from the parsed value so a half-typed
  // "9:" is not rewritten under them mid-entry.
  const [startText, setStartText] = useState<string>(formatClock(9 * 60));
  const [endText, setEndText] = useState<string>(formatClock(10 * 60));

  const startInvalid = parseTimeOfDay(startText) === null;
  const endInvalid = parseTimeOfDay(endText, timeRange.start) === null;

  const applyRange = (range: TimeRange) => {
    const fixed = normaliseRange(range);
    setTimeRange(fixed);
    setStartText(formatClock(fixed.start));
    setEndText(formatClock(fixed.end));
  };

  /**
   * Commits on blur, not on every keystroke: rewriting the field while it is
   * being written fights the user, and this display repaints slowly.
   */
  const commitStart = () => {
    const parsed = parseTimeOfDay(startText);
    if (parsed === null) return;
    // The toggle owns the meridiem unless the text spelled one out, so typing
    // "9" keeps whichever half of the day is already selected.
    const withHalf = /[ap]/i.test(startText) || parsed >= 12 * 60
      ? parsed
      : withMeridiem(parsed, isPm(timeRange.start));
    // Moving the start carries the end, so a meeting keeps its length.
    applyRange(moveStart(timeRange, withHalf - timeRange.start));
  };

  const commitEnd = () => {
    const parsed = parseTimeOfDay(endText);
    if (parsed === null) return;
    const withHalf = /[ap]/i.test(endText) || parsed >= 12 * 60
      ? parsed
      : withMeridiem(parsed, isPm(timeRange.end));
    applyRange(moveEnd(timeRange, withHalf - timeRange.end));
  };

  const toggleStartMeridiem = () =>
    applyRange(moveStart(timeRange, withMeridiem(timeRange.start, !isPm(timeRange.start)) - timeRange.start));

  const toggleEndMeridiem = () =>
    applyRange(moveEnd(timeRange, withMeridiem(timeRange.end, !isPm(timeRange.end)) - timeRange.end));

  // The date is editable here rather than inherited from the calendar
  // selection — a lasso can happen on any page with no idea what day the grid
  // is sitting on, and editing an item must be able to move it.
  const [itemDate, setItemDate] = useState<Date>(targetDate);
  // Tasks may have no date at all; events always have one.
  const [noDueDate, setNoDueDate] = useState<boolean>(false);
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  /**
   * Whether this form is editing or creating a task. Derived from the task
   * itself when there is one: itemKind is set by an effect, so gating on it
   * alone meant the task controls could be absent on the first render.
   */
  const isTaskForm = Boolean(editingTask) || itemKind === 'task';
  const [taskStatusValue, setTaskStatusValue] = useState<TaskStatus>('todo');
  const [taskPriorityValue, setTaskPriorityValue] = useState<TaskPriority>(1);
  const [areaValue, setAreaValue] = useState<string | undefined>(undefined);
  const [newAreaName, setNewAreaName] = useState<string>('');
  const [addingArea, setAddingArea] = useState<boolean>(false);
  const [projectValue, setProjectValue] = useState<string | undefined>(undefined);
  const [newProjectName, setNewProjectName] = useState<string>('');
  const [addingProject, setAddingProject] = useState<boolean>(false);

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
      const seeded = normaliseRange({
        start: minutesFromDate(start),
        end: minutesFromDate(new Date(editingEvent.end)),
      });
      setTimeRange(seeded);
      setStartText(formatClock(seeded.start));
      setEndText(formatClock(seeded.end));
      setNoDueDate(false);
      setTaskStatusValue(editingTask ? taskStatus(editingTask) : 'todo');
      setTaskPriorityValue(editingTask?.priority || 1);
      setAreaValue(taskAreaId);
      setAddingArea(false);
      setNewAreaName('');
      setProjectValue(taskProjectId);
      setAddingProject(false);
      setNewProjectName('');
      return;
    }

    setTitle(initialTitle || '');
    setItemKind(type);
    setTaskStatusValue('todo');
    setTaskPriorityValue(1);
    setAreaValue(undefined);
    setAddingArea(false);
    setNewAreaName('');
    setProjectValue(undefined);
    setAddingProject(false);
    setNewProjectName('');
    setTimeRange({ start: 9 * 60, end: 10 * 60 });
    setStartText(formatClock(9 * 60));
    setEndText(formatClock(10 * 60));
    setLocation('');
    setDescription('');
    setItemDate(targetDate);
    // A lasso capture with no recognised date opens as an undated task.
    setNoDueDate(type === 'task' && !initialParsed?.hasDate && Boolean(initialParsed));

    // A lasso capture may already carry a time; seed the controls from it so
    // the user only has to confirm rather than re-enter what they wrote.
    if (initialParsed && !initialParsed.allDay && initialParsed.hours !== undefined) {
      const captured = initialParsed.hours * 60 + (initialParsed.minutes ?? 0);
      const range = normaliseRange({ start: captured, end: captured + 60 });
      setTimeRange(range);
      setStartText(formatClock(range.start));
      setEndText(formatClock(range.end));
      setIsAllDay(false);
    } else {
      setIsAllDay(initialParsed ? initialParsed.allDay : type === 'task');
    }
  }, [visible, initialTitle, initialParsed, type, editingEvent, targetDate, editingTask, taskAreaId, taskProjectId]);

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
      start.setHours(Math.floor(timeRange.start / 60), timeRange.start % 60, 0, 0);
    } else {
      start.setHours(9, 0, 0, 0);
    }

    // End comes from its own control now, so any length is expressible.
    const end = isAllDay
      ? new Date(start.getTime() + 60 * 60 * 1000)
      : withTimeOfDay(start, timeRange.end);

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
        status: taskStatusValue,
        priority: taskPriorityValue,
        areaId: areaValue,
        projectId: projectValue,
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
            {/* The same form both creates and edits, so it has to say which. */}
            <Text style={styles.modalTitle}>
              {`${editingEvent ? 'Edit' : 'New'} ${itemKind === 'event' ? 'Event' : 'Task'}`}
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

          {/* keyboardShouldPersistTaps: with an input focused, the first tap
              elsewhere is otherwise consumed dismissing focus, so a duration
              chip needed tapping twice. "handled" still lets a tap on blank
              space close the keyboard. */}
          <ScrollView
            style={styles.formContent}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.formContentInner}
          >
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
                {/* Typed or handwritten. A TextInput accepts the handwriting
                    IME with no extra work, and reading "9:30" is far less
                    effort than nudging to it fifteen minutes at a time. */}
                <View style={styles.timeFieldRow}>
                  <View style={styles.timeField}>
                    <Text style={styles.label}>{itemKind === 'event' ? 'Start' : 'Due time'}</Text>
                    <View style={styles.timeEntryRow}>
                      <TextInput
                        style={[
                          styles.textInput,
                          styles.timeInput,
                          startText !== '' && startInvalid && styles.inputInvalid,
                        ]}
                        value={startText}
                        onChangeText={setStartText}
                        onEndEditing={commitStart}
                        placeholder="9:00"
                        placeholderTextColor="#707070"
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      {/* The meridiem is a tap, not something to write. */}
                      <TouchableOpacity style={styles.meridiemBtn} onPress={toggleStartMeridiem}>
                        <Text style={styles.meridiemText}>{isPm(timeRange.start) ? 'PM' : 'AM'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {itemKind === 'event' && (
                    <View style={styles.timeField}>
                      <Text style={styles.label}>End</Text>
                      <View style={styles.timeEntryRow}>
                        <TextInput
                          style={[
                            styles.textInput,
                            styles.timeInput,
                            endText !== '' && endInvalid && styles.inputInvalid,
                          ]}
                          value={endText}
                          onChangeText={setEndText}
                          onEndEditing={commitEnd}
                          placeholder="10:00"
                          placeholderTextColor="#707070"
                          autoCapitalize="none"
                          autoCorrect={false}
                        />
                        <TouchableOpacity style={styles.meridiemBtn} onPress={toggleEndMeridiem}>
                          <Text style={styles.meridiemText}>{isPm(timeRange.end) ? 'PM' : 'AM'}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>

                <Text style={styles.durationHint}>
                  {startInvalid || endInvalid
                    ? 'Try 9, 9:30, 930 or 14:00 — AM/PM is the button.'
                    : itemKind === 'event'
                    ? `${formatTimeOfDay(timeRange.start)} – ${formatTimeOfDay(
                        timeRange.end
                      )} · ${formatDuration(timeRange.end - timeRange.start)}`
                    : formatTimeOfDay(timeRange.start)}
                </Text>
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

            {isTaskForm && (
              <>
                <Text style={styles.label}>Status:</Text>
                <View style={styles.chipRow}>
                  {TASK_STATUSES.map(st => (
                    <TouchableOpacity
                      key={st}
                      style={[styles.stateChip, taskStatusValue === st && styles.stateChipSelected]}
                      onPress={() => setTaskStatusValue(st)}
                    >
                      <Text
                        style={[
                          styles.stateChipText,
                          taskStatusValue === st && styles.stateChipTextSelected,
                        ]}
                      >
                        {statusGlyph(st)} {statusLabel(st)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.label}>Area:</Text>
                <View style={styles.chipRow}>
                  <TouchableOpacity
                    style={[styles.stateChip, !areaValue && styles.stateChipSelected]}
                    onPress={() => setAreaValue(undefined)}
                  >
                    <Text style={[styles.stateChipText, !areaValue && styles.stateChipTextSelected]}>
                      None
                    </Text>
                  </TouchableOpacity>

                  {areas
                    .filter(a => !a.archived)
                    .map(a => (
                      <TouchableOpacity
                        key={a.id}
                        style={[styles.stateChip, areaValue === a.id && styles.stateChipSelected]}
                        onPress={() => setAreaValue(a.id)}
                      >
                        <Text
                          style={[
                            styles.stateChipText,
                            areaValue === a.id && styles.stateChipTextSelected,
                          ]}
                        >
                          {a.name}
                        </Text>
                      </TouchableOpacity>
                    ))}

                  {onCreateArea && !addingArea && (
                    <TouchableOpacity style={styles.stateChip} onPress={() => setAddingArea(true)}>
                      <Text style={styles.stateChipText}>+ New</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Created inline so filing a task never means leaving the
                    form to go and set an area up first. */}
                {addingArea && onCreateArea && (
                  <View style={styles.timeEntryRow}>
                    <TextInput
                      style={[styles.textInput, styles.timeInput]}
                      value={newAreaName}
                      onChangeText={setNewAreaName}
                      placeholder="Area name"
                      placeholderTextColor="#707070"
                      autoCorrect={false}
                    />
                    <TouchableOpacity
                      style={styles.meridiemBtn}
                      onPress={() => {
                        const name = newAreaName.trim();
                        if (!name) {
                          setAddingArea(false);
                          return;
                        }
                        setAreaValue(onCreateArea(name));
                        setNewAreaName('');
                        setAddingArea(false);
                      }}
                    >
                      <Text style={styles.meridiemText}>Add</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <Text style={styles.label}>Project:</Text>
                <View style={styles.chipRow}>
                  <TouchableOpacity
                    style={[styles.stateChip, !projectValue && styles.stateChipSelected]}
                    onPress={() => setProjectValue(undefined)}
                  >
                    <Text
                      style={[styles.stateChipText, !projectValue && styles.stateChipTextSelected]}
                    >
                      None
                    </Text>
                  </TouchableOpacity>

                  {/* Finished and archived projects are not offered: filing new
                      work into something you have closed is almost never meant. */}
                  {projects
                    .filter(pr => pr.status === 'active')
                    .map(pr => (
                      <TouchableOpacity
                        key={pr.id}
                        style={[styles.stateChip, projectValue === pr.id && styles.stateChipSelected]}
                        onPress={() => setProjectValue(pr.id)}
                      >
                        <Text
                          style={[
                            styles.stateChipText,
                            projectValue === pr.id && styles.stateChipTextSelected,
                          ]}
                        >
                          {pr.name}
                        </Text>
                      </TouchableOpacity>
                    ))}

                  {onCreateProject && !addingProject && (
                    <TouchableOpacity style={styles.stateChip} onPress={() => setAddingProject(true)}>
                      <Text style={styles.stateChipText}>+ New</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {addingProject && onCreateProject && (
                  <View style={styles.timeEntryRow}>
                    <TextInput
                      style={[styles.textInput, styles.timeInput]}
                      value={newProjectName}
                      onChangeText={setNewProjectName}
                      placeholder="Project name"
                      placeholderTextColor="#707070"
                      autoCorrect={false}
                    />
                    <TouchableOpacity
                      style={styles.meridiemBtn}
                      onPress={() => {
                        const name = newProjectName.trim();
                        if (!name) {
                          setAddingProject(false);
                          return;
                        }
                        setProjectValue(onCreateProject(name));
                        setNewProjectName('');
                        setAddingProject(false);
                      }}
                    >
                      <Text style={styles.meridiemText}>Add</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <Text style={styles.label}>Priority:</Text>
                <View style={styles.chipRow}>
                  {TASK_PRIORITIES.map(p => (
                    <TouchableOpacity
                      key={p}
                      style={[styles.stateChip, taskPriorityValue === p && styles.stateChipSelected]}
                      onPress={() => setTaskPriorityValue(p)}
                    >
                      <Text
                        style={[
                          styles.stateChipText,
                          taskPriorityValue === p && styles.stateChipTextSelected,
                        ]}
                      >
                        {priorityLabel(p)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
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

          {/* One row: stacked, Delete fell past the sheet's 85% max height and
              was clipped off screen entirely. */}
          <View style={styles.footerRow}>
            <TouchableOpacity style={[styles.saveBtn, styles.footerGrow]} onPress={handleSave}>
              <Text style={styles.saveBtnText}>
                💾 Save {itemKind === 'event' ? 'Event' : 'Task'}
              </Text>
            </TouchableOpacity>

            {/* Editing only: there is nothing to delete from a create form. */}
            {editingTask && onDeleteTask && (
              <TouchableOpacity
                style={styles.deleteTaskBtn}
                onPress={() => {
                  onDeleteTask(editingTask.uid);
                  onClose();
                }}
              >
                {/* Labelled, not a bare icon: an unlabelled 🗑️ beside Save was
                    easy to miss entirely. */}
                <Text style={styles.deleteTaskBtnText}>🗑️ Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

/** Nomad-class devices report ~998dp tall; a Manta reports ~1365. */
const SHORT_SCREEN = Dimensions.get('window').height < 1100;

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
    padding: 12,
    width: SHORT_SCREEN ? '86%' : '72%',
    // A percentage of a shorter screen is less absolute room: 62% of the
    // Nomad's 998dp is 619, against 846 on a Manta. The smaller device needs
    // the larger share, not the same one.
    maxHeight: SHORT_SCREEN ? '88%' : '62%',
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
  // Room to scroll the last field clear of the on-screen keyboard; without it
  // there is nothing below to scroll into and the field stays covered.
  formContentInner: {
    paddingBottom: 220,
  },
  formContent: {
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 2,
    marginTop: 4,
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
    paddingHorizontal: 8,
    paddingVertical: 4,
    color: '#000000',
    fontSize: 14,
    marginBottom: 5,
  },
  multilineInput: {
    height: 60,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  stateChip: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginRight: 5,
    marginBottom: 5,
    backgroundColor: '#ffffff',
  },
  stateChipSelected: {
    backgroundColor: '#000000',
  },
  stateChipText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#000000',
  },
  stateChipTextSelected: {
    color: '#ffffff',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  footerGrow: {
    flex: 1,
  },
  deleteTaskBtn: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    justifyContent: 'center',
    marginLeft: 8,
    backgroundColor: '#ffffff',
  },
  deleteTaskBtnText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000000',
  },
  timeFieldRow: {
    flexDirection: 'row',
  },
  timeField: {
    flex: 1,
    marginRight: 8,
  },
  timeEntryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  timeInput: {
    flex: 1,
    marginRight: 4,
  },
  meridiemBtn: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  meridiemText: { fontSize: 13, fontWeight: 'bold', color: '#000000' },
  inputInvalid: {
    borderColor: '#909090',
    borderStyle: 'dashed',
  },
  durationHint: { fontSize: 12, color: '#505050', marginBottom: 4 },
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
