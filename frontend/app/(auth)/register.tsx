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

export default function RegisterScreen() {
  const { register } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    if (!name || !email || !password) {
      setError("All fields are required.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await register(email.trim(), password, name.trim());
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e?.message || "Registration failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brandBlock}>
            <TouchableOpacity testID="register-back" onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={20} color={theme.colors.text} />
            </TouchableOpacity>
            <Text style={styles.overline}>CREATE ACCOUNT</Text>
            <Text style={styles.h1}>Let's plant the seed.</Text>
            <Text style={styles.sub}>A calmer relationship with money starts with one intentional first step.</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              testID="register-name-input"
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
            />
            <Text style={[styles.label, { marginTop: theme.spacing.md }]}>Email</Text>
            <TextInput
              testID="register-email-input"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@example.com"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
            />
            <Text style={[styles.label, { marginTop: theme.spacing.md }]}>Password</Text>
            <TextInput
              testID="register-password-input"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="At least 6 characters"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
            />

            {error ? (
              <Text testID="register-error" style={styles.error}>
                {error}
              </Text>
            ) : null}

            <TouchableOpacity
              testID="register-submit-button"
              onPress={onSubmit}
              disabled={busy}
              style={[styles.primaryBtn, busy && { opacity: 0.7 }]}
            >
              {busy ? <ActivityIndicator color={theme.colors.textInverse} /> : <Text style={styles.primaryBtnText}>Create account</Text>}
            </TouchableOpacity>

            <View style={styles.bottomRow}>
              <Text style={styles.muted}>Already have an account?</Text>
              <Link href="/(auth)/login" asChild>
                <TouchableOpacity testID="go-to-login">
                  <Text style={styles.link}>Sign in</Text>
                </TouchableOpacity>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  scroll: { flexGrow: 1, padding: theme.spacing.lg, justifyContent: "center" },
  brandBlock: { marginBottom: theme.spacing.xl },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.colors.surface,
    alignItems: "center", justifyContent: "center",
    marginBottom: theme.spacing.md,
  },
  overline: { fontSize: 11, letterSpacing: 3, color: theme.colors.textMuted, fontWeight: "600", marginBottom: theme.spacing.sm },
  h1: { fontSize: 32, fontWeight: "800", color: theme.colors.text, letterSpacing: -1 },
  sub: { color: theme.colors.textMuted, marginTop: theme.spacing.sm, fontSize: 15, lineHeight: 22 },
  card: {
    backgroundColor: theme.colors.surfaceElevated, borderRadius: theme.radius.xl,
    padding: theme.spacing.lg, borderWidth: 1, borderColor: theme.colors.border, ...theme.shadow.soft,
  },
  label: {
    fontSize: 12, letterSpacing: 2, fontWeight: "600",
    color: theme.colors.textMuted, marginBottom: 6, textTransform: "uppercase",
  },
  input: {
    backgroundColor: theme.colors.bg, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.md, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: theme.colors.text,
  },
  primaryBtn: {
    marginTop: theme.spacing.lg, backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.pill, paddingVertical: 16, alignItems: "center",
  },
  primaryBtnText: { color: theme.colors.textInverse, fontSize: 16, fontWeight: "700", letterSpacing: 0.3 },
  error: { color: theme.colors.expense, marginTop: theme.spacing.md, fontSize: 14 },
  bottomRow: { marginTop: theme.spacing.lg, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6 },
  muted: { color: theme.colors.textMuted, fontSize: 14 },
  link: { color: theme.colors.primary, fontWeight: "700", fontSize: 14 },
});
