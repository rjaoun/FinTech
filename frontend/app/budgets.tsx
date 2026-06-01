import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { theme, formatCurrency } from "../src/theme";
import { api } from "../src/api";
import { Budget, Category } from "../src/types";
import { useAuth } from "../src/auth";
import { useConfirm } from "../src/components/ConfirmDialog";

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function Budgets() {
  const router = useRouter();
  const { user } = useAuth();
  const confirm = useConfirm();
  const [month] = useState(currentMonth());
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [cat, setCat] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [b, c] = await Promise.all([
        api.get(`/budgets?month=${month}`),
        api.get("/categories"),
      ]);
      setBudgets(b.data);
      setCategories(c.data);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    if (categories.length > 0 && !cat) {
      const firstExpense = categories.find((c) => c.type === "expense");
      if (firstExpense) setCat(firstExpense.id);
    }
  }, [categories, cat]);

  const catMap = Object.fromEntries(categories.map((c) => [c.id, c]));
  const expenseCats = categories.filter((c) => c.type === "expense");
  const currency = user?.currency || "USD";

  const save = async () => {
    if (!cat || !amount) {
      Alert.alert("Missing info", "Choose a category and enter an amount.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/budgets", {
        category: cat,
        amount: parseFloat(amount),
        month,
      });
      setShowCreate(false);
      setAmount("");
      load();
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not save budget");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id: string) => {
    const ok = await confirm({
      title: "Delete budget?",
      destructive: true,
      confirmText: "Delete",
    });
    if (!ok) return;
    await api.delete(`/budgets/${id}`);
    setBudgets((prev) => prev.filter((b) => b.id !== id));
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Budgets</Text>
        <TouchableOpacity testID="add-budget-btn" onPress={() => setShowCreate(true)} style={styles.addBtn}>
          <Ionicons name="add" size={22} color={theme.colors.textInverse} />
        </TouchableOpacity>
      </View>

      <Text style={styles.monthLabel}>For {month}</Text>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: 48 }}>
          {budgets.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="pie-chart-outline" size={32} color={theme.colors.textMuted} />
              <Text style={styles.emptyTitle}>No budgets set</Text>
              <Text style={styles.emptyText}>
                Set a gentle ceiling for your top categories to stay intentional this month.
              </Text>
            </View>
          ) : (
            budgets.map((b) => {
              const c = catMap[b.category];
              const pct = Math.min(100, Math.round((b.spent / b.amount) * 100));
              const over = b.spent > b.amount;
              return (
                <TouchableOpacity
                  key={b.id}
                  testID={`budget-${b.id}`}
                  onLongPress={() => onDelete(b.id)}
                  style={styles.card}
                >
                  <View style={styles.cardHeader}>
                    <View style={[styles.icon, { backgroundColor: (c?.color || theme.colors.primary) + "22" }]}>
                      <Ionicons name={(c?.icon as any) || "ellipse"} size={18} color={c?.color || theme.colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>{c?.name || b.category}</Text>
                      <Text style={styles.cardSub}>
                        {formatCurrency(b.spent, currency)} of {formatCurrency(b.amount, currency)}
                      </Text>
                    </View>
                    <Text style={[styles.pct, { color: over ? theme.colors.expense : theme.colors.primary }]}>
                      {pct}%
                    </Text>
                  </View>
                  <View style={styles.progressBg}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${pct}%`,
                          backgroundColor: over ? theme.colors.expense : (c?.color || theme.colors.primary),
                        },
                      ]}
                    />
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}

      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New budget</Text>
              <TouchableOpacity testID="close-budget-modal" onPress={() => setShowCreate(false)}>
                <Ionicons name="close" size={22} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.label}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {expenseCats.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  testID={`budget-cat-${c.id}`}
                  onPress={() => setCat(c.id)}
                  style={[
                    styles.catChip,
                    cat === c.id && { backgroundColor: c.color + "22", borderColor: c.color },
                  ]}
                >
                  <Ionicons name={c.icon as any} size={16} color={c.color} />
                  <Text style={styles.catName}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={styles.label}>Monthly limit</Text>
            <TextInput
              testID="budget-amount-input"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="500"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
            />
            <TouchableOpacity
              testID="save-budget-btn"
              onPress={save}
              disabled={saving}
              style={[styles.saveBtn, saving && { opacity: 0.7 }]}
            >
              {saving ? (
                <ActivityIndicator color={theme.colors.textInverse} />
              ) : (
                <Text style={styles.saveBtnText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.colors.surface,
    alignItems: "center", justifyContent: "center",
  },
  addBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.colors.primary,
    alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: 22, fontWeight: "800", color: theme.colors.text, letterSpacing: -0.5 },
  monthLabel: {
    fontSize: 12, letterSpacing: 2, color: theme.colors.textMuted,
    fontWeight: "600", paddingHorizontal: theme.spacing.lg, marginTop: 8, marginBottom: 4,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", paddingVertical: 64, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: theme.colors.text },
  emptyText: { fontSize: 14, color: theme.colors.textMuted, textAlign: "center", paddingHorizontal: 32 },
  card: {
    backgroundColor: theme.colors.surfaceElevated, borderRadius: theme.radius.xl,
    padding: theme.spacing.lg, marginBottom: theme.spacing.md,
    borderWidth: 1, borderColor: theme.colors.border, ...theme.shadow.soft,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 15, fontWeight: "700", color: theme.colors.text },
  cardSub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  pct: { fontSize: 16, fontWeight: "800" },
  progressBg: { height: 8, borderRadius: 4, backgroundColor: theme.colors.surface, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 4 },
  modalWrap: { flex: 1, justifyContent: "flex-end", backgroundColor: "#00000066" },
  modalCard: {
    backgroundColor: theme.colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: theme.spacing.lg, paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginBottom: theme.spacing.lg,
  },
  modalTitle: { fontSize: 22, fontWeight: "800", color: theme.colors.text, letterSpacing: -0.5 },
  label: {
    fontSize: 12, letterSpacing: 2, fontWeight: "600",
    color: theme.colors.textMuted, marginBottom: 8, marginTop: 12, textTransform: "uppercase",
  },
  input: {
    backgroundColor: theme.colors.surfaceElevated, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.md, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: theme.colors.text,
  },
  catChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
  },
  catName: { fontSize: 13, fontWeight: "600", color: theme.colors.text },
  saveBtn: {
    marginTop: 20, backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.pill, paddingVertical: 14, alignItems: "center",
  },
  saveBtnText: { color: theme.colors.textInverse, fontWeight: "700", fontSize: 15 },
});
