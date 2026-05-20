'use client';
import React from 'react';
import CenterModal from '@/components/common/CenterModal';
import { useApp } from '@/contexts/AppContext';
import { FormField, FormInput, FormSelect, FormTextarea, ModalFooter, useFormValidation } from '@/components/common/FormField';
import { EXPENSE_CATS, PAYMENT_METHODS } from '@/lib/types';

export default function ExpenseModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { forms, setForms, closeModal, saveExpense, editingId, projects } = useApp();
  const isEditing = !!editingId;
  const { errors, validateRequired, onBlurRequired, clearError } = useFormValidation();

  const handleSubmit = () => {
    if (!validateRequired('expConcept', forms.expConcept || '', 'Concepto')) return;
    saveExpense();
  };

  return (
    <CenterModal open={open} onClose={onClose} maxWidth={500}>
      <h2 className="text-lg font-semibold mb-4">{isEditing ? 'Editar gasto' : 'Registrar gasto'}</h2>

      <div className="space-y-3">
        <FormField label="Concepto" required error={errors.expConcept}>
          <FormInput
            value={forms.expConcept || ''}
            onChange={(e) => { clearError('expConcept'); setForms(p => ({ ...p, expConcept: e.target.value })); }}
            onBlur={() => onBlurRequired('expConcept', forms.expConcept || '', 'Concepto')}
            error={errors.expConcept}
            placeholder="Ej: Compra de cemento, Alquiler de excavadora"
          />
        </FormField>

        <FormField label="Proyecto">
          <FormSelect
            value={forms.expProject || ''}
            onChange={(e) => setForms(p => ({ ...p, expProject: e.target.value }))}
          >
            <option value="">— Sin proyecto —</option>
            {projects.map((p: any) => (
              <option key={p.id} value={p.id}>{p.data?.name || p.name}</option>
            ))}
          </FormSelect>
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Monto COP" required>
            <FormInput
              type="number"
              value={forms.expAmount || ''}
              onChange={(e) => setForms(p => ({ ...p, expAmount: e.target.value }))}
              placeholder="0"
            />
          </FormField>

          <FormField label="Fecha">
            <FormInput
              type="date"
              value={forms.expDate || ''}
              onChange={(e) => setForms(p => ({ ...p, expDate: e.target.value }))}
            />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Categoría">
            <FormSelect
              value={forms.expCategory || 'Materiales'}
              onChange={(e) => setForms(p => ({ ...p, expCategory: e.target.value }))}
            >
              {EXPENSE_CATS.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </FormSelect>
          </FormField>

          <FormField label="Método de pago">
            <FormSelect
              value={forms.expPaymentMethod || 'Efectivo'}
              onChange={(e) => setForms(p => ({ ...p, expPaymentMethod: e.target.value }))}
            >
              {PAYMENT_METHODS.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </FormSelect>
          </FormField>
        </div>

        <FormField label="Proveedor / Vendedor">
          <FormInput
            value={forms.expVendor || ''}
            onChange={(e) => setForms(p => ({ ...p, expVendor: e.target.value }))}
            placeholder="Nombre del proveedor (opcional)"
          />
        </FormField>

        <FormField label="Notas">
          <FormTextarea
            value={forms.expNotes || ''}
            onChange={(e) => setForms(p => ({ ...p, expNotes: e.target.value }))}
            placeholder="Observaciones adicionales (opcional)"
            rows={2}
          />
        </FormField>
      </div>

      <ModalFooter
        onCancel={() => closeModal('expense')}
        onSubmit={handleSubmit}
        submitLabel={isEditing ? 'Actualizar' : 'Registrar'}
      />
    </CenterModal>
  );
}
