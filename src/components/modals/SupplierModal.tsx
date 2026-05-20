'use client';
import React from 'react';
import CenterModal from '@/components/common/CenterModal';
import { useApp } from '@/contexts/AppContext';
import { FormField, FormInput, FormSelect, FormTextarea, ModalFooter, useFormValidation } from '@/components/common/FormField';
import { SUPPLIER_CATS } from '@/lib/types';
import { Star } from 'lucide-react';

export default function SupplierModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { forms, setForms, editingId, closeModal, saveSupplier } = useApp();
  const { errors, validateRequired, onBlurRequired, clearError } = useFormValidation();
  const rating = Number(forms.supRating) || 5;

  const handleSubmit = () => {
    if (!validateRequired('supName', forms.supName || '', 'Nombre')) return;
    saveSupplier();
  };

  return (
    <CenterModal open={open} onClose={onClose} maxWidth={480}>
      <h2 className="text-lg font-semibold mb-4">{editingId ? 'Editar proveedor' : 'Nuevo proveedor'}</h2>

      <div className="space-y-3">
        <FormField label="Nombre" required error={errors.supName}>
          <FormInput
            value={forms.supName || ''}
            onChange={(e) => { clearError('supName'); setForms(p => ({ ...p, supName: e.target.value })); }}
            onBlur={() => onBlurRequired('supName', forms.supName || '', 'Nombre')}
            error={errors.supName}
            placeholder="Nombre del proveedor"
          />
        </FormField>

        <FormField label="Categoría">
          <FormSelect
            value={forms.supCategory || 'Otro'}
            onChange={(e) => setForms(p => ({ ...p, supCategory: e.target.value }))}
          >
            {SUPPLIER_CATS.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </FormSelect>
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Teléfono">
            <FormInput
              value={forms.supPhone || ''}
              onChange={(e) => setForms(p => ({ ...p, supPhone: e.target.value }))}
              placeholder="+57 ..."
            />
          </FormField>

          <FormField label="Email">
            <FormInput
              type="email"
              value={forms.supEmail || ''}
              onChange={(e) => setForms(p => ({ ...p, supEmail: e.target.value }))}
              placeholder="correo@ejemplo.com"
            />
          </FormField>
        </div>

        <FormField label="Dirección">
          <FormInput
            value={forms.supAddress || ''}
            onChange={(e) => setForms(p => ({ ...p, supAddress: e.target.value }))}
            placeholder="Dirección"
          />
        </FormField>

        <FormField label="Sitio web">
          <FormInput
            value={forms.supWebsite || ''}
            onChange={(e) => setForms(p => ({ ...p, supWebsite: e.target.value }))}
            placeholder="https://..."
          />
        </FormField>

        <FormField label="Calificación">
          <div className="flex items-center gap-1">
            <FormSelect
              value={String(rating)}
              onChange={(e) => setForms(p => ({ ...p, supRating: e.target.value }))}
              className="w-auto"
            >
              {[1, 2, 3, 4, 5].map(n => (
                <option key={n} value={n}>
                  {n} {n === 1 ? 'estrella' : 'estrellas'}
                </option>
              ))}
            </FormSelect>
            <div className="flex ml-1">
              {[1, 2, 3, 4, 5].map(n => (
                <Star
                  key={n}
                  size={16}
                  className={n <= rating ? 'text-amber-400 fill-amber-400' : 'text-[var(--muted-foreground)]/30'}
               aria-hidden="true"
                />
              ))}
            </div>
          </div>
        </FormField>

        <FormField label="Notas">
          <FormTextarea
            value={forms.supNotes || ''}
            onChange={(e) => setForms(p => ({ ...p, supNotes: e.target.value }))}
            placeholder="Notas sobre el proveedor"
            rows={3}
          />
        </FormField>
      </div>

      <ModalFooter
        onCancel={() => closeModal('supplier')}
        onSubmit={handleSubmit}
        submitLabel={editingId ? 'Actualizar' : 'Crear proveedor'}
      />
    </CenterModal>
  );
}
