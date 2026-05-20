'use client';

import { useEffect } from 'react';
import { useUIStore } from '@/stores/ui-store';
import { useOnboardingStore } from '@/stores/onboarding-store';

interface KeyboardShortcutsConfig {
  enabled?: boolean;
}

export function useKeyboardShortcuts(config: KeyboardShortcutsConfig = {}) {
  const { enabled = true } = config;

  const {
    toggleAIChat,
    toggleQuickActions,
    toggleSidebar,
    toggleCommand,
    setTheme,
    theme,
  } = useUIStore();

  const toggleHelp = useOnboardingStore(s => s.toggleHelp);

  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      // Ignorar si el usuario está escribiendo en un input/textarea
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      // Cmd/Ctrl + K → Command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggleCommand();
        return;
      }

      // Ignorar el resto de atajos si estamos en un input
      if (isInput) return;

      // Escape → Cerrar paneles
      if (e.key === 'Escape') {
        return; // Ya manejado por el componente correspondiente
      }

      // ? → Abrir panel de ayuda
      if (e.key === '?') {
        e.preventDefault();
        toggleHelp();
        return;
      }

      // Alt + A → Abrir chat IA
      if (e.altKey && e.key === 'a') {
        e.preventDefault();
        toggleAIChat();
        return;
      }

      // Alt + Q → Acciones rápidas
      if (e.altKey && e.key === 'q') {
        e.preventDefault();
        toggleQuickActions();
        return;
      }

      // Alt + S → Toggle sidebar
      if (e.altKey && e.key === 's') {
        e.preventDefault();
        toggleSidebar();
        return;
      }

      // Alt + T → Toggle tema
      if (e.altKey && e.key === 't') {
        e.preventDefault();
        setTheme(theme === 'dark' ? 'light' : 'dark');
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    enabled,
    toggleAIChat,
    toggleQuickActions,
    toggleSidebar,
    toggleCommand,
    toggleHelp,
    setTheme,
    theme,
  ]);
}
