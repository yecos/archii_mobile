/**
 * useOneDrive.tsx
 * Context + hook para todo el dominio de Microsoft OneDrive.
 * Extraído de AppContext.tsx para modularización.
 *
 * Maneja: autenticación MS, refresh de tokens, navegación de carpetas,
 * subida/bajada/renombrado de archivos, búsqueda y galería de fotos.
 */

'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { getFirebaseIdToken } from '@/lib/firebase-service';
import type { OneDriveFile } from '@/lib/types';

/* ===== Types ===== */

interface OneDriveBreadcrumb {
  id: string;
  name: string;
}

interface OneDriveContextValue {
  // Connection state
  msAccessToken: string | null;
  msConnected: boolean;
  msLoading: boolean;
  msRefreshToken: string | null;
  msTokenExpiry: number;
  setMsAccessToken: (token: string | null) => void;
  setMsConnected: (connected: boolean) => void;
  setMsRefreshToken: (token: string | null) => void;
  setMsTokenExpiry: (expiry: number) => void;

  // File browser state
  oneDriveFiles: OneDriveFile[];
  setOneDriveFiles: React.Dispatch<React.SetStateAction<OneDriveFile[]>>;
  odProjectFolder: string | null;
  showOneDrive: boolean;
  setShowOneDrive: (show: boolean) => void;
  odSearchQuery: string;
  setOdSearchQuery: (q: string) => void;
  odSearchResults: OneDriveFile[];
  setOdSearchResults: React.Dispatch<React.SetStateAction<OneDriveFile[]>>;
  odSearching: boolean;
  odBreadcrumbs: OneDriveBreadcrumb[];
  setOdBreadcrumbs: React.Dispatch<React.SetStateAction<OneDriveBreadcrumb[]>>;
  odCurrentFolder: string;
  setOdCurrentFolder: (id: string) => void;
  odViewMode: 'list' | 'grid';
  setOdViewMode: (mode: 'list' | 'grid') => void;
  odRenaming: string | null;
  setOdRenaming: (id: string | null) => void;
  odRenameName: string;
  setOdRenameName: (name: string) => void;
  odUploading: boolean;
  odUploadProgress: number;
  odUploadFile: string;
  odDragOver: boolean;
  setOdDragOver: (dragging: boolean) => void;
  odTab: 'files' | 'gallery';
  setOdTab: (tab: 'files' | 'gallery') => void;
  odGalleryPhotos: OneDriveFile[];
  galleryLoading: boolean;

  // Actions
  refreshMsToken: () => Promise<string | null>;
  ensureProjectFolder: (projectName: string) => Promise<string | null>;
  loadOneDriveFiles: (folderId: string) => Promise<void>;
  uploadToOneDrive: (file: File, folderId: string) => Promise<void>;
  deleteFromOneDrive: (fileId: string, folderId: string) => Promise<void>;
  openOneDriveForProject: (projectName: string) => Promise<void>;
  navigateToFolder: (folderId: string, breadcrumbIndex?: number) => Promise<void>;
  uploadFileWithProgress: (file: File) => Promise<void>;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleDroppedFiles: (files: FileList) => Promise<void>;
  renameOneDriveFile: (fileId: string, newName: string) => Promise<void>;
  downloadOneDriveFile: (fileId: string, fileName: string) => Promise<void>;
  searchOneDriveFiles: (query: string) => Promise<void>;
  loadGalleryPhotos: (projectId: string) => Promise<void>;
  disconnectMicrosoft: () => void;
}

const OneDriveContext = createContext<OneDriveContextValue | null>(null);

/* ===== Provider ===== */

