'use client';
import React from 'react';
import CenterModal from '@/components/common/CenterModal';
import { useApp } from '@/contexts/AppContext';
import { FormField, FormInput, FormTextarea, ModalFooter, useFormValidation } from '@/components/common/FormField';

export default function ApprovalModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { forms, setForms, closeModal, saveApproval } = useApp();
  const { errors, validateRequired, onBlurRequired, clearError } = useFormValidation();

  const handleSubmit = () => {
    const titleValid = validateRequired('appTitle', forms.appTitle || '', 'Título');
    if (!titleValid) return;
    saveApproval();
  };

  return (
    <CenterModal open={open} onClose={onClose} maxWidth={480}>
      <h2 className="text-lg font-semibold mb-4">Nueva aprobación</h2>

      <div className="space-y-3">
        <FormField label="Título" required error={errors.appTitle}>
          <FormInput
            value={forms.appTitle || ''}
            onChange={(e) => { setForms(p => ({ ...p, appTitle: e.target.value })); clearError('appTitle'); }}
            onBlur={() => onBlurRequired('appTitle', forms.appTitle || '', 'Título')}
            placeholder="Título de la solicitud"
            error={errors.appTitle}
          />
        </FormField>

        <FormField label="Descripción">
          <FormTextarea
            value={forms.appDesc || ''}
            onChange={(e) => setForms(p => ({ ...p, appDesc: e.target.value }))}
            placeholder="Describe lo que necesitas aprobar"
            rows={3}
          />
        </FormField>
      </div>

      <ModalFooter
        onCancel={() => closeModal('approval')}
        onSubmit={handleSubmit}
        submitLabel="Crear"
      />
    </CenterModal>
  );
}
