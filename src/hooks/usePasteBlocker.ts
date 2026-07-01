import { useCallback, useRef } from "react";

/**
 * Returns an `onPaste` handler that prevents paste and shows a brief
 * floating warning near the input field. Auto-dismisses after 2.5 seconds.
 */
export function usePasteBlocker() {
  const toastRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();

    // Remove any existing toast
    if (toastRef.current) {
      toastRef.current.remove();
      toastRef.current = null;
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    // Create toast element
    const toast = document.createElement("div");
    toast.className = "paste-blocked-toast";
    toast.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span>Copy & paste is not allowed for password fields</span>
    `;
    document.body.appendChild(toast);
    toastRef.current = toast;

    // Trigger entrance animation
    requestAnimationFrame(() => {
      toast.classList.add("paste-blocked-toast--visible");
    });

    // Auto-dismiss after 2.5s
    timerRef.current = setTimeout(() => {
      toast.classList.remove("paste-blocked-toast--visible");
      toast.classList.add("paste-blocked-toast--exit");
      setTimeout(() => {
        toast.remove();
        if (toastRef.current === toast) toastRef.current = null;
      }, 300);
    }, 2500);
  }, []);

  return handlePaste;
}
