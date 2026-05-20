'use client';
import React, { useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { FormField, FormInput, FormSelect, FormTextarea, ModalFooter, useFormValidation } from '@/components/common/FormField';
import CenterModal from '@/components/common/CenterModal';
import { PROJECT_TYPE_PHASES, PROJECT_TYPE_COLORS, type Company } from '@/lib/types';

export default function ProjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { forms, setForms, editingId, closeModal, saveProject, companies } = useApp();
  const { errors, validateRequired, onBlurRequired, clearError } = useFormValidation();

  const projectType = forms.projType || 'Ejecución';

  // Fases disponibles según el tipo seleccionado
  const availablePhases = useMemo(() => {
    const types = projectType === 'Ambos' ? ['Diseño', 'Ejecución'] : [projectType];
    const phases: { type: string; key: string; name: string; description: string }[] = [];
    for (const t of types) {
      for (const tpl of (PROJECT_TYPE_PHASES[t] || [])) {
        phases.push({ type: t, key: tpl.key, name: tpl.name, description: tpl.description });
      }
    }
    return phases;
  }, [projectType]);

  const enabledPhases: string[] = forms.enabledPhases || [];
  const allEnabled = enabledPhases.length === 0;

  const togglePhase = (key: string) => {
    setForms((p: any) => {
      const current = p.enabledPhases || [];
      const next = current.includes(key)
        ? current.filter((k: string) => k !== key)
        : [...current, key];
      return { ...p, enabledPhases: next };
    });
  };

  const toggleAll = () => {
    setForms((p: any) => ({ ...p, enabledPhases: [] }));
  };

  const handleSubmit = () => {
    const nameValid = validateRequired('projName', forms.projName || '', 'Nombre');
    if (!nameValid) return;
    saveProject();
  };

  return (
    <CenterModal open={open} onClose={onClose} maxWidth={580}>
      <h2 className="text-lg font-semibold mb-4">{editingId ? 'Editar proyecto' : 'Nuevo proyecto'}</h2>

      <div className="space-y-3">
        <FormField label="Nombre" required error={errors.projName}>
          <FormInput
            value={forms.projName || ''}
            onChange={(e) => { setForms(p => ({ ...p, projName: e.target.value })); clearError('projName'); }}
            onBlur={() => onBlurRequired('projName', forms.projName || '', 'Nombre')}
            placeholder="Nombre del proyecto"
            error={errors.projName}
          />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Estado">
            <FormSelect
              value={forms.projStatus || 'Concepto'}
              onChange={(e) => setForms(p => ({ ...p, projStatus: e.target.value }))}
            >
              <option value="Concepto">Concepto</option>
              <option value="Diseno">Diseño</option>
              <option value="Ejecucion">Ejecución</option>
              <option value="Terminado">Terminado</option>
            </FormSelect>
          </FormField>

          <FormField label="Tipo de proyecto">
            <FormSelect
              value={projectType}
              onChange={(e) => setForms(p => ({ ...p, projType: e.target.value, enabledPhases: [] }))}
            >
              <option value="Diseño">Diseño</option>
              <option value="Ejecución">Ejecución</option>
              <option value="Ambos">Ambos</option>
            </FormSelect>
          </FormField>
        </div>

        {/* Fases toggle */}
        {!editingId && (
          <div className="bg-[var(--af-bg3)] rounded-lg p-3 border border-[var(--border)]">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[12px] font-semibold text-[var(--foreground)]">
                Fases del proyecto
              </div>
              <button
                type="button"
                className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--af-accent)]/10 text-[var(--af-accent)] cursor-pointer border-none hover:bg-[var(--af-accent)]/20"
                onClick={toggleAll}
              >
                {allEnabled ? 'Desactivar todas' : 'Activar todas'}
              </button>
            </div>
            {['Diseño', 'Ejecución'].filter(t => projectType === 'Ambos' || t === projectType).map(type => (
              <div key={type} className="mb-2 last:mb-0">
                <div className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${type === 'Diseño' ? 'text-violet-400' : 'text-amber-400'}`}>
                  {type}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {availablePhases.filter(p => p.type === type).map(phase => {
                    const isOn = allEnabled || enabledPhases.includes(phase.key);
                    return (
                      <button
                        key={phase.key}
                        type="button"
                        className={`text-left px-2.5 py-1.5 rounded-lg text-[11px] border cursor-pointer transition-all ${
                          isOn
                            ? type === 'Diseño'
                              ? 'bg-violet-500/10 text-violet-300 border-violet-500/30'
                              : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                            : 'bg-transparent text-[var(--muted-foreground)] border-[var(--border)] opacity-50'
                        }`}
                        onClick={() => togglePhase(phase.key)}
                        title={phase.description}
                      >
                        {isOn ? '✓ ' : '○ '}{phase.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="text-[10px] text-[var(--af-text3)] mt-2">
              Puedes activar/desactivar fases en cualquier momento desde el proyecto
            </div>
          </div>
        )}

        <FormField label="Cliente">
          <FormInput
            value={forms.projClient || ''}
            onChange={(e) => setForms(p => ({ ...p, projClient: e.target.value }))}
            placeholder="Nombre del cliente"
            list="company-names-datalist"
          />
          <datalist id="company-names-datalist">
            {companies.map((c: Company) => (
              <option key={c.id} value={c.data.name} />
            ))}
          </datalist>
        </FormField>

        <FormField label="Ubicación">
          <FormInput
            value={forms.projLocation || ''}
            onChange={(e) => setForms(p => ({ ...p, projLocation: e.target.value }))}
            placeholder="Ubicación del proyecto"
          />
        </FormField>

        <FormField label="Empresa">
          <FormSelect
            value={forms.projCompany || ''}
            onChange={(e) => {
              const comp = companies.find((c: Company) => c.id === e.target.value);
              setForms(p => ({
                ...p,
                projCompany: e.target.value,
                projClient: comp?.data?.name || p.projClient || '',
              }));
            }}
          >
            <option value="">— Sin empresa —</option>
            {companies.map((c: Company) => (
              <option key={c.id} value={c.id}>{c.data.name}</option>
            ))}
          </FormSelect>
        </FormField>

        <FormField label="Presupuesto COP">
          <FormInput
            type="number"
            value={forms.projBudget || ''}
            onChange={(e) => setForms(p => ({ ...p, projBudget: e.target.value }))}
            placeholder="0"
          />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Fecha inicio">
            <FormInput
              type="date"
              value={forms.projStart || ''}
              onChange={(e) => setForms(p => ({ ...p, projStart: e.target.value }))}
            />
          </FormField>
          <FormField label="Fecha entrega">
            <FormInput
              type="date"
              value={forms.projEnd || ''}
              onChange={(e) => setForms(p => ({ ...p, projEnd: e.target.value }))}
            />
          </FormField>
        </div>

        <FormField label="Descripción">
          <FormTextarea
            value={forms.projDesc || ''}
            onChange={(e) => setForms(p => ({ ...p, projDesc: e.target.value }))}
            placeholder="Descripción del proyecto"
            rows={3}
          />
        </FormField>
      </div>

      <ModalFooter
        onCancel={() => closeModal('project')}
        onSubmit={handleSubmit}
        submitLabel={editingId ? 'Actualizar' : 'Crear proyecto'}
      />
    </CenterModal>
  );
}
