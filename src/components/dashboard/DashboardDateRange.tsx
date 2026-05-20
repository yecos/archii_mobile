'use client';
import React from 'react';

interface DashboardDateRangeProps {
  dateRange: 'week' | 'month' | 'quarter' | 'year' | 'custom';
  setDateRange: (range: 'week' | 'month' | 'quarter' | 'year' | 'custom') => void;
  customStart: string;
  setCustomStart: (v: string) => void;
  customEnd: string;
  setCustomEnd: (v: string) => void;
  startDate: string;
  endDate: string;
}

export default function DashboardDateRange({
  dateRange, setDateRange, customStart, setCustomStart, customEnd, setCustomEnd, startDate, endDate,
}: DashboardDateRangeProps) {
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3 sm:p-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mr-1">Periodo:</span>
        {([['week', 'Esta semana'], ['month', 'Este mes'], ['quarter', 'Este trimestre'], ['year', 'Este año']] as const).map(([key, label]) => (
          <button
            key={key}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium cursor-pointer transition-all border ${
              dateRange === key
                ? 'bg-[var(--af-accent)]/10 text-[var(--af-accent)] border-[var(--af-accent)]/30'
                : 'bg-[var(--af-bg3)] text-[var(--muted-foreground)] border-[var(--border)] hover:border-[var(--af-accent)]/20'
            }`}
            onClick={() => setDateRange(key)}
          >
            {label}
          </button>
        ))}
        <button
          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium cursor-pointer transition-all border ${
            dateRange === 'custom'
              ? 'bg-[var(--af-accent)]/10 text-[var(--af-accent)] border-[var(--af-accent)]/30'
              : 'bg-[var(--af-bg3)] text-[var(--muted-foreground)] border-[var(--border)] hover:border-[var(--af-accent)]/20'
          }`}
          onClick={() => setDateRange('custom')}
        >
          Personalizado
        </button>
        {dateRange === 'custom' && (
          <div className="flex items-center gap-2 ml-1 animate-fadeIn">
            <input
              type="date"
              className="text-[11px] bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-2 py-1 text-[var(--foreground)] outline-none focus:border-[var(--af-accent)]/50"
              value={customStart}
              onChange={e => setCustomStart(e.target.value)}
            />
            <span className="text-[11px] text-[var(--af-text3)]">a</span>
            <input
              type="date"
              className="text-[11px] bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-2 py-1 text-[var(--foreground)] outline-none focus:border-[var(--af-accent)]/50"
              value={customEnd}
              onChange={e => setCustomEnd(e.target.value)}
            />
          </div>
        )}
        <span className="text-[10px] text-[var(--af-text3)] ml-auto hidden sm:inline">{startDate} — {endDate}</span>
      </div>
    </div>
  );
}
