'use client';
import React from 'react';
import CenterModal from '@/components/common/CenterModal';
import { useApp } from '@/contexts/AppContext';
import { FormField, FormInput, FormSelect, FormTextarea, ModalFooter, useFormValidation } from '@/components/common/FormField';
import { PUNCH_LOCATIONS } from '@/lib/types';

export default function PunchItemModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { forms, setForms, editingId, closeModal, savePunchItem, projects, teamUsers } = useApp();
  const { errors, validateRequired, onBlurRequired, clearError } = useFormValidation();

  const handleSubmit = () => {
    const fields = [
      validateRequired('punchTitle', forms.punchTitle || '', 'Título'),
    ];
    if (!editingId) {
      fields.push(validateRequired('punchProject', forms.punchProject || '', 'Proyecto'));
    }
    if (fields.some(v => !v)) return;
    savePunchItem();
  };

  return (
    <CenterModal open={open} onClose={onClose} maxWidth={560}>
      <h2 className="text-lg font-semibold mb-4">{editingId ? 'Editar item' : 'Nuevo item punch list'}</h2>
      <div className="space-y-3">
        {!editingId && (
          <FormField label="Proyecto" required error={errors.punchProject}>
            <FormSelect value={forms.punchProject || ''} onChange={(e) => { setForms(p => ({ ...p, punchProject: e.target.value })); clearError('punchProject'); }} onBlur={() => onBlurRequired('punchProject', forms.punchProject || '', 'Proyecto')} error={errors.punchProject}>
              <option value="">Seleccionar proyecto</option>
              {projects.filter((p: any) => p.data.status !== 'Terminado').map((p: any) => <option key={p.id} value={p.id}>{p.data.name}</option>)}
            </FormSelect>
          </FormField>
        )}
        <FormField label="Título" required error={errors.punchTitle}>
          <FormInput value={forms.punchTitle || ''} onChange={(e) => { setForms(p => ({ ...p, punchTitle: e.target.value })); clearError('punchTitle'); }} onBlur={() => onBlurRequired('punchTitle', forms.punchTitle || '', 'Título')} placeholder="Título del item" error={errors.punchTitle} />
        </FormField>
        <FormField label="Descripción">
          <FormTextarea value={forms.punchDescription || ''} onChange={(e) => setForms(p => ({ ...p, punchDescription: e.target.value }))} placeholder="Describe el defecto o item a corregir" rows={3} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Ubicación">
            <FormSelect value={forms.punchLocation || 'Otro'} onChange={(e) => setForms(p => ({ ...p, punchLocation: e.target.value }))}>
              {PUNCH_LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
            </FormSelect>
          </FormField>
          {editingId && (
            <FormField label="Estado">
              <FormSelect value={forms.punchStatus || 'Pendiente'} onChange={(e) => setForms(p => ({ ...p, punchStatus: e.target.value }))}>
                {['Pendiente', 'En progreso', 'Completado'].map(s => <option key={s} value={s}>{s}</option>)}
              </FormSelect>
            </FormField>
          )}
          <FormField label="Prioridad">
            <FormSelect value={forms.punchPriority || 'Media'} onChange={(e) => setForms(p => ({ ...p, punchPriority: e.target.value }))}>
              {['Alta', 'Media', 'Baja'].map(p => <option key={p} value={p}>{p}</option>)}
            </FormSelect>
          </FormField>
          <FormField label="Asignado a">
            <FormSelect value={forms.punchAssignedTo || ''} onChange={(e) => setForms(p => ({ ...p, punchAssignedTo: e.target.value }))}>
              <option value="">Sin asignar</option>
              {teamUsers.map((u: any) => <option key={u.id} value={u.id}>{u.data.name}</option>)}
            </FormSelect>
          </FormField>
          <FormField label="Fecha límite">
            <FormInput type="date" value={forms.punchDueDate || ''} onChange={(e) => setForms(p => ({ ...p, punchDueDate: e.target.value }))} />
          </FormField>
        </div>
      </div>
      <ModalFooter onCancel={() => closeModal('punchItem')} onSubmit={handleSubmit} submitLabel={editingId ? 'Actualizar' : 'Agregar item'} />
    </CenterModal>
  );
}
