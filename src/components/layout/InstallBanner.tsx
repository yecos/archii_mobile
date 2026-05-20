'use client';
import React from 'react';
import { useApp } from '@/contexts/AppContext';
import { Home as HomeIcon, X } from 'lucide-react';

export default function InstallBanner() {
  const { showInstallBanner, installPrompt, isStandalone, handleInstall, dismissInstallBanner } = useApp();

  if (!showInstallBanner || !installPrompt || isStandalone) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[200] p-3 sm:p-4 animate-slideIn" style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)' }}>
      <div className="max-w-lg mx-auto bg-[var(--card)] border border-[var(--af-accent)]/30 rounded-2xl p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 bg-[var(--af-accent)] rounded-xl flex items-center justify-center flex-shrink-0">
            <HomeIcon size={24} className="stroke-background" aria-hidden="true"/>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold">Instalar Archii</div>
            <div className="text-[12.5px] text-[var(--muted-foreground)] mt-0.5">Accede más rápido desde tu pantalla de inicio o escritorio</div>
            <div className="flex gap-2 mt-3">
              <button className="flex-1 bg-[var(--af-accent)] text-background px-4 py-2 rounded-lg text-[13px] font-semibold cursor-pointer border-none hover:bg-[var(--af-accent2)] transition-colors" onClick={handleInstall}>
                Instalar app
              </button>
              <button className="px-4 py-2 rounded-lg text-[13px] font-medium cursor-pointer bg-[var(--af-bg3)] text-[var(--muted-foreground)] border border-[var(--border)] hover:bg-[var(--af-bg4)] transition-colors" onClick={dismissInstallBanner}>
                Ahora no
              </button>
            </div>
          </div>
          <button aria-label="Cerrar" className="w-9 h-9 flex items-center justify-center text-[var(--af-text3)] cursor-pointer hover:text-[var(--foreground)] flex-shrink-0" onClick={dismissInstallBanner}>
            <X size={16} className="stroke-current" aria-hidden="true"/>
          </button>
        </div>
      </div>
    </div>
  );
}
