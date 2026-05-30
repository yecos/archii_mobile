'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import { getFirebase } from '@/lib/firebase-service';
import { fmtDateTime } from '@/lib/helpers';
import { Shield, AlertTriangle, MessageSquare, Search, RefreshCw, Filter } from 'lucide-react';

/* ===== Types ===== */
type TabId = 'audit' | 'errors' | 'feedback';

interface AuditLog {
  id: string;
  tenantId: string;
  userId: string;
  userName: string;
  action: string;
  resourceType: string;
  resourceId: string;
  description: string;
  createdAt: any;
}

interface ErrorReport {
  id: string;
  tenantId: string;
  userId: string;
  userEmail: string;
  errorType: string;
  message: string;
  stackTrace: string;
  url: string;
  createdAt: any;
}

interface BetaFeedback {
  id: string;
  tenantId: string;
  userId: string;
  userName: string;
  userEmail: string;
  message: string;
  category: string;
  status: 'pending' | 'reviewed' | 'resolved';
  createdAt: any;
}

/* ===== Status badge helper (Feedback) ===== */
const feedbackStatusColor = (status: string): string => {
  switch (status) {
    case 'pending':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case 'reviewed':
      return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    case 'resolved':
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    default:
      return 'bg-[var(--af-bg4)] text-[var(--muted-foreground)] border-[var(--border)]';
  }
};

const feedbackStatusLabel = (status: string): string => {
  switch (status) {
    case 'pending': return 'Pendiente';
    case 'reviewed': return 'Revisado';
    case 'resolved': return 'Resuelto';
    default: return status;
  }
};

const FEEDBACK_STATUS_OPTIONS: BetaFeedback['status'][] = ['pending', 'reviewed', 'resolved'];

