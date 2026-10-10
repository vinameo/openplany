import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocalStorage } from "@mantine/hooks";
import { useLocation } from "react-router";
import { useIsDesktop } from "../../layout/useIsDesktop";
import {
  SIDEBAR_COLLAPSED_STORAGE_KEY,
  parseSidebarCollapsed,
  serializeSidebarCollapsed,
} from "./sidebarPreference";
import type {
  WorkspaceSidebarMode,
  WorkspaceSidebarValue,
} from "./workspaceSidebarContext";

export function useWorkspaceSidebarState(): WorkspaceSidebarValue {
  const isDesktop = useIsDesktop();
  const { pathname } = useLocation();
  const sidebarId = useId();

  // Use defaultValue: undefined so Mantine does not proactively write default value to storage on mount (INV-02 / AC-11)
  const [collapsed, setCollapsed] = useLocalStorage<boolean | undefined>({
    key: SIDEBAR_COLLAPSED_STORAGE_KEY,
    defaultValue: undefined,
    getInitialValueInEffect: false,
    deserialize: (raw) => (raw !== undefined ? parseSidebarCollapsed(raw) : undefined),
    serialize: (val) => serializeSidebarCollapsed(val === true),
  });

  // Mobile: drawer is only open on the exact path where it was opened -> navigating closes it without an effect
  const [drawerOpenedAt, setDrawerOpenedAt] = useState<string | null>(null);

  // When breakpoint changes, drawer closes (adjust state during render pattern)
  const [prevIsDesktop, setPrevIsDesktop] = useState(isDesktop);
  if (prevIsDesktop !== isDesktop) {
    setPrevIsDesktop(isDesktop);
    setDrawerOpenedAt(null);
  }

  const collapseButtonRef = useRef<HTMLButtonElement | null>(null);
  const expandButtonRef = useRef<HTMLButtonElement | null>(null);
  const pendingFocus = useRef<"collapse" | "expand" | null>(null);

  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    (target === "expand" ? expandButtonRef : collapseButtonRef).current?.focus();
  }, [collapsed]);

  const mode: WorkspaceSidebarMode = isDesktop ? "desktop" : "mobile";
  const isCollapsed = collapsed === true;
  const isOpen = isDesktop ? !isCollapsed : drawerOpenedAt === pathname;

  const open = useCallback(() => {
    if (isDesktop) {
      pendingFocus.current = "collapse";
      setCollapsed(false);
    } else {
      setDrawerOpenedAt(pathname);
    }
  }, [isDesktop, pathname, setCollapsed]);

  const close = useCallback(() => {
    if (isDesktop) {
      pendingFocus.current = "expand";
      setCollapsed(true);
    } else {
      setDrawerOpenedAt(null);
    }
  }, [isDesktop, setCollapsed]);

  const toggle = useCallback(() => {
    if (isOpen) {
      close();
    } else {
      open();
    }
  }, [isOpen, close, open]);

  return useMemo(
    () => ({
      mode,
      isOpen,
      open,
      close,
      toggle,
      sidebarId,
      collapseButtonRef,
      expandButtonRef,
    }),
    [mode, isOpen, open, close, toggle, sidebarId],
  );
}
