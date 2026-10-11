import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

export interface UseGridNavigationOptions {
  totalItems: number;
  columns: number;
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export function useGridNavigation({
  totalItems,
  columns,
  selectedIndex,
  onSelect,
}: UseGridNavigationOptions) {
  const [focusedIndex, setFocusedIndex] = useState(() =>
    selectedIndex >= 0 && selectedIndex < totalItems ? selectedIndex : 0,
  );
  const itemsRef = useRef<(HTMLElement | null)[]>([]);

  // Filtering can shrink the grid below the remembered cell; fall back to the
  // selected cell (or the first) so exactly one cell stays reachable with Tab.
  const activeIndex =
    focusedIndex >= 0 && focusedIndex < totalItems
      ? focusedIndex
      : selectedIndex >= 0 && selectedIndex < totalItems
        ? selectedIndex
        : 0;

  // Forget refs of cells that no longer render.
  useEffect(() => {
    itemsRef.current.length = totalItems;
  }, [totalItems]);

  const registerItem = useCallback(
    (index: number) => (el: HTMLElement | null) => {
      itemsRef.current[index] = el;
    },
    [],
  );

  const focusItem = useCallback((nextIndex: number) => {
    setFocusedIndex(nextIndex);
    itemsRef.current[nextIndex]?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>, index: number) => {
      let handled = true;

      switch (event.key) {
        case "ArrowLeft": {
          const next = index > 0 ? index - 1 : totalItems - 1;
          focusItem(next);
          break;
        }
        case "ArrowRight": {
          const next = index < totalItems - 1 ? index + 1 : 0;
          focusItem(next);
          break;
        }
        case "ArrowUp": {
          const next = index - columns;
          if (next >= 0) {
            focusItem(next);
          }
          break;
        }
        case "ArrowDown": {
          const next = index + columns;
          if (next < totalItems) {
            focusItem(next);
          }
          break;
        }
        case "Home": {
          const rowStart = Math.floor(index / columns) * columns;
          focusItem(rowStart);
          break;
        }
        case "End": {
          const rowEnd = Math.min(
            totalItems - 1,
            Math.floor(index / columns) * columns + columns - 1,
          );
          focusItem(rowEnd);
          break;
        }
        case "Enter":
        case " ": {
          event.preventDefault();
          onSelect(index);
          break;
        }
        default:
          handled = false;
      }

      if (handled) {
        event.stopPropagation();
      }
    },
    [columns, totalItems, focusItem, onSelect],
  );

  const getTabIndex = (index: number): number => {
    return activeIndex === index ? 0 : -1;
  };

  return {
    focusedIndex: activeIndex,
    setFocusedIndex,
    registerItem,
    handleKeyDown,
    getTabIndex,
  };
}
