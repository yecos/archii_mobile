'use client';
import React, { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { fmtCOP } from '@/lib/helpers';
import { CO_STATUS_COLORS, CO_TYPE_COLORS, CO_STATUS_LABELS, CO_TYPE_LABELS, toDate } from '@/lib/types';
import * as fbActions from '@/lib/firestore-actions';
import { CheckCircle, XCircle, Clock, FileEdit, Pencil, Paperclip } from 'lucide-react';

interface ChangeOrderApprovalProps {
  co: any;
  getProjectName: (id: string) => string;
  getUserName: (id: string) => string;
  canApprove: boolean;
  onClose: () => void;
  onEdit: () => void;
}

export default function ChangeOrderApproval({ co, getProjectName, getUserName, canApprove, onClose, onEdit }: ChangeOrderApprovalProps) {
  const { showToast, authUser } = useApp();
  const d = co.data;
  const statusCls = CO_STATUS_COLORS[d?.status] || 'bg-gray-500/10 text-gray-400 border-gray-500/30';
  const typeCls = CO_TYPE_COLORS[d?.type] || 'bg-gray-500/10 text-gray-400 border-gray-500/30';
  const statusLabel = CO_STATUS_LABELS[d?.status] || d?.status || '';
  const typeLabel = CO_TYPE_LABELS[d?.type] || d?.type || '';
  const projName = getProjectName(d?.projectId);

  const [comments, setComments] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showReject, setShowReject] = useState(false);

  const createdDate = d?.createdAt ? toDate(d.createdAt) : null;
  const approvedDate = d?.approvedAt ? toDate(d.approvedAt) : null;

  const costDiff = d?.costImpact?.difference;
  const costDiffCls = costDiff !== undefined
    ? costDiff >= 0 ? 'text-amber-400' : 'text-emerald-400'
    : '';

  const handleApprove = async () => {
    if (!authUser) return;
    setIsProcessing(true);
    try {
      await fbActions.approveChangeOrder(
        co.id,
        authUser.uid,
        authUser.displayName || authUser.email || 'Usuario',
        comments || 'Orden aprobada'
      );
      showToast('✅ Orden aprobada');
      onClose();
    } catch (err) {
      console.error('[Archii] Error approving CO:', err);
      showToast('Error al aprobar orden', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!authUser) return;
    if (!rejectionReason.trim()) {
      showToast('Indica la razón de rechazo', 'error');
      return;
    }
    setIsProcessing(true);
    try {
      await fbActions.rejectChangeOrder(
        co.id,
        authUser.uid,
        authUser.displayName || authUser.email || 'Usuario',
        rejectionReason
      );
      showToast('Orden rechazada');
      onClose();
    } catch (err) {
      console.error('[Archii] Error rejecting CO:', err);
      showToast('Error al rechazar orden', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmit = async () => {
    if (!authUser) return;
    setIsProcessing(true);
    try {
      await fbActions.submitChangeOrder(
        co.id,
        authUser.displayName || authUser.email || 'Usuario',
        authUser.uid
      );
      showToast('Orden enviada para aprobación');
      onClose();
    } catch (err) {
      console.error('[Archii] Error submitting CO:', err);
      showToast('Error al enviar orden', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold px-2 py-0.5 rounded-full bg-[var(--af-accent)]/15 text-[var(--af-accent)] border border-[var(--af-accent)]/30">
          {d?.orderNumber || 'CO-???'}
        </span>
        <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full border ${statusCls}`}>
          {statusLabel}
        </span>
        <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full border ${typeCls}`}>
          {typeLabel}
        </span>
      </div>

      {/* Title */}
      <h2 className="text-lg font-semibold">{d?.title || ''}</h2>

      {/* Project & creator info */}
      <div className="flex flex-wrap gap-3 text-[12px] text-[var(--muted-foreground)]">
        {projName && <span>📁 {projName}</span>}
        {d?.createdByName && <span>👤 {d.createdByName}</span>}
        {createdDate && <span>📅 {createdDate.toLocaleDateString('es-CO')}</span>}
      </div>

      {/* Description */}
      {d?.description && (
        <div>
          <div className="text-xs font-medium text-[var(--muted-foreground)] mb-1">Descripción</div>
          <div className="text-[13px] bg-[var(--af-bg3)] rounded-lg p-3 whitespace-pre-wrap">{d.description}</div>
        </div>
      )}

      {/* Justification */}
      {d?.justification && (
        <div>
          <div className="text-xs font-medium text-[var(--muted-foreground)] mb-1">Justificación</div>
          <div className="text-[13px] bg-[var(--af-bg3)] rounded-lg p-3 whitespace-pre-wrap">{d.justification}</div>
        </div>
      )}

      {/* Cost Impact */}
      {d?.costImpact && (
        <div className="bg-[var(--af-bg3)] rounded-lg p-3">
          <div className="text-xs font-medium text-[var(--muted-foreground)] mb-2 flex items-center gap-1">
            💰 Impacto en Costo
          </div>
          <div className="grid grid-cols-3 gap-2 text-[12px]">
            <div>
              <div className="text-[var(--muted-foreground)]">Anterior</div>
              <div className="font-semibold">{fmtCOP(d.costImpact.previousBudget || 0)}</div>
            </div>
            <div>
              <div className="text-[var(--muted-foreground)]">Nuevo</div>
              <div className="font-semibold">{fmtCOP(d.costImpact.newBudget || 0)}</div>
            </div>
            <div>
              <div className="text-[var(--muted-foreground)]">Diferencia</div>
              <div className={`font-semibold ${costDiffCls}`}>
                {costDiff !== undefined ? `${costDiff >= 0 ? '+' : ''}${fmtCOP(costDiff)}` : '-'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Impact */}
      {d?.scheduleImpact && d.scheduleImpact.daysExtension > 0 && (
        <div className="bg-[var(--af-bg3)] rounded-lg p-3">
          <div className="text-xs font-medium text-[var(--muted-foreground)] mb-2 flex items-center gap-1">
            📅 Impacto en Cronograma
          </div>
          <div className="text-[12px]">
            <div className="font-semibold text-blue-400 mb-1">+{d.scheduleImpact.daysExtension} días de extensión</div>
            {d.scheduleImpact.reason && (
              <div className="text-[var(--muted-foreground)]">{d.scheduleImpact.reason}</div>
            )}
          </div>
        </div>
      )}

      {/* Attachments */}
      {d?.attachments && d.attachments.length > 0 && (
        <div>
          <div className="text-xs font-medium text-[var(--muted-foreground)] mb-1 flex items-center gap-1">
            <Paperclip size={12} aria-hidden="true" /> Archivos adjuntos
          </div>
          <div className="space-y-1">
            {d.attachments.map((att: any, i: number) => (
              <a
                key={i}
                href={att.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-[12px] text-[var(--af-accent)] hover:underline"
              >
                <Paperclip size={10} aria-hidden="true" />
                {att.name || `Archivo ${i + 1}`}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Rejection Reason */}
      {d?.rejectionReason && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <div className="text-xs font-medium text-red-400 mb-1">Razón de rechazo</div>
          <div className="text-[12px] text-red-300">{d.rejectionReason}</div>
        </div>
      )}

      {/* Reviewed Comments */}
      {d?.reviewedComments && d?.status !== 'rechazada' && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
          <div className="text-xs font-medium text-emerald-400 mb-1">Comentarios de revisión</div>
          <div className="text-[12px] text-emerald-300">{d.reviewedComments}</div>
        </div>
      )}

      {/* Approval info */}
      {d?.approvedByName && approvedDate && (
        <div className="text-[11px] text-[var(--muted-foreground)]">
          Aprobada por {d.approvedByName} el {approvedDate.toLocaleDateString('es-CO')}
        </div>
      )}

      {/* History */}
      {d?.history && d.history.length > 0 && (
        <div>
          <div className="text-xs font-medium text-[var(--muted-foreground)] mb-2">Historial</div>
          <div className="space-y-2">
            {d.history.map((entry: any, i: number) => {
              const entryDate = entry.at ? toDate(entry.at) : null;
              const actionLabels: Record<string, string> = {
                created: 'Creada',
                submitted: 'Enviada',
                approved: 'Aprobada',
                rejected: 'Rechazada',
                cancelled: 'Cancelada',
              };
              const actionIcons: Record<string, React.ReactNode> = {
                created: <FileEdit size={12} className="text-gray-400" aria-hidden="true" />,
                submitted: <Clock size={12} className="text-amber-400" aria-hidden="true" />,
                approved: <CheckCircle size={12} className="text-emerald-400" aria-hidden="true" />,
                rejected: <XCircle size={12} className="text-red-400" aria-hidden="true" />,
                cancelled: <XCircle size={12} className="text-gray-400" aria-hidden="true" />,
              };
              return (
                <div key={i} className="flex items-start gap-2 text-[11px]">
                  {actionIcons[entry.action] || <Clock size={12} aria-hidden="true" />}
                  <div>
                    <span className="font-medium">{actionLabels[entry.action] || entry.action}</span>
                    {' por '}
                    <span className="text-[var(--af-accent)]">{entry.byName || 'Usuario'}</span>
                    {entryDate && <span className="text-[var(--muted-foreground)]"> — {entryDate.toLocaleDateString('es-CO')}</span>}
                    {entry.comments && <div className="text-[var(--muted-foreground)] mt-0.5">{entry.comments}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      {d?.status === 'borrador' && (
        <div className="flex gap-2 pt-3 border-t border-[var(--border)]">
          <button
            className="flex-1 px-3 py-2 rounded-lg text-[12px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30 cursor-pointer hover:bg-amber-500/20 transition-colors"
            onClick={handleSubmit}
            disabled={isProcessing}
          >
            📤 Enviar a Aprobación
          </button>
          <button
            className="px-3 py-2 rounded-lg text-[12px] font-semibold bg-[var(--af-bg3)] text-[var(--muted-foreground)] border border-[var(--input)] cursor-pointer hover:bg-[var(--af-bg4)] transition-colors"
            onClick={onEdit}
          >
            <Pencil size={14} aria-hidden="true"/>
          </button>
        </div>
      )}

      {d?.status === 'pendiente_aprobacion' && canApprove && (
        <div className="space-y-3 pt-3 border-t border-[var(--border)]">
          <div>
            <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Comentarios</label>
            <textarea
              className="w-full bg-[var(--af-bg3)] border border-[var(--input)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--af-accent)] transition-colors resize-none"
              rows={3}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Comentarios sobre la revisión..."
            />
          </div>
          {!showReject ? (
            <div className="flex gap-2">
              <button
                className="flex-1 px-3 py-2.5 rounded-lg text-[13px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 cursor-pointer hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                onClick={handleApprove}
                disabled={isProcessing}
              >
                ✓ Aprobar
              </button>
              <button
                className="flex-1 px-3 py-2.5 rounded-lg text-[13px] font-semibold bg-red-500/10 text-red-400 border border-red-500/30 cursor-pointer hover:bg-red-500/20 transition-colors"
                onClick={() => setShowReject(true)}
              >
                ✗ Rechazar
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-medium text-red-400 mb-1.5">Razón de rechazo *</label>
                <textarea
                  className="w-full bg-[var(--af-bg3)] border border-red-500/30 rounded-lg px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-red-500 transition-colors resize-none"
                  rows={3}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Explica por qué se rechaza..."
                />
              </div>
              <div className="flex gap-2">
                <button
                  className="flex-1 px-3 py-2.5 rounded-lg text-[13px] font-semibold bg-red-500 text-white border-none cursor-pointer hover:bg-red-600 transition-colors disabled:opacity-50"
                  onClick={handleReject}
                  disabled={isProcessing}
                >
                  Confirmar Rechazo
                </button>
                <button
                  className="px-3 py-2.5 rounded-lg text-[13px] font-medium bg-[var(--af-bg3)] text-[var(--muted-foreground)] border border-[var(--input)] cursor-pointer hover:bg-[var(--af-bg4)] transition-colors"
                  onClick={() => setShowReject(false)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