/* ===== Main Component ===== */
export default function AdminLogScreen() {
  const { authUser, activeTenantId, showToast } = useApp();
  const [tab, setTab] = useState<TabId>('audit');
  const [search, setSearch] = useState('');

  // Data states
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [errorReports, setErrorReports] = useState<ErrorReport[]>([]);
  const [feedbackItems, setFeedbackItems] = useState<BetaFeedback[]>([]);

  // Loading states
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [loadingErrors, setLoadingErrors] = useState(false);
  const [loadingFeedback, setLoadingFeedback] = useState(false);

  // Expanded rows
  const [expandedId, setExpandedId] = useState<string | null>(null);

  /* ===== Fetch audit logs ===== */
  const fetchAuditLogs = useCallback(async () => {
    if (!activeTenantId) return;
    setLoadingAudit(true);
    try {
      const db = getFirebase().firestore();
      const snap = await db
        .collection('audit_logs')
        .where('tenantId', '==', activeTenantId)
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get();
      const items = snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as AuditLog));
      setAuditLogs(items);
    } catch (err: any) {
      console.error('[AdminLog] Error cargando auditoría:', err);
      showToast('Error al cargar registros de auditoría', 'error');
    } finally {
      setLoadingAudit(false);
    }
  }, [activeTenantId, showToast]);

  /* ===== Fetch error reports ===== */
  const fetchErrorReports = useCallback(async () => {
    if (!activeTenantId) return;
    setLoadingErrors(true);
    try {
      const db = getFirebase().firestore();
      const snap = await db
        .collection('error_reports')
        .where('tenantId', '==', activeTenantId)
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get();
      const items = snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as ErrorReport));
      setErrorReports(items);
    } catch (err: any) {
      console.error('[AdminLog] Error cargando errores:', err);
      showToast('Error al cargar reportes de errores', 'error');
    } finally {
      setLoadingErrors(false);
    }
  }, [activeTenantId, showToast]);

  /* ===== Fetch beta feedback ===== */
  const fetchFeedback = useCallback(async () => {
    if (!activeTenantId) return;
    setLoadingFeedback(true);
    try {
      const db = getFirebase().firestore();
      const snap = await db
        .collection('beta_feedback')
        .where('tenantId', '==', activeTenantId)
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get();
      const items = snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as BetaFeedback));
      setFeedbackItems(items);
    } catch (err: any) {
      console.error('[AdminLog] Error cargando feedback:', err);
      showToast('Error al cargar feedback beta', 'error');
    } finally {
      setLoadingFeedback(false);
    }
  }, [activeTenantId, showToast]);

  /* ===== Load data on tab change ===== */
  useEffect(() => {
    if (!activeTenantId) return;
    if (tab === 'audit' && auditLogs.length === 0) fetchAuditLogs();
    if (tab === 'errors' && errorReports.length === 0) fetchErrorReports();
    if (tab === 'feedback' && feedbackItems.length === 0) fetchFeedback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, activeTenantId]);

  /* ===== Update feedback status in Firestore ===== */
  const updateFeedbackStatus = useCallback(async (itemId: string, newStatus: BetaFeedback['status']) => {
    try {
      const db = getFirebase().firestore();
      await db.collection('beta_feedback').doc(itemId).update({ status: newStatus });
      setFeedbackItems(prev =>
        prev.map(item => (item.id === itemId ? { ...item, status: newStatus } : item))
      );
      showToast(`Estado actualizado a "${feedbackStatusLabel(newStatus)}"`);
    } catch (err: any) {
      console.error('[AdminLog] Error actualizando estado:', err);
      showToast('Error al actualizar el estado', 'error');
    }
  }, [showToast]);

  /* ===== Filtering ===== */
  const filteredAudit = auditLogs.filter(item => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (item.userName || '').toLowerCase().includes(q) ||
      (item.action || '').toLowerCase().includes(q) ||
      (item.resourceType || '').toLowerCase().includes(q) ||
      (item.description || '').toLowerCase().includes(q)
    );
  });

  const filteredErrors = errorReports.filter(item => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (item.errorType || '').toLowerCase().includes(q) ||
      (item.message || '').toLowerCase().includes(q) ||
      (item.userEmail || '').toLowerCase().includes(q) ||
      (item.stackTrace || '').toLowerCase().includes(q)
    );
  });

  const filteredFeedback = feedbackItems.filter(item => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (item.userName || '').toLowerCase().includes(q) ||
      (item.userEmail || '').toLowerCase().includes(q) ||
      (item.message || '').toLowerCase().includes(q) ||
      (item.category || '').toLowerCase().includes(q) ||
      (item.status || '').toLowerCase().includes(q)
    );
  });

  /* ===== Current loading state ===== */
  const isLoading = tab === 'audit' ? loadingAudit : tab === 'errors' ? loadingErrors : loadingFeedback;

  /* ===== Refresh handler ===== */
  const handleRefresh = () => {
    if (tab === 'audit') fetchAuditLogs();
    else if (tab === 'errors') fetchErrorReports();
    else fetchFeedback();
  };

  /* ===== Tab config ===== */
  const tabs: { id: TabId; icon: React.ReactNode; label: string; count: number }[] = [
    { id: 'audit', icon: <Shield size={14} aria-hidden="true" />, label: 'Auditoría', count: filteredAudit.length },
    { id: 'errors', icon: <AlertTriangle size={14} aria-hidden="true" />, label: 'Errores', count: filteredErrors.length },
    { id: 'feedback', icon: <MessageSquare size={14} aria-hidden="true" />, label: 'Feedback', count: filteredFeedback.length },
  ];

  /* ===== No tenant guard ===== */
  if (!activeTenantId) {
    return (
      <div className="animate-fadeIn p-6 text-center">
        <div className="text-4xl mb-3">📋</div>
        <div className="text-lg font-semibold">Sin tenant activo</div>
        <div className="text-sm text-[var(--muted-foreground)] mt-1">Selecciona un tenant para ver los registros</div>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--af-accent)] to-[var(--af-accent2)] flex items-center justify-center shadow-lg">
            <Shield size={20} className="text-background" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Registros del Sistema</h2>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">Auditoría, errores y feedback beta</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 overflow-x-auto pb-1">
        {tabs.map(t => (
          <button
            key={t.id}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer transition-all ${tab === t.id ? 'bg-[var(--af-accent)] text-background shadow-sm' : 'bg-[var(--af-bg3)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`}
            onClick={() => { setTab(t.id); setExpandedId(null); setSearch(''); }}
          >
            {t.icon} {t.label}
            <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full ${tab === t.id ? 'bg-background/20' : 'bg-[var(--af-bg4)]'}`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Search + Refresh bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" aria-hidden="true" />
          <input
            type="text"
            placeholder={
              tab === 'audit'
                ? 'Buscar por usuario, acción, recurso...'
                : tab === 'errors'
                ? 'Buscar por tipo, mensaje, email...'
                : 'Buscar por usuario, mensaje, categoría...'
            }
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--af-bg3)] border border-[var(--border)] text-xs text-[var(--foreground)] outline-none focus:border-[var(--af-accent)] transition-colors"
          />
        </div>
        <button
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer bg-[var(--af-bg3)] border border-[var(--border)] hover:bg-[var(--af-bg4)] transition-all"
          onClick={handleRefresh}
          disabled={isLoading}
        >
          <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} aria-hidden="true" /> Actualizar
        </button>
      </div>

      {/* Content */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw size={24} className="animate-spin text-[var(--af-accent)]" aria-hidden="true" />
            <span className="text-xs text-[var(--muted-foreground)]">Cargando registros...</span>
          </div>
        </div>
      )}

      {!isLoading && tab === 'audit' && (
        <AuditTab items={filteredAudit} expandedId={expandedId} setExpandedId={setExpandedId} />
      )}
      {!isLoading && tab === 'errors' && (
        <ErrorsTab items={filteredErrors} expandedId={expandedId} setExpandedId={setExpandedId} />
      )}
      {!isLoading && tab === 'feedback' && (
        <FeedbackTab
          items={filteredFeedback}
          expandedId={expandedId}
          setExpandedId={setExpandedId}
          onUpdateStatus={updateFeedbackStatus}
        />
      )}
    </div>
  );
}

/* ===== AUDIT TAB ===== */
function AuditTab({
  items,
  expandedId,
  setExpandedId,
}: {
  items: AuditLog[];
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-3">📋</div>
        <div className="text-[15px] font-medium text-[var(--muted-foreground)] mb-1">Sin registros de auditoría</div>
        <div className="text-[13px] text-[var(--af-text3)]">Las acciones del sistema aparecerán aquí</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map(item => {
        const isExpanded = expandedId === item.id;
        return (
          <div
            key={item.id}
            className="bg-[var(--af-bg3)] rounded-xl border border-[var(--border)] overflow-hidden transition-all"
          >
            <button
              className="w-full text-left p-4 cursor-pointer hover:bg-[var(--af-bg4)]/50 transition-colors"
              onClick={() => setExpandedId(isExpanded ? null : item.id)}
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-[var(--af-accent)]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Shield size={14} className="text-[var(--af-accent)]" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold">{item.userName || 'Usuario desconocido'}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--af-accent)]/10 text-[var(--af-accent)] border border-[var(--af-accent)]/20">
                      {item.action || '—'}
                    </span>
                    <span className="text-[10px] text-[var(--muted-foreground)]">
                      {item.resourceType || '—'}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--muted-foreground)] mt-1 truncate">
                    {item.description || 'Sin descripción'}
                  </p>
                </div>
                <span className="text-[10px] text-[var(--af-text3)] flex-shrink-0 whitespace-nowrap">
                  {fmtDateTime(item.createdAt)}
                </span>
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-[var(--border)] p-4 bg-[var(--card)]">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <DetailField label="Fecha y hora" value={fmtDateTime(item.createdAt)} />
                  <DetailField label="Usuario" value={item.userName || '—'} />
                  <DetailField label="ID Usuario" value={item.userId || '—'} />
                  <DetailField label="Acción" value={item.action || '—'} />
                  <DetailField label="Tipo de recurso" value={item.resourceType || '—'} />
                  <DetailField label="ID Recurso" value={item.resourceId || '—'} />
                  <DetailField label="Descripción completa" value={item.description || '—'} fullWidth />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ===== ERRORS TAB ===== */
function ErrorsTab({
  items,
  expandedId,
  setExpandedId,
}: {
  items: ErrorReport[];
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-3">🛡️</div>
        <div className="text-[15px] font-medium text-[var(--muted-foreground)] mb-1">Sin reportes de errores</div>
        <div className="text-[13px] text-[var(--af-text3)]">Los errores del sistema aparecerán aquí</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map(item => {
        const isExpanded = expandedId === item.id;
        const stackPreview = (item.stackTrace || '').split('\n').slice(0, 2).join('\n');
        return (
          <div
            key={item.id}
            className="bg-[var(--af-bg3)] rounded-xl border border-[var(--border)] overflow-hidden transition-all"
          >
            <button
              className="w-full text-left p-4 cursor-pointer hover:bg-[var(--af-bg4)]/50 transition-colors"
              onClick={() => setExpandedId(isExpanded ? null : item.id)}
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <AlertTriangle size={14} className="text-red-400" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                      {item.errorType || 'Error'}
                    </span>
                    <span className="text-[11px] text-[var(--muted-foreground)]">
                      {item.userEmail || 'Usuario desconocido'}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--foreground)] mt-1 truncate">
                    {item.message || 'Sin mensaje'}
                  </p>
                  {stackPreview && (
                    <p className="text-[10px] text-[var(--af-text3)] mt-1 font-mono truncate">
                      {stackPreview}
                    </p>
                  )}
                </div>
                <span className="text-[10px] text-[var(--af-text3)] flex-shrink-0 whitespace-nowrap">
                  {fmtDateTime(item.createdAt)}
                </span>
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-[var(--border)] p-4 bg-[var(--card)]">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <DetailField label="Fecha y hora" value={fmtDateTime(item.createdAt)} />
                  <DetailField label="Tipo de error" value={item.errorType || '—'} />
                  <DetailField label="Email usuario" value={item.userEmail || '—'} />
                  <DetailField label="ID Usuario" value={item.userId || '—'} />
                  <DetailField label="URL" value={item.url || '—'} />
                  <DetailField label="Mensaje" value={item.message || '—'} />
                  {item.stackTrace && (
                    <DetailField label="Stack trace" value={item.stackTrace} fullWidth monospace />
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ===== FEEDBACK TAB ===== */
function FeedbackTab({
  items,
  expandedId,
  setExpandedId,
  onUpdateStatus,
}: {
  items: BetaFeedback[];
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  onUpdateStatus: (itemId: string, newStatus: BetaFeedback['status']) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-3">💬</div>
        <div className="text-[15px] font-medium text-[var(--muted-foreground)] mb-1">Sin feedback beta</div>
        <div className="text-[13px] text-[var(--af-text3)]">Los comentarios de los usuarios aparecerán aquí</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map(item => {
        const isExpanded = expandedId === item.id;
        return (
          <div
            key={item.id}
            className="bg-[var(--af-bg3)] rounded-xl border border-[var(--border)] overflow-hidden transition-all"
          >
            <button
              className="w-full text-left p-4 cursor-pointer hover:bg-[var(--af-bg4)]/50 transition-colors"
              onClick={() => setExpandedId(isExpanded ? null : item.id)}
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <MessageSquare size={14} className="text-blue-400" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold">{item.userName || 'Anónimo'}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full border">
                      {item.category || 'General'}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${feedbackStatusColor(item.status)}`}>
                      {feedbackStatusLabel(item.status)}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--muted-foreground)] mt-1 truncate">
                    {item.message || 'Sin mensaje'}
                  </p>
                </div>
                <span className="text-[10px] text-[var(--af-text3)] flex-shrink-0 whitespace-nowrap">
                  {fmtDateTime(item.createdAt)}
                </span>
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-[var(--border)] p-4 bg-[var(--card)]">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <DetailField label="Fecha y hora" value={fmtDateTime(item.createdAt)} />
                  <DetailField label="Nombre" value={item.userName || '—'} />
                  <DetailField label="Email" value={item.userEmail || '—'} />
                  <DetailField label="ID Usuario" value={item.userId || '—'} />
                  <DetailField label="Categoría" value={item.category || '—'} />
                  <DetailField label="Estado" value={feedbackStatusLabel(item.status)} />
                  <DetailField label="Mensaje completo" value={item.message || '—'} fullWidth />
                </div>

                {/* Status change buttons */}
                <div className="mt-4 pt-3 border-t border-[var(--border)]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wide font-semibold">
                      Cambiar estado:
                    </span>
                    {FEEDBACK_STATUS_OPTIONS.map(statusOpt => (
                      <button
                        key={statusOpt}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-medium cursor-pointer border transition-all ${item.status === statusOpt ? feedbackStatusColor(statusOpt) + ' ring-1 ring-current' : 'bg-[var(--af-bg4)] text-[var(--muted-foreground)] border-[var(--border)] hover:text-[var(--foreground)]'}`}
                        onClick={() => onUpdateStatus(item.id, statusOpt)}
                        disabled={item.status === statusOpt}
                      >
                        {feedbackStatusLabel(statusOpt)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ===== Detail Field Helper ===== */
function DetailField({
  label,
  value,
  fullWidth = false,
  monospace = false,
}: {
  label: string;
  value: string;
  fullWidth?: boolean;
  monospace?: boolean;
}) {
  return (
    <div className={fullWidth ? 'sm:col-span-2' : ''}>
      <div className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wide font-semibold mb-0.5">
        {label}
      </div>
      <div className={`text-xs text-[var(--foreground)] break-words ${monospace ? 'font-mono text-[10px] whitespace-pre-wrap bg-[var(--af-bg3)] rounded-lg p-3 max-h-48 overflow-y-auto' : ''}`}>
        {value}
      </div>
    </div>
  );
}
