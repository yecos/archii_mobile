'use client';
import React from 'react';
import CenterModal from '@/components/common/CenterModal';
import { useApp } from '@/contexts/AppContext';
import { FormField, FormInput, FormSelect, FormTextarea, ModalFooter, useFormValidation } from '@/components/common/FormField';

export default function SubmittalModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { forms, setForms, editingId, closeModal, saveSubmittal, projects, teamUsers } = useApp();
  const { errors, validateRequired, onBlurRequired, clearError } = useFormValidation();

  const handleSubmit = () => {
    const fields = [
      validateRequired('subTitle', forms.subTitle || '', 'Título'),
    ];
    if (!editingId) {
      fields.push(validateRequired('subProject', forms.subProject || '', 'Proyecto'));
    }
    if (fields.some(v => !v)) return;
    saveSubmittal();
  };

  return (
    <CenterModal open={open} onClose={onClose} maxWidth={560}>
      <h2 className="text-lg font-semibold mb-4">{editingId ? 'Editar submittal' : 'Nuevo submittal'}</h2>
      <div className="space-y-3">
        {!editingId && (
          <FormField label="Proyecto" required error={errors.subProject}>
            <FormSelect value={forms.subProject || ''} onChange={(e) => { setForms(p => ({ ...p, subProject: e.target.value })); clearError('subProject'); }} onBlur={() => onBlurRequired('subProject', forms.subProject || '', 'Proyecto')} error={errors.subProject}>
              <option value="">Seleccionar proyecto</option>
              {projects.filter((p: any) => p.data.status === 'Ejecucion').map((p: any) => <option key={p.id} value={p.id}>{p.data.name}</option>)}
            </FormSelect>
          </FormField>
        )}
        <FormField label="Título" required error={errors.subTitle}>
          <FormInput value={forms.subTitle || ''} onChange={(e) => { setForms(p => ({ ...p, subTitle: e.target.value })); clearError('subTitle'); }} onBlur={() => onBlurRequired('subTitle', forms.subTitle || '', 'Título')} placeholder="Título del submittal" error={errors.subTitle} />
        </FormField>
        <FormField label="Descripción">
          <FormTextarea value={forms.subDescription || ''} onChange={(e) => setForms(p => ({ ...p, subDescription: e.target.value }))} placeholder="Descripción del submittal" rows={3} />
        </FormField>
        <FormField label="Especificación / Referencia">
          <FormInput value={forms.subSpecification || ''} onChange={(e) => setForms(p => ({ ...p, subSpecification: e.target.value }))} placeholder="Ej: Spec 03 05 00 - Concrete" />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          {editingId && (
            <FormField label="Estado">
              <FormSelect value={forms.subStatus || 'Borrador'} onChange={(e) => setForms(p => ({ ...p, subStatus: e.target.value }))}>
                {['Borrador', 'En revisión', 'Aprobado', 'Rechazado', 'Devuelto'].map(s => <option key={s} value={s}>{s}</option>)}
              </FormSelect>
            </FormField>
          )}
          <FormField label="Revisor">
            <FormSelect value={forms.subReviewer || ''} onChange={(e) => setForms(p => ({ ...p, subReviewer: e.target.value }))}>
              <option value="">Sin asignar</option>
              {teamUsers.map((u: any) => <option key={u.id} value={u.id}>{u.data.name}</option>)}
            </FormSelect>
          </FormField>
          <FormField label="Fecha límite">
            <FormInput type="date" value={forms.subDueDate || ''} onChange={(e) => setForms(p => ({ ...p, subDueDate: e.target.value }))} />
          </FormField>
        </div>
        {(editingId && (forms.subStatus === 'Rechazado' || forms.subStatus === 'Devuelto')) && (
          <FormField label="Notas de revisión">
            <FormTextarea value={forms.subReviewNotes || ''} onChange={(e) => setForms(p => ({ ...p, subReviewNotes: e.target.value }))} placeholder="Notas del revisor" rows={3} />
          </FormField>
        )}
      </div>
      <ModalFooter onCancel={() => closeModal('submittal')} onSubmit={handleSubmit} submitLabel={editingId ? 'Actualizar' : 'Crear submittal'} />
    </CenterModal>
  );
}
