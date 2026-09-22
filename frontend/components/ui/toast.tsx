'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
}

interface ToastContextType {
  toast: {
    success: (title: string, description?: string) => void;
    error: (title: string, description?: string) => void;
    info: (title: string, description?: string) => void;
  };
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback(
    (type: ToastType, title: string, description?: string, duration = 3500) => {
      const id = Math.random().toString(36).substring(2, 9);
      const newToast: ToastItem = { id, type, title, description, duration };

      setToasts((prev) => [...prev, newToast]);

      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    },
    []
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toastMethods = {
    success: (title: string, description?: string) => addToast('success', title, description),
    error: (title: string, description?: string) => addToast('error', title, description),
    info: (title: string, description?: string) => addToast('info', title, description),
  };

  return (
    <ToastContext.Provider value={{ toast: toastMethods }}>
      {children}
      {/* Toast Render Container */}
      <div
        aria-live="assertive"
        className="fixed bottom-4 right-4 z-9999 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0"
      >
        <AnimatePresence mode="popLayout">
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
              className="pointer-events-auto bg-white border border-slate-200/90 shadow-xl rounded-2xl p-4 flex items-start gap-3.5 relative overflow-hidden backdrop-blur-md"
            >
              {/* Left Accent Bar */}
              <div
                className={`absolute left-0 top-0 bottom-0 w-1.5 ${
                  t.type === 'success'
                    ? 'bg-emerald-500'
                    : t.type === 'error'
                    ? 'bg-rose-500'
                    : 'bg-blue-500'
                }`}
              />

              {/* Icon */}
              <div className="shrink-0 mt-0.5">
                {t.type === 'success' && (
                  <div className="p-1.5 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                )}
                {t.type === 'error' && (
                  <div className="p-1.5 rounded-xl bg-rose-50 text-rose-600 border border-rose-100">
                    <AlertCircle className="w-4 h-4" />
                  </div>
                )}
                {t.type === 'info' && (
                  <div className="p-1.5 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                    <Info className="w-4 h-4" />
                  </div>
                )}
              </div>

              {/* Text content */}
              <div className="flex-1 min-w-0 pr-4">
                <h4 className="text-xs font-bold text-slate-900 tracking-tight leading-snug">
                  {t.title}
                </h4>
                {t.description && (
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-normal">
                    {t.description}
                  </p>
                )}
              </div>

              {/* Close Button */}
              <button
                onClick={() => removeToast(t.id)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context.toast;
}
