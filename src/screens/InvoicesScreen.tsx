'use client';
import React, { useMemo, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useTimeTrackingContext } from '@/hooks/useTimeTracking';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import { fmtCOP } from '@/lib/helpers';
import { DEFAULT_PHASES } from '@/lib/types';
import * as fbActions from '@/lib/firestore-actions';
import { exportInvoicePDF } from '@/lib/export-pdf';
import { FileText, Download, Pencil, Trash2, Receipt, Plus } from 'lucide-react';
import { OverflowMenu } from '@/components/ui/OverflowMenu';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import EmptyState from '@/components/common/EmptyState';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { showUndoToast } from '@/lib/undo-helpers';

export default function InvoicesScreen() {
  const {
    forms, projects, setForms, showToast, activeTenantId,
  } = useApp();
  const {
    addInvoiceItem, invoiceFilterStatus, invoiceItems, invoiceTab,
    invoices, openNewInvoice, removeInvoiceItem, saveInvoice,
    setInvoiceFilterStatus, setInvoiceTab, updateInvoiceItem,
  } = useTimeTrackingContext();

  const confirmDialog = useConfirmDialog();
  const confirm = confirmDialog.confirm;

  const summaryCards = useMemo(() => {
    const totalInvoiced = invoices.filter(i => i.data.status !== 'Cancelada').reduce((s, i) => s + (i.data.total || 0), 0);
    const totalPaid = invoices.filter(i => i.data.status === 'Pagada').reduce((s, i) => s + (i.data.total || 0), 0);
    const totalPending = invoices.filter(i => i.data.status === 'Enviada' || i.data.status === 'Borrador').reduce((s, i) => s + (i.data.total || 0), 0);
    const totalOverdue = invoices.filter(i => i.data.status === 'Vencida').reduce((s, i) => s + (i.data.total || 0), 0);
    return [
      { lbl: 'Facturado', val: fmtCOP(totalInvoiced), color: 'text-[var(--af-accent)]' },
      { lbl: 'Pagado', val: fmtCOP(totalPaid), color: 'text-emerald-400' },
      { lbl: 'Pendiente', val: fmtCOP(totalPending), color: 'text-blue-400' },
      { lbl: 'Vencido', val: fmtCOP(totalOverdue), color: 'text-red-400' },
    ];
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter(i => invoiceFilterStatus === 'all' || i.data.status === invoiceFilterStatus);
  }, [invoices, invoiceFilterStatus]);

  return (
<div className="animate-fadeIn space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Receipt size={20} className="text-[var(--af-accent)]" aria-hidden="true"/>
            Facturación
          </h2>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{invoices.length} facturas</p>
        </div>
        <button className="flex items-center gap-1.5 bg-[var(--af-accent)] text-background px-3.5 py-2 rounded-lg text-[13px] font-semibold cursor-pointer border-none hover:bg-[var(--af-accent2)] transition-colors" onClick={openNewInvoice}>
          <Plus size={14} aria-hidden="true"/>
          Nueva Factura
        </button>
      </div>

      {invoiceTab === 'list' && (<div>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex gap-1 bg-[var(--af-bg3)] rounded-lg p-1 overflow-x-auto">
              {[{ k: 'Todas', v: 'all' }, { k: 'Borrador', v: 'Borrador' }, { k: 'Enviadas', v: 'Enviada' }, { k: 'Pagadas', v: 'Pagada' }, { k: 'Vencidas', v: 'Vencida' }].map(tab => (
                <button key={tab.v} className={`px-3 py-1.5 rounded-md text-[13px] cursor-pointer transition-all whitespace-nowrap ${invoiceFilterStatus === tab.v ? 'bg-[var(--card)] text-[var(--foreground)] font-medium shadow-sm' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`} onClick={() => setInvoiceFilterStatus(tab.v)}>{tab.k}</button>
              ))}
            </div>
            <button className="flex items-center gap-1.5 bg-[var(--af-accent)] text-background px-3.5 py-2 rounded-lg text-[13px] font-semibold cursor-pointer border-none hover:bg-[var(--af-accent2)] transition-colors" onClick={openNewInvoice}>+ Nueva Factura</button>
          </div>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {summaryCards.map((c, i) => (
              <div key={i} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3">
                <div className={`text-lg font-bold ${c.color}`}>{c.val}</div>
                <div className="text-[11px] text-[var(--muted-foreground)]">{c.lbl}</div>
              </div>
            ))}
          </div>
          {/* Invoice List */}
          {filteredInvoices.length === 0 ? (
            <EmptyState emoji="🧾" title="Sin facturas" description="Crea tu primera factura para empezar" />
          ) : (
              <div className="space-y-2">
                {filteredInvoices.map(inv => {
                  const statusColors: Record<string, string> = { Borrador: 'bg-[var(--af-bg4)] text-[var(--muted-foreground)]', Enviada: 'bg-blue-500/10 text-blue-400', Pagada: 'bg-emerald-500/10 text-emerald-400', Vencida: 'bg-red-500/10 text-red-400', Cancelada: 'bg-red-500/5 text-red-300 line-through' };
                  const proj = projects.find(p => p.id === inv.data.projectId);
                  return (<div key={inv.id} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 flex items-center gap-4 cursor-pointer hover:border-[var(--input)] transition-all">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold">{inv.data.number}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusColors[inv.data.status] || ''}`}>{inv.data.status}</span>
                      </div>
                      <div className="text-xs text-[var(--muted-foreground)]">{inv.data.projectName}{inv.data.clientName ? ' · ' + inv.data.clientName : ''}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-bold text-[var(--af-accent)]">{fmtCOP(inv.data.total)}</div>
                      <div className="text-[10px] text-[var(--muted-foreground)]">{inv.data.issueDate}{inv.data.dueDate ? ' → ' + inv.data.dueDate : ''}</div>
                    </div>
                    <div className="hidden md:flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      {/* PDF Download */}
                      <button aria-label="Descargar PDF" className="px-2 py-1.5 rounded text-xs cursor-pointer bg-[var(--af-accent)]/10 text-[var(--af-accent)] hover:bg-[var(--af-accent)]/20" onClick={() => {
                        try { exportInvoicePDF(inv, proj); showToast('PDF descargado'); } catch (err) { showToast('Error al generar PDF', 'error'); }
                      }} title="Descargar PDF">
                        <FileText size={14} aria-hidden="true"/>
                      </button>
                      {inv.data.status === 'Borrador' && <button className="px-2 py-1.5 rounded text-xs cursor-pointer bg-blue-500/10 text-blue-400 hover:bg-blue-500/20" onClick={() => fbActions.updateInvoiceStatus(inv.id, 'Enviada', showToast, activeTenantId)}>Enviar</button>}
                      {inv.data.status === 'Enviada' && <button className="px-2 py-1.5 rounded text-xs cursor-pointer bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20" onClick={() => fbActions.updateInvoiceStatus(inv.id, 'Pagada', showToast, activeTenantId)}>Pagar</button>}
                      {inv.data.status === 'Enviada' && <button className="px-2 py-1.5 rounded text-xs cursor-pointer bg-red-500/10 text-red-400 hover:bg-red-500/20" onClick={() => fbActions.updateInvoiceStatus(inv.id, 'Vencida', showToast, activeTenantId)}>Vencer</button>}
                      <button aria-label="Eliminar" className="px-2 py-1.5 rounded text-xs cursor-pointer bg-red-500/10 text-red-400 hover:bg-red-500/20" onClick={async () => {
                        const ok = await confirm({ title: 'Eliminar factura', description: '¿Estás seguro de eliminar esta factura?' });
                        if (!ok) return;
                        const snapshot = { ...inv.data };
                        await fbActions.deleteInvoice(inv.id, showToast, activeTenantId);
                        showUndoToast({ collection: 'invoices', docId: inv.id, snapshot, label: 'Factura', gender: 'a' });
                      }}><Trash2 size={14} aria-hidden="true"/></button>
                    </div>
                    <div className="md:hidden shrink-0" onClick={e => e.stopPropagation()}>
                      <OverflowMenu
                        actions={[
                          { label: 'Descargar PDF', icon: <FileText size={14} aria-hidden="true"/>, onClick: () => {
                            try { exportInvoicePDF(inv, proj); showToast('PDF descargado'); } catch (err) { showToast('Error al generar PDF', 'error'); }
                          }},
                          ...(inv.data.status === 'Borrador' ? [{ label: 'Enviar factura', onClick: () => fbActions.updateInvoiceStatus(inv.id, 'Enviada', showToast, activeTenantId) }] : []),
                          ...(inv.data.status === 'Enviada' ? [{ label: 'Marcar como pagada', onClick: () => fbActions.updateInvoiceStatus(inv.id, 'Pagada', showToast, activeTenantId) }] : []),
                          ...(inv.data.status === 'Enviada' ? [{ label: 'Marcar como vencida', onClick: () => fbActions.updateInvoiceStatus(inv.id, 'Vencida', showToast, activeTenantId) }] : []),
                          { label: 'Eliminar factura', icon: <Trash2 size={14} aria-hidden="true"/>, variant: 'danger' as const, separator: true, onClick: async () => {
                            const ok = await confirm({ title: 'Eliminar factura', description: '¿Estás seguro de eliminar esta factura?' });
                            if (!ok) return;
                            const snapshot = { ...inv.data };
                            await fbActions.deleteInvoice(inv.id, showToast, activeTenantId);
                            showUndoToast({ collection: 'invoices', docId: inv.id, snapshot, label: 'Factura', gender: 'a' });
                          }},
                        ]}
                      />
                    </div>
                  </div>);
                })}
              </div>
          )}
        </div>)}

        {invoiceTab === 'create' && (<div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-semibold">Nueva Factura</h3>
            <button className="text-xs text-[var(--muted-foreground)] cursor-pointer hover:underline" onClick={() => setInvoiceTab('list')}>Cancelar</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <select className="bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] outline-none" value={forms.invProject || ''} onChange={e => setForms(p => ({ ...p, invProject: e.target.value }))}>
              <option value="">Seleccionar proyecto</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.data.name}</option>)}
            </select>
            <input type="text" className="bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] outline-none" placeholder="Numero de factura" value={forms.invNumber || ''} onChange={e => setForms(p => ({ ...p, invNumber: e.target.value }))} />
            <input type="date" className="bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] outline-none" value={forms.invIssueDate || ''} onChange={e => setForms(p => ({ ...p, invIssueDate: e.target.value }))} />
            <input type="date" className="bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] outline-none" value={forms.invDueDate || ''} onChange={e => setForms(p => ({ ...p, invDueDate: e.target.value }))} />
          </div>
          {/* Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between"><span className="text-[13px] font-medium">Items</span><button className="text-xs text-[var(--af-accent)] cursor-pointer hover:underline" onClick={addInvoiceItem}>+ Agregar item</button></div>
            <div className="bg-[var(--af-bg3)] rounded-lg p-3 space-y-2">
              <div className="grid grid-cols-12 gap-2 text-[11px] text-[var(--muted-foreground)] font-medium">
                <div className="col-span-5 sm:col-span-4">Concepto</div><div className="col-span-3 sm:col-span-3">Fase</div><div className="col-span-2 sm:col-span-2">Horas</div><div className="col-span-2 sm:col-span-2">Tarifa</div><div className="col-span-1"></div>
              </div>
              {invoiceItems.map((item: any, idx: any) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <input className="col-span-5 sm:col-span-4 bg-[var(--card)] border border-[var(--border)] rounded px-2 py-1.5 text-xs outline-none" placeholder="Concepto" value={item.concept} onChange={e => updateInvoiceItem(idx, 'concept', e.target.value)} />
                  <select className="col-span-3 bg-[var(--card)] border border-[var(--border)] rounded px-2 py-1.5 text-xs outline-none" value={item.phase} onChange={e => updateInvoiceItem(idx, 'phase', e.target.value)}>
                    <option value="">Fase</option>
                    {DEFAULT_PHASES.map(ph => <option key={ph} value={ph}>{ph}</option>)}
                  </select>
                  <input type="number" className="col-span-2 bg-[var(--card)] border border-[var(--border)] rounded px-2 py-1.5 text-xs outline-none text-right" value={item.hours} onChange={e => updateInvoiceItem(idx, 'hours', e.target.value)} />
                  <input type="number" className="col-span-2 bg-[var(--card)] border border-[var(--border)] rounded px-2 py-1.5 text-xs outline-none text-right" value={item.rate} onChange={e => updateInvoiceItem(idx, 'rate', e.target.value)} />
                  <button className="col-span-1 text-xs text-red-400 cursor-pointer text-center" onClick={() => removeInvoiceItem(idx)}>✕</button>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-[var(--muted-foreground)]">Subtotal</span>
              <span>{fmtCOP(invoiceItems.reduce((s: any, i: any) => s + (Number(i.amount) || 0), 0))}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--muted-foreground)]">IVA (%)</span>
              <input type="number" className="w-20 bg-[var(--af-bg3)] border border-[var(--border)] rounded px-2 py-1 text-xs text-right outline-none" value={forms.invTax || 19} onChange={e => setForms(p => ({ ...p, invTax: e.target.value }))} />
            </div>
            <div className="flex justify-between items-center text-sm font-semibold">
              <span>Total</span>
              <span className="text-[var(--af-accent)]">{fmtCOP(invoiceItems.reduce((s: any, i: any) => s + (Number(i.amount) || 0), 0) * (1 + (Number(forms.invTax) || 19) / 100))}</span>
            </div>
          </div>
          <textarea className="w-full bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] outline-none resize-none" rows={2} placeholder="Notas..." value={forms.invNotes || ''} onChange={e => setForms(p => ({ ...p, invNotes: e.target.value }))} />
          <button className="w-full bg-[var(--af-accent)] text-background px-4 py-2.5 rounded-lg text-sm font-semibold cursor-pointer border-none hover:bg-[var(--af-accent2)]" onClick={saveInvoice}>Crear Factura</button>
        </div>)}
      <ConfirmDialog {...confirmDialog} />
      </div>
  );
}
