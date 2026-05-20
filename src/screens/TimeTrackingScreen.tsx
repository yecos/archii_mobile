'use client';
import React, { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useTimeTrackingContext } from '@/hooks/useTimeTracking';
import { fmtCOP, getInitials, avatarColor, fmtDuration, fmtTimer, getWeekStart } from '@/lib/helpers';
import { Clock } from 'lucide-react';
import { DEFAULT_PHASES } from '@/lib/types';
import * as fbActions from '@/lib/firestore-actions';
import { showUndoToast } from '@/lib/undo-helpers';

export default function TimeTrackingScreen() {
  const {
    forms, openModal, projects, setForms,
    showToast, userName, activeTenantId, authUser,
  } = useApp();
  const {
    setTimeFilterDate, setTimeFilterProject, setTimeTab,
    startTimeTracking, stopTimeTracking,
    timeEntries, timeFilterDate, timeFilterProject, timeSession, timeTab,
    timeTimerMs,
  } = useTimeTrackingContext();

  // Quick entry state
  const [quickProject, setQuickProject] = useState('');
  const [quickDate, setQuickDate] = useState(new Date().toISOString().split('T')[0]);
  const [quickHours, setQuickHours] = useState('');
  const [quickDesc, setQuickDesc] = useState('');
  const [quickSaving, setQuickSaving] = useState(false);

  const handleQuickSave = async () => {
    if (!quickProject || !quickHours) { showToast('Proyecto y horas son requeridos', 'error'); return; }
    const mins = Number(quickHours) * 60;
    setQuickSaving(true);
    try {
      await fbActions.saveTimeEntry({
        teProject: quickProject,
        teDate: quickDate,
        teStartTime: '',
        teEndTime: '',
        teDescription: quickDesc,
        teDuration: mins,
        teBillable: true,
        teRate: 50000,
      }, null, showToast, authUser, activeTenantId);
      setQuickProject('');
      setQuickHours('');
      setQuickDesc('');
    } catch {
      showToast('Error al guardar', 'error');
    }
    setQuickSaving(false);
  };

  return (
<div className="animate-fadeIn space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Clock size={20} className="text-[var(--af-accent)]" aria-hidden="true"/>
            Control de Tiempo
          </h2>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{timeEntries.length} registros de tiempo</p>
        </div>
      </div>
      {/* Tabs */}
      <div className="flex gap-1 bg-[var(--af-bg3)] rounded-lg p-1 w-fit overflow-x-auto -mx-1 px-1 scrollbar-none">
          {[{ k: 'Tracker', v: 'tracker' as const }, { k: 'Registros', v: 'entries' as const }, { k: 'Resumen', v: 'summary' as const }].map(tab => (
            <button key={tab.v} className={`px-3 py-1.5 rounded-md text-[13px] cursor-pointer transition-all ${timeTab === tab.v ? 'bg-[var(--card)] text-[var(--foreground)] font-medium shadow-sm' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`} onClick={() => setTimeTab(tab.v)}>{tab.k}</button>
          ))}
        </div>

        {timeTab === 'tracker' && (<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Quick Entry */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 lg:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[14px] font-semibold">Entrada rapida</span>
              <span className="text-[10px] text-[var(--af-text3)]">— Registra tiempo sin abrir el cronometro</span>
            </div>
            <div className="flex items-center gap-2 flex-col sm:flex-row">
              <select
                className="text-[12px] bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-2.5 py-2 text-[var(--foreground)] outline-none cursor-pointer w-full sm:min-w-[160px] sm:flex-1"
                value={quickProject}
                onChange={e => setQuickProject(e.target.value)}
              >
                <option value="">Proyecto...</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.data.name}</option>)}
              </select>
              <input
                type="date"
                className="text-[12px] bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-2.5 py-2 text-[var(--foreground)] outline-none w-full sm:w-[130px]"
                value={quickDate}
                onChange={e => setQuickDate(e.target.value)}
              />
              <input
                type="number"
                step="0.5"
                min="0.5"
                placeholder="Horas"
                className="text-[12px] bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-2.5 py-2 text-[var(--foreground)] outline-none w-full sm:w-[80px]"
                value={quickHours}
                onChange={e => setQuickHours(e.target.value)}
              />
              <input
                type="text"
                placeholder="Descripcion (opcional)"
                className="text-[12px] bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-2.5 py-2 text-[var(--foreground)] outline-none w-full sm:min-w-[140px] sm:flex-1"
                value={quickDesc}
                onChange={e => setQuickDesc(e.target.value)}
              />
              <button
                className="flex items-center justify-start gap-1.5 bg-[var(--af-accent)] text-background px-4 py-2 rounded-lg text-[12px] font-semibold cursor-pointer border-none hover:bg-[var(--af-accent2)] transition-colors flex-shrink-0 w-full sm:w-auto"
                onClick={handleQuickSave}
                disabled={quickSaving}
              >
                {quickSaving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>

          {/* Timer Card */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
            <h3 className="text-[15px] font-semibold mb-4">Cronometro</h3>
            <div className={`text-center py-8 rounded-xl mb-4 ${timeSession.isRunning ? 'bg-emerald-500/5 border border-emerald-500/20' : 'bg-[var(--af-bg3)]'}`}>
              <div className={`text-5xl font-mono font-bold tracking-wider ${timeSession.isRunning ? 'text-emerald-400' : 'text-[var(--muted-foreground)]'}`}>{timeSession.isRunning ? fmtTimer(timeTimerMs) : '00:00'}</div>
              <div className="text-xs text-[var(--muted-foreground)] mt-2">{timeSession.isRunning ? 'En curso...' : 'Detenido'}</div>
              {timeSession.isRunning && <div className="w-3 h-3 bg-emerald-400 rounded-full mx-auto mt-2 animate-pulse" />}
            </div>
            <div className="space-y-3 mb-4">
              <select className="w-full bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] outline-none" value={forms.teProject || ''} onChange={e => setForms(p => ({ ...p, teProject: e.target.value }))}>
                <option value="">Seleccionar proyecto</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.data.name}</option>)}
              </select>
              <select className="w-full bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] outline-none" value={forms.tePhase || ''} onChange={e => setForms(p => ({ ...p, tePhase: e.target.value }))}>
                <option value="">Fase (opcional)</option>
                {DEFAULT_PHASES.map(ph => <option key={ph} value={ph}>{ph}</option>)}
              </select>
              <input type="text" className="w-full bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] outline-none" placeholder="Que vas a hacer?" value={forms.teQuickDesc || ''} onChange={e => setForms(p => ({ ...p, teQuickDesc: e.target.value }))} disabled={timeSession.isRunning} />
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--muted-foreground)]">Tarifa/h:</span>
                <input type="number" className="flex-1 bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] outline-none" value={forms.teRate || 50000} onChange={e => setForms(p => ({ ...p, teRate: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2">
              {!timeSession.isRunning ? (
                <button className="flex-1 bg-emerald-500 text-white px-4 py-2.5 rounded-lg text-sm font-semibold cursor-pointer border-none hover:bg-emerald-600 transition-colors" onClick={startTimeTracking}>Iniciar</button>
              ) : (
                <button className="flex-1 bg-red-500 text-white px-4 py-2.5 rounded-lg text-sm font-semibold cursor-pointer border-none hover:bg-red-600 transition-colors" onClick={stopTimeTracking}>Detener</button>
              )}
              <button className="px-4 py-2.5 rounded-lg text-sm cursor-pointer bg-[var(--af-bg3)] text-[var(--foreground)] border border-[var(--border)] hover:bg-[var(--af-bg4)]" onClick={() => { setForms(p => ({ ...p, teDescription: '', teProject: '', tePhase: '', teDate: new Date().toISOString().split('T')[0], teStartTime: '', teEndTime: '', teManualDuration: '', teBillable: true, teRate: 50000 })); openModal('timeEntry'); }}>+ Manual</button>
            </div>
          </div>

          {/* Today's entries */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
            <h3 className="text-[15px] font-semibold mb-4">Hoy</h3>
            {(() => {
              const today = new Date().toISOString().split('T')[0];
              const todayEntries = timeEntries.filter(e => e.data.date === today);
              const totalToday = todayEntries.reduce((s, e) => s + (e.data.duration || 0), 0);
              const billableToday = todayEntries.filter(e => e.data.billable).reduce((s, e) => s + (e.data.duration || 0), 0);
              return (
                <div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                    <div className="bg-[var(--af-bg3)] rounded-lg p-3 text-center"><div className="text-xl font-bold text-[var(--af-accent)]">{fmtDuration(totalToday)}</div><div className="text-[11px] text-[var(--muted-foreground)]">Total hoy</div></div>
                    <div className="bg-[var(--af-bg3)] rounded-lg p-3 text-center"><div className="text-xl font-bold text-emerald-400">{fmtDuration(billableToday)}</div><div className="text-[11px] text-[var(--muted-foreground)]">Facturable</div></div>
                  </div>
                  {todayEntries.length === 0 ? <div className="text-center py-8 text-[var(--af-text3)] text-sm">Sin registros hoy</div> : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {todayEntries.map(e => {
                        const proj = projects.find(p => p.id === e.data.projectId);
                        return (
                          <div key={e.id} className="flex items-center gap-3 p-2.5 bg-[var(--af-bg3)] rounded-lg">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ backgroundColor: avatarColor(e.data.userId) }}>{getInitials(e.data.userName)}</div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{e.data.description || 'Sin descripcion'}</div>
                              <div className="text-[11px] text-[var(--af-text3)]">{proj?.data.name || '—'}{e.data.phaseName ? ' · ' + e.data.phaseName : ''}</div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-sm font-semibold">{fmtDuration(e.data.duration)}</div>
                              <div className="text-[10px] text-[var(--af-text3)]">{e.data.startTime} - {e.data.endTime}</div>
                            </div>
                            {e.data.billable && <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>)}

        {timeTab === 'entries' && (<div>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <select className="bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] outline-none" value={timeFilterProject} onChange={e => setTimeFilterProject(e.target.value)}>
              <option value="all">Todos los proyectos</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.data.name}</option>)}
            </select>
            <input type="date" className="bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] outline-none" value={timeFilterDate} onChange={e => setTimeFilterDate(e.target.value)} />
            <button className="ml-auto flex items-center gap-1.5 bg-[var(--af-accent)] text-background px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer border-none" onClick={() => { setForms(p => ({ ...p, teDescription: '', teProject: '', tePhase: '', teDate: new Date().toISOString().split('T')[0], teStartTime: '', teEndTime: '', teManualDuration: '', teBillable: true, teRate: 50000 })); openModal('timeEntry'); }}>+ Registro manual</button>
          </div>
          {(() => {
            let filtered = [...timeEntries];
            if (timeFilterProject !== 'all') filtered = filtered.filter(e => e.data.projectId === timeFilterProject);
            if (timeFilterDate) filtered = filtered.filter(e => e.data.date === timeFilterDate);
            const totalHrs = filtered.reduce((s, e) => s + (e.data.duration || 0), 0);
            const billableHrs = filtered.filter(e => e.data.billable).reduce((s, e) => s + (e.data.duration || 0), 0);
            return filtered.length === 0 ? <div className="text-center py-16 text-[var(--af-text3)]"><div className="text-4xl mb-3">⏱️</div><div className="text-sm">Sin registros de tiempo</div></div> : (
              <div>
                <div className="flex gap-4 mb-4 text-xs text-[var(--muted-foreground)]">
                  <span>{filtered.length} registros</span>
                  <span>Total: <b className="text-[var(--foreground)]">{fmtDuration(totalHrs)}</b></span>
                  <span>Facturable: <b className="text-emerald-400">{fmtDuration(billableHrs)}</b></span>
                </div>
                {/* Mobile card view */}
                <div className="md:hidden space-y-3">
                  {filtered.map(e => {
                    const proj = projects.find(p => p.id === e.data.projectId);
                    return (
                      <div key={e.id} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-[var(--muted-foreground)]">{e.data.date}</div>
                          <div className="text-sm font-bold text-[var(--af-accent)]">{fmtDuration(e.data.duration)}</div>
                        </div>
                        <div className="text-sm font-medium">{e.data.description || 'Sin descripcion'}</div>
                        <div className="flex items-center gap-2 text-[11px] text-[var(--af-text3)]">
                          <span className="truncate">{proj?.data.name || '—'}</span>
                          {proj?.data.name && e.data.startTime && <span>·</span>}
                          {e.data.startTime && <span>{e.data.startTime}-{e.data.endTime}</span>}
                          {e.data.billable && <span className="ml-auto">✅ Fact.</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Desktop table view */}
                <div className="hidden md:block bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden overflow-x-auto">
                    <table className="w-full text-sm min-w-[600px]">
                      <thead><tr className="border-b border-[var(--border)] text-[var(--muted-foreground)]">
                        <th className="text-left px-4 py-3 font-medium">Fecha</th>
                        <th className="text-left px-4 py-3 font-medium">Proyecto</th>
                        <th className="text-left px-4 py-3 font-medium">Descripcion</th>
                        <th className="text-left px-4 py-3 font-medium">Horario</th>
                        <th className="text-right px-4 py-3 font-medium">Duracion</th>
                        <th className="text-center px-4 py-3 font-medium">Fact.</th>
                        <th className="px-4 py-3"></th>
                      </tr></thead>
                      <tbody>
                        {filtered.map(e => {
                          const proj = projects.find(p => p.id === e.data.projectId);
                          return (<tr key={e.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--af-bg3)] transition-colors">
                            <td className="px-4 py-2.5 text-[var(--muted-foreground)]">{e.data.date}</td>
                            <td className="px-4 py-2.5"><div className="truncate max-w-[120px]">{proj?.data.name || '—'}</div></td>
                            <td className="px-4 py-2.5 truncate max-w-[180px]">{e.data.description}</td>
                            <td className="px-4 py-2.5 text-[var(--muted-foreground)]">{e.data.startTime} - {e.data.endTime}</td>
                            <td className="px-4 py-2.5 text-right font-semibold">{fmtDuration(e.data.duration)}</td>
                            <td className="px-4 py-2.5 text-center">{e.data.billable ? '✅' : '—'}</td>
                            <td className="px-4 py-2.5"><button className="text-xs text-red-400 cursor-pointer hover:text-red-300" onClick={async () => {
                              const snapshot = { ...e.data };
                              await fbActions.deleteTimeEntry(e.id, showToast, activeTenantId);
                              showUndoToast({ collection: 'timeEntries', docId: e.id, snapshot, label: 'Registro', gender: 'o' });
                            }}>🗑</button></td>
                          </tr>);
                        })}
                      </tbody>
                    </table>
                </div>
              </div>
            );
          })()}
        </div>)}

        {timeTab === 'summary' && (<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(() => {
            const thisWeek = timeEntries.filter(e => { if (!e.data.date) return false; const d = new Date(e.data.date); const ws = getWeekStart(); return d >= ws; });
            const thisMonth = timeEntries.filter(e => { if (!e.data.date) return false; const d = new Date(e.data.date); const now = new Date(); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
            const weekTotal = thisWeek.reduce((s, e) => s + (e.data.duration || 0), 0);
            const weekBillable = thisWeek.filter(e => e.data.billable).reduce((s, e) => s + (e.data.duration || 0) * (e.data.rate || 0) / 60, 0);
            const monthTotal = thisMonth.reduce((s, e) => s + (e.data.duration || 0), 0);
            const monthBillable = thisMonth.filter(e => e.data.billable).reduce((s, e) => s + (e.data.duration || 0) * (e.data.rate || 0) / 60, 0);
            const byProject: Record<string, number> = {};
            timeEntries.forEach(e => { byProject[e.data.projectId] = (byProject[e.data.projectId] || 0) + (e.data.duration || 0); });
            const byPhase: Record<string, number> = {};
            timeEntries.forEach(e => { if (e.data.phaseName) byPhase[e.data.phaseName] = (byPhase[e.data.phaseName] || 0) + (e.data.duration || 0); });
            return (<>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                <h3 className="text-[15px] font-semibold mb-4">Esta Semana</h3>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-[var(--af-bg3)] rounded-lg p-3 text-center"><div className="text-2xl font-bold text-[var(--af-accent)]">{fmtDuration(weekTotal)}</div><div className="text-[11px] text-[var(--muted-foreground)]">Horas totales</div></div>
                  <div className="bg-[var(--af-bg3)] rounded-lg p-3 text-center"><div className="text-2xl font-bold text-emerald-400">{fmtCOP(weekBillable)}</div><div className="text-[11px] text-[var(--muted-foreground)]">Facturable</div></div>
                </div>
              </div>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                <h3 className="text-[15px] font-semibold mb-4">Este Mes</h3>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-[var(--af-bg3)] rounded-lg p-3 text-center"><div className="text-2xl font-bold text-[var(--af-accent)]">{fmtDuration(monthTotal)}</div><div className="text-[11px] text-[var(--muted-foreground)]">Horas totales</div></div>
                  <div className="bg-[var(--af-bg3)] rounded-lg p-3 text-center"><div className="text-2xl font-bold text-emerald-400">{fmtCOP(monthBillable)}</div><div className="text-[11px] text-[var(--muted-foreground)]">Facturable</div></div>
                </div>
              </div>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                <h3 className="text-[15px] font-semibold mb-4">Horas por Proyecto</h3>
                {Object.keys(byProject).length === 0 ? <div className="text-sm text-[var(--muted-foreground)]">Sin datos</div> : (
                  <div className="space-y-2">
                    {Object.entries(byProject).sort((a, b) => b[1] - a[1]).map(([pid, mins]) => {
                      const proj = projects.find(p => p.id === pid);
                      return (<div key={pid}>
                        <div className="flex justify-between text-xs mb-1"><span className="text-[var(--foreground)] truncate mr-2">{proj?.data.name || pid}</span><span className="text-[var(--muted-foreground)]">{fmtDuration(mins)}</span></div>
                        <div className="w-full bg-[var(--af-bg3)] rounded-full h-1.5"><div className="bg-[var(--af-accent)] rounded-full h-1.5" style={{ width: `${(mins / Math.max(...Object.values(byProject))) * 100}%` }} /></div>
                      </div>);
                    })}
                  </div>
                )}
              </div>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                <h3 className="text-[15px] font-semibold mb-4">Horas por Fase</h3>
                {Object.keys(byPhase).length === 0 ? <div className="text-sm text-[var(--muted-foreground)]">Sin datos</div> : (
                  <div className="space-y-2">
                    {Object.entries(byPhase).sort((a, b) => b[1] - a[1]).map(([phase, mins]) => (
                      <div key={phase} className="flex items-center gap-2">
                        <span className="text-sm text-[var(--foreground)] flex-1">{phase}</span>
                        <span className="text-sm font-semibold">{fmtDuration(mins)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>);
          })()}
        </div>)}
      </div>
  );
}
