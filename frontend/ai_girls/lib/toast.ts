export type ToastVariant = 'success' | 'error' | 'warning' | 'info';
export type ToastPayload = { variant?: ToastVariant; title?: string; description?: string };

export function toast(payload: ToastPayload) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('app:toast', { detail: payload }));
}

export const toastSuccess = (title: string, description?: string) => toast({ variant: 'success', title, description });
export const toastError = (title: string, description?: string) => toast({ variant: 'error', title, description });
export const toastWarning = (title: string, description?: string) => toast({ variant: 'warning', title, description });
