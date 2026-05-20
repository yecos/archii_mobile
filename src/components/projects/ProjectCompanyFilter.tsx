'use client';
import React from 'react';

export interface ProjectCompanyFilterProps {
  companies: any[];
  getMyRole: () => string;
  projCompanyFilter: string;
  setForms: (updater: (prev: Record<string, any>) => Record<string, any>) => void;
}

export default function ProjectCompanyFilter({
  companies,
  getMyRole,
  projCompanyFilter,
  setForms,
}: ProjectCompanyFilterProps) {
  if (getMyRole() !== 'Admin' && getMyRole() !== 'Director') return null;
  if (companies.length === 0) return null;

  return (
    <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
      <button
        className={`px-3 py-1.5 rounded-full text-[12px] cursor-pointer transition-all whitespace-nowrap border ${!projCompanyFilter ? 'bg-[var(--af-accent)] text-background border-[var(--af-accent)]' : 'bg-transparent text-[var(--muted-foreground)] border-[var(--border)] hover:border-[var(--af-accent)]/30'}`}
        onClick={() => setForms((p: Record<string, any>) => ({ ...p, projCompanyFilter: '' }))}
      >
        Todas las empresas
      </button>
      {companies.map((c: any) => (
        <button
          key={c.id}
          className={`px-3 py-1.5 rounded-full text-[12px] cursor-pointer transition-all whitespace-nowrap border ${projCompanyFilter === c.id ? 'bg-[var(--af-accent)] text-background border-[var(--af-accent)]' : 'bg-transparent text-[var(--muted-foreground)] border-[var(--border)] hover:border-[var(--af-accent)]/30'}`}
          onClick={() => setForms((p: Record<string, any>) => ({ ...p, projCompanyFilter: c.id }))}
        >
          {c.data.name}
        </button>
      ))}
    </div>
  );
}
