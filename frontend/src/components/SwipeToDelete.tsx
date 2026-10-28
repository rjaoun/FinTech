import React, { useRef } from "react";
import { StyleSheet, TouchableOpacity, Text, View } from "react-native";
import ReanimatedSwipeable, {
  SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../theme";

type Props = {
  // Render prop: `guard(fn)` runs fn only if the row isn't mid-swipe or open,
  // so a drag (e.g. with a mouse on web) never doubles as a tap.
  children: (guard: (fn: () => void) => void) => React.ReactNode;
  onDelete: () => void;
  // Optional swipe-right action: toggles paid state as soon as the row is swiped open.
  onTogglePaid?: () => void;
  isPaid?: boolean;
  enabled?: boolean;
  testID?: string;
  paidTestID?: string;
};

export default function SwipeToDelete({
  children, onDelete, onTogglePaid, isPaid, enabled = true, testID, paidTestID,
}: Props) {
  const ref = useRef<SwipeableMethods>(null);
  const isOpen = useRef(false);
  const lastSwipe = useRef(0);
  const mark = () => {
    lastSwipe.current = Date.now();
  };
  const guard = (fn: () => void) => {
    if (isOpen.current) {
      ref.current?.close();
      return;
    }
    if (Date.now() - lastSwipe.current < 500) return;
    fn();
  };

  if (!enabled) return <View style={styles.container}>{children((fn) => fn())}</View>;

  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      containerStyle={styles.container}
      onSwipeableOpenStartDrag={mark}
      onSwipeableCloseStartDrag={mark}
      onSwipeableWillOpen={mark}
      onSwipeableWillClose={mark}
      leftThreshold={60}
      overshootLeft={false}
      onSwipeableOpen={(direction) => {
        isOpen.current = true;
        mark();
        // "right" = row dragged to the right, revealing the left (paid) action.
        if (direction === "right" && onTogglePaid) {
          onTogglePaid();
          ref.current?.close();
        }
      }}
      onSwipeableClose={() => {
        isOpen.current = false;
        mark();
      }}
      renderLeftActions={
        onTogglePaid
          ? () => (
              <TouchableOpacity
                testID={paidTestID}
                accessibilityLabel={isPaid ? "Mark as unpaid" : "Mark as paid"}
                style={[styles.action, styles.paidAction, isPaid && styles.unpaidAction]}
                onPress={() => {
                  ref.current?.close();
                  onTogglePaid();
                }}
              >
                <Ionicons name={isPaid ? "arrow-undo" : "checkmark-circle"} size={22} color="#FFFFFF" />
                <Text style={styles.actionText}>{isPaid ? "Unpaid" : "Paid"}</Text>
              </TouchableOpacity>
            )
          : undefined
      }
      renderRightActions={() => (
        <TouchableOpacity
          testID={testID}
          accessibilityLabel="Delete transaction"
          style={styles.action}
          onPress={() => {
            ref.current?.close();
            onDelete();
          }}
        >
          <Ionicons name="trash" size={22} color="#FFFFFF" />
          <Text style={styles.actionText}>Delete</Text>
        </TouchableOpacity>
      )}
    >
      {children(guard)}
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 8, borderRadius: theme.radius.lg },
  action: {
    width: 84,
    marginLeft: 8,
    backgroundColor: "#E5484D",
    borderRadius: theme.radius.lg,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  paidAction: { marginLeft: 0, marginRight: 8, backgroundColor: theme.colors.income },
  unpaidAction: { backgroundColor: theme.colors.accentSand },
  actionText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
});
