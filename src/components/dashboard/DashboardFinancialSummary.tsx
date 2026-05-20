'use client';
import React from 'react';
import { DollarSign, AlertTriangle } from 'lucide-react';
import { fmtCOP } from '@/lib/helpers';

interface DashboardFinancialSummaryProps {
  totalInvoiced: number;
  totalPaid: number;
  totalExpenses: number;
  totalBudget: number;
  overdueInvoices: number;
  navigateTo: (screen: string) => void;
}

export default function DashboardFinancialSummary({
  totalInvoiced, totalPaid, totalExpenses, totalBudget, overdueInvoices, navigateTo,
}: DashboardFinancialSummaryProps) {
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5">
      <div className="text-[14px] font-semibold mb-3 flex items-center gap-2">
        <DollarSign size={14} className="text-emerald-400" aria-hidden="true"/> Resumen Financiero
      </div>
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[var(--af-accent)]" /><span className="text-[12px]">Facturado</span></div>
          <span className="text-[12px] font-semibold">{fmtCOP(totalInvoiced)}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-[12px]">Cobrado</span></div>
          <span className="text-[12px] font-semibold text-emerald-400">{fmtCOP(totalPaid)}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-red-400" /><span className="text-[12px]">Gastado</span></div>
          <span className="text-[12px] font-semibold text-red-400">{fmtCOP(totalExpenses)}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-400" /><span className="text-[12px]">Por cobrar</span></div>
          <span className="text-[12px] font-semibold text-blue-400">{fmtCOP(totalInvoiced - totalPaid)}</span>
        </div>
        {totalBudget > 0 && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[var(--af-text3)]" /><span className="text-[12px]">Presupuesto total</span></div>
            <span className="text-[12px] font-semibold">{fmtCOP(totalBudget)}</span>
          </div>
        )}
        {overdueInvoices > 0 && (
          <div className="flex items-center justify-between mt-1">
            <div className="flex items-center gap-2"><AlertTriangle size={10} className="text-red-400" aria-hidden="true"/><span className="text-[11px] text-red-400 font-medium">Facturas vencidas</span></div>
            <span className="text-[11px] font-semibold text-red-400">{overdueInvoices}</span>
          </div>
        )}
      </div>
      {/* Balance bar */}
      <div className="mt-3 pt-3 border-t border-[var(--border)]">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] text-[var(--muted-foreground)]">Balance neto</span>
          <span className={`text-[14px] font-bold ${totalInvoiced - totalExpenses >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtCOP(totalInvoiced - totalExpenses)}</span>
        </div>
        {(totalInvoiced > 0 || totalExpenses > 0) && (
          <div className="h-1.5 bg-[var(--af-bg4)] rounded-full overflow-hidden flex">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, totalInvoiced > 0 ? (totalPaid / totalInvoiced * 100) : 0)}%` }} />
          </div>
        )}
      </div>
      <button className="w-full mt-3 text-[10px] text-[var(--af-accent)] cursor-pointer hover:underline text-center" onClick={() => navigateTo('invoices')}>Ver facturas y presupuesto →</button>
    </div>
  );
}
