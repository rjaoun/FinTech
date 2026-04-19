import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Link, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/auth";
import { theme } from "../../src/theme";
import { SafeAreaView } from "react-native-safe-area-context";

export default function LoginScreen() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const onSubmit = async () => {
    if (!email || !password) {
      setError("Please enter email and password.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await login(email.trim(), password);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e?.message || "Login failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brandBlock}>
            <View style={styles.logoDot} testID="brand-logo">
              <Ionicons name="leaf" size={22} color={theme.colors.textInverse} />
            </View>
            <Text style={styles.overline}>FINANCEFOCUS</Text>
            <Text style={styles.h1}>Welcome back.</Text>
            <Text style={styles.sub}>
              Tend to your money like a garden — small care, compounding growth.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              testID="login-email-input"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@example.com"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
            />

            <Text style={[styles.label, { marginTop: theme.spacing.md }]}>Password</Text>
            <View style={styles.pwRow}>
              <TextInput
                testID="login-password-input"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPw}
                placeholder="••••••••"
                placeholderTextColor={theme.colors.textMuted}
                style={[styles.input, { flex: 1 }]}
              />
              <TouchableOpacity
                testID="toggle-password-visibility"
                onPress={() => setShowPw((s) => !s)}
                style={styles.eyeBtn}
              >
                <Ionicons
                  name={showPw ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={theme.colors.textMuted}
                />
              </TouchableOpacity>
            </View>

            {error ? (
              <Text testID="login-error" style={styles.error}>
                {error}
              </Text>
            ) : null}

            <TouchableOpacity
              testID="login-submit-button"
              onPress={onSubmit}
              disabled={busy}
              style={[styles.primaryBtn, busy && { opacity: 0.7 }]}
            >
              {busy ? (
                <ActivityIndicator color={theme.colors.textInverse} />
              ) : (
                <Text style={styles.primaryBtnText}>Sign in</Text>
              )}
            </TouchableOpacity>

            <View style={styles.bottomRow}>
              <Text style={styles.muted}>New here?</Text>
              <Link href="/(auth)/register" asChild>
                <TouchableOpacity testID="go-to-register">
                  <Text style={styles.link}>Create an account</Text>
                </TouchableOpacity>
              </Link>
            </View>
          </View>

          <Text style={styles.footer}>
            Tip: try admin@financefocus.app / admin123
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  scroll: { flexGrow: 1, padding: theme.spacing.lg, justifyContent: "center" },
  brandBlock: { marginBottom: theme.spacing.xl },
  logoDot: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing.md,
  },
  overline: {
    fontSize: 11,
    letterSpacing: 3,
    color: theme.colors.textMuted,
    fontWeight: "600",
    marginBottom: theme.spacing.sm,
  },
  h1: { fontSize: 36, fontWeight: "800", color: theme.colors.text, letterSpacing: -1 },
  sub: {
    color: theme.colors.textMuted,
    marginTop: theme.spacing.sm,
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadow.soft,
  },
  label: {
    fontSize: 12,
    letterSpacing: 2,
    fontWeight: "600",
    color: theme.colors.textMuted,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: theme.colors.bg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: theme.colors.text,
  },
  pwRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  eyeBtn: {
    padding: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
  },
  primaryBtn: {
    marginTop: theme.spacing.lg,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.pill,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryBtnText: {
    color: theme.colors.textInverse,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  error: { color: theme.colors.expense, marginTop: theme.spacing.md, fontSize: 14 },
  bottomRow: {
    marginTop: theme.spacing.lg,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  muted: { color: theme.colors.textMuted, fontSize: 14 },
  link: { color: theme.colors.primary, fontWeight: "700", fontSize: 14 },
  footer: {
    textAlign: "center",
    marginTop: theme.spacing.lg,
    color: theme.colors.textMuted,
    fontSize: 12,
  },
});
