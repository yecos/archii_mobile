'use client';
import { isFlagEnabled } from '@/lib/feature-flags';
import { Sparkles } from 'lucide-react';

/**
 * BetaBadge — indicador visual de que la app está en beta.
 * Se muestra en el TopBar o lugar visible.
 */
export function BetaBadge() {
  if (!isFlagEnabled('beta_mode')) return null;

  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-[var(--af-accent)] to-amber-500 text-background shadow-sm">
      <Sparkles size={8} aria-hidden="true"/>
      BETA
    </span>
  );
}
