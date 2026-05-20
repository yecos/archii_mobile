'use client';
import React from 'react';
import CenterModal from '@/components/common/CenterModal';
import { useApp } from '@/contexts/AppContext';
import { useInventoryContext } from '@/hooks/useInventory';
import { FormField, FormInput, FormTextarea, ModalFooter, useFormValidation } from '@/components/common/FormField';
import { CAT_COLORS } from '@/lib/types';

export default function InvCategoryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { forms, setForms, editingId, closeModal } = useApp();
  const { invCategories, saveInvCategory } = useInventoryContext();
  const { errors, validateRequired, onBlurRequired, clearError } = useFormValidation();

  const handleSubmit = () => {
    const nameValid = validateRequired('invCatName', forms.invCatName || '', 'Nombre');
    if (!nameValid) return;
    saveInvCategory();
  };

  return (
    <CenterModal open={open} onClose={onClose} maxWidth={420}>
      <div className="text-lg font-semibold mb-5">
        {editingId ? 'Editar categoría' : '🏷️ Nueva categoría'}
      </div>

      <FormField label="Nombre" required error={errors.invCatName}>
        <FormInput placeholder="Ej: Materiales" value={forms.invCatName || ''} onChange={e => { setForms(p => ({ ...p, invCatName: e.target.value })); clearError('invCatName'); }} onBlur={() => onBlurRequired('invCatName', forms.invCatName || '', 'Nombre')} error={errors.invCatName} />
      </FormField>

      <div className="mb-3">
        <FormField label="Color">
          <div className="flex flex-wrap gap-2">
            {CAT_COLORS.map(color => (
              <button
                key={color}
                className={`w-8 h-8 rounded-lg border-2 cursor-pointer transition-transform ${forms.invCatColor === color ? 'border-[var(--foreground)] scale-110' : 'border-transparent'}`}
                style={{ backgroundColor: color }}
                onClick={() => setForms(p => ({ ...p, invCatColor: color }))}
              />
            ))}
          </div>
        </FormField>
      </div>

      <FormField label="Descripción">
        <FormTextarea rows={2} placeholder="Descripción..." value={forms.invCatDesc || ''} onChange={e => setForms(p => ({ ...p, invCatDesc: e.target.value }))} />
      </FormField>

      <ModalFooter onCancel={() => closeModal('invCategory')} onSubmit={handleSubmit} submitLabel={editingId ? 'Guardar' : 'Crear categoría'} />
    </CenterModal>
  );
}