export function OneDriveProvider({
  children,
  showToast,
  selectedProjectId,
}: {
  children: ReactNode;
  showToast: (msg: string, type?: string) => void;
  selectedProjectId: string | null;
}) {
  // ---- Connection state ----
  const [msAccessToken, setMsAccessToken] = useState<string | null>(null);
  const [msConnected, setMsConnected] = useState(false);
  const [msLoading, setMsLoading] = useState(false);
  const [msRefreshToken, setMsRefreshToken] = useState<string | null>(null);
  const [msTokenExpiry, setMsTokenExpiry] = useState<number>(0);

  // ---- File browser state ----
  const [oneDriveFiles, setOneDriveFiles] = useState<OneDriveFile[]>([]);
  const [odProjectFolder, setOdProjectFolder] = useState<string | null>(null);
  const [showOneDrive, setShowOneDrive] = useState(false);
  const [odSearchQuery, setOdSearchQuery] = useState('');
  const [odSearchResults, setOdSearchResults] = useState<OneDriveFile[]>([]);
  const [odSearching, setOdSearching] = useState(false);
  const [odBreadcrumbs, setOdBreadcrumbs] = useState<OneDriveBreadcrumb[]>([]);
  const [odCurrentFolder, setOdCurrentFolder] = useState<string>('root');
  const [odViewMode, setOdViewMode] = useState<'list' | 'grid'>('list');
  const [odRenaming, setOdRenaming] = useState<string | null>(null);
  const [odRenameName, setOdRenameName] = useState('');
  const [odUploading, setOdUploading] = useState(false);
  const [odUploadProgress, setOdUploadProgress] = useState(0);
  const [odUploadFile, setOdUploadFile] = useState<string>('');
  const [odDragOver, setOdDragOver] = useState(false);
  const [odTab, setOdTab] = useState<'files' | 'gallery'>('files');
  const [odGalleryPhotos, setOdGalleryPhotos] = useState<OneDriveFile[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);

  // ---- Restore session from storage ----
  useEffect(() => {
    const restoreFromStorage = () => {
      try {
        const savedConnected = localStorage.getItem('msConnected');
        const token = localStorage.getItem('msAccessToken');
        const refreshToken = localStorage.getItem('msRefreshToken');
        if (savedConnected === 'true' && token) {
          setMsAccessToken(token);
          setMsConnected(true);
          if (refreshToken) setMsRefreshToken(refreshToken);
          setMsTokenExpiry(Date.now() + 55 * 60 * 1000);
        }
      } catch { /* silent */ }
    };
    restoreFromStorage();

    // Listen for auth events from AppContext (doMicrosoftLogin / disconnectMicrosoft)
    const onMsConnected = () => restoreFromStorage();
    const onMsDisconnected = () => {
      setMsAccessToken(null);
      setMsConnected(false);
      setMsRefreshToken(null);
      setMsTokenExpiry(0);
      setOneDriveFiles([]);
      setOdProjectFolder(null);
      setOdBreadcrumbs([]);
      setOdCurrentFolder('root');
      setShowOneDrive(false);
    };

    window.addEventListener('archii-ms-connected', onMsConnected);
    window.addEventListener('archii-ms-disconnected', onMsDisconnected);
    return () => {
      window.removeEventListener('archii-ms-connected', onMsConnected);
      window.removeEventListener('archii-ms-disconnected', onMsDisconnected);
    };
  }, []);

  // ---- Refresh MS token ----
  const refreshMsToken = useCallback(async (): Promise<string | null> => {
    if (!msRefreshToken) return null;
    try {
      const fbToken = await getFirebaseIdToken();
      const res = await fetch('/api/onedrive/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${fbToken}` },
        body: JSON.stringify({ refreshToken: msRefreshToken })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.accessToken) {
          setMsAccessToken(data.accessToken);
          sessionStorage.setItem('archii-ms-token', data.accessToken);
          localStorage.setItem('msAccessToken', data.accessToken);
          setMsTokenExpiry(Date.now() + 55 * 60 * 1000);
          if (data.refreshToken) {
            setMsRefreshToken(data.refreshToken);
            localStorage.setItem('msRefreshToken', data.refreshToken);
          }
          return data.accessToken;
        }
      }
    } catch (e) {
      console.error('Error refreshing MS token:', e);
    }
    return null;
  }, [msRefreshToken]);

  // ---- Auto-refresh token every 30s ----
  useEffect(() => {
    if (!msConnected || !msRefreshToken) return;
    const interval = setInterval(async () => {
      if (Date.now() >= msTokenExpiry - 60000) {
        await refreshMsToken();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [msConnected, msRefreshToken, msTokenExpiry, refreshMsToken]);

  // ---- Graph API helper ----
  const graphApiGet = useCallback(async (endpoint: string, useToken?: string) => {
    const token = useToken || msAccessToken;
    if (!token) return null;
    try {
      const res = await fetch(`https://graph.microsoft.com/v1.0${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401 && !useToken) {
        const newToken = await refreshMsToken();
        if (newToken) return graphApiGet(endpoint, newToken);
        setMsConnected(false);
        setMsAccessToken(null);
        return null;
      }
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  }, [msAccessToken, refreshMsToken]);

  // ---- Ensure project folder exists ----
  const ensureProjectFolder = useCallback(async (projectName: string): Promise<string | null> => {
    if (!msAccessToken) return null;
    setMsLoading(true);
    try {
      const root = await graphApiGet('/me/drive/root/children');
      if (!root) { setMsLoading(false); return null; }
      const archiFolder = root.value?.find((f: any) => f.name === 'Archii' && f.folder);
      let archiFolderId: string;
      if (archiFolder) {
        archiFolderId = archiFolder.id;
      } else {
        const created = await fetch('https://graph.microsoft.com/v1.0/me/drive/root/children', {
          method: 'POST',
          headers: { Authorization: `Bearer ${msAccessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Archii', folder: {}, '@microsoft.graph.conflictBehavior': 'rename' })
        });
        if (!created.ok) { setMsLoading(false); return null; }
        const createdData = await created.json();
        archiFolderId = createdData.id;
      }
      const projChildren = await graphApiGet(`/me/drive/items/${archiFolderId}/children`);
      if (!projChildren) { setMsLoading(false); return null; }
      const projFolder = projChildren.value?.find((f: any) => f.name === projectName && f.folder);
      let projFolderId: string;
      if (projFolder) {
        projFolderId = projFolder.id;
      } else {
        const pCreated = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${archiFolderId}/children`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${msAccessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: projectName, folder: {}, '@microsoft.graph.conflictBehavior': 'rename' })
        });
        if (!pCreated.ok) { setMsLoading(false); return null; }
        const pCreatedData = await pCreated.json();
        projFolderId = pCreatedData.id;
      }
      setOdProjectFolder(projFolderId);
      setMsLoading(false);
      return projFolderId;
    } catch { setMsLoading(false); return null; }
  }, [msAccessToken, graphApiGet]);

  // ---- Load files in a folder ----
  const loadOneDriveFiles = useCallback(async (folderId: string) => {
    if (!msAccessToken) return;
    setMsLoading(true);
    try {
      const data = await graphApiGet(`/me/drive/items/${folderId}/children?$top=50&orderby=name`);
      if (data?.value) {
        setOneDriveFiles(data.value);
      }
    } catch { showToast('Error al cargar archivos', 'error'); }
    setMsLoading(false);
  }, [msAccessToken, graphApiGet, showToast]);

  // ---- Upload to OneDrive (simple) ----
  const uploadToOneDrive = useCallback(async (file: File, folderId: string) => {
    if (!msAccessToken) return;
    setMsLoading(true);
    try {
      const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${folderId}:/${encodeURIComponent(file.name)}:/content`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${msAccessToken}` },
        body: file
      });
      if (res.ok) {
        showToast('Archivo subido a OneDrive');
        loadOneDriveFiles(folderId);
      } else {
        showToast('Error al subir archivo', 'error');
      }
    } catch { showToast('Error al subir', 'error'); }
    setMsLoading(false);
  }, [msAccessToken, loadOneDriveFiles, showToast]);

  // ---- Delete from OneDrive ----
  const deleteFromOneDrive = useCallback(async (fileId: string, folderId: string) => {
    setMsLoading(true);
    try {
      const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${msAccessToken}` }
      });
      if (res.ok) { showToast('Eliminado de OneDrive'); loadOneDriveFiles(folderId); }
      else { showToast('Error al eliminar', 'error'); }
    } catch (err) { console.error('[Archii]', err); showToast('Error', 'error'); }
    setMsLoading(false);
  }, [msAccessToken, loadOneDriveFiles, showToast]);

  // ---- Open OneDrive for a project ----
  const openOneDriveForProject = useCallback(async (projectName: string) => {
    const folderId = await ensureProjectFolder(projectName);
    if (folderId) {
      await loadOneDriveFiles(folderId);
      setOdCurrentFolder(folderId);
      setOdBreadcrumbs([{ id: folderId, name: projectName }]);
      setShowOneDrive(true);
      setOdTab('files');
      setOdSearchQuery('');
      setOdSearchResults([]);
    } else {
      showToast('No se pudo crear la carpeta del proyecto', 'error');
    }
  }, [ensureProjectFolder, loadOneDriveFiles, showToast]);

  // ---- Navigate to folder ----
  const navigateToFolder = useCallback(async (folderId: string, breadcrumbIndex?: number) => {
    setOdCurrentFolder(folderId);
    if (breadcrumbIndex !== undefined) {
      setOdBreadcrumbs(prev => prev.slice(0, breadcrumbIndex + 1));
    }
    await loadOneDriveFiles(folderId);
  }, [loadOneDriveFiles]);

  // ---- Upload file with progress ----
  const uploadFileWithProgress = useCallback(async (file: File) => {
    setOdUploading(true);
    setOdUploadProgress(0);
    setOdUploadFile(file.name);
    try {
      if (file.size < 4 * 1024 * 1024) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folderId', odCurrentFolder);
        formData.append('projectId', selectedProjectId || '');
        setOdUploadProgress(50);
        const fbToken = await getFirebaseIdToken();
        const res = await fetch('/api/onedrive/files', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${msAccessToken}`, 'X-Firebase-Token': fbToken || '' },
          body: formData
        });
        setOdUploadProgress(100);
        if (res.ok) {
          showToast('Archivo subido a OneDrive');
          await loadOneDriveFiles(odCurrentFolder);
        } else {
          showToast('Error al subir archivo', 'error');
        }
      } else {
        const sessionRes = await fetch('https://graph.microsoft.com/v1.0/me/drive/items/' + odCurrentFolder + ':/' + encodeURIComponent(file.name) + '/createUploadSession', {
          method: 'POST',
          headers: { Authorization: `Bearer ${msAccessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'rename' } })
        });
        if (!sessionRes.ok) throw new Error('No se pudo crear la sesión de carga');
        const session = await sessionRes.json();
        const uploadUrl = session.uploadUrl;
        const chunkSize = 5 * 1024 * 1024;
        let offset = 0;
        while (offset < file.size) {
          const chunk = file.slice(offset, offset + chunkSize);
          const chunkRes = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
              'Content-Range': `bytes ${offset}-${Math.min(offset + chunkSize - 1, file.size - 1)}/${file.size}`,
              'Content-Length': String(chunk.size)
            },
            body: chunk
          });
          if (!chunkRes.ok) throw new Error('Error en la carga del fragmento');
          offset += chunkSize;
          setOdUploadProgress(Math.round((offset / file.size) * 100));
        }
        showToast('Archivo subido a OneDrive');
        await loadOneDriveFiles(odCurrentFolder);
      }
    } catch (err) {
      console.error('Upload error:', err);
      showToast('Error al subir archivo: ' + (err as Error).message, 'error');
    } finally {
      setTimeout(() => { setOdUploading(false); setOdUploadProgress(0); setOdUploadFile(''); }, 500);
    }
  }, [msAccessToken, odCurrentFolder, selectedProjectId, loadOneDriveFiles, showToast]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !odCurrentFolder) return;
    await uploadFileWithProgress(file);
    e.target.value = '';
  }, [odCurrentFolder, uploadFileWithProgress]);

  const handleDroppedFiles = useCallback(async (files: FileList) => {
    for (let i = 0; i < files.length; i++) {
      await uploadFileWithProgress(files[i]);
    }
  }, [uploadFileWithProgress]);

  // ---- Rename file ----
  const renameOneDriveFile = useCallback(async (fileId: string, newName: string) => {
    if (!newName.trim()) { setOdRenaming(null); return; }
    try {
      const fbToken = await getFirebaseIdToken();
      const res = await fetch(`/api/onedrive/files/${fileId}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${msAccessToken}`, 'Content-Type': 'application/json', 'X-Firebase-Token': fbToken || '' },
        body: JSON.stringify({ name: newName })
      });
      if (res.ok) {
        showToast('Archivo renombrado');
        setOdRenaming(null);
        await loadOneDriveFiles(odCurrentFolder);
      } else {
        showToast('Error al renombrar', 'error');
      }
    } catch { showToast('Error al renombrar', 'error'); }
  }, [msAccessToken, odCurrentFolder, loadOneDriveFiles, showToast]);

  // ---- Download file ----
  const downloadOneDriveFile = useCallback(async (fileId: string, fileName: string) => {
    try {
      const fbToken = await getFirebaseIdToken();
      const res = await fetch(`/api/onedrive/files/${fileId}`, {
        headers: { 'Authorization': `Bearer ${msAccessToken}`, 'X-Firebase-Token': fbToken || '' }
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = fileName; a.click();
        URL.revokeObjectURL(url);
      } else {
        showToast('Error al descargar', 'error');
      }
    } catch { showToast('Error al descargar', 'error'); }
  }, [msAccessToken, showToast]);

  // ---- Search files ----
  const searchOneDriveFiles = useCallback(async (query: string) => {
    if (!query.trim()) { setOdSearchResults([]); return; }
    setOdSearching(true);
    try {
      const fbToken = await getFirebaseIdToken();
      const res = await fetch(`/api/onedrive/search?q=${encodeURIComponent(query)}`, {
        headers: { 'Authorization': `Bearer ${msAccessToken}`, 'X-Firebase-Token': fbToken || '' }
      });
      if (res.ok) {
        const data = await res.json();
        setOdSearchResults(data.items || data.value || []);
      }
    } catch (e) { console.error(e); }
    setOdSearching(false);
  }, [msAccessToken]);

  // ---- Load gallery photos ----
  const loadGalleryPhotos = useCallback(async (projectId: string) => {
    setGalleryLoading(true);
    try {
      const fbToken = await getFirebaseIdToken();
      const res = await fetch(`/api/onedrive/gallery/${projectId}`, {
        headers: { 'Authorization': `Bearer ${msAccessToken}`, 'X-Firebase-Token': fbToken || '' }
      });
      if (res.ok) {
        const data = await res.json();
        setOdGalleryPhotos(data.items || data.photos || []);
      }
    } catch (e) { console.error(e); }
    setGalleryLoading(false);
  }, [msAccessToken]);

  // ---- Disconnect Microsoft ----
  const disconnectMicrosoft = useCallback(() => {
    setMsAccessToken(null);
    setMsConnected(false);
    setMsRefreshToken(null);
    sessionStorage.removeItem('archii-ms-token');
    localStorage.removeItem('msAccessToken');
    localStorage.removeItem('msConnected');
    localStorage.removeItem('msRefreshToken');
    window.dispatchEvent(new Event('archii-ms-disconnected'));
    showToast('Microsoft OneDrive desconectado');
  }, [showToast]);

  // ---- Context value ----
  const value: OneDriveContextValue = {
    msAccessToken, msConnected, msLoading, msRefreshToken, msTokenExpiry,
    setMsAccessToken, setMsConnected, setMsRefreshToken, setMsTokenExpiry,
    oneDriveFiles, setOneDriveFiles, odProjectFolder, showOneDrive, setShowOneDrive,
    odSearchQuery, setOdSearchQuery, odSearchResults, setOdSearchResults, odSearching,
    odBreadcrumbs, setOdBreadcrumbs, odCurrentFolder, setOdCurrentFolder,
    odViewMode, setOdViewMode, odRenaming, setOdRenaming, odRenameName, setOdRenameName,
    odUploading, odUploadProgress, odUploadFile, odDragOver, setOdDragOver,
    odTab, setOdTab, odGalleryPhotos, galleryLoading,
    refreshMsToken, ensureProjectFolder, loadOneDriveFiles,
    uploadToOneDrive, deleteFromOneDrive, openOneDriveForProject,
    navigateToFolder, uploadFileWithProgress, handleFileUpload, handleDroppedFiles,
    renameOneDriveFile, downloadOneDriveFile, searchOneDriveFiles,
    loadGalleryPhotos, disconnectMicrosoft,
  };

  return (
    <OneDriveContext.Provider value={value}>
      {children}
    </OneDriveContext.Provider>
  );
}

