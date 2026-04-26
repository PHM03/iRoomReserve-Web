import type { Unsubscribe } from "firebase/firestore";

interface GuardedSnapshotCallback<T> {
  emit: (value: T) => void;
  isCancelled: () => boolean;
  wrap: (unsubscribe: Unsubscribe) => Unsubscribe;
}

export function createGuardedSnapshotCallback<T>(
  callback: (value: T) => void
): GuardedSnapshotCallback<T> {
  let cancelled = false;

  return {
    emit(value) {
      if (cancelled) {
        return;
      }

      callback(value);
    },
    isCancelled() {
      return cancelled;
    },
    wrap(unsubscribe) {
      return () => {
        cancelled = true;
        unsubscribe();
      };
    },
  };
}
