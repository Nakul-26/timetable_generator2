import { useCallback, useState } from "react";

// Shared select-all/select-row/bulk-delete selection state for CRUD list pages.
// `visibleIds` is the id list for whatever's currently filtered/visible on screen.
export default function useBulkSelection(visibleIds) {
  const [selectedIds, setSelectedIds] = useState([]);

  const isSelected = useCallback((id) => selectedIds.includes(id), [selectedIds]);

  const toggle = useCallback((id, checked) => {
    setSelectedIds((prev) =>
      checked ? Array.from(new Set([...prev, id])) : prev.filter((x) => x !== id)
    );
  }, []);

  const remove = useCallback((id) => {
    setSelectedIds((prev) => prev.filter((x) => x !== id));
  }, []);

  const clear = useCallback(() => setSelectedIds([]), []);

  // Used by the table-header checkbox: replaces the whole selection with just the visible ids.
  const setAllVisible = useCallback((checked) => {
    setSelectedIds(checked ? visibleIds : []);
  }, [visibleIds]);

  // Used by the bulk-actions-bar checkbox: merges/unmerges visible ids without touching
  // selections outside the current filter.
  const toggleAllVisible = useCallback((checked) => {
    setSelectedIds((prev) =>
      checked
        ? Array.from(new Set([...prev, ...visibleIds]))
        : prev.filter((id) => !visibleIds.includes(id))
    );
  }, [visibleIds]);

  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.includes(id));

  return {
    selectedIds,
    setSelectedIds,
    isSelected,
    toggle,
    remove,
    clear,
    setAllVisible,
    toggleAllVisible,
    allVisibleSelected,
    someVisibleSelected,
  };
}
