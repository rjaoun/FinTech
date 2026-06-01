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

type ConfirmOptions = {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  icon?: any;
};

type ConfirmCtx = (opts: ConfirmOptions) => Promise<boolean>;

const Ctx = createContext<ConfirmCtx | null>(null);

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmCtx>((opts) => {
    setState(opts);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const close = (value: boolean) => {
    const r = resolverRef.current;
    resolverRef.current = null;
    setState(null);
    if (r) r(value);
  };

  const destructive = state?.destructive;

  return (
    <Ctx.Provider value={confirm}>
      {children}
      <Modal
        visible={!!state}
        transparent
        animationType="fade"
        onRequestClose={() => close(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => close(false)}>
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
                name={state?.icon || (destructive ? "trash-outline" : "alert-circle-outline")}
                size={22}
                color={destructive ? theme.colors.expense : theme.colors.primary}
              />
            </View>
            <Text style={styles.title} testID="confirm-dialog-title">
              {state?.title}
            </Text>
            {state?.message ? <Text style={styles.message}>{state.message}</Text> : null}
            <View style={styles.row}>
              <TouchableOpacity
                testID="confirm-dialog-cancel"
                onPress={() => close(false)}
                style={[styles.btn, styles.cancelBtn]}
              >
                <Text style={[styles.btnText, { color: theme.colors.text }]}>
                  {state?.cancelText || "Cancel"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="confirm-dialog-confirm"
                onPress={() => close(true)}
                style={[
                  styles.btn,
                  destructive ? styles.destructiveBtn : styles.confirmBtn,
                ]}
              >
                <Text style={[styles.btnText, { color: theme.colors.textInverse }]}>
                  {state?.confirmText || (destructive ? "Delete" : "Confirm")}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Ctx.Provider>
  );
};

export function useConfirm(): ConfirmCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
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
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: theme.radius.pill,
    alignItems: "center",
  },
  cancelBtn: { backgroundColor: theme.colors.surface },
  confirmBtn: { backgroundColor: theme.colors.primary },
  destructiveBtn: { backgroundColor: theme.colors.expense },
  btnText: { fontSize: 14, fontWeight: "700" },
});
