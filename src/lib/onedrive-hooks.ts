'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '@/contexts/AppContext';
import { getFirebaseIdToken } from '@/lib/firebase-service';

/* ===== Types ===== */
export interface ODItem {
  id: string;
  name: string;
  size?: number;
  mimeType?: string;
  folder?: Record<string, unknown>;
  file?: { mimeType?: string };
  lastModifiedDateTime?: string;
  createdDateTime?: string;
  webUrl?: string;
  thumbnails?: Array<{ medium?: { url?: string } }>;
}

export type TabKey = 'team' | 'personal';

/* ===== Helpers ===== */
export const getFileIcon = (item: ODItem): string => {
  if (item.folder) return '📁';
  const name = (item.name || '').toLowerCase();
  const mime = item.file?.mimeType || item.mimeType || '';
  if (mime.includes('pdf') || name.endsWith('.pdf')) return '📄';
  if (mime.includes('image') || name.match(/\.(jpg|jpeg|png|gif|svg|webp|bmp|heic)$/)) return '🖼️';
  if (mime.includes('word') || name.match(/\.(doc|docx)$/)) return '📝';
  if (mime.includes('sheet') || name.includes('excel') || name.match(/\.(xls|xlsx)$/)) return '📊';
  if (mime.includes('presentation') || name.includes('powerpoint') || name.match(/\.(ppt|pptx)$/)) return '📽️';
  if (name.match(/\.(dwg|dxf)$/)) return '📐';
  if (name.match(/\.(zip|rar|7z)$/)) return '📦';
  if (mime.includes('video') || name.match(/\.(mp4|mov|avi|mkv)$/)) return '🎬';
  if (mime.includes('audio') || name.match(/\.(mp3|wav|ogg|aac)$/)) return '🎵';
  if (name.match(/\.(csv)$/)) return '📊';
  if (name.match(/\.(txt|md|log)$/)) return '📃';
  return '📎';
};

export const formatTimeAgo = (dateStr?: string): string => {
  if (!dateStr) return '';
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `hace ${days}d`;
  return new Date(dateStr).toLocaleDateString('es-CO');
};

