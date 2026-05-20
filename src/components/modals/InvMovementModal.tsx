'use client';
import React from 'react';
import CenterModal from '@/components/common/CenterModal';
import { ClipboardList, AlertTriangle } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { useInventoryContext } from '@/hooks/useInventory';
import { FormField, FormInput, FormSelect, ModalFooter, useFormValidation } from '@/components/common/FormField';
import { INV_WAREHOUSES } from '@/lib/types';

export default function InvMovementModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { forms, setForms, closeModal } = useApp();
  const { invProducts, saveInvMovement, getWarehouseStock, getTotalStock } = useInventoryContext();
  const { errors, validateRequired, onBlurRequired, clearError } = useFormValidation();

  const handleSubmit = () => {
    const typeOk = validateRequired('invMovType', forms.invMovType || '', 'Tipo');
    const prodOk = validateRequired('invMovProduct', forms.invMovProduct || '', 'Producto');
    const whOk = validateRequired('invMovWarehouse', forms.invMovWarehouse || '', 'Almacén');
    const qtyOk = validateRequired('invMovQty', forms.invMovQty || '', 'Cantidad');
    if (!typeOk || !prodOk || !whOk || !qtyOk) return;
    saveInvMovement();
  };

  return (
    <CenterModal open={open} onClose={onClose} maxWidth={480}>
      <div className="text-lg font-semibold mb-5 flex items-center gap-2">
        <ClipboardList className="w-5 h-5" aria-hidden="true"/>
        Registrar movimiento
      </div>

      {/* Tipo toggle */}
      <div className="mb-3">
        <FormField label="Tipo" required error={errors.invMovType}>
          <div className="grid grid-cols-2 gap-2">
            <button
              className={`py-2.5 rounded-lg text-sm font-medium cursor-pointer border transition-all ${forms.invMovType === 'Entrada' ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-400' : 'bg-[var(--af-bg3)] border-[var(--border)] text-[var(--muted-foreground)]'}`}
              onClick={() => { setForms(p => ({ ...p, invMovType: 'Entrada' })); clearError('invMovType'); }}
            >
              ↓ Entrada
            </button>
            <button
              className={`py-2.5 rounded-lg text-sm font-medium cursor-pointer border transition-all ${forms.invMovType === 'Salida' ? 'bg-red-500/15 border-red-500/50 text-red-400' : 'bg-[var(--af-bg3)] border-[var(--border)] text-[var(--muted-foreground)]'}`}
              onClick={() => { setForms(p => ({ ...p, invMovType: 'Salida' })); clearError('invMovType'); }}
            >
              ↑ Salida
            </button>
          </div>
        </FormField>
      </div>

      {/* Producto */}
      <div className="mb-3">
        <FormField label="Producto" required error={errors.invMovProduct}>
          <FormSelect
            value={forms.invMovProduct || ''}
            onChange={e => { setForms(p => ({ ...p, invMovProduct: e.target.value })); clearError('invMovProduct'); }}
            onBlur={() => onBlurRequired('invMovProduct', forms.invMovProduct || '', 'Producto')}
            error={errors.invMovProduct}
          >
            <option value="">Seleccionar producto</option>
            {invProducts.map(p => (
              <option key={p.id} value={p.id}>{p.data.name} (Total: {getTotalStock(p)})</option>
            ))}
          </FormSelect>
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <FormField label="Almacén" required error={errors.invMovWarehouse}>
          <FormSelect
            value={forms.invMovWarehouse || 'Almacén Principal'}
            onChange={e => { setForms(p => ({ ...p, invMovWarehouse: e.target.value })); clearError('invMovWarehouse'); }}
            onBlur={() => onBlurRequired('invMovWarehouse', forms.invMovWarehouse || '', 'Almacén')}
            error={errors.invMovWarehouse}
          >
            {INV_WAREHOUSES.map(w => <option key={w} value={w}>{w}</option>)}
          </FormSelect>
        </FormField>
        <FormField label="Cantidad" required error={errors.invMovQty}>
          <FormInput
            type="number"
            placeholder="10"
            min="1"
            value={forms.invMovQty || ''}
            onChange={e => { setForms(p => ({ ...p, invMovQty: e.target.value })); clearError('invMovQty'); }}
            onBlur={() => onBlurRequired('invMovQty', forms.invMovQty || '', 'Cantidad')}
            error={errors.invMovQty}
          />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <FormField label="Fecha">
          <FormInput type="date" value={forms.invMovDate || new Date().toISOString().split('T')[0]} onChange={e => setForms(p => ({ ...p, invMovDate: e.target.value }))} />
        </FormField>
        <FormField label="Referencia">
          <FormInput placeholder="Factura #..." value={forms.invMovRef || ''} onChange={e => setForms(p => ({ ...p, invMovRef: e.target.value }))} />
        </FormField>
      </div>

      <FormField label="Motivo">
        <FormInput placeholder="Compra proveedor, Uso en obra..." value={forms.invMovReason || ''} onChange={e => setForms(p => ({ ...p, invMovReason: e.target.value }))} />
      </FormField>

      {/* Stock preview */}
      {forms.invMovProduct && (() => {
        const prod = invProducts.find(p => p.id === forms.invMovProduct);
        if (!prod) return null;
        const wh = forms.invMovWarehouse || 'Almacén Principal';
        const curStock = getWarehouseStock(prod, wh);
        const qty = Number(forms.invMovQty || 0);
        return (
          <div className={`rounded-lg p-3 mt-3 text-sm border ${forms.invMovType === 'Salida' && qty > curStock ? 'bg-red-500/10 border-red-500/30' : 'bg-[var(--af-bg3)] border-[var(--border)]'}`}>
            <div className="flex justify-between">
              <span className="text-[var(--muted-foreground)]">Stock en {wh}:</span>
              <span className="font-medium">{curStock} {prod.data.unit}</span>
            </div>
            {qty > 0 && (
              <div className="flex justify-between mt-1">
                <span className="text-[var(--muted-foreground)]">Después:</span>
                <span className={`font-bold ${forms.invMovType === 'Salida' && qty > curStock ? 'text-red-400' : 'text-[var(--foreground)]'}`}>
                  {forms.invMovType === 'Entrada' ? curStock + qty : Math.max(0, curStock - qty)} {prod.data.unit}
                </span>
              </div>
            )}
            {forms.invMovType === 'Salida' && qty > curStock && (
              <div className="flex items-center gap-1 text-red-400 text-xs mt-1">
                <AlertTriangle className="w-3 h-3" aria-hidden="true"/>
                Excede stock disponible en {wh}
              </div>
            )}
          </div>
        );
      })()}

      <ModalFooter
        onCancel={() => closeModal('invMovement')}
        onSubmit={handleSubmit}
        submitLabel="Registrar"
        submitColor="bg-emerald-600 text-white border-none hover:bg-emerald-700"
      />
    </CenterModal>
  );
}
