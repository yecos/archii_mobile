'use client';

import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

export default function KeyboardShortcutsInitializer() {
  useKeyboardShortcuts();
  return null;
}
