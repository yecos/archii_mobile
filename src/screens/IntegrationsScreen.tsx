'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Puzzle, Search } from 'lucide-react';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import ConfirmDialog from '@/components/common/ConfirmDialog';

/* ================================================================
   TYPES (local to screen)
   ================================================================ */

interface ProviderInfo {
  id: string;
  name: string;
  icon: string;
  description: string;
  category: string;
  authType: string;
  configSchema: ConfigField[];
  eventTypes: string[];
  enabled: boolean;
  docsUrl?: string;
}

interface ConfigField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'url' | 'select';
  required: boolean;
  placeholder?: string;
  helpText?: string;
}

interface InstalledIntegration {
  id: string;
  tenantId: string;
  providerId: string;
  status: string;
  config: Record<string, string>;
  events: string[];
  lastSyncAt?: string;
  errorMessage?: string;
  installedBy: string;
  createdAt: string;
  updatedAt: string;
}

interface LogEntry {
  id: string;
  instanceId: string;
  providerId: string;
  event: string;
  direction: string;
  status: string;
  statusCode?: number;
  error?: string;
  createdAt: string;
}

const CATEGORIES: { id: string; label: string; icon: string }[] = [
  { id: 'all', label: 'Todos', icon: '🌐' },
  { id: 'communication', label: 'Comunicación', icon: '💬' },
  { id: 'project-management', label: 'Gestión', icon: '📋' },
  { id: 'version-control', label: 'Código', icon: '🐙' },
  { id: 'scheduling', label: 'Agenda', icon: '📅' },
  { id: 'payments', label: 'Pagos', icon: '💳' },
];

/* ================================================================
   COMPONENT
   ================================================================ */

