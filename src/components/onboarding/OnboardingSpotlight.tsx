'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Lightbulb, ChevronRight } from 'lucide-react';
import { useOnboardingStore, type SpotlightTip } from '@/stores/onboarding-store';

/* ─── Spotlight Tooltip ─── */
function SpotlightTooltip({
  tip,
  targetRect,
  onDismiss,
  onNext,
  onNextAvailable,
}: {
  tip: SpotlightTip;
  targetRect: DOMRect | null;
  onDismiss: () => void;
  onNext: () => void;
  onNextAvailable: boolean;
}) {
  const [tooltipRect, setTooltipRect] = useState<DOMRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  // Calculate position
  useEffect(() => {
    if (!targetRect || !tooltipRef.current) return;
    const tr = targetRect;
    const tRect = tooltipRef.current.getBoundingClientRect();
    setTooltipRect(tRect);

    const gap = 12;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    let top = 0;
    let left = 0;

    switch (tip.position) {
      case 'top':
        top = tr.top - tRect.height - gap;
        left = tr.left + tr.width / 2 - tRect.width / 2;
        break;
      case 'bottom':
        top = tr.bottom + gap;
        left = tr.left + tr.width / 2 - tRect.width / 2;
        break;
      case 'left':
        top = tr.top + tr.height / 2 - tRect.height / 2;
        left = tr.left - tRect.width - gap;
        break;
      case 'right':
        top = tr.top + tr.height / 2 - tRect.height / 2;
        left = tr.right + gap;
        break;
    }

    // Clamp to viewport
    left = Math.max(8, Math.min(left, viewportW - tRect.width - 8));
    top = Math.max(8, Math.min(top, viewportH - tRect.height - 8));

    setPosition({ top, left });
  }, [targetRect, tip.position]);

  if (!targetRect) return null;

  return (
    <>
      {/* Highlight overlay */}
      <div
        className="fixed z-[151] rounded-xl border-2 border-[var(--af-accent)] shadow-[0_0_20px_rgba(200,169,110,0.3)] pointer-events-none transition-all duration-300"
        style={{
          top: targetRect.top - 4,
          left: targetRect.left - 4,
          width: targetRect.width + 8,
          height: targetRect.height + 8,
        }}
      />

      {/* Tooltip */}
      <motion.div
        ref={tooltipRef}
        className="fixed z-[152] w-72 bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden"
        style={{ top: position.top, left: position.left }}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Header */}
        <div className="px-4 pt-3 pb-2 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[var(--af-accent)]/15 flex items-center justify-center flex-shrink-0">
              <Lightbulb size={14} className="stroke-[var(--af-accent)]" aria-hidden="true"/>
            </div>
            <span className="text-[13px] font-semibold text-[var(--foreground)]">{tip.title}</span>
          </div>
          <button
            aria-label="Cerrar"
            onClick={onDismiss}
            className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--af-bg3)] transition-all cursor-pointer border-none bg-transparent flex-shrink-0"
          >
            <X size={14} aria-hidden="true"/>
          </button>
        </div>

        {/* Description */}
        <div className="px-4 pb-3">
          <p className="text-[12px] text-[var(--muted-foreground)] leading-relaxed">{tip.description}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-4 pb-3">
          <button
            onClick={onDismiss}
            className="text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer bg-transparent border-none px-2 py-1 rounded-md hover:bg-[var(--af-bg3)] transition-all"
          >
            Cerrar
          </button>
          {onNextAvailable && (
            <button
              onClick={onNext}
              className="flex items-center gap-1 text-[11px] font-medium text-[var(--af-accent)] hover:text-[var(--af-accent2)] cursor-pointer bg-transparent border-none px-2 py-1 rounded-md hover:bg-[var(--af-accent)]/10 transition-all"
            >
              Siguiente
              <ChevronRight size={12} aria-hidden="true"/>
            </button>
          )}
        </div>
      </motion.div>
    </>
  );
}

/* ─── Spotlight Provider ─── */
export default function OnboardingSpotlight() {
  const { activeSpotlightId, spotlightTips, showSpotlight, dismissSpotlight, dismissAllSpotlights } = useOnboardingStore();
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [updateTrigger, setUpdateTrigger] = useState(0);

  const activeTip = spotlightTips.find(t => t.id === activeSpotlightId);
  const activeTipIndex = spotlightTips.findIndex(t => t.id === activeSpotlightId);
  const pendingTips = spotlightTips.filter(t => !t.dismissed);
  const currentPendingIdx = pendingTips.findIndex(t => t.id === activeSpotlightId);
  const hasNext = currentPendingIdx < pendingTips.length - 1;

  // Close help panel when spotlight activates
  useEffect(() => {
    if (activeSpotlightId) {
      useOnboardingStore.getState().setHelpOpen(false);
    }
  }, [activeSpotlightId]);

  // Measure target element with fallback support and polling timeout
  useEffect(() => {
    if (!activeTip) {
      setTargetRect(null);
      return;
    }

    const allTargetIds = [activeTip.targetId, ...(activeTip.fallbackTargetIds || [])];

    const measure = () => {
      // Try all target IDs, pick the first visible one
      for (const id of allTargetIds) {
        const el = document.getElementById(id);
        if (el) {
          const rect = el.getBoundingClientRect();
          // Skip hidden elements (zero-width or zero-height in flow)
          if (rect.width > 0 && rect.height > 0) {
            setTargetRect(rect);
            return true;
          }
        }
      }
      return false;
    };

    if (measure()) {
      // Re-measure on resize
      const onResize = () => measure();
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    }

    // Element not found yet — poll with timeout (max 20 attempts = 6s)
    let attempts = 0;
    const MAX_ATTEMPTS = 20;
    const poll = setInterval(() => {
      attempts++;
      if (measure() || attempts >= MAX_ATTEMPTS) {
        clearInterval(poll);
        if (attempts >= MAX_ATTEMPTS) {
          // Target not found after timeout — dismiss spotlight silently
          const { dismissSpotlight } = useOnboardingStore.getState();
          dismissSpotlight(activeTip.id);
        }
      }
    }, 300);
    return () => clearInterval(poll);
  }, [activeTip, updateTrigger]);

  const handleNext = useCallback(() => {
    if (!hasNext) {
      dismissSpotlight(activeSpotlightId!);
      return;
    }
    const nextTip = pendingTips[currentPendingIdx + 1];
    if (nextTip) showSpotlight(nextTip.id);
    setUpdateTrigger(p => p + 1);
  }, [hasNext, pendingTips, currentPendingIdx, activeSpotlightId, showSpotlight, dismissSpotlight]);

  if (!activeTip || !targetRect) return null;

  return (
    <>
      {/* Scrim (semi-transparent overlay) */}
      <AnimatePresence>
        <motion.div
          className="fixed inset-0 z-[150] pointer-events-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="absolute inset-0 bg-black/40" onClick={dismissAllSpotlights} />
          <SpotlightTooltip
            tip={activeTip}
            targetRect={targetRect}
            onDismiss={() => dismissSpotlight(activeTip.id)}
            onNext={handleNext}
            onNextAvailable={hasNext}
          />
        </motion.div>
      </AnimatePresence>
    </>
  );
}
