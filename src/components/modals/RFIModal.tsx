'use client';
import React from 'react';
import CenterModal from '@/components/common/CenterModal';
import { useApp } from '@/contexts/AppContext';
import { FormField, FormInput, FormSelect, FormTextarea, ModalFooter, useFormValidation } from '@/components/common/FormField';

export default function RFIModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { forms, setForms, editingId, closeModal, saveRFI, projects, teamUsers } = useApp();
  const isResponding = editingId && forms.rfiStatus !== 'Abierto';
  const { errors, validateRequired, onBlurRequired, clearError } = useFormValidation();

  const handleSubmit = () => {
    const fields = [
      validateRequired('rfiSubject', forms.rfiSubject || '', 'Asunto'),
      validateRequired('rfiQuestion', forms.rfiQuestion || '', 'Pregunta'),
    ];
    if (!editingId) {
      fields.push(validateRequired('rfiProject', forms.rfiProject || '', 'Proyecto'));
    }
    if (fields.some(v => !v)) return;
    saveRFI();
  };

  return (
    <CenterModal open={open} onClose={onClose} maxWidth={560}>
      <h2 className="text-lg font-semibold mb-4">{editingId ? `Editar RFI` : 'Nuevo RFI'}</h2>
      <div className="space-y-3">
        {!editingId && (
          <FormField label="Proyecto" required error={errors.rfiProject}>
            <FormSelect value={forms.rfiProject || ''} onChange={(e) => { setForms(p => ({ ...p, rfiProject: e.target.value })); clearError('rfiProject'); }} onBlur={() => onBlurRequired('rfiProject', forms.rfiProject || '', 'Proyecto')} error={errors.rfiProject}>
              <option value="">Seleccionar proyecto</option>
              {projects.filter((p: any) => p.data.status === 'Ejecucion').map((p: any) => <option key={p.id} value={p.id}>{p.data.name}</option>)}
            </FormSelect>
          </FormField>
        )}
        <FormField label="Asunto" required error={errors.rfiSubject}>
          <FormInput value={forms.rfiSubject || ''} onChange={(e) => { setForms(p => ({ ...p, rfiSubject: e.target.value })); clearError('rfiSubject'); }} onBlur={() => onBlurRequired('rfiSubject', forms.rfiSubject || '', 'Asunto')} placeholder="Asunto del RFI" error={errors.rfiSubject} />
        </FormField>
        <FormField label="Pregunta / Consulta" required error={errors.rfiQuestion}>
          <FormTextarea value={forms.rfiQuestion || ''} onChange={(e) => { setForms(p => ({ ...p, rfiQuestion: e.target.value })); clearError('rfiQuestion'); }} onBlur={() => onBlurRequired('rfiQuestion', forms.rfiQuestion || '', 'Pregunta')} placeholder="Describe tu consulta o solicitud de información" rows={4} error={errors.rfiQuestion} />
        </FormField>
        {isResponding && (
          <FormField label="Respuesta">
            <FormTextarea value={forms.rfiResponse || ''} onChange={(e) => setForms(p => ({ ...p, rfiResponse: e.target.value }))} placeholder="Escribe la respuesta aquí" rows={3} />
          </FormField>
        )}
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Prioridad">
            <FormSelect value={forms.rfiPriority || 'Media'} onChange={(e) => setForms(p => ({ ...p, rfiPriority: e.target.value }))}>
              {['Alta', 'Media', 'Baja'].map(p => <option key={p} value={p}>{p}</option>)}
            </FormSelect>
          </FormField>
          {editingId && (
            <FormField label="Estado">
              <FormSelect value={forms.rfiStatus || 'Abierto'} onChange={(e) => setForms(p => ({ ...p, rfiStatus: e.target.value }))}>
                {['Abierto', 'En revisión', 'Respondido', 'Cerrado'].map(s => <option key={s} value={s}>{s}</option>)}
              </FormSelect>
            </FormField>
          )}
          <FormField label="Asignado a">
            <FormSelect value={forms.rfiAssignedTo || ''} onChange={(e) => setForms(p => ({ ...p, rfiAssignedTo: e.target.value }))}>
              <option value="">Sin asignar</option>
              {teamUsers.map((u: any) => <option key={u.id} value={u.id}>{u.data.name}</option>)}
            </FormSelect>
          </FormField>
          <FormField label="Fecha límite">
            <FormInput type="date" value={forms.rfiDueDate || ''} onChange={(e) => setForms(p => ({ ...p, rfiDueDate: e.target.value }))} />
          </FormField>
        </div>
      </div>
      <ModalFooter onCancel={() => closeModal('rfi')} onSubmit={handleSubmit} submitLabel={editingId ? 'Actualizar' : 'Crear RFI'} />
    </CenterModal>
  );
}
