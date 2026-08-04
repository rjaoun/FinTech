import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../src/theme";
import { api } from "../src/api";
import { Category } from "../src/types";
import DatePicker from "../src/components/DatePicker";
import { useConfirm } from "../src/components/ConfirmDialog";
import { refreshBus } from "../src/refresh-bus";

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const isValidDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s).getTime());

// Combine a YYYY-MM-DD with the current time-of-day so transactions sort by insertion order within the same day.
function toIsoWithNowTime(ymd: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const hh = pad(now.getHours());
  const mm = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  return `${ymd}T${hh}:${mm}:${ss}`;
}

export default function AddTransaction() {
  const router = useRouter();
  const confirm = useConfirm();
  const params = useLocalSearchParams<{
    id?: string;
    amount?: string;
    description?: string;
    category?: string;
    type?: string;
    date?: string;
    paid?: string;
  }>();
  const isEdit = !!params.id;

  const [type, setType] = useState<"expense" | "income">(
    (params.type as "expense" | "income") || "expense"
  );
  const [amount, setAmount] = useState(params.amount || "");
  const [description, setDescription] = useState(params.description || "");
  const [category, setCategory] = useState<string>(params.category || "");
  const [date, setDate] = useState<string>(
    params.date ? params.date.slice(0, 10) : todayStr()
  );
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [aiSuggested, setAiSuggested] = useState<string | null>(null);
  const [frequency, setFrequency] = useState<
    "once" | "daily" | "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly"
  >("once");
  const [endDate, setEndDate] = useState<string | null>(null);

  useEffect(() => {
    api
      .get("/categories")
      .then((r) => {
        setCategories(r.data);
        if (!category) {
          const first = r.data.find((c: Category) => c.type === type);
          if (first) setCategory(first.id);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredCats = categories.filter((c) => c.type === type);

  // Keep selected category valid when type changes
  useEffect(() => {
    if (filteredCats.length > 0 && !filteredCats.find((c) => c.id === category)) {
      setCategory(filteredCats[0].id);
    }
  }, [type, filteredCats, category]);

  const suggestCategory = async () => {
    if (!description.trim()) {
      Alert.alert("Add a description first", "Type a few words (e.g., 'Starbucks latte') to get an AI suggestion.");
      return;
    }
    setSuggesting(true);
    try {
      const r = await api.post("/ai/suggest-category", {
        description,
        amount: amount ? parseFloat(amount) : null,
      });
      const cat = r.data.category;
      const catObj = categories.find((c) => c.id === cat);
      if (catObj) {
        setType(catObj.type);
        setCategory(cat);
        setAiSuggested(catObj.name);
      }
    } catch (e: any) {
      Alert.alert("AI error", "Could not get a suggestion.");
    } finally {
      setSuggesting(false);
    }
  };

  const save = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      Alert.alert("Invalid amount", "Please enter a positive amount.");
      return;
    }
    if (!category) {
      Alert.alert("Pick a category", "Please select a category.");
      return;
    }
    if (!isValidDate(date)) {
      Alert.alert("Invalid date", "Please enter the date as YYYY-MM-DD.");
      return;
    }
    setSaving(true);
    try {
      const isoDate = toIsoWithNowTime(date);
      const paidFlag = params.paid === "0" ? false : true;
      const payload = {
        amount: amt,
        type,
        category,
        description: description.trim(),
        date: isoDate,
        paid: paidFlag,
      };
      if (isEdit) {
        await api.put(`/transactions/${params.id}`, payload);
      } else if (frequency === "once") {
        await api.post("/transactions", payload);
      } else {
        if (endDate && endDate < date) {
          Alert.alert("Invalid end date", "End date must be on or after the start date.");
          setSaving(false);
          return;
        }
        await api.post("/recurring", {
          amount: amt,
          type,
          category,
          description: description.trim(),
          frequency,
          start_date: isoDate,
          end_date: endDate ? toIsoWithNowTime(endDate) : null,
        });
      }
      // Tell the Activity tab to refresh + reset filters so the new transaction is visible.
      refreshBus.flags.transactionsNeedReset = true;
      // Dismiss the modal and return to wherever the user came from (Dashboard or Activity).
      // useFocusEffect on the receiving screen will run and pick up the new transaction.
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/(tabs)");
      }
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.detail || "Could not save transaction.");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!isEdit) return;
    const ok = await confirm({
      title: "Delete transaction?",
      message: "This cannot be undone.",
      destructive: true,
      confirmText: "Delete",
    });
    if (!ok) return;
    try {
      await api.delete(`/transactions/${params.id}`);
      refreshBus.flags.transactionsNeedReset = true;
      if (router.canGoBack()) router.back();
      else router.replace("/(tabs)");
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.detail || "Could not delete.");
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity testID="close-tx-modal" onPress={() => router.back()} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} testID="tx-header-title">
            {isEdit ? "Edit transaction" : "New transaction"}
          </Text>
          {isEdit ? (
            <TouchableOpacity testID="delete-tx-btn" onPress={onDelete} style={[styles.closeBtn, { backgroundColor: theme.colors.expense + "18" }]}>
              <Ionicons name="trash-outline" size={18} color={theme.colors.expense} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Type toggle */}
          <View style={styles.typeToggle}>
            {(["expense", "income"] as const).map((t) => (
              <TouchableOpacity
                key={t}
                testID={`type-${t}`}
                onPress={() => setType(t)}
                style={[
                  styles.typeBtn,
                  type === t && {
                    backgroundColor: t === "expense" ? theme.colors.expense : theme.colors.income,
                  },
                ]}
              >
                <Ionicons
                  name={t === "expense" ? "arrow-up" : "arrow-down"}
                  size={16}
                  color={type === t ? theme.colors.textInverse : theme.colors.textMuted}
                />
                <Text style={[styles.typeText, type === t && { color: theme.colors.textInverse }]}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Amount */}
          <View style={styles.amountCard}>
            <Text style={styles.amountLabel}>Amount</Text>
            <View style={styles.amountRow}>
              <Text style={styles.currency}>$</Text>
              <TextInput
                testID="amount-input"
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.amountInput}
              />
            </View>
          </View>

          {/* Description */}
          <Text style={styles.label}>Description</Text>
          <View style={styles.descRow}>
            <TextInput
              testID="description-input"
              value={description}
              onChangeText={(v) => {
                setDescription(v);
                setAiSuggested(null);
              }}
              placeholder="e.g., Lunch at Olive Garden"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, { flex: 1 }]}
            />
            <TouchableOpacity
              testID="ai-suggest-btn"
              onPress={suggestCategory}
              disabled={suggesting}
              style={styles.aiBtn}
            >
              {suggesting ? (
                <ActivityIndicator color={theme.colors.primary} size="small" />
              ) : (
                <>
                  <Ionicons name="sparkles" size={14} color={theme.colors.primary} />
                  <Text style={styles.aiBtnText}>AI</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          {aiSuggested ? (
            <Text style={styles.aiHint} testID="ai-hint">
              AI suggested: {aiSuggested}
            </Text>
          ) : null}

          {/* Category grid */}
          <Text style={styles.label}>Category</Text>
          <View style={styles.catGrid}>
            {filteredCats.map((c) => (
              <TouchableOpacity
                key={c.id}
                testID={`category-${c.id}`}
                onPress={() => setCategory(c.id)}
                style={[
                  styles.catChip,
                  category === c.id && { backgroundColor: c.color + "22", borderColor: c.color },
                ]}
              >
                <Ionicons name={c.icon as any} size={16} color={c.color} />
                <Text style={[styles.catName, category === c.id && { color: theme.colors.text }]}>{c.name}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Date */}
          <Text style={styles.label}>Date</Text>
          <DatePicker testID="date-picker" value={date} onChange={(v) => v && setDate(v)} />

          {/* Frequency picker — hidden in edit mode */}
          {!isEdit ? (
            <>
              <Text style={styles.label}>Frequency</Text>
              <View style={styles.catGrid}>
                {(
                  [
                    { id: "once", label: "One-time", icon: "ellipse-outline" },
                    { id: "daily", label: "Daily", icon: "sunny-outline" },
                    { id: "weekly", label: "Weekly", icon: "calendar-outline" },
                    { id: "biweekly", label: "Biweekly", icon: "calendar-clear-outline" },
                    { id: "monthly", label: "Monthly", icon: "calendar-number-outline" },
                    { id: "quarterly", label: "Quarterly", icon: "layers-outline" },
                    { id: "yearly", label: "Yearly", icon: "ribbon-outline" },
                  ] as const
                ).map((f) => (
                  <TouchableOpacity
                    key={f.id}
                    testID={`frequency-${f.id}`}
                    onPress={() => setFrequency(f.id)}
                    style={[
                      styles.catChip,
                      frequency === f.id && { backgroundColor: theme.colors.primaryLight, borderColor: theme.colors.primary },
                    ]}
                  >
                    <Ionicons name={f.icon as any} size={14} color={theme.colors.primary} />
                    <Text style={[styles.catName, frequency === f.id && { color: theme.colors.primary }]}>{f.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {frequency !== "once" ? (
                <>
                  <Text style={styles.label}>Repeat until (optional)</Text>
                  <DatePicker
                    testID="end-date-picker"
                    value={endDate}
                    onChange={setEndDate}
                    clearable
                    minDate={date}
                    placeholder="No end date — repeats forever"
                  />
                  <View style={styles.freqHintRow} testID="frequency-hint">
                    <Ionicons name="repeat" size={14} color={theme.colors.primary} />
                    <Text style={styles.freqHint}>
                      {endDate
                        ? `Auto-repeats ${frequency} until ${endDate}. Pause anytime from Profile → Recurring.`
                        : `Auto-repeats ${frequency} with no end date. Pause anytime from Profile → Recurring.`}
                    </Text>
                  </View>
                </>
              ) : null}
            </>
          ) : null}

          <TouchableOpacity
            testID="save-tx-btn"
            onPress={save}
            disabled={saving}
            style={[styles.saveBtn, saving && { opacity: 0.7 }]}
          >
            {saving ? (
              <ActivityIndicator color={theme.colors.textInverse} />
            ) : (
              <Text style={styles.saveBtnText}>{isEdit ? "Save changes" : "Save transaction"}</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  headerTitle: { fontSize: 17, fontWeight: "700", color: theme.colors.text },
  closeBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.colors.surface,
    alignItems: "center", justifyContent: "center",
  },
  scroll: { padding: theme.spacing.lg, paddingBottom: 48 },
  typeToggle: {
    flexDirection: "row", gap: 10, padding: 6,
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.pill,
    borderWidth: 1, borderColor: theme.colors.border,
    marginBottom: theme.spacing.lg,
  },
  typeBtn: {
    flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center",
    gap: 6, paddingVertical: 10, borderRadius: theme.radius.pill,
  },
  typeText: { fontSize: 14, fontWeight: "600", color: theme.colors.textMuted },
  amountCard: {
    backgroundColor: theme.colors.surfaceElevated, borderRadius: theme.radius.xl,
    padding: theme.spacing.lg, marginBottom: theme.spacing.lg,
    borderWidth: 1, borderColor: theme.colors.border, ...theme.shadow.soft,
  },
  amountLabel: { fontSize: 11, letterSpacing: 3, fontWeight: "600", color: theme.colors.textMuted },
  amountRow: { flexDirection: "row", alignItems: "flex-end", marginTop: 6 },
  currency: { fontSize: 32, fontWeight: "800", color: theme.colors.textMuted, marginRight: 4 },
  amountInput: {
    flex: 1, fontSize: 44, fontWeight: "800", color: theme.colors.text,
    letterSpacing: -1.5, padding: 0,
  },
  label: {
    fontSize: 12, letterSpacing: 2, fontWeight: "600",
    color: theme.colors.textMuted, marginBottom: 8, marginTop: 10, textTransform: "uppercase",
  },
  input: {
    backgroundColor: theme.colors.surfaceElevated, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.md, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: theme.colors.text,
  },
  descRow: { flexDirection: "row", gap: 8 },
  aiBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: theme.colors.primaryLight,
    borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.primaryLight,
  },
  aiBtnText: { color: theme.colors.primary, fontWeight: "700", fontSize: 12 },
  aiHint: { fontSize: 12, color: theme.colors.primary, marginTop: 6, fontStyle: "italic" },
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
  },
  catName: { fontSize: 13, fontWeight: "600", color: theme.colors.textMuted },
  freqHintRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginTop: 10, paddingHorizontal: 4,
  },
  freqHint: { fontSize: 12, color: theme.colors.primary, flex: 1, lineHeight: 17 },
  dateRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  todayBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: theme.colors.primaryLight,
    borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.primaryLight,
  },
  todayText: { color: theme.colors.primary, fontWeight: "700", fontSize: 12 },
  saveBtn: {
    marginTop: theme.spacing.xl, backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.pill, paddingVertical: 16, alignItems: "center",
  },
  saveBtnText: { color: theme.colors.textInverse, fontSize: 16, fontWeight: "700", letterSpacing: 0.3 },
});
