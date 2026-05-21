'use client';
import React, { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { SkeletonCard } from '@/components/ui/SkeletonLoaders';
import { getFirebaseIdToken } from '@/lib/firebase-service';
import { fmtSize } from '@/lib/helpers';
import { useTenantOneDrive, usePersonalOneDrive, getFileIcon, formatTimeAgo, type ODItem, type TabKey } from '@/lib/onedrive-hooks';
import { FolderOpen, Search, X, LayoutGrid, List, Plus, Upload, ChevronRight, Loader2, Download, Pencil, Trash2 } from 'lucide-react';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import ConfirmDialog from '@/components/common/ConfirmDialog';

/* ===== File Browser Component (shared) ===== */
function FileBrowser({
  od,
  title,
  emptyIcon,
  emptyText,
  emptySubtext,
  isConnected,
  onConnect,
  connectLabel,
  isTenantAdmin,
  tenantEmail,
  onDeleteFile,
}: {
  od: ReturnType<typeof useTenantOneDrive> | ReturnType<typeof usePersonalOneDrive>;
  title: string;
  emptyIcon: string;
  emptyText: string;
  emptySubtext: string;
  isConnected: boolean;
  onConnect?: () => void;
  connectLabel?: string;
  isTenantAdmin?: boolean;
  tenantEmail?: string | null;
  onDeleteFile?: (itemId: string, itemName: string) => void;
}) {
  if (!isConnected) {
    return (
      <div className="text-center py-16">
        <div className="text-5xl mb-3">{emptyIcon}</div>
        <div className="text-[15px] font-semibold mb-1">{emptyText}</div>
        <div className="text-xs text-[var(--muted-foreground)] mb-4 max-w-xs mx-auto">{emptySubtext}</div>
        {onConnect && (
          <button
            className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white cursor-pointer transition-colors"
            style={{ backgroundColor: '#00a4ef' }}
            onClick={onConnect}
          >
            {connectLabel || 'Conectar'}
          </button>
        )}
        {tenantEmail && isTenantAdmin && (
          <div className="mt-3 text-[10px] text-[var(--af-text3)]">
            Conectado como: {tenantEmail}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--muted-foreground)]" aria-hidden="true"/>
          <input
            type="text"
            placeholder="Buscar archivos..."
            value={od.searchQuery}
            onChange={e => od.setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-2 rounded-lg bg-[var(--af-bg3)] border border-[var(--border)] text-[13px] text-[var(--foreground)] placeholder:text-[var(--af-text3)] focus:outline-none focus:border-[var(--af-accent)] transition-colors"
          />
          {od.searchQuery && (
            <button onClick={() => od.setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
              <X className="w-3.5 h-3.5" aria-hidden="true"/>
            </button>
          )}
        </div>
        <div className="flex gap-1.5">
          {/* View mode toggle */}
          <button
            onClick={() => od.setViewMode(od.viewMode === 'list' ? 'grid' : 'list')}
            className="p-2 rounded-lg border border-[var(--border)] bg-[var(--af-bg3)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            title={od.viewMode === 'list' ? 'Vista cuadrícula' : 'Vista lista'}
          >
            {od.viewMode === 'list' ? (
              <LayoutGrid className="w-4 h-4" aria-hidden="true"/>
            ) : (
              <List className="w-4 h-4" aria-hidden="true"/>
            )}
          </button>
          {/* New folder */}
          <button
            onClick={() => od.setCreatingFolder(true)}
            className="p-2 rounded-lg border border-[var(--border)] bg-[var(--af-bg3)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            title="Nueva carpeta"
          >
            <Plus className="w-4 h-4" aria-hidden="true"/>
          </button>
          {/* Upload */}
          <button
            onClick={() => od.fileInputRef.current?.click()}
            className="px-3 py-2 rounded-lg text-[12px] font-medium text-white cursor-pointer transition-colors flex items-center gap-1.5"
            style={{ backgroundColor: 'var(--af-accent)' }}
          >
            <Upload className="w-3.5 h-3.5" aria-hidden="true"/>
            Subir
          </button>
          <input
            ref={od.fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={e => {
              const files = e.target.files;
              if (files) {
                Array.from(files).forEach(f => od.uploadFile(f));
              }
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {/* Breadcrumbs */}
      <div className="flex items-center gap-1 mb-3 text-[11px] overflow-x-auto pb-1">
        <button
          onClick={() => od.navigateBreadcrumb(-1)}
          className="text-[var(--af-accent)] hover:underline whitespace-nowrap font-medium"
        >
          {title}
        </button>
        {od.breadcrumbs.map((crumb, i) => (
          <React.Fragment key={crumb.id}>
            <ChevronRight className="w-3 h-3 text-[var(--af-text3)] flex-shrink-0" aria-hidden="true"/>
            <button
              onClick={() => od.navigateBreadcrumb(i)}
              className={`hover:underline whitespace-nowrap ${i === od.breadcrumbs.length - 1 ? 'text-[var(--foreground)] font-medium' : 'text-[var(--muted-foreground)]'}`}
            >
              {crumb.name}
            </button>
          </React.Fragment>
        ))}
      </div>

      {/* Creating folder inline */}
      {od.creatingFolder && (
        <div className="flex items-center gap-2 mb-3 p-2.5 bg-[var(--af-bg3)] rounded-lg border border-[var(--border)]">
          <span className="text-lg">📁</span>
          <input
            type="text"
            placeholder="Nombre de la carpeta..."
            value={od.newFolderName}
            onChange={e => od.setNewFolderName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') od.createFolder(od.newFolderName);
              if (e.key === 'Escape') { od.setCreatingFolder(false); od.setNewFolderName(''); }
            }}
            autoFocus
            className="flex-1 bg-transparent border-none text-[13px] text-[var(--foreground)] placeholder:text-[var(--af-text3)] focus:outline-none"
          />
          <button
            onClick={() => od.createFolder(od.newFolderName)}
            className="px-3 py-1 rounded text-[11px] font-medium bg-[var(--af-accent)] text-white"
          >
            Crear
          </button>
          <button
            onClick={() => { od.setCreatingFolder(false); od.setNewFolderName(''); }}
            className="p-1 rounded text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            <X size={12} aria-hidden="true"/>
          </button>
        </div>
      )}

      {/* Upload progress */}
      {od.uploading && (
        <div className="mb-3 p-2.5 bg-[var(--af-accent)]/10 rounded-lg border border-[var(--af-accent)]/20">
          <div className="flex items-center gap-2 mb-1">
            <Loader2 className="w-4 h-4 animate-spin text-[var(--af-accent)]" aria-hidden="true"/>
            <span className="text-[12px] text-[var(--af-accent)] font-medium truncate">{od.uploadFileName}</span>
          </div>
          <div className="h-1 bg-[var(--af-accent)]/20 rounded-full overflow-hidden">
            <div className="h-full bg-[var(--af-accent)] rounded-full transition-all" style={{ width: od.uploadProgress + '%' }} />
          </div>
        </div>
      )}

      {/* Error banner */}
      {od.error && (
        <div className="mb-3 p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2">
          <span className="text-sm mt-0.5">⚠️</span>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] text-red-400 font-medium">{od.error}</div>
            {od.errorType === 'auth' && (
              <div className="text-[10px] text-red-400/70 mt-0.5">Vuelve a conectar tu cuenta de Microsoft para resolver esto.</div>
            )}
          </div>
          <button
            aria-label="Cerrar error"
            onClick={od.clearError}
            className="text-red-400/60 hover:text-red-400 text-xs flex-shrink-0"
          >
            <X size={12} aria-hidden="true"/>
          </button>
        </div>
      )}

      {/* Drop zone overlay */}
      {od.dragOver && (
        <div className="absolute inset-0 z-10 bg-[var(--af-accent)]/5 border-2 border-dashed border-[var(--af-accent)] rounded-xl flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div className="text-3xl mb-2">📂</div>
            <div className="text-sm text-[var(--af-accent)] font-medium">Soltar archivos aquí</div>
          </div>
        </div>
      )}

      {/* Loading */}
      {od.loading && (
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-[var(--af-bg3)]">
              <div className="w-8 h-8 rounded bg-[var(--af-bg4)] af-skeleton" />
              <div className="flex-1">
                <div className="h-3 w-32 rounded bg-[var(--af-bg4)] af-skeleton mb-1.5" />
                <div className="h-2 w-20 rounded bg-[var(--af-bg4)] af-skeleton" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!od.loading && od.filteredItems.length === 0 && (
        <div className="text-center py-12 text-[var(--af-text3)]">
          <div className="text-4xl mb-2">{od.searchQuery ? '🔍' : '📂'}</div>
          <div className="text-sm">
            {od.searchQuery ? 'No se encontraron resultados' : 'Carpeta vacía'}
          </div>
          {!od.searchQuery && (
            <div className="text-xs mt-1">Arrastra archivos aquí o usa el botón Subir</div>
          )}
        </div>
      )}

      {/* File Grid View */}
      {!od.loading && od.filteredItems.length > 0 && od.viewMode === 'grid' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {od.filteredItems.map(item => (
            <div
              key={item.id}
              className="group bg-[var(--af-bg3)] border border-[var(--border)] rounded-xl p-3 hover:border-[var(--af-accent)]/40 transition-all cursor-pointer"
              onDoubleClick={() => {
                if (item.folder) od.navigateToFolder(item.id, item.name);
              }}
              onClick={() => {
                if (item.folder) od.navigateToFolder(item.id, item.name);
              }}
              onContextMenu={e => e.preventDefault()}
              onDragOver={e => { e.preventDefault(); od.setDragOver(true); }}
              onDragLeave={() => od.setDragOver(false)}
              onDrop={e => {
                e.preventDefault();
                od.setDragOver(false);
                if (e.dataTransfer.files.length > 0 && item.folder) {
                  // Navigate into folder then upload
                  od.navigateToFolder(item.id, item.name);
                  setTimeout(() => od.handleDroppedFiles(e.dataTransfer.files), 300);
                }
              }}
            >
              <div className="text-3xl text-center mb-2">{getFileIcon(item)}</div>
              <div className="text-[11px] font-medium truncate text-center" title={item.name}>{item.name}</div>
              {item.folder ? (
                <div className="text-[10px] text-[var(--af-text3)] text-center mt-0.5">Carpeta</div>
              ) : (
                <>
                  <div className="text-[10px] text-[var(--af-text3)] text-center mt-0.5">{fmtSize(item.size || 0)}</div>
                  <div className="flex justify-center gap-1 mt-1.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={e => { e.stopPropagation(); od.downloadFile(item.id); }}
                      className="p-1 rounded bg-[var(--af-bg4)] hover:bg-[var(--af-accent)]/20 text-[var(--muted-foreground)] hover:text-[var(--af-accent)] transition-colors"
                      title="Descargar"
                    >
                      <Download className="w-3 h-3" aria-hidden="true"/>
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); od.setRenamingId(item.id); od.setRenameName(item.name); }}
                      className="p-1 rounded bg-[var(--af-bg4)] hover:bg-amber-500/20 text-[var(--muted-foreground)] hover:text-amber-400 transition-colors"
                      title="Renombrar"
                    >
                      <Pencil className="w-3 h-3" aria-hidden="true"/>
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); onDeleteFile ? onDeleteFile(item.id, item.name) : od.deleteFile(item.id, item.name); }}
                      className="p-1 rounded bg-[var(--af-bg4)] hover:bg-red-500/20 text-[var(--muted-foreground)] hover:text-red-400 transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 className="w-3 h-3" aria-hidden="true"/>
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* File List View */}
      {!od.loading && od.filteredItems.length > 0 && od.viewMode === 'list' && (
        <div className="space-y-1 max-h-[60vh] overflow-y-auto">
          {od.filteredItems.map(item => (
            <div
              key={item.id}
              className={`group flex items-center gap-3 p-2.5 rounded-lg hover:bg-[var(--af-bg3)] transition-colors ${item.folder ? 'cursor-pointer' : ''}`}
              onDoubleClick={() => {
                if (item.folder) od.navigateToFolder(item.id, item.name);
              }}
              onClick={() => {
                if (item.folder) od.navigateToFolder(item.id, item.name);
              }}
              onContextMenu={e => e.preventDefault()}
              onDragOver={e => { e.preventDefault(); od.setDragOver(true); }}
              onDragLeave={() => od.setDragOver(false)}
              onDrop={e => {
                e.preventDefault();
                od.setDragOver(false);
                if (e.dataTransfer.files.length > 0 && item.folder) {
                  od.navigateToFolder(item.id, item.name);
                  setTimeout(() => od.handleDroppedFiles(e.dataTransfer.files), 300);
                }
              }}
            >
              {/* Renaming mode */}
              {od.renamingId === item.id ? (
                <div className="flex-1 flex items-center gap-2">
                  <span className="text-base">{getFileIcon(item)}</span>
                  <input
                    type="text"
                    value={od.renameName}
                    onChange={e => od.setRenameName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') od.renameFile(item.id, od.renameName);
                      if (e.key === 'Escape') { od.setRenamingId(null); od.setRenameName(''); }
                    }}
                    autoFocus
                    className="flex-1 bg-[var(--af-bg4)] border border-[var(--af-accent)] rounded px-2 py-1 text-[13px] text-[var(--foreground)] focus:outline-none"
                  />
                  <button
                    onClick={e => { e.stopPropagation(); od.renameFile(item.id, od.renameName); }}
                    className="px-2 py-1 rounded text-[11px] font-medium bg-[var(--af-accent)] text-white"
                  >
                    OK
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); od.setRenamingId(null); od.setRenameName(''); }}
                    className="p-1 rounded text-[11px] text-[var(--muted-foreground)]"
                  >
                    <X size={12} aria-hidden="true"/>
                  </button>
                </div>
              ) : (
                <>
                  {/* Thumbnail */}
                  <div className="w-9 h-9 rounded-lg bg-[var(--af-bg3)] flex items-center justify-center text-lg flex-shrink-0">
                    {item.thumbnails?.[0]?.medium?.url ? (
                      <img src={item.thumbnails[0].medium.url} alt="Vista previa del archivo" className="w-9 h-9 rounded-lg object-cover" />
                    ) : (
                      getFileIcon(item)
                    )}
                  </div>
                  {/* Name + meta */}
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate">{item.name}</div>
                    <div className="text-[10px] text-[var(--af-text3)] flex items-center gap-2">
                      {item.folder ? (
                        <span>Carpeta</span>
                      ) : (
                        <>
                          <span>{fmtSize(item.size || 0)}</span>
                          {item.lastModifiedDateTime && (
                            <span>· {formatTimeAgo(item.lastModifiedDateTime)}</span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  {/* Actions (hover) */}
                  {!item.folder && (
                    <div className="flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={e => { e.stopPropagation(); od.downloadFile(item.id); }}
                        className="p-1.5 rounded-lg hover:bg-[var(--af-bg4)] text-[var(--muted-foreground)] hover:text-[var(--af-accent)] transition-colors"
                        title="Descargar"
                      >
                        <Download className="w-4 h-4" aria-hidden="true"/>
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); od.setRenamingId(item.id); od.setRenameName(item.name); }}
                        className="p-1.5 rounded-lg hover:bg-amber-500/10 text-[var(--muted-foreground)] hover:text-amber-400 transition-colors"
                        title="Renombrar"
                      >
                        <Pencil className="w-4 h-4" aria-hidden="true"/>
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); onDeleteFile ? onDeleteFile(item.id, item.name) : od.deleteFile(item.id, item.name); }}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-[var(--muted-foreground)] hover:text-red-400 transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true"/>
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ===== Main Files Screen ===== */
export default function FilesScreen() {
  const {
    activeTenantId, activeTenantRole, doMicrosoftLogin, msConnected,
    navigateTo, projects, setForms, setSelectedProjectId, loading,
  } = useApp();

  const confirmDialog = useConfirmDialog();
  const [activeTab, setActiveTab] = useState<TabKey>('team');
  const [connectTenantMs, setConnectTenantMs] = useState(false);
  const [tenantConnecting, setTenantConnecting] = useState(false);

  const tenant = useTenantOneDrive(activeTenantId);
  const personal = usePersonalOneDrive();

  const isTenantAdmin = activeTenantRole === 'Super Admin';

  // Delete file with confirmation dialog (replaces native confirm())
  const handleDeleteFile = async (itemId: string, itemName: string, od: typeof tenant | typeof personal) => {
    const confirmed = await confirmDialog.confirm({
      title: `¿Eliminar "${itemName}"?`,
      description: 'Este archivo se eliminará permanentemente de OneDrive.',
      confirmLabel: 'Eliminar',
    });
    if (confirmed) {
      od.deleteFile(itemId, itemName);
    }
  };

  // Connect tenant MS account
  const handleTenantConnect = async () => {
    if (!activeTenantId || !isTenantAdmin) return;
    setTenantConnecting(true);
    try {
      // Use Microsoft login to get a fresh token
      const fb = (await import('@/lib/firebase-service')).getFirebase();
      const authNS = fb.auth;
      const authInstance = fb.auth();
      const provider = new authNS.OAuthProvider('microsoft.com');
      provider.addScope('Files.ReadWrite.All');
      provider.addScope('Sites.ReadWrite.All');
      provider.addScope('User.Read');
      provider.setCustomParameters({ prompt: 'select_account' });

      const result = await authInstance.signInWithPopup(provider);
      const credential = result.credential as any;

      if (credential?.accessToken) {
        // Save to tenant
        const token = await getFirebaseIdToken();
        if (!token) return;
        const res = await fetch('/api/tenants/onedrive/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            action: 'save',
            tenantId: activeTenantId,
            accessToken: credential.accessToken,
            refreshToken: credential.refreshToken || null,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          tenant.loadFiles('root');
          setConnectTenantMs(false);
          // Refresh connection status
          const statusRes = await fetch('/api/tenants/onedrive/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ action: 'status', tenantId: activeTenantId }),
          });
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            // We can't directly set tenant.connected since it's derived from the hook
            // But the hook will re-check on next render cycle
          }
        } else {
          const errData = await res.json();
          console.error('[Tenant OD] Connect error:', errData);
        }
      }
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') return;
      console.error('[Tenant OD] Microsoft login error:', err);
    } finally {
      setTenantConnecting(false);
    }
  };

  // Disconnect tenant MS account
  const handleTenantDisconnect = async () => {
    if (!await confirmDialog.confirm({ title: 'Desconectar Microsoft', description: '¿Desconectar la cuenta de Microsoft del equipo? Los archivos permanecerán en OneDrive.' })) return;
    if (!activeTenantId) return;
    try {
      const token = await getFirebaseIdToken();
      if (!token) return;
      await fetch('/api/tenants/onedrive/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ action: 'disconnect', tenantId: activeTenantId }),
      });
      window.location.reload();
    } catch (err) {
      console.error('[Tenant OD] Disconnect error:', err);
    }
  };

  // Drag and drop for the active tab
  const currentOd = activeTab === 'team' ? tenant : personal;
  const currentConnected = activeTab === 'team' ? (tenant.connected === true) : msConnected;

  return (
    <div className="animate-fadeIn">
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {/* Header Card */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl sm:rounded-2xl p-4 sm:p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FolderOpen size={20} className="text-[var(--af-accent)]" aria-hidden="true"/>
              Archivos
            </h2>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">Gestiona archivos del equipo y personales</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-[var(--af-bg3)] rounded-lg">
          <button
            onClick={() => setActiveTab('team')}
            className={`flex-1 py-2 px-3 rounded-md text-[12px] font-medium transition-all ${
              activeTab === 'team'
                ? 'bg-[var(--af-accent)] text-white shadow-sm'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            🏢 Archivos del Equipo
          </button>
          <button
            onClick={() => setActiveTab('personal')}
            className={`flex-1 py-2 px-3 rounded-md text-[12px] font-medium transition-all ${
              activeTab === 'personal'
                ? 'bg-[var(--af-accent)] text-white shadow-sm'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            👤 Mi OneDrive
          </button>
        </div>
      </div>

      {/* Team Tab */}
      {activeTab === 'team' && (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl sm:rounded-2xl p-4 sm:p-5 relative"
          onDragOver={e => { e.preventDefault(); tenant.setDragOver(true); }}
          onDragLeave={() => tenant.setDragOver(false)}
          onDrop={e => {
            e.preventDefault();
            tenant.setDragOver(false);
            if (e.dataTransfer.files.length > 0) tenant.handleDroppedFiles(e.dataTransfer.files);
          }}
        >
          {/* Tenant connection status bar */}
          {tenant.connected && tenant.connectedEmail && (
            <div className="flex items-center justify-between mb-3 p-2.5 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-[11px] text-emerald-400">
                  Conectado: {tenant.connectedEmail}
                </span>
              </div>
              {isTenantAdmin && (
                <button
                  onClick={handleTenantDisconnect}
                  className="text-[10px] text-red-400 hover:text-red-300 px-2 py-0.5 rounded hover:bg-red-500/10 transition-colors"
                >
                  Desconectar
                </button>
              )}
            </div>
          )}

          <FileBrowser
            od={tenant}
            title="Equipo"
            emptyIcon="🏢"
            emptyText="OneDrive del Equipo"
            emptySubtext={
              isTenantAdmin
                ? 'Conecta la cuenta de Microsoft 365 del equipo para compartir archivos con todos los miembros.'
                : 'El administrador del equipo aún no ha conectado la cuenta de Microsoft. Pídele que lo configure.'
            }
            isConnected={tenant.connected === true}
            onConnect={isTenantAdmin ? handleTenantConnect : undefined}
            connectLabel={tenantConnecting ? 'Conectando...' : 'Conectar Microsoft del Equipo'}
            isTenantAdmin={isTenantAdmin}
            tenantEmail={tenant.connectedEmail}
            onDeleteFile={(itemId, itemName) => handleDeleteFile(itemId, itemName, tenant)}
          />
        </div>
      )}

      {/* Personal Tab */}
      {activeTab === 'personal' && (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl sm:rounded-2xl p-4 sm:p-5 relative"
          onDragOver={e => { e.preventDefault(); personal.setDragOver(true); }}
          onDragLeave={() => personal.setDragOver(false)}
          onDrop={e => {
            e.preventDefault();
            personal.setDragOver(false);
            if (e.dataTransfer.files.length > 0) personal.handleDroppedFiles(e.dataTransfer.files);
          }}
        >
          <FileBrowser
            od={personal}
            title="Mi OneDrive"
            emptyIcon="☁️"
            emptyText="Tu OneDrive Personal"
            emptySubtext="Conecta tu cuenta de Microsoft para gestionar tus archivos personales en la nube."
            isConnected={msConnected}
            onConnect={doMicrosoftLogin}
            connectLabel="Conectar con Microsoft"
            onDeleteFile={(itemId, itemName) => handleDeleteFile(itemId, itemName, personal)}
          />
        </div>
      )}

      {/* Quick access to project folders */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl sm:rounded-2xl p-4 sm:p-5 mt-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[13px] font-semibold">Carpetas de Proyectos</div>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--af-bg4)] text-[var(--muted-foreground)]">
            {projects.length} proyectos
          </span>
        </div>
        <div className="text-xs text-[var(--muted-foreground)] mb-3">
          Accede rápidamente a los archivos de cada proyecto desde su vista de detalle.
        </div>
        {projects.length === 0 ? (
          <div className="text-center py-6 text-[var(--af-text3)]">
            <div className="text-2xl mb-1">📋</div>
            <div className="text-xs">Sin proyectos aún</div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {projects.slice(0, 8).map(p => (
              <button
                key={p.id}
                className="bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg p-3 text-left cursor-pointer hover:border-[var(--af-accent)]/40 transition-all group"
                onClick={() => {
                  setSelectedProjectId(p.id);
                  setForms((f: any) => ({ ...f, detailTab: 'Archivos' }));
                  navigateTo('projectDetail', p.id);
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base">📁</span>
                  <span className="text-[11px] font-medium truncate group-hover:text-[var(--af-accent)] transition-colors">{p.data.name}</span>
                </div>
                <span className="text-[10px] text-[var(--af-text3)]">{p.data.status}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <ConfirmDialog {...confirmDialog} />
    </div>
  );
}
