'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}

export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive = true,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <AlertDialogPrimitive.Portal forceMount>
            <AlertDialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm" asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            </AlertDialogPrimitive.Overlay>
            <AlertDialogPrimitive.Content
              className="fixed top-[50%] left-[50%] z-[101] translate-x-[-50%] translate-y-[-50%] bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl p-5 border-none outline-none"
              asChild
              forceMount
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300, duration: 0.2 }}
              >
                <div className="flex items-start gap-3">
                  {destructive && (
                    <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
                      <AlertTriangle className="w-5 h-5 text-red-500" aria-hidden="true" />
                    </div>
                  )}
                  <div>
                    <AlertDialogPrimitive.Title className="text-sm font-semibold text-[var(--foreground)]">
                      {title}
                    </AlertDialogPrimitive.Title>
                    {description && (
                      <AlertDialogPrimitive.Description className="text-xs text-[var(--muted-foreground)] mt-1">
                        {description}
                      </AlertDialogPrimitive.Description>
                    )}
                  </div>
                </div>
                <div className="flex flex-row gap-2 justify-end mt-4 pt-3 border-t border-[var(--border)]">
                  <AlertDialogPrimitive.Cancel className="text-xs px-4 py-2 rounded-lg border border-[var(--border)] bg-transparent text-[var(--muted-foreground)] hover:bg-[var(--af-bg3)] hover:text-[var(--foreground)] transition-colors cursor-pointer">
                    {cancelLabel}
                  </AlertDialogPrimitive.Cancel>
                  <AlertDialogPrimitive.Action
                    onClick={() => { onConfirm(); }}
                    className={`text-xs px-4 py-2 rounded-lg font-medium cursor-pointer transition-all active:scale-95 ${destructive ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90'}`}
                  >
                    {confirmLabel}
                  </AlertDialogPrimitive.Action>
                </div>
              </motion.div>
            </AlertDialogPrimitive.Content>
          </AlertDialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </AlertDialogPrimitive.Root>
  );
}
