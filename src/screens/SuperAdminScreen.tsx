'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import { ADMIN_EMAILS, USER_ROLES, ROLE_COLORS, ROLE_ICONS } from '@/lib/types';
import { getFirebase, getFirebaseIdToken } from '@/lib/firebase-service';
import { avatarColor, getInitials } from '@/lib/helpers';
import {
  Shield, Building2, Users, BarChart3, Settings, Search, RefreshCw,
  Trash2, Edit3, UserPlus, UserMinus, Key, ArrowRightLeft, Eye,
  Copy, Check, ChevronDown, ChevronUp, AlertTriangle, Crown,
  Database, Activity, Globe, PlusCircle, XCircle, CheckCircle2,
  Loader2, MoreVertical
} from 'lucide-react';
import { SkeletonKPI, SkeletonChart, SkeletonTenantDetail } from '@/components/ui/SkeletonLoaders';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import ConfirmDialog from '@/components/common/ConfirmDialog';

type SuperAdminTab = 'dashboard' | 'tenants' | 'users' | 'tools';

/* ===== Helper: API caller ===== */
async function apiCall(action: string, body: Record<string, any> = {}): Promise<any> {
  const token = await getFirebaseIdToken();
  const res = await fetch('/api/super-admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, ...body }),
  });
  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Error del servidor (HTTP ${res.status})`);
  }
  if (!res.ok) throw new Error(data.error || `Error del servidor (HTTP ${res.status})`);
  return data;
}

export default function SuperAdminScreen() {
  const { authUser, showToast, switchTenant } = useApp();
  const [tab, setTab] = useState<SuperAdminTab>('dashboard');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Check super admin access
  const isSuperAdmin = authUser ? ADMIN_EMAILS.includes(authUser.email || '') : false;

  if (!isSuperAdmin) {
    return (
      <div className="animate-fadeIn p-6 text-center">
        <div className="text-5xl mb-4">🛡️</div>
        <div className="text-xl font-semibold mb-2">Acceso Restringido</div>
        <div className="text-sm text-[var(--muted-foreground)]">Solo Super Administradores pueden acceder a este panel.</div>
      </div>
    );
  }

  const handleAction = async (action: string, body: Record<string, any> = {}, successMsg?: string) => {
    setLoading(true);
    setError('');
    try {
      const result = await apiCall(action, body);
      if (successMsg) showToast(successMsg);
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setError(msg);
      showToast(msg, 'error');
      return null;
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fadeIn p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-amber-500 flex items-center justify-center shadow-lg">
            <Shield size={20} className="text-white" aria-hidden="true"/>
          </div>
          <div>
            <h2 className="text-lg font-semibold">Super Admin</h2>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">Gestión global de la plataforma</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] px-2 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-semibold">SUPER ADMIN</span>
          {loading && <Loader2 size={16} className="animate-spin text-[var(--af-accent)]" aria-hidden="true"/>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
        {([
          { id: 'dashboard' as SuperAdminTab, icon: <BarChart3 size={14} aria-hidden="true"/>, label: 'Dashboard' },
          { id: 'tenants' as SuperAdminTab, icon: <Building2 size={14} aria-hidden="true"/>, label: 'Tenants' },
          { id: 'users' as SuperAdminTab, icon: <Users size={14} aria-hidden="true"/>, label: 'Usuarios' },
          { id: 'tools' as SuperAdminTab, icon: <Settings size={14} aria-hidden="true"/>, label: 'Herramientas' },
        ]).map(t => (
          <button
            key={t.id}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer transition-all ${tab === t.id ? 'bg-[var(--af-accent)] text-background shadow-sm' : 'bg-[var(--af-bg3)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`}
            onClick={() => setTab(t.id)}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-400 text-xs">
          <AlertTriangle size={14} aria-hidden="true"/> {error}
          <button className="ml-auto hover:text-red-300" onClick={() => setError('')}><XCircle size={14} aria-hidden="true"/></button>
        </div>
      )}

      {/* Tab content */}
      {tab === 'dashboard' && <DashboardTab handleAction={handleAction} showToast={showToast} setLoading={setLoading} />}
      {tab === 'tenants' && <TenantsTab handleAction={handleAction} showToast={showToast} switchTenant={switchTenant} setLoading={setLoading} />}
      {tab === 'users' && <UsersTab handleAction={handleAction} showToast={showToast} setLoading={setLoading} />}
      {tab === 'tools' && <ToolsTab handleAction={handleAction} showToast={showToast} setLoading={setLoading} />}
    </div>
  );
}

