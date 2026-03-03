// =====================================================
// Toast notification system – context + animated UI
// =====================================================
import React, { createContext, useCallback, useContext, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, CheckCircle, AlertCircle, Info } from "lucide-react";

const ToastCtx = createContext(null);
export const useToast = () => useContext(ToastCtx);

let _nextId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = "success") => {
    const id = ++_nextId;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastCtx.Provider value={{ addToast }}>
      {children}

      {/* Toast container – bottom-right, above everything */}
      <div className="fixed bottom-4 right-4 z-[300] flex flex-col-reverse gap-2">
        <AnimatePresence>
          {toasts.map(({ id, message, type }) => {
            const Icon =
              type === "error"
                ? AlertCircle
                : type === "info"
                ? Info
                : CheckCircle;

            const color =
              type === "error"
                ? "bg-red-600"
                : type === "info"
                ? "bg-blue-600"
                : "bg-emerald-600";

            return (
              <motion.div
                key={id}
                initial={{ opacity: 0, x: 80 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 80 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className={`flex max-w-xs items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-xl ${color}`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{message}</span>
                <button
                  onClick={() => dismiss(id)}
                  className="ml-1 opacity-70 transition-opacity hover:opacity-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}
