'use client';
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as DialogPrimitive from '@radix-ui/react-dialog';

/**
 * CenterModal — Modal centrado en pantalla.
 * Uses Radix Dialog primitives directly (not the composite DialogContent)
 * to avoid duplicate portals/overlays that cause screen freeze on close.
 * Animate-in/out via Framer Motion for smooth spring-based transitions.
 */
export default function CenterModal({ open, onClose, children, maxWidth = 480 }: { open: boolean; onClose: () => void; children: React.ReactNode; maxWidth?: number }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm" asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content
              className="fixed top-[50%] left-[50%] z-[101] translate-x-[-50%] translate-y-[-50%] bg-[var(--card)] border border-[var(--border)] rounded-2xl p-0 shadow-2xl max-h-[85dvh] sm:max-h-[85vh] flex flex-col overflow-hidden border-none outline-none"
              style={{ maxWidth: maxWidth ? `${maxWidth}px` : undefined, width: '95vw' }}
              asChild
              forceMount
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300, duration: 0.2 }}

              >
                {/* Visually hidden title for accessibility */}
                <DialogPrimitive.Title className="sr-only">Modal</DialogPrimitive.Title>
                <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
                  {children}
                </div>
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}