/* ===== Tenant OneDrive Hook ===== */
export function useTenantOneDrive(tenantId: string | null) {
  const [items, setItems] = useState<ODItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentFolder, setCurrentFolder] = useState<string>('root');
  const [breadcrumbs, setBreadcrumbs] = useState<{ id: string; name: string }[]>([]);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadFileName, setUploadFileName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<'auth' | 'network' | 'quota' | 'generic'>('generic');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-clear error after 8 seconds
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => {
      setError(null);
      setErrorType('generic');
    }, 8000);
    return () => clearTimeout(timer);
  }, [error]);

  const clearError = () => { setError(null); setErrorType('generic'); };

  // Check connection status
  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      try {
        const token = await getFirebaseIdToken();
        if (!token) return;
        const res = await fetch(`/api/tenants/onedrive/connect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ action: 'status', tenantId }),
        });
        if (res.ok) {
          const data = await res.json();
          setConnected(data.connected);
          setConnectedEmail(data.connectedByEmail);
        }
      } catch (err) {
        console.error('[Tenant OD] Status check error:', err);
      }
    })();
  }, [tenantId]);

  // Load files
  const loadFiles = useCallback(async (folderId?: string) => {
    if (!tenantId) return;
    const targetFolder = folderId || currentFolder;
    setLoading(true);
    try {
      const token = await getFirebaseIdToken();
      if (!token) return;
      const params = new URLSearchParams({ tenantId, folderId: targetFolder, top: '100' });
      const res = await fetch(`/api/tenants/onedrive/files?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
        if (data.folderId && targetFolder === 'root') {
          setCurrentFolder(data.folderId);
        }
      } else if (res.status === 401) {
        const data = await res.json();
        if (data.code === 'TOKEN_EXPIRED') {
          // Try refreshing
          await refreshTenantToken(tenantId);
          // Get fresh token for retry
          const newToken = await getFirebaseIdToken();
          if (!newToken) return;
          const retryRes = await fetch(`/api/tenants/onedrive/files?${params}`, {
            headers: { 'Authorization': `Bearer ${newToken}` },
          });
          if (retryRes.ok) {
            const data2 = await retryRes.json();
            setItems(data2.items || []);
          } else {
            setError('Sesión de Microsoft expirada. Reconecta la cuenta.');
            setErrorType('auth');
          }
        }
      }
    } catch (err) {
      console.error('[Tenant OD] Load files error:', err);
      setError('Error al cargar archivos. Verifica tu conexión.');
      setErrorType('network');
    } finally {
      setLoading(false);
    }
  }, [tenantId, currentFolder]);

  const refreshTenantToken = async (tid: string) => {
    try {
      const token = await getFirebaseIdToken();
      if (!token) return;
      await fetch('/api/tenants/onedrive/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ action: 'refresh', tenantId: tid }),
      });
    } catch (err) {
      console.error('[Tenant OD] Refresh error:', err);
    }
  };

  // Navigate to folder
  const navigateToFolder = (folderId: string, folderName: string) => {
    setCurrentFolder(folderId);
    setBreadcrumbs(prev => [...prev, { id: folderId, name: folderName }]);
    setSearchQuery('');
    setRenamingId(null);
    loadFiles(folderId);
  };

  // Navigate breadcrumb
  const navigateBreadcrumb = (index: number) => {
    if (index === -1) {
      // Root
      setCurrentFolder('root');
      setBreadcrumbs([]);
      setSearchQuery('');
      setRenamingId(null);
      loadFiles('root');
    } else {
      const newCrumbs = breadcrumbs.slice(0, index + 1);
      const target = newCrumbs[newCrumbs.length - 1];
      setCurrentFolder(target.id);
      setBreadcrumbs(newCrumbs);
      setSearchQuery('');
      setRenamingId(null);
      loadFiles(target.id);
    }
  };

  // Upload file
  const uploadFile = async (file: File) => {
    if (!tenantId) return;
    setUploading(true);
    setUploadFileName(file.name);
    setUploadProgress(10);
    try {
      const token = await getFirebaseIdToken();
      if (!token) return;
      const formData = new FormData();
      formData.append('file', file);
      const params = new URLSearchParams({ tenantId, folderId: currentFolder });
      setUploadProgress(40);
      const res = await fetch(`/api/tenants/onedrive/files?${params}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      setUploadProgress(90);
      if (res.ok) {
        loadFiles();
      } else {
        const errText = await res.text().catch(() => '');
        console.error('[Tenant OD] Upload error:', errText);
        setError(`Error al subir "${file.name}". Intenta de nuevo.`);
        setErrorType(res.status === 401 ? 'auth' : res.status === 507 ? 'quota' : 'network');
      }
    } catch (err) {
      console.error('[Tenant OD] Upload error:', err);
      setError(`Error al subir "${file.name}". Intenta de nuevo.`);
      setErrorType('network');
    } finally {
      setUploading(false);
      setUploadProgress(100);
      setUploadFileName('');
    }
  };

  // Delete file (callers should confirm before invoking)
  const deleteFile = async (itemId: string, itemName: string) => {
    if (!tenantId) return;
    try {
      const token = await getFirebaseIdToken();
      if (!token) return;
      const params = new URLSearchParams({ tenantId });
      const res = await fetch(`/api/tenants/onedrive/files/${itemId}?${params}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        loadFiles();
      } else {
        setError(`Error al eliminar "${itemName}". Intenta de nuevo.`);
        setErrorType('generic');
      }
    } catch (err) {
      console.error('[Tenant OD] Delete error:', err);
      setError(`Error al eliminar "${itemName}". Verifica tu conexión.`);
      setErrorType('network');
    }
  };

  // Rename file
  const renameFile = async (itemId: string, newName: string) => {
    if (!newName.trim() || !tenantId) return;
    try {
      const token = await getFirebaseIdToken();
      if (!token) return;
      const params = new URLSearchParams({ tenantId });
      const res = await fetch(`/api/tenants/onedrive/files/${itemId}?${params}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (res.ok) {
        setRenamingId(null);
        setRenameName('');
        loadFiles();
      } else {
        setError(`Error al renombrar. Intenta de nuevo.`);
        setErrorType('generic');
      }
    } catch (err) {
      console.error('[Tenant OD] Rename error:', err);
      setError('Error al renombrar. Verifica tu conexión.');
      setErrorType('network');
    }
  };

  // Download file
  const downloadFile = async (itemId: string) => {
    if (!tenantId) return;
    try {
      const token = await getFirebaseIdToken();
      if (!token) return;
      const params = new URLSearchParams({ tenantId });
      const res = await fetch(`/api/tenants/onedrive/files/${itemId}?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const contentDisp = res.headers.get('content-disposition');
        let filename = 'descargar';
        if (contentDisp) {
          const match = contentDisp.match(/filename\*=UTF-8''(.+)/i);
          if (match) filename = decodeURIComponent(match[1]);
        }
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        setError('Error al descargar el archivo.');
        setErrorType('network');
      }
    } catch (err) {
      console.error('[Tenant OD] Download error:', err);
      setError('Error al descargar. Verifica tu conexión.');
      setErrorType('network');
    }
  };

  // Create folder
  const createFolder = async (name: string) => {
    if (!name.trim() || !tenantId) return;
    try {
      const token = await getFirebaseIdToken();
      if (!token) return;
      const res = await fetch('/api/tenants/onedrive/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ tenantId, folderId: currentFolder, name: name.trim() }),
      });
      if (res.ok) {
        setCreatingFolder(false);
        setNewFolderName('');
        loadFiles();
      } else {
        setError('Error al crear la carpeta.');
        setErrorType('generic');
      }
    } catch (err) {
      console.error('[Tenant OD] Create folder error:', err);
      setError('Error al crear la carpeta. Verifica tu conexión.');
      setErrorType('network');
    }
  };

  // Handle dropped files
  const handleDroppedFiles = (files: FileList) => {
    if (!connected) return;
    Array.from(files).forEach(file => uploadFile(file));
  };

  // Filter items by search
  const filteredItems = searchQuery
    ? items.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : items;

  return {
    items, filteredItems, loading, currentFolder, breadcrumbs,
    connected, connectedEmail, uploading, uploadProgress, uploadFileName,
    searchQuery, setSearchQuery, viewMode, setViewMode,
    renamingId, setRenamingId, renameName, setRenameName,
    creatingFolder, setCreatingFolder, newFolderName, setNewFolderName,
    dragOver, setDragOver, fileInputRef,
    error, errorType, clearError,
    loadFiles, navigateToFolder, navigateBreadcrumb, uploadFile,
    deleteFile, renameFile, downloadFile, createFolder, handleDroppedFiles,
  };
}

