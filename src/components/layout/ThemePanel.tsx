'use client';
import React from 'react';
import { useUIStore } from '@/stores/ui-store';
import { THEME_REGISTRY, getThemeGroups } from '@/lib/theme-registry';
import type { ThemeDefinition } from '@/lib/theme-registry';
import { Check } from 'lucide-react';

interface ThemePanelProps {
  onClose: () => void;
}

export default function ThemePanel({ onClose }: ThemePanelProps) {
  const theme = useUIStore(s => s.theme);
  const setTheme = useUIStore(s => s.setTheme);
  const groups = getThemeGroups();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-[var(--card)] border border-[var(--border)] rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col shadow-2xl animate-scaleIn"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
          <div>
            <h2 className="text-lg font-bold text-[var(--foreground)]">Temas</h2>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">Personaliza la apariencia de Archii</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--af-bg3)] transition-all cursor-pointer border-none bg-transparent"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">

          {/* Light Themes */}
          <div>
            <h3 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-3">Modo Claro</h3>
            <div className="grid grid-cols-1 gap-2">
              {groups.light.map(t => (
                <ThemeCard
                  key={t.id}
                  themeDef={t}
                  isActive={theme === t.id}
                  onSelect={() => { setTheme(t.id); onClose(); }}
                />
              ))}
            </div>
          </div>

          {/* Dark Themes */}
          <div>
            <h3 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-3">Modo Oscuro</h3>
            <div className="grid grid-cols-1 gap-2">
              {groups.dark.map(t => (
                <ThemeCard
                  key={t.id}
                  themeDef={t}
                  isActive={theme === t.id}
                  onSelect={() => { setTheme(t.id); onClose(); }}
                />
              ))}
            </div>
          </div>

          {/* Info */}
          <div className="text-center pt-2">
            <p className="text-[10px] text-[var(--af-text3)]">
              Selecciona un tema para cambiar la apariencia inmediatamente. La preferencia se guarda automaticamente.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Individual theme card with color preview swatch */
function ThemeCard({ themeDef, isActive, onSelect }: {
  themeDef: ThemeDefinition;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-4 p-3 rounded-xl border transition-all cursor-pointer text-left ${
        isActive
          ? 'border-[var(--af-accent)] bg-[var(--accent)] shadow-sm'
          : 'border-[var(--border)] bg-[var(--af-bg3)] hover:bg-[var(--af-bg4)] hover:border-[var(--af-accent)]/30'
      }`}
    >
      {/* Color Preview Swatch */}
      <div className="flex gap-1 flex-shrink-0">
        {themeDef.preview.map((color, i) => (
          <div
            key={i}
            className={`rounded-md ${i === 0 ? 'w-8 h-8 rounded-l-lg' : i === themeDef.preview.length - 1 ? 'w-4 h-8 rounded-r-lg' : 'w-4 h-8'}`}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>

      {/* Theme Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm">{themeDef.icon}</span>
          <span className="text-[13px] font-semibold text-[var(--foreground)]">{themeDef.label}</span>
          {isActive && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--af-accent)]/15 text-[var(--af-accent)] border border-[var(--af-accent)]/30">
              ACTIVO
            </span>
          )}
        </div>
        <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5 truncate">{themeDef.description}</p>
      </div>

      {/* Check indicator */}
      {isActive && (
        <div className="w-6 h-6 rounded-full bg-[var(--af-accent)] flex items-center justify-center flex-shrink-0">
          <Check size={12} className="text-[var(--primary-foreground)]" aria-hidden="true"/>
        </div>
      )}
    </button>
  );
}
