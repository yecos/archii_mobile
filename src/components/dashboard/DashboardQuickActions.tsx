'use client';
import React from 'react';
import { CalendarDays, Plus, DollarSign, AlertTriangle } from 'lucide-react';

interface DashboardQuickActionsProps {
  navigateTo: (screen: string) => void;
  openModal: (modal: string) => void;
  setForms: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  pendingApprovals: number;
  invLowStock: any[];
}

export default function DashboardQuickActions({
  navigateTo, openModal, setForms, pendingApprovals, invLowStock,
}: DashboardQuickActionsProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">Acciones:</span>
      <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--af-bg3)] transition-colors" onClick={() => navigateTo('weeklyAgenda')}>
        <CalendarDays size={12} aria-hidden="true"/> Agenda
      </button>
      <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--af-bg3)] transition-colors" onClick={() => { setForms(p => ({ ...p, taskTitle: '', taskProject: '', taskDue: new Date().toISOString().split('T')[0], taskStatus: 'Por hacer' })); openModal('task'); }}>
        <Plus size={12} aria-hidden="true"/> Tarea
      </button>
      <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--af-bg3)] transition-colors" onClick={() => { setForms(p => ({ ...p, expConcept: '', expProject: '', expAmount: '', expDate: new Date().toISOString().split('T')[0], expCategory: 'Materiales', expPaymentMethod: 'Efectivo', expVendor: '', expNotes: '' })); openModal('expense'); }}>
        <DollarSign size={12} aria-hidden="true"/> Gasto
      </button>
      {pendingApprovals > 0 && (
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer border border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/15 transition-colors" onClick={() => navigateTo('approvals')}>
          <AlertTriangle size={12} aria-hidden="true"/> {pendingApprovals} aprobación{pendingApprovals !== 1 ? 'es' : ''}
        </button>
      )}
      {invLowStock.length > 0 && (
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/15 transition-colors" onClick={() => navigateTo('inventory')}>
          <AlertTriangle size={12} aria-hidden="true"/> {invLowStock.length} stock bajo
        </button>
      )}
    </div>
  );
}
