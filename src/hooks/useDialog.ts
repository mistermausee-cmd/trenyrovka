import { useEffect, useRef } from 'react';

const focusableSelector = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialog<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open || !ref.current) return;
    const dialog = ref.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector));
    const preferred = dialog.querySelector<HTMLElement>('[data-dialog-initial]') ?? focusables[0] ?? dialog;
    window.setTimeout(() => preferred.focus(), 0);

  const isTopmost = () => {
      const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'));
      return dialogs.at(-1) === dialog;
    };
    const handleKey = (event: KeyboardEvent) => {
      if (!isTopmost()) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const current = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector));
      if (current.length === 0) { event.preventDefault(); dialog.focus(); return; }
      const first = current[0]!;
      const last = current[current.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };

    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      previousFocus?.focus();
    };
  }, [open]);

  return ref;
}
