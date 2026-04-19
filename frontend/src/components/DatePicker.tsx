import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../theme";

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function parseYMD(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

function formatYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function humanDate(s: string | null | undefined): string {
  const d = parseYMD(s);
  if (!d) return "Select date";
  return `${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}`;
}

type Props = {
  value: string | null;
  onChange: (v: string | null) => void;
  label?: string;
  placeholder?: string;
  clearable?: boolean;
  minDate?: string;
  testID?: string;
};

export default function DatePicker({
  value,
  onChange,
  label,
  placeholder = "Select date",
  clearable = false,
  minDate,
  testID,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = parseYMD(value);
  const minD = parseYMD(minDate);

  const [cursor, setCursor] = useState<Date>(() => {
    return selected ?? new Date();
  });

  const cells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const arr: (Date | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(new Date(year, month, d));
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [cursor]);

  const today = new Date();
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const isDisabled = (d: Date) => {
    if (!minD) return false;
    return d < minD && !sameDay(d, minD);
  };

  const pick = (d: Date) => {
    if (isDisabled(d)) return;
    onChange(formatYMD(d));
    setOpen(false);
  };

  const display = humanDate(value);

  return (
    <>
      <View style={styles.fieldRow}>
        <TouchableOpacity
          testID={testID || "datepicker-open"}
          onPress={() => {
            setCursor(selected ?? new Date());
            setOpen(true);
          }}
          style={[styles.field, !value && styles.fieldPlaceholder]}
        >
          <Ionicons name="calendar-outline" size={18} color={theme.colors.primary} />
          <Text style={[styles.fieldText, !value && styles.placeholderText]}>
            {value ? display : placeholder}
          </Text>
        </TouchableOpacity>
        {clearable && value ? (
          <TouchableOpacity
            testID={`${testID || "datepicker"}-clear`}
            onPress={() => onChange(null)}
            style={styles.clearBtn}
          >
            <Ionicons name="close" size={16} color={theme.colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.card} onPress={() => {}}>
            <View style={styles.header}>
              <TouchableOpacity
                testID={`${testID || "datepicker"}-prev-month`}
                onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
                style={styles.navBtn}
              >
                <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
              </TouchableOpacity>
              <Text style={styles.monthLabel}>
                {MONTH_NAMES[cursor.getMonth()]} {cursor.getFullYear()}
              </Text>
              <TouchableOpacity
                testID={`${testID || "datepicker"}-next-month`}
                onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
                style={styles.navBtn}
              >
                <Ionicons name="chevron-forward" size={20} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.weekRow}>
              {DAY_LABELS.map((l, i) => (
                <Text key={i} style={styles.weekLabel}>
                  {l}
                </Text>
              ))}
            </View>

            <View style={styles.grid}>
              {cells.map((d, i) => {
                if (!d) return <View key={i} style={styles.cell} />;
                const isSelected = selected && sameDay(d, selected);
                const isToday = sameDay(d, today);
                const disabled = isDisabled(d);
                return (
                  <TouchableOpacity
                    key={i}
                    testID={`${testID || "datepicker"}-day-${formatYMD(d)}`}
                    disabled={disabled}
                    onPress={() => pick(d)}
                    style={[
                      styles.cell,
                      isSelected && styles.cellSelected,
                      !isSelected && isToday && styles.cellToday,
                    ]}
                  >
                    <Text
                      style={[
                        styles.cellText,
                        isSelected && styles.cellTextSelected,
                        !isSelected && isToday && styles.cellTextToday,
                        disabled && styles.cellTextDisabled,
                      ]}
                    >
                      {d.getDate()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.footer}>
              <TouchableOpacity
                testID={`${testID || "datepicker"}-today`}
                onPress={() => {
                  const t = new Date();
                  setCursor(t);
                  onChange(formatYMD(t));
                  setOpen(false);
                }}
                style={styles.footerBtn}
              >
                <Text style={styles.footerBtnText}>Today</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID={`${testID || "datepicker"}-close`}
                onPress={() => setOpen(false)}
                style={[styles.footerBtn, styles.footerPrimary]}
              >
                <Text style={[styles.footerBtnText, { color: theme.colors.textInverse }]}>Done</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {label ? <Text /> : null}
    </>
  );
}

const CELL = 40;

const styles = StyleSheet.create({
  fieldRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  field: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 14, paddingVertical: 13,
  },
  fieldPlaceholder: { backgroundColor: theme.colors.bg },
  fieldText: { fontSize: 15, color: theme.colors.text, fontWeight: "600" },
  placeholderText: { color: theme.colors.textMuted, fontWeight: "500" },
  clearBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: theme.colors.surface,
    alignItems: "center", justifyContent: "center",
  },
  backdrop: {
    flex: 1, alignItems: "center", justifyContent: "center",
    backgroundColor: "#00000080", padding: 20,
  },
  card: {
    width: "100%", maxWidth: 360,
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: 24, padding: 18,
    ...theme.shadow.card,
  },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 14,
  },
  navBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: theme.colors.surface,
    alignItems: "center", justifyContent: "center",
  },
  monthLabel: { fontSize: 16, fontWeight: "700", color: theme.colors.text },
  weekRow: { flexDirection: "row", marginBottom: 6 },
  weekLabel: {
    flex: 1, textAlign: "center",
    fontSize: 11, fontWeight: "700", color: theme.colors.textMuted, letterSpacing: 0.8,
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: `${100 / 7}%`, height: CELL,
    alignItems: "center", justifyContent: "center",
    borderRadius: CELL / 2,
  },
  cellSelected: { backgroundColor: theme.colors.primary },
  cellToday: {
    borderWidth: 1.5, borderColor: theme.colors.primary,
  },
  cellText: { fontSize: 14, color: theme.colors.text, fontWeight: "600" },
  cellTextSelected: { color: theme.colors.textInverse, fontWeight: "700" },
  cellTextToday: { color: theme.colors.primary, fontWeight: "700" },
  cellTextDisabled: { color: theme.colors.border },
  footer: { flexDirection: "row", gap: 8, marginTop: 12 },
  footerBtn: {
    flex: 1, paddingVertical: 12, borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface, alignItems: "center",
  },
  footerPrimary: { backgroundColor: theme.colors.primary },
  footerBtnText: { fontWeight: "700", color: theme.colors.text, fontSize: 14 },
});
