import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { theme, formatCurrency } from "../../src/theme";
import { api } from "../../src/api";
import { useAuth } from "../../src/auth";
import { DashboardSummary, Category, Transaction } from "../../src/types";
import { useConfirm, useChoice } from "../../src/components/ConfirmDialog";
import { refreshBus } from "../../src/refresh-bus";
import SwipeToDelete from "../../src/components/SwipeToDelete";

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
function txMonth(t: Transaction): string {
  return (t.date || "").slice(0, 7);
}

type PaidFilter = "all" | "paid" | "unpaid";
type ProjectedEvent = Transaction & { projected: true };

export default function Dashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const confirm = useConfirm();
  const choose = useChoice();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [allTx, setAllTx] = useState<Transaction[]>([]);
  const [projected, setProjected] = useState<ProjectedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [month, setMonth] = useState<string>(() => ymd(new Date()));
  const [paidFilter, setPaidFilter] = useState<PaidFilter>("all");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const [s, c, t, cal] = await Promise.all([
        api.get(`/dashboard/summary?month=${month}`),
        api.get("/categories"),
        api.get("/transactions"),
        api.get(`/calendar?month=${month}`),
      ]);
      setSummary(s.data);
      setCategories(c.data);
      setAllTx(t.data);
      // Extract projected events (upcoming recurring instances) for this month
      const projList: ProjectedEvent[] = [];
      for (const day of cal.data?.days || []) {
        for (const ev of day.events || []) {
          if (ev.projected) {
            projList.push({
              id: ev.id,
              user_id: user?.id || "",
              amount: ev.amount,
              type: ev.type,
              category: ev.category,
              description: ev.description || "",
              date: ev.date,
              created_at: ev.date,
              recurring_rule_id: ev.recurring_rule_id,
              paid: true,
              projected: true,
            });
          }
        }
      }
      setProjected(projList);
    } catch {
      // Silently ignore — the 401 interceptor will bounce the user to /login,
      // and transient errors just leave the previous state in place.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [month, user]);

  useFocusEffect(
    useCallback(() => {
      if (refreshBus.flags.transactionsNeedReset) {
        refreshBus.flags.transactionsNeedReset = false;
        setPaidFilter("all");
        setQuery("");
      }
      load();
    }, [load])
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const catMap = Object.fromEntries(categories.map((c) => [c.id, c]));
  const currency = user?.currency || "USD";

  // Filter transactions for the selected month + search + paid status.
  // Include projected (upcoming recurring) events so users see what's coming.
  // NOTE: paid/unpaid state only applies to EXPENSES — income rows are always
  // considered "received" and are shown under both All and Paid filters, and
  // hidden from the Unpaid filter (unless they are projected upcoming).
  const monthTx = useMemo(() => {
    const target = month;
    const real = allTx.filter((t) => txMonth(t) === target);
    const proj = projected.filter((t) => txMonth(t) === target);
    let list: (Transaction & { projected?: boolean })[] = [...real, ...proj];
    if (paidFilter === "paid")
      list = list.filter(
        (t) => !t.projected && (t.type === "income" || t.paid !== false)
      );
    if (paidFilter === "unpaid")
      list = list.filter(
        (t) => t.projected || (t.type === "expense" && t.paid === false)
      );
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (t) =>
          (t.description || "").toLowerCase().includes(q) ||
          (catMap[t.category]?.name || "").toLowerCase().includes(q)
      );
    }
    // Sort by date desc so newest / soonest events surface first
    list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return list;
  }, [allTx, projected, month, paidFilter, query, catMap]);

  const paidCount = monthTx.filter(
    (t) => !t.projected && t.type === "expense" && t.paid !== false
  ).length;
  const unpaidCount =
    allTx.filter(
      (t) => txMonth(t) === month && t.type === "expense" && t.paid === false
    ).length + projected.filter((t) => txMonth(t) === month).length;

  const togglePaid = async (t: Transaction) => {
    if (t.type !== "expense") return; // paid state only applies to expenses
    const newPaid = !(t.paid !== false);
    // Optimistic update
    setAllTx((prev) => prev.map((x) => (x.id === t.id ? { ...x, paid: newPaid } : x)));
    try {
      await api.patch(`/transactions/${t.id}/paid`, { paid: newPaid });
      // Refresh summary in the background (income/expense may not change but keep in sync)
      api.get(`/dashboard/summary?month=${month}`).then((r) => setSummary(r.data)).catch(() => {});
    } catch {
      // Revert on failure
      setAllTx((prev) => prev.map((x) => (x.id === t.id ? { ...x, paid: !newPaid } : x)));
    }
  };

  const onDelete = async (t: Transaction) => {
    // Recurring rows: ask whether to delete just this occurrence or the entire series.
    if (t.recurring_rule_id) {
      const pick = await choose({
        title: "Delete recurring transaction?",
        message:
          "This is part of a recurring series. Would you like to remove just this one, or the whole series?",
        icon: "repeat",
        choices: [
          { key: "one", label: "Just this one", destructive: true },
          { key: "series", label: "Delete entire series", destructive: true },
        ],
      });
      if (!pick) return;
      try {
        if (pick === "series") {
          await api.delete(
            `/recurring/${t.recurring_rule_id}?delete_generated=true`
          );
          setAllTx((prev) =>
            prev.filter((x) => x.recurring_rule_id !== t.recurring_rule_id)
          );
        } else {
          await api.delete(`/transactions/${t.id}`);
          setAllTx((prev) => prev.filter((x) => x.id !== t.id));
        }
        load();
      } catch {}
      return;
    }
    // Non-recurring: standard confirmation.
    const ok = await confirm({
      title: "Delete transaction?",
      message: "This cannot be undone.",
      destructive: true,
      confirmText: "Delete",
    });
    if (!ok) return;
    try {
      await api.delete(`/transactions/${t.id}`);
      setAllTx((prev) => prev.filter((x) => x.id !== t.id));
      load();
    } catch {}
  };

  const goEdit = async (t: Transaction) => {
    let scope: "one" | "all" = "one";
    if (t.recurring_rule_id) {
      const pick = await choose({
        title: "Edit recurring transaction?",
        message:
          "This is part of a recurring series. Do you want to change just this one, or update every transaction in the series?",
        icon: "create-outline",
        choices: [
          { key: "one", label: "Only this transaction", primary: true },
          { key: "all", label: "Update entire series", primary: true },
        ],
      });
      if (!pick) return;
      scope = pick as "one" | "all";
    }
    router.push({
      pathname: "/add-transaction",
      params: {
        id: t.id,
        amount: String(t.amount),
        description: t.description || "",
        category: t.category,
        type: t.type,
        date: t.date,
        paid: t.paid === false ? "0" : "1",
        recurring_rule_id: t.recurring_rule_id || "",
        scope,
      },
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

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
          <TouchableOpacity testID="profile-avatar" onPress={() => router.push("/(tabs)/profile")} style={styles.avatar}>
            <Text style={styles.avatarText}>{(user?.name || "U").charAt(0).toUpperCase()}</Text>
          </TouchableOpacity>
        </View>

        {/* Month carousel */}
        <View style={styles.monthBar} testID="month-carousel">
          <TouchableOpacity testID="month-prev" onPress={() => setMonth((m) => shiftMonth(m, -1))} style={styles.monthArrow}>
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
          <TouchableOpacity testID="month-next" onPress={() => setMonth((m) => shiftMonth(m, 1))} style={styles.monthArrow}>
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
                <Text style={styles.cellValue}>
                  {formatCurrency((summary?.month_income ?? 0) + (summary?.month_projected_income ?? 0), currency)}
                </Text>
              </View>
            </View>
            <View style={styles.verticalDivider} />
            <View style={styles.balanceCell}>
              <View style={styles.chipDown}>
                <Ionicons name="arrow-up" size={12} color={theme.colors.textInverse} />
              </View>
              <View>
                <Text style={styles.cellLabel}>Expense</Text>
                <Text style={styles.cellValue}>
                  {formatCurrency((summary?.month_expense ?? 0) + (summary?.month_projected_expense ?? 0), currency)}
                </Text>
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

        {/* Activity section */}
        <View style={styles.activityHeader}>
          <Text style={styles.activityTitle}>Activity</Text>
          <View style={styles.countPills}>
            <View style={[styles.countPill, { backgroundColor: theme.colors.income + "22" }]}>
              <Text style={[styles.countPillText, { color: theme.colors.income }]}>{paidCount} paid</Text>
            </View>
            {unpaidCount > 0 ? (
              <View style={[styles.countPill, { backgroundColor: theme.colors.accentSand + "33" }]}>
                <Text style={[styles.countPillText, { color: theme.colors.expense }]}>{unpaidCount} upcoming</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={theme.colors.textMuted} />
          <TextInput
            testID="search-input"
            value={query}
            onChangeText={setQuery}
            placeholder="Search description or category"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.searchInput}
          />
        </View>

        <View style={styles.chips}>
          {(["all", "paid", "unpaid"] as const).map((f) => (
            <TouchableOpacity
              key={f}
              testID={`filter-${f}`}
              onPress={() => setPaidFilter(f)}
              style={[styles.chip, paidFilter === f && styles.chipActive]}
            >
              <Text style={[styles.chipText, paidFilter === f && styles.chipTextActive]}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {monthTx.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="leaf-outline" size={28} color={theme.colors.textMuted} />
            <Text style={styles.emptyTitle}>Nothing here yet</Text>
            <Text style={styles.emptyText}>Tap “Add transaction” to record your first one for this month.</Text>
          </View>
        ) : (
          monthTx.map((t) => {
            const cat = catMap[t.category];
            const isProjected = !!t.projected;
            const isIncome = t.type === "income";
            const isPaid = !isProjected && t.paid !== false;
            return (
              <SwipeToDelete
                key={t.id}
                enabled={!isProjected}
                testID={`tx-delete-${t.id}`}
                onDelete={() => onDelete(t)}
                onTogglePaid={!isIncome ? () => togglePaid(t) : undefined}
                isPaid={isPaid}
                paidTestID={`tx-swipe-paid-${t.id}`}
              >
              {(guard) => (
              <TouchableOpacity
                testID={`tx-${t.id}`}
                onPress={() => !isProjected && guard(() => goEdit(t))}
                onLongPress={() => !isProjected && guard(() => onDelete(t))}
                disabled={isProjected}
                activeOpacity={isProjected ? 1 : 0.6}
                style={[styles.txRow, !isPaid && !isProjected && !isIncome && styles.txRowUnpaid, isProjected && styles.txRowProjected]}
              >
                {/* Left indicator — checkbox for expenses, receive-arrow badge for income, clock for projected */}
                {isProjected ? (
                  <View
                    style={[
                      styles.paidBox,
                      { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
                    ]}
                  >
                    <Ionicons name="time-outline" size={12} color={theme.colors.textMuted} />
                  </View>
                ) : isIncome ? (
                  <View
                    style={[
                      styles.paidBox,
                      { backgroundColor: theme.colors.income + "22", borderColor: theme.colors.income + "55" },
                    ]}
                  >
                    <Ionicons name="arrow-down" size={12} color={theme.colors.income} />
                  </View>
                ) : (
                  <TouchableOpacity
                    testID={`tx-paid-toggle-${t.id}`}
                    onPress={(e: any) => {
                      e?.stopPropagation?.();
                      guard(() => togglePaid(t));
                    }}
                    hitSlop={11}
                    style={[
                      styles.paidBox,
                      isPaid
                        ? { backgroundColor: theme.colors.income, borderColor: theme.colors.income }
                        : { borderColor: theme.colors.textMuted },
                    ]}
                  >
                    {isPaid ? <Ionicons name="checkmark" size={14} color={theme.colors.textInverse} /> : null}
                  </TouchableOpacity>
                )}

                <View style={[styles.txIcon, { backgroundColor: (cat?.color || theme.colors.primary) + "22" }]}>
                  <Ionicons name={(cat?.icon as any) || "ellipse"} size={16} color={cat?.color || theme.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.txTitle, !isPaid && !isProjected && !isIncome && styles.txTitleUnpaid]} numberOfLines={1}>
                    {t.description || cat?.name || t.category}
                  </Text>
                  <View style={styles.txMetaRow}>
                    {isProjected ? (
                      <View style={styles.upcomingPill} testID={`tx-upcoming-${t.id}`}>
                        <Text style={styles.upcomingPillText}>Upcoming</Text>
                      </View>
                    ) : !isPaid && !isIncome ? (
                      <View style={styles.unpaidPill}>
                        <Text style={styles.unpaidPillText}>Unpaid</Text>
                      </View>
                    ) : null}
                    {t.recurring_rule_id ? (
                      <View style={styles.recurBadge}>
                        <Ionicons name="repeat" size={9} color={theme.colors.primary} />
                        <Text style={styles.recurBadgeText}>Recurring</Text>
                      </View>
                    ) : null}
                    <Text style={styles.txMeta}>
                      {cat?.name || t.category} · {t.date.slice(0, 10)}
                    </Text>
                  </View>
                </View>
                <View style={styles.rowActions}>
                  <Text style={[styles.txAmount, { color: t.type === "income" ? theme.colors.income : theme.colors.expense }]}>
                    {t.type === "income" ? "+" : "-"}
                    {formatCurrency(t.amount, currency)}
                  </Text>
                  {!isProjected ? (
                    <View style={styles.iconBtnRow}>
                      <TouchableOpacity
                        testID={`tx-edit-${t.id}`}
                        onPress={(e: any) => {
                          e?.stopPropagation?.();
                          guard(() => goEdit(t));
                        }}
                        hitSlop={10}
                        style={styles.miniBtn}
                      >
                        <Ionicons name="pencil" size={13} color={theme.colors.primary} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Text style={styles.projHintInline}>auto on {t.date.slice(5, 10)}</Text>
                  )}
                </View>
              </TouchableOpacity>
              )}
              </SwipeToDelete>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: theme.spacing.lg, paddingBottom: 64 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: theme.spacing.md,
  },
  overline: { fontSize: 11, letterSpacing: 3, color: theme.colors.textMuted, fontWeight: "600" },
  hello: { fontSize: 26, fontWeight: "800", color: theme.colors.text, marginTop: 4, letterSpacing: -0.5 },
  avatar: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: theme.colors.primary,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { color: theme.colors.textInverse, fontWeight: "700", fontSize: 15 },
  monthBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: theme.colors.surfaceElevated, borderRadius: theme.radius.pill,
    paddingVertical: 6, paddingHorizontal: 6,
    marginBottom: theme.spacing.md,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  monthArrow: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: theme.colors.surface, alignItems: "center", justifyContent: "center",
  },
  monthCenter: { flex: 1, alignItems: "center" },
  monthLabel: { fontSize: 14, fontWeight: "700", color: theme.colors.text, letterSpacing: -0.2 },
  monthSubtle: { fontSize: 10, color: theme.colors.textMuted, marginTop: 1 },
  monthTodayLink: { fontSize: 10, color: theme.colors.primary, marginTop: 1, fontWeight: "600" },
  balanceCard: {
    backgroundColor: theme.colors.primary, borderRadius: theme.radius.xl,
    padding: theme.spacing.lg, ...theme.shadow.card,
  },
  balanceLabel: { color: "#DCE6E1", fontSize: 11, letterSpacing: 2, fontWeight: "600" },
  balanceValue: { color: theme.colors.textInverse, fontSize: 36, fontWeight: "800", letterSpacing: -1.2, marginTop: 4 },
  balanceRow: {
    flexDirection: "row", alignItems: "center",
    marginTop: theme.spacing.md, paddingTop: theme.spacing.sm,
    borderTopWidth: 1, borderTopColor: "#ffffff20",
  },
  balanceCell: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  chipUp: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: theme.colors.income,
    alignItems: "center", justifyContent: "center",
  },
  chipDown: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: theme.colors.expense,
    alignItems: "center", justifyContent: "center",
  },
  cellLabel: { color: "#DCE6E1", fontSize: 10, fontWeight: "600", letterSpacing: 1.5 },
  cellValue: { color: theme.colors.textInverse, fontSize: 14, fontWeight: "700" },
  verticalDivider: { width: 1, height: 30, backgroundColor: "#ffffff20", marginHorizontal: 6 },
  quickRow: { flexDirection: "row", gap: 10, marginTop: theme.spacing.md, marginBottom: theme.spacing.lg },
  quickBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 12, borderRadius: theme.radius.pill,
  },
  quickText: { fontWeight: "700", fontSize: 13 },
  activityHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 8,
  },
  activityTitle: { fontSize: 15, fontWeight: "700", color: theme.colors.text, letterSpacing: -0.2 },
  countPills: { flexDirection: "row", gap: 6 },
  countPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: theme.radius.pill },
  countPillText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.4 },
  searchBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.md, marginBottom: 8,
  },
  searchInput: { flex: 1, fontSize: 13, color: theme.colors.text },
  chips: { flexDirection: "row", gap: 6, marginBottom: theme.spacing.md },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { fontSize: 12, fontWeight: "600", color: theme.colors.textMuted },
  chipTextActive: { color: theme.colors.textInverse },
  empty: { alignItems: "center", paddingVertical: 32, gap: 6 },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: theme.colors.text },
  emptyText: { fontSize: 12, color: theme.colors.textMuted, textAlign: "center", paddingHorizontal: 24 },
  txRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radius.lg,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  txRowUnpaid: { backgroundColor: theme.colors.accentSand + "18", borderColor: theme.colors.accentSand + "60" },
  txRowProjected: { backgroundColor: theme.colors.primaryLight + "80", borderColor: theme.colors.primary + "40", borderStyle: "dashed" },
  upcomingPill: {
    paddingHorizontal: 6, paddingVertical: 1,
    backgroundColor: theme.colors.primary, borderRadius: theme.radius.pill,
  },
  upcomingPillText: { fontSize: 9, fontWeight: "700", color: theme.colors.textInverse, letterSpacing: 0.4, textTransform: "uppercase" },
  projHintInline: { fontSize: 10, color: theme.colors.textMuted, fontStyle: "italic", marginTop: 2 },
  paidBox: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, alignItems: "center", justifyContent: "center",
    backgroundColor: theme.colors.bg,
  },
  txIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  txTitle: { fontSize: 13, fontWeight: "600", color: theme.colors.text },
  txTitleUnpaid: { color: theme.colors.textMuted, textDecorationLine: "line-through" },
  txMetaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2, flexWrap: "wrap" },
  unpaidPill: {
    paddingHorizontal: 6, paddingVertical: 1,
    backgroundColor: theme.colors.expense, borderRadius: theme.radius.pill,
  },
  unpaidPillText: { fontSize: 9, fontWeight: "700", color: theme.colors.textInverse, letterSpacing: 0.4 },
  recurBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 6, paddingVertical: 1,
    backgroundColor: theme.colors.primaryLight, borderRadius: theme.radius.pill,
  },
  recurBadgeText: { fontSize: 9, fontWeight: "700", color: theme.colors.primary, letterSpacing: 0.4, textTransform: "uppercase" },
  txMeta: { fontSize: 11, color: theme.colors.textMuted },
  rowActions: { alignItems: "flex-end", gap: 4 },
  txAmount: { fontSize: 13, fontWeight: "700" },
  iconBtnRow: { flexDirection: "row", gap: 4 },
  miniBtn: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: theme.colors.surface,
    alignItems: "center", justifyContent: "center",
  },
});
