'use client';
import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquarePlus, X, Star, Send, CheckCircle2, Loader } from 'lucide-react';
import { submitFeedback, FEEDBACK_CATEGORIES, type FeedbackCategory } from '@/lib/feedback-service';
import { isFlagEnabled } from '@/lib/feature-flags';
import { useUIStore } from '@/stores/ui-store';
import { trackEvent } from '@/lib/telemetry-service';
import { toast } from 'sonner';
import { useMotionPreference } from '@/hooks/useMotionPreference';

/* ─── Star Rating ─── */
function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          onClick={() => onChange(star)}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          className="cursor-pointer bg-transparent border-none p-0.5 transition-transform hover:scale-110 active:scale-95"
        >
          <Star
            size={24}
            className={`transition-colors ${
              star <= (hovered || value)
                ? 'fill-amber-400 text-amber-400'
                : 'fill-transparent text-[var(--muted-foreground)]/30'
            }`}
         aria-hidden="true"
          />
        </button>
      ))}
    </div>
  );
}

/* ─── Feedback Widget ─── */
export default function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [category, setCategory] = useState<FeedbackCategory>('other');
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const reduced = useMotionPreference();
  const instant = { duration: 0 };

  const currentScreen = useUIStore(s => s.currentScreen);

  // Don't render if feedback_widget flag is disabled
  if (!isFlagEnabled('feedback_widget')) return null;

  const handleSubmit = useCallback(async () => {
    if (!text.trim() && rating === 0) {
      toast.error('Por favor escribe un comentario o da una calificación');
      return;
    }
    setSubmitting(true);
    try {
      await submitFeedback({
        category,
        rating,
        text: text.trim(),
        screen: currentScreen || undefined,
      });
      trackEvent({ event: 'feedback_submitted', screen: currentScreen, metadata: { category, rating } });
      setSent(true);
      toast.success('Gracias por tu feedback');
    } catch {
      toast.error('Error al enviar feedback');
    } finally {
      setSubmitting(false);
    }
  }, [text, rating, category, currentScreen]);

  const handleReset = () => {
    setRating(0);
    setCategory('other');
    setText('');
    setSent(false);
    setOpen(false);
  };

  return (
    <>
      {/* Floating trigger button */}
      {!open && !sent && (
        <motion.button
          onClick={() => setOpen(true)}
          className="fixed bottom-20 left-4 md:bottom-6 md:left-6 z-[60] w-12 h-12 rounded-full bg-[var(--card)] border border-[var(--border)] shadow-lg flex items-center justify-center cursor-pointer hover:shadow-xl hover:border-[var(--af-accent)]/30 transition-all"
          initial={reduced ? false : { scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={reduced ? instant : { delay: 3, type: 'spring', stiffness: 200, damping: 15 }}
          whileHover={reduced ? undefined : { scale: 1.08 }}
          whileTap={reduced ? undefined : { scale: 0.95 }}
          title="Enviar feedback"
        >
          <MessageSquarePlus size={20} className="stroke-[var(--af-accent)]" aria-hidden="true"/>
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--af-accent)] text-[9px] font-bold text-background flex items-center justify-center">
            BETA
          </span>
        </motion.button>
      )}

      {/* Feedback Panel */}
      <AnimatePresence>
        {open && !sent && (
          <motion.div
            className="fixed inset-0 z-[80] flex items-end md:items-end justify-start"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0" onClick={() => setOpen(false)} />

            <motion.div
              className="relative z-10 w-full md:w-96 md:ml-6 md:mb-6 bg-[var(--card)] border border-[var(--border)] md:rounded-2xl rounded-t-3xl shadow-2xl"
              initial={reduced ? false : { y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={reduced ? { opacity: 0 } : { y: 100, opacity: 0 }}
              transition={reduced ? instant : { duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              {/* Mobile drag handle */}
              <div className="flex justify-center pt-3 pb-1 md:hidden">
                <div className="w-10 h-1.5 rounded-full bg-[var(--muted-foreground)]/30" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-5 pb-3 border-b border-[var(--border)]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-[var(--af-accent)]/15 flex items-center justify-center">
                    <MessageSquarePlus size={16} className="stroke-[var(--af-accent)]" aria-hidden="true"/>
                  </div>
                  <div>
                    <h3 className="text-base font-bold">Feedback Beta</h3>
                    <p className="text-[11px] text-[var(--muted-foreground)]">Ayudanos a mejorar Archii</p>
                  </div>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--af-bg3)] transition-all cursor-pointer border-none bg-transparent"
                >
                  <X size={18} aria-hidden="true"/>
                </button>
              </div>

              {/* Content */}
              <div className="p-5 space-y-5 safe-bottom">
                {/* Category pills */}
                <div>
                  <div className="text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-2">Tipo</div>
                  <div className="flex flex-wrap gap-1.5">
                    {FEEDBACK_CATEGORIES.map(cat => (
                      <button
                        key={cat.value}
                        onClick={() => setCategory(cat.value)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium cursor-pointer transition-all border ${
                          category === cat.value
                            ? 'bg-[var(--af-accent)]/15 border-[var(--af-accent)]/30 text-[var(--af-accent)]'
                            : 'bg-[var(--af-bg3)] border-transparent text-[var(--muted-foreground)] hover:bg-[var(--af-bg4)]'
                        }`}
                      >
                        <span>{cat.icon}</span>
                        <span>{cat.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Star rating */}
                <div>
                  <div className="text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-2">Calificacion general</div>
                  <StarRating value={rating} onChange={setRating} />
                </div>

                {/* Text */}
                <div>
                  <textarea
                    value={text}
                    onChange={e => setText(e.target.value)}
                    placeholder="Describe tu experiencia, sugerencia o el problema que encontraste..."
                    rows={4}
                    className="w-full px-4 py-3 rounded-xl bg-[var(--af-bg3)] border border-[var(--border)] text-[var(--foreground)] text-[13px] resize-none focus:outline-none focus:border-[var(--af-accent)]/40 focus:ring-1 focus:ring-[var(--af-accent)]/20 transition-all placeholder:text-[var(--muted-foreground)]"
                  />
                </div>

                {/* Beta badge info */}
                <div className="flex items-center gap-2 p-3 rounded-xl bg-[var(--af-accent)]/5 border border-[var(--af-accent)]/10">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[var(--af-accent)]/15 text-[var(--af-accent)]">BETA</span>
                  <p className="text-[11px] text-[var(--muted-foreground)]">
                    Tu feedback es anonimo y se usa para mejorar Archii. No se recopilan datos personales.
                  </p>
                </div>

                {/* Submit */}
                <button
                  onClick={handleSubmit}
                  disabled={submitting || (!text.trim() && rating === 0)}
                  className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl bg-gradient-to-r from-[var(--af-accent)] to-[var(--af-accent2)] text-background text-[14px] font-semibold cursor-pointer hover:shadow-lg hover:shadow-[var(--af-accent)]/20 transition-all active:scale-[0.97] border-none disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <Loader size={16} className="animate-spin" aria-hidden="true"/>
                  ) : (
                    <Send size={16} aria-hidden="true"/>
                  )}
                  {submitting ? 'Enviando...' : 'Enviar feedback'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success state */}
      <AnimatePresence>
        {sent && (
          <motion.div
            className="fixed bottom-20 left-4 md:bottom-6 md:left-6 z-[60] w-64 bg-[var(--card)] border border-[var(--af-accent)]/20 rounded-2xl p-4 shadow-2xl"
            initial={reduced ? false : { scale: 0.8, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { scale: 0.8, opacity: 0 }}
            transition={reduced ? instant : { type: 'spring', stiffness: 200, damping: 15 }}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-full bg-[var(--af-green)]/15 flex items-center justify-center">
                <CheckCircle2 size={18} className="stroke-[var(--af-green)]" aria-hidden="true"/>
              </div>
              <div className="text-[13px] font-semibold">Gracias!</div>
            </div>
            <p className="text-[11px] text-[var(--muted-foreground)] mb-3">
              Tu feedback nos ayuda a hacer Archii mejor para todos.
            </p>
            <button
              onClick={handleReset}
              className="text-[11px] text-[var(--af-accent)] font-medium cursor-pointer bg-transparent border-none hover:underline"
            >
              Enviar otro feedback
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
