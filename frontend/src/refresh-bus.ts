// Tiny module-level event bus to coordinate screens without prop drilling or query params.
// Used to tell the Activity tab to refresh and reset its filter after a new transaction is saved.

type Listener = () => void;

const listeners: Record<string, Set<Listener>> = {};

export const refreshBus = {
  /** Mutable flags consumed by listeners. Reset after read. */
  flags: {
    /** True when a new transaction was just created/edited and the Activity tab should refresh + reset filter. */
    transactionsNeedReset: false,
  } as { transactionsNeedReset: boolean },

  on(event: string, fn: Listener) {
    if (!listeners[event]) listeners[event] = new Set();
    listeners[event].add(fn);
    return () => listeners[event].delete(fn);
  },
  emit(event: string) {
    listeners[event]?.forEach((l) => {
      try {
        l();
      } catch {}
    });
  },
};
