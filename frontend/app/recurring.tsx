import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { theme, formatCurrency } from "../src/theme";
import { api } from "../src/api";
import { useAuth } from "../src/auth";
import { RecurringRule, Category } from "../src/types";

export default function Recurring() {
  const router = useRouter();
  const { user } = useAuth();
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [r, c] = await Promise.all([api.get("/recurring"), api.get("/categories")]);
      setRules(r.data);
      setCategories(c.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const catMap = Object.fromEntries(categories.map((c) => [c.id, c]));
  const currency = user?.currency || "USD";

  const toggle = async (rid: string) => {
    try {
      await api.patch(`/recurring/${rid}`);
      load();
    } catch {}
  };

  const onDelete = (rule: RecurringRule) => {
    Alert.alert(
      "Remove recurring rule?",
      "You can keep the transactions it already created, or delete them too.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Keep history",
          onPress: async () => {
            try {
              await api.delete(`/recurring/${rule.id}`);
              setRules((prev) => prev.filter((x) => x.id !== rule.id));
            } catch {}
          },
        },
        {
          text: "Delete everything",
          style: "destructive",
          onPress: async () => {
            try {
              await api.delete(`/recurring/${rule.id}?delete_generated=true`);
              setRules((prev) => prev.filter((x) => x.id !== rule.id));
            } catch {}
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity testID="recurring-back-btn" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={styles.overline}>AUTO-REPEATING</Text>
          <Text style={styles.title}>Recurring</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: 48 }}>
          {rules.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="repeat-outline" size={36} color={theme.colors.textMuted} />
              <Text style={styles.emptyTitle}>No recurring items</Text>
              <Text style={styles.emptyText}>
                When adding a transaction, pick a frequency (weekly, monthly, etc.) and it'll auto-create each cycle.
              </Text>
            </View>
          ) : (
            rules.map((r) => {
              const c = catMap[r.category];
              const isExpense = r.type === "expense";
              return (
                <View key={r.id} style={[styles.card, !r.active && { opacity: 0.55 }]} testID={`recurring-${r.id}`}>
                  <View style={styles.row}>
                    <View style={[styles.icon, { backgroundColor: (c?.color || theme.colors.primary) + "22" }]}>
                      <Ionicons name={(c?.icon as any) || "ellipse"} size={20} color={c?.color || theme.colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {r.description || c?.name || r.category}
                      </Text>
                      <View style={styles.metaRow}>
                        <View style={styles.freqPill}>
                          <Ionicons name="repeat" size={11} color={theme.colors.primary} />
                          <Text style={styles.freqPillText}>{r.frequency}</Text>
                        </View>
                        <Text style={styles.rowMeta}>
                          {c?.name || r.category}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.amount, { color: isExpense ? theme.colors.expense : theme.colors.income }]}>
                      {isExpense ? "-" : "+"}
                      {formatCurrency(r.amount, currency)}
                    </Text>
                  </View>
                  <View style={styles.footer}>
                    <Text style={styles.nextText}>
                      {r.active ? "Next: " : "Paused · next would be "}
                      {r.next_date.slice(0, 10)}
                      {r.end_date ? `  ·  until ${r.end_date.slice(0, 10)}` : ""}
                    </Text>
                    <View style={styles.actions}>
                      <TouchableOpacity
                        testID={`recurring-toggle-${r.id}`}
                        onPress={() => toggle(r.id)}
                        style={styles.actionBtn}
                      >
                        <Ionicons
                          name={r.active ? "pause" : "play"}
                          size={14}
                          color={theme.colors.primary}
                        />
                        <Text style={styles.actionText}>{r.active ? "Pause" : "Resume"}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        testID={`recurring-delete-${r.id}`}
                        onPress={() => onDelete(r)}
                        style={styles.actionBtn}
                      >
                        <Ionicons name="trash-outline" size={14} color={theme.colors.expense} />
                        <Text style={[styles.actionText, { color: theme.colors.expense }]}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })
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
    paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md, paddingBottom: theme.spacing.md,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.colors.surface,
    alignItems: "center", justifyContent: "center",
  },
  overline: { fontSize: 11, letterSpacing: 3, color: theme.colors.textMuted, fontWeight: "600" },
  title: { fontSize: 22, fontWeight: "800", color: theme.colors.text, letterSpacing: -0.5, marginTop: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", paddingVertical: 64, gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: theme.colors.text },
  emptyText: {
    fontSize: 14, color: theme.colors.textMuted,
    textAlign: "center", paddingHorizontal: 24, lineHeight: 20,
  },
  card: {
    backgroundColor: theme.colors.surfaceElevated, borderRadius: theme.radius.xl,
    padding: theme.spacing.lg, marginBottom: theme.spacing.md,
    borderWidth: 1, borderColor: theme.colors.border, ...theme.shadow.soft,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 15, fontWeight: "700", color: theme.colors.text },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  freqPill: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 8, paddingVertical: 2,
    backgroundColor: theme.colors.primaryLight, borderRadius: theme.radius.pill,
  },
  freqPillText: {
    fontSize: 10, fontWeight: "700", color: theme.colors.primary,
    textTransform: "capitalize", letterSpacing: 0.4,
  },
  rowMeta: { fontSize: 12, color: theme.colors.textMuted },
  amount: { fontSize: 15, fontWeight: "800" },
  footer: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.border,
  },
  nextText: { fontSize: 12, color: theme.colors.textMuted, fontWeight: "500" },
  actions: { flexDirection: "row", gap: 12 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  actionText: { fontSize: 12, fontWeight: "700", color: theme.colors.primary },
});
