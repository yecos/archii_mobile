'use client';
import React from 'react';
import CenterModal from '@/components/common/CenterModal';
import { useApp } from '@/contexts/AppContext';
import { useTimeTrackingContext } from '@/hooks/useTimeTracking';
import { FormField, FormInput, FormSelect, FormTextarea, ModalFooter, useFormValidation } from '@/components/common/FormField';
import { DEFAULT_PHASES } from '@/lib/types';

export default function TimeEntryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { forms, setForms, closeModal, projects } = useApp();
  const { saveManualTimeEntry } = useTimeTrackingContext();
  const { errors, validateRequired, onBlurRequired, clearError } = useFormValidation();

  const handleSubmit = () => {
    const projectValid = validateRequired('teProject', forms.teProject || '', 'Proyecto');
    if (!projectValid) return;
    saveManualTimeEntry();
  };

  return (
    <CenterModal open={open} onClose={onClose} maxWidth={480}>
      <h2 className="text-lg font-semibold mb-4">Registro Manual de Tiempo</h2>

      <div className="space-y-3">
        <FormField label="Proyecto" required error={errors.teProject}>
          <FormSelect
            value={forms.teProject || ''}
            onChange={(e) => { setForms(p => ({ ...p, teProject: e.target.value })); clearError('teProject'); }}
            onBlur={() => onBlurRequired('teProject', forms.teProject || '', 'Proyecto')}
            error={errors.teProject}
          >
            <option value="">— Seleccionar —</option>
            {projects.map((p: any) => (
              <option key={p.id} value={p.id}>{p.data?.name || p.name}</option>
            ))}
          </FormSelect>
        </FormField>

        <FormField label="Fase">
          <FormSelect
            value={forms.tePhase || ''}
            onChange={(e) => setForms(p => ({ ...p, tePhase: e.target.value }))}
          >
            <option value="">— Sin fase —</option>
            {DEFAULT_PHASES.map(ph => (
              <option key={ph} value={ph}>{ph}</option>
            ))}
          </FormSelect>
        </FormField>

        <FormField label="Descripción">
          <FormTextarea
            value={forms.teDescription || ''}
            onChange={(e) => setForms(p => ({ ...p, teDescription: e.target.value }))}
            placeholder="¿Qué hiciste?"
            rows={2}
          />
        </FormField>

        <FormField label="Fecha">
          <FormInput
            type="date"
            value={forms.teDate || ''}
            onChange={(e) => setForms(p => ({ ...p, teDate: e.target.value }))}
          />
        </FormField>

        <FormField label="Duración (min)">
          <FormInput
            type="number"
            value={forms.teManualDuration || ''}
            onChange={(e) => setForms(p => ({ ...p, teManualDuration: e.target.value }))}
            placeholder="60"
          />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Hora inicio">
            <FormInput
              type="time"
              value={forms.teStartTime || ''}
              onChange={(e) => setForms(p => ({ ...p, teStartTime: e.target.value }))}
            />
          </FormField>
          <FormField label="Hora fin">
            <FormInput
              type="time"
              value={forms.teEndTime || ''}
              onChange={(e) => setForms(p => ({ ...p, teEndTime: e.target.value }))}
            />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Tarifa/h (COP)">
            <FormInput
              type="number"
              value={forms.teRate || 50000}
              onChange={(e) => setForms(p => ({ ...p, teRate: e.target.value }))}
              placeholder="50000"
            />
          </FormField>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-[var(--foreground)]">
              <input
                type="checkbox"
                checked={forms.teBillable !== false}
                onChange={(e) => setForms(p => ({ ...p, teBillable: e.target.checked }))}
                className="w-4 h-4 rounded accent-[var(--af-accent)]"
              />
              Billable
            </label>
          </div>
        </div>
      </div>

      <ModalFooter
        onCancel={() => closeModal('timeEntry')}
        onSubmit={handleSubmit}
        submitLabel="Guardar"
      />
    </CenterModal>
  );
}
