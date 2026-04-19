import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../../src/theme";
import { useAuth } from "../../src/auth";
import { useRouter } from "expo-router";

export default function Profile() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const onLogout = () => {
    Alert.alert("Sign out?", "You'll need to sign in again next time.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

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
          <MenuRow icon="wallet-outline" label="Currency" value={user?.currency || "USD"} testID="menu-currency" />
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

        <TouchableOpacity testID="logout-btn" onPress={onLogout} style={styles.logoutBtn}>
          <Ionicons name="log-out-outline" size={20} color={theme.colors.expense} />
          <Text style={styles.logoutText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
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
  logoutBtn: {
    marginTop: theme.spacing.xl, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 14, borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.expense + "15", borderWidth: 1, borderColor: theme.colors.expense + "40",
  },
  logoutText: { color: theme.colors.expense, fontWeight: "700", fontSize: 15 },
});
