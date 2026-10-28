import React, { useCallback, useMemo, useState } from "react";
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
  LayoutAnimation,
  UIManager,
  Alert,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { theme, formatCurrency } from "../../src/theme";
import { api } from "../../src/api";
import { useAuth } from "../../src/auth";
import { CreditCard } from "../../src/types";
import { useConfirm } from "../../src/components/ConfirmDialog";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const CARD_PALETTE = ["#1E3F32", "#4A7059", "#8B6F47", "#C85A40", "#5A8A9C", "#A55A7E", "#6B8E7F"];
const COLLAPSED_PEEK = 96; // card height when collapsed
const PEEK_VISIBLE = 48;   // unobstructed tap-strip above the next card (>=44pt tap target)
const EXPANDED_H = 196;    // full height of an expanded card

function calcMinPayment(c: CreditCard): number {
  const pct = (c.balance * c.min_payment_percent) / 100;
  return Math.min(c.balance, Math.max(pct, c.min_payment_floor));
}

type ScheduleRow = { month: number; payment: number; interest: number; principal: number; balance: number };
type ScheduleResult = { rows: ScheduleRow[]; totalPaid: number; totalInterest: number; warning?: string };

function buildSchedule(card: CreditCard, mode: "minimum" | "custom", customAmount: number): ScheduleResult {
  const monthlyRate = card.apr / 100 / 12;
  const rows: ScheduleRow[] = [];
  let balance = card.balance;
  let totalInterest = 0;
  let totalPaid = 0;
  const MAX_MONTHS = 600;
  let month = 0;
  let warning: string | undefined;

  while (balance > 0.01 && month < MAX_MONTHS) {
    month += 1;
    const interest = balance * monthlyRate;
    const baseMin = Math.max((balance * card.min_payment_percent) / 100, card.min_payment_floor);
    let payment = mode === "minimum" ? Math.min(balance + interest, baseMin) : customAmount;
    if (payment <= interest) {
      // Payment can't cover interest — would never pay off.
      warning = `Payment of ${payment.toFixed(2)} doesn't cover monthly interest of ${interest.toFixed(2)} — balance would grow.`;
      break;
    }
    if (payment > balance + interest) payment = balance + interest;
    const principal = payment - interest;
    balance = Math.max(0, balance - principal);
    totalInterest += interest;
    totalPaid += payment;
    rows.push({ month, payment, interest, principal, balance });
  }
  if (!warning && month >= MAX_MONTHS && balance > 0.01) {
    warning = "Payoff exceeds 50 years at this payment level.";
  }
  return { rows, totalPaid, totalInterest, warning };
}

function paymentForMonths(card: CreditCard, months: number): number {
  const r = card.apr / 100 / 12;
  const p = r === 0 ? card.balance / months : (card.balance * r) / (1 - Math.pow(1 + r, -months));
  return Math.ceil(p * 100) / 100; // round up to the cent so it finishes within `months`
}