/* ===== Personal OneDrive Hook ===== */
export function usePersonalOneDrive() {
  const { msConnected, msAccessToken, msRefreshToken, refreshMsToken, setMsTokenExpiry } = useApp();
  const [items, setItems] = useState<ODItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentFolder, setCurrentFolder] = useState<string>('root');
  const [breadcrumbs, setBreadcrumbs] = useState<{ id: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadFileName, setUploadFileName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<'auth' | 'network' | 'quota' | 'generic'>('generic');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-clear error after 8 seconds
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => {
      setError(null);
      setErrorType('generic');
    }, 8000);
    return () => clearTimeout(timer);
  }, [error]);

  const clearError = () => { setError(null); setErrorType('generic'); };

  const loadFiles = useCallback(async (folderId?: string) => {
    if (!msConnected) return;
    const targetFolder = folderId || currentFolder;
    setLoading(true);
    try {
      const fbToken = await getFirebaseIdToken();
      if (!fbToken || !msAccessToken) return;
      const params = new URLSearchParams({ folderId: targetFolder, top: '100' });
      const res = await fetch(`/api/onedrive/files?${params}`, {
        headers: { 'x-firebase-token': fbToken, 'Authorization': `Bearer ${msAccessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      } else if (res.status === 401) {
        const data = await res.json();
        if (data.code === 'TOKEN_EXPIRED' && msRefreshToken) {
          const newToken = await refreshMsToken();
          if (newToken) {
            setMsTokenExpiry(Date.now() + 55 * 60 * 1000);
            const retryRes = await fetch(`/api/onedrive/files?${params}`, {
              headers: { 'x-firebase-token': fbToken, 'Authorization': `Bearer ${newToken}` },
            });
            if (retryRes.ok) {
              const data2 = await retryRes.json();
              setItems(data2.items || []);
            } else {
              setError('Sesión de Microsoft expirada. Reconecta tu cuenta.');
              setErrorType('auth');
            }
          } else {
            setError('Sesión de Microsoft expirada. Reconecta tu cuenta.');
            setErrorType('auth');
          }
        }
      }
    } catch (err) {
      console.error('[Personal OD] Load error:', err);
      setError('Error al cargar archivos. Verifica tu conexión.');
      setErrorType('network');
    } finally {
      setLoading(false);
    }
  }, [msConnected, msAccessToken, msRefreshToken, currentFolder, refreshMsToken, setMsTokenExpiry]);

  const navigateToFolder = (folderId: string, folderName: string) => {
    setCurrentFolder(folderId);
    setBreadcrumbs(prev => [...prev, { id: folderId, name: folderName }]);
    setSearchQuery('');
    setRenamingId(null);
    loadFiles(folderId);
  };

  const navigateBreadcrumb = (index: number) => {
    if (index === -1) {
      setCurrentFolder('root');
      setBreadcrumbs([]);
      setSearchQuery('');
      setRenamingId(null);
      loadFiles('root');
    } else {
      const newCrumbs = breadcrumbs.slice(0, index + 1);
      const target = newCrumbs[newCrumbs.length - 1];
      setCurrentFolder(target.id);
      setBreadcrumbs(newCrumbs);
      setSearchQuery('');
      setRenamingId(null);
      loadFiles(target.id);
    }
  };

  const uploadFile = async (file: File) => {
    if (!msConnected) return;
    setUploading(true);
    setUploadFileName(file.name);
    setUploadProgress(10);
    try {
      const fbToken = await getFirebaseIdToken();
      if (!fbToken || !msAccessToken) return;
      const formData = new FormData();
      formData.append('file', file);
      const params = new URLSearchParams({ folderId: currentFolder });
      setUploadProgress(40);
      const res = await fetch(`/api/onedrive/files?${params}`, {
        method: 'POST',
        headers: { 'x-firebase-token': fbToken, 'Authorization': `Bearer ${msAccessToken}` },
        body: formData,
      });
      setUploadProgress(90);
      if (res.ok) {
        loadFiles();
      } else {
        const errText = await res.text().catch(() => '');
        console.error('[Personal OD] Upload error:', errText);
        setError(`Error al subir "${file.name}". Intenta de nuevo.`);
        setErrorType(res.status === 401 ? 'auth' : res.status === 507 ? 'quota' : 'network');
      }
    } catch (err) {
      console.error('[Personal OD] Upload error:', err);
      setError(`Error al subir "${file.name}". Intenta de nuevo.`);
      setErrorType('network');
    } finally {
      setUploading(false);
      setUploadProgress(100);
      setUploadFileName('');
    }
  };

  // Delete file (callers should confirm before invoking)
  const deleteFile = async (itemId: string, itemName: string) => {
    if (!msConnected) return;
    try {
      const fbToken = await getFirebaseIdToken();
      if (!fbToken || !msAccessToken) return;
      const res = await fetch(`/api/onedrive/files/${itemId}`, {
        method: 'DELETE',
        headers: { 'x-firebase-token': fbToken, 'Authorization': `Bearer ${msAccessToken}` },
      });
      if (res.ok) {
        loadFiles();
      } else {
        setError(`Error al eliminar "${itemName}". Intenta de nuevo.`);
        setErrorType('generic');
      }
    } catch (err) {
      console.error('[Personal OD] Delete error:', err);
      setError(`Error al eliminar "${itemName}". Verifica tu conexión.`);
      setErrorType('network');
    }
  };

  const renameFile = async (itemId: string, newName: string) => {
    if (!newName.trim() || !msConnected) return;
    try {
      const fbToken = await getFirebaseIdToken();
      if (!fbToken || !msAccessToken) return;
      const res = await fetch(`/api/onedrive/files/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-firebase-token': fbToken, 'Authorization': `Bearer ${msAccessToken}` },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (res.ok) {
        setRenamingId(null);
        setRenameName('');
        loadFiles();
      } else {
        setError('Error al renombrar. Intenta de nuevo.');
        setErrorType('generic');
      }
    } catch (err) {
      console.error('[Personal OD] Rename error:', err);
      setError('Error al renombrar. Verifica tu conexión.');
      setErrorType('network');
    }
  };

  const downloadFile = async (itemId: string) => {
    if (!msConnected) return;
    try {
      const fbToken = await getFirebaseIdToken();
      if (!fbToken || !msAccessToken) return;
      const res = await fetch(`/api/onedrive/files/${itemId}`, {
        headers: { 'x-firebase-token': fbToken, 'Authorization': `Bearer ${msAccessToken}` },
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const contentDisp = res.headers.get('content-disposition');
        let filename = 'descargar';
        if (contentDisp) {
          const match = contentDisp.match(/filename\*=UTF-8''(.+)/i);
          if (match) filename = decodeURIComponent(match[1]);
        }
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        setError('Error al descargar el archivo.');
        setErrorType('network');
      }
    } catch (err) {
      console.error('[Personal OD] Download error:', err);
      setError('Error al descargar. Verifica tu conexión.');
      setErrorType('network');
    }
  };

  const createFolder = async (name: string) => {
    if (!name.trim() || !msConnected) return;
    try {
      const fbToken = await getFirebaseIdToken();
      if (!fbToken || !msAccessToken) return;
      const res = await fetch('/api/onedrive/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-firebase-token': fbToken, 'Authorization': `Bearer ${msAccessToken}` },
        body: JSON.stringify({ folderId: currentFolder, folderName: name.trim(), projectId: '' }),
      });
      if (res.ok) {
        setCreatingFolder(false);
        setNewFolderName('');
        loadFiles();
      } else {
        setError('Error al crear la carpeta.');
        setErrorType('generic');
      }
    } catch (err) {
      console.error('[Personal OD] Create folder error:', err);
      setError('Error al crear la carpeta. Verifica tu conexión.');
      setErrorType('network');
    }
  };

  const handleDroppedFiles = (files: FileList) => {
    if (!msConnected) return;
    Array.from(files).forEach(file => uploadFile(file));
  };

  const filteredItems = searchQuery
    ? items.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : items;

  return {
    items, filteredItems, loading, currentFolder, breadcrumbs,
    uploading, uploadProgress, uploadFileName,
    searchQuery, setSearchQuery, viewMode, setViewMode,
    renamingId, setRenamingId, renameName, setRenameName,
    creatingFolder, setCreatingFolder, newFolderName, setNewFolderName,
    dragOver, setDragOver, fileInputRef,
    error, errorType, clearError,
    loadFiles, navigateToFolder, navigateBreadcrumb, uploadFile,
    deleteFile, renameFile, downloadFile, createFolder, handleDroppedFiles,
  };
}
