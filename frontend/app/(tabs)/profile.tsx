import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../../src/theme";
import { useAuth } from "../../src/auth";
import { useRouter } from "expo-router";
import { api } from "../../src/api";
import { useConfirm } from "../../src/components/ConfirmDialog";
import { refreshBus } from "../../src/refresh-bus";

type CurrencyOption = { code: string; symbol: string };

export default function Profile() {
  const { user, logout, setUser } = useAuth();
  const router = useRouter();
  const confirm = useConfirm();
  const [currencies, setCurrencies] = useState<CurrencyOption[]>([]);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [updatingCurrency, setUpdatingCurrency] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    api.get("/users/currencies").then((r) => setCurrencies(r.data)).catch(() => {});
  }, []);

  const changeCurrency = async (code: string) => {
    if (!user || code === user.currency) {
      setShowCurrencyPicker(false);
      return;
    }
    setUpdatingCurrency(code);
    try {
      const r = await api.patch("/users/me", { currency: code });
      setUser(r.data);
      setShowCurrencyPicker(false);
    } finally {
      setUpdatingCurrency(null);
    }
  };

  const onLogout = async () => {
    const ok = await confirm({
      title: "Sign out?",
      message: "You'll need to sign in again next time.",
      destructive: true,
      confirmText: "Sign out",
      icon: "log-out-outline",
    });
    if (!ok) return;
    await logout();
    router.replace("/(auth)/login");
  };

  const onReset = async () => {
    const first = await confirm({
      title: "Reset all data?",
      message:
        "This permanently deletes ALL your transactions, recurring rules, budgets, and goals. Your account stays.",
      destructive: true,
      confirmText: "Continue",
      icon: "warning-outline",
    });
    if (!first) return;
    const second = await confirm({
      title: "Really delete everything?",
      message: "This cannot be undone. Last chance to back out.",
      destructive: true,
      confirmText: "Yes, wipe it all",
      icon: "trash-outline",
    });
    if (!second) return;
    setResetting(true);
    try {
      await api.post("/users/me/reset");
      refreshBus.flags.transactionsNeedReset = true;
      router.replace("/(tabs)");
    } finally {
      setResetting(false);
    }
  };

  const symbol = currencies.find((c) => c.code === user?.currency)?.symbol || "$";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerCard}>
          <View style={styles.bigAvatar}>
            <Text style={styles.bigAvatarText}>{(user?.name || "U").charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          <View style={styles.rolePill}>
            <Text style={styles.roleText}>{(user?.role || "user").toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.menuCard}>
          <MenuRow
            icon="wallet-outline"
            label="Currency"
            value={`${symbol} ${user?.currency || "USD"}`}
            onPress={() => setShowCurrencyPicker(true)}
            testID="menu-currency"
          />
          <View style={styles.divider} />
          <MenuRow
            icon="pie-chart-outline"
            label="Monthly budgets"
            onPress={() => router.push("/budgets")}
            testID="menu-budgets"
          />
          <View style={styles.divider} />
          <MenuRow
            icon="repeat-outline"
            label="Recurring"
            onPress={() => router.push("/recurring")}
            testID="menu-recurring"
          />
          <View style={styles.divider} />
          <MenuRow
            icon="sparkles-outline"
            label="AI coach"
            onPress={() => router.push("/(tabs)/insights")}
            testID="menu-ai"
          />
        </View>

        <View style={styles.menuCard}>
          <MenuRow icon="information-circle-outline" label="About FinanceFocus" value="v1.0" testID="menu-about" />
        </View>

        {/* Danger zone */}
        <Text style={styles.dangerHeader}>DANGER ZONE</Text>
        <TouchableOpacity
          testID="reset-data-btn"
          onPress={onReset}
          disabled={resetting}
          style={[styles.dangerBtn, resetting && { opacity: 0.7 }]}
        >
          <Ionicons name="trash-outline" size={18} color={theme.colors.expense} />
          <View style={{ flex: 1 }}>
            <Text style={styles.dangerTitle}>Reset all data</Text>
            <Text style={styles.dangerSub}>Wipe transactions, budgets, goals, and recurring rules.</Text>
          </View>
          {resetting ? (
            <ActivityIndicator color={theme.colors.expense} />
          ) : (
            <Ionicons name="chevron-forward" size={16} color={theme.colors.expense} />
          )}
        </TouchableOpacity>

        <TouchableOpacity testID="logout-btn" onPress={onLogout} style={styles.logoutBtn}>
          <Ionicons name="log-out-outline" size={20} color={theme.colors.expense} />
          <Text style={styles.logoutText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Currency picker modal */}
      <Modal
        visible={showCurrencyPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCurrencyPicker(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowCurrencyPicker(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Pick a currency</Text>
              <TouchableOpacity onPress={() => setShowCurrencyPicker(false)} testID="close-currency-picker">
                <Ionicons name="close" size={22} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 420 }}>
              {currencies.map((c) => {
                const isCurrent = c.code === user?.currency;
                return (
                  <TouchableOpacity
                    key={c.code}
                    testID={`currency-${c.code}`}
                    onPress={() => changeCurrency(c.code)}
                    disabled={updatingCurrency !== null}
                    style={[styles.currencyRow, isCurrent && styles.currencyRowActive]}
                  >
                    <View style={styles.currencySymbol}>
                      <Text style={styles.currencySymbolText}>{c.symbol}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.currencyCode}>{c.code}</Text>
                    </View>
                    {updatingCurrency === c.code ? (
                      <ActivityIndicator color={theme.colors.primary} />
                    ) : isCurrent ? (
                      <Ionicons name="checkmark-circle" size={22} color={theme.colors.primary} />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function MenuRow({
  icon,
  label,
  value,
  onPress,
  testID,
}: {
  icon: any;
  label: string;
  value?: string;
  onPress?: () => void;
  testID?: string;
}) {
  return (
    <TouchableOpacity testID={testID} onPress={onPress} style={styles.menuRow} disabled={!onPress}>
      <View style={styles.menuIconWrap}>
        <Ionicons name={icon} size={18} color={theme.colors.primary} />
      </View>
      <Text style={styles.menuLabel}>{label}</Text>
      <View style={{ flex: 1 }} />
      {value ? <Text style={styles.menuValue}>{value}</Text> : null}
      {onPress ? <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} /> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  scroll: { padding: theme.spacing.lg, paddingBottom: 64 },
  headerCard: {
    backgroundColor: theme.colors.surfaceElevated, borderRadius: theme.radius.xl,
    padding: theme.spacing.xl, alignItems: "center",
    borderWidth: 1, borderColor: theme.colors.border, ...theme.shadow.soft,
  },
  bigAvatar: {
    width: 76, height: 76, borderRadius: 38, backgroundColor: theme.colors.primary,
    alignItems: "center", justifyContent: "center", marginBottom: 12,
  },
  bigAvatarText: { color: theme.colors.textInverse, fontSize: 30, fontWeight: "800" },
  name: { fontSize: 22, fontWeight: "800", color: theme.colors.text },
  email: { fontSize: 14, color: theme.colors.textMuted, marginTop: 4 },
  rolePill: {
    marginTop: 10, paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: theme.radius.pill, backgroundColor: theme.colors.primaryLight,
  },
  roleText: { fontSize: 10, fontWeight: "700", letterSpacing: 2, color: theme.colors.primary },
  menuCard: {
    marginTop: theme.spacing.lg, backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radius.xl, borderWidth: 1, borderColor: theme.colors.border,
    ...theme.shadow.soft, overflow: "hidden",
  },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 16 },
  menuIconWrap: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.primaryLight,
    alignItems: "center", justifyContent: "center",
  },
  menuLabel: { fontSize: 15, fontWeight: "600", color: theme.colors.text },
  menuValue: { fontSize: 14, color: theme.colors.textMuted, marginRight: 6 },
  divider: { height: 1, backgroundColor: theme.colors.border, marginHorizontal: 16 },
  dangerHeader: {
    marginTop: theme.spacing.xl, marginBottom: 8,
    fontSize: 11, letterSpacing: 2, fontWeight: "700",
    color: theme.colors.expense, paddingHorizontal: 4,
  },
  dangerBtn: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 14,
    backgroundColor: theme.colors.expense + "10",
    borderWidth: 1, borderColor: theme.colors.expense + "30",
    borderRadius: theme.radius.lg,
  },
  dangerTitle: { fontSize: 15, fontWeight: "700", color: theme.colors.expense },
  dangerSub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  logoutBtn: {
    marginTop: theme.spacing.lg, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 14, borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.expense + "15", borderWidth: 1, borderColor: theme.colors.expense + "40",
  },
  logoutText: { color: theme.colors.expense, fontWeight: "700", fontSize: 15 },
  modalBackdrop: {
    flex: 1, backgroundColor: "#00000088",
    alignItems: "center", justifyContent: "center", padding: 24,
  },
  modalCard: {
    width: "100%", maxWidth: 360,
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: 24, padding: 18,
    ...theme.shadow.card,
  },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 14,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: theme.colors.text },
  currencyRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 12, paddingHorizontal: 12,
    borderRadius: theme.radius.md,
  },
  currencyRowActive: { backgroundColor: theme.colors.primaryLight },
  currencySymbol: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: theme.colors.surface,
    alignItems: "center", justifyContent: "center",
  },
  currencySymbolText: { fontSize: 15, fontWeight: "800", color: theme.colors.primary },
  currencyCode: { fontSize: 15, fontWeight: "700", color: theme.colors.text, letterSpacing: 0.5 },
});
