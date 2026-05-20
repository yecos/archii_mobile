'use client';
import React from 'react';
import {
  FolderKanban, Download, FileText, Plus, LayoutGrid, GanttChart, CheckSquare,
} from 'lucide-react';

export interface ProjectHeaderProps {
  projectsCount: number;
  filteredCount: number;
  viewMode: 'cards' | 'timeline';
  setViewMode: (mode: 'cards' | 'timeline') => void;
  selectedIdsSize: number;
  clearSelection: () => void;
  setSelectedIds: (ids: Set<string>) => void;
  onExportPDF: () => void;
  onExportExcel: () => void;
  onExportCSV: () => void;
  handleNewProject: () => void;
}

export default function ProjectHeader({
  projectsCount,
  filteredCount,
  viewMode,
  setViewMode,
  selectedIdsSize,
  clearSelection,
  setSelectedIds,
  onExportPDF,
  onExportExcel,
  onExportCSV,
  handleNewProject,
}: ProjectHeaderProps) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FolderKanban size={20} className="text-[var(--af-accent)]" aria-hidden="true"/>
          Proyectos
        </h2>
        <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
          {projectsCount} proyectos{filteredCount !== projectsCount ? ` · ${filteredCount} filtrados` : ''}
        </p>
      </div>
      <div className="flex gap-2 flex-wrap">
        {/* View mode toggle */}
        <div className="flex bg-[var(--af-bg3)] rounded-lg p-0.5 border border-[var(--border)]">
          <button
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium cursor-pointer transition-all ${viewMode === 'cards' ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`}
            onClick={() => setViewMode('cards')}
          >
            <LayoutGrid size={13} aria-hidden="true"/> Tarjetas
          </button>
          <button
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium cursor-pointer transition-all ${viewMode === 'timeline' ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`}
            onClick={() => setViewMode('timeline')}
          >
            <GanttChart size={13} aria-hidden="true"/> Timeline
          </button>
        </div>

        {/* Batch toggle */}
        <button
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium cursor-pointer border transition-colors ${selectedIdsSize > 0 ? 'bg-[var(--af-accent)]/10 text-[var(--af-accent)] border-[var(--af-accent)]/30' : 'bg-[var(--af-bg3)] text-[var(--foreground)] border-[var(--border)] hover:bg-[var(--af-bg4)]'}`}
          onClick={() => { if (selectedIdsSize > 0) clearSelection(); else setSelectedIds(new Set()); }}
        >
          <CheckSquare size={14} aria-hidden="true"/>
          {selectedIdsSize > 0 ? `${selectedIdsSize}` : 'Seleccionar'}
        </button>

        {/* Exports */}
        <button
          className="flex items-center gap-1.5 bg-[var(--af-bg3)] text-[var(--foreground)] px-3 py-2 rounded-lg text-[13px] font-semibold cursor-pointer border border-[var(--border)] hover:bg-[var(--af-bg4)] transition-colors"
          onClick={onExportPDF}
        >
          <FileText size={14} aria-hidden="true"/> PDF
        </button>
        <button
          className="flex items-center gap-1.5 bg-[var(--af-bg3)] text-[var(--foreground)] px-3 py-2 rounded-lg text-[13px] font-semibold cursor-pointer border border-[var(--border)] hover:bg-[var(--af-bg4)] transition-colors"
          onClick={onExportExcel}
        >
          <Download size={14} aria-hidden="true"/> Excel
        </button>
        <button
          className="hidden sm:flex items-center gap-1.5 bg-[var(--af-bg3)] text-[var(--foreground)] px-3 py-2 rounded-lg text-[13px] font-semibold cursor-pointer border border-[var(--border)] hover:bg-[var(--af-bg4)] transition-colors"
          onClick={onExportCSV}
        >
          <Download size={14} aria-hidden="true"/> CSV
        </button>
        <button
          className="flex items-center gap-1.5 bg-[var(--af-accent)] text-background px-3.5 py-2 rounded-lg text-[13px] font-semibold cursor-pointer border-none hover:bg-[var(--af-accent2)] transition-colors"
          onClick={handleNewProject}
        >
          <Plus size={15} aria-hidden="true"/> Nuevo proyecto
        </button>
      </div>
    </div>
  );
}
