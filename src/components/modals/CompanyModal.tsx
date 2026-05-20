'use client';
import React from 'react';
import CenterModal from '@/components/common/CenterModal';
import { useApp } from '@/contexts/AppContext';
import { FormField, FormInput, useFormValidation } from '@/components/common/FormField';

export default function CompanyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { forms, setForms, editingId, saveCompany, closeModal } = useApp();
  const { errors, validateRequired, onBlurRequired, clearError } = useFormValidation();

  const handleSubmit = () => {
    if (!validateRequired('compName', forms.compName || '', 'Nombre comercial')) return;
    saveCompany();
  };

  return (
    <CenterModal open={open} onClose={onClose} maxWidth={500}>
      <div className="text-lg font-semibold mb-5">
        {editingId ? 'Editar empresa' : 'Nueva empresa'}
      </div>

      <div className="space-y-3">
        <FormField label="Nombre comercial" required error={errors.compName}>
          <FormInput placeholder="Ej: Arquitectura Pérez SAS" value={forms.compName || ''} onChange={e => { clearError('compName'); setForms(p => ({ ...p, compName: e.target.value })); }} onBlur={() => onBlurRequired('compName', forms.compName || '', 'Nombre comercial')} error={errors.compName} />
        </FormField>

        <FormField label="Razón legal">
          <FormInput placeholder="Nombre legal completo" value={forms.compLegal || ''} onChange={e => setForms(p => ({ ...p, compLegal: e.target.value }))} />
        </FormField>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="NIT">
            <FormInput placeholder="900123456-7" value={forms.compNit || ''} onChange={e => setForms(p => ({ ...p, compNit: e.target.value }))} />
          </FormField>
          <FormField label="Teléfono">
            <FormInput placeholder="+57 300 1234567" value={forms.compPhone || ''} onChange={e => setForms(p => ({ ...p, compPhone: e.target.value }))} />
          </FormField>
        </div>

        <FormField label="Correo de contacto">
          <FormInput placeholder="contacto@empresa.com" value={forms.compEmail || ''} onChange={e => setForms(p => ({ ...p, compEmail: e.target.value }))} />
        </FormField>

        <FormField label="Dirección">
          <FormInput placeholder="Dirección de la empresa" value={forms.compAddress || ''} onChange={e => setForms(p => ({ ...p, compAddress: e.target.value }))} />
        </FormField>
      </div>

      <div className="flex gap-3 mt-5 pt-4 border-t border-[var(--border)]">
        <button
          className="flex-1 px-4 py-2.5 rounded-lg text-[13px] font-medium cursor-pointer bg-transparent text-[var(--muted-foreground)] border border-[var(--input)] hover:bg-[var(--af-bg3)] hover:text-[var(--foreground)] transition-all"
          onClick={() => closeModal('company')}
        >
          Cancelar
        </button>
        <button
          className="flex-1 px-4 py-2.5 rounded-lg text-[13px] font-semibold cursor-pointer bg-[var(--af-accent)] text-background border-none hover:bg-[var(--af-accent2)] transition-colors"
          onClick={handleSubmit}
        >
          {editingId ? 'Guardar cambios' : 'Crear empresa'}
        </button>
      </div>
    </CenterModal>
  );
}