/* ===== DASHBOARD TAB ===== */
function DashboardTab({ handleAction, showToast, setLoading }: { handleAction: any; showToast: any; setLoading: any }) {
  const [stats, setStats] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadDashboard = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await handleAction('dashboard', {}, '');
      if (data) setStats(data);
    } finally {
      setRefreshing(false);
    }
  }, [handleAction]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  if (!stats) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonKPI key={i} />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SkeletonChart height={160} />
          <SkeletonChart height={160} />
        </div>
      </div>
    );
  }

  const statCards = [
    { label: 'Tenants', value: stats.totalTenants, icon: <Building2 size={18} aria-hidden="true"/>, color: 'text-blue-400' },
    { label: 'Usuarios', value: stats.totalUsers, icon: <Users size={18} aria-hidden="true"/>, color: 'text-emerald-400' },
    { label: 'Proyectos', value: stats.totalProjects, icon: <Activity size={18} aria-hidden="true"/>, color: 'text-amber-400' },
    { label: 'Tareas', value: stats.totalTasks, icon: <CheckCircle2 size={18} aria-hidden="true"/>, color: 'text-purple-400' },
    { label: 'Gastos', value: stats.totalExpenses, icon: <Database size={18} aria-hidden="true"/>, color: 'text-red-400' },
    { label: 'Reuniones', value: stats.totalMeetings, icon: <Globe size={18} aria-hidden="true"/>, color: 'text-cyan-400' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Vista Global de la Plataforma</h3>
          <p className="text-xs text-[var(--muted-foreground)]">Resumen en tiempo real de todos los tenants</p>
        </div>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer bg-[var(--af-bg3)] border border-[var(--border)] hover:bg-[var(--af-bg4)] transition-all"
          onClick={loadDashboard}
          disabled={refreshing}
        >
          <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} aria-hidden="true"/> Actualizar
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map((s, i) => (
          <div key={i} className="bg-[var(--af-bg3)] rounded-xl p-4 border border-[var(--border)]">
            <div className={`mb-2 ${s.color}`}>{s.icon}</div>
            <div className="text-2xl font-bold">{s.value}</div>
            <div className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wide font-semibold">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Orphan users warning */}
      {stats.orphanUsersCount > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-amber-400" aria-hidden="true"/>
            <span className="text-sm font-semibold text-amber-400">Usuarios sin Tenant ({stats.orphanUsersCount})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {stats.orphanUsers.map((u: any, i: number) => (
              <div key={i} className="flex items-center gap-2 bg-[var(--card)] rounded-lg p-2.5 border border-[var(--border)]">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-semibold ${avatarColor(u.uid)}`}>{getInitials(u.name)}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{u.name}</div>
                  <div className="text-[10px] text-[var(--muted-foreground)] truncate">{u.email}</div>
                </div>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full border bg-[var(--af-bg3)] border-[var(--border)]">{u.role}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tenant summaries */}
      <div className="bg-[var(--af-bg3)] rounded-xl border border-[var(--border)] p-4">
        <h4 className="text-sm font-semibold mb-3">Tenants por miembros</h4>
        <div className="space-y-2">
          {stats.tenantSummaries.map((t: any, i: number) => (
            <div key={i} className="flex items-center gap-3 bg-[var(--card)] rounded-lg p-3 border border-[var(--border)]">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--af-accent)] to-[var(--af-accent2)] flex items-center justify-center flex-shrink-0">
                <Building2 size={14} className="text-background" aria-hidden="true"/>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold truncate">{t.name}</div>
                <div className="text-[10px] text-[var(--muted-foreground)]">Codigo: {t.code} · Creado: {t.createdAt ? new Date(t.createdAt).toLocaleDateString() : 'N/A'}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-sm font-bold">{t.memberCount}</div>
                <div className="text-[9px] text-[var(--muted-foreground)]">miembros</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ===== TENANTS TAB ===== */
function TenantsTab({ handleAction, showToast, switchTenant, setLoading }: { handleAction: any; showToast: any; switchTenant: any; setLoading: any }) {
  const [tenants, setTenants] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selectedTenant, setSelectedTenant] = useState<any>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showDetail, setShowDetail] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [expandedTenant, setExpandedTenant] = useState<string | null>(null);

  // Create form state
  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantOwner, setNewTenantOwner] = useState('');
  const [newTenantMigrate, setNewTenantMigrate] = useState(false);

  // Edit state
  const [editingTenantId, setEditingTenantId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');

  const confirmDialog = useConfirmDialog();

  const loadTenants = useCallback(async () => {
    setLoading(true);
    try {
      const data = await handleAction('list-tenants', {}, '');
      if (data) setTenants(data.tenants || []);
    } finally {
      setLoading(false);
    }
  }, [handleAction]);

  useEffect(() => { loadTenants(); }, [loadTenants]);

  const filteredTenants = tenants.filter((t: any) =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.code.toLowerCase().includes(search.toLowerCase())
  );

  const createTenant = async () => {
    if (!newTenantName.trim()) return showToast('Nombre requerido', 'error');
    const result = await handleAction('create-tenant', {
      name: newTenantName.trim(),
      ownerEmail: newTenantOwner.trim() || undefined,
      migrateExistingOwner: newTenantMigrate,
    }, `Tenant "${newTenantName.trim()}" creado exitosamente`);
    if (result) {
      setNewTenantName('');
      setNewTenantOwner('');
      setNewTenantMigrate(false);
      setShowCreateForm(false);
      loadTenants();
    }
  };

  const deleteTenant = async (tenantId: string, tenantName: string) => {
    const ok1 = await confirmDialog.confirm({ title: 'Eliminar tenant', description: `¿Eliminar el tenant "${tenantName}"?\n\nEsto eliminará el tenant de la lista. Los datos del tenant NO se eliminarán a menos que selecciones esa opción.` });
    if (!ok1) return;
    const deleteData = await confirmDialog.confirm({ title: 'Eliminar datos asociados', description: '¿También eliminar TODOS los datos asociados (proyectos, tareas, gastos, etc.)?\n\nConfirmar = Eliminar todo\nCancelar = Solo eliminar el tenant', confirmLabel: 'Eliminar todo' });
    const result = await handleAction('delete-tenant', { tenantId, deleteData }, `Tenant "${tenantName}" eliminado`);
    if (result) loadTenants();
  };

  const regenerateCode = async (tenantId: string) => {
    const result = await handleAction('regenerate-code', { tenantId }, 'Código regenerado');
    if (result) loadTenants();
  };

  const saveTenantEdit = async () => {
    if (!editingTenantId || !editName.trim()) return;
    await handleAction('update-tenant', { tenantId: editingTenantId, name: editName.trim(), code: editCode.trim() || undefined }, 'Tenant actualizado');
    setEditingTenantId(null);
    loadTenants();
  };

  const viewTenantDetail = async (tenantId: string) => {
    setLoadingDetail(true);
    setShowDetail(tenantId);
    try {
      const data = await handleAction('tenant-detail', { tenantId }, '');
      setDetailData(data);
    } finally {
      setLoadingDetail(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Actions bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" aria-hidden="true"/>
          <input
            type="text"
            placeholder="Buscar tenant por nombre o código..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--af-bg3)] border border-[var(--border)] text-xs text-[var(--foreground)] outline-none focus:border-[var(--af-accent)] transition-colors"
          />
        </div>
        <div className="flex gap-2">
          <button
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer bg-[var(--af-bg3)] border border-[var(--border)] hover:bg-[var(--af-bg4)] transition-all"
            onClick={loadTenants}
          >
            <RefreshCw size={12} aria-hidden="true"/> Actualizar
          </button>
          <button
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer bg-[var(--af-accent)] text-background hover:bg-[var(--af-accent2)] transition-all"
            onClick={() => setShowCreateForm(!showCreateForm)}
          >
            <PlusCircle size={12} aria-hidden="true"/> Nuevo Tenant
          </button>
        </div>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <div className="bg-[var(--af-bg3)] rounded-xl border border-[var(--border)] p-4 space-y-3">
          <h4 className="text-sm font-semibold flex items-center gap-2"><PlusCircle size={14} className="text-[var(--af-accent)]" aria-hidden="true"/> Crear Nuevo Tenant</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wide font-semibold block mb-1">Nombre *</label>
              <input
                type="text"
                placeholder="Constructora ABC"
                value={newTenantName}
                onChange={e => setNewTenantName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs text-[var(--foreground)] outline-none focus:border-[var(--af-accent)]"
              />
            </div>
            <div>
              <label className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wide font-semibold block mb-1">Email del Owner (opcional)</label>
              <input
                type="email"
                placeholder="propietario@ejemplo.com"
                value={newTenantOwner}
                onChange={e => setNewTenantOwner(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs text-[var(--foreground)] outline-none focus:border-[var(--af-accent)]"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={newTenantMigrate} onChange={e => setNewTenantMigrate(e.target.checked)} className="rounded" />
            Migrar datos existentes del owner al nuevo tenant
          </label>
          <div className="flex gap-2">
            <button onClick={createTenant} className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer bg-[var(--af-accent)] text-background hover:bg-[var(--af-accent2)] transition-all">
              Crear Tenant
            </button>
            <button onClick={() => setShowCreateForm(false)} className="px-4 py-2 rounded-lg text-xs font-medium cursor-pointer bg-[var(--af-bg4)] border border-[var(--border)] hover:bg-[var(--af-bg3)] transition-all">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Tenant list */}
      <div className="space-y-2">
        {filteredTenants.length === 0 && (
          <div className="text-center py-10 text-sm text-[var(--muted-foreground)]">
            {search ? 'No se encontraron tenants' : 'No hay tenants registrados'}
          </div>
        )}
        {filteredTenants.map((t: any) => (
          <div key={t.id} className="bg-[var(--af-bg3)] rounded-xl border border-[var(--border)] overflow-hidden">
            {/* Tenant header */}
            <div className="flex items-center gap-3 p-4">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[var(--af-accent)] to-[var(--af-accent2)] flex items-center justify-center flex-shrink-0">
                <Building2 size={18} className="text-background" aria-hidden="true"/>
              </div>
              <div className="flex-1 min-w-0">
                {editingTenantId === t.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="px-2 py-1 rounded bg-[var(--card)] border border-[var(--border)] text-xs w-40 outline-none focus:border-[var(--af-accent)]"
                    />
                    <input
                      type="text"
                      value={editCode}
                      onChange={e => setEditCode(e.target.value)}
                      maxLength={6}
                      className="px-2 py-1 rounded bg-[var(--card)] border border-[var(--border)] text-xs w-20 uppercase outline-none focus:border-[var(--af-accent)]"
                      placeholder={t.code}
                    />
                    <button onClick={saveTenantEdit} className="px-2 py-1 rounded bg-emerald-500 text-white text-[10px] font-semibold cursor-pointer">Guardar</button>
                    <button onClick={() => setEditingTenantId(null)} className="px-2 py-1 rounded bg-[var(--af-bg4)] text-[10px] cursor-pointer">X</button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold truncate">{t.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--card)] border border-[var(--border)] font-mono">{t.code}</span>
                    </div>
                    <div className="text-[10px] text-[var(--muted-foreground)]">
                      {t.memberCount} miembros · {t.projectCount} proyectos · {t.taskCount} tareas
                    </div>
                  </>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => setExpandedTenant(expandedTenant === t.id ? null : t.id)} className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer hover:bg-[var(--af-bg4)] transition-colors" title="Ver miembros">
                  {expandedTenant === t.id ? <ChevronUp size={14} aria-hidden="true"/> : <ChevronDown size={14} aria-hidden="true"/>}
                </button>
                <button onClick={() => viewTenantDetail(t.id)} className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer hover:bg-blue-500/10 text-blue-400 transition-colors" title="Ver detalle">
                  <Eye size={14} aria-hidden="true"/>
                </button>
                <button onClick={() => { setEditingTenantId(t.id); setEditName(t.name); setEditCode(t.code); }} className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer hover:bg-amber-500/10 text-amber-400 transition-colors" title="Editar">
                  <Edit3 size={14} aria-hidden="true"/>
                </button>
                <button onClick={() => regenerateCode(t.id)} className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer hover:bg-purple-500/10 text-purple-400 transition-colors" title="Regenerar código">
                  <Key size={14} aria-hidden="true"/>
                </button>
                <button onClick={() => deleteTenant(t.id, t.name)} className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer hover:bg-red-500/10 text-red-400 transition-colors" title="Eliminar">
                  <Trash2 size={14} aria-hidden="true"/>
                </button>
              </div>
            </div>

            {/* Expanded members */}
            {expandedTenant === t.id && t.membersResolved && (
              <div className="border-t border-[var(--border)] p-3 bg-[var(--card)]">
                <div className="text-[10px] uppercase tracking-wide font-semibold text-[var(--muted-foreground)] mb-2">Miembros ({t.membersResolved.length})</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {t.membersResolved.map((m: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-[var(--af-bg3)] border border-[var(--border)]">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-semibold overflow-hidden flex-shrink-0 ${m.photoURL ? '' : avatarColor(m.uid)}`}>
                        {m.photoURL ? <img src={m.photoURL} alt="" className="w-full h-full object-cover" /> : getInitials(m.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate flex items-center gap-1">
                          {m.name}
                          {m.isCreator && <Crown size={10} className="text-amber-400" aria-hidden="true"/>}
                        </div>
                        <div className="text-[10px] text-[var(--muted-foreground)] truncate">{m.email}</div>
                      </div>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full border flex-shrink-0 ${ROLE_COLORS[m.role] || ROLE_COLORS['Miembro']}`}>{m.role}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Tenant Detail Modal */}
      {showDetail && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => { setShowDetail(null); setDetailData(null); }}>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {loadingDetail ? (
              <SkeletonTenantDetail />
            ) : detailData ? (
              <>
                <div className="p-5 border-b border-[var(--border)] flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold">{detailData.name}</h3>
                    <p className="text-xs text-[var(--muted-foreground)]">Codigo: {detailData.code} · {detailData.membersResolved.length} miembros</p>
                  </div>
                  <button onClick={() => { setShowDetail(null); setDetailData(null); }} className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer hover:bg-[var(--af-bg4)]"><XCircle size={16} aria-hidden="true"/></button>
                </div>
                <div className="p-5 space-y-4">
                  {/* Collection stats */}
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {Object.entries(detailData.collectionStats || {}).filter(([_, v]) => (v as number) > 0).map(([key, val]) => (
                      <div key={key} className="bg-[var(--af-bg3)] rounded-lg p-2 text-center">
                        <div className="text-sm font-bold">{String(val)}</div>
                        <div className="text-[9px] text-[var(--muted-foreground)]">{key}</div>
                      </div>
                    ))}
                  </div>

                  {/* Members list */}
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)] mb-2">Miembros</h4>
                    <div className="space-y-1.5">
                      {detailData.membersResolved.map((m: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 p-2.5 rounded-lg bg-[var(--af-bg3)] border border-[var(--border)]">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-semibold overflow-hidden flex-shrink-0 ${m.photoURL ? '' : avatarColor(m.uid)}`}>
                            {m.photoURL ? <img src={m.photoURL} alt="" className="w-full h-full object-cover" /> : getInitials(m.name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold truncate flex items-center gap-1">{m.name}{m.isCreator && <Crown size={10} className="text-amber-400" aria-hidden="true"/>}</div>
                            <div className="text-[10px] text-[var(--muted-foreground)] truncate">{m.email}</div>
                          </div>
                          <span className={`text-[9px] px-2 py-0.5 rounded-full border ${ROLE_COLORS[m.role] || ROLE_COLORS['Miembro']}`}>{m.role}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Projects list */}
                  {detailData.projects && detailData.projects.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)] mb-2">Proyectos ({detailData.projects.length})</h4>
                      <div className="space-y-1.5">
                        {detailData.projects.map((p: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-[var(--af-bg3)] border border-[var(--border)]">
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium truncate">{p.name}</div>
                              <div className="text-[10px] text-[var(--muted-foreground)]">{p.client} · {p.progress}%</div>
                            </div>
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--card)] border border-[var(--border)]">{p.status}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
      <ConfirmDialog {...confirmDialog} />
    </div>
  );
}

/* ===== USERS TAB ===== */
function UsersTab({ handleAction, showToast, setLoading }: { handleAction: any; showToast: any; setLoading: any }) {
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState('');

  const confirmDialog = useConfirmDialog();

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await handleAction('list-all-users', {}, '');
      if (data) setUsers(data.users || []);
    } finally {
      setLoading(false);
    }
  }, [handleAction]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const filteredUsers = users.filter((u: any) => {
    const matchSearch = u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = filterRole === 'all' || u.role === filterRole;
    return matchSearch && matchRole;
  });

  const changeRole = async (uid: string, newRole: string, currentName: string) => {
    await handleAction('update-user-role', { targetUid: uid, newRole }, `Rol de ${currentName} cambiado a ${newRole}`);
    loadUsers();
  };

  const deleteUser = async (uid: string, name: string) => {
    if (!await confirmDialog.confirm({ title: 'Eliminar usuario', description: `¿Eliminar al usuario "${name}"?\n\nEsto lo removerá de TODOS los tenants y deshabilitará su cuenta.` })) return;
    await handleAction('delete-user', { targetUid: uid }, `Usuario "${name}" eliminado`);
    loadUsers();
  };

  const toggleSelect = (uid: string) => {
    setSelectedUsers(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid); else next.add(uid);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedUsers.size === filteredUsers.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(filteredUsers.map((u: any) => u.uid)));
    }
  };

  const executeBulkAction = async () => {
    if (selectedUsers.size === 0 || !bulkAction) return;
    const targetIds = Array.from(selectedUsers);

    if (bulkAction === 'delete') {
      if (!await confirmDialog.confirm({ title: 'Eliminar usuarios', description: `¿Eliminar ${targetIds.length} usuarios? Esta acción no se puede deshacer.` })) return;
      await handleAction('bulk-action', { type: 'bulk-delete', targetIds }, `${targetIds.length} usuarios eliminados`);
    } else {
      await handleAction('bulk-action', { type: 'change-roles', targetIds, newRole: bulkAction }, `${targetIds.length} roles cambiados a ${bulkAction}`);
    }
    setSelectedUsers(new Set());
    setBulkAction('');
    loadUsers();
  };

  return (
    <div className="space-y-4">
      {/* Actions bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" aria-hidden="true"/>
          <input
            type="text"
            placeholder="Buscar por nombre o email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--af-bg3)] border border-[var(--border)] text-xs text-[var(--foreground)] outline-none focus:border-[var(--af-accent)]"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={filterRole}
            onChange={e => setFilterRole(e.target.value)}
            className="px-3 py-2 rounded-lg bg-[var(--af-bg3)] border border-[var(--border)] text-xs text-[var(--foreground)] outline-none cursor-pointer"
          >
            <option value="all">Todos los roles</option>
            {USER_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <button onClick={loadUsers} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer bg-[var(--af-bg3)] border border-[var(--border)] hover:bg-[var(--af-bg4)] transition-all">
            <RefreshCw size={12} aria-hidden="true"/> Actualizar
          </button>
        </div>
      </div>

      {/* Bulk actions */}
      {selectedUsers.size > 0 && (
        <div className="bg-[var(--af-accent)]/10 border border-[var(--af-accent)]/20 rounded-xl p-3 flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold">{selectedUsers.size} seleccionado{selectedUsers.size > 1 ? 's' : ''}</span>
          <select value={bulkAction} onChange={e => setBulkAction(e.target.value)} className="px-2 py-1 rounded bg-[var(--card)] border border-[var(--border)] text-xs outline-none cursor-pointer">
            <option value="">Cambiar rol a...</option>
            {USER_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <button onClick={executeBulkAction} disabled={!bulkAction} className="px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer bg-[var(--af-accent)] text-background hover:bg-[var(--af-accent2)] transition-all disabled:opacity-50">
            Aplicar
          </button>
          <button onClick={() => setSelectedUsers(new Set())} className="ml-auto text-xs text-[var(--muted-foreground)] cursor-pointer hover:text-[var(--foreground)]">Deseleccionar</button>
        </div>
      )}

      {/* Select all */}
      <div className="flex items-center gap-2">
        <input type="checkbox" checked={selectedUsers.size === filteredUsers.length && filteredUsers.length > 0} onChange={selectAll} className="rounded cursor-pointer" />
        <span className="text-[10px] text-[var(--muted-foreground)]">Seleccionar todos ({filteredUsers.length})</span>
      </div>

      {/* Users list */}
      <div className="space-y-2">
        {filteredUsers.length === 0 && (
          <div className="text-center py-10 text-sm text-[var(--muted-foreground)]">No se encontraron usuarios</div>
        )}
        {filteredUsers.map((u: any) => (
          <div key={u.uid} className={`bg-[var(--af-bg3)] rounded-xl border p-4 transition-all ${selectedUsers.has(u.uid) ? 'border-[var(--af-accent)]/50 bg-[var(--af-accent)]/5' : 'border-[var(--border)]'}`}>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={selectedUsers.has(u.uid)}
                onChange={() => toggleSelect(u.uid)}
                className="rounded cursor-pointer flex-shrink-0"
              />
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 overflow-hidden ${u.photoURL ? '' : avatarColor(u.uid)}`}>
                {u.photoURL ? <img src={u.photoURL} alt="" className="w-full h-full object-cover" /> : getInitials(u.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold truncate">{u.name}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${ROLE_COLORS[u.role] || ROLE_COLORS['Miembro']}`}>{ROLE_ICONS[u.role]} {u.role}</span>
                  {ADMIN_EMAILS.includes(u.email) && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-semibold">SA</span>}
                </div>
                <div className="text-[10px] text-[var(--muted-foreground)] truncate">{u.email} · {u.tenantsCount} tenant{u.tenantsCount !== 1 ? 's' : ''}</div>
                {u.tenants && u.tenants.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {u.tenants.map((t: any, i: number) => (
                      <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--card)] border border-[var(--border)]">
                        {t.tenantName} ({t.role})
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* User actions */}
              {!ADMIN_EMAILS.includes(u.email) && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <select
                    value={u.role}
                    onChange={e => changeRole(u.uid, e.target.value, u.name)}
                    className="px-2 py-1 rounded-lg bg-[var(--card)] border border-[var(--border)] text-[10px] text-[var(--foreground)] outline-none cursor-pointer"
                  >
                    {USER_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <button
                    onClick={() => deleteUser(u.uid, u.name)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer hover:bg-red-500/10 text-red-400 transition-colors"
                    title="Eliminar usuario"
                  >
                    <Trash2 size={14} aria-hidden="true"/>
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <ConfirmDialog {...confirmDialog} />
    </div>
  );
}

/* ===== TOOLS TAB ===== */
function ToolsTab({ handleAction, showToast, setLoading }: { handleAction: any; showToast: any; setLoading: any }) {
  const [addUserState, setAddUserState] = useState({ tenantId: '', uid: '' });
  const [removeUserState, setRemoveUserState] = useState({ tenantId: '', uid: '' });
  const [transferState, setTransferState] = useState({ tenantId: '', newOwnerUid: '' });
  const [tenants, setTenants] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [actionLog, setActionLog] = useState<string[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tenantsData, usersData] = await Promise.all([
        handleAction('list-tenants', {}, ''),
        handleAction('list-all-users', {}, ''),
      ]);
      if (tenantsData) setTenants(tenantsData.tenants || []);
      if (usersData) setUsers(usersData.users || []);
    } finally {
      setLoading(false);
    }
  }, [handleAction]);

  useEffect(() => { loadData(); }, [loadData]);

  const addLog = (msg: string) => setActionLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));

  const addUserToTenant = async () => {
    if (!addUserState.tenantId || !addUserState.uid) return showToast('Selecciona tenant y usuario', 'error');
    const result = await handleAction('add-user-to-tenant', { tenantId: addUserState.tenantId, targetUid: addUserState.uid }, 'Usuario agregado al tenant');
    if (result) {
      addLog(`+ Usuario ${result.userEmail} agregado a "${result.tenantName}"`);
      loadData();
    }
  };

  const removeUserFromTenant = async () => {
    if (!removeUserState.tenantId || !removeUserState.uid) return showToast('Selecciona tenant y usuario', 'error');
    const result = await handleAction('remove-user-from-tenant', { tenantId: removeUserState.tenantId, targetUid: removeUserState.uid }, 'Usuario removido del tenant');
    if (result) {
      addLog(`- Usuario removido de "${result.tenantName}"`);
      loadData();
    }
  };

  const transferOwnership = async () => {
    if (!transferState.tenantId || !transferState.newOwnerUid) return showToast('Selecciona tenant y nuevo owner', 'error');
    const result = await handleAction('transfer-ownership', { tenantId: transferState.tenantId, newOwnerUid: transferState.newOwnerUid }, 'Propiedad transferida');
    if (result) {
      addLog(`Propiedad de "${result.tenantName}" transferida`);
      loadData();
    }
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Herramientas de Gestión</h3>

      {/* Add User to Tenant */}
      <div className="bg-[var(--af-bg3)] rounded-xl border border-[var(--border)] p-4">
        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><UserPlus size={14} className="text-emerald-400" aria-hidden="true"/> Agregar Usuario a Tenant</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <select value={addUserState.tenantId} onChange={e => setAddUserState(p => ({ ...p, tenantId: e.target.value }))} className="px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs outline-none cursor-pointer">
            <option value="">Seleccionar Tenant...</option>
            {tenants.map(t => <option key={t.id} value={t.id}>{t.name} ({t.code})</option>)}
          </select>
          <select value={addUserState.uid} onChange={e => setAddUserState(p => ({ ...p, uid: e.target.value }))} className="px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs outline-none cursor-pointer">
            <option value="">Seleccionar Usuario...</option>
            {users.map(u => <option key={u.uid} value={u.uid}>{u.name} ({u.email})</option>)}
          </select>
          <button onClick={addUserToTenant} className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer bg-emerald-500 text-white hover:bg-emerald-600 transition-all">Agregar</button>
        </div>
      </div>

      {/* Remove User from Tenant */}
      <div className="bg-[var(--af-bg3)] rounded-xl border border-[var(--border)] p-4">
        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><UserMinus size={14} className="text-red-400" aria-hidden="true"/> Remover Usuario de Tenant</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <select value={removeUserState.tenantId} onChange={e => setRemoveUserState(p => ({ ...p, tenantId: e.target.value }))} className="px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs outline-none cursor-pointer">
            <option value="">Seleccionar Tenant...</option>
            {tenants.map(t => <option key={t.id} value={t.id}>{t.name} ({t.code})</option>)}
          </select>
          <select value={removeUserState.uid} onChange={e => setRemoveUserState(p => ({ ...p, uid: e.target.value }))} className="px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs outline-none cursor-pointer">
            <option value="">Seleccionar Usuario...</option>
            {users.map(u => <option key={u.uid} value={u.uid}>{u.name} ({u.email})</option>)}
          </select>
          <button onClick={removeUserFromTenant} className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer bg-red-500 text-white hover:bg-red-600 transition-all">Remover</button>
        </div>
      </div>

      {/* Transfer Ownership */}
      <div className="bg-[var(--af-bg3)] rounded-xl border border-[var(--border)] p-4">
        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><ArrowRightLeft size={14} className="text-amber-400" aria-hidden="true"/> Transferir Propiedad de Tenant</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <select value={transferState.tenantId} onChange={e => setTransferState(p => ({ ...p, tenantId: e.target.value }))} className="px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs outline-none cursor-pointer">
            <option value="">Seleccionar Tenant...</option>
            {tenants.map(t => <option key={t.id} value={t.id}>{t.name} ({t.code})</option>)}
          </select>
          <select value={transferState.newOwnerUid} onChange={e => setTransferState(p => ({ ...p, newOwnerUid: e.target.value }))} className="px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs outline-none cursor-pointer">
            <option value="">Nuevo Owner...</option>
            {users.map(u => <option key={u.uid} value={u.uid}>{u.name} ({u.email})</option>)}
          </select>
          <button onClick={transferOwnership} className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer bg-amber-500 text-white hover:bg-amber-600 transition-all">Transferir</button>
        </div>
        <p className="text-[10px] text-[var(--muted-foreground)] mt-2">El nuevo owner debe ser miembro del tenant. El owner actual perderá el rol de Super Admin del tenant.</p>
      </div>

      {/* Action log */}
      {actionLog.length > 0 && (
        <div className="bg-[var(--af-bg3)] rounded-xl border border-[var(--border)] p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Registro de Acciones</h4>
            <button onClick={() => setActionLog([])} className="text-[10px] text-[var(--muted-foreground)] cursor-pointer hover:text-[var(--foreground)]">Limpiar</button>
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {actionLog.map((log, i) => (
              <div key={i} className="text-[10px] font-mono text-[var(--muted-foreground)] bg-[var(--card)] rounded px-2 py-1">{log}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
