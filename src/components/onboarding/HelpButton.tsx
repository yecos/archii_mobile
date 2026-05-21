'use client';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMotionPreference } from '@/hooks/useMotionPreference';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { useUIStore } from '@/stores/ui-store';
import { useApp } from '@/contexts/AppContext';
import { toast } from 'sonner';
import {
  CircleHelp, X, Play, BookOpen, MessageCircle, Keyboard,
  ChevronRight, Lightbulb, Sparkles, Undo2, ExternalLink,
  LayoutDashboard, Folder, ClipboardCheck, Bot, Users, FileText,
} from 'lucide-react';

/* ─── Help data ─── */
const HELP_SECTIONS = [
  {
    title: 'Primeros pasos',
    items: [
      { icon: Play, label: 'Repetir tour de onboarding', action: 'restart-wizard' as const },
      { icon: Lightbulb, label: 'Ver tips contextuales', action: 'show-spotlight' as const },
      { icon: Undo2, label: 'Reiniciar onboarding', action: 'reset-onboarding' as const },
    ],
  },
  {
    title: 'Guia rapida',
    items: [
      { icon: LayoutDashboard, label: 'Dashboard', desc: 'Vista general de tus proyectos', screen: 'dashboard' },
      { icon: Folder, label: 'Proyectos', desc: 'Gestion de obras y proyectos', screen: 'projects' },
      { icon: ClipboardCheck, label: 'Tareas', desc: 'Seguimiento y asignacion de tareas', screen: 'tasks' },
      { icon: MessageCircle, label: 'Chat', desc: 'Comunicacion con tu equipo', screen: 'chat' },
      { icon: FileText, label: 'Archivos', desc: 'Planos, documentos y galeria', screen: 'files' },
      { icon: Bot, label: 'Asistente IA', desc: 'Preguntale cualquier cosa', action: 'open-ai-chat' as const },
      { icon: Users, label: 'Equipo', desc: 'Gestion de miembros y roles', screen: 'team' },
    ],
  },
];

const SHORTCUTS = [
  { keys: ['Ctrl', 'K'], action: 'Buscar (Command palette)' },
  { keys: ['Alt', 'A'], action: 'Abrir chat IA' },
  { keys: ['Alt', 'Q'], action: 'Acciones rápidas' },
  { keys: ['Alt', 'S'], action: 'Toggle sidebar' },
  { keys: ['Alt', 'T'], action: 'Toggle tema' },
  { keys: ['?'], action: 'Centro de ayuda' },
];

