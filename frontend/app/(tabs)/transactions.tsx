import React, { useCallback, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { theme, formatCurrency } from "../../src/theme";
import { api } from "../../src/api";
import { useAuth } from "../../src/auth";
import { Transaction, Category } from "../../src/types";

export default function Transactions() {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "income" | "expense">("all");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      const [t, c] = await Promise.all([api.get("/transactions"), api.get("/categories")]);
      setItems(t.data);
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

  const filtered = useMemo(() => {
    let list = items;
    if (filter !== "all") list = list.filter((t) => t.type === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (t) =>
          (t.description || "").toLowerCase().includes(q) ||
          (catMap[t.category]?.name || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [items, filter, query, catMap]);

  const onDelete = (id: string) => {
    Alert.alert("Delete transaction?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/transactions/${id}`);
            setItems((prev) => prev.filter((x) => x.id !== id));
          } catch {}
        },
      },
    ]);
  };

  const currency = user?.currency || "USD";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Activity</Text>
        <TouchableOpacity
          testID="add-transaction-header-btn"
          style={styles.addBtn}
          onPress={() => router.push("/add-transaction")}
        >
          <Ionicons name="add" size={22} color={theme.colors.textInverse} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={theme.colors.textMuted} />
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
        {(["all", "income", "expense"] as const).map((f) => (
          <TouchableOpacity
            key={f}
            testID={`filter-${f}`}
            onPress={() => setFilter(f)}
            style={[styles.chip, filter === f && styles.chipActive]}
          >
            <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ padding: theme.spacing.lg, paddingTop: 0, paddingBottom: 48 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="leaf-outline" size={32} color={theme.colors.textMuted} />
              <Text style={styles.emptyTitle}>Nothing here yet</Text>
              <Text style={styles.emptyText}>Tap the + button to record your first transaction.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const cat = catMap[item.category];
            return (
              <TouchableOpacity
                testID={`tx-${item.id}`}
                onLongPress={() => onDelete(item.id)}
                style={styles.row}
              >
                <View style={[styles.icon, { backgroundColor: (cat?.color || theme.colors.primary) + "22" }]}>
                  <Ionicons name={(cat?.icon as any) || "ellipse"} size={20} color={cat?.color || theme.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.description || cat?.name || item.category}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {cat?.name || item.category} · {item.date.slice(0, 10)}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text
                    style={[
                      styles.amount,
                      { color: item.type === "income" ? theme.colors.income : theme.colors.expense },
                    ]}
                  >
                    {item.type === "income" ? "+" : "-"}
                    {formatCurrency(item.amount, currency)}
                  </Text>
                  <TouchableOpacity
                    testID={`tx-delete-${item.id}`}
                    onPress={() => onDelete(item.id)}
                    style={styles.delBtn}
                  >
                    <Ionicons name="trash-outline" size={14} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
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
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  title: { fontSize: 28, fontWeight: "800", color: theme.colors.text, letterSpacing: -0.5 },
  addBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.colors.primary,
    alignItems: "center", justifyContent: "center",
  },
  searchBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: theme.spacing.lg, marginBottom: theme.spacing.sm,
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
  },
  searchInput: { flex: 1, fontSize: 14, color: theme.colors.text },
  chips: { flexDirection: "row", gap: 8, paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { fontSize: 13, fontWeight: "600", color: theme.colors.textMuted },
  chipTextActive: { color: theme.colors.textInverse },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", paddingVertical: 48, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: theme.colors.text },
  emptyText: { fontSize: 14, color: theme.colors.textMuted, textAlign: "center" },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 14, paddingHorizontal: 14,
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radius.lg, marginBottom: 10,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  icon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 15, fontWeight: "600", color: theme.colors.text },
  rowMeta: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: "700" },
  delBtn: { marginTop: 4, padding: 4 },
});
