'use client';
import React from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { OverflowMenu } from '@/components/ui/OverflowMenu';

interface InventoryCategoriesProps {
  invCategories: any[];
  invProducts: any[];
  openEditInvCategory: (c: any) => void;
  deleteInvCategory: (id: string) => void;
  confirm: (opts: { title: string; description?: string; confirmLabel?: string; cancelLabel?: string; destructive?: boolean; }) => Promise<boolean>;
  setEditingId: (id: string | null) => void;
  setForms: (updater: any) => void;
  openModal: (modal: string) => void;
}

export default function InventoryCategories({
  invCategories, invProducts, openEditInvCategory, deleteInvCategory, confirm,
  setEditingId, setForms, openModal,
}: InventoryCategoriesProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">🏷️ Categorías ({invCategories.length})</h3>
        <button className="px-4 py-2 rounded-lg text-[13px] font-semibold cursor-pointer bg-[var(--af-accent)] text-background border-none hover:bg-[var(--af-accent2)] transition-colors flex items-center gap-2" onClick={() => { setEditingId(null); setForms((p: any) => ({ ...p, invCatName: '', invCatColor: '', invCatDesc: '' })); openModal('invCategory'); }}><Plus size={16} aria-hidden="true"/>Nueva categoría</button>
      </div>
      {invCategories.length === 0 ? (<div className="text-center py-12"><div className="text-4xl mb-2">🏷️</div><div className="text-[var(--muted-foreground)]">No hay categorías</div></div>) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {invCategories.map(c => {
            const count = invProducts.filter(p => p.data.categoryId === c.id).length;
            return (
              <div key={c.id} className="bg-[var(--af-bg3)] rounded-xl p-4 border border-[var(--border)]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: (c.data.color || '#6b7280') + '20' }}><div className="w-5 h-5 rounded" style={{ backgroundColor: c.data.color }} /></div>
                    <div><div className="text-sm font-semibold">{c.data.name}</div><div className="text-xs text-[var(--muted-foreground)]">{count} producto{count !== 1 ? 's' : ''}</div>{c.data.description && <div className="text-[11px] text-[var(--muted-foreground)] mt-0.5">{c.data.description}</div>}</div>
                  </div>
                  {/* Desktop: edit/delete buttons */}
                  <div className="hidden md:flex gap-1">
                    <button aria-label="Editar" className="w-8 h-8 rounded-lg bg-[var(--card)] border border-[var(--border)] flex items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors cursor-pointer" onClick={() => openEditInvCategory(c)}><Pencil size={14} aria-hidden="true"/></button>
                    <button aria-label="Eliminar" className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer" onClick={async () => { if (await confirm({ title: 'Eliminar categoría', description: '¿Estás seguro? La categoría será eliminada permanentemente.' })) deleteInvCategory(c.id); }}><Trash2 size={14} aria-hidden="true"/></button>
                  </div>
                  {/* Mobile: OverflowMenu */}
                  <div className="md:hidden flex-shrink-0">
                    <OverflowMenu
                      actions={[
                        { label: 'Editar categoría', icon: <Pencil size={14} aria-hidden="true"/>, onClick: () => openEditInvCategory(c) },
                        { label: 'Eliminar categoría', icon: <Trash2 size={14} aria-hidden="true"/>, onClick: async () => { if (await confirm({ title: 'Eliminar categoría', description: '¿Estás seguro? La categoría será eliminada permanentemente.' })) deleteInvCategory(c.id); }, variant: 'danger', separator: true },
                      ]}
                      side="left"
                      align="end"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
