'use client';
import React from 'react';
import { CheckSquare, FileText, Download, X } from 'lucide-react';

export interface ProjectBatchActionBarProps {
  selectedCount: number;
  onClear: () => void;
  onExportPDF: () => void;
  onExportCSV: () => void;
  onStatusChange: (status: string) => void;
}

export default function ProjectBatchActionBar({
  selectedCount,
  onClear,
  onExportPDF,
  onExportCSV,
  onStatusChange,
}: ProjectBatchActionBarProps) {
  return (
    <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 animate-slideUp">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl px-5 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <CheckSquare size={16} className="text-[var(--af-accent)]" aria-hidden="true"/>
          <span className="text-[13px] font-semibold">{selectedCount} seleccionados</span>
        </div>
        <div className="w-px h-6 bg-[var(--border)]" />
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium cursor-pointer bg-[var(--af-bg3)] hover:bg-[var(--af-bg4)] transition-colors" onClick={onExportPDF}>
            <FileText size={13} aria-hidden="true"/> PDF
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium cursor-pointer bg-[var(--af-bg3)] hover:bg-[var(--af-bg4)] transition-colors" onClick={onExportCSV}>
            <Download size={13} aria-hidden="true"/> CSV
          </button>
          <select
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium cursor-pointer bg-[var(--af-bg3)] hover:bg-[var(--af-bg4)] transition-colors border-none outline-none text-[var(--foreground)]"
            defaultValue=""
            onChange={e => { if (e.target.value) { onStatusChange(e.target.value); e.target.value = ''; } }}
          >
            <option value="" disabled>Cambiar estado...</option>
            <option value="Concepto">Concepto</option>
            <option value="Diseno">Diseño</option>
            <option value="Ejecucion">Ejecución</option>
            <option value="Terminado">Terminado</option>
          </select>
        </div>
        <button aria-label="Descartar selección" className="flex items-center justify-center w-7 h-7 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer" onClick={onClear}>
          <X size={14} aria-hidden="true"/>
        </button>
      </div>
    </div>
  );
}
