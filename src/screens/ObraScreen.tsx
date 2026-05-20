'use client';
import React, { useMemo, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import { FileText, ChevronDown, ChevronUp, Users, Wrench, Package, HardHat } from 'lucide-react';
import { exportDailyLogsPDF } from '@/lib/export-pdf';

const WEATHER_COLORS: Record<string, string> = {
  Soleado: '#f59e0b',
  Nublado: '#6b7280',
  Lluvioso: '#3b82f6',
  'Parcialmente nublado': '#8b5cf6',
  Tormenta: '#ef4444',
};

export default function ObraScreen() {
  const {
    projects, setSelectedProjectId, setForms, navigateTo, dailyLogs, loading,
    showToast, workPhases,
  } = useApp();

  const [selectedProjectLogs, setSelectedProjectLogs] = useState<string | null>(null);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  const activeProjects = projects.filter(p => p.data.status === 'Ejecucion');

  // Determine which logs to show
  const displayLogs = useMemo(() => {
    const logs = selectedProjectLogs
      ? dailyLogs.filter(l => l.data.projectId === selectedProjectLogs)
      : dailyLogs;
    return [...logs].sort((a, b) => (b.data.date || '').localeCompare(a.data.date || ''));
  }, [dailyLogs, selectedProjectLogs]);

  const selectedProject = selectedProjectLogs
    ? projects.find(p => p.id === selectedProjectLogs)
    : null;

  // Weather distribution
  const weatherData = useMemo(() => {
    const dist: Record<string, number> = {};
    displayLogs.forEach(l => {
      const w = l.data.weather || 'Nublado';
      dist[w] = (dist[w] || 0) + 1;
    });
    return Object.entries(dist).map(([name, value]) => ({ name, value }));
  }, [displayLogs]);

  // Labor trend
  const laborTrend = useMemo(() => {
    return displayLogs.slice(0, 10).reverse().map(l => ({
      name: (l.data.date || '').slice(5), // MM-DD
      personal: l.data.laborCount || 0,
    }));
  }, [displayLogs]);

  // Materials used frequency
  const materialsFreq = useMemo(() => {
    const freq: Record<string, number> = {};
    displayLogs.forEach(l => {
      (l.data.materials || []).forEach((m: string) => {
        freq[m] = (freq[m] || 0) + 1;
      });
    });
    return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name, value }));
  }, [displayLogs]);

  // Summary stats
  const summaryStats = useMemo(() => {
    const totalActivities = displayLogs.reduce((s, l) => s + (l.data.activities?.length || 0), 0);
    const avgLabor = displayLogs.length > 0 ? Math.round(displayLogs.reduce((s, l) => s + (l.data.laborCount || 0), 0) / displayLogs.length) : 0;
    const avgTemp = displayLogs.filter(l => l.data.temperature).length > 0
      ? Math.round(displayLogs.filter(l => l.data.temperature).reduce((s, l) => s + (l.data.temperature || 0), 0) / displayLogs.filter(l => l.data.temperature).length * 10) / 10
      : 0;
    const totalPhotos = displayLogs.reduce((s, l) => s + (l.data.photos?.length || 0), 0);
    return { totalActivities, avgLabor, avgTemp, totalPhotos };
  }, [displayLogs]);

  const weatherIcon = (w: string) => {
    switch(w) {
      case 'Soleado': return '☀️';
      case 'Nublado': return '☁️';
      case 'Lluvioso': return '🌧️';
      case 'Parcialmente nublado': return '⛅';
      case 'Tormenta': return '⛈️';
      default: return '🌤️';
    }
  };

  function ChartTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 shadow-lg text-[12px]">
        {label && <div className="font-semibold text-[var(--foreground)] mb-1">{label}</div>}
        {payload.map((p: any, i: number) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: p.color || p.fill }} />
            <span className="text-[var(--muted-foreground)]">{p.name}:</span>
            <span className="font-semibold">{p.value}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="animate-fadeIn space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-br from-[var(--card)] to-[var(--af-bg3)] border border-[var(--border)] rounded-xl p-5 relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-44 h-44 border-[40px] border-[var(--af-accent)]/5 rounded-full" />
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <HardHat size={20} className="text-[var(--af-accent)]" aria-hidden="true"/>
              Bitácora de Obra
            </h2>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">Registro diario de actividades, clima, personal y materiales en obra</p>
          </div>
          {displayLogs.length > 0 && (
            <button className="flex items-center gap-1.5 bg-[var(--af-accent)] text-background px-3.5 py-2 rounded-lg text-[13px] font-semibold cursor-pointer border-none hover:bg-[var(--af-accent2)] transition-colors" onClick={() => {
              try {
                exportDailyLogsPDF({ logs: displayLogs, projectName: selectedProject?.data.name || 'Todos los proyectos' });
                showToast('Bitácora PDF descargada');
              } catch { showToast('Error al generar PDF', 'error'); }
            }}>
              <FileText size={14} aria-hidden="true"/> Exportar PDF
            </button>
          )}
        </div>
      </div>

      {/* Active projects */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[15px] font-semibold">Proyectos en Ejecución</div>
          {selectedProjectLogs && (
            <button className="text-xs text-[var(--af-accent)] cursor-pointer hover:underline" onClick={() => setSelectedProjectLogs(null)}>
              Ver todos los registros
            </button>
          )}
        </div>
        {activeProjects.length === 0 ? (
          <div className="text-center py-10 text-[var(--af-text3)]">
            <div className="text-4xl mb-3">🏗️</div>
            <div className="text-sm mb-1">No hay proyectos en ejecución</div>
            <div className="text-xs">Los proyectos con estado "Ejecución" aparecerán aquí</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activeProjects.map(p => {
              const projLogs = dailyLogs.filter(l => l.data.projectId === p.id);
              const isSelected = selectedProjectLogs === p.id;
              return (
                <div key={p.id} className={`bg-[var(--af-bg3)] border rounded-xl p-4 cursor-pointer transition-all group ${isSelected ? 'border-[var(--af-accent)]/50 ring-1 ring-[var(--af-accent)]/20' : 'border-[var(--border)] hover:border-[var(--af-accent)]/40'}`} onClick={() => {
                  if (isSelected) {
                    setSelectedProjectLogs(null);
                  } else {
                    setSelectedProjectLogs(p.id);
                  }
                }}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate group-hover:text-[var(--af-accent)] transition-colors">{p.data.name}</div>
                      <div className="text-xs text-[var(--af-text3)] mt-1">{p.data.location && '📍 ' + p.data.location}</div>
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex-1 h-1.5 bg-[var(--af-bg4)] rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-[var(--af-accent)]" style={{ width: (p.data.progress || 0) + '%' }} />
                        </div>
                        <span className="text-[10px] text-[var(--muted-foreground)]">{p.data.progress || 0}%</span>
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-[var(--muted-foreground)]">
                        <span>📝 {projLogs.length} registros</span>
                        <span>⚡ {projLogs.reduce((s, l) => s + (l.data.activities?.length || 0), 0)} actividades</span>
                      </div>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-[var(--af-accent)]/10 flex items-center justify-center text-lg group-hover:bg-[var(--af-accent)]/20 transition-colors ml-3 flex-shrink-0">📝</div>
                  </div>
                  {p.data.client && <div className="text-[11px] text-[var(--af-text3)] mt-2">Cliente: {p.data.client}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Stats & Charts (only if logs exist) */}
      {displayLogs.length > 0 && (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Total Registros', value: displayLogs.length, icon: '📝', color: 'text-[var(--af-accent)]' },
              { label: 'Actividades', value: summaryStats.totalActivities, icon: '⚡', color: 'text-blue-400' },
              { label: 'Prom. Personal', value: summaryStats.avgLabor, icon: '👷', color: 'text-emerald-400' },
              { label: 'Temp. Promedio', value: `${summaryStats.avgTemp}°C`, icon: '🌡️', color: 'text-amber-400' },
            ].map((stat, i) => (
              <div key={i} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base">{stat.icon}</span>
                  <span className="text-[11px] text-[var(--muted-foreground)]">{stat.label}</span>
                </div>
                <div className={`text-xl font-bold ${stat.color}`}>{stat.value}</div>
              </div>
            ))}
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Weather distribution */}
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
              <div className="text-[13px] font-semibold mb-3">Clima</div>
              {weatherData.length > 0 ? (
                <ResponsiveContainer width="100%" height={130}>
                  <PieChart>
                    <Pie data={weatherData} cx="50%" cy="50%" innerRadius={25} outerRadius={45} paddingAngle={3} dataKey="value" stroke="none">
                      {weatherData.map((d, i) => <Cell key={i} fill={WEATHER_COLORS[d.name] || '#6b7280'} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <div className="text-center py-6 text-[var(--af-text3)] text-sm">Sin datos</div>}
              <div className="flex flex-wrap gap-x-2 gap-y-1 mt-2">
                {weatherData.map((d, i) => (
                  <div key={i} className="flex items-center gap-1 text-[10px]">
                    <span>{weatherIcon(d.name)}</span>
                    <span className="text-[var(--muted-foreground)]">{d.name}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Labor trend */}
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
              <div className="text-[13px] font-semibold mb-3">Personal por Día</div>
              {laborTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height={130}>
                  <BarChart data={laborTrend} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--af-bg4)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(200,169,110,0.06)' }} />
                    <Bar dataKey="personal" name="Personal" fill="#6366f1" radius={[3, 3, 0, 0]} barSize={12} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <div className="text-center py-6 text-[var(--af-text3)] text-sm">Sin datos</div>}
            </div>

            {/* Materials frequency */}
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
              <div className="text-[13px] font-semibold mb-3">Materiales Más Usados</div>
              {materialsFreq.length > 0 ? (
                <ResponsiveContainer width="100%" height={130}>
                  <BarChart data={materialsFreq} layout="vertical" margin={{ top: 0, right: 10, left: 5, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--af-bg4)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 8, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={70} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="value" name="Veces" fill="#c8a96e" radius={[0, 3, 3, 0]} barSize={10} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <div className="text-center py-6 text-[var(--af-text3)] text-sm">Sin datos</div>}
            </div>
          </div>

          {/* Timeline of logs */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="text-[15px] font-semibold">Registro Diario — Timeline</div>
              <span className="text-[11px] text-[var(--af-text3)]">{displayLogs.length} registros</span>
            </div>

            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-[18px] top-0 bottom-0 w-px bg-[var(--border)]" />

              <div className="space-y-1">
                {displayLogs.map((log, idx) => {
                  const isExpanded = expandedLog === log.id;
                  const proj = projects.find(p => p.id === log.data.projectId);
                  return (
                    <div key={log.id} className="relative pl-10">
                      {/* Timeline dot */}
                      <div className="absolute left-[13px] top-3 w-[11px] h-[11px] rounded-full border-2 border-[var(--af-accent)] bg-[var(--card)] z-10" />

                      {/* Log card */}
                      <div className={`bg-[var(--af-bg3)] border border-[var(--border)] rounded-xl p-4 cursor-pointer hover:border-[var(--af-accent)]/30 transition-all ${isExpanded ? 'border-[var(--af-accent)]/40' : ''}`} onClick={() => setExpandedLog(isExpanded ? null : log.id)}>
                        {/* Header */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-semibold">{log.data.date || 'Sin fecha'}</span>
                            <span className="text-sm">{weatherIcon(log.data.weather || '')}</span>
                            {log.data.temperature && <span className="text-[11px] text-[var(--af-text3)]">{log.data.temperature}°C</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            {log.data.laborCount > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 flex items-center gap-1"><Users size={10} aria-hidden="true"/>{log.data.laborCount}</span>}
                            {(log.data.activities?.length || 0) > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--af-accent)]/10 text-[var(--af-accent)]">{log.data.activities.length} act.</span>}
                            {isExpanded ? <ChevronUp size={14} className="text-[var(--af-text3)]" aria-hidden="true"/> : <ChevronDown size={14} className="text-[var(--af-text3)]" aria-hidden="true"/>}
                          </div>
                        </div>

                        {/* Project name */}
                        {proj && !selectedProjectLogs && (
                          <div className="text-[11px] text-[var(--af-text3)] mt-1">{proj.data.name}</div>
                        )}

                        {/* Preview: first 2 activities */}
                        {!isExpanded && log.data.activities && log.data.activities.length > 0 && (
                          <div className="mt-2 text-[12px] text-[var(--muted-foreground)]">
                            {log.data.activities.slice(0, 2).join(' · ')}
                            {log.data.activities.length > 2 && ` (+${log.data.activities.length - 2} más)`}
                          </div>
                        )}

                        {/* Expanded content */}
                        {isExpanded && (
                          <div className="mt-3 space-y-3 animate-fadeIn border-t border-[var(--border)] pt-3">
                            {/* Activities */}
                            {log.data.activities && log.data.activities.length > 0 && (
                              <div>
                                <div className="text-[11px] font-semibold text-[var(--af-accent)] uppercase tracking-wide mb-1.5">Actividades</div>
                                <div className="space-y-1">
                                  {log.data.activities.map((act: string, i: number) => (
                                    <div key={i} className="text-[12px] text-[var(--foreground)] flex items-start gap-2">
                                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--af-accent)] mt-1.5 flex-shrink-0" />
                                      {act}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Materials */}
                            {log.data.materials && log.data.materials.length > 0 && (
                              <div>
                                <div className="text-[11px] font-semibold text-[var(--af-accent)] uppercase tracking-wide mb-1.5 flex items-center gap-1"><Package size={10} aria-hidden="true"/> Materiales</div>
                                <div className="flex flex-wrap gap-1.5">
                                  {log.data.materials.map((mat: string, i: number) => (
                                    <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--af-bg4)] text-[var(--foreground)]">{mat}</span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Equipment */}
                            {log.data.equipment && log.data.equipment.length > 0 && (
                              <div>
                                <div className="text-[11px] font-semibold text-[var(--af-accent)] uppercase tracking-wide mb-1.5 flex items-center gap-1"><Wrench size={10} aria-hidden="true"/> Equipos</div>
                                <div className="flex flex-wrap gap-1.5">
                                  {log.data.equipment.map((eq: string, i: number) => (
                                    <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--af-bg4)] text-[var(--foreground)]">{eq}</span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Observations */}
                            {log.data.observations && (
                              <div>
                                <div className="text-[11px] font-semibold text-[var(--af-accent)] uppercase tracking-wide mb-1.5">Observaciones</div>
                                <div className="text-[12px] text-[var(--muted-foreground)] leading-relaxed">{log.data.observations}</div>
                              </div>
                            )}

                            {/* Supervisor */}
                            {log.data.supervisor && (
                              <div className="text-[11px] text-[var(--af-text3)]">
                                Supervisor: <span className="text-[var(--foreground)]">{log.data.supervisor}</span>
                              </div>
                            )}

                            {/* Photos */}
                            {log.data.photos && log.data.photos.length > 0 && (
                              <div>
                                <div className="text-[11px] font-semibold text-[var(--af-accent)] uppercase tracking-wide mb-1.5">Fotos ({log.data.photos.length})</div>
                                <div className="grid grid-cols-3 gap-2">
                                  {log.data.photos.slice(0, 6).map((photo: string, i: number) => (
                                    <div key={i} className="aspect-square rounded-lg overflow-hidden bg-[var(--af-bg4)]">
                                      <img src={photo} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                                    </div>
                                  ))}
                                </div>
                                {log.data.photos.length > 6 && <div className="text-[10px] text-[var(--af-text3)] mt-1">+{log.data.photos.length - 6} fotos más</div>}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Empty state when no logs */}
      {displayLogs.length === 0 && dailyLogs.length === 0 && (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-10 text-center">
          <div className="text-4xl mb-3">📝</div>
          <div className="text-sm text-[var(--muted-foreground)]">Sin registros de bitácora</div>
          <div className="text-xs text-[var(--af-text3)] mt-1">Selecciona un proyecto en ejecución para registrar actividades</div>
        </div>
      )}
    </div>
  );
}
