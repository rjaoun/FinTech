import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../theme";

type BaseOptions = {
  title: string;
  message?: string;
  icon?: any;
};

type ConfirmOptions = BaseOptions & {
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
};

export type ChoiceOption = {
  key: string;
  label: string;
  destructive?: boolean;
  primary?: boolean;
};

type ChoiceOptions = BaseOptions & {
  choices: ChoiceOption[];
  cancelText?: string;
};

type InternalState =
  | ({ kind: "confirm" } & ConfirmOptions)
  | ({ kind: "choice" } & ChoiceOptions);

type ConfirmCtx = (opts: ConfirmOptions) => Promise<boolean>;
type ChoiceCtx = (opts: ChoiceOptions) => Promise<string | null>;

const CtxConfirm = createContext<ConfirmCtx | null>(null);
const CtxChoice = createContext<ChoiceCtx | null>(null);

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<InternalState | null>(null);
  const boolResolverRef = useRef<((v: boolean) => void) | null>(null);
  const choiceResolverRef = useRef<((v: string | null) => void) | null>(null);

  const confirm = useCallback<ConfirmCtx>((opts) => {
    setState({ kind: "confirm", ...opts });
    return new Promise<boolean>((resolve) => {
      boolResolverRef.current = resolve;
    });
  }, []);

  const choose = useCallback<ChoiceCtx>((opts) => {
    setState({ kind: "choice", ...opts });
    return new Promise<string | null>((resolve) => {
      choiceResolverRef.current = resolve;
    });
  }, []);

  const closeAsCancel = () => {
    const boolR = boolResolverRef.current;
    const choiceR = choiceResolverRef.current;
    boolResolverRef.current = null;
    choiceResolverRef.current = null;
    setState(null);
    if (boolR) boolR(false);
    if (choiceR) choiceR(null);
  };

  const resolveBool = (value: boolean) => {
    const r = boolResolverRef.current;
    boolResolverRef.current = null;
    setState(null);
    if (r) r(value);
  };

  const resolveChoice = (key: string) => {
    const r = choiceResolverRef.current;
    choiceResolverRef.current = null;
    setState(null);
    if (r) r(key);
  };

  const destructive = state?.kind === "confirm" ? !!state.destructive : false;

  return (
    <CtxConfirm.Provider value={confirm}>
      <CtxChoice.Provider value={choose}>
        {children}
        <Modal
          visible={!!state}
          transparent
          animationType="fade"
          onRequestClose={closeAsCancel}
        >
          <Pressable style={styles.backdrop} onPress={closeAsCancel}>
            <Pressable style={styles.card} onPress={() => {}}>
              <View
                style={[
                  styles.iconWrap,
                  destructive
                    ? { backgroundColor: theme.colors.expense + "1F" }
                    : { backgroundColor: theme.colors.primaryLight },
                ]}
              >
                <Ionicons
                  name={
                    state?.icon ||
                    (destructive ? "trash-outline" : "alert-circle-outline")
                  }
                  size={22}
                  color={destructive ? theme.colors.expense : theme.colors.primary}
                />
              </View>
              <Text style={styles.title} testID="confirm-dialog-title">
                {state?.title}
              </Text>
              {state?.message ? <Text style={styles.message}>{state.message}</Text> : null}

              {state?.kind === "confirm" ? (
                <View style={styles.row}>
                  <TouchableOpacity
                    testID="confirm-dialog-cancel"
                    onPress={() => resolveBool(false)}
                    style={[styles.btn, styles.cancelBtn]}
                  >
                    <Text style={[styles.btnText, { color: theme.colors.text }]}>
                      {state.cancelText || "Cancel"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="confirm-dialog-confirm"
                    onPress={() => resolveBool(true)}
                    style={[
                      styles.btn,
                      destructive ? styles.destructiveBtn : styles.confirmBtn,
                    ]}
                  >
                    <Text style={[styles.btnText, { color: theme.colors.textInverse }]}>
                      {state.confirmText || (destructive ? "Delete" : "Confirm")}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {state?.kind === "choice" ? (
                <View style={styles.column}>
                  {state.choices.map((c) => (
                    <TouchableOpacity
                      key={c.key}
                      testID={`choice-dialog-${c.key}`}
                      onPress={() => resolveChoice(c.key)}
                      style={[
                        styles.btnFull,
                        c.destructive
                          ? styles.destructiveBtn
                          : c.primary
                          ? styles.confirmBtn
                          : styles.cancelBtn,
                      ]}
                    >
                      <Text
                        style={[
                          styles.btnText,
                          {
                            color:
                              c.destructive || c.primary
                                ? theme.colors.textInverse
                                : theme.colors.text,
                          },
                        ]}
                      >
                        {c.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    testID="choice-dialog-cancel"
                    onPress={closeAsCancel}
                    style={styles.textBtn}
                  >
                    <Text style={styles.textBtnText}>{state.cancelText || "Cancel"}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </Pressable>
          </Pressable>
        </Modal>
      </CtxChoice.Provider>
    </CtxConfirm.Provider>
  );
};

export function useConfirm(): ConfirmCtx {
  const ctx = useContext(CtxConfirm);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}

export function useChoice(): ChoiceCtx {
  const ctx = useContext(CtxChoice);
  if (!ctx) throw new Error("useChoice must be used within ConfirmProvider");
  return ctx;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "#00000088",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    ...theme.shadow.card,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.text,
    textAlign: "center",
    marginBottom: 6,
  },
  message: {
    fontSize: 14,
    color: theme.colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 4,
  },
  row: { flexDirection: "row", gap: 10, marginTop: 20, width: "100%" },
  column: { flexDirection: "column", gap: 8, marginTop: 20, width: "100%" },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: theme.radius.pill,
    alignItems: "center",
  },
  btnFull: {
    width: "100%",
    paddingVertical: 12,
    borderRadius: theme.radius.pill,
    alignItems: "center",
  },
  cancelBtn: { backgroundColor: theme.colors.surface },
  confirmBtn: { backgroundColor: theme.colors.primary },
  destructiveBtn: { backgroundColor: theme.colors.expense },
  btnText: { fontSize: 14, fontWeight: "700" },
  textBtn: { paddingVertical: 10, marginTop: 2, alignItems: "center" },
  textBtnText: { fontSize: 14, fontWeight: "600", color: theme.colors.textMuted },
});
