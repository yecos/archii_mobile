'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import { getAuthHeaders } from '@/lib/firebase-service';
import { Building2, Plus, ArrowRight, Users, Copy, Check, Sparkles, Crown, UserCheck, Shield, Database, AlertTriangle } from 'lucide-react';

interface Tenant {
  id: string;
  name: string;
  code: string;
  members?: string[];
  createdBy?: string;
  createdAt?: any;
  role?: string; // 'Super Admin' | 'Miembro'
}

export default function TenantSelectionScreen() {
  const { authUser, switchTenant, showToast, userName } = useApp();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [newTenantName, setNewTenantName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [migrateExisting, setMigrateExisting] = useState(false); // Default: off, set to true when tenants exist
  const [migratedCounts, setMigratedCounts] = useState<Record<string, number> | null>(null);

  // Auto-enable migration if this is the first tenant (user has existing unassigned data)
  useEffect(() => {
    if (tenants.length === 0) {
      setMigrateExisting(true);
    }
  }, [tenants.length]);

  // Load user's tenants
  const loadTenants = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/tenants', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list' }),
      });
      const data = await res.json();
      if (data.tenants) {
        setTenants(data.tenants);
        // AUTO-FIX: If user appears as Miembro in any tenant they should own,
        // force the role fix from the server side
        const anyMemberRole = data.tenants.some((t: any) => t.role === 'Miembro');
        if (anyMemberRole) {
          fetch('/api/tenants', {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'fix-my-role' }),
          }).then(fixRes => fixRes.json()).then(fixData => {
            if (fixData && (fixData.fixed?.length > 0 || fixData.already?.length > 0)) {
              // Reload tenants to get corrected roles
              if (fixData.fixed?.length > 0) {
                fetch('/api/tenants', {
                  method: 'POST',
                  headers: { ...headers, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'list' }),
                }).then(r => r.json()).then(d => {
                  if (d.tenants) setTenants(d.tenants);
                });
              }
            }
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.error('[TenantSelection] Error loading tenants:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  // Auto-select if only one tenant exists (skip showing the selector)
  useEffect(() => {
    if (tenants.length === 1 && !showCreate && !showJoin) {
      const t = tenants[0];
      switchTenant(t.id, t.name, t.role || 'Miembro');
    }
  }, [tenants.length, showCreate, showJoin, tenants, switchTenant]);

  const handleCreate = async () => {
    const name = newTenantName.trim();
    if (name.length < 2) {
      showToast('El nombre debe tener al menos 2 caracteres', 'error');
      return;
    }
    setCreating(true);
    setMigratedCounts(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/tenants', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', name, migrateExisting }),
      });
      const data = await res.json();
      if (data.error) {
        showToast(data.error, 'error');
        return;
      }
      if (data.migratedCounts) {
        setMigratedCounts(data.migratedCounts);
        const total = Object.values(data.migratedCounts).reduce((sum: number, v: any) => sum + (v > 0 ? v : 0), 0);
        showToast(`Espacio "${data.name}" creado con ${total} datos migrados`);
      } else {
        showToast(`Espacio "${data.name}" creado — Eres Super Admin`);
      }
      switchTenant(data.tenantId, data.name, data.role || 'Super Admin');
    } catch (err) {
      console.error('[TenantSelection] Create error:', err);
      showToast('Error al crear espacio', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) {
      setJoinError('Ingresa un código válido');
      return;
    }
    setJoining(true);
    setJoinError('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/tenants', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'join', code }),
      });
      const data = await res.json();
      if (data.error) {
        setJoinError(data.error);
        return;
      }
      if (data.alreadyMember) {
        showToast(`Ya eres miembro de "${data.name}"`);
      } else {
        showToast(`Te uniste a "${data.name}" como ${data.role || 'Miembro'}`);
      }
      switchTenant(data.tenantId, data.name, data.role || 'Miembro');
    } catch (err) {
      console.error('[TenantSelection] Join error:', err);
      setJoinError('Error al unirse al espacio');
    } finally {
      setJoining(false);
    }
  };

  const copyCode = (code: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(code);
      showToast('Código copiado al portapapeles');
      setTimeout(() => setCopiedCode(null), 2000);
    });
  };

  const selectTenant = (t: Tenant) => {
    switchTenant(t.id, t.name, t.role || 'Miembro');
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-[var(--background)] z-[200] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-[var(--af-accent)] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-[var(--muted-foreground)]">Cargando espacios...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-[var(--background)] via-[var(--background)] to-[var(--af-bg3)] z-[200] flex items-center justify-center p-4 overflow-y-auto">
      <div className="af-ambient-bg" />

      <div className="relative w-full max-w-[480px] my-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-gradient-to-br from-[var(--af-accent)] to-[var(--af-accent2)] rounded-2xl shadow-lg af-glow-accent flex items-center justify-center mx-auto mb-4">
            <Building2 size={28} className="stroke-background" aria-hidden="true"/>
          </div>
          <h1 className="text-2xl font-bold af-heading">Bienvenido, {userName.split(' ')[0]}</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-2">
            {tenants.length === 0
              ? 'Crea tu espacio o únete con un código de invitación'
              : 'Selecciona o crea un espacio de trabajo'
            }
          </p>
        </div>

        {/* Existing tenants */}
        {tenants.length > 0 && !showCreate && !showJoin && (
          <div className="space-y-3 mb-6">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">Tus espacios</span>
              <span className="text-xs text-[var(--muted-foreground)]">{tenants.length} espacio{tenants.length !== 1 ? 's' : ''}</span>
            </div>
            {tenants.map((t) => {
              const isSuperAdmin = t.role === 'Super Admin' || t.createdBy === authUser?.uid || (t as any).superAdmins?.includes(authUser?.uid);
              return (
                <button
                  key={t.id}
                  onClick={() => selectTenant(t)}
                  className="w-full af-card bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 flex items-center gap-4 cursor-pointer hover:border-[var(--af-accent)]/40 transition-all group text-left"
                >
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${isSuperAdmin ? 'bg-gradient-to-br from-[var(--af-accent)]/30 to-amber-500/20' : 'bg-gradient-to-br from-[var(--af-accent)]/20 to-[var(--af-accent2)]/10'} group-hover:from-[var(--af-accent)]/30 group-hover:to-[var(--af-accent2)]/20`}>
                    <Building2 size={20} className="stroke-[var(--af-accent)]" aria-hidden="true"/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate flex items-center gap-2">
                      {t.name}
                      {isSuperAdmin && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-gradient-to-r from-[var(--af-accent)] to-amber-500 text-background px-1.5 py-0.5 rounded-md flex-shrink-0">
                          <Crown size={10} aria-hidden="true"/>
                          SUPER ADMIN
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[11px] text-[var(--muted-foreground)] font-mono bg-[var(--af-bg3)] px-2 py-0.5 rounded-md">{t.code}</span>
                      <span className="text-[11px] text-[var(--muted-foreground)] flex items-center gap-1">
                        <Users size={10} aria-hidden="true"/>
                        {t.members?.length || 1} miembro{(t.members?.length || 1) !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={(e) => copyCode(t.code, e)}
                      className="w-8 h-8 rounded-lg bg-[var(--af-bg3)] border border-[var(--border)] flex items-center justify-center cursor-pointer hover:bg-[var(--af-bg4)] transition-all"
                      title="Copiar código de invitación"
                    >
                      {copiedCode === t.code ? (
                        <Check size={14} className="stroke-emerald-400" aria-hidden="true"/>
                      ) : (
                        <Copy size={14} className="stroke-[var(--muted-foreground)]" aria-hidden="true"/>
                      )}
                    </button>
                    <ArrowRight size={18} className="stroke-[var(--muted-foreground)] group-hover:stroke-[var(--af-accent)] group-hover:translate-x-0.5 transition-all" aria-hidden="true"/>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Action buttons */}
        {!showCreate && !showJoin && (
          <div className="space-y-3">
            <button
              onClick={() => setShowCreate(true)}
              className="w-full af-btn-primary flex items-center justify-center gap-2.5 py-3 rounded-xl text-sm font-semibold cursor-pointer transition-all border-none"
            >
              <Plus size={18} className="stroke-current" strokeWidth={2.5} aria-hidden="true"/>
              {tenants.length === 0 ? 'Crear mi espacio de trabajo' : 'Crear nuevo espacio'}
            </button>
            <button
              onClick={() => setShowJoin(true)}
              className="w-full af-btn-secondary flex items-center justify-center gap-2.5 py-3 rounded-xl text-sm font-semibold cursor-pointer transition-all"
            >
              <Sparkles size={16} className="stroke-current" aria-hidden="true"/>
              Unirme con un código
            </button>
          </div>
        )}

        {/* Create tenant form */}
        {showCreate && (
          <div className="af-card bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 animate-fadeIn">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-base">Crear espacio de trabajo</h2>
              <button
                onClick={() => { setShowCreate(false); setNewTenantName(''); }}
                className="text-xs text-[var(--muted-foreground)] cursor-pointer hover:text-[var(--foreground)] bg-transparent border-none"
              >
                Cancelar
              </button>
            </div>

            {/* Super Admin info */}
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-gradient-to-r from-[var(--af-accent)]/10 via-amber-500/5 to-transparent border border-[var(--af-accent)]/20 mb-4">
              <Crown size={16} className="stroke-[var(--af-accent)] flex-shrink-0" aria-hidden="true"/>
              <div>
                <div className="text-xs font-semibold">Serás Super Admin</div>
                <div className="text-[11px] text-[var(--muted-foreground)]">Tendrás control total del espacio. Comparte el código para invitar miembros.</div>
              </div>
            </div>

            {/* Migrate existing data toggle */}
            <div className="mb-4">
                <button
                  type="button"
                  onClick={() => setMigrateExisting(!migrateExisting)}
                  className={`w-full flex items-start gap-3 px-3.5 py-3 rounded-lg border transition-all text-left cursor-pointer ${migrateExisting ? 'bg-[var(--af-accent)]/10 border-[var(--af-accent)]/30' : 'bg-[var(--af-bg3)] border-[var(--border)]'}`}
                >
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${migrateExisting ? 'bg-[var(--af-accent)] border-[var(--af-accent)]' : 'border-[var(--muted-foreground)]'}`}>
                    {migrateExisting && <Check size={12} className="stroke-background" strokeWidth={3} aria-hidden="true"/>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Database size={14} className={`flex-shrink-0 ${migrateExisting ? 'stroke-[var(--af-accent)]' : 'stroke-[var(--muted-foreground)]'}`} aria-hidden="true"/>
                      <span className="text-xs font-semibold">Migrar datos existentes</span>
                    </div>
                    <p className="text-[11px] text-[var(--muted-foreground)] mt-1 leading-relaxed">
                      Asigna tus proyectos, tareas, gastos y demas datos actuales a este nuevo espacio para mantenerlos aislados.
                    </p>
                  </div>
                </button>
              </div>

            <div className="mb-4">
              <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Nombre del espacio</label>
              <input
                className="w-full bg-[var(--af-bg3)] border border-[var(--input)] rounded-lg px-3.5 py-2.5 text-sm text-[var(--foreground)] outline-none transition-colors focus:border-[var(--af-accent)]"
                placeholder="Ej: Constructora ABC, Arquitectura XYZ..."
                value={newTenantName}
                onChange={(e) => setNewTenantName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                autoFocus
                disabled={creating}
              />
            </div>
            <button
              onClick={handleCreate}
              disabled={creating || newTenantName.trim().length < 2}
              className={`w-full af-btn-primary flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold cursor-pointer transition-all border-none ${creating || newTenantName.trim().length < 2 ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {creating ? (
                <div className="w-4 h-4 border-2 border-background border-t-transparent rounded-full animate-spin" />
              ) : (
                <Shield size={16} className="stroke-current" aria-hidden="true"/>
              )}
              {creating ? 'Creando...' : 'Crear espacio como Super Admin'}
            </button>
          </div>
        )}

        {/* Join tenant form */}
        {showJoin && (
          <div className="af-card bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 animate-fadeIn">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-base">Unirme con código</h2>
              <button
                onClick={() => { setShowJoin(false); setJoinCode(''); setJoinError(''); }}
                className="text-xs text-[var(--muted-foreground)] cursor-pointer hover:text-[var(--foreground)] bg-transparent border-none"
              >
                Cancelar
              </button>
            </div>

            {/* Member info */}
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-[var(--af-bg3)] border border-[var(--border)] mb-4">
              <UserCheck size={16} className="stroke-[var(--af-accent)] flex-shrink-0" aria-hidden="true"/>
              <div>
                <div className="text-xs font-semibold">Entrarás como Miembro</div>
                <div className="text-[11px] text-[var(--muted-foreground)]">Podrás ver y colaborar en los proyectos del espacio.</div>
              </div>
            </div>

            <div className="mb-2">
              <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Código de invitación</label>
              <input
                className={`w-full bg-[var(--af-bg3)] border rounded-lg px-3.5 py-3 text-sm text-[var(--foreground)] outline-none transition-colors text-center font-mono text-lg tracking-[0.3em] uppercase ${joinError ? 'border-[var(--destructive)]' : 'border-[var(--input)] focus:border-[var(--af-accent)]'}`}
                placeholder="ABC123"
                value={joinCode}
                onChange={(e) => { setJoinCode(e.target.value.toUpperCase().slice(0, 6)); setJoinError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleJoin(); }}
                maxLength={6}
                autoFocus
                disabled={joining}
              />
              {joinError && (
                <p className="text-xs mt-1.5 text-[var(--destructive)]">{joinError}</p>
              )}
            </div>
            <button
              onClick={handleJoin}
              disabled={joining || joinCode.trim().length < 4}
              className={`w-full af-btn-primary flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold cursor-pointer transition-all border-none ${joining || joinCode.trim().length < 4 ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {joining ? (
                <div className="w-4 h-4 border-2 border-background border-t-transparent rounded-full animate-spin" />
              ) : (
                <Sparkles size={16} className="stroke-current" aria-hidden="true"/>
              )}
              {joining ? 'Uniéndome...' : 'Unirme al espacio'}
            </button>
          </div>
        )}

        {/* Bottom info */}
        <div className="text-center mt-6">
          <p className="text-[11px] text-[var(--muted-foreground)]">
            Cada espacio es completamente independiente. Los proyectos, tareas, gastos y demás datos están aislados entre espacios.
          </p>
        </div>
      </div>
    </div>
  );
}