/* ===== Hook ===== */

export function useOneDrive(): OneDriveContextValue {
  const ctx = useContext(OneDriveContext);
  if (!ctx) {
    throw new Error('useOneDrive must be used within an OneDriveProvider');
  }
  return ctx;
}

/* ===== Helper functions (pure — used by screens) ===== */

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

export function getFileIcon(mimeType: string, name?: string): string {
  if (mimeType.includes('folder')) return '📁';
  if (mimeType.includes('pdf')) return '📄';
  if (mimeType.includes('image')) return '🖼️';
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📽️';
  if (mimeType.includes('dwg') || mimeType.includes('dxf')) return '📐';
  if (mimeType.includes('zip') || mimeType.includes('rar')) return '📦';
  if (mimeType.includes('video')) return '🎬';
  if (name?.endsWith('.pdf')) return '📄';
  if (name?.match(/\.(jpg|jpeg|png|gif|svg|webp|bmp|heic)$/i)) return '🖼️';
  if (name?.match(/\.(doc|docx)$/i)) return '📝';
  if (name?.match(/\.(xls|xlsx)$/i)) return '📊';
  if (name?.match(/\.(dwg|dxf)$/i)) return '📐';
  if (name?.match(/\.(zip|rar)$/i)) return '📦';
  if (name?.match(/\.(mp4|mov|avi|mkv)$/i)) return '🎬';
  return '📎';
}
