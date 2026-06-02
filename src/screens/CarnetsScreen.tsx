'use client';
import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useApp } from '@/contexts/AppContext';
import { toast } from 'sonner';
import CarnetCard, { exportPDF, exportPNG, type CarnetData } from '@/components/carnets/CarnetCard';
import type { CarnetTemplate } from '@/lib/carnet-template-types';
import CenterModal from '@/components/common/CenterModal';
import { FormField, FormInput, FormSelect, ModalFooter } from '@/components/common/FormField';
import {
  Search, Plus, Eye, Edit3, Trash2, Copy, ToggleLeft, ToggleRight,
  Download, FileText, Image, Printer, Users, UserCheck, UserX,
  ShieldCheck, AlertTriangle, CreditCard, X, Upload, Palette,
  FileSpreadsheet, CheckCircle2, AlertCircle, Loader2,
} from 'lucide-react';

// Lazy-load the designer to avoid bloating the main carnets bundle
const CarnetTemplateEditor = dynamic(() => import('@/screens/CarnetTemplateEditor'), { ssr: false });
const PhotoCropperModal = dynamic(() => import('@/components/carnets/PhotoCropperModal'), { ssr: false });

interface CarnetRecord {
  id: string;
  tenantId: string;
  employeeCode: string;
  fullName: string;
  position: string;
  area: string;
  phone: string;
  email: string;
  bloodType: string;
  eps: string;
  emergencyContact: string;
  emergencyPhone: string;
  startDate: string;
  validUntil: string;
  photoBase64: string;
  city: string;
  isActive: boolean;
  createdAt: any;
  createdBy: string;
}

interface Stats {
  total: number;
  active: number;
  inactive: number;
  valid: number;
  expired: number;
}

