'use client';
import React from 'react';
import type { Project } from '@/lib/types';
import { STATUS_TABS } from './project-helpers';

export interface ProjectStatusTabsProps {
  currentFilter: string;
  setForms: (updater: (prev: Record<string, any>) => Record<string, any>) => void;
  visibleProjects: () => Project[];
}

export default function ProjectStatusTabs({
  currentFilter,
  setForms,
  visibleProjects,
}: ProjectStatusTabsProps) {
  return (
    <div className="flex gap-1 bg-[var(--af-bg3)] rounded-lg p-1 overflow-x-auto mb-1 scrollbar-none">
      {STATUS_TABS.map(tab => {
        const projs = visibleProjects();
        const count = tab.v ? projs.filter((p: Project) => p.data.status === tab.v).length : projs.length;
        return (
          <button
            key={tab.k}
            className={`px-3 py-1.5 rounded-md text-[13px] cursor-pointer transition-all whitespace-nowrap ${(currentFilter || '') === tab.v ? 'bg-[var(--card)] text-[var(--foreground)] font-medium shadow-sm' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`}
            onClick={() => setForms((p: Record<string, any>) => ({ ...p, projFilter: tab.v }))}
          >
            {tab.k} ({count})
          </button>
        );
      })}
    </div>
  );
}
