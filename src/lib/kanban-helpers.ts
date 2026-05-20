/**
 * kanban-helpers.ts
 * Helper functions for mapping between entity data and kanban board format.
 */

import type { KanbanColumn, KanbanFilters } from '@/lib/types';
import { KANBAN_DEFAULT_COLUMNS } from '@/lib/types';

// Re-export KanbanColumn so consumers can import from this module
export type { KanbanColumn } from '@/lib/types';

export type KanbanEntityType = 'tasks' | 'projects' | 'approvals' | 'invoices' | 'transfers' | 'phases' | 'incidents';

export interface KanbanCardData {
  id: string;
  entityId: string;
  title: string;
  description: string;
  priority: string;
  assigneeId: string;
  dueDate: string;
  projectId: string;
  status: string;
  tags: string[];
  isQuickCard: boolean;
  color?: string;
  columnId: string;
  order: number;
  entityData: Record<string, any>;
}

/** Maps columnId to entity status value for each entity type */
const COLUMN_TO_STATUS: Record<KanbanEntityType, Record<string, string>> = {
  tasks: {
    todo: 'Por hacer',
    inprogress: 'En progreso',
    review: 'Revision',
    done: 'Completado',
  },
  projects: {
    concept: 'Concepto',
    design: 'Diseno',
    execution: 'Ejecucion',
    finished: 'Terminado',
  },
  approvals: {
    pending: 'Pendiente',
    inreview: 'En revision',
    approved: 'Aprobada',
    rejected: 'Rechazada',
  },
  invoices: {
    draft: 'Borrador',
    sent: 'Enviada',
    paid: 'Pagada',
    overdue: 'Vencida',
  },
  transfers: {
    pending: 'Pendiente',
    transit: 'En transito',
    completed: 'Completada',
    cancelled: 'Cancelada',
  },
  phases: {
    planning: 'Planificacion',
    active: 'En curso',
    paused: 'Pausada',
    completed: 'Completada',
  },
  incidents: {
    reported: 'Reportada',
    analyzing: 'En analisis',
    fixing: 'En correccion',
    resolved: 'Resuelta',
  },
};

/** Reverse mapping: entity status -> columnId */
const STATUS_TO_COLUMN: Record<KanbanEntityType, Record<string, string>> = Object.fromEntries(
  Object.entries(COLUMN_TO_STATUS).map(([type, mapping]) => [
    type,
    Object.fromEntries(Object.entries(mapping).map(([col, status]) => [status, col])),
  ])
) as Record<KanbanEntityType, Record<string, string>>;

/** Status field name on each entity */
const STATUS_FIELDS: Record<KanbanEntityType, string> = {
  tasks: 'status',
  projects: 'status',
  approvals: 'status',
  invoices: 'status',
  transfers: 'status',
  phases: 'status',
  incidents: 'status',
};

/** Entity display labels */
export const ENTITY_LABELS: Record<KanbanEntityType, string> = {
  tasks: 'Tareas',
  projects: 'Proyectos',
  approvals: 'Aprobaciones',
  invoices: 'Facturas',
  transfers: 'Transferencias',
  phases: 'Fases',
  incidents: 'Incidencias',
};

/** Maps a column ID to the entity's status field value */
export function getCardStatusFromColumn(entityType: KanbanEntityType, columnId: string): string | null {
  return COLUMN_TO_STATUS[entityType]?.[columnId] ?? null;
}

/** Reverse: maps entity status to columnId */
export function getColumnFromStatus(entityType: KanbanEntityType, status: string): string | null {
  return STATUS_TO_COLUMN[entityType]?.[status] ?? null;
}

/** Returns the status field name for an entity type */
export function getStatusFieldForEntity(entityType: KanbanEntityType): string {
  return STATUS_FIELDS[entityType] || 'status';
}

/** Returns display label for entity type */
export function getEntityLabel(entityType: KanbanEntityType): string {
  return ENTITY_LABELS[entityType] || entityType;
}

/** Default columns for an entity type */
export function getDefaultColumns(entityType: KanbanEntityType): KanbanColumn[] {
  return KANBAN_DEFAULT_COLUMNS[entityType] || KANBAN_DEFAULT_COLUMNS.tasks;
}

/**
 * Check if a date string is overdue.
 * The due date is the LAST productive day — the task is NOT overdue on that day,
 * only from the day AFTER. Also normalizes to local timezone to avoid UTC offset bugs.
 */
