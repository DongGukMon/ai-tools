import { create } from "zustand";

export interface ToastItem {
  id: string;
  variant: "success" | "error" | "info" | "warning";
  message: string;
}

interface ToastState {
  toasts: ToastItem[];
  addToast: (variant: ToastItem["variant"], message: string) => void;
  removeToast: (id: string) => void;
}

let nextId = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: (variant, message) => {
    const id = String(++nextId);
    set((state) => ({
      toasts: [...state.toasts, { id, variant, message }],
    }));
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, 3000);
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));

export function useToast() {
  const addToast = useToastStore((s) => s.addToast);
  return {
    toast: addToast,
  };
}
