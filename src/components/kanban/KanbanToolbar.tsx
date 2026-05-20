'use client';
import React, { useMemo, useCallback, useRef, useState } from 'react';
import { Search, Filter, LayoutGrid, List, X, ChevronDown } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import type { KanbanEntityType } from '@/lib/kanban-helpers';
import { ENTITY_LABELS } from '@/lib/kanban-helpers';

interface KanbanToolbarProps {
  onEntityTypeChange: (type: KanbanEntityType) => void;
  onFilterChange: (filters: Record<string, any>) => void;
  onNewBoard?: () => void;
  hasBoard: boolean;
  teamUsers: any[];
  projects: any[];
}

const ENTITY_OPTIONS: { value: KanbanEntityType; label: string }[] = [
  { value: 'tasks', label: 'Tareas' },
  { value: 'projects', label: 'Proyectos' },
  { value: 'approvals', label: 'Aprobaciones' },
  { value: 'invoices', label: 'Facturas' },
  { value: 'transfers', label: 'Transferencias' },
  { value: 'phases', label: 'Fases' },
  { value: 'incidents', label: 'Incidencias' },
];

const PRIORITY_OPTIONS = [
  { value: 'Alta', label: 'Alta' },
  { value: 'Media', label: 'Media' },
  { value: 'Baja', label: 'Baja' },
];

