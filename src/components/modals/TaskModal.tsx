'use client';
import React, { useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { FormField, FormInput, FormSelect, FormTextarea, ModalFooter, useFormValidation } from '@/components/common/FormField';
import CenterModal from '@/components/common/CenterModal';
import { X, Users, Plus, Trash2, Tag, Clock } from 'lucide-react';

export default function TaskModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { forms, setForms, editingId, closeModal, saveTask, isSavingTask, projects, teamUsers, authUser, getPhasesForProject, loadPhasesForProject, projectPhasesCache } = useApp() as any;
  const { errors, validateRequired, onBlurRequired, clearError } = useFormValidation();

  const assignees: string[] = Array.isArray(forms.taskAssignees) ? forms.taskAssignees : [];
  const subtasks: { text: string; done: boolean }[] = Array.isArray(forms.taskSubtasks) ? forms.taskSubtasks : [];
  const tags: string[] = Array.isArray(forms.taskTags) ? forms.taskTags : [];
  const [tagInput, setTagInput] = React.useState('');

  // Get phases for the currently selected project in the modal
  const modalProjectId = forms.taskProject || '';
  const currentPhases: any[] = modalProjectId ? (getPhasesForProject(modalProjectId) || []) : [];

  // When project changes, load its phases on demand if not cached
  useEffect(() => {
    if (open && modalProjectId && !projectPhasesCache[modalProjectId]) {
      loadPhasesForProject(modalProjectId);
    }
  }, [open, modalProjectId, projectPhasesCache]);

  // Re-check after cache updates (loadPhasesForProject is async)
  const effectivePhases: any[] = modalProjectId && projectPhasesCache[modalProjectId]
    ? projectPhasesCache[modalProjectId]
    : currentPhases;

  // Sync tag input when modal opens with editing data
  React.useEffect(() => {
    if (open) setTagInput('');
  }, [open]);

  const toggleAssignee = (uid: string) => {
    setForms((p: Record<string, any>) => {
      const current = Array.isArray(p.taskAssignees) ? p.taskAssignees : [];
      const updated = current.includes(uid) ? current.filter((id: string) => id !== uid) : [...current, uid];
      return { ...p, taskAssignees: updated, taskAssignee: updated[0] || '' };
    });
  };

  const removeAssignee = (uid: string) => {
    setForms((p: Record<string, any>) => {
      const current = Array.isArray(p.taskAssignees) ? p.taskAssignees : [];
      const updated = current.filter((id: string) => id !== uid);
      return { ...p, taskAssignees: updated, taskAssignee: updated[0] || '' };
    });
  };

  const addSubtask = () => {
    setForms((p: Record<string, any>) => ({
      ...p,
      taskSubtasks: [...(Array.isArray(p.taskSubtasks) ? p.taskSubtasks : []), { text: '', done: false }],
    }));
  };

  const updateSubtask = (index: number, field: 'text' | 'done', value: string | boolean) => {
    setForms((p: Record<string, any>) => {
      const current = Array.isArray(p.taskSubtasks) ? [...p.taskSubtasks] : [];
      current[index] = { ...current[index], [field]: value };
      return { ...p, taskSubtasks: current };
    });
  };

  const removeSubtask = (index: number) => {
    setForms((p: Record<string, any>) => ({
      ...p,
      taskSubtasks: (Array.isArray(p.taskSubtasks) ? p.taskSubtasks : []).filter((_: unknown, i: number) => i !== index),
    }));
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) {
      setForms((p: Record<string, any>) => ({ ...p, taskTags: [...tags, t] }));
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setForms((p: Record<string, any>) => ({ ...p, taskTags: tags.filter((t: string) => t !== tag) }));
  };

  const doneSubtasks = subtasks.filter(s => s.done).length;

  const handleSubmit = () => {
    const titleValid = validateRequired('taskTitle', forms.taskTitle || '', 'Titulo');
    if (!titleValid) return;
    saveTask();
  };

  return (
    <CenterModal open={open} onClose={onClose} maxWidth={520}>
      <h2 className="text-lg font-semibold mb-4">{editingId ? 'Editar tarea' : 'Nueva tarea'}</h2>

      <div className="space-y-3">
        <FormField label="Titulo" required error={errors.taskTitle}>
          <FormInput
            value={forms.taskTitle || ''}
            onChange={(e) => { setForms((p: Record<string, any>) => ({ ...p, taskTitle: e.target.value })); clearError('taskTitle'); }}
            onBlur={() => onBlurRequired('taskTitle', forms.taskTitle || '', 'Titulo')}
            placeholder="Titulo de la tarea"
            error={errors.taskTitle}
          />
        </FormField>

        <FormField label="Descripcion">
          <FormTextarea
            value={forms.taskDescription || ''}
            onChange={(e) => setForms((p: Record<string, any>) => ({ ...p, taskDescription: e.target.value }))}
            placeholder="Descripcion de la tarea"
            rows={3}
          />
        </FormField>

        <FormField label="Proyecto">
          <FormSelect
            value={forms.taskProject || ''}
            onChange={(e) => setForms((p: Record<string, any>) => ({ ...p, taskProject: e.target.value, taskPhase: '' }))}
          >
            <option value="">— Sin proyecto —</option>
            {projects.map((p: any) => (
              <option key={p.id} value={p.id}>{p.data?.name || p.name}</option>
            ))}
          </FormSelect>
        </FormField>

        {/* Fase — works for ANY project selected, not just the active one */}
        {forms.taskProject && effectivePhases.length > 0 && (
          <FormField label="Fase">
            <FormSelect
              value={forms.taskPhase || ''}
              onChange={(e) => setForms((p: Record<string, any>) => ({ ...p, taskPhase: e.target.value }))}
            >
              <option value="">— Sin fase —</option>
              {effectivePhases
                .filter((ph: any) => ph.data.enabled !== false)
                .map((ph: any) => (
                  <option key={ph.id} value={ph.id}>{ph.data.type ? `[${ph.data.type}] ` : ''}{ph.data.name}</option>
                ))}
            </FormSelect>
          </FormField>
        )}

        {/* Responsables multiples */}
        <FormField label="Responsables">
          <div className="space-y-2">
            {/* Chips de responsables seleccionados */}
            {assignees.length > 0 && (
              <div className="flex flex-wrap gap-1.5 p-2 bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg min-h-[36px]">
                {assignees.map((uid: string) => {
                  const user = teamUsers.find((u: any) => u.id === uid);
                  const name = user?.data?.name || (user as any)?.name || uid;
                  return (
                    <span
                      key={uid}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--af-accent)]/15 text-[var(--af-accent)] border border-[var(--af-accent)]/20"
                    >
                      {name}{uid === authUser?.uid ? ' (Tu)' : ''}
                      <button
                        type="button"
                        aria-label="Quitar asignado"
                        className="ml-0.5 hover:text-red-400 cursor-pointer bg-transparent border-none p-0"
                        onClick={() => removeAssignee(uid)}
                      >
                        <X size={11} className="stroke-current" aria-hidden="true"/>
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Lista de checkbox para seleccionar */}
            <div className="border border-[var(--border)] rounded-lg overflow-hidden max-h-[180px] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
              <div className="px-2.5 py-2 bg-[var(--af-bg3)] border-b border-[var(--border)] flex items-center gap-1.5 text-[11px] text-[var(--muted-foreground)] font-medium">
                <Users size={12} aria-hidden="true"/>
                {assignees.length === 0 ? 'Seleccionar responsables' : `${assignees.length} responsable${assignees.length > 1 ? 's' : ''} seleccionado${assignees.length > 1 ? 's' : ''}`}
              </div>
              {teamUsers.length === 0 && (
                <div className="px-3 py-3 text-[12px] text-[var(--muted-foreground)] text-center">
                  No hay miembros en el equipo
                </div>
              )}
              {teamUsers.map((u: any) => {
                const uid = u.id;
                const name = u.data?.name || u.name || 'Sin nombre';
                const isChecked = assignees.includes(uid);
                return (
                  <label
                    key={uid}
                    className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-[var(--af-bg3)] transition-colors border-b border-[var(--border)] last:border-0 ${isChecked ? 'bg-[var(--af-accent)]/5' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleAssignee(uid)}
                      className="w-3.5 h-3.5 rounded border-[var(--input)] text-[var(--af-accent)] cursor-pointer accent-[var(--af-accent)]"
                    />
                    <span className="text-[12px] text-[var(--foreground)] flex-1">{name}{uid === authUser?.uid ? ' (Tu)' : ''}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </FormField>

        <div className="grid grid-cols-3 gap-3">
          <FormField label="Prioridad">
            <FormSelect
              value={forms.taskPriority || 'Media'}
              onChange={(e) => setForms((p: Record<string, any>) => ({ ...p, taskPriority: e.target.value }))}
            >
              <option value="Alta">Alta</option>
              <option value="Media">Media</option>
              <option value="Baja">Baja</option>
            </FormSelect>
          </FormField>

          <FormField label="Estado">
            <FormSelect
              value={forms.taskStatus || 'Por hacer'}
              onChange={(e) => setForms((p: Record<string, any>) => ({ ...p, taskStatus: e.target.value }))}
            >
              <option value="Por hacer">Por hacer</option>
              <option value="En progreso">En progreso</option>
              <option value="Revision">Revision</option>
              <option value="Completado">Completado</option>
            </FormSelect>
          </FormField>

          <FormField label="Horas est.">
            <FormInput
              type="number"
              min="0"
              step="0.5"
              value={forms.taskEstimatedHours ?? ''}
              onChange={(e) => setForms((p: Record<string, any>) => ({ ...p, taskEstimatedHours: e.target.value ? Number(e.target.value) : null }))}
              placeholder="0"
            />
          </FormField>
        </div>

        <FormField label="Fecha limite">
          <FormInput
            type="date"
            value={forms.taskDue || ''}
            onChange={(e) => setForms((p: Record<string, any>) => ({ ...p, taskDue: e.target.value }))}
          />
        </FormField>

        {/* Tags */}
        <FormField label={`Etiquetas ${tags.length > 0 ? `(${tags.length})` : ''}`}>
          <div className="space-y-2">
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 p-2 bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg min-h-[36px]">
                {tags.map((tag: string) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-violet-500/10 text-violet-400 border border-violet-500/20"
                  >
                    <Tag size={9} aria-hidden="true"/>
                    {tag}
                    <button
                      type="button"
                      aria-label="Quitar etiqueta"
                      className="ml-0.5 hover:text-red-400 cursor-pointer bg-transparent border-none p-0"
                      onClick={() => removeTag(tag)}
                    >
                      <X size={10} className="stroke-current" aria-hidden="true"/>
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                placeholder="Agregar etiqueta..."
                className="flex-1 text-[12px] bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-[var(--foreground)] outline-none focus:border-[var(--af-accent)]/50"
              />
              <button
                type="button"
                className="px-2.5 py-1.5 rounded-lg bg-[var(--af-bg3)] border border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--af-accent)]/30 hover:text-[var(--af-accent)] cursor-pointer transition-colors"
                onClick={addTag}
              >
                <Plus size={13} aria-hidden="true"/>
              </button>
            </div>
          </div>
        </FormField>

        {/* Subtareas */}
        <FormField label={`Subtareas ${subtasks.length > 0 ? `(${doneSubtasks}/${subtasks.length})` : ''}`}>
          <div className="space-y-2">
            {subtasks.map((st: { text: string; done: boolean }, idx: number) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={st.done}
                  onChange={e => updateSubtask(idx, 'done', e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-[var(--input)] text-[var(--af-accent)] cursor-pointer accent-[var(--af-accent)] flex-shrink-0"
                />
                <input
                  type="text"
                  value={st.text}
                  onChange={e => updateSubtask(idx, 'text', e.target.value)}
                  placeholder={`Subtarea ${idx + 1}`}
                  className={`flex-1 text-[12px] bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-[var(--foreground)] outline-none focus:border-[var(--af-accent)]/50 ${st.done ? 'line-through text-[var(--af-text3)]' : ''}`}
                />
                <button
                  type="button"
                  aria-label="Eliminar subtarea"
                  className="text-[var(--af-text3)] hover:text-red-400 cursor-pointer bg-transparent border-none p-0 flex-shrink-0"
                  onClick={() => removeSubtask(idx)}
                >
                  <Trash2 size={13} aria-hidden="true"/>
                </button>
              </div>
            ))}
            <button
              type="button"
              className="flex items-center gap-1.5 text-[11px] text-[var(--af-accent)] cursor-pointer hover:underline bg-transparent border-none p-0 font-medium"
              onClick={addSubtask}
            >
              <Plus size={13} aria-hidden="true"/> Agregar subtarea
            </button>
          </div>
        </FormField>
      </div>

      <ModalFooter
        onCancel={() => closeModal('task')}
        onSubmit={handleSubmit}
        submitLabel={isSavingTask ? 'Guardando...' : editingId ? 'Actualizar' : 'Crear tarea'}
        submitDisabled={isSavingTask}
      />
    </CenterModal>
  );
}
