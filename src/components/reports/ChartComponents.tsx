'use client';
import React from 'react';
import { fmtCOP } from '@/lib/helpers';

export const COLORS = ['#c8a96e', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4'];

export function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 shadow-lg text-[12px]">
      {label && <div className="font-semibold text-[var(--foreground)] mb-1">{label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color || p.fill }} />
          <span className="text-[var(--muted-foreground)]">{p.name}:</span>
          <span className="font-semibold">{typeof p.value === 'number' && p.value > 9999 ? fmtCOP(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

export function ChartLegend({ payload }: any) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-2">
      {payload?.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-1.5 text-[10px]">
          <div className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
          <span className="text-[var(--muted-foreground)]">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}