const BLOOD_TYPES = ['', 'O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];

export default function CarnetsScreen() {
  const { activeTenantId, activeTenantName, authUser, setScreen } = useApp() as any;
  const [carnets, setCarnets] = useState<CarnetRecord[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, active: 0, inactive: 0, valid: 0, expired: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  // Modals
  const [previewCarnet, setPreviewCarnet] = useState<CarnetRecord | null>(null);
  const [editCarnet, setEditCarnet] = useState<CarnetRecord | null>(null);
  const [isCreate, setIsCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Template state
  const [frontTemplate, setFrontTemplate] = useState<CarnetTemplate | null>(null);
  const [backTemplate, setBackTemplate] = useState<CarnetTemplate | null>(null);

  // Form state
  const [form, setForm] = useState<Partial<CarnetRecord>>({});

  // Import state
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [importFile, setImportFile] = useState<File | null>(null);

  // Designer state — opens as full-screen overlay within CarnetsScreen
  const [showDesigner, setShowDesigner] = useState(false);

  // Photo cropper state
  const [cropperImage, setCropperImage] = useState<string | null>(null);
  // Counter to force re-render of photo preview after crop
  const [photoKey, setPhotoKey] = useState(0);

  // Fetch carnets
  const fetchCarnets = useCallback(async () => {
    if (!activeTenantId || !authUser) return;
    try {
      setLoading(true);
      const token = await authUser.getIdToken();
      const res = await fetch('/api/carnets', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'list',
          tenantId: activeTenantId,
          search,
          status: statusFilter === 'all' ? undefined : statusFilter,
          page,
          limit,
        }),
      });
      const data = await res.json();
      if (data.carnets) {
        setCarnets(data.carnets);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error('[Carnets] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [activeTenantId, authUser, search, statusFilter, page]);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    if (!activeTenantId || !authUser) return;
    try {
      const token = await authUser.getIdToken();
      const res = await fetch('/api/carnets', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stats', tenantId: activeTenantId }),
      });
      const data = await res.json();
      if (data.total !== undefined) setStats(data);
    } catch (err) {
      console.error('[Carnets] stats error:', err);
    }
  }, [activeTenantId, authUser]);

  useEffect(() => { fetchCarnets(); }, [fetchCarnets]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  // Fetch default carnet templates
  const fetchTemplates = useCallback(async () => {
    if (!activeTenantId || !authUser) return;
    try {
      const token = await authUser.getIdToken();
      const res = await fetch('/api/carnet-templates', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list', tenantId: activeTenantId }),
      });
      const data = await res.json();
      if (data.templates) {
        const frontDefault = data.templates.find((t: CarnetTemplate) => t.isDefault && t.side === 'front')
          || data.templates.find((t: CarnetTemplate) => t.side === 'front');
        const backDefault = data.templates.find((t: CarnetTemplate) => t.isDefault && t.side === 'back')
          || data.templates.find((t: CarnetTemplate) => t.side === 'back');
        if (frontDefault) setFrontTemplate(frontDefault);
        if (backDefault) setBackTemplate(backDefault);
      }
    } catch (err) {
      console.error('[Carnets] template fetch error:', err);
    }
  }, [activeTenantId, authUser]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  // CRUD actions
  const apiCall = async (body: any) => {
    if (!authUser) throw new Error('No autenticado');
    const token = await authUser.getIdToken();
    const res = await fetch('/api/carnets', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, tenantId: activeTenantId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error');
    return data;
  };

  const handleCreate = () => {
    setIsCreate(true);
    setEditCarnet(null);
    setForm({
      fullName: '', position: '', area: '', phone: '', email: '',
      bloodType: '', eps: '', emergencyContact: '', emergencyPhone: '',
      startDate: new Date().toISOString().split('T')[0],
      validUntil: '', photoBase64: '', city: '', employeeCode: '',
      isActive: true,
    });
  };

  const handleEdit = (carnet: CarnetRecord) => {
    setIsCreate(false);
    setEditCarnet(carnet);
    setForm({ ...carnet });
  };

  const handleDuplicate = async (carnet: CarnetRecord) => {
    try {
      await apiCall({ action: 'duplicate', carnetId: carnet.id });
      toast.success('Carnet duplicado');
      fetchCarnets();
      fetchStats();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleToggle = async (carnet: CarnetRecord) => {
    try {
      await apiCall({ action: 'toggle-status', carnetId: carnet.id });
      toast.success(carnet.isActive ? 'Carnet desactivado' : 'Carnet activado');
      fetchCarnets();
      fetchStats();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (carnet: CarnetRecord) => {
    if (!confirm(`¿Eliminar el carnet de ${carnet.fullName}?`)) return;
    try {
      await apiCall({ action: 'delete', carnetId: carnet.id });
      toast.success('Carnet eliminado');
      fetchCarnets();
      fetchStats();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleSave = async () => {
    if (!form.fullName?.trim()) {
      toast.error('Nombre completo es requerido');
      return;
    }
    try {
      setSaving(true);
      if (isCreate) {
        await apiCall({ action: 'create', ...form });
        toast.success('Carnet creado');
      } else if (editCarnet) {
        await apiCall({ action: 'update', carnetId: editCarnet.id, ...form });
        toast.success('Carnet actualizado');
      }
      setEditCarnet(null);
      setForm({});
      fetchCarnets();
      fetchStats();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('La imagen no puede superar 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      // Open the cropper modal instead of directly processing
      setCropperImage(reader.result as string);
    };
    reader.readAsDataURL(file);
    // Reset file input so same file can be re-selected
    e.target.value = '';
  };

  const handleExportPDF = async (carnet: CarnetRecord) => {
    try {
      setExporting(true);
      await exportPDF(carnet as CarnetData, activeTenantName || undefined, undefined, undefined);
      toast.success('PDF descargado');
    } catch (err: any) {
      toast.error('Error al exportar PDF');
    } finally {
      setExporting(false);
    }
  };

  const handleExportPNG = async (side: 'front' | 'back', carnet: CarnetRecord) => {
    try {
      setExporting(true);
      await exportPNG(side, carnet as CarnetData);
      toast.success('PNG descargado');
    } catch (err: any) {
      toast.error('Error al exportar PNG');
    } finally {
      setExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const totalPages = Math.ceil(total / limit);

  const isValid = (validUntil: string) => {
    if (!validUntil) return true;
    return new Date(validUntil) >= new Date();
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* ═══ Header ═══ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]" style={{ fontFamily: "'DM Serif Display', serif" }}>
            Carnets
          </h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            Gestión de carnets corporativos
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => { setShowImport(true); setImportResult(null); setImportFile(null); }}
            className="af-btn-secondary flex items-center gap-2 text-sm px-4 py-2.5"
          >
            <FileSpreadsheet size={16} /> Importar Excel
          </button>
          <button
            onClick={() => setShowDesigner(true)}
            className="af-btn-secondary flex items-center gap-2 text-sm px-4 py-2.5"
          >
            <Palette size={16} /> Diseñador
          </button>
          <button
            onClick={handleCreate}
            className="af-btn-primary flex items-center gap-2 text-sm px-4 py-2.5"
          >
            <Plus size={16} /> Nuevo Carnet
          </button>
        </div>
      </div>

      {/* ═══ KPI Stats ═══ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard icon={<Users size={18} />} label="Total" value={stats.total} color="var(--af-accent)" />
        <KpiCard icon={<UserCheck size={18} />} label="Activos" value={stats.active} color="var(--af-green)" />
        <KpiCard icon={<UserX size={18} />} label="Inactivos" value={stats.inactive} color="var(--af-red)" />
        <KpiCard icon={<ShieldCheck size={18} />} label="Vigentes" value={stats.valid} color="var(--af-green)" />
        <KpiCard icon={<AlertTriangle size={18} />} label="Vencidos" value={stats.expired} color="var(--af-amber)" />
      </div>

      {/* ═══ Search & Filters ═══ */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar por nombre, código, cargo..."
            className="w-full bg-[var(--af-bg3)] border border-[var(--border)] rounded-xl pl-9 pr-4 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--af-accent)]/50 transition-colors"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'active', 'inactive'] as const).map(s => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1); }}
              className={`px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer border ${
                statusFilter === s
                  ? 'bg-[var(--af-accent)]/10 text-[var(--af-accent)] border-[var(--af-accent)]/30'
                  : 'bg-[var(--af-bg3)] text-[var(--muted-foreground)] border-[var(--border)] hover:border-[var(--af-accent)]/20'
              }`}
            >
              {s === 'all' ? 'Todos' : s === 'active' ? 'Activos' : 'Inactivos'}
            </button>
          ))}
        </div>
      </div>

      {/* ═══ Table ═══ */}
      {loading ? (
        <div className="text-center py-12 text-[var(--muted-foreground)]">
          <div className="animate-spin w-8 h-8 border-2 border-[var(--af-accent)] border-t-transparent rounded-full mx-auto mb-3" />
          Cargando carnets...
        </div>
      ) : carnets.length === 0 ? (
        <div className="text-center py-16">
          <CreditCard size={48} className="mx-auto text-[var(--af-text3)] mb-4" />
          <h3 className="text-lg font-semibold text-[var(--foreground)] mb-2">No hay carnets</h3>
          <p className="text-sm text-[var(--muted-foreground)] mb-6">
            {search ? 'No se encontraron resultados' : 'Crea el primer carnet corporativo'}
          </p>
          {!search && (
            <button onClick={handleCreate} className="af-btn-primary flex items-center gap-2 text-sm mx-auto px-4 py-2.5">
              <Plus size={16} /> Nuevo Carnet
            </button>
          )}
        </div>
      ) : (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--af-bg3)]">
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">Foto</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">Código</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">Nombre</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider hidden sm:table-cell">Cargo</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider hidden md:table-cell">Área</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">Estado</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider hidden lg:table-cell">Vigencia</th>
                  <th className="text-right px-4 py-3 text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {carnets.map((c, idx) => {
                  const valid = isValid(c.validUntil);
                  return (
                    <tr
                      key={c.id}
                      className={`border-b border-[var(--border)] last:border-0 hover:bg-[var(--af-bg3)]/50 transition-colors ${idx % 2 === 0 ? '' : 'bg-[var(--af-bg3)]/20'}`}
                    >
                      <td className="px-4 py-2.5">
                        <div className="w-9 h-9 rounded-full overflow-hidden border border-[var(--border)] flex items-center justify-center bg-[var(--af-bg3)]">
                          {c.photoBase64 ? (
                            <img src={c.photoBase64.startsWith('data:') ? c.photoBase64 : `data:image/jpeg;base64,${c.photoBase64}`} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[10px] text-[var(--muted-foreground)]">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-[11px] font-semibold text-[var(--af-accent)]">{c.employeeCode}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-[var(--foreground)] text-[13px]">{c.fullName}</div>
                        <div className="text-[11px] text-[var(--muted-foreground)] sm:hidden">{c.position}</div>
                      </td>
                      <td className="px-4 py-2.5 text-[12px] text-[var(--muted-foreground)] hidden sm:table-cell">{c.position}</td>
                      <td className="px-4 py-2.5 text-[12px] text-[var(--muted-foreground)] hidden md:table-cell">{c.area}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                          c.isActive
                            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                            : 'bg-red-500/10 text-red-400 border-red-500/30'
                        }`}>
                          {c.isActive ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 hidden lg:table-cell">
                        {c.validUntil ? (
                          <span className={`text-[11px] font-medium ${valid ? 'text-emerald-500' : 'text-amber-500'}`}>
                            {valid ? '✓ Vigente' : '⚠ Vencido'}
                          </span>
                        ) : (
                          <span className="text-[11px] text-[var(--muted-foreground)]">Sin fecha</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <ActionIcon icon={<Eye size={14} />} title="Ver carnet" onClick={() => setPreviewCarnet(c)} />
                          <ActionIcon icon={<Edit3 size={14} />} title="Editar" onClick={() => handleEdit(c)} />
                          <ActionIcon icon={<Copy size={14} />} title="Duplicar" onClick={() => handleDuplicate(c)} />
                          <ActionIcon
                            icon={c.isActive ? <ToggleRight size={14} className="text-emerald-500" /> : <ToggleLeft size={14} className="text-[var(--muted-foreground)]" />}
                            title={c.isActive ? 'Desactivar' : 'Activar'}
                            onClick={() => handleToggle(c)}
                          />
                          <ActionIcon icon={<Trash2 size={14} className="text-red-400" />} title="Eliminar" onClick={() => handleDelete(c)} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)]">
              <span className="text-[11px] text-[var(--muted-foreground)]">
                {total} carnet{total !== 1 ? 's' : ''} · Página {page} de {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-[var(--af-bg3)] border border-[var(--border)] disabled:opacity-40 cursor-pointer hover:bg-[var(--af-bg4)] transition-colors"
                >
                  Anterior
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-[var(--af-bg3)] border border-[var(--border)] disabled:opacity-40 cursor-pointer hover:bg-[var(--af-bg4)] transition-colors"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ Import Modal ═══ */}
      {showImport && (
        <CenterModal open onClose={() => { setShowImport(false); setImportResult(null); setImportFile(null); }} maxWidth={650}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Importar carnets desde Excel</h2>
            <button onClick={() => { setShowImport(false); setImportResult(null); setImportFile(null); }} className="w-8 h-8 rounded-lg hover:bg-[var(--af-bg3)] flex items-center justify-center cursor-pointer bg-transparent border-none">
              <X size={18} className="text-[var(--muted-foreground)]" />
            </button>
          </div>

          {!importResult ? (
            <div className="space-y-4">
              {/* Instructions */}
              <div className="bg-[var(--af-bg3)] rounded-xl p-4 text-[12px] text-[var(--muted-foreground)] space-y-2">
                <p className="font-semibold text-[var(--foreground)] text-[13px]">Formato del archivo:</p>
                <p>El archivo Excel debe tener columnas con los datos del personal. Las columnas se detectan automáticamente por nombre.</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
                  <span><span className="font-semibold text-[var(--af-accent)]">Nombre Completo</span> — obligatorio</span>
                  <span><span className="font-semibold">Cargo / Posición</span></span>
                  <span><span className="font-semibold">Código Empleado</span></span>
                  <span><span className="font-semibold">Área / Departamento</span></span>
                  <span><span className="font-semibold">Tipo de Sangre</span></span>
                  <span><span className="font-semibold">Ciudad</span></span>
                  <span><span className="font-semibold">Teléfono</span></span>
                  <span><span className="font-semibold">Email</span></span>
                  <span><span className="font-semibold">EPS</span></span>
                  <span><span className="font-semibold">Contacto de Emergencia</span></span>
                  <span><span className="font-semibold">Teléfono Emergencia</span></span>
                  <span><span className="font-semibold">Fecha Ingreso / Vigencia</span></span>
                </div>
              </div>

              {/* File upload */}
              <div
                className="border-2 border-dashed border-[var(--border)] rounded-xl p-8 text-center hover:border-[var(--af-accent)]/40 transition-colors cursor-pointer"
                onClick={() => document.getElementById('excel-upload')?.click()}
                onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={e => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f && (f.name.endsWith('.xlsx') || f.name.endsWith('.xls') || f.name.endsWith('.csv'))) {
                    setImportFile(f);
                  } else {
                    toast.error('Solo se aceptan archivos Excel (.xlsx, .xls)');
                  }
                }}
              >
                {importFile ? (
                  <div className="space-y-2">
                    <FileSpreadsheet size={36} className="mx-auto text-[var(--af-accent)]" />
                    <p className="font-medium text-[var(--foreground)] text-sm">{importFile.name}</p>
                    <p className="text-[11px] text-[var(--muted-foreground)]">{(importFile.size / 1024).toFixed(1)} KB — Click para cambiar</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload size={36} className="mx-auto text-[var(--muted-foreground)]" />
                    <p className="font-medium text-[var(--foreground)] text-sm">Arrastra tu archivo Excel aquí</p>
                    <p className="text-[11px] text-[var(--muted-foreground)]">o haz click para seleccionar (.xlsx, .xls)</p>
                  </div>
                )}
                <input
                  id="excel-upload"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) setImportFile(f);
                  }}
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => { setShowImport(false); setImportFile(null); }}
                  className="af-btn-secondary text-sm px-4 py-2.5"
                >
                  Cancelar
                </button>
                <button
                  onClick={async () => {
                    if (!importFile || !authUser || !activeTenantId) return;
                    try {
                      setImporting(true);
                      const token = await authUser.getIdToken();
                      const formData = new FormData();
                      formData.append('file', importFile);
                      formData.append('tenantId', activeTenantId);
                      const res = await fetch('/api/carnets/import', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` },
                        body: formData,
                      });
                      const data = await res.json();
                      if (!res.ok) {
                        toast.error(data.error || 'Error al importar');
                        setImporting(false);
                        return;
                      }
                      setImportResult(data);
                      fetchCarnets();
                      fetchStats();
                      toast.success(`${data.created} carnet${data.created !== 1 ? 's' : ''} importado${data.created !== 1 ? 's' : ''}`);
                    } catch (err: any) {
                      toast.error(err.message || 'Error al importar');
                    } finally {
                      setImporting(false);
                    }
                  }}
                  disabled={!importFile || importing}
                  className="af-btn-primary flex items-center gap-2 text-sm px-4 py-2.5 disabled:opacity-50"
                >
                  {importing ? (
                    <><Loader2 size={16} className="animate-spin" /> Importando...</>
                  ) : (
                    <><FileSpreadsheet size={16} /> Importar</>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* Import Results */
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
                  <CheckCircle2 size={20} className="mx-auto text-emerald-500 mb-1" />
                  <div className="text-xl font-bold text-emerald-500">{importResult.created}</div>
                  <div className="text-[10px] text-emerald-600">Creados</div>
                </div>
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
                  <AlertCircle size={20} className="mx-auto text-red-400 mb-1" />
                  <div className="text-xl font-bold text-red-400">{importResult.errors}</div>
                  <div className="text-[10px] text-red-500">Errores</div>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-center">
                  <AlertTriangle size={20} className="mx-auto text-amber-500 mb-1" />
                  <div className="text-xl font-bold text-amber-500">{importResult.skipped}</div>
                  <div className="text-[10px] text-amber-600">Omitidos</div>
                </div>
              </div>

              {/* Imported records list */}
              {importResult.results?.length > 0 && (
                <div className="max-h-[40vh] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)]">
                        <th className="text-left px-3 py-2 text-[10px] font-semibold text-[var(--muted-foreground)] uppercase">Código</th>
                        <th className="text-left px-3 py-2 text-[10px] font-semibold text-[var(--muted-foreground)] uppercase">Nombre</th>
                        <th className="text-left px-3 py-2 text-[10px] font-semibold text-[var(--muted-foreground)] uppercase">Cargo</th>
                        <th className="text-left px-3 py-2 text-[10px] font-semibold text-[var(--muted-foreground)] uppercase">Datos Faltantes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importResult.results.map((r: any, idx: number) => (
                        <tr key={idx} className="border-b border-[var(--border)] last:border-0">
                          <td className="px-3 py-2 font-mono text-[11px] text-[var(--af-accent)]">{r.employeeCode}</td>
                          <td className="px-3 py-2 text-[13px] font-medium text-[var(--foreground)]">{r.fullName}</td>
                          <td className="px-3 py-2 text-[12px] text-[var(--muted-foreground)]">{r.position || '—'}</td>
                          <td className="px-3 py-2">
                            {r.missingFields?.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {r.missingFields.map((f: string) => (
                                  <span key={f} className="inline-block px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-500/10 text-amber-600 border border-amber-500/20">{f}</span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[10px] text-emerald-500 font-medium">Completo</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Error details */}
              {importResult.errorDetails?.length > 0 && (
                <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3">
                  <p className="text-[11px] font-semibold text-red-400 mb-2">Errores:</p>
                  {importResult.errorDetails.map((e: any, idx: number) => (
                    <p key={idx} className="text-[11px] text-red-400">Fila {e.row}: {e.fullName} — {e.error}</p>
                  ))}
                </div>
              )}

              {/* Unmapped columns warning */}
              {importResult.unmappedColumns?.length > 0 && (
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">
                  <p className="text-[11px] font-semibold text-amber-500 mb-1">Columnas no reconocidas:</p>
                  <p className="text-[11px] text-amber-600">{importResult.unmappedColumns.join(', ')}</p>
                </div>
              )}

              {/* Close */}
              <div className="flex justify-end pt-2">
                <button
                  onClick={() => { setShowImport(false); setImportResult(null); setImportFile(null); }}
                  className="af-btn-primary text-sm px-4 py-2.5"
                >
                  Cerrar
                </button>
              </div>
            </div>
          )}
        </CenterModal>
      )}

      {/* ═══ Preview Modal ═══ */}
      {previewCarnet && (
        <CenterModal open={!!previewCarnet} onClose={() => setPreviewCarnet(null)} maxWidth={780}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Vista previa del carnet</h2>
            <button onClick={() => setPreviewCarnet(null)} className="w-8 h-8 rounded-lg hover:bg-[var(--af-bg3)] flex items-center justify-center cursor-pointer bg-transparent border-none">
              <X size={18} className="text-[var(--muted-foreground)]" />
            </button>
          </div>

          <div className="overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
            <CarnetCard
              data={previewCarnet as CarnetData}
              tenantName={activeTenantName || undefined}
              frontTemplate={frontTemplate || undefined}
              backTemplate={backTemplate || undefined}
            />
          </div>
          <p className="text-[11px] text-[var(--muted-foreground)] text-center mt-2">
            {frontTemplate || backTemplate ? 'Frente · Reverso (diseño personalizado)' : 'Frente · Reverso'}
          </p>

          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-[var(--border)]">
            <button
              onClick={() => handleExportPDF(previewCarnet)}
              disabled={exporting}
              className="af-btn-primary flex items-center gap-2 text-[12px] px-3 py-2"
            >
              <FileText size={14} /> Descargar PDF
            </button>
            <button
              onClick={() => handleExportPNG('front', previewCarnet)}
              disabled={exporting}
              className="af-btn-secondary flex items-center gap-2 text-[12px] px-3 py-2"
            >
              <Image size={14} /> PNG Frente
            </button>
            <button
              onClick={() => handleExportPNG('back', previewCarnet)}
              disabled={exporting}
              className="af-btn-secondary flex items-center gap-2 text-[12px] px-3 py-2"
            >
              <Image size={14} /> PNG Reverso
            </button>
            <button
              onClick={handlePrint}
              className="af-btn-secondary flex items-center gap-2 text-[12px] px-3 py-2"
            >
              <Printer size={14} /> Imprimir
            </button>
          </div>
        </CenterModal>
      )}

      {/* ═══ Create/Edit Modal ═══ */}
      {/* Hide the modal while the cropper is open to avoid Radix Dialog focus-trap blocking the cropper interactions */}
      {(isCreate || editCarnet) && !cropperImage && (
        <CenterModal open onClose={() => { setEditCarnet(null); setIsCreate(false); setForm({}); }} maxWidth={600}>
          <h2 className="text-lg font-semibold mb-4">
            {isCreate ? 'Nuevo carnet' : 'Editar carnet'}
          </h2>

          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
            {/* Photo */}
            <div className="flex items-center gap-4">
              <div
                className={`w-20 h-20 rounded-full overflow-hidden border-2 border-[var(--af-accent)]/30 flex items-center justify-center bg-[var(--af-bg3)] flex-shrink-0 ${form.photoBase64 ? 'cursor-pointer hover:border-[var(--af-accent)]/60 transition-colors' : ''}`}
                onClick={() => {
                  if (form.photoBase64) {
                    setCropperImage(form.photoBase64);
                  }
                }}
                title={form.photoBase64 ? 'Click para re-encuadrar la foto' : ''}
              >
                {form.photoBase64 ? (
                  <img key={photoKey} src={form.photoBase64.startsWith('data:') ? form.photoBase64 : `data:image/jpeg;base64,${form.photoBase64}`} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span key={photoKey} className="text-2xl text-[var(--muted-foreground)]">👤</span>
                )}
              </div>
              <div className="flex-1">
                <label className="af-btn-secondary inline-flex items-center gap-2 text-[12px] cursor-pointer px-3 py-2">
                  <Upload size={14} /> Subir foto
                  <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                </label>
                {form.photoBase64 && (
                  <div className="flex items-center gap-2 mt-1">
                    <button
                      onClick={() => setCropperImage(form.photoBase64!)}
                      className="text-[11px] text-[var(--af-accent)] hover:underline cursor-pointer bg-transparent border-none"
                    >
                      Re-encuadrar
                    </button>
                    <button
                      onClick={() => setForm(prev => ({ ...prev, photoBase64: '' }))}
                      className="text-[11px] text-red-400 hover:underline cursor-pointer bg-transparent border-none"
                    >
                      Quitar
                    </button>
                  </div>
                )}
                <p className="text-[10px] text-[var(--muted-foreground)] mt-1">Máximo 5MB. Podrás encuadrar la foto.</p>
              </div>
            </div>

            <FormField label="Nombre completo" required>
              <FormInput
                value={form.fullName || ''}
                onChange={e => setForm(prev => ({ ...prev, fullName: e.target.value }))}
                placeholder="Juan Pérez"
              />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Código">
                <FormInput
                  value={form.employeeCode || ''}
                  onChange={e => setForm(prev => ({ ...prev, employeeCode: e.target.value }))}
                  placeholder="Auto: ARCH-001"
                />
              </FormField>
              <FormField label="Ciudad">
                <FormInput
                  value={form.city || ''}
                  onChange={e => setForm(prev => ({ ...prev, city: e.target.value }))}
                  placeholder="Bogotá"
                />
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Cargo">
                <FormInput
                  value={form.position || ''}
                  onChange={e => setForm(prev => ({ ...prev, position: e.target.value }))}
                  placeholder="Arquitecto"
                />
              </FormField>
              <FormField label="Área">
                <FormInput
                  value={form.area || ''}
                  onChange={e => setForm(prev => ({ ...prev, area: e.target.value }))}
                  placeholder="Diseño"
                />
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Teléfono">
                <FormInput
                  value={form.phone || ''}
                  onChange={e => setForm(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="+57 300 1234567"
                />
              </FormField>
              <FormField label="Email">
                <FormInput
                  type="email"
                  value={form.email || ''}
                  onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="juan@empresa.com"
                />
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Tipo de sangre">
                <FormSelect
                  value={form.bloodType || ''}
                  onChange={e => setForm(prev => ({ ...prev, bloodType: e.target.value }))}
                >
                  <option value="">— Seleccionar —</option>
                  {BLOOD_TYPES.filter(Boolean).map(bt => (
                    <option key={bt} value={bt}>{bt}</option>
                  ))}
                </FormSelect>
              </FormField>
              <FormField label="EPS">
                <FormInput
                  value={form.eps || ''}
                  onChange={e => setForm(prev => ({ ...prev, eps: e.target.value }))}
                  placeholder="Sanitas"
                />
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Fecha inicio">
                <FormInput
                  type="date"
                  value={form.startDate || ''}
                  onChange={e => setForm(prev => ({ ...prev, startDate: e.target.value }))}
                />
              </FormField>
              <FormField label="Válido hasta">
                <FormInput
                  type="date"
                  value={form.validUntil || ''}
                  onChange={e => setForm(prev => ({ ...prev, validUntil: e.target.value }))}
                />
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Contacto emergencia">
                <FormInput
                  value={form.emergencyContact || ''}
                  onChange={e => setForm(prev => ({ ...prev, emergencyContact: e.target.value }))}
                  placeholder="María Pérez"
                />
              </FormField>
              <FormField label="Teléfono emergencia">
                <FormInput
                  value={form.emergencyPhone || ''}
                  onChange={e => setForm(prev => ({ ...prev, emergencyPhone: e.target.value }))}
                  placeholder="+57 310 7654321"
                />
              </FormField>
            </div>

            <FormField label="Estado">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, isActive: true }))}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-medium cursor-pointer border transition-all ${
                    form.isActive !== false
                      ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                      : 'bg-[var(--af-bg3)] text-[var(--muted-foreground)] border-[var(--border)]'
                  }`}
                >
                  Activo
                </button>
                <button
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, isActive: false }))}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-medium cursor-pointer border transition-all ${
                    form.isActive === false
                      ? 'bg-red-500/10 text-red-400 border-red-500/30'
                      : 'bg-[var(--af-bg3)] text-[var(--muted-foreground)] border-[var(--border)]'
                  }`}
                >
                  Inactivo
                </button>
              </div>
            </FormField>
          </div>

          <ModalFooter
            onCancel={() => { setEditCarnet(null); setIsCreate(false); setForm({}); }}
            onSubmit={handleSave}
            submitLabel={saving ? 'Guardando...' : isCreate ? 'Crear carnet' : 'Actualizar'}
            submitDisabled={saving}
          />
        </CenterModal>
      )}

      {/* ═══ Photo Cropper Modal ═══ */}
      {cropperImage && (
        <PhotoCropperModal
          imageSrc={cropperImage}
          outputSize={400}
          onCropComplete={(croppedBase64) => {
            setForm(prev => ({ ...prev, photoBase64: croppedBase64 }));
            setCropperImage(null);
            setPhotoKey(k => k + 1); // Force img re-render
          }}
          onCancel={() => setCropperImage(null)}
        />
      )}

      {/* ═══ Designer Overlay (full-screen within Carnets) ═══ */}
      {showDesigner && (
        <div className="fixed inset-0 z-50 bg-[var(--background)] animate-fadeIn">
          <CarnetTemplateEditor onClose={() => {
            setShowDesigner(false);
            // Refresh templates after closing designer so carnets use latest design
            fetchTemplates();
          }} />
        </div>
      )}
    </div>
  );
}

/* ─── Sub-components ─── */

function KpiCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="af-kpi-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}15`, color }}>
          {icon}
        </div>
        <span className="text-[11px] font-medium text-[var(--muted-foreground)] uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-2xl font-bold text-[var(--foreground)]">{value}</div>
    </div>
  );
}

function ActionIcon({ icon, title, onClick }: { icon: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--af-bg3)] transition-colors cursor-pointer bg-transparent border-none text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
    >
      {icon}
    </button>
  );
}
