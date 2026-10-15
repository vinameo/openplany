import { useEffect, useRef, useState, type RefObject } from "react";

export interface UseDiscardGuardOptions {
  hasChanges: boolean;
  isSaving?: boolean;
  onDiscard: () => void;
}

export interface DiscardGuard {
  isConfirmingDiscard: boolean;
  keepEditingRef: RefObject<HTMLButtonElement | null>;
  requestClose: () => void;
  cancelDiscard: () => void;
}

export function useDiscardGuard({
  hasChanges,
  isSaving = false,
  onDiscard,
}: UseDiscardGuardOptions): DiscardGuard {
  const [isConfirmingDiscard, setIsConfirmingDiscard] = useState(false);
  const keepEditingRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isConfirmingDiscard) keepEditingRef.current?.focus();
  }, [isConfirmingDiscard]);

  function requestClose(): void {
    if (isSaving) return;
    if (isConfirmingDiscard) {
      setIsConfirmingDiscard(false);
    } else if (hasChanges) {
      setIsConfirmingDiscard(true);
    } else {
      onDiscard();
    }
  }

  function cancelDiscard(): void {
    setIsConfirmingDiscard(false);
  }

  return {
    isConfirmingDiscard,
    keepEditingRef,
    requestClose,
    cancelDiscard,
  };
}
