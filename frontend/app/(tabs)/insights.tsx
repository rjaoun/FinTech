import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { theme, formatCurrency } from "../../src/theme";
import { api } from "../../src/api";
import { useAuth } from "../../src/auth";
import { AIInsight, Category } from "../../src/types";

export default function Insights() {
  const { user } = useAuth();
  const [insight, setInsight] = useState<AIInsight | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, i] = await Promise.all([api.get("/categories"), api.post("/ai/insights")]);
      setCategories(c.data);
      setInsight(i.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || "Unable to load insights");
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

  const sevColor = (sev: string) =>
    sev === "high" ? theme.colors.expense : sev === "medium" ? theme.colors.accentSand : theme.colors.accentMoss;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.overline}>AI COACH</Text>
            <Text style={styles.title}>Your money, read aloud.</Text>
          </View>
          <TouchableOpacity
            testID="refresh-insights"
            onPress={load}
            style={styles.refreshBtn}
            disabled={loading}
          >
            <Ionicons name="refresh" size={18} color={theme.colors.text} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loaderCard}>
            <ActivityIndicator color={theme.colors.primary} />
            <Text style={styles.loaderText}>Claude is reading your transactions…</Text>
          </View>
        ) : error ? (
          <View style={styles.card}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={load} style={styles.retryBtn}>
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : insight ? (
          <>
            {/* Summary */}
            <View style={styles.summaryCard} testID="insight-summary">
              <View style={styles.sparkleIcon}>
                <Ionicons name="sparkles" size={18} color={theme.colors.primary} />
              </View>
              <Text style={styles.summaryText}>{insight.summary}</Text>
              {insight.fallback && (
                <Text style={styles.fallbackNote}>Simplified view · Retry for full AI analysis.</Text>
              )}
            </View>

            {/* Top categories */}
            {insight.top_categories?.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Top spending</Text>
                {insight.top_categories.map((c, i) => {
                  const cat = catMap[c.category];
                  return (
                    <View key={i} style={styles.topRow}>
                      <View style={[styles.catDot, { backgroundColor: cat?.color || theme.colors.accentMoss }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.topCat}>{cat?.name || c.category}</Text>
                        <Text style={styles.topInsight}>{c.insight}</Text>
                      </View>
                      <Text style={styles.topAmount}>{formatCurrency(c.amount, currency)}</Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Anomalies */}
            {insight.anomalies?.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Worth a glance</Text>
                {insight.anomalies.map((a, i) => (
                  <View key={i} style={styles.anomalyRow}>
                    <View style={[styles.sevBadge, { backgroundColor: sevColor(a.severity) + "22" }]}>
                      <Text style={[styles.sevText, { color: sevColor(a.severity) }]}>{a.severity}</Text>
                    </View>
                    <Text style={styles.anomalyText}>{a.description}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Tips */}
            {insight.tips?.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Gentle suggestions</Text>
                {insight.tips.map((t, i) => (
                  <View key={i} style={styles.tipRow}>
                    <View style={styles.tipDot}>
                      <Ionicons name="leaf" size={12} color={theme.colors.primary} />
                    </View>
                    <Text style={styles.tipText}>{t}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Forecast */}
            {insight.forecast_next_month && (
              <View style={[styles.card, styles.forecastCard]}>
                <Text style={styles.overline}>NEXT MONTH FORECAST</Text>
                <Text style={styles.forecastValue}>
                  {formatCurrency(insight.forecast_next_month.expected_expense, currency)}
                </Text>
                <Text style={styles.forecastMeta}>
                  Expected expense · confidence: {insight.forecast_next_month.confidence}
                </Text>
              </View>
            )}

            <Text style={styles.ts}>
              Generated {new Date(insight.generated_at).toLocaleString()}
            </Text>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  scroll: { padding: theme.spacing.lg, paddingBottom: 64 },
  header: { flexDirection: "row", alignItems: "flex-end", marginBottom: theme.spacing.lg },
  overline: { fontSize: 11, letterSpacing: 3, color: theme.colors.textMuted, fontWeight: "600" },
  title: { fontSize: 28, fontWeight: "800", color: theme.colors.text, marginTop: 4, letterSpacing: -0.5 },
  refreshBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.colors.surface,
    alignItems: "center", justifyContent: "center",
  },
  loaderCard: {
    backgroundColor: theme.colors.surfaceElevated, borderRadius: theme.radius.xl,
    padding: theme.spacing.xl, alignItems: "center", gap: 12,
    borderWidth: 1, borderColor: theme.colors.border, ...theme.shadow.soft,
  },
  loaderText: { color: theme.colors.textMuted, fontSize: 14 },
  card: {
    backgroundColor: theme.colors.surfaceElevated, borderRadius: theme.radius.xl,
    padding: theme.spacing.lg, marginBottom: theme.spacing.md,
    borderWidth: 1, borderColor: theme.colors.border, ...theme.shadow.soft,
  },
  summaryCard: {
    backgroundColor: theme.colors.primaryLight, borderRadius: theme.radius.xl,
    padding: theme.spacing.lg, marginBottom: theme.spacing.md,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  sparkleIcon: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: "#ffffff80",
    alignItems: "center", justifyContent: "center", marginBottom: 10,
  },
  summaryText: { fontSize: 17, lineHeight: 26, color: theme.colors.text, fontWeight: "500" },
  fallbackNote: { fontSize: 12, color: theme.colors.textMuted, marginTop: 8, fontStyle: "italic" },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: theme.colors.text, marginBottom: 12, letterSpacing: -0.2 },
  topRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  catDot: { width: 10, height: 10, borderRadius: 5 },
  topCat: { fontSize: 15, fontWeight: "600", color: theme.colors.text },
  topInsight: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  topAmount: { fontSize: 15, fontWeight: "700", color: theme.colors.text },
  anomalyRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 8 },
  sevBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: theme.radius.pill },
  sevText: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 },
  anomalyText: { fontSize: 14, color: theme.colors.text, flex: 1, lineHeight: 20 },
  tipRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 8 },
  tipDot: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: theme.colors.primaryLight,
    alignItems: "center", justifyContent: "center",
  },
  tipText: { fontSize: 14, color: theme.colors.text, flex: 1, lineHeight: 21 },
  forecastCard: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  forecastValue: { fontSize: 36, fontWeight: "800", color: theme.colors.textInverse, marginTop: 6, letterSpacing: -1 },
  forecastMeta: { fontSize: 13, color: "#DCE6E1", marginTop: 4 },
  ts: { fontSize: 11, color: theme.colors.textMuted, textAlign: "center", marginTop: 12 },
  errorText: { color: theme.colors.expense, fontSize: 14 },
  retryBtn: {
    marginTop: 12, alignSelf: "flex-start",
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: theme.colors.primary, borderRadius: theme.radius.pill,
  },
  retryText: { color: theme.colors.textInverse, fontWeight: "700" },
});
