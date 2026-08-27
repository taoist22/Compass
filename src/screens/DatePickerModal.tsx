import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

interface DatePickerModalProps {
  visible: boolean;
  value: Date;
  weekStartsOn?: number;
  onSelect: (date: Date) => void;
  onClose: () => void;
}

/** A conventional, weekday-aligned month picker shared by every date field. */
export function DatePickerModal({
  visible,
  value,
  weekStartsOn = 0,
  onSelect,
  onClose,
}: DatePickerModalProps): React.JSX.Element {
  const [year, setYear] = useState<number>(value.getFullYear());
  const [month, setMonth] = useState<number>(value.getMonth());
  const [choosingMonth, setChoosingMonth] = useState<boolean>(false);

  useEffect(() => {
    if (visible) {
      setYear(value.getFullYear());
      setMonth(value.getMonth());
      setChoosingMonth(false);
    }
  }, [visible, value]);

  const moveMonth = (delta: number) => {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  };
  const orderedDays = Array.from({ length: 7 }, (_, offset) => DAY_NAMES[(weekStartsOn + offset) % 7]);
  const leadingBlanks = (new Date(year, month, 1).getDay() - weekStartsOn + 7) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<number | null> = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.content} onStartShouldSetResponder={() => true}>
          <View style={styles.header}>
            <Text allowFontScaling={false} style={styles.title}>Choose date</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text allowFontScaling={false} style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.monthNav}>
            <TouchableOpacity style={styles.arrowBtn} onPress={() => moveMonth(-1)}>
              <Text allowFontScaling={false} style={styles.arrowText}>‹</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.monthTitleBtn} onPress={() => setChoosingMonth(current => !current)}>
              <Text allowFontScaling={false} style={styles.monthTitle}>{MONTH_NAMES[month]} {year} ▾</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.arrowBtn} onPress={() => moveMonth(1)}>
              <Text allowFontScaling={false} style={styles.arrowText}>›</Text>
            </TouchableOpacity>
          </View>

          {choosingMonth ? (
            <>
              <View style={styles.yearRow}>
                <TouchableOpacity style={styles.yearBtn} onPress={() => setYear(year - 1)}>
                  <Text allowFontScaling={false} style={styles.yearBtnText}>‹</Text>
                </TouchableOpacity>
                <Text allowFontScaling={false} style={styles.yearText}>{year}</Text>
                <TouchableOpacity style={styles.yearBtn} onPress={() => setYear(year + 1)}>
                  <Text allowFontScaling={false} style={styles.yearBtnText}>›</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.monthGrid}>
                {MONTH_NAMES.map((name, index) => (
                  <TouchableOpacity
                    key={name}
                    style={[styles.monthCell, month === index && styles.cellActive]}
                    onPress={() => {
                      setMonth(index);
                      setChoosingMonth(false);
                    }}
                  >
                    <Text allowFontScaling={false} style={[styles.monthCellText, month === index && styles.cellTextActive]}>{name.slice(0, 3)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : (
            <>
              <View style={styles.weekdayRow}>
                {orderedDays.map(day => <Text key={day} allowFontScaling={false} style={styles.weekday}>{day}</Text>)}
              </View>
              <View style={styles.dayGrid}>
                {cells.map((day, index) => {
                  if (day === null) return <View key={`blank-${index}`} style={styles.dayCell} />;
                  const active = value.getFullYear() === year && value.getMonth() === month && value.getDate() === day;
                  const today = new Date();
                  const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
                  return (
                    <TouchableOpacity
                      key={day}
                      style={[styles.dayCell, styles.dayCellBorder, isToday && styles.todayCell, active && styles.cellActive]}
                      onPress={() => {
                        onSelect(new Date(year, month, day));
                        onClose();
                      }}
                    >
                      <Text allowFontScaling={false} style={[styles.dayText, active && styles.cellTextActive]}>{day}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          <TouchableOpacity style={styles.todayBtn} onPress={() => { onSelect(new Date()); onClose(); }}>
            <Text allowFontScaling={false} style={styles.todayBtnText}>🎯 Today</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' },
  content: { backgroundColor: '#ffffff', borderWidth: 2, borderColor: '#000000', borderRadius: 8, padding: 12, width: 390 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  title: { fontSize: 16, fontWeight: 'bold', color: '#000000' },
  closeBtn: { minWidth: 44, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 17, color: '#000000' },
  monthNav: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  arrowBtn: { width: 48, minHeight: 42, borderWidth: 1, borderColor: '#000000', borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  arrowText: { fontSize: 20, fontWeight: 'bold', color: '#000000' },
  monthTitleBtn: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { fontSize: 16, fontWeight: 'bold', color: '#000000' },
  weekdayRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#000000', paddingBottom: 4 },
  weekday: { width: '14.2857%', textAlign: 'center', fontSize: 12, fontWeight: 'bold', color: '#000000' },
  dayGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingTop: 4 },
  dayCell: { width: '14.2857%', height: 42, alignItems: 'center', justifyContent: 'center' },
  dayCellBorder: { borderWidth: 1, borderColor: '#b0b0b0' },
  todayCell: { borderWidth: 2, borderColor: '#000000' },
  dayText: { fontSize: 14, color: '#000000' },
  cellActive: { backgroundColor: '#000000', borderColor: '#000000' },
  cellTextActive: { color: '#ffffff', fontWeight: 'bold' },
  yearRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  yearBtn: { minWidth: 44, minHeight: 40, borderWidth: 1, borderColor: '#000000', borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  yearBtnText: { fontSize: 18, fontWeight: 'bold', color: '#000000' },
  yearText: { fontSize: 16, fontWeight: 'bold', marginHorizontal: 18, color: '#000000' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  monthCell: { width: '31.3%', minHeight: 44, margin: '1%', borderWidth: 1, borderColor: '#000000', borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  monthCellText: { fontSize: 14, color: '#000000' },
  todayBtn: { marginTop: 8, minHeight: 44, borderWidth: 2, borderColor: '#000000', borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000000' },
  todayBtnText: { fontSize: 14, fontWeight: 'bold', color: '#ffffff' },
});
