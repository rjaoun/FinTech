import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { theme, formatCurrency } from "../../src/theme";
import { api } from "../../src/api";
import { useAuth } from "../../src/auth";
import { DashboardSummary, Category } from "../../src/types";

const MONTH_NAMES_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function shiftMonth(s: string, delta: number): string {
  const [y, m] = s.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return ymd(d);
}
function humanMonth(s: string): string {
  const [y, m] = s.split("-").map(Number);
  return `${MONTH_NAMES_FULL[m - 1]} ${y}`;
}

export default function Dashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [month, setMonth] = useState<string>(() => ymd(new Date()));

  const load = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([
        api.get(`/dashboard/summary?month=${month}`),
        api.get("/categories"),
      ]);
      setSummary(s.data);
      setCategories(c.data);
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [month]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const catMap = Object.fromEntries(categories.map((c) => [c.id, c]));
  const currency = user?.currency || "USD";

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const maxMonthly = Math.max(
    1,
    ...(summary?.monthly_series ?? []).flatMap((m) => [m.income, m.expense])
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.overline}>GOOD TO SEE YOU</Text>
            <Text style={styles.hello}>{user?.name?.split(" ")[0] || "Friend"}.</Text>
          </View>
          <TouchableOpacity
            testID="profile-avatar"
            onPress={() => router.push("/(tabs)/profile")}
            style={styles.avatar}
          >
            <Text style={styles.avatarText}>{(user?.name || "U").charAt(0).toUpperCase()}</Text>
          </TouchableOpacity>
        </View>

        {/* Month carousel */}
        <View style={styles.monthBar} testID="month-carousel">
          <TouchableOpacity
            testID="month-prev"
            onPress={() => setMonth((m) => shiftMonth(m, -1))}
            style={styles.monthArrow}
          >
            <Ionicons name="chevron-back" size={18} color={theme.colors.text} />
          </TouchableOpacity>
          <View style={styles.monthCenter}>
            <Text style={styles.monthLabel} testID="month-label">{humanMonth(month)}</Text>
            {month !== ymd(new Date()) ? (
              <TouchableOpacity testID="month-today" onPress={() => setMonth(ymd(new Date()))}>
                <Text style={styles.monthTodayLink}>Jump to current</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.monthSubtle}>This month</Text>
            )}
          </View>
          <TouchableOpacity
            testID="month-next"
            onPress={() => setMonth((m) => shiftMonth(m, 1))}
            style={styles.monthArrow}
          >
            <Ionicons name="chevron-forward" size={18} color={theme.colors.text} />
          </TouchableOpacity>
        </View>

        {/* Balance card */}
        <View style={styles.balanceCard} testID="balance-card">
          <Text style={styles.balanceLabel}>Balance · {humanMonth(month)}</Text>
          <Text style={styles.balanceValue} testID="balance-value">
            {formatCurrency(summary?.month_balance ?? 0, currency)}
          </Text>
          <View style={styles.balanceRow}>
            <View style={styles.balanceCell}>
              <View style={styles.chipUp}>
                <Ionicons name="arrow-down" size={12} color={theme.colors.textInverse} />
              </View>
              <View>
                <Text style={styles.cellLabel}>Income</Text>
                <Text style={styles.cellValue}>{formatCurrency(summary?.month_income ?? 0, currency)}</Text>
              </View>
            </View>
            <View style={styles.verticalDivider} />
            <View style={styles.balanceCell}>
              <View style={styles.chipDown}>
                <Ionicons name="arrow-up" size={12} color={theme.colors.textInverse} />
              </View>
              <View>
                <Text style={styles.cellLabel}>Expense</Text>
                <Text style={styles.cellValue}>{formatCurrency(summary?.month_expense ?? 0, currency)}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickRow}>
          <TouchableOpacity
            testID="add-transaction-cta"
            style={[styles.quickBtn, { backgroundColor: theme.colors.primary }]}
            onPress={() => router.push("/add-transaction")}
          >
            <Ionicons name="add" size={20} color={theme.colors.textInverse} />
            <Text style={[styles.quickText, { color: theme.colors.textInverse }]}>Add transaction</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="calendar-cta"
            style={[styles.quickBtn, { backgroundColor: theme.colors.surface }]}
            onPress={() => router.push({ pathname: "/calendar", params: { month } })}
          >
            <Ionicons name="calendar-outline" size={18} color={theme.colors.text} />
            <Text style={[styles.quickText, { color: theme.colors.text }]}>Calendar</Text>
          </TouchableOpacity>
        </View>

        {/* Monthly trend */}
        <View style={styles.section} testID="trend-card">
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>6-month rhythm</Text>
            <Text style={styles.sectionHint}>income vs expense</Text>
          </View>
          <View style={styles.trendRow}>
            {(summary?.monthly_series ?? []).length === 0 ? (
              <Text style={styles.emptyText}>No data yet. Add a transaction to see your rhythm.</Text>
            ) : (
              (summary?.monthly_series ?? []).map((m) => (
                <View key={m.month} style={styles.trendCol}>
                  <View style={styles.trendBars}>
                    <View
                      style={[
                        styles.bar,
                        { backgroundColor: theme.colors.income, height: Math.max(4, (m.income / maxMonthly) * 100) },
                      ]}
                    />
                    <View
                      style={[
                        styles.bar,
                        { backgroundColor: theme.colors.expense, height: Math.max(4, (m.expense / maxMonthly) * 100) },
                      ]}
                    />
                  </View>
                  <Text style={styles.trendLabel}>{m.month.slice(5)}</Text>
                </View>
              ))
            )}
          </View>
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: theme.colors.income }]} />
              <Text style={styles.legendText}>Income</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: theme.colors.expense }]} />
              <Text style={styles.legendText}>Expense</Text>
            </View>
          </View>
        </View>

        {/* Recent transactions */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent activity</Text>
            <TouchableOpacity onPress={() => router.push("/(tabs)/transactions")}>
              <Text style={styles.link}>See all</Text>
            </TouchableOpacity>
          </View>
          {(summary?.recent_transactions ?? []).length === 0 ? (
            <Text style={styles.emptyText}>No transactions yet.</Text>
          ) : (
            (summary?.recent_transactions ?? []).map((t) => {
              const cat = catMap[t.category];
              return (
                <View key={t.id} style={styles.txRow} testID={`recent-tx-${t.id}`}>
                  <View style={[styles.txIcon, { backgroundColor: (cat?.color || theme.colors.primary) + "22" }]}>
                    <Ionicons name={(cat?.icon as any) || "ellipse"} size={18} color={cat?.color || theme.colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.txTitle} numberOfLines={1}>
                      {t.description || cat?.name || t.category}
                    </Text>
                    <Text style={styles.txMeta}>
                      {cat?.name || t.category} · {t.date.slice(0, 10)}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.txAmount,
                      { color: t.type === "income" ? theme.colors.income : theme.colors.expense },
                    ]}
                  >
                    {t.type === "income" ? "+" : "-"}
                    {formatCurrency(t.amount, currency)}
                  </Text>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: theme.spacing.lg, paddingBottom: 48 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: theme.spacing.lg,
  },
  overline: { fontSize: 11, letterSpacing: 3, color: theme.colors.textMuted, fontWeight: "600" },
  hello: { fontSize: 28, fontWeight: "800", color: theme.colors.text, marginTop: 4, letterSpacing: -0.5 },
  monthBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radius.pill,
    paddingVertical: 8, paddingHorizontal: 8,
    marginBottom: theme.spacing.md,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  monthArrow: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: theme.colors.surface,
    alignItems: "center", justifyContent: "center",
  },
  monthCenter: { flex: 1, alignItems: "center" },
  monthLabel: { fontSize: 15, fontWeight: "700", color: theme.colors.text, letterSpacing: -0.2 },
  monthSubtle: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  monthTodayLink: { fontSize: 11, color: theme.colors.primary, marginTop: 2, fontWeight: "600" },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: theme.colors.textInverse, fontWeight: "700", fontSize: 16 },
  balanceCard: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    ...theme.shadow.card,
  },
  balanceLabel: { color: "#DCE6E1", fontSize: 12, letterSpacing: 2, fontWeight: "600" },
  balanceValue: {
    color: theme.colors.textInverse,
    fontSize: 42,
    fontWeight: "800",
    letterSpacing: -1.5,
    marginTop: 6,
  },
  balanceRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: "#ffffff20",
  },
  balanceCell: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  chipUp: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.income,
    alignItems: "center",
    justifyContent: "center",
  },
  chipDown: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.expense,
    alignItems: "center",
    justifyContent: "center",
  },
  cellLabel: { color: "#DCE6E1", fontSize: 11, fontWeight: "600", letterSpacing: 1.5 },
  cellValue: { color: theme.colors.textInverse, fontSize: 15, fontWeight: "700" },
  verticalDivider: { width: 1, height: 32, backgroundColor: "#ffffff20", marginHorizontal: 8 },
  quickRow: { flexDirection: "row", gap: 12, marginTop: theme.spacing.lg },
  quickBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: theme.radius.pill,
  },
  quickText: { fontWeight: "700", fontSize: 14 },
  section: {
    marginTop: theme.spacing.lg,
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadow.soft,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: theme.spacing.md,
  },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: theme.colors.text, letterSpacing: -0.2 },
  sectionHint: { fontSize: 11, color: theme.colors.textMuted },
  link: { color: theme.colors.primary, fontWeight: "700", fontSize: 12 },
  trendRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    height: 130,
    paddingVertical: 8,
  },
  trendCol: { alignItems: "center", flex: 1, gap: 6 },
  trendBars: { flexDirection: "row", alignItems: "flex-end", gap: 3, height: 100 },
  bar: { width: 8, borderRadius: 4 },
  trendLabel: { fontSize: 10, color: theme.colors.textMuted, marginTop: 4 },
  legendRow: { flexDirection: "row", gap: 16, marginTop: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, color: theme.colors.textMuted },
  emptyText: { color: theme.colors.textMuted, fontSize: 14, textAlign: "center", paddingVertical: 16 },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  txIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  txTitle: { fontSize: 13, fontWeight: "600", color: theme.colors.text },
  txMeta: { fontSize: 11, color: theme.colors.textMuted, marginTop: 1 },
  txAmount: { fontSize: 13, fontWeight: "700" },
});

