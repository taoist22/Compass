import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

interface DatePickerModalProps {
  visible: boolean;
  /** Date the picker opens on and highlights. */
  value: Date;
  onSelect: (date: Date) => void;
  onClose: () => void;
}

/**
 * Two-step date picker: choose a month, then a day. Shared by the calendar's
 * jump control and the item creation modal so both behave identically —
 * previously the modal only offered "tap for today" plus week/month nudges,
 * which made picking an arbitrary date tedious.
 */
export function DatePickerModal({
  visible,
  value,
  onSelect,
  onClose,
}: DatePickerModalProps): React.JSX.Element {
  const [year, setYear] = useState<number>(value.getFullYear());
  // null = showing months; a number = showing that month's days.
  const [month, setMonth] = useState<number | null>(null);

  useEffect(() => {
    if (visible) {
      setYear(value.getFullYear());
      setMonth(null);
    }
  }, [visible, value]);

  const daysInMonth = month === null ? 0 : new Date(year, month + 1, 0).getDate();

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.content} onStartShouldSetResponder={() => true}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {month === null ? 'Pick a month' : `${MONTH_NAMES[month]} ${year}`}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {month === null ? (
            <>
              <View style={styles.yearRow}>
                <TouchableOpacity style={styles.yearBtn} onPress={() => setYear(year - 1)}>
                  <Text style={styles.yearBtnText}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.yearText}>{year}</Text>
                <TouchableOpacity style={styles.yearBtn} onPress={() => setYear(year + 1)}>
                  <Text style={styles.yearBtnText}>›</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.grid}>
                {MONTH_NAMES.map((name, idx) => {
                  const active = value.getFullYear() === year && value.getMonth() === idx;
                  return (
                    <TouchableOpacity
                      key={name}
                      style={[styles.monthCell, active && styles.cellActive]}
                      onPress={() => setMonth(idx)}
                    >
                      <Text style={[styles.cellText, active && styles.cellTextActive]}>{name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          ) : (
            <>
              <View style={styles.grid}>
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                  const active =
                    value.getFullYear() === year &&
                    value.getMonth() === month &&
                    value.getDate() === day;
                  return (
                    <TouchableOpacity
                      key={day}
                      style={[styles.dayCell, active && styles.cellActive]}
                      onPress={() => {
                        onSelect(new Date(year, month, day));
                        onClose();
                      }}
                    >
                      <Text style={[styles.cellText, active && styles.cellTextActive]}>{day}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity style={styles.backBtn} onPress={() => setMonth(null)}>
                <Text style={styles.backBtnText}>‹ Months</Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity
            style={styles.todayBtn}
            onPress={() => {
              onSelect(new Date());
              onClose();
            }}
          >
            <Text style={styles.todayBtnText}>🎯 Today</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
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
  // Deliberately compact — the previous picker took most of the screen for
  // what is a quick choice.
  content: {
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 8,
    padding: 10,
    width: 320,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#000000',
  },
  closeText: {
    fontSize: 16,
    color: '#000000',
    paddingHorizontal: 6,
  },
  yearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  yearBtn: {
    paddingHorizontal: 14,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 4,
  },
  yearBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#000000',
  },
  yearText: {
    fontSize: 15,
    fontWeight: 'bold',
    marginHorizontal: 14,
    color: '#000000',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  monthCell: {
    width: '31.3%',
    paddingVertical: 8,
    margin: '1%',
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 4,
    alignItems: 'center',
  },
  dayCell: {
    width: '12.2%',
    paddingVertical: 6,
    margin: '0.65%',
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 4,
    alignItems: 'center',
  },
  cellActive: {
    backgroundColor: '#000000',
  },
  cellText: {
    fontSize: 13,
    color: '#000000',
  },
  cellTextActive: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
  backBtn: {
    paddingVertical: 6,
    alignItems: 'center',
  },
  backBtnText: {
    fontSize: 13,
    color: '#101010',
  },
  todayBtn: {
    marginTop: 6,
    paddingVertical: 8,
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  todayBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
  },
});