/* ─── Help Button (floating) ─── */
export function HelpButton() {
  const { helpOpen, toggleHelp } = useOnboardingStore();
  const [showPulse, setShowPulse] = useState(false);
  const reduced = useMotionPreference();
  const instant = { duration: 0 };

  // Show pulse animation once when help hasn't been opened yet
  useEffect(() => {
    const timer = setTimeout(() => setShowPulse(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <motion.button
        onClick={toggleHelp}
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-[60] w-12 h-12 rounded-full bg-gradient-to-br from-[var(--af-accent)] to-[var(--af-accent2)] text-background shadow-lg shadow-[var(--af-accent)]/20 flex items-center justify-center cursor-pointer border-none hover:shadow-xl hover:shadow-[var(--af-accent)]/30 transition-shadow"
        initial={reduced ? false : { scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={reduced ? instant : { delay: 1.5, type: 'spring', stiffness: 200, damping: 15 }}
        whileHover={reduced ? undefined : { scale: 1.08 }}
        whileTap={reduced ? undefined : { scale: 0.95 }}
        aria-label="Ayuda"
        title="Ayuda"
      >
        <CircleHelp size={22} strokeWidth={2.5} aria-hidden="true"/>

        {/* Pulse ring */}
        {showPulse && !helpOpen && (
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-[var(--af-accent)]"
            initial={reduced ? false : undefined}
            animate={reduced ? { opacity: 0 } : { scale: [1, 1.5], opacity: [0.6, 0] }}
            transition={reduced ? instant : { duration: 2, repeat: 1 }}
            onAnimationComplete={() => setShowPulse(false)}
          />
        )}
      </motion.button>

      <HelpPanel />
    </>
  );
}

/* ─── Help Panel ─── */
function HelpPanel() {
  const { helpOpen, setHelpOpen, startWizard, showSpotlight, resetWizard, spotlightTips } = useOnboardingStore();
  const reduced = useMotionPreference();
  const instant = { duration: 0 };
  const { toggleAIChat } = useUIStore();
  const { navigateTo } = useApp();
  const [activeTab, setActiveTab] = useState<'guide' | 'shortcuts'>('guide');

  // Close on Escape (? is handled globally by useKeyboardShortcuts → toggleHelp)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && helpOpen) setHelpOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [helpOpen, setHelpOpen]);

  const handleAction = (action: string) => {
    switch (action) {
      case 'restart-wizard':
        setHelpOpen(false);
        setTimeout(() => startWizard(), 300);
        break;
      case 'show-spotlight': {
        const firstPending = spotlightTips.find(t => !t.dismissed);
        if (firstPending) {
          showSpotlight(firstPending.id);
        } else {
          toast.info('Ya has visto todos los tips contextuales. Puedes reiniciarlos desde la opcion de abajo.');
        }
        setHelpOpen(false);
        break;
      }
      case 'reset-onboarding':
        resetWizard();
        setHelpOpen(false);
        toast.success('Onboarding reiniciado correctamente');
        break;
      case 'open-ai-chat':
        setHelpOpen(false);
        setTimeout(() => toggleAIChat(), 200);
        break;
      default:
        // Navigate to screen (from Guia rapida items)
        if (action.startsWith('nav:')) {
          const targetScreen = action.replace('nav:', '');
          setHelpOpen(false);
          setTimeout(() => navigateTo(targetScreen), 200);
        }
        break;
    }
  };

  if (!helpOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[80] flex items-end md:items-center justify-end"
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={reduced ? { opacity: 0 } : { opacity: 0 }}
        transition={reduced ? instant : { duration: 0.2 }}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setHelpOpen(false)} />

        {/* Panel */}
        <motion.div
          className="relative z-10 w-full md:w-96 md:mr-4 md:mb-0 bg-[var(--card)] border border-[var(--border)] md:rounded-2xl rounded-t-3xl shadow-2xl max-h-[80vh] flex flex-col"
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
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[var(--af-accent)]/15 to-[var(--af-accent2)]/8 flex items-center justify-center">
                <BookOpen size={16} className="stroke-[var(--af-accent)]" aria-hidden="true"/>
              </div>
              <div>
                <h3 className="text-base font-bold">Centro de Ayuda</h3>
                <p className="text-[11px] text-[var(--muted-foreground)]">Todo lo que necesitas saber</p>
              </div>
            </div>
            <button
              aria-label="Cerrar"
              onClick={() => setHelpOpen(false)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--af-bg3)] transition-all cursor-pointer border-none bg-transparent"
            >
              <X size={18} aria-hidden="true"/>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 px-4 py-2 border-b border-[var(--border)]">
            <button
              onClick={() => setActiveTab('guide')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[13px] font-medium cursor-pointer transition-all ${
                activeTab === 'guide'
                  ? 'bg-[var(--af-accent)] text-background'
                  : 'text-[var(--muted-foreground)] hover:bg-[var(--af-bg3)]'
              }`}
            >
              <BookOpen size={14} aria-hidden="true"/>
              Guia
            </button>
            <button
              onClick={() => setActiveTab('shortcuts')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[13px] font-medium cursor-pointer transition-all ${
                activeTab === 'shortcuts'
                  ? 'bg-[var(--af-accent)] text-background'
                  : 'text-[var(--muted-foreground)] hover:bg-[var(--af-bg3)]'
              }`}
            >
              <Keyboard size={14} aria-hidden="true"/>
              Atajos
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-6 safe-bottom">
            {activeTab === 'guide' ? (
              <>
                {HELP_SECTIONS.map(section => (
                  <div key={section.title}>
                    <div className="text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-2">
                      {section.title}
                    </div>
                    <div className="space-y-1">
                      {section.items.map((item, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            if ('action' in item && item.action) handleAction(item.action);
                            else if ('screen' in item && item.screen) handleAction('nav:' + item.screen);
                          }}
                          className="w-full flex items-center gap-3 p-3 rounded-xl bg-[var(--af-bg3)] hover:bg-[var(--af-bg4)] cursor-pointer transition-all active:scale-[0.98] text-left border-none"
                        >
                          <div className="w-8 h-8 rounded-lg bg-[var(--af-accent)]/10 flex items-center justify-center flex-shrink-0">
                            <item.icon size={14} className="stroke-[var(--af-accent)]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-medium">{item.label}</div>
                            {'desc' in item && (
                              <div className="text-[11px] text-[var(--muted-foreground)]">{(item as any).desc}</div>
                            )}
                          </div>
                          <ChevronRight size={14} className="text-[var(--muted-foreground)] flex-shrink-0" aria-hidden="true"/>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Tip */}
                <div className="p-3 rounded-xl bg-[var(--af-accent)]/5 border border-[var(--af-accent)]/15">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Sparkles size={14} className="stroke-[var(--af-accent)]" aria-hidden="true"/>
                    <span className="text-[12px] font-semibold text-[var(--af-accent)]">Tip</span>
                  </div>
                  <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">
                    Presiona <kbd className="px-1.5 py-0.5 rounded bg-[var(--af-bg4)] text-[10px] font-mono border border-[var(--border)]">?</kbd> en cualquier momento para abrir esta ventana de ayuda.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-3">
                  Atajos de teclado
                </div>
                <div className="space-y-1.5">
                  {SHORTCUTS.map((s, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3 rounded-xl bg-[var(--af-bg3)]"
                    >
                      <span className="text-[13px] text-[var(--foreground)]">{s.action}</span>
                      <div className="flex items-center gap-1">
                        {s.keys.map((key, ki) => (
                          <React.Fragment key={ki}>
                            <kbd className="px-2 py-1 rounded-md bg-[var(--af-bg4)] text-[11px] font-mono text-[var(--foreground)] border border-[var(--border)] shadow-sm">
                              {key}
                            </kbd>
                            {ki < s.keys.length - 1 && (
                              <span className="text-[10px] text-[var(--muted-foreground)]">+</span>
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
