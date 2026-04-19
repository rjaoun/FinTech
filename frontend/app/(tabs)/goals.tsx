import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { theme, formatCurrency } from "../../src/theme";
import { api } from "../../src/api";
import { useAuth } from "../../src/auth";
import { Goal } from "../../src/types";

export default function Goals() {
  const { user } = useAuth();
  const [items, setItems] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [saving, setSaving] = useState(false);

  const [contribOpen, setContribOpen] = useState<string | null>(null);
  const [contribAmount, setContribAmount] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await api.get("/goals");
      setItems(r.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const currency = user?.currency || "USD";

  const createGoal = async () => {
    if (!title.trim() || !target) {
      Alert.alert("Missing info", "Please enter a title and target amount.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/goals", {
        title: title.trim(),
        target_amount: parseFloat(target),
        current_amount: 0,
        deadline: deadline || null,
      });
      setShowCreate(false);
      setTitle("");
      setTarget("");
      setDeadline("");
      load();
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not create goal");
    } finally {
      setSaving(false);
    }
  };

  const addContribution = async (gid: string) => {
    const amt = parseFloat(contribAmount);
    if (!amt || amt <= 0) return;
    try {
      await api.post(`/goals/${gid}/contribute`, { amount: amt });
      setContribOpen(null);
      setContribAmount("");
      load();
    } catch {}
  };

  const onDelete = (gid: string) => {
    Alert.alert("Delete goal?", "You'll lose progress tracking for this goal.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/goals/${gid}`);
            setItems((prev) => prev.filter((g) => g.id !== gid));
          } catch {}
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.overline}>SAVINGS</Text>
          <Text style={styles.title}>Your goals</Text>
        </View>
        <TouchableOpacity testID="add-goal-btn" onPress={() => setShowCreate(true)} style={styles.addBtn}>
          <Ionicons name="add" size={22} color={theme.colors.textInverse} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: 48 }}>
          {items.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="flag-outline" size={36} color={theme.colors.textMuted} />
              <Text style={styles.emptyTitle}>No goals yet</Text>
              <Text style={styles.emptyText}>
                Name a goal — an emergency fund, a trip, a rainy-day stash — and watch it grow.
              </Text>
              <TouchableOpacity
                testID="empty-add-goal"
                onPress={() => setShowCreate(true)}
                style={styles.primaryBtn}
              >
                <Text style={styles.primaryBtnText}>Create a goal</Text>
              </TouchableOpacity>
            </View>
          ) : (
            items.map((g) => {
              const pct = Math.min(100, Math.round((g.current_amount / g.target_amount) * 100));
              return (
                <View key={g.id} style={styles.goalCard} testID={`goal-${g.id}`}>
                  <View style={styles.goalHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.goalTitle}>{g.title}</Text>
                      {g.deadline ? (
                        <Text style={styles.goalDeadline}>By {g.deadline}</Text>
                      ) : null}
                    </View>
                    <TouchableOpacity
                      testID={`goal-delete-${g.id}`}
                      onPress={() => onDelete(g.id)}
                      style={styles.trashBtn}
                    >
                      <Ionicons name="trash-outline" size={16} color={theme.colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.progressBg}>
                    <View style={[styles.progressFill, { width: `${pct}%` }]} />
                  </View>
                  <View style={styles.goalFooter}>
                    <Text style={styles.goalAmount}>
                      {formatCurrency(g.current_amount, currency)}{" "}
                      <Text style={styles.goalTarget}>/ {formatCurrency(g.target_amount, currency)}</Text>
                    </Text>
                    <Text style={styles.goalPct}>{pct}%</Text>
                  </View>
                  {contribOpen === g.id ? (
                    <View style={styles.contribRow}>
                      <TextInput
                        testID={`goal-contrib-input-${g.id}`}
                        value={contribAmount}
                        onChangeText={setContribAmount}
                        keyboardType="decimal-pad"
                        placeholder="Amount"
                        placeholderTextColor={theme.colors.textMuted}
                        style={styles.contribInput}
                      />
                      <TouchableOpacity
                        testID={`goal-contrib-save-${g.id}`}
                        onPress={() => addContribution(g.id)}
                        style={styles.contribBtn}
                      >
                        <Text style={styles.contribBtnText}>Save</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      testID={`goal-contribute-${g.id}`}
                      onPress={() => setContribOpen(g.id)}
                      style={styles.addContribBtn}
                    >
                      <Ionicons name="add-circle-outline" size={16} color={theme.colors.primary} />
                      <Text style={styles.addContribText}>Add contribution</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Create modal */}
      <Modal visible={showCreate} animationType="slide" transparent onRequestClose={() => setShowCreate(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New goal</Text>
              <TouchableOpacity testID="close-goal-modal" onPress={() => setShowCreate(false)}>
                <Ionicons name="close" size={22} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.label}>Title</Text>
            <TextInput
              testID="goal-title-input"
              value={title}
              onChangeText={setTitle}
              placeholder="e.g., Emergency fund"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
            />
            <Text style={styles.label}>Target amount</Text>
            <TextInput
              testID="goal-target-input"
              value={target}
              onChangeText={setTarget}
              keyboardType="decimal-pad"
              placeholder="2000"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
            />
            <Text style={styles.label}>Deadline (YYYY-MM-DD, optional)</Text>
            <TextInput
              testID="goal-deadline-input"
              value={deadline}
              onChangeText={setDeadline}
              placeholder="2026-12-31"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
            />
            <TouchableOpacity
              testID="goal-save-btn"
              onPress={createGoal}
              disabled={saving}
              style={[styles.primaryBtn, { marginTop: 16 }]}
            >
              {saving ? (
                <ActivityIndicator color={theme.colors.textInverse} />
              ) : (
                <Text style={styles.primaryBtnText}>Create goal</Text>
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
    flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between",
    paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md, paddingBottom: theme.spacing.md,
  },
  overline: { fontSize: 11, letterSpacing: 3, color: theme.colors.textMuted, fontWeight: "600" },
  title: { fontSize: 28, fontWeight: "800", color: theme.colors.text, letterSpacing: -0.5, marginTop: 4 },
  addBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.colors.primary,
    alignItems: "center", justifyContent: "center",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", paddingVertical: 64, gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: theme.colors.text },
  emptyText: { fontSize: 14, color: theme.colors.textMuted, textAlign: "center", paddingHorizontal: 32, lineHeight: 20 },
  primaryBtn: {
    backgroundColor: theme.colors.primary, paddingHorizontal: 24, paddingVertical: 14,
    borderRadius: theme.radius.pill, marginTop: 8, alignItems: "center", minWidth: 200,
  },
  primaryBtnText: { color: theme.colors.textInverse, fontWeight: "700", fontSize: 15 },
  goalCard: {
    backgroundColor: theme.colors.surfaceElevated, borderRadius: theme.radius.xl,
    padding: theme.spacing.lg, marginBottom: theme.spacing.md,
    borderWidth: 1, borderColor: theme.colors.border, ...theme.shadow.soft,
  },
  goalHeader: { flexDirection: "row", alignItems: "center", marginBottom: theme.spacing.md },
  goalTitle: { fontSize: 17, fontWeight: "700", color: theme.colors.text },
  goalDeadline: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  trashBtn: { padding: 8 },
  progressBg: {
    height: 10, borderRadius: 5,
    backgroundColor: theme.colors.surface, overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: theme.colors.primary, borderRadius: 5 },
  goalFooter: { flexDirection: "row", justifyContent: "space-between", marginTop: 10, alignItems: "center" },
  goalAmount: { fontSize: 15, fontWeight: "700", color: theme.colors.text },
  goalTarget: { color: theme.colors.textMuted, fontWeight: "500" },
  goalPct: { fontSize: 14, fontWeight: "700", color: theme.colors.primary },
  contribRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  contribInput: {
    flex: 1, backgroundColor: theme.colors.bg, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: theme.colors.text,
  },
  contribBtn: {
    backgroundColor: theme.colors.primary, paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: theme.radius.md, justifyContent: "center",
  },
  contribBtnText: { color: theme.colors.textInverse, fontWeight: "700" },
  addContribBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 },
  addContribText: { color: theme.colors.primary, fontWeight: "600", fontSize: 14 },
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
    color: theme.colors.textMuted, marginBottom: 6, marginTop: 10, textTransform: "uppercase",
  },
  input: {
    backgroundColor: theme.colors.surfaceElevated, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.md, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: theme.colors.text,
  },
});
