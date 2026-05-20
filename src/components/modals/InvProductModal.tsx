'use client';
import React from 'react';
import CenterModal from '@/components/common/CenterModal';
import { Package, X, Image as ImageIcon } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { useInventoryContext } from '@/hooks/useInventory';
import { FormField, FormInput, FormSelect, FormTextarea, ModalFooter, useFormValidation } from '@/components/common/FormField';
import { INV_UNITS, INV_WAREHOUSES } from '@/lib/types';

export default function InvProductModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { forms, setForms, editingId, closeModal } = useApp();
  const { invCategories, saveInvProduct, handleInvProductImageSelect } = useInventoryContext();
  const { errors, validateRequired, onBlurRequired, clearError } = useFormValidation();

  const handleSubmit = () => {
    const nameValid = validateRequired('invProdName', forms.invProdName || '', 'Nombre');
    if (!nameValid) return;
    saveInvProduct();
  };

  return (
    <CenterModal open={open} onClose={onClose} maxWidth={520}>
      <div className="text-lg font-semibold mb-5 flex items-center gap-2">
        <Package className="w-5 h-5" aria-hidden="true"/>
        {editingId ? 'Editar producto' : 'Nuevo producto'}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="col-span-2">
          <FormField label="Nombre" required error={errors.invProdName}>
            <FormInput placeholder="Ej: Cemento Portland" value={forms.invProdName || ''} onChange={e => { setForms(p => ({ ...p, invProdName: e.target.value })); clearError('invProdName'); }} onBlur={() => onBlurRequired('invProdName', forms.invProdName || '', 'Nombre')} error={errors.invProdName} />
          </FormField>
        </div>
        <FormField label="SKU">
          <FormInput placeholder="CMP-001" value={forms.invProdSku || ''} onChange={e => setForms(p => ({ ...p, invProdSku: e.target.value }))} />
        </FormField>
        <FormField label="Categoría">
          <FormSelect value={forms.invProdCat || ''} onChange={e => setForms(p => ({ ...p, invProdCat: e.target.value }))}>
            <option value="">Sin categoría</option>
            {invCategories.map(c => <option key={c.id} value={c.id}>{c.data.name}</option>)}
          </FormSelect>
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <FormField label="Unidad">
          <FormSelect value={forms.invProdUnit || 'Unidad'} onChange={e => setForms(p => ({ ...p, invProdUnit: e.target.value }))}>
            {INV_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </FormSelect>
        </FormField>
        <FormField label="Precio unit. COP">
          <FormInput type="number" placeholder="50000" value={forms.invProdPrice || ''} onChange={e => setForms(p => ({ ...p, invProdPrice: e.target.value }))} />
        </FormField>
      </div>

      {/* Stock por almacén */}
      <div className="mb-3">
        <FormField label="Stock por almacén">
          <div className="space-y-2">
            {INV_WAREHOUSES.map(wh => (
              <div key={wh} className="flex items-center gap-2">
                <span className="text-xs text-[var(--muted-foreground)] w-36 sm:w-44 flex-shrink-0 truncate">{wh}</span>
                <input
                  className="flex-1 bg-[var(--af-bg3)] border border-[var(--input)] rounded-lg px-3 py-1.5 text-sm text-[var(--foreground)] outline-none"
                  type="number"
                  placeholder="0"
                  value={forms[`invProdWS_${wh.replace(/\s/g, '_')}`] || '0'}
                  onChange={e => setForms(p => ({ ...p, [`invProdWS_${wh.replace(/\s/g, '_')}`]: e.target.value }))}
                />
                <span className="text-xs text-[var(--muted-foreground)] w-8">{forms.invProdUnit || 'Unidad'}</span>
              </div>
            ))}
          </div>
        </FormField>
      </div>

      {/* Product Image */}
      <div className="mb-3">
        <FormField label="Foto del producto">
          {forms.invProdImage ? (
            <div className="relative rounded-xl overflow-hidden border border-[var(--border)] inline-block">
              <img src={forms.invProdImage} alt="Preview" className="w-full max-h-[140px] object-contain bg-[var(--af-bg3)]" />
              <button aria-label="Quitar imagen" className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center text-xs hover:bg-black/70 transition-colors cursor-pointer" onClick={() => setForms(p => ({ ...p, invProdImage: '' }))}>
                <X className="w-3 h-3" aria-hidden="true"/>
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center gap-1.5 p-5 border-2 border-dashed border-[var(--border)] rounded-xl cursor-pointer hover:border-[var(--af-accent)]/50 transition-colors bg-[var(--af-bg3)]">
              <ImageIcon className="w-6 h-6 text-[var(--muted-foreground)]" aria-hidden="true"/>
              <span className="text-xs text-[var(--muted-foreground)]">Toca para agregar foto</span>
              <span className="text-[10px] text-[var(--muted-foreground)]">JPG, PNG — máx 3 MB</span>
              <input type="file" accept="image/*" className="hidden" onChange={handleInvProductImageSelect} />
            </label>
          )}
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <FormField label="Stock mínimo (total)">
          <FormInput type="number" placeholder="5" value={forms.invProdMinStock || '5'} onChange={e => setForms(p => ({ ...p, invProdMinStock: e.target.value }))} />
        </FormField>
        <FormField label="Almacén principal">
          <FormSelect value={forms.invProdWarehouse || 'Almacén Principal'} onChange={e => setForms(p => ({ ...p, invProdWarehouse: e.target.value }))}>
            {INV_WAREHOUSES.map(w => <option key={w} value={w}>{w}</option>)}
          </FormSelect>
        </FormField>
      </div>

      <FormField label="Descripción">
        <FormTextarea rows={2} placeholder="Descripción..." value={forms.invProdDesc || ''} onChange={e => setForms(p => ({ ...p, invProdDesc: e.target.value }))} />
      </FormField>

      <ModalFooter onCancel={() => closeModal('invProduct')} onSubmit={handleSubmit} submitLabel={editingId ? 'Guardar' : 'Crear producto'} />
    </CenterModal>
  );
}
