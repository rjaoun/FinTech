import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { theme, formatCurrency } from "../src/theme";
import { api } from "../src/api";
import { useAuth } from "../src/auth";
import { Category } from "../src/types";

const MONTH_NAMES_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function shiftMonth(s: string, delta: number): string {
  const [y, m] = s.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return ymd(d);
}

type CalendarEvent = {
  id: string;
  amount: number;
  type: "income" | "expense";
  category: string;
  description: string;
  projected: boolean;
  recurring_rule_id?: string | null;
  date: string;
};

type CalendarDay = {
  date: string;
  income: number;
  expense: number;
  projected_income: number;
  projected_expense: number;
  events: CalendarEvent[];
};

type CalendarResponse = {
  month: string;
  days: CalendarDay[];
  totals: {
    income: number;
    expense: number;
    projected_income: number;
    projected_expense: number;
  };
};

export default function CalendarScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ month?: string }>();
  const [month, setMonth] = useState<string>(params.month || ymd(new Date()));
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cal, cats] = await Promise.all([
        api.get(`/calendar?month=${month}`),
        api.get("/categories"),
      ]);
      setData(cal.data);
      setCategories(cats.data);
    } catch {
      // 401 or transient error — the interceptor bounces to /login if unauth.
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setSelectedDay(null);
  }, [month]);

  const catMap = Object.fromEntries(categories.map((c) => [c.id, c]));
  const currency = user?.currency || "USD";

  // Build a calendar grid for the month
  const cells = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const firstWeekday = new Date(y, m - 1, 1).getDay();
    const daysInMonth = new Date(y, m, 0).getDate();
    const arr: (string | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      arr.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [month]);

  const dayMap = useMemo(
    () => Object.fromEntries((data?.days ?? []).map((d) => [d.date, d])),
    [data]
  );

  const selectedEvents = selectedDay ? dayMap[selectedDay]?.events ?? [] : [];

  const totals = data?.totals;
  const monthLabel = `${MONTH_NAMES_FULL[Number(month.split("-")[1]) - 1]} ${month.split("-")[0]}`;
  const todayYmdShort = (() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  })();

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity testID="calendar-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Calendar</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.monthBar}>
        <TouchableOpacity
          testID="calendar-prev-month"
          onPress={() => setMonth((m) => shiftMonth(m, -1))}
          style={styles.iconBtn}
        >
          <Ionicons name="chevron-back" size={18} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={{ alignItems: "center", flex: 1 }}>
          <Text style={styles.monthLabel} testID="calendar-month-label">{monthLabel}</Text>
          {month !== ymd(new Date()) ? (
            <TouchableOpacity testID="calendar-today" onPress={() => setMonth(ymd(new Date()))}>
              <Text style={styles.linkSmall}>Jump to current</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.subtle}>This month</Text>
          )}
        </View>
        <TouchableOpacity
          testID="calendar-next-month"
          onPress={() => setMonth((m) => shiftMonth(m, 1))}
          style={styles.iconBtn}
        >
          <Ionicons name="chevron-forward" size={18} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, paddingBottom: 48 }}>
          {/* Totals */}
          <View style={styles.totalsRow}>
            <View style={[styles.totalCard, { borderLeftColor: theme.colors.income }]}>
              <Text style={styles.totalLabel}>Income</Text>
              <Text style={[styles.totalValue, { color: theme.colors.income }]}>
                {formatCurrency((totals?.income ?? 0) + (totals?.projected_income ?? 0), currency)}
              </Text>
            </View>
            <View style={[styles.totalCard, { borderLeftColor: theme.colors.expense }]}>
              <Text style={styles.totalLabel}>Expense</Text>
              <Text style={[styles.totalValue, { color: theme.colors.expense }]}>
                {formatCurrency((totals?.expense ?? 0) + (totals?.projected_expense ?? 0), currency)}
              </Text>
            </View>
          </View>

          {/* Day-of-week labels */}
          <View style={styles.weekRow}>
            {DAY_LABELS.map((l, i) => (
              <Text key={i} style={styles.weekLabel}>{l}</Text>
            ))}
          </View>

          {/* Calendar grid */}
          <View style={styles.grid}>
            {cells.map((d, i) => {
              if (!d) return <View key={i} style={styles.cell} />;
              const info = dayMap[d];
              const dayNum = Number(d.split("-")[2]);
              const isToday = d === todayYmdShort;
              const isSelected = d === selectedDay;
              const hasIncome = (info?.income ?? 0) + (info?.projected_income ?? 0) > 0;
              const hasExpense = (info?.expense ?? 0) + (info?.projected_expense ?? 0) > 0;
              const hasProjected = (info?.projected_income ?? 0) + (info?.projected_expense ?? 0) > 0;
              return (
                <TouchableOpacity
                  key={i}
                  testID={`calendar-day-${d}`}
                  onPress={() => setSelectedDay(d)}
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
                    ]}
                  >
                    {dayNum}
                  </Text>
                  <View style={styles.dotsRow}>
                    {hasIncome ? (
                      <View
                        style={[
                          styles.dot,
                          { backgroundColor: theme.colors.income, opacity: hasProjected && !info?.income ? 0.45 : 1 },
                        ]}
                      />
                    ) : null}
                    {hasExpense ? (
                      <View
                        style={[
                          styles.dot,
                          { backgroundColor: theme.colors.expense, opacity: hasProjected && !info?.expense ? 0.45 : 1 },
                        ]}
                      />
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Legend */}
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: theme.colors.income }]} />
              <Text style={styles.legendText}>Income</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: theme.colors.expense }]} />
              <Text style={styles.legendText}>Expense</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: theme.colors.textMuted, opacity: 0.45 }]} />
              <Text style={styles.legendText}>Upcoming</Text>
            </View>
          </View>

          {/* Selected day details */}
          {selectedDay ? (
            <View style={styles.dayCard} testID="calendar-day-detail">
              <Text style={styles.dayCardTitle}>
                {selectedDay}
                {dayMap[selectedDay] ? (
                  <Text style={styles.dayCardSubtle}>
                    {"  ·  "}{selectedEvents.length} event{selectedEvents.length === 1 ? "" : "s"}
                  </Text>
                ) : (
                  <Text style={styles.dayCardSubtle}>{"  ·  nothing scheduled"}</Text>
                )}
              </Text>
              {selectedEvents.map((ev) => {
                const c = catMap[ev.category];
                return (
                  <View key={ev.id} style={styles.eventRow} testID={`calendar-event-${ev.id}`}>
                    <View style={[styles.eventIcon, { backgroundColor: (c?.color || theme.colors.primary) + "22" }]}>
                      <Ionicons name={(c?.icon as any) || "ellipse"} size={16} color={c?.color || theme.colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.eventTitle} numberOfLines={1}>
                        {ev.description || c?.name || ev.category}
                      </Text>
                      <View style={styles.eventMetaRow}>
                        {ev.projected ? (
                          <View style={styles.projPill}>
                            <Ionicons name="time-outline" size={9} color={theme.colors.primary} />
                            <Text style={styles.projPillText}>Upcoming</Text>
                          </View>
                        ) : null}
                        {ev.recurring_rule_id && !ev.projected ? (
                          <View style={styles.recurPill}>
                            <Ionicons name="repeat" size={9} color={theme.colors.primary} />
                            <Text style={styles.recurPillText}>Recurring</Text>
                          </View>
                        ) : null}
                        <Text style={styles.eventMeta}>{c?.name || ev.category}</Text>
                      </View>
                    </View>
                    <Text
                      style={[
                        styles.eventAmount,
                        { color: ev.type === "income" ? theme.colors.income : theme.colors.expense },
                      ]}
                    >
                      {ev.type === "income" ? "+" : "-"}
                      {formatCurrency(ev.amount, currency)}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.hintCard}>
              <Ionicons name="information-circle-outline" size={16} color={theme.colors.textMuted} />
              <Text style={styles.hintText}>Tap any day with a dot to see what's planned.</Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md, paddingBottom: theme.spacing.sm,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.colors.surface,
    alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: 22, fontWeight: "800", color: theme.colors.text, letterSpacing: -0.5 },
  monthBar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md,
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radius.pill,
    paddingVertical: 6, paddingHorizontal: 6,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  monthLabel: { fontSize: 15, fontWeight: "700", color: theme.colors.text, letterSpacing: -0.2 },
  subtle: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  linkSmall: { fontSize: 11, color: theme.colors.primary, marginTop: 2, fontWeight: "600" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  totalsRow: { flexDirection: "row", gap: 10, marginBottom: theme.spacing.md },
  totalCard: {
    flex: 1, backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radius.lg,
    paddingVertical: 10, paddingHorizontal: 14,
    borderLeftWidth: 3,
    borderTopWidth: 1, borderBottomWidth: 1, borderRightWidth: 1, borderColor: theme.colors.border,
  },
  totalLabel: { fontSize: 11, fontWeight: "700", color: theme.colors.textMuted, letterSpacing: 1.2 },
  totalValue: { fontSize: 18, fontWeight: "800", marginTop: 2, letterSpacing: -0.3 },
  weekRow: { flexDirection: "row", marginBottom: 4 },
  weekLabel: {
    flex: 1, textAlign: "center", fontSize: 11, fontWeight: "700",
    color: theme.colors.textMuted, letterSpacing: 0.8,
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: `${100 / 7}%`, aspectRatio: 1,
    alignItems: "center", justifyContent: "center",
    borderRadius: 14,
  },
  cellSelected: { backgroundColor: theme.colors.primary },
  cellToday: { borderWidth: 1.5, borderColor: theme.colors.primary },
  cellText: { fontSize: 13, color: theme.colors.text, fontWeight: "600" },
  cellTextSelected: { color: theme.colors.textInverse, fontWeight: "700" },
  cellTextToday: { color: theme.colors.primary, fontWeight: "700" },
  dotsRow: { flexDirection: "row", gap: 3, marginTop: 3, height: 6 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  legend: { flexDirection: "row", gap: 14, marginTop: 10, justifyContent: "center" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendText: { fontSize: 11, color: theme.colors.textMuted },
  dayCard: {
    marginTop: theme.spacing.lg,
    backgroundColor: theme.colors.surfaceElevated, borderRadius: theme.radius.xl,
    padding: theme.spacing.lg, borderWidth: 1, borderColor: theme.colors.border,
    ...theme.shadow.soft,
  },
  dayCardTitle: { fontSize: 14, fontWeight: "700", color: theme.colors.text, marginBottom: 8 },
  dayCardSubtle: { fontSize: 12, fontWeight: "500", color: theme.colors.textMuted },
  eventRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  eventIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  eventTitle: { fontSize: 14, fontWeight: "600", color: theme.colors.text },
  eventMetaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" },
  eventMeta: { fontSize: 11, color: theme.colors.textMuted },
  eventAmount: { fontSize: 14, fontWeight: "700" },
  recurPill: {
    flexDirection: "row", alignItems: "center", gap: 2,
    paddingHorizontal: 6, paddingVertical: 1,
    backgroundColor: theme.colors.primaryLight, borderRadius: theme.radius.pill,
  },
  recurPillText: { fontSize: 9, fontWeight: "700", color: theme.colors.primary, textTransform: "uppercase", letterSpacing: 0.4 },
  projPill: {
    flexDirection: "row", alignItems: "center", gap: 2,
    paddingHorizontal: 6, paddingVertical: 1,
    backgroundColor: theme.colors.accentSand + "33", borderRadius: theme.radius.pill,
  },
  projPillText: { fontSize: 9, fontWeight: "700", color: theme.colors.primary, textTransform: "uppercase", letterSpacing: 0.4 },
  hintCard: {
    marginTop: theme.spacing.lg, flexDirection: "row", alignItems: "center", gap: 8,
    padding: 12, backgroundColor: theme.colors.surface, borderRadius: theme.radius.md,
  },
  hintText: { fontSize: 12, color: theme.colors.textMuted, flex: 1 },
});
