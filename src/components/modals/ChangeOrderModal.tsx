'use client';
import React, { useState, useMemo } from 'react';
import CenterModal from '@/components/common/CenterModal';
import { useApp } from '@/contexts/AppContext';
import { FormField, FormInput, FormSelect, FormTextarea, useFormValidation } from '@/components/common/FormField';
import { CO_TYPES, CO_TYPE_LABELS } from '@/lib/types';
import { fmtCOP } from '@/lib/helpers';
import * as fbActions from '@/lib/firestore-actions';

export default function ChangeOrderModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { forms, setForms, editingId, closeModal, projects, showToast, authUser, activeTenantId } = useApp();
  const { errors, validateRequired, onBlurRequired, clearError } = useFormValidation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);

  const coType = forms.coType || 'alcance';
  const showCostImpact = coType === 'costo' || coType === 'combinado';
  const showScheduleImpact = coType === 'cronograma' || coType === 'combinado';

  const previousBudget = Number(forms.coPreviousBudget) || 0;
  const newBudget = Number(forms.coNewBudget) || 0;
  const difference = useMemo(() => newBudget - previousBudget, [newBudget, previousBudget]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (attachments.length + files.length > 5) {
      showToast('Máximo 5 archivos adjuntos', 'error');
      return;
    }
    const oversized = files.find(f => f.size > 10 * 1024 * 1024);
    if (oversized) {
      showToast('Cada archivo debe ser menor a 10MB', 'error');
      return;
    }
    setAttachments(prev => [...prev, ...files]);
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveDraft = async () => {
    const fields = [
      validateRequired('coTitle', forms.coTitle || '', 'Título'),
      validateRequired('coProject', forms.coProject || '', 'Proyecto'),
    ];
    if (fields.some(v => !v)) return;

    setIsSubmitting(true);
    try {
      // Upload attachments to Firebase Storage
      const uploadedAttachments: any[] = [];
      const { getFirebase } = await import('@/lib/firebase-service');
      const fb = getFirebase();
      if (attachments.length > 0) {
        const storage = fb.storage();
        for (const file of attachments) {
          try {
            const ref = storage.ref().child(`tenants/${activeTenantId}/changeOrders/${Date.now()}_${file.name}`);
            await ref.put(file);
            const url = await ref.getDownloadURL();
            uploadedAttachments.push({
              name: file.name,
              url,
              type: file.type,
              size: file.size,
              uploadedAt: fb.firestore.FieldValue.serverTimestamp(),
            });
          } catch (err) {
            console.error('[Archii] Error uploading attachment:', err);
          }
        }
      }

      const userName = authUser?.displayName || authUser?.email || 'Usuario';
      const uid = authUser?.uid || '';

      const costImpact = showCostImpact && (previousBudget > 0 || newBudget > 0) ? {
        previousBudget,
        newBudget,
        difference,
      } : undefined;

      const scheduleImpact = showScheduleImpact && Number(forms.coDaysExtension) > 0 ? {
        daysExtension: Number(forms.coDaysExtension) || 0,
        reason: forms.coScheduleReason || '',
      } : undefined;

      if (editingId) {
        await fbActions.updateChangeOrder(editingId, {
          title: forms.coTitle || '',
          type: forms.coType || 'alcance',
          description: forms.coDescription || '',
          justification: forms.coJustification || '',
          costImpact,
          scheduleImpact,
          attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
        });
        showToast('Orden actualizada');
      } else {
        await fbActions.createChangeOrder({
          tenantId: activeTenantId || '',
          projectId: forms.coProject || '',
          type: forms.coType || 'alcance',
          status: 'borrador',
          title: forms.coTitle || '',
          description: forms.coDescription || '',
          justification: forms.coJustification || '',
          costImpact,
          scheduleImpact,
          attachments: uploadedAttachments,
          createdBy: uid,
          createdByName: userName,
          createdAt: fb!.firestore.FieldValue.serverTimestamp(),
        });
        showToast('✅ Orden creada como borrador');
      }
      closeModal('changeOrder');
    } catch (err) {
      console.error('[Archii] Error saving CO:', err);
      showToast('Error al guardar orden', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitForApproval = async () => {
    const fields = [
      validateRequired('coTitle', forms.coTitle || '', 'Título'),
      validateRequired('coProject', forms.coProject || '', 'Proyecto'),
    ];
    if (fields.some(v => !v)) return;

    setIsSubmitting(true);
    try {
      // First save, then submit
      const userName = authUser?.displayName || authUser?.email || 'Usuario';
      const uid = authUser?.uid || '';

      const costImpact = showCostImpact && (previousBudget > 0 || newBudget > 0) ? {
        previousBudget,
        newBudget,
        difference,
      } : undefined;

      const scheduleImpact = showScheduleImpact && Number(forms.coDaysExtension) > 0 ? {
        daysExtension: Number(forms.coDaysExtension) || 0,
        reason: forms.coScheduleReason || '',
      } : undefined;

      // Upload attachments
      const uploadedAttachments: any[] = [];
      const { getFirebase } = await import('@/lib/firebase-service');
      const fb = getFirebase();
      if (attachments.length > 0) {
        const storage = fb.storage();
        for (const file of attachments) {
          try {
            const ref = storage.ref().child(`tenants/${activeTenantId}/changeOrders/${Date.now()}_${file.name}`);
            await ref.put(file);
            const url = await ref.getDownloadURL();
            uploadedAttachments.push({
              name: file.name,
              url,
              type: file.type,
              size: file.size,
              uploadedAt: fb.firestore.FieldValue.serverTimestamp(),
            });
          } catch (err) {
            console.error('[Archii] Error uploading attachment:', err);
          }
        }
      }

      let coId = editingId;
      if (!coId) {
        coId = await fbActions.createChangeOrder({
          tenantId: activeTenantId || '',
          projectId: forms.coProject || '',
          type: forms.coType || 'alcance',
          status: 'borrador',
          title: forms.coTitle || '',
          description: forms.coDescription || '',
          justification: forms.coJustification || '',
          costImpact,
          scheduleImpact,
          attachments: uploadedAttachments,
          createdBy: uid,
          createdByName: userName,
          createdAt: fb!.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        await fbActions.updateChangeOrder(coId, {
          title: forms.coTitle || '',
          type: forms.coType || 'alcance',
          description: forms.coDescription || '',
          justification: forms.coJustification || '',
          costImpact,
          scheduleImpact,
        });
      }

      // Now submit
      if (coId) {
        await fbActions.submitChangeOrder(coId, userName, uid);
        showToast('✅ Orden enviada para aprobación');
      }
      closeModal('changeOrder');
    } catch (err) {
      console.error('[Archii] Error submitting CO:', err);
      showToast('Error al enviar orden', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <CenterModal open={open} onClose={onClose} maxWidth={600}>
      <h2 className="text-lg font-semibold mb-4">{editingId ? 'Editar Orden de Cambio' : 'Nueva Orden de Cambio'}</h2>
      <div className="space-y-3">
        {!editingId && (
          <FormField label="Proyecto" required error={errors.coProject}>
            <FormSelect value={forms.coProject || ''} onChange={(e) => { setForms(p => ({ ...p, coProject: e.target.value })); clearError('coProject'); }} onBlur={() => onBlurRequired('coProject', forms.coProject || '', 'Proyecto')} error={errors.coProject}>
              <option value="">Seleccionar proyecto</option>
              {projects.filter((p: any) => p.data.status !== 'Terminado').map((p: any) => <option key={p.id} value={p.id}>{p.data.name}</option>)}
            </FormSelect>
          </FormField>
        )}
        <FormField label="Título" required error={errors.coTitle}>
          <FormInput value={forms.coTitle || ''} onChange={(e) => { setForms(p => ({ ...p, coTitle: e.target.value })); clearError('coTitle'); }} onBlur={() => onBlurRequired('coTitle', forms.coTitle || '', 'Título')} placeholder="Título de la orden de cambio" error={errors.coTitle} />
        </FormField>
        <FormField label="Tipo">
          <FormSelect value={forms.coType || 'alcance'} onChange={(e) => setForms(p => ({ ...p, coType: e.target.value }))}>
            {CO_TYPES.map(t => <option key={t} value={t}>{CO_TYPE_LABELS[t] || t}</option>)}
          </FormSelect>
        </FormField>
        <FormField label="Descripción">
          <FormTextarea value={forms.coDescription || ''} onChange={(e) => setForms(p => ({ ...p, coDescription: e.target.value }))} placeholder="Describe el cambio solicitado" rows={3} />
        </FormField>
        <FormField label="Justificación">
          <FormTextarea value={forms.coJustification || ''} onChange={(e) => setForms(p => ({ ...p, coJustification: e.target.value }))} placeholder="¿Por qué es necesario este cambio?" rows={3} />
        </FormField>

        {/* Cost Impact */}
        {showCostImpact && (
          <div className="bg-[var(--af-bg3)] rounded-lg p-3 space-y-3">
            <div className="text-xs font-semibold text-amber-400">💰 Impacto en Costo</div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Presupuesto anterior">
                <FormInput type="number" value={forms.coPreviousBudget || ''} onChange={(e) => setForms(p => ({ ...p, coPreviousBudget: e.target.value }))} placeholder="$0" />
              </FormField>
              <FormField label="Nuevo presupuesto">
                <FormInput type="number" value={forms.coNewBudget || ''} onChange={(e) => setForms(p => ({ ...p, coNewBudget: e.target.value }))} placeholder="$0" />
              </FormField>
            </div>
            {(previousBudget > 0 || newBudget > 0) && (
              <div className="text-[12px] flex justify-between items-center pt-2 border-t border-[var(--border)]">
                <span className="text-[var(--muted-foreground)]">Diferencia:</span>
                <span className={`font-bold ${difference >= 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {difference >= 0 ? '+' : ''}{fmtCOP(difference)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Schedule Impact */}
        {showScheduleImpact && (
          <div className="bg-[var(--af-bg3)] rounded-lg p-3 space-y-3">
            <div className="text-xs font-semibold text-blue-400">📅 Impacto en Cronograma</div>
            <FormField label="Días de extensión">
              <FormInput type="number" value={forms.coDaysExtension || ''} onChange={(e) => setForms(p => ({ ...p, coDaysExtension: e.target.value }))} placeholder="0" min="0" />
            </FormField>
            <FormField label="Razón de la extensión">
              <FormTextarea value={forms.coScheduleReason || ''} onChange={(e) => setForms(p => ({ ...p, coScheduleReason: e.target.value }))} placeholder="¿Por qué se necesita más tiempo?" rows={2} />
            </FormField>
          </div>
        )}

        {/* Attachments */}
        {!editingId && (
          <div>
            <FormField label="Archivos adjuntos (máx. 5, 10MB c/u)">
              <input
                type="file"
                multiple
                onChange={handleFileChange}
                className="w-full text-[12px] text-[var(--muted-foreground)] file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[12px] file:font-medium file:bg-[var(--af-accent)]/10 file:text-[var(--af-accent)] hover:file:bg-[var(--af-accent)]/20 cursor-pointer"
              />
            </FormField>
            {attachments.length > 0 && (
              <div className="mt-2 space-y-1">
                {attachments.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px] bg-[var(--af-bg3)] rounded-lg px-2 py-1">
                    <span className="truncate">{f.name}</span>
                    <button
                      className="text-red-400 hover:text-red-300 cursor-pointer bg-transparent border-none ml-2"
                      onClick={() => removeAttachment(i)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer with two action buttons */}
      <div className="flex gap-2 justify-end mt-5 pt-4 border-t border-[var(--border)]">
        <button
          className="px-4 py-2 rounded-lg text-[13px] font-medium cursor-pointer bg-transparent text-[var(--muted-foreground)] border border-[var(--input)] hover:bg-[var(--af-bg3)] hover:text-[var(--foreground)] transition-all disabled:opacity-50"
          onClick={() => closeModal('changeOrder')}
        >
          Cancelar
        </button>
        <button
          className="px-4 py-2 rounded-lg text-[13px] font-medium cursor-pointer bg-[var(--af-bg3)] text-[var(--foreground)] border border-[var(--input)] hover:bg-[var(--af-bg4)] transition-colors disabled:opacity-50"
          onClick={handleSaveDraft}
          disabled={isSubmitting}
        >
          Guardar Borrador
        </button>
        <button
          className="px-4 py-2 rounded-lg text-[13px] font-semibold cursor-pointer bg-[var(--af-accent)] text-background border-none hover:bg-[var(--af-accent2)] transition-colors disabled:opacity-50"
          onClick={handleSubmitForApproval}
          disabled={isSubmitting}
        >
          Enviar a Aprobación
        </button>
      </div>
    </CenterModal>
  );
}
