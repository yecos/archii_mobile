'use client';
import React, { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Users, Plus } from 'lucide-react';
import { USER_ROLES, ROLE_COLORS, ROLE_ICONS } from '@/lib/types';
import { getInitials, avatarColor } from '@/lib/helpers';
import ManageMembersModal from '@/components/layout/ManageMembersModal';

export default function TeamScreen() {
  const {
    authUser, teamUsers, companies, tasks, forms, setForms,
    getMyRole, updateUserRole, updateUserCompany,
    activeTenantId, activeTenantName, activeTenantRole,
  } = useApp();

  const [showManageMembers, setShowManageMembers] = useState(false);
  const myRole = getMyRole();
  const canManage = myRole === 'Admin' || myRole === 'Director' || activeTenantRole === 'Super Admin';

  return (
    <div className="animate-fadeIn space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Users size={20} className="text-[var(--af-accent)]" aria-hidden="true"/>
            Equipo
          </h2>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{teamUsers.filter(u => !forms.teamCompanyFilter || u.data.companyId === forms.teamCompanyFilter).length} miembros</p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <button
              onClick={() => setShowManageMembers(true)}
              className="flex items-center gap-1.5 bg-[var(--af-accent)] text-background px-3.5 py-2 rounded-lg text-[13px] font-semibold cursor-pointer border-none hover:bg-[var(--af-accent2)] transition-colors"
            >
              <Plus size={14} aria-hidden="true"/>
              Gestionar miembros
            </button>
          )}
        </div>
      </div>
      {/* Company filter pills */}
      {(canManage) && companies.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
          <button className={`px-3 py-1.5 rounded-full text-[12px] cursor-pointer transition-all whitespace-nowrap border ${!forms.teamCompanyFilter ? 'bg-[var(--af-accent)] text-background border-[var(--af-accent)]' : 'bg-transparent text-[var(--muted-foreground)] border-[var(--border)] hover:border-[var(--af-accent)]/30'}`} onClick={() => setForms(p => ({ ...p, teamCompanyFilter: '' }))}>
            Todo el equipo
          </button>
          {companies.map(c => (
            <button key={c.id} className={`px-3 py-1.5 rounded-full text-[12px] cursor-pointer transition-all whitespace-nowrap border ${forms.teamCompanyFilter === c.id ? 'bg-[var(--af-accent)] text-background border-[var(--af-accent)]' : 'bg-transparent text-[var(--muted-foreground)] border-[var(--border)] hover:border-[var(--af-accent)]/30'}`} onClick={() => setForms(p => ({ ...p, teamCompanyFilter: c.id }))}>
              {c.data.name}
            </button>
          ))}
        </div>
      )}
      {/* Role Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        {USER_ROLES.slice(0, 4).map(role => {
          const filtered = teamUsers.filter(u => !forms.teamCompanyFilter || u.data.companyId === forms.teamCompanyFilter);
          const count = filtered.filter(u => u.data.role === role).length;
          return (
            <div key={role} className={`border rounded-xl p-3 text-center ${ROLE_COLORS[role]}`}>
              <div className="text-lg mb-0.5">{ROLE_ICONS[role]}</div>
              <div className="text-lg font-bold">{count}</div>
              <div className="text-[10px] font-medium">{role}s</div>
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {teamUsers.length === 0 && (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">👥</div>
          <p className="text-[var(--muted-foreground)] text-sm mb-4">No hay miembros en este tenant</p>
          {canManage && (
            <button
              onClick={() => setShowManageMembers(true)}
              className="px-6 py-2.5 rounded-xl bg-[var(--af-accent)] text-background text-sm font-medium cursor-pointer hover:opacity-90 border-none transition-all"
            >
              Agregar miembros
            </button>
          )}
        </div>
      )}

      {/* Team Members List */}
      <div className="space-y-2">
        {teamUsers.filter(u => !forms.teamCompanyFilter || u.data.companyId === forms.teamCompanyFilter).map(user => {
          const role = user.data.role || 'Miembro';
          const isMe = user.id === authUser?.uid;
          const canChangeRole = myRole === 'Admin' || myRole === 'Director';
          const canChangeCompany = myRole === 'Admin' || myRole === 'Director';
          const userTasks = tasks.filter(t => t.data.assigneeId === user.id);
          const userPending = userTasks.filter(t => t.data.status !== 'Completado').length;
          const userCompName = companies.find(c => c.id === user.data.companyId)?.data?.name;
          return (
            <div key={user.id} className={`bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--input)] transition-all ${isMe ? 'ring-1 ring-[var(--af-accent)]/30' : ''}`}>
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-sm font-semibold border-2 ${user.data.photoURL ? '' : avatarColor(user.id)} flex-shrink-0 overflow-hidden`}>
                  {user.data.photoURL ? <img src={user.data.photoURL} alt="" className="w-full h-full object-cover" /> : getInitials(user.data.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[14px] font-semibold">{user.data.name}</span>
                    {isMe && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--af-accent)]/10 text-[var(--af-accent)]">Tú</span>}
                    <span className={`text-[9px] px-2 py-0.5 rounded-full border ${ROLE_COLORS[role]}`}>{ROLE_ICONS[role]} {role}</span>
                    {userCompName && <span className="text-[9px] px-2 py-0.5 rounded-full bg-[var(--af-bg4)] text-[var(--af-text3)]">🏢 {userCompName}</span>}
                  </div>
                  <div className="text-[11px] text-[var(--muted-foreground)] truncate">{user.data.email}</div>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-[10px] text-[var(--af-text3)]">{userTasks.length} tareas</span>
                    <span className="text-[10px] text-[var(--af-text3)]">{userPending} pendientes</span>
                  </div>
                </div>
                <div className="flex-shrink-0 flex flex-col gap-1.5 items-end">
                  {canChangeCompany && !isMe ? (
                    <select className="bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-2 py-1 text-[10px] text-[var(--foreground)] outline-none cursor-pointer max-w-[140px]" value={user.data.companyId || ''} onChange={e => updateUserCompany(user.id, e.target.value)} title="Asignar empresa">
                      <option value="">Sin empresa</option>
                      {companies.map(c => <option key={c.id} value={c.id}>{c.data.name}</option>)}
                    </select>
                  ) : canChangeCompany && isMe ? (
                    <select className="bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-2 py-1 text-[10px] text-[var(--foreground)] outline-none cursor-pointer max-w-[140px]" value={user.data.companyId || ''} onChange={e => updateUserCompany(user.id, e.target.value)} title="Tu empresa">
                      <option value="">Sin empresa</option>
                      {companies.map(c => <option key={c.id} value={c.id}>{c.data.name}</option>)}
                    </select>
                  ) : null}
                  {canChangeRole && !isMe ? (
                    <select className="bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-[11px] text-[var(--foreground)] outline-none cursor-pointer" value={role} onChange={e => updateUserRole(user.id, e.target.value)}>
                      {USER_ROLES.map(r => <option key={r} value={r}>{ROLE_ICONS[r]} {r}</option>)}
                    </select>
                  ) : isMe ? (
                    <span className="text-[10px] text-[var(--af-text3)]">Tu rol</span>
                  ) : (
                    <span className="text-[10px] text-[var(--af-text3)]">{role}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Manage Members Modal */}
      {showManageMembers && activeTenantId && (
        <ManageMembersModal
          tenantId={activeTenantId}
          tenantName={activeTenantName || ''}
          onClose={() => setShowManageMembers(false)}
          canRemove={canManage}
        />
      )}
    </div>
  );
}
