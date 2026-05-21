'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getFirebaseIdToken } from '@/lib/firebase-service';
import { getInitials } from '@/lib/helpers';
import { SkeletonListItem } from '@/components/ui/SkeletonLoaders';
import { Trash2, Copy } from 'lucide-react';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import ConfirmDialog from '@/components/common/ConfirmDialog';

interface ManageMembersModalProps {
  tenantId: string;
  tenantName: string;
  onClose: () => void;
  canRemove: boolean;  // true if current user can remove members
}

export default function ManageMembersModal({ tenantId, tenantName, onClose, canRemove }: ManageMembersModalProps) {
  const confirmDialog = useConfirmDialog();
  const [members, setMembers] = useState<any[]>([]);
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tenantCode, setTenantCode] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [searchAvailable, setSearchAvailable] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [tab, setTab] = useState<'members' | 'add' | 'code'>('members');
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);

  const showToast = (msg: string, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const apiCall = useCallback(async (body: any) => {
    const token = await getFirebaseIdToken();
    const res = await fetch('/api/tenants', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    return res.json();
  }, []);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiCall({ action: 'get-members', tenantId });
      if (data.error) {
        showToast(data.error, 'error');
        return;
      }
      setMembers(data.members || []);
      setAvailableUsers(data.availableUsers || []);
      setTenantCode(data.tenantCode || '');
    } catch (err: any) {
      showToast('Error cargando miembros: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [tenantId, apiCall]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  const handleAddAllUsers = async () => {
    if (!(await confirmDialog.confirm({ title: 'Agregar todos los usuarios', description: 'Se agregarán TODOS los usuarios registrados al tenant. ¿Continuar?' }))) return;
    setActionLoading(true);
    try {
      const data = await apiCall({ action: 'add-all-users', tenantId });
      if (data.error) { showToast(data.error, 'error'); return; }
      showToast(`${data.added} usuarios agregados. Total: ${data.newTotalMembers}`);
      await loadMembers();
    } catch (err: any) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddSelected = async () => {
    if (selectedUsers.size === 0) { showToast('Selecciona al menos un usuario', 'warning'); return; }
    setActionLoading(true);
    try {
      const emails = availableUsers
        .filter(u => selectedUsers.has(u.uid))
        .map(u => u.email);
      const data = await apiCall({ action: 'add-members', tenantId, emails });
      if (data.error) { showToast(data.error, 'error'); return; }
      showToast(`${data.added} miembros agregados`);
      setSelectedUsers(new Set());
      await loadMembers();
    } catch (err: any) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddByEmail = async () => {
    const emails = emailInput.split(',').map(e => e.trim()).filter(e => e.length > 0);
    if (emails.length === 0) { showToast('Ingresa al menos un email', 'warning'); return; }
    setActionLoading(true);
    try {
      const data = await apiCall({ action: 'add-members', tenantId, emails });
      if (data.error) { showToast(data.error, 'error'); return; }
      let msg = `${data.added} miembros agregados`;
      if (data.notFound?.length > 0) msg += `. No encontrados: ${data.notFound.join(', ')}`;
      if (data.alreadyMembers?.length > 0) msg += `. Ya miembros: ${data.alreadyMembers.join(', ')}`;
      showToast(msg);
      setEmailInput('');
      await loadMembers();
    } catch (err: any) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveMember = async (uid: string, name: string) => {
    if (!(await confirmDialog.confirm({ title: 'Eliminar miembro', description: `¿Eliminar a ${name} del tenant?` }))) return;
    setActionLoading(true);
    try {
      const data = await apiCall({ action: 'remove-member', tenantId, memberUid: uid });
      if (data.error) { showToast(data.error, 'error'); return; }
      showToast(`${name} eliminado del tenant`);
      await loadMembers();
    } catch (err: any) {
      console.error('[ManageMembers] remove-member error:', err);
      showToast('Error al eliminar: ' + (err.message || 'Error desconocido'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const toggleSelect = (uid: string) => {
    setSelectedUsers(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const selectAllVisible = () => {
    const filtered = filteredAvailable.map(u => u.uid);
    setSelectedUsers(prev => {
      const next = new Set(prev);
      filtered.forEach(uid => next.add(uid));
      return next;
    });
  };

  const copyCode = () => {
    navigator.clipboard.writeText(tenantCode).then(() => showToast('Codigo copiado al portapapeles'));
  };

  const filteredAvailable = availableUsers.filter(u =>
    `${u.name} ${u.email}`.toLowerCase().includes(searchAvailable.toLowerCase())
  );

  const modalRef = useRef<HTMLDivElement>(null);

  // Focus trap: keep Tab within modal
  useEffect(() => {
    const el = modalRef.current;
    if (!el) return;
    const focusable = el.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
      else { if (document.activeElement === last) { e.preventDefault(); first.focus(); } }
    };
    el.addEventListener('keydown', handleKeyDown);
    first.focus();
    return () => el.removeEventListener('keydown', handleKeyDown);
  }, [tab, loading]);

  // Close on Escape
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose} role="presentation">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="manage-members-title"
        className="bg-[var(--card)] border border-[var(--border)] rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <div>
            <h2 id="manage-members-title" className="text-lg font-bold text-[var(--foreground)]">Gestionar Miembros</h2>
            <p className="text-sm text-[var(--muted-foreground)]">{tenantName}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar modal" className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-xl p-1 cursor-pointer">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--border)]">
          {[
            { key: 'members' as const, label: `Miembros (${members.length})` },
            { key: 'add' as const, label: `Agregar (${availableUsers.length})` },
            { key: 'code' as const, label: 'Codigo' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-3 text-sm font-medium transition-colors cursor-pointer ${
                tab === t.key ? 'text-[var(--af-accent)] border-b-2 border-[var(--af-accent)]' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <SkeletonListItem key={i} hasAvatar lines={1} />)}
            </div>
          ) : tab === 'members' ? (
            <div className="space-y-2">
              {members.length === 0 ? (
                <p className="text-[var(--muted-foreground)] text-center py-8">No hay miembros en este tenant</p>
              ) : (
                members.map((m: any) => (
                  <div key={m.uid} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--af-bg3)] border border-[var(--border)]">
                    {m.photoURL ? (
                      <img src={m.photoURL} alt={m.name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-[var(--af-accent)] flex items-center justify-center text-[var(--primary-foreground)] text-sm font-bold flex-shrink-0">
                        {getInitials(m.name)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[var(--foreground)] text-sm font-medium truncate">{m.name}</p>
                      <p className="text-[var(--muted-foreground)] text-xs truncate">{m.email}</p>
                    </div>
                    {m.isCreator && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--af-accent)]/15 text-[var(--af-accent)] border border-[var(--af-accent)]/30 flex-shrink-0">
                        ADMIN
                      </span>
                    )}
                    {canRemove && !m.isCreator && (
                      <button
                        onClick={() => handleRemoveMember(m.uid, m.name)}
                        disabled={actionLoading}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-red-400 hover:bg-red-500/15 border border-red-500/20 transition-colors cursor-pointer flex-shrink-0"
                        title="Eliminar del tenant"
                      >
                        <Trash2 size={12} aria-hidden="true"/>
                        Quitar
                      </button>
                    )}
                  </div>
                ))
              )}
              {canRemove && availableUsers.length > 0 && (
                <button
                  onClick={handleAddAllUsers}
                  disabled={actionLoading}
                  className="w-full mt-3 py-3 rounded-xl bg-[var(--af-accent)] hover:opacity-90 text-[var(--primary-foreground)] text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer border-none"
                >
                  {actionLoading ? 'Agregando...' : `Agregar todos los usuarios (${availableUsers.length})`}
                </button>
              )}
            </div>
          ) : tab === 'add' ? (
            <div className="space-y-4">
              {/* Add by selecting from available users */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-[var(--foreground)]">Usuarios disponibles</label>
                  <button onClick={selectAllVisible} className="text-xs text-[var(--af-accent)] hover:opacity-80 cursor-pointer">
                    Seleccionar todos los visibles
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Buscar por nombre o email..."
                  value={searchAvailable}
                  onChange={e => setSearchAvailable(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--af-bg3)] border border-[var(--input)] text-[var(--foreground)] text-sm placeholder-[var(--af-text3)] focus:outline-none focus:border-[var(--af-accent)] mb-2"
                />
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {filteredAvailable.length === 0 ? (
                    <p className="text-[var(--af-text3)] text-sm text-center py-4">No hay usuarios disponibles</p>
                  ) : (
                    filteredAvailable.map(u => (
                      <label
                        key={u.uid}
                        className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                          selectedUsers.has(u.uid) ? 'bg-[var(--af-accent)]/10 border border-[var(--af-accent)]/40' : 'bg-[var(--af-bg3)] border border-transparent hover:bg-[var(--af-bg4)]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedUsers.has(u.uid)}
                          onChange={() => toggleSelect(u.uid)}
                          className="rounded border-[var(--input)]"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-[var(--foreground)] text-sm truncate">{u.name}</p>
                          <p className="text-[var(--muted-foreground)] text-xs truncate">{u.email}</p>
                        </div>
                      </label>
                    ))
                  )}
                </div>
                {selectedUsers.size > 0 && (
                  <button
                    onClick={handleAddSelected}
                    disabled={actionLoading}
                    className="w-full mt-2 py-2.5 rounded-lg bg-[var(--af-accent)] hover:opacity-90 text-[var(--primary-foreground)] text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer border-none"
                  >
                    {actionLoading ? 'Agregando...' : `Agregar ${selectedUsers.size} seleccionado(s)`}
                  </button>
                )}
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-[var(--border)]" />
                <span className="text-xs text-[var(--af-text3)]">o agregar por email</span>
                <div className="flex-1 h-px bg-[var(--border)]" />
              </div>

              {/* Add by email */}
              <div>
                <label className="text-sm font-medium text-[var(--foreground)] block mb-1">Emails (separados por coma)</label>
                <input
                  type="text"
                  placeholder="correo@ejemplo.com, otro@ejemplo.com"
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--af-bg3)] border border-[var(--input)] text-[var(--foreground)] text-sm placeholder-[var(--af-text3)] focus:outline-none focus:border-[var(--af-accent)]"
                />
                <button
                  onClick={handleAddByEmail}
                  disabled={actionLoading || !emailInput.trim()}
                  className="w-full mt-2 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer border-none"
                >
                  {actionLoading ? 'Agregando...' : 'Agregar por email'}
                </button>
              </div>
            </div>
          ) : (
            /* Code tab */
            <div className="text-center py-6">
              <p className="text-[var(--muted-foreground)] text-sm mb-4">Comparte este codigo para que otros se unan al tenant:</p>
              <div className="flex items-center justify-center gap-3">
                <div className="px-6 py-4 rounded-xl bg-[var(--af-bg3)] border border-[var(--border)]">
                  <span className="text-3xl font-bold text-[var(--foreground)] tracking-[0.3em]">{tenantCode}</span>
                </div>
                <button
                  onClick={copyCode}
                  className="p-3 rounded-xl bg-[var(--af-accent)] hover:opacity-90 text-[var(--primary-foreground)] transition-colors cursor-pointer border-none"
                  title="Copiar codigo"
                >
                  <Copy size={20} aria-hidden="true"/>
                </button>
              </div>
              <p className="text-[var(--af-text3)] text-xs mt-4">Los nuevos miembros entraran como Miembro</p>
            </div>
          )}
        </div>

        {/* Toast */}
        {toast && (
          <div className={`mx-4 mb-4 px-4 py-3 rounded-xl text-sm font-medium ${
            toast.type === 'error' ? 'bg-red-600/90 text-white' :
            toast.type === 'warning' ? 'bg-amber-600/90 text-white' :
            'bg-emerald-600/90 text-white'
          }`}>
            {toast.msg}
          </div>
        )}
      </div>
      <ConfirmDialog {...confirmDialog} />
    </div>
  );
}
