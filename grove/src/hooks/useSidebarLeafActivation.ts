import { useCallback } from "react";
import { useTabStore } from "../store/tab";

interface SidebarLeafActivationOptions {
  disabled?: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onReselect?: () => void;
}

export function runSidebarLeafActivation({
  disabled = false,
  isSelected,
  onSelect,
  onReselect,
}: SidebarLeafActivationOptions): void {
  if (disabled) return;

  if (isSelected) {
    onReselect?.();
    return;
  }

  onSelect();
}

export function useSidebarLeafActivation({
  disabled = false,
  isSelected,
  onSelect,
  onReselect,
}: SidebarLeafActivationOptions): () => void {
  const setActiveTab = useTabStore((s) => s.setActiveTab);

  return useCallback(() => {
    runSidebarLeafActivation({
      disabled,
      isSelected,
      onSelect,
      onReselect: onReselect ?? (() => setActiveTab("terminal")),
    });
  }, [disabled, isSelected, onSelect, onReselect, setActiveTab]);
}