export default function KanbanToolbar({
  onEntityTypeChange,
  onFilterChange,
  onNewBoard,
  hasBoard,
  teamUsers,
  projects,
}: KanbanToolbarProps) {
  const entityType = useUIStore(s => s.kanbanEntityType);
  const setKanbanEntityType = useUIStore(s => s.setKanbanEntityType);
  const viewMode = useUIStore(s => s.kanbanViewMode);
  const setKanbanViewMode = useUIStore(s => s.setKanbanViewMode);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterAssignee, setFilterAssignee] = useState<string>('');
  const [filterPriority, setFilterPriority] = useState<string>('');
  const [filterProject, setFilterProject] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  const handleEntityTypeChange = useCallback((type: KanbanEntityType) => {
    setKanbanEntityType(type);
    onEntityTypeChange(type);
    // Reset filters on type change
    setSearchQuery('');
    setFilterAssignee('');
    setFilterPriority('');
    setFilterProject('');
    onFilterChange({ searchQuery: null, assigneeId: null, priority: null, projectIds: null });
  }, [setKanbanEntityType, onEntityTypeChange, onFilterChange]);

  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
    onFilterChange({ searchQuery: value || null });
  }, [onFilterChange]);

  const handleAssigneeFilter = useCallback((value: string) => {
    setFilterAssignee(value);
    onFilterChange({ assigneeId: value || null });
  }, [onFilterChange]);

  const handlePriorityFilter = useCallback((value: string) => {
    setFilterPriority(value);
    onFilterChange({ priority: value || null });
  }, [onFilterChange]);

  const handleProjectFilter = useCallback((value: string) => {
    setFilterProject(value);
    onFilterChange({ projectIds: value ? [value] : null });
  }, [onFilterChange]);

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setFilterAssignee('');
    setFilterPriority('');
    setFilterProject('');
    onFilterChange({ searchQuery: null, assigneeId: null, priority: null, projectIds: null });
  }, [onFilterChange]);

  const hasActiveFilters = filterAssignee || filterPriority || filterProject;

  return (
    <div className="flex flex-col gap-3">
      {/* Top row: entity type + view mode */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Entity type selector */}
        <div className="flex items-center bg-[var(--af-bg3)] border border-[var(--border)] rounded-xl p-1 gap-0.5 overflow-x-auto flex-shrink-0" style={{ scrollbarWidth: 'none' }}>
          {ENTITY_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => handleEntityTypeChange(opt.value)}
              className={`px-3 py-1.5 text-[12px] font-medium rounded-lg transition-all whitespace-nowrap cursor-pointer border-none ${
                entityType === opt.value
                  ? 'bg-[var(--af-accent)] text-background shadow-sm'
                  : 'bg-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--af-bg4)]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* View mode toggle */}
        <div className="flex items-center bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg p-0.5 ml-auto flex-shrink-0">
          <button
            aria-label="Vista tablero"
            onClick={() => setKanbanViewMode('board')}
            className={`p-1.5 rounded-md transition-all cursor-pointer border-none ${
              viewMode === 'board' ? 'bg-[var(--af-accent)]/15 text-[var(--af-accent)]' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
            title="Vista tablero"
          >
            <LayoutGrid size={16} aria-hidden="true"/>
          </button>
          <button
            aria-label="Vista lista"
            onClick={() => setKanbanViewMode('list')}
            className={`p-1.5 rounded-md transition-all cursor-pointer border-none ${
              viewMode === 'list' ? 'bg-[var(--af-accent)]/15 text-[var(--af-accent)]' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
            title="Vista lista"
          >
            <List size={16} aria-hidden="true"/>
          </button>
        </div>
      </div>

      {/* Second row: search + filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Search */}
        <div className="flex-1 min-w-[180px] flex items-center gap-2 bg-[var(--af-bg3)] border border-[var(--border)] rounded-xl px-3 py-2">
          <Search size={15} className="text-[var(--muted-foreground)] flex-shrink-0" aria-hidden="true"/>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Buscar tarjetas..."
            className="flex-1 bg-transparent text-[13px] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none"
          />
          {searchQuery && (
            <button aria-label="Limpiar búsqueda" onClick={() => handleSearch('')} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] bg-transparent border-none cursor-pointer p-0">
              <X size={14} aria-hidden="true"/>
            </button>
          )}
        </div>

        {/* Filter toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-medium border cursor-pointer transition-all ${
            showFilters || hasActiveFilters
              ? 'bg-[var(--af-accent)]/10 text-[var(--af-accent)] border-[var(--af-accent)]/30'
              : 'bg-[var(--af-bg3)] text-[var(--muted-foreground)] border-[var(--border)] hover:border-[var(--af-accent)]/30 hover:text-[var(--foreground)]'
          }`}
        >
          <Filter size={14} aria-hidden="true"/>
          <span>Filtros</span>
          {hasActiveFilters && (
            <span className="w-4 h-4 rounded-full bg-[var(--af-accent)] text-background text-[10px] flex items-center justify-center">
              {[filterAssignee, filterPriority, filterProject].filter(Boolean).length}
            </span>
          )}
          <ChevronDown size={12} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} aria-hidden="true"/>
        </button>

        {/* New Board button */}
        {!hasBoard && onNewBoard && (
          <button
            onClick={onNewBoard}
            className="px-4 py-2 bg-[var(--af-accent)] text-background rounded-xl text-[12px] font-semibold hover:bg-[var(--af-accent2)] transition-colors border-none cursor-pointer flex-shrink-0"
          >
            Crear tablero
          </button>
        )}
      </div>

      {/* Expanded filters */}
      {showFilters && (
        <div className="flex items-center gap-2 flex-wrap p-3 bg-[var(--af-bg3)] border border-[var(--border)] rounded-xl animate-in fade-in slide-in-from-top-1 duration-200">
          {/* Assignee filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-[var(--muted-foreground)] font-medium">Responsable:</span>
            <select
              value={filterAssignee}
              onChange={(e) => handleAssigneeFilter(e.target.value)}
              className="bg-[var(--af-bg2)] border border-[var(--border)] rounded-lg px-2 py-1 text-[12px] text-[var(--foreground)] outline-none cursor-pointer"
            >
              <option value="">Todos</option>
              {teamUsers.map((u: any) => (
                <option key={u.id} value={u.id}>{u.data?.name || u.name || 'Sin nombre'}</option>
              ))}
            </select>
          </div>

          {/* Priority filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-[var(--muted-foreground)] font-medium">Prioridad:</span>
            <select
              value={filterPriority}
              onChange={(e) => handlePriorityFilter(e.target.value)}
              className="bg-[var(--af-bg2)] border border-[var(--border)] rounded-lg px-2 py-1 text-[12px] text-[var(--foreground)] outline-none cursor-pointer"
            >
              <option value="">Todas</option>
              {PRIORITY_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Project filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-[var(--muted-foreground)] font-medium">Proyecto:</span>
            <select
              value={filterProject}
              onChange={(e) => handleProjectFilter(e.target.value)}
              className="bg-[var(--af-bg2)] border border-[var(--border)] rounded-lg px-2 py-1 text-[12px] text-[var(--foreground)] outline-none cursor-pointer"
            >
              <option value="">Todos</option>
              {projects.map((p: any) => (
                <option key={p.id} value={p.id}>{p.data?.name || p.name}</option>
              ))}
            </select>
          </div>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300 transition-colors bg-transparent border-none cursor-pointer ml-auto"
            >
              <X size={12} aria-hidden="true"/>
              Limpiar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
