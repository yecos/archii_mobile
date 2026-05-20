'use client';

import React from 'react';

interface FilterOption {
  value: string;
  label: string;
}

interface FilterBarProps {
  /** Status tabs to display as pill buttons */
  statuses?: readonly string[];
  /** Currently active status filter */
  activeStatus: string;
  /** Callback when status tab is clicked */
  onStatusChange: (status: string) => void;
  /** Additional filter dropdowns (project, location, etc.) */
  filters?: {
    key: string;
    label: string;
    value: string;
    options: FilterOption[];
    onChange: (value: string) => void;
  }[];
  /** Show project filter with only active projects */
  projectFilter?: {
    value: string;
    onChange: (value: string) => void;
    projects: { id: string; name: string }[];
    label?: string;
  };
  className?: string;
}

const selectCls = 'bg-[var(--af-bg3)] border border-[var(--input)] rounded-lg px-3 py-1.5 text-xs text-[var(--foreground)] outline-none';

export default function FilterBar({
  statuses,
  activeStatus,
  onStatusChange,
  filters,
  projectFilter,
  className = '',
}: FilterBarProps) {
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {/* Dropdown filters row */}
      <div className="flex flex-wrap gap-2">
        {projectFilter && (
          <select
            className={selectCls}
            value={projectFilter.value}
            onChange={(e) => projectFilter.onChange(e.target.value)}
          >
            <option value="">{projectFilter.label || 'Todos los proyectos'}</option>
            {projectFilter.projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
        {filters?.map((f) => (
          <select
            key={f.key}
            className={selectCls}
            value={f.value}
            onChange={(e) => f.onChange(e.target.value)}
          >
            <option value="">{f.label}</option>
            {f.options.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        ))}
      </div>

      {/* Status tabs */}
      {statuses && statuses.length > 0 && (
        <div className="flex gap-1 overflow-x-auto pb-1">
          {['', ...statuses].map((status, i) => (
            <button
              key={status || 'all'}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium whitespace-nowrap cursor-pointer border-none transition-colors ${
                activeStatus === status
                  ? 'bg-[var(--af-accent)] text-background'
                  : 'bg-[var(--af-bg3)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
              onClick={() => onStatusChange(status)}
            >
              {i === 0 ? 'Todos' : status}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
