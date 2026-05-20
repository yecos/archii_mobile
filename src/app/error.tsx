'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Archii]', error);
  }, [error]);

  return (
    <div className="animate-fadeIn flex items-center justify-center min-h-screen p-6 bg-background font-[family-name:var(--font-dm-sans)]">
      <div className="flex flex-col items-center text-center max-w-[420px] w-full">
        {/* Logo */}
        <h1 className="font-[family-name:var(--font-dm-serif)] text-[1.75rem] text-[var(--af-accent)] mb-2 tracking-[-0.01em] leading-tight">
          Archii
        </h1>

        {/* Divider */}
        <div className="w-10 h-0.5 bg-border rounded mb-8" />

        {/* Warning Icon */}
        <div className="w-16 h-16 rounded-full bg-card border border-border flex items-center justify-center mb-6">
          <AlertTriangle size={32} className="stroke-[var(--af-accent)]" aria-hidden="true" />
        </div>

        {/* Heading */}
        <h2 className="text-xl font-semibold text-foreground mb-2 leading-tight">
          Algo salió mal
        </h2>

        {/* Description */}
        <p className="text-sm text-muted-foreground mb-2 leading-relaxed max-w-[320px]">
          Intenta recargar la página
        </p>

        {/* Error message */}
        {error.message && (
          <p className="text-[13px] text-[var(--af-red)] bg-card border border-border rounded-lg px-4 py-2.5 mb-6 max-w-full break-words font-mono leading-relaxed">
            {error.message}
          </p>
        )}

        {/* Retry Button */}
        <button
          onClick={reset}
          className="inline-flex items-center justify-center gap-2 px-7 py-3 text-sm font-medium text-white bg-[var(--af-accent)] rounded-lg cursor-pointer transition-all hover:bg-[var(--af-accent2)] hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(0,0,0,0.12)] active:scale-[0.97]"
        >
          <RefreshCw size={16} className="stroke-current" aria-hidden="true" />
          Reintentar
        </button>
      </div>
    </div>
  );
}
