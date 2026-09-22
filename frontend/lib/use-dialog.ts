'use client';

import { useEffect, useRef } from 'react';

/**
 * Accessibility behaviour every modal/drawer needs but none of them had:
 *  - Escape closes the dialog
 *  - background scroll is locked while open
 *  - focus moves into the dialog on open and returns to the trigger on close
 *  - Tab is trapped inside the dialog
 *
 * Returns a ref to attach to the dialog container element.
 */
export function useDialog<T extends HTMLElement = HTMLDivElement>({
  isOpen,
  onClose,
  closeOnEscape = true,
}: {
  isOpen: boolean;
  onClose: () => void;
  closeOnEscape?: boolean;
}) {
  const containerRef = useRef<T | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    // Lock background scroll without causing a layout shift from the vanishing
    // scrollbar.
    const { overflow, paddingRight } = document.body.style;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;

    const focusableSelector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled]):not([type="hidden"])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    const getFocusable = (): HTMLElement[] => {
      if (!containerRef.current) return [];
      return Array.from(containerRef.current.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
    };

    // Defer so the element exists after the open animation mounts it.
    const focusTimer = window.setTimeout(() => {
      const focusable = getFocusable();
      (focusable[0] ?? containerRef.current)?.focus?.();
    }, 30);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (closeOnEscape && event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = getFocusable();
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
      previouslyFocused.current?.focus?.();
    };
  }, [isOpen, onClose, closeOnEscape]);

  return containerRef;
}
