'use client';
import React from 'react';
import CenterModal from '@/components/common/CenterModal';
import { useApp } from '@/contexts/AppContext';
import { FormField, FormInput, FormSelect, FormTextarea, ModalFooter, useFormValidation } from '@/components/common/FormField';
import { UserPlus, Repeat, Check } from 'lucide-react';

const DIAS_SEMANA_RECURRENTE = [
  { value: 0, label: 'Domingo', short: 'Dom' },
  { value: 1, label: 'Lunes', short: 'Lun' },
  { value: 2, label: 'Martes', short: 'Mar' },
  { value: 3, label: 'Miércoles', short: 'Mié' },
  { value: 4, label: 'Jueves', short: 'Jue' },
  { value: 5, label: 'Viernes', short: 'Vie' },
  { value: 6, label: 'Sábado', short: 'Sáb' },
];

export default function MeetingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { forms, setForms, editingId, editingMeeting, closeModal, saveMeeting, projects, teamUsers, authUser } = useApp();
  const { errors, validateRequired, onBlurRequired, clearError } = useFormValidation();

  const isRecurring = forms.meetRecurring === 'weekly';
  const selectedDate = forms.meetDate || '';
  const dateDayOfWeek = selectedDate ? new Date(selectedDate + 'T12:00:00').getDay() : 1;
  const recurringDay = forms.meetRecurringDayOfWeek !== undefined ? Number(forms.meetRecurringDayOfWeek) : dateDayOfWeek;

  const toggleAttendee = (name: string) => {
    const current = (forms.meetAttendees || '').split(',').map((s: string) => s.trim()).filter(Boolean);
    const idx = current.indexOf(name);
    if (idx >= 0) {
      current.splice(idx, 1);
    } else {
      current.push(name);
    }
    setForms(p => ({ ...p, meetAttendees: current.join(', ') }));
  };

  const isAttendeeInList = (name: string) => {
    const current = (forms.meetAttendees || '').split(',').map((s: string) => s.trim()).filter(Boolean);
    return current.includes(name);
  };

  const quickAddUsers = teamUsers.slice(0, 8);

  const handleRecurringToggle = () => {
    if (isRecurring) {
      setForms(p => ({ ...p, meetRecurring: 'none', meetRecurringDayOfWeek: undefined, meetRecurringEndDate: '' }));
    } else {
      setForms(p => ({ ...p, meetRecurring: 'weekly', meetRecurringDayOfWeek: String(dateDayOfWeek), meetRecurringEndDate: '' }));
    }
  };

  const handleSubmit = () => {
    if (!validateRequired('meetTitle', forms.meetTitle || '', 'Título')) return;
    saveMeeting();
  };

  return (
    <CenterModal open={open} onClose={onClose} maxWidth={480}>
      <h2 className="text-lg font-semibold mb-4">{editingId ? 'Editar reunión' : 'Nueva reunión'}</h2>

      <div className="space-y-3">
        <FormField label="Título" required error={errors.meetTitle}>
          <FormInput
            value={forms.meetTitle || ''}
            onChange={(e) => { clearError('meetTitle'); setForms(p => ({ ...p, meetTitle: e.target.value })); }}
            onBlur={() => onBlurRequired('meetTitle', forms.meetTitle || '', 'Título')}
            error={errors.meetTitle}
            placeholder="Título de la reunión"
          />
        </FormField>

        <FormField label="Proyecto">
          <FormSelect
            value={forms.meetProject || ''}
            onChange={(e) => setForms(p => ({ ...p, meetProject: e.target.value }))}
          >
            <option value="">— Sin proyecto —</option>
            {projects.map((p: any) => (
              <option key={p.id} value={p.id}>{p.data?.name || p.name}</option>
            ))}
          </FormSelect>
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Fecha" required>
            <FormInput
              type="date"
              value={forms.meetDate || ''}
              onChange={(e) => setForms(p => ({ ...p, meetDate: e.target.value }))}
            />
          </FormField>

          <FormField label="Hora">
            <FormInput
              type="time"
              value={forms.meetTime || '09:00'}
              onChange={(e) => setForms(p => ({ ...p, meetTime: e.target.value }))}
            />
          </FormField>
        </div>

        <FormField label="Duración">
          <FormSelect
            value={forms.meetDuration || '60'}
            onChange={(e) => setForms(p => ({ ...p, meetDuration: e.target.value }))}
          >
            <option value="15">15 min</option>
            <option value="30">30 min</option>
            <option value="45">45 min</option>
            <option value="60">60 min</option>
            <option value="90">90 min</option>
            <option value="120">120 min</option>
          </FormSelect>
        </FormField>

        {/* Recurrence Section */}
        <div className="border border-[var(--border)] rounded-lg p-3">
          <button
            type="button"
            className="flex items-center gap-2 w-full cursor-pointer"
            onClick={handleRecurringToggle}
          >
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${isRecurring ? 'bg-[var(--af-accent)] border-[var(--af-accent)]' : 'border-[var(--input)]'}`}>
              {isRecurring && (
                <Check size={12} className="text-background" aria-hidden="true"/>
              )}
            </div>
            <Repeat size={16} className={`transition-colors ${isRecurring ? 'text-[var(--af-accent)]' : 'text-[var(--muted-foreground)]'}`} aria-hidden="true"/>
            <span className="text-sm font-medium">Repetir semanalmente</span>
          </button>

          {isRecurring && (
            <div className="mt-3 space-y-3 pl-7">
              {/* Day of week selector */}
              <div>
                <label className="text-[11px] text-[var(--muted-foreground)] mb-1.5 block">Día de la semana</label>
                <div className="flex gap-1">
                  {DIAS_SEMANA_RECURRENTE.map(d => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => setForms(p => ({ ...p, meetRecurringDayOfWeek: String(d.value) }))}
                      className={`flex-1 text-[10px] py-1.5 rounded-md border cursor-pointer transition-all font-medium ${
                        recurringDay === d.value
                          ? 'bg-[var(--af-accent)] text-background border-[var(--af-accent)]'
                          : 'bg-[var(--af-bg3)] text-[var(--muted-foreground)] border-[var(--input)] hover:border-[var(--af-accent)]/40'
                      }`}
                    >
                      {d.short}
                    </button>
                  ))}
                </div>
              </div>

              {/* End date */}
              <div>
                <label className="text-[11px] text-[var(--muted-foreground)] mb-1.5 block">
                  Fecha de fin (opcional — si no se indica, se repite por 52 semanas)
                </label>
                <FormInput
                  type="date"
                  value={forms.meetRecurringEndDate || ''}
                  onChange={(e) => setForms(p => ({ ...p, meetRecurringEndDate: e.target.value }))}
                  min={forms.meetDate || undefined}
                />
              </div>

              {/* Preview */}
              {selectedDate && (
                <div className="text-[10px] text-[var(--muted-foreground)] bg-[var(--af-bg3)] rounded-md px-2.5 py-2">
                  Se crearán reuniones cada <span className="font-medium text-[var(--foreground)]">{DIAS_SEMANA_RECURRENTE[recurringDay].label}</span>
                  {forms.meetRecurringEndDate ? (
                    <> hasta el <span className="font-medium text-[var(--foreground)]">{forms.meetRecurringEndDate}</span></>
                  ) : (
                    <> por 52 semanas</>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <FormField label="Participantes">
          <FormInput
            value={forms.meetAttendees || ''}
            onChange={(e) => setForms(p => ({ ...p, meetAttendees: e.target.value }))}
            placeholder="Nombres separados por coma"
          />
          {quickAddUsers.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              <UserPlus size={12} className="text-[var(--muted-foreground)] mt-0.5 mr-0.5" aria-hidden="true"/>
              {quickAddUsers.map((u: any) => {
                const name = u.data?.name || u.name || '';
                const inList = isAttendeeInList(name);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleAttendee(name)}
                    className={`px-2 py-0.5 text-[11px] rounded-full border cursor-pointer transition-all ${
                      inList
                        ? 'bg-[var(--af-accent)]/15 text-[var(--af-accent)] border-[var(--af-accent)]/30'
                        : 'bg-[var(--af-bg3)] text-[var(--muted-foreground)] border-[var(--input)] hover:border-[var(--af-accent)]/30'
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          )}
        </FormField>

        <FormField label="Descripción">
          <FormTextarea
            value={forms.meetDesc || ''}
            onChange={(e) => setForms(p => ({ ...p, meetDesc: e.target.value }))}
            placeholder="Agenda o notas de la reunión"
            rows={3}
          />
        </FormField>
      </div>

      <ModalFooter
        onCancel={() => closeModal('meeting')}
        onSubmit={handleSubmit}
        submitLabel={editingId ? 'Actualizar' : 'Crear reunión'}
      />
    </CenterModal>
  );
}
