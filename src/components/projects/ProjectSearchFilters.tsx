'use client';
import React from 'react';
import { Search, Filter } from 'lucide-react';

export interface ProjectSearchFiltersProps {
  search: string;
  setSearch: (v: string) => void;
  showFilters: boolean;
  setShowFilters: (v: boolean) => void;
  filterType: string;
  setFilterType: (v: string) => void;
  filterBudgetMin: string;
  setFilterBudgetMin: (v: string) => void;
  filterBudgetMax: string;
  setFilterBudgetMax: (v: string) => void;
  filterDateFrom: string;
  setFilterDateFrom: (v: string) => void;
  filterDateTo: string;
  setFilterDateTo: (v: string) => void;
  hasActiveFilters: string | false;
  clearFilters: () => void;
}

export default function ProjectSearchFilters({
  search,
  setSearch,
  showFilters,
  setShowFilters,
  filterType,
  setFilterType,
  filterBudgetMin,
  setFilterBudgetMin,
  filterBudgetMax,
  setFilterBudgetMax,
  filterDateFrom,
  setFilterDateFrom,
  filterDateTo,
  setFilterDateTo,
  hasActiveFilters,
  clearFilters,
}: ProjectSearchFiltersProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" aria-hidden="true"/>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, cliente, ubicación..."
            className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg pl-9 pr-3 py-2 text-[13px] text-[var(--foreground)] outline-none focus:border-[var(--af-accent)] transition-colors"
          />
        </div>
        <button
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium cursor-pointer border transition-colors ${showFilters || hasActiveFilters ? 'bg-[var(--af-accent)]/10 text-[var(--af-accent)] border-[var(--af-accent)]/30' : 'bg-[var(--card)] text-[var(--foreground)] border-[var(--border)] hover:bg-[var(--af-bg3)]'}`}
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter size={14} aria-hidden="true"/>
          Filtros
          {hasActiveFilters && <span className="w-1.5 h-1.5 rounded-full bg-[var(--af-accent)]" />}
        </button>
      </div>

      {showFilters && (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 animate-fadeIn">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] text-[var(--muted-foreground)] mb-1 block">Tipo de proyecto</label>
              <select value={filterType} onChange={e => setFilterType(e.target.value)} className="w-full bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-[12px] text-[var(--foreground)] outline-none cursor-pointer">
                <option value="">Todos los tipos</option>
                <option value="Diseño">Diseño</option>
                <option value="Ejecución">Ejecución</option>
                <option value="Ambos">Ambos</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-[var(--muted-foreground)] mb-1 block">Presupuesto mínimo (COP)</label>
              <input type="number" value={filterBudgetMin} onChange={e => setFilterBudgetMin(e.target.value)} placeholder="Ej: 10000000" className="w-full bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-[12px] text-[var(--foreground)] outline-none cursor-pointer" />
            </div>
            <div>
              <label className="text-[10px] text-[var(--muted-foreground)] mb-1 block">Presupuesto máximo (COP)</label>
              <input type="number" value={filterBudgetMax} onChange={e => setFilterBudgetMax(e.target.value)} placeholder="Ej: 500000000" className="w-full bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-[12px] text-[var(--foreground)] outline-none cursor-pointer" />
            </div>
            <div>
              <label className="text-[10px] text-[var(--muted-foreground)] mb-1 block">Fecha inicio</label>
              <div className="flex gap-2">
                <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="flex-1 bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-[12px] text-[var(--foreground)] outline-none cursor-pointer" />
                <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="flex-1 bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-[12px] text-[var(--foreground)] outline-none cursor-pointer" />
              </div>
            </div>
          </div>
          {hasActiveFilters && (
            <button className="mt-3 text-[11px] text-[var(--af-accent)] cursor-pointer hover:underline" onClick={clearFilters}>Limpiar filtros</button>
          )}
        </div>
      )}
    </div>
  );
}