export default function CardsTab() {
  const { user } = useAuth();
  const confirm = useConfirm();
  // Insets read from the root provider — SafeAreaView inside an iOS Modal reports 0,
  // which pushed the close button under the notch/status bar.
  const insets = useSafeAreaInsets();
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Add/edit modal state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<CreditCard | null>(null);
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");
  const [limit, setLimit] = useState("");
  const [apr, setApr] = useState("");
  const [statementDay, setStatementDay] = useState("");
  const [minPct, setMinPct] = useState("2");
  const [minFloor, setMinFloor] = useState("25");
  const [chosenColor, setChosenColor] = useState<string>(CARD_PALETTE[0]);
  const [saving, setSaving] = useState(false);

  // Schedule modal state
  const [scheduleCard, setScheduleCard] = useState<CreditCard | null>(null);
  const [scheduleMode, setScheduleMode] = useState<"minimum" | "custom">("minimum");
  const [customAmountInput, setCustomAmountInput] = useState("");
  const [customBy, setCustomBy] = useState<"amount" | "months">("amount");
  const [monthsInput, setMonthsInput] = useState("12");

  const currency = user?.currency || "USD";

  const load = useCallback(async () => {
    try {
      const r = await api.get("/credit-cards");
      setCards(r.data);
    } catch {
      // 401 handled globally
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const toggleExpand = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId((cur) => (cur === id ? null : id));
  };

  const openCreate = () => {
    setEditing(null);
    setName("");
    setBalance("");
    setLimit("");
    setApr("");
    setStatementDay("");
    setMinPct("2");
    setMinFloor("25");
    setChosenColor(CARD_PALETTE[cards.length % CARD_PALETTE.length]);
    setEditorOpen(true);
  };

  const openEdit = (c: CreditCard) => {
    setEditing(c);
    setName(c.name);
    setBalance(String(c.balance));
    setLimit(c.credit_limit != null ? String(c.credit_limit) : "");
    setApr(String(c.apr));
    setStatementDay(String(c.statement_day));
    setMinPct(String(c.min_payment_percent));
    setMinFloor(String(c.min_payment_floor));
    setChosenColor(c.color || CARD_PALETTE[0]);
    setEditorOpen(true);
  };

  const save = async () => {
    if (!name.trim()) {
      Alert.alert("Missing name", "Give your card a nickname (e.g., Chase Sapphire).");
      return;
    }
    const bal = parseFloat(balance);
    const aprV = parseFloat(apr);
    const sDay = parseInt(statementDay, 10);
    const mp = parseFloat(minPct);
    const mf = parseFloat(minFloor);
    if (isNaN(bal) || bal < 0) return Alert.alert("Invalid balance", "Enter a non-negative number.");
    if (isNaN(aprV) || aprV < 0 || aprV > 100) return Alert.alert("Invalid APR", "APR should be between 0 and 100.");
    if (isNaN(sDay) || sDay < 1 || sDay > 28) return Alert.alert("Invalid statement day", "Pick a day from 1 to 28.");
    if (isNaN(mp) || mp < 0 || mp > 100) return Alert.alert("Invalid min %", "Enter a percent 0–100.");
    if (isNaN(mf) || mf < 0) return Alert.alert("Invalid floor", "Enter a non-negative floor.");
    const payload: any = {
      name: name.trim(),
      balance: bal,
      credit_limit: limit ? parseFloat(limit) : null,
      apr: aprV,
      statement_day: sDay,
      min_payment_percent: mp,
      min_payment_floor: mf,
      color: chosenColor,
    };
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/credit-cards/${editing.id}`, payload);
      } else {
        await api.post("/credit-cards", payload);
      }
      setEditorOpen(false);
      await load();
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.detail || "Could not save credit card.");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (c: CreditCard) => {
    const ok = await confirm({
      title: "Delete this card?",
      message: `${c.name} will be removed from your dashboard. This does not affect any bank or lender record.`,
      destructive: true,
      confirmText: "Delete",
    });
    if (!ok) return;
    try {
      await api.delete(`/credit-cards/${c.id}`);
      setCards((p) => p.filter((x) => x.id !== c.id));
    } catch {}
  };

  const openSchedule = (c: CreditCard) => {
    setScheduleCard(c);
    setScheduleMode("minimum");
    setCustomAmountInput(String(Math.ceil(calcMinPayment(c) * 2))); // sensible default: 2× minimum
    setCustomBy("amount");
    setMonthsInput("12");
  };

  const closeSchedule = () => setScheduleCard(null);

  const monthsN = parseInt(monthsInput, 10);
  const monthsPayment =
    scheduleCard && customBy === "months" && monthsN > 0 && monthsN <= 600
      ? paymentForMonths(scheduleCard, monthsN)
      : 0;

  const scheduleResult = useMemo<ScheduleResult | null>(() => {
    if (!scheduleCard) return null;
    const custom = customBy === "months" ? monthsPayment : parseFloat(customAmountInput);
    return buildSchedule(
      scheduleCard,
      scheduleMode,
      scheduleMode === "custom" ? (isNaN(custom) ? 0 : custom) : 0
    );
  }, [scheduleCard, scheduleMode, customAmountInput, customBy, monthsPayment]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.overline}>CREDIT CARDS</Text>
          <Text style={styles.title}>Your cards</Text>
        </View>
        <TouchableOpacity testID="add-card-btn" onPress={openCreate} style={styles.addBtn}>
          <Ionicons name="add" size={22} color={theme.colors.textInverse} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {cards.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="card-outline" size={36} color={theme.colors.textMuted} />
            <Text style={styles.emptyTitle}>No cards yet</Text>
            <Text style={styles.emptyText}>
              Add a credit card to see its minimum payment and plan payoff schedules.
            </Text>
            <TouchableOpacity onPress={openCreate} style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>Add a card</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.stack}>
            {cards.map((c, idx) => {
              const expanded = expandedId === c.id;
              const minPay = calcMinPayment(c);
              const util =
                c.credit_limit && c.credit_limit > 0
                  ? Math.min(100, Math.round((c.balance / c.credit_limit) * 100))
                  : null;
              return (
                <TouchableOpacity
                  key={c.id}
                  testID={`card-${c.id}`}
                  activeOpacity={0.92}
                  onPress={() => toggleExpand(c.id)}
                  style={[
                    styles.card,
                    { backgroundColor: c.color || CARD_PALETTE[idx % CARD_PALETTE.length] },
                    expanded
                      ? { height: EXPANDED_H, marginBottom: 16, zIndex: 20 }
                      : { height: COLLAPSED_PEEK, marginBottom: -(COLLAPSED_PEEK - PEEK_VISIBLE), zIndex: idx + 1 },
                    idx === 0 && { marginTop: 4 },
                  ]}
                >
                  {/* Top row — name + chip */}
                  <View style={styles.cardTopRow}>
                    <View>
                      <Text style={styles.cardName} numberOfLines={1}>{c.name}</Text>
                      <Text style={styles.cardSubtle}>Statement: day {c.statement_day} · APR {c.apr}%</Text>
                    </View>
                    <View style={styles.chip}>
                      <Ionicons name="card" size={14} color="#ffffffcc" />
                    </View>
                  </View>

                  {expanded ? (
                    <>
                      <View style={styles.cardMiddle}>
                        <Text style={styles.cardBalanceLabel}>CURRENT BALANCE</Text>
                        <Text style={styles.cardBalance}>{formatCurrency(c.balance, currency)}</Text>
                        {c.credit_limit ? (
                          <Text style={styles.cardLimit}>
                            of {formatCurrency(c.credit_limit, currency)} limit
                            {util != null ? `  ·  ${util}% used` : ""}
                          </Text>
                        ) : null}
                      </View>

                      <View style={styles.cardBottom}>
                        <View>
                          <Text style={styles.cardSmallLabel}>MIN PAYMENT</Text>
                          <Text style={styles.cardSmallVal} testID={`card-min-${c.id}`}>
                            {formatCurrency(minPay, currency)}
                          </Text>
                        </View>
                        <View style={styles.actionRow}>
                          <TouchableOpacity
                            testID={`card-schedule-${c.id}`}
                            onPress={() => openSchedule(c)}
                            hitSlop={10}
                            style={styles.cardActionBtn}
                          >
                            <Ionicons name="calculator-outline" size={14} color="#fff" />
                            <Text style={styles.cardActionText}>Schedule</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            testID={`card-edit-${c.id}`}
                            onPress={() => openEdit(c)}
                            hitSlop={8}
                            style={styles.cardMiniBtn}
                          >
                            <Ionicons name="pencil" size={14} color="#fff" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            testID={`card-delete-${c.id}`}
                            onPress={() => onDelete(c)}
                            hitSlop={8}
                            style={styles.cardMiniBtn}
                          >
                            <Ionicons name="trash-outline" size={14} color="#fff" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </>
                  ) : (
                    <Text style={styles.cardPeekAmount} numberOfLines={1}>
                      {formatCurrency(c.balance, currency)}
                      <Text style={styles.cardPeekMin}>  ·  min {formatCurrency(minPay, currency)}</Text>
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ====== Add / Edit modal ====== */}
      <Modal visible={editorOpen} transparent animationType="slide" onRequestClose={() => setEditorOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editing ? "Edit card" : "New card"}</Text>
              <TouchableOpacity testID="close-editor" onPress={() => setEditorOpen(false)}>
                <Ionicons name="close" size={22} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Nickname</Text>
              <TextInput testID="card-name" value={name} onChangeText={setName} placeholder="Chase Sapphire" placeholderTextColor={theme.colors.textMuted} style={styles.input} />

              <Text style={styles.label}>Current balance</Text>
              <TextInput testID="card-balance" value={balance} onChangeText={setBalance} keyboardType="decimal-pad" placeholder="2500" placeholderTextColor={theme.colors.textMuted} style={styles.input} />

              <Text style={styles.label}>Credit limit (optional)</Text>
              <TextInput testID="card-limit" value={limit} onChangeText={setLimit} keyboardType="decimal-pad" placeholder="10000" placeholderTextColor={theme.colors.textMuted} style={styles.input} />

              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>APR %</Text>
                  <TextInput testID="card-apr" value={apr} onChangeText={setApr} keyboardType="decimal-pad" placeholder="22.99" placeholderTextColor={theme.colors.textMuted} style={styles.input} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Statement day</Text>
                  <TextInput testID="card-statement-day" value={statementDay} onChangeText={setStatementDay} keyboardType="number-pad" placeholder="15" placeholderTextColor={theme.colors.textMuted} style={styles.input} />
                </View>
              </View>

              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Min pay %</Text>
                  <TextInput testID="card-min-pct" value={minPct} onChangeText={setMinPct} selectTextOnFocus keyboardType="decimal-pad" placeholder="2" placeholderTextColor={theme.colors.textMuted} style={styles.input} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Lowest min ($)</Text>
                  <TextInput testID="card-min-floor" value={minFloor} onChangeText={setMinFloor} selectTextOnFocus keyboardType="decimal-pad" placeholder="25" placeholderTextColor={theme.colors.textMuted} style={styles.input} />
                </View>
              </View>
              <Text style={styles.fieldHint}>
                Minimum payment = the larger of balance × Min pay % or the Lowest min amount (never more than the balance).
              </Text>
              {parseFloat(balance) > 0 && parseFloat(minFloor) >= parseFloat(balance) ? (
                <Text style={styles.fieldWarn} testID="card-min-floor-warning">
                  Lowest min is at or above the balance, so the minimum payment will be the full balance. Did you mean a smaller amount?
                </Text>
              ) : null}

              <Text style={styles.label}>Color</Text>
              <View style={styles.palette}>
                {CARD_PALETTE.map((col) => (
                  <TouchableOpacity
                    key={col}
                    testID={`color-${col}`}
                    onPress={() => setChosenColor(col)}
                    style={[styles.swatch, { backgroundColor: col }, chosenColor === col && styles.swatchActive]}
                  />
                ))}
              </View>

              <TouchableOpacity
                testID="save-card"
                onPress={save}
                disabled={saving}
                style={[styles.saveBtn, saving && { opacity: 0.7 }]}
              >
                {saving ? (
                  <ActivityIndicator color={theme.colors.textInverse} />
                ) : (
                  <Text style={styles.saveBtnText}>{editing ? "Save changes" : "Add card"}</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ====== Schedule modal ====== */}
      <Modal
        visible={!!scheduleCard}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={closeSchedule}
      >
        <View
          style={[
            styles.fullScreen,
            { paddingTop: Math.max(insets.top, 20) + 8, paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.fullScreenInner}
          >
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.overline}>PAYOFF SCHEDULE</Text>
                <Text style={styles.modalTitle}>{scheduleCard?.name}</Text>
              </View>
              <TouchableOpacity testID="close-schedule" onPress={closeSchedule} style={styles.closeBtn} hitSlop={8}>
                <Ionicons name="close" size={22} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.modeRow}>
              <TouchableOpacity
                testID="schedule-mode-minimum"
                onPress={() => setScheduleMode("minimum")}
                style={[styles.modeBtn, scheduleMode === "minimum" && styles.modeBtnActive]}
              >
                <Text style={[styles.modeBtnText, scheduleMode === "minimum" && styles.modeBtnTextActive]}>Minimum</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="schedule-mode-custom"
                onPress={() => setScheduleMode("custom")}
                style={[styles.modeBtn, scheduleMode === "custom" && styles.modeBtnActive]}
              >
                <Text style={[styles.modeBtnText, scheduleMode === "custom" && styles.modeBtnTextActive]}>Custom</Text>
              </TouchableOpacity>
            </View>

            {scheduleMode === "custom" ? (
              <>
                <View style={styles.subModeRow}>
                  {(["amount", "months"] as const).map((k) => (
                    <TouchableOpacity
                      key={k}
                      testID={`schedule-custom-by-${k}`}
                      onPress={() => setCustomBy(k)}
                      style={[styles.subModeBtn, customBy === k && styles.subModeBtnActive]}
                    >
                      <Text style={[styles.subModeText, customBy === k && styles.subModeTextActive]}>
                        {k === "amount" ? "Monthly amount" : "Months to pay off"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {customBy === "amount" ? (
                  <View style={styles.customRow}>
                    <Text style={styles.customLabel}>Monthly payment</Text>
                    <TextInput
                      testID="schedule-custom-amount"
                      value={customAmountInput}
                      onChangeText={setCustomAmountInput}
                      keyboardType="decimal-pad"
                      style={styles.customInput}
                      placeholder="100"
                      placeholderTextColor={theme.colors.textMuted}
                    />
                  </View>
                ) : (
                  <>
                    <View style={styles.customRow}>
                      <Text style={styles.customLabel}>Pay off in</Text>
                      <TextInput
                        testID="schedule-custom-months"
                        value={monthsInput}
                        onChangeText={(v) => setMonthsInput(v.replace(/[^0-9]/g, ""))}
                        keyboardType="number-pad"
                        style={styles.customInput}
                        placeholder="12"
                        placeholderTextColor={theme.colors.textMuted}
                        maxLength={3}
                      />
                      <Text style={styles.customLabel}>months</Text>
                    </View>
                    <View style={styles.monthsResult} testID="schedule-months-payment">
                      <Text style={styles.monthsResultLabel}>You need to pay</Text>
                      <Text style={styles.monthsResultVal}>
                        {monthsPayment > 0 ? `${formatCurrency(monthsPayment, currency)} / month` : "Enter 1–600 months"}
                      </Text>
                    </View>
                  </>
                )}
              </>
            ) : null}

            {scheduleResult ? (
              <>
                <View style={styles.summaryRow}>
                  <View style={styles.summaryCell}>
                    <Text style={styles.summaryLabel}>Payments</Text>
                    <Text style={styles.summaryVal} testID="schedule-count">{scheduleResult.rows.length}</Text>
                  </View>
                  <View style={styles.summaryCell}>
                    <Text style={styles.summaryLabel}>Total paid</Text>
                    <Text style={styles.summaryVal}>{formatCurrency(scheduleResult.totalPaid, currency)}</Text>
                  </View>
                  <View style={styles.summaryCell}>
                    <Text style={styles.summaryLabel}>Interest</Text>
                    <Text style={[styles.summaryVal, { color: theme.colors.expense }]}>
                      {formatCurrency(scheduleResult.totalInterest, currency)}
                    </Text>
                  </View>
                </View>

                {scheduleResult.warning ? (
                  <View style={styles.warnBox}>
                    <Ionicons name="warning-outline" size={14} color={theme.colors.expense} />
                    <Text style={styles.warnText}>{scheduleResult.warning}</Text>
                  </View>
                ) : null}

                <View style={styles.tableHead}>
                  <Text style={[styles.th, { flex: 0.6 }]}>#</Text>
                  <Text style={[styles.th, { flex: 1.1 }]}>Pay</Text>
                  <Text style={[styles.th, { flex: 1 }]}>Interest</Text>
                  <Text style={[styles.th, { flex: 1 }]}>Principal</Text>
                  <Text style={[styles.th, { flex: 1.2, textAlign: "right" }]}>Balance</Text>
                </View>

                <ScrollView style={styles.tableBody} testID="schedule-table">
                  {scheduleResult.rows.length === 0 ? (
                    <View style={{ padding: 16 }}>
                      <Text style={styles.hintText}>No payments needed — balance is already zero.</Text>
                    </View>
                  ) : (
                    scheduleResult.rows.map((r) => (
                      <View key={r.month} style={styles.tr} testID={`schedule-row-${r.month}`}>
                        <Text style={[styles.td, { flex: 0.6, color: theme.colors.textMuted }]}>{r.month}</Text>
                        <Text style={[styles.td, { flex: 1.1 }]}>{formatCurrency(r.payment, currency)}</Text>
                        <Text style={[styles.td, { flex: 1, color: theme.colors.expense }]}>{formatCurrency(r.interest, currency)}</Text>
                        <Text style={[styles.td, { flex: 1 }]}>{formatCurrency(r.principal, currency)}</Text>
                        <Text style={[styles.td, { flex: 1.2, textAlign: "right", fontWeight: "700" }]}>{formatCurrency(r.balance, currency)}</Text>
                      </View>
                    ))
                  )}
                </ScrollView>
              </>
            ) : null}
            <TouchableOpacity testID="close-schedule-bottom" onPress={closeSchedule} style={styles.bottomCloseBtn}>
              <Text style={styles.bottomCloseText}>Close</Text>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between",
    paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md, paddingBottom: theme.spacing.sm,
  },
  overline: { fontSize: 11, letterSpacing: 3, color: theme.colors.textMuted, fontWeight: "600" },
  title: { fontSize: 28, fontWeight: "800", color: theme.colors.text, letterSpacing: -0.5, marginTop: 4 },
  addBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.colors.primary,
    alignItems: "center", justifyContent: "center",
  },
  scroll: { padding: theme.spacing.lg, paddingBottom: 64 },
  empty: { alignItems: "center", paddingVertical: 64, gap: 10 },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: theme.colors.text },
  emptyText: { fontSize: 14, color: theme.colors.textMuted, textAlign: "center", paddingHorizontal: 32, lineHeight: 20 },
  primaryBtn: {
    marginTop: 8, backgroundColor: theme.colors.primary,
    paddingHorizontal: 24, paddingVertical: 14, borderRadius: theme.radius.pill,
  },
  primaryBtnText: { color: theme.colors.textInverse, fontWeight: "700", fontSize: 15 },

  // Stacked card carousel
  stack: {},
  card: {
    borderRadius: theme.radius.xl,
    paddingHorizontal: 18, paddingVertical: 14,
    overflow: "hidden",
    ...theme.shadow.card,
  },
  cardTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardName: { color: "#fff", fontSize: 16, fontWeight: "800", letterSpacing: -0.3 },
  cardSubtle: { color: "#ffffffb0", fontSize: 11, marginTop: 2 },
  chip: {
    width: 30, height: 20, borderRadius: 4,
    backgroundColor: "#ffffff22",
    alignItems: "center", justifyContent: "center",
  },
  cardMiddle: { marginTop: 12 },
  cardBalanceLabel: { color: "#ffffffa0", fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  cardBalance: { color: "#fff", fontSize: 26, fontWeight: "800", letterSpacing: -0.8, marginTop: 2 },
  cardLimit: { color: "#ffffffb0", fontSize: 11, marginTop: 2 },
  cardBottom: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginTop: "auto", paddingTop: 10,
  },
  cardSmallLabel: { color: "#ffffffa0", fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  cardSmallVal: { color: "#fff", fontSize: 15, fontWeight: "800", marginTop: 1 },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardActionBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: "#ffffff28", borderRadius: theme.radius.pill,
  },
  cardActionText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  cardMiniBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: "#ffffff22",
    alignItems: "center", justifyContent: "center",
  },
  cardPeekAmount: { color: "#fff", fontSize: 14, fontWeight: "700", marginTop: 4 },
  cardPeekMin: { color: "#ffffffb0", fontWeight: "600", fontSize: 12 },

  // Modals
  modalWrap: { flex: 1, justifyContent: "flex-end", backgroundColor: "#00000066" },
  modalCard: {
    backgroundColor: theme.colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: theme.spacing.lg, paddingBottom: 24, maxHeight: "92%",
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: theme.spacing.md },
  modalTitle: { fontSize: 22, fontWeight: "800", color: theme.colors.text, letterSpacing: -0.5 },
  label: {
    fontSize: 11, letterSpacing: 2, fontWeight: "700",
    color: theme.colors.textMuted, marginBottom: 6, marginTop: 10, textTransform: "uppercase",
  },
  input: {
    backgroundColor: theme.colors.surfaceElevated, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.md, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, color: theme.colors.text,
  },
  row2: { flexDirection: "row", gap: 10 },
  palette: { flexDirection: "row", gap: 10, flexWrap: "wrap", marginBottom: 4 },
  swatch: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: "transparent" },
  swatchActive: { borderColor: theme.colors.text },
  saveBtn: {
    marginTop: 18, backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.pill, paddingVertical: 14, alignItems: "center",
  },
  saveBtnText: { color: theme.colors.textInverse, fontWeight: "700", fontSize: 15 },

  // Schedule
  modeRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  modeBtn: {
    flex: 1, paddingVertical: 9, borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border,
    alignItems: "center",
  },
  modeBtnActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  modeBtnText: { color: theme.colors.textMuted, fontWeight: "700", fontSize: 13 },
  modeBtnTextActive: { color: theme.colors.textInverse },
  customRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  customLabel: { fontSize: 12, color: theme.colors.textMuted, fontWeight: "700" },
  customInput: {
    flex: 1, backgroundColor: theme.colors.surfaceElevated, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.md, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, color: theme.colors.text,
  },
  summaryRow: {
    flexDirection: "row", gap: 8, marginBottom: 10,
    backgroundColor: theme.colors.surfaceElevated, borderRadius: theme.radius.lg,
    padding: 12, borderWidth: 1, borderColor: theme.colors.border,
  },
  summaryCell: { flex: 1 },
  summaryLabel: { fontSize: 10, color: theme.colors.textMuted, fontWeight: "700", letterSpacing: 1.2 },
  summaryVal: { fontSize: 16, fontWeight: "800", color: theme.colors.text, marginTop: 2 },
  warnBox: {
    flexDirection: "row", alignItems: "center", gap: 6,
    padding: 10, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.expense + "15",
    borderWidth: 1, borderColor: theme.colors.expense + "40",
    marginBottom: 10,
  },
  warnText: { color: theme.colors.expense, fontSize: 12, fontWeight: "600", flex: 1 },
  tableHead: {
    flexDirection: "row", gap: 6, paddingVertical: 8, paddingHorizontal: 6,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  th: { fontSize: 10, fontWeight: "700", color: theme.colors.textMuted, letterSpacing: 1 },
  tableBody: { flex: 1 },
  fullScreen: { flex: 1, backgroundColor: theme.colors.bg },
  fieldHint: { fontSize: 11, color: theme.colors.textMuted, marginTop: 6, lineHeight: 15 },
  fieldWarn: { fontSize: 12, color: theme.colors.expense, marginTop: 6, fontWeight: "600", lineHeight: 16 },
  bottomCloseBtn: {
    marginTop: 10, paddingVertical: 14, alignItems: "center",
    borderRadius: theme.radius.pill, backgroundColor: theme.colors.primary,
  },
  bottomCloseText: { color: theme.colors.textInverse, fontWeight: "700", fontSize: 15 },
  fullScreenInner: { flex: 1, paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md },
  closeBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.surface,
    alignItems: "center", justifyContent: "center",
  },
  subModeRow: { flexDirection: "row", gap: 6, marginBottom: 10 },
  subModeBtn: {
    flex: 1, paddingVertical: 8, borderRadius: theme.radius.md, alignItems: "center",
    borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated,
  },
  subModeBtnActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primaryLight },
  subModeText: { fontSize: 12, fontWeight: "700", color: theme.colors.textMuted },
  subModeTextActive: { color: theme.colors.primary },
  monthsResult: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    padding: 12, marginBottom: 10, borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primaryLight,
  },
  monthsResultLabel: { fontSize: 12, fontWeight: "700", color: theme.colors.primary },
  monthsResultVal: { fontSize: 16, fontWeight: "800", color: theme.colors.primary },
  tr: {
    flexDirection: "row", gap: 6, paddingVertical: 8, paddingHorizontal: 6,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border + "80",
  },
  td: { fontSize: 12, color: theme.colors.text },
  hintText: { fontSize: 13, color: theme.colors.textMuted, textAlign: "center" },
});