export function isOverdue(dateStr: string): boolean {
  if (!dateStr) return false;
  // Parse as local date (not UTC) to avoid timezone offset issues
  // "2026-05-21" → new Date(2026, 4, 21) at midnight local
  const parts = dateStr.split('T')[0].split('-').map(Number);
  const dueDate = new Date(parts[0], parts[1] - 1, parts[2]);
  dueDate.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Strictly less than: the due date itself is NOT overdue
  return dueDate < today;
}

/** Format date for display */
export function formatDateShort(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}

/** Maps context data to kanban card format */
export function getEntityCards(
  entityType: KanbanEntityType,
  contextData: Record<string, any[]>,
  selectedProjectId: string | null,
  cardPositions: Record<string, { columnId: string; order: number }> = {},
  filters: KanbanFilters | null = null
): KanbanCardData[] {
  const entities = contextData[entityType] || [];

  let cards: KanbanCardData[] = entities.map((entity: any, index: number) => {
    const data = entity.data || entity;
    const status = data.status || '';
    const columnId = getColumnFromStatus(entityType, status) || 'todo';
    const position = cardPositions[entity.id];
    const order = position?.order ?? index;

    const base: KanbanCardData = {
      id: `entity-${entity.id}`,
      entityId: entity.id,
      title: data.title || data.name || 'Sin titulo',
      description: data.description || '',
      priority: data.priority || 'Media',
      assigneeId: data.assigneeId || data.assignedTo || data.assignees?.[0] || '',
      dueDate: data.dueDate || data.endDate || '',
      projectId: data.projectId || '',
      status,
      tags: data.tags || [],
      isQuickCard: false,
      columnId,
      order,
      entityData: data,
    };

    return base;
  });

  // Apply filters
  if (filters) {
    cards = applyFilters(cards, filters);
  }

  // Filter by selected project if set (only for project-specific entities)
  if (selectedProjectId && ['tasks', 'approvals'].includes(entityType)) {
    cards = cards.filter(c => !c.projectId || c.projectId === selectedProjectId);
  }

  return cards;
}

/** Apply filters to cards */
function applyFilters(cards: KanbanCardData[], filters: KanbanFilters): KanbanCardData[] {
  let filtered = cards;

  if (filters.searchQuery) {
    const q = filters.searchQuery.toLowerCase();
    filtered = filtered.filter(c =>
      c.title.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q)
    );
  }

  if (filters.assigneeId) {
    filtered = filtered.filter(c => c.assigneeId === filters.assigneeId);
  }

  if (filters.priority) {
    filtered = filtered.filter(c => c.priority === filters.priority);
  }

  if (filters.projectIds && filters.projectIds.length > 0) {
    filtered = filtered.filter(c =>
      !c.projectId || filters.projectIds!.includes(c.projectId)
    );
  }

  if (filters.dueDateFrom) {
    filtered = filtered.filter(c => {
      if (!c.dueDate) return true;
      return new Date(c.dueDate) >= new Date(filters.dueDateFrom!);
    });
  }

  if (filters.dueDateTo) {
    filtered = filtered.filter(c => {
      if (!c.dueDate) return true;
      return new Date(c.dueDate) <= new Date(filters.dueDateTo!);
    });
  }

  if (filters.tags && filters.tags.length > 0) {
    filtered = filtered.filter(c =>
      c.tags.some(t => filters.tags!.includes(t))
    );
  }

  return filtered;
}

/** Group cards by column for rendering */
export function groupCardsByColumn(
  cards: KanbanCardData[],
  columns: KanbanColumn[]
): Record<string, KanbanCardData[]> {
  const grouped: Record<string, KanbanCardData[]> = {};
  columns.forEach(col => {
    grouped[col.id] = cards
      .filter(c => c.columnId === col.id)
      .sort((a, b) => a.order - b.order);
  });
  // Also capture any cards in columns not in the config
  cards.forEach(c => {
    if (!grouped[c.columnId]) {
      grouped[c.columnId] = [c];
    }
  });
  return grouped;
}

/** Get unique ID prefix for quick cards */
export function quickCardId(): string {
  return `qc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Priority color bar */
export function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'Alta': return '#ef4444';
    case 'Media': return '#f59e0b';
    case 'Baja': return '#22c55e';
    default: return '#6b7280';
  }
}