export default function IntegrationsScreen() {
  const confirmDialog = useConfirmDialog();
  const { authUser, activeTenantId } = useApp();

  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [installed, setInstalled] = useState<InstalledIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [selectedProvider, setSelectedProvider] = useState<ProviderInfo | null>(null);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [installing, setInstalling] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogs, setShowLogs] = useState<string | null>(null);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    if (!activeTenantId || !authUser) return;
    setLoading(true);
    setError('');
    try {
      const token = await authUser.getIdToken();
      const res = await fetch(
        `/api/integrations?tenantId=${activeTenantId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error cargando integraciones');
      setProviders(data.providers || []);
      setInstalled(data.installed || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeTenantId, authUser]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ---- Filtered providers ---- */
  const filteredProviders = providers.filter((p) => {
    if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
    }
    return true;
  });

  /* ---- Installed lookup ---- */
  const installedMap = new Map<string, InstalledIntegration>();
  for (const inst of installed) {
    installedMap.set(inst.providerId, inst);
  }

  /* ---- Handlers ---- */
  const openConfig = (provider: ProviderInfo) => {
    const existing = installedMap.get(provider.id);
    setSelectedProvider(provider);
    setConfigValues(existing?.config || {});
    setTestResult(null);
  };

  const closeConfig = () => {
    setSelectedProvider(null);
    setConfigValues({});
    setTestResult(null);
  };

  const handleInstall = async () => {
    if (!selectedProvider || !activeTenantId || !authUser) return;
    setInstalling(true);
    setError('');
    try {
      const token = await authUser.getIdToken();
      const res = await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: 'install',
          tenantId: activeTenantId,
          providerId: selectedProvider.id,
          config: configValues,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error instalando');
      closeConfig();
      await fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setInstalling(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedProvider || !activeTenantId || !authUser) return;
    const existing = installedMap.get(selectedProvider.id);
    if (!existing) return;
    setInstalling(true);
    setError('');
    try {
      const token = await authUser.getIdToken();
      const res = await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: 'update',
          tenantId: activeTenantId,
          instanceId: existing.id,
          config: configValues,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error actualizando');
      closeConfig();
      await fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setInstalling(false);
    }
  };

  const handleUninstall = async (instanceId: string) => {
    if (!activeTenantId || !authUser) return;
    if (!(await confirmDialog.confirm({ title: 'Desinstalar integración', description: '¿Desinstalar esta integración? Los logs asociados serán eliminados.' }))) return;
    setError('');
    try {
      const token = await authUser.getIdToken();
      const res = await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: 'uninstall',
          tenantId: activeTenantId,
          instanceId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error desinstalando');
      await fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleTest = async (instanceId: string, providerId: string) => {
    if (!activeTenantId || !authUser) return;
    setTesting(instanceId);
    setTestResult(null);
    try {
      const token = await authUser.getIdToken();
      const res = await fetch(`/api/integrations/${providerId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: 'test',
          tenantId: activeTenantId,
          instanceId,
        }),
      });
      const data = await res.json();
      setTestResult({ success: data.success, message: data.message });
    } catch (err: any) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setTesting(null);
    }
  };

  const fetchLogs = async (instanceId: string) => {
    if (!activeTenantId || !authUser) return;
    setShowLogs(instanceId);
    try {
      const token = await authUser.getIdToken();
      const res = await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: 'logs',
          tenantId: activeTenantId,
          instanceId,
          limit: 30,
        }),
      });
      const data = await res.json();
      setLogs(data.logs || []);
    } catch {
      setLogs([]);
    }
  };

  /* ---- Status helpers ---- */
  const statusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'error': return 'bg-red-500/10 text-red-400 border-red-500/30';
      case 'inactive': return 'bg-slate-500/10 text-slate-400 border-slate-500/30';
      case 'pending_setup': return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/30';
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'active': return 'Activo';
      case 'error': return 'Error';
      case 'inactive': return 'Inactivo';
      case 'pending_setup': return 'Pendiente';
      default: return status;
    }
  };

  /* ================================================================
   RENDER
   ================================================================ */

  if (loading) {
    return (
      <div className="animate-fadeIn">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 animate-pulse">
              <div className="h-5 bg-[var(--af-bg3)] rounded w-1/3 mb-3" />
              <div className="h-3 bg-[var(--af-bg3)] rounded w-full mb-2" />
              <div className="h-3 bg-[var(--af-bg3)] rounded w-2/3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2"><Puzzle size={20} className="text-[var(--af-accent)]" aria-hidden="true"/> Marketplace</h2>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
            Conecta Archii con tus herramientas favoritas
          </p>
        </div>
        <span className="text-[12px] text-[var(--af-text3)]">
          {installed.length} instalada{installed.length !== 1 ? 's' : ''}
        </span>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Search + Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[200px] max-w-sm relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" aria-hidden="true"/>
          <input
            type="text"
            placeholder="Buscar integración..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg pl-9 pr-3 py-2 text-[13px] text-[var(--foreground)] outline-none focus:border-[var(--af-accent)]/50 placeholder:text-[var(--muted-foreground)] transition-colors"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              className={`px-3 py-1.5 rounded-full text-[11px] cursor-pointer transition-all whitespace-nowrap border ${
                categoryFilter === cat.id
                  ? 'bg-[var(--af-accent)] text-background border-[var(--af-accent)]'
                  : 'bg-transparent text-[var(--muted-foreground)] border-[var(--border)] hover:border-[var(--af-accent)]/30'
              }`}
              onClick={() => setCategoryFilter(cat.id)}
            >
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Installed Integrations */}
      {installed.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-[var(--muted-foreground)] flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--af-accent)]" />
            Integraciones Activas
          </h3>
          <div className="space-y-2">
            {installed.map((inst) => {
              const prov = providers.find((p) => p.id === inst.providerId);
              if (!prov) return null;
              return (
                <div
                  key={inst.id}
                  className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--af-accent)]/20 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[var(--af-bg3)] border border-[var(--border)] flex items-center justify-center text-lg flex-shrink-0">
                      {prov.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[14px] font-semibold">{prov.name}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusColor(inst.status)}`}>
                          {statusLabel(inst.status)}
                        </span>
                      </div>
                      <div className="text-[11px] text-[var(--muted-foreground)] flex items-center gap-3 mt-0.5">
                        {inst.lastSyncAt && (
                          <span>Último sync: {new Date(inst.lastSyncAt).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}</span>
                        )}
                        {inst.errorMessage && (
                          <span className="text-red-400 truncate max-w-[200px]" title={inst.errorMessage}>
                            ⚠️ {inst.errorMessage}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button
                        className="px-2.5 py-1.5 rounded-lg text-[11px] bg-[var(--af-bg3)] text-[var(--foreground)] cursor-pointer hover:bg-[var(--af-bg4)] transition-colors border-none"
                        onClick={() => openConfig(prov)}
                        title="Configurar"
                      >
                        ⚙️
                      </button>
                      <button
                        className="px-2.5 py-1.5 rounded-lg text-[11px] bg-[var(--af-accent)]/10 text-[var(--af-accent)] cursor-pointer hover:bg-[var(--af-accent)]/20 transition-colors border-none"
                        onClick={() => handleTest(inst.id, inst.providerId)}
                        disabled={testing === inst.id}
                        title="Probar conexión"
                      >
                        {testing === inst.id ? '⏳' : '🔌'}
                      </button>
                      <button
                        className="px-2.5 py-1.5 rounded-lg text-[11px] bg-[var(--af-bg3)] text-[var(--foreground)] cursor-pointer hover:bg-[var(--af-bg4)] transition-colors border-none"
                        onClick={() => fetchLogs(inst.id)}
                        title="Ver logs"
                      >
                        📋
                      </button>
                      <button
                        className="px-2.5 py-1.5 rounded-lg text-[11px] bg-red-500/10 text-red-400 cursor-pointer hover:bg-red-500/20 transition-colors border-none"
                        onClick={() => handleUninstall(inst.id)}
                        title="Desinstalar"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                  {/* Test result inline */}
                  {testing === inst.id && testResult && (
                    <div className={`mt-2 text-[11px] px-3 py-1.5 rounded-lg ${testResult.success ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                      {testResult.success ? '✅' : '❌'} {testResult.message}
                    </div>
                  )}

                  {/* Logs panel */}
                  {showLogs === inst.id && (
                    <div className="mt-3 pt-3 border-t border-[var(--border)] space-y-1.5">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-semibold text-[var(--muted-foreground)]">Activity Log</span>
                        <button
                          className="text-[10px] text-[var(--af-accent)] cursor-pointer"
                          onClick={() => setShowLogs(null)}
                        >
                          Cerrar
                        </button>
                      </div>
                      {logs.length === 0 ? (
                        <div className="text-[11px] text-[var(--muted-foreground)] py-4 text-center">
                          Sin registros
                        </div>
                      ) : (
                        <div className="max-h-[200px] overflow-y-auto space-y-1">
                          {logs.map((log) => (
                            <div key={log.id} className="flex items-center gap-2 text-[10px] py-1 px-2 rounded-lg bg-[var(--af-bg3)]">
                              <span className={log.status === 'success' ? 'text-emerald-400' : 'text-red-400'}>
                                {log.status === 'success' ? '✅' : '❌'}
                              </span>
                              <span className="text-[var(--foreground)] font-medium">{log.event}</span>
                              <span className="text-[var(--af-text3)]">{log.direction}</span>
                              {log.statusCode && <span className="text-[var(--af-text3)]">HTTP {log.statusCode}</span>}
                              {log.error && <span className="text-red-400 truncate max-w-[150px]" title={log.error}>{log.error}</span>}
                              <span className="ml-auto text-[var(--af-text3)]">
                                {new Date(log.createdAt).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Marketplace Grid */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-[var(--muted-foreground)] flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--af-accent)]" />
          Integraciones Disponibles
        </h3>

        {filteredProviders.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">🔌</div>
            <div className="text-[15px] font-medium text-[var(--muted-foreground)] mb-1">Sin integraciones</div>
            <div className="text-[13px] text-[var(--af-text3)]">No se encontraron integraciones para tu búsqueda</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProviders.map((provider) => {
              const isInstalled = installedMap.has(provider.id);
              const instance = installedMap.get(provider.id);

              return (
                <div
                  key={provider.id}
                  className={`bg-[var(--card)] border rounded-xl p-4 hover:border-[var(--af-accent)]/30 transition-all ${
                    isInstalled ? 'border-emerald-500/20' : 'border-[var(--border)]'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl border ${
                        isInstalled
                          ? 'bg-emerald-500/10 border-emerald-500/20'
                          : 'bg-[var(--af-bg3)] border-[var(--border)]'
                      }`}>
                        {provider.icon}
                      </div>
                      <div>
                        <div className="text-[14px] font-semibold flex items-center gap-2">
                          {provider.name}
                          {isInstalled && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
                              Conectado
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-[var(--muted-foreground)]">
                          {CATEGORIES.find((c) => c.id === provider.category)?.icon}{' '}
                          {CATEGORIES.find((c) => c.id === provider.category)?.label}
                          {' · '}
                          {provider.authType === 'oauth2' ? 'OAuth 2.0' : provider.authType === 'apiKey' ? 'API Key' : 'Webhook'}
                        </div>
                      </div>
                    </div>
                    {provider.docsUrl && (
                      <a
                        href={provider.docsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-[var(--af-accent)] hover:underline"
                      >
                        Docs ↗
                      </a>
                    )}
                  </div>

                  <p className="text-[12px] text-[var(--muted-foreground)] mb-3 leading-relaxed">
                    {provider.description}
                  </p>

                  {/* Event tags */}
                  <div className="flex flex-wrap gap-1 mb-3">
                    {provider.eventTypes.slice(0, 4).map((evt) => (
                      <span
                        key={evt}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--af-bg3)] text-[var(--af-text3)]"
                      >
                        {evt}
                      </span>
                    ))}
                    {provider.eventTypes.length > 4 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--af-bg3)] text-[var(--af-text3)]">
                        +{provider.eventTypes.length - 4}
                      </span>
                    )}
                  </div>

                  {/* Error state for installed integrations */}
                  {instance?.status === 'error' && (
                    <div className="text-[11px] text-red-400 bg-red-500/10 rounded-lg px-3 py-1.5 mb-3 truncate" title={instance.errorMessage}>
                      ⚠️ {instance.errorMessage || 'Error de conexión'}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2">
                    {isInstalled ? (
                      <>
                        <button
                          className="flex-1 px-3 py-2 rounded-lg text-[12px] font-medium cursor-pointer transition-all border-none bg-[var(--af-accent)]/10 text-[var(--af-accent)] hover:bg-[var(--af-accent)]/20"
                          onClick={() => openConfig(provider)}
                        >
                          ⚙️ Configurar
                        </button>
                        <button
                          className="px-3 py-2 rounded-lg text-[12px] font-medium cursor-pointer transition-all border-none bg-red-500/10 text-red-400 hover:bg-red-500/20"
                          onClick={() => instance && handleUninstall(instance.id)}
                        >
                          Desinstalar
                        </button>
                      </>
                    ) : (
                      <button
                        className="flex-1 px-3 py-2 rounded-lg text-[12px] font-medium cursor-pointer transition-all border-none bg-[var(--af-accent)] text-background hover:opacity-90"
                        onClick={() => openConfig(provider)}
                      >
                        + Conectar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Configuration Modal */}
      {selectedProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={closeConfig}>
          <div
            className="bg-[var(--card)] border border-[var(--border)] rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="sticky top-0 bg-[var(--card)] border-b border-[var(--border)] px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--af-bg3)] border border-[var(--border)] flex items-center justify-center text-lg">
                  {selectedProvider.icon}
                </div>
                <div>
                  <div className="text-[15px] font-semibold">{selectedProvider.name}</div>
                  <div className="text-[10px] text-[var(--muted-foreground)]">
                    {selectedProvider.authType === 'oauth2' ? 'OAuth 2.0' : selectedProvider.authType === 'apiKey' ? 'API Key' : 'Webhook'}
                  </div>
                </div>
              </div>
              <button
                className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer bg-[var(--af-bg3)] hover:bg-[var(--af-bg4)] transition-colors border-none text-[var(--foreground)]"
                onClick={closeConfig}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-5 py-4 space-y-4">
              <p className="text-[12px] text-[var(--muted-foreground)]">
                {selectedProvider.description}
              </p>

              {/* Config fields */}
              {selectedProvider.configSchema.map((field) => (
                <div key={field.key}>
                  <label className="block text-[12px] font-medium text-[var(--foreground)] mb-1">
                    {field.label}
                    {field.required && <span className="text-red-400 ml-1">*</span>}
                  </label>
                  <input
                    type={field.type === 'password' ? 'password' : 'text'}
                    placeholder={field.placeholder || ''}
                    value={configValues[field.key] || ''}
                    onChange={(e) => setConfigValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    className="w-full bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13px] text-[var(--foreground)] outline-none focus:border-[var(--af-accent)]/50 placeholder:text-[var(--muted-foreground)] transition-colors"
                  />
                  {field.helpText && (
                    <div className="text-[10px] text-[var(--af-text3)] mt-1">{field.helpText}</div>
                  )}
                </div>
              ))}

              {/* Test result */}
              {testResult && (
                <div className={`text-[12px] px-3 py-2 rounded-lg ${
                  testResult.success ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                }`}>
                  {testResult.success ? '✅' : '❌'} {testResult.message}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-[var(--card)] border-t border-[var(--border)] px-5 py-4 flex gap-2">
              <button
                className="flex-1 px-4 py-2.5 rounded-lg text-[13px] font-medium cursor-pointer transition-all border border-[var(--border)] bg-transparent text-[var(--foreground)] hover:bg-[var(--af-bg3)]"
                onClick={closeConfig}
              >
                Cancelar
              </button>
              {installedMap.has(selectedProvider.id) ? (
                <button
                  className="flex-1 px-4 py-2.5 rounded-lg text-[13px] font-medium cursor-pointer transition-all border-none bg-[var(--af-accent)] text-background hover:opacity-90 disabled:opacity-50"
                  onClick={handleUpdate}
                  disabled={installing}
                >
                  {installing ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              ) : (
                <button
                  className="flex-1 px-4 py-2.5 rounded-lg text-[13px] font-medium cursor-pointer transition-all border-none bg-[var(--af-accent)] text-background hover:opacity-90 disabled:opacity-50"
                  onClick={handleInstall}
                  disabled={installing}
                >
                  {installing ? 'Instalando...' : `Conectar ${selectedProvider.name}`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Empty state — no providers */}
      {!loading && providers.length === 0 && (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">🔌</div>
          <div className="text-[15px] font-medium text-[var(--muted-foreground)] mb-1">Sin integraciones disponibles</div>
          <div className="text-[13px] text-[var(--af-text3)]">
            Habilita la feature flag NEXT_PUBLIC_FLAG_MARKETPLACE para ver el marketplace
          </div>
        </div>
      )}
      <ConfirmDialog {...confirmDialog} />
    </div>
  );
}
