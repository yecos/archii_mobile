'use client';
import React from 'react';
import { TRANSFER_STATUSES } from '@/lib/types';
import { ArrowLeftRight, Trash2 } from 'lucide-react';
import { OverflowMenu } from '@/components/ui/OverflowMenu';

interface InventoryTransfersProps {
  invTransfers: any[];
  invTransferFilterStatus: string;
  getInvProductName: (id: string) => string;
  deleteInvTransfer: (id: string) => void;
  confirm: (opts: { title: string; description?: string; confirmLabel?: string; cancelLabel?: string; destructive?: boolean; }) => Promise<boolean>;
  setEditingId: (id: string | null) => void;
  setForms: (updater: any) => void;
  openModal: (modal: string) => void;
  setInvTransferFilterStatus: (v: string) => void;
}

export default function InventoryTransfers({
  invTransfers, invTransferFilterStatus, getInvProductName,
  deleteInvTransfer, confirm,
  setEditingId, setForms, openModal, setInvTransferFilterStatus,
}: InventoryTransfersProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">🔄 Transferencias ({invTransfers.length})</h3>
        <button className="px-4 py-2 rounded-lg text-[13px] font-semibold cursor-pointer bg-blue-600 text-white border-none hover:bg-blue-700 transition-colors flex items-center gap-2 self-start" onClick={() => { setEditingId(null); setForms((p: any) => ({ ...p, invTrProduct: '', invTrFrom: '', invTrTo: '', invTrQty: '', invTrDate: '', invTrNotes: '' })); openModal('invTransfer'); }}><ArrowLeftRight size={16} className="stroke-current" aria-hidden="true"/>Nueva transferencia</button>
      </div>
      <select className="bg-[var(--af-bg3)] border border-[var(--input)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] outline-none" value={invTransferFilterStatus} onChange={e => setInvTransferFilterStatus(e.target.value)}><option value="all">Todos los estados</option>{TRANSFER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select>
      {invTransfers.filter(t => invTransferFilterStatus === 'all' || t.data.status === invTransferFilterStatus).length === 0 ? (
        <div className="text-center py-12"><div className="text-4xl mb-2">🔄</div><div className="text-[var(--muted-foreground)]">Sin transferencias</div><div className="text-xs text-[var(--muted-foreground)] mt-1">Mueve productos entre almacenes</div></div>
      ) : (
        <div className="space-y-2">
          {invTransfers.filter(t => invTransferFilterStatus === 'all' || t.data.status === invTransferFilterStatus).map(t => (
            <div key={t.id} className="bg-[var(--af-bg3)] rounded-xl p-3 sm:p-4 border border-blue-500/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/15 flex items-center justify-center"><span className="text-lg">🔄</span></div>
                  <div>
                    <div className="text-sm font-semibold">{t.data.productName || getInvProductName(t.data.productId)}</div>
                    <div className="text-[11px] text-[var(--muted-foreground)]">
                      <span className="text-blue-400">{t.data.fromWarehouse}</span>
                      <span className="mx-1">→</span>
                      <span className="text-emerald-400">{t.data.toWarehouse}</span>
                      <span className="ml-1">· {t.data.quantity} uds</span>
                    </div>
                    {t.data.notes && <div className="text-[11px] text-[var(--muted-foreground)] mt-0.5">{t.data.notes}</div>}
                  </div>
                </div>
                {/* Desktop: status badge + delete */}
                <div className="hidden md:flex items-center gap-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${t.data.status === 'Completada' ? 'bg-emerald-500/15 text-emerald-400' : t.data.status === 'En tránsito' ? 'bg-blue-500/15 text-blue-400' : t.data.status === 'Cancelada' ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'}`}>{t.data.status}</span>
                  <button aria-label="Eliminar" className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer" onClick={async () => { if (await confirm({ title: 'Eliminar transferencia', description: '¿Estás seguro?' })) deleteInvTransfer(t.id); }}><Trash2 size={14} className="stroke-current" aria-hidden="true"/></button>
                </div>
                {/* Mobile: status badge + OverflowMenu */}
                <div className="md:hidden flex items-center gap-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${t.data.status === 'Completada' ? 'bg-emerald-500/15 text-emerald-400' : t.data.status === 'En tránsito' ? 'bg-blue-500/15 text-blue-400' : t.data.status === 'Cancelada' ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'}`}>{t.data.status}</span>
                  <OverflowMenu
                    actions={[
                      { label: 'Eliminar transferencia', icon: <Trash2 size={14} aria-hidden="true"/>, onClick: async () => { if (await confirm({ title: 'Eliminar transferencia', description: '¿Estás seguro?' })) deleteInvTransfer(t.id); }, variant: 'danger' },
                    ]}
                    side="left"
                    align="end"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
