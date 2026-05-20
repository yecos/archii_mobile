'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import AIChatPanel from './AIChatPanel';
import QuickActions from './QuickActions';
import { useUIStore } from '@/stores/ui-store';
import { Plus, Zap } from 'lucide-react';

export default function AIFloatingWrapper() {
  const [chatOpen, setChatOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [tooltip, setTooltip] = useState(true);
  const currentScreen = useUIStore((s) => s.currentScreen);

  const hideFABs = currentScreen === 'chat';

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setTooltip(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  const handleChatOpen = (prefillText?: string) => {
    setChatOpen(true);
    setQuickOpen(false);
    setTooltip(false);
  };

  const handleQuickToggle = () => {
    setQuickOpen((prev) => !prev);
    setTooltip(false);
  };

  if (!isVisible) return null;

  return (
    <>
      {/* Chat Panel */}
      <AIChatPanel
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
      />

      {/* Quick Actions */}
      <QuickActions
        isOpen={quickOpen}
        onClose={() => setQuickOpen(false)}
        onOpenChat={handleChatOpen}
      />

      {/* Floating Buttons */}
      {!hideFABs && (
      <div className="fixed bottom-20 md:bottom-20 right-4 md:right-6 z-[90] flex flex-col items-end gap-3">
        {/* Tooltip */}
        {tooltip && !chatOpen && !quickOpen && (
          <div className="animate-slideUp mb-1 px-3 py-2 rounded-xl bg-[var(--af-bg3)] border border-[var(--af-bg4)] shadow-lg text-xs text-foreground max-w-[220px]">
            <div className="flex items-center gap-2">
              <span className="text-sm">⚡</span>
              <span className="font-medium">Super IA</span>
            </div>
            <p className="text-muted-foreground mt-0.5 text-[11px]">Puedo crear tareas, registrar gastos y gestionar tu proyecto</p>
            <div className="absolute -bottom-1 right-6 w-2 h-2 bg-[var(--af-bg3)] border-r border-b border-[var(--af-bg4)] rotate-45" />
          </div>
        )}

        {/* Quick Actions Button (+) */}
        <button
          onClick={handleQuickToggle}
          className={cn(
            'w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 shadow-lg',
            quickOpen
              ? 'bg-[var(--af-bg3)] text-foreground rotate-45 border border-[var(--af-bg4)]'
              : 'bg-[var(--af-bg3)] text-foreground border border-[var(--af-bg4)] hover:border-[var(--af-accent)]/30'
          )}
          title="Acciones rápidas"
        >
          <Plus size={20} aria-hidden="true"/>
        </button>

        {/* Main AI Chat Button (golden gradient) */}
        <button
          id="onboarding-ai-trigger"
          onClick={() => handleChatOpen()}
          className={cn(
            'w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300',
            'shadow-xl shadow-[var(--af-accent)]/25 hover:shadow-2xl hover:shadow-[var(--af-accent)]/35',
            'bg-gradient-to-br from-[var(--af-accent)] to-amber-600 text-black hover:scale-105 active:scale-95',
            chatOpen && 'scale-90 opacity-0 pointer-events-none'
          )}
          title="Abrir Super IA"
        >
          <Zap size={24} aria-hidden="true"/>
        </button>
      </div>
      )}
    </>
  );
}
