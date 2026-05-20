'use client';
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useNotificationsContext } from '@/hooks/useNotifications';
import { toast } from 'sonner';
import type { InvProduct, InvCategory, InvMovement, InvTransfer } from '@/lib/types';
import { INV_WAREHOUSES, CAT_COLORS } from '@/lib/types';
import { fileToBase64, scrubUndefined } from '@/lib/helpers';
import { getFirebase } from '@/lib/firebase-service';

/* ===== TYPES ===== */
export interface InventoryContextValue {
  // State
  invProducts: InvProduct[];
  invCategories: InvCategory[];
  invMovements: InvMovement[];
  invTransfers: InvTransfer[];
  invTab: 'dashboard' | 'products' | 'categories' | 'warehouse' | 'movements' | 'transfers' | 'reports';
  setInvTab: React.Dispatch<React.SetStateAction<'dashboard' | 'products' | 'categories' | 'warehouse' | 'movements' | 'transfers' | 'reports'>>;
  invFilterCat: string;
  setInvFilterCat: React.Dispatch<React.SetStateAction<string>>;
  invSearch: string;
  setInvSearch: React.Dispatch<React.SetStateAction<string>>;
  invMovFilterType: string;
  setInvMovFilterType: React.Dispatch<React.SetStateAction<string>>;
  invTransferFilterStatus: string;
  setInvTransferFilterStatus: React.Dispatch<React.SetStateAction<string>>;
  invWarehouseFilter: string;
  setInvWarehouseFilter: React.Dispatch<React.SetStateAction<string>>;

  // Functions
  getWarehouseStock: (product: InvProduct, warehouse?: string) => number;
  getTotalStock: (product: InvProduct) => number;
  buildWarehouseStock: (product: InvProduct) => Record<string, number>;
  saveInvProduct: () => Promise<void>;
  deleteInvProduct: (id: string) => Promise<void>;
  openEditInvProduct: (p: InvProduct) => void;
  saveInvCategory: () => Promise<void>;
  deleteInvCategory: (id: string) => Promise<void>;
  openEditInvCategory: (c: InvCategory) => void;
  saveInvMovement: () => Promise<void>;
  deleteInvMovement: (id: string) => Promise<void>;
  saveInvTransfer: () => Promise<void>;
  deleteInvTransfer: (id: string) => Promise<void>;
  getInvCategoryName: (catId: string) => string;
  getInvCategoryColor: (catId: string) => string;
  getInvProductName: (prodId: string) => string;
  handleInvProductImageSelect: (e: any) => void;

  // Derived values
  invTotalValue: number;
  invLowStock: InvProduct[];
  invTotalStock: number;
  invPendingTransfers: number;
  invAlerts: Array<{ type: string; msg: string; severity: string }>;
}

const InventoryContext = createContext<InventoryContextValue>(null!);

/* ===== HELPERS ===== */
// scrubUndefined imported from @/lib/helpers (canonical version)


/* ===== PROVIDER ===== */
export function InventoryProvider({ children }: { children: React.ReactNode }) {
  const { authUser, activeTenantId, ready, forms, setForms, editingId, setEditingId, showToast, openModal, closeModal, setPendingDeleteAction } = useApp();
  const { sendNotif, notifPrefs } = useNotificationsContext();

  // ===== INVENTORY STATE =====
  const [invProducts, setInvProducts] = useState<InvProduct[]>([]);
  const [invCategories, setInvCategories] = useState<InvCategory[]>([]);
  const [invMovements, setInvMovements] = useState<InvMovement[]>([]);
  const [invTransfers, setInvTransfers] = useState<InvTransfer[]>([]);
  const [invTab, setInvTab] = useState<'dashboard' | 'products' | 'categories' | 'warehouse' | 'movements' | 'transfers' | 'reports'>('dashboard');
  const [invFilterCat, setInvFilterCat] = useState<string>('all');
  const [invSearch, setInvSearch] = useState('');
  const [invMovFilterType, setInvMovFilterType] = useState<string>('all');
  const [invTransferFilterStatus, setInvTransferFilterStatus] = useState<string>('all');
  const [invWarehouseFilter, setInvWarehouseFilter] = useState<string>('all');

  // ===== INTERNAL REFS (notification detection) =====
  const knownMovementIdsRef = useRef<Set<string>>(new Set());
  const knownTransferIdsRef = useRef<Set<string>>(new Set());
  const prevTransferStatusRef = useRef<Map<string, string>>(new Map());
  const firstInvLoadRef = useRef(false);

  // ===== FIRESTORE LISTENERS =====

  // Load inventory products (tenant-filtered)
  useEffect(() => {
    if (!ready || !authUser || !activeTenantId) { setInvProducts([]); return; }
    const db = getFirebase().firestore();
    const unsub = db.collection('invProducts').where('tenantId', '==', activeTenantId).orderBy('createdAt', 'desc').onSnapshot(snap => {
      setInvProducts(snap.docs.map((d: any) => ({ id: d.id, data: d.data() })));
    }, () => {});
    return () => unsub();
  }, [ready, authUser, activeTenantId]);

  // Load inventory categories (tenant-filtered)
  useEffect(() => {
    if (!ready || !authUser || !activeTenantId) { setInvCategories([]); return; }
    const db = getFirebase().firestore();
    const unsub = db.collection('invCategories').where('tenantId', '==', activeTenantId).orderBy('name', 'asc').onSnapshot(snap => {
      setInvCategories(snap.docs.map((d: any) => ({ id: d.id, data: d.data() })));
    }, () => {});
    return () => unsub();
  }, [ready, authUser, activeTenantId]);

  // Load inventory movements (tenant-filtered)
  useEffect(() => {
    if (!ready || !authUser || !activeTenantId) { setInvMovements([]); return; }
    const db = getFirebase().firestore();
    const unsub = db.collection('invMovements').where('tenantId', '==', activeTenantId).orderBy('createdAt', 'desc').limit(100).onSnapshot(snap => {
      setInvMovements(snap.docs.map((d: any) => ({ id: d.id, data: d.data() })));
    }, () => {});
    return () => unsub();
  }, [ready, authUser, activeTenantId]);

  // Load inventory transfers (tenant-filtered)
  useEffect(() => {
    if (!ready || !authUser || !activeTenantId) { setInvTransfers([]); return; }
    const db = getFirebase().firestore();
    const unsub = db.collection('invTransfers').where('tenantId', '==', activeTenantId).orderBy('createdAt', 'desc').limit(100).onSnapshot(snap => {
      setInvTransfers(snap.docs.map((d: any) => ({ id: d.id, data: d.data() })));
    }, () => {});
    return () => unsub();
  }, [ready, authUser, activeTenantId]);

  // ===== NOTIFICATION: Mark inventory as loaded =====
  useEffect(() => {
    if (invProducts.length > 0 || invMovements.length > 0 || invTransfers.length > 0) {
      firstInvLoadRef.current = true;
    }
  }, [invProducts, invMovements, invTransfers]);

  // ===== NOTIFICATION: Detect low stock and inventory alerts (Set-based O(1) lookup) =====
  useEffect(() => {
    if (!firstInvLoadRef.current) return;
    if (!notifPrefs.inventory) return;
    const newMovIds: string[] = [];
    const newTransIds: string[] = [];
    const changedTransIds: string[] = [];
    invMovements.forEach(m => { if (!knownMovementIdsRef.current.has(m.id)) newMovIds.push(m.id); });
    invTransfers.forEach(t => {
      if (!knownTransferIdsRef.current.has(t.id)) newTransIds.push(t.id);
      else {
        const prev = prevTransferStatusRef.current.get(t.id);
        if (prev && prev !== t.data.status) changedTransIds.push(t.id);
      }
    });
    knownMovementIdsRef.current = new Set(invMovements.map(m => m.id));
    knownTransferIdsRef.current = new Set(invTransfers.map(t => t.id));
    invTransfers.forEach(t => { prevTransferStatusRef.current.set(t.id, t.data.status); });

    newMovIds.forEach(id => {
      const m = invMovements.find(mm => mm.id === id);
      if (!m) return;
      const prod = invProducts.find(p => p.id === m.data.productId);
      sendNotif(m.data.type === 'Entrada' ? '📥 Entrada de inventario' : '📤 Salida de inventario', `${prod?.data?.name || 'Producto'} · ${m.data.quantity} ${prod?.data?.unit || 'uds'}${m.data.reason ? ` — ${m.data.reason}` : ''}`, undefined, `mov-${m.id}`, { type: 'inventory', screen: 'inventory' });
    });
    newTransIds.forEach(id => {
      const t = invTransfers.find(tt => tt.id === id);
      if (!t) return;
      sendNotif('🚚 Nueva transferencia', `${t.data.productName || 'Producto'}: ${t.data.fromWarehouse} → ${t.data.toWarehouse} (${t.data.quantity})`, undefined, `transfer-${t.id}`, { type: 'inventory', screen: 'inventory' });
    });
    changedTransIds.forEach(id => {
      const t = invTransfers.find(tt => tt.id === id);
      if (!t) return;
      const statusEmoji = t.data.status === 'Completada' ? '✅' : t.data.status === 'En tránsito' ? '🚛' : t.data.status === 'Cancelada' ? '❌' : '📦';
      sendNotif(`${statusEmoji} Transferencia ${t.data.status.toLowerCase()}`, `${t.data.productName || 'Producto'}: ${t.data.fromWarehouse} → ${t.data.toWarehouse}`, undefined, `transfer-${t.id}`, { type: 'inventory', screen: 'inventory' });
    });
  }, [invMovements, invTransfers, invProducts, notifPrefs.inventory, sendNotif]);

  // ===== NOTIFICATION: Low stock periodic check (every 10 min) =====
  useEffect(() => {
    if (!firstInvLoadRef.current) return;
    if (!notifPrefs.inventory) return;
    let lastLowStockCount = -1;
    const check = () => {
      const lowStock = invProducts.filter(p => { const stock = p.data.warehouseStock ? (Object.values(p.data.warehouseStock) as number[]).reduce((a: number, b: number) => a + b, 0) : p.data.stock; return stock > 0 && stock <= (p.data.minStock || 5); });
      const outOfStock = invProducts.filter(p => { const stock = p.data.warehouseStock ? (Object.values(p.data.warehouseStock) as number[]).reduce((a: number, b: number) => a + b, 0) : p.data.stock; return stock <= 0; });
      const total = lowStock.length + outOfStock.length;
      if (total > 0 && total !== lastLowStockCount) {
        lastLowStockCount = total;
        sendNotif(outOfStock.length > 0 ? '🚨 Alerta de inventario' : '⚠️ Stock bajo', outOfStock.length > 0 ? `${outOfStock.length} sin stock${lowStock.length > 0 ? `, ${lowStock.length} bajo mínimo` : ''}: ${outOfStock.map(p => p.data.name).slice(0,3).join(', ')}` : `${lowStock.length} producto${lowStock.length > 1 ? 's' : ''} bajo mínimo: ${lowStock.map(p => p.data.name).slice(0,3).join(', ')}`, undefined, 'inv-lowstock-check', { type: 'inventory', screen: 'inventory' });
      }
    };
    const initTimer = setTimeout(check, 10000);
    const iv = setInterval(check, 10 * 60 * 1000);
    return () => { clearTimeout(initTimer); clearInterval(iv); };
  }, [invProducts, notifPrefs.inventory, sendNotif]);

  // ===== INVENTORY FUNCTIONS =====
  const getWarehouseStock = (product: InvProduct, warehouse?: string) => {
    if (product.data.warehouseStock && typeof product.data.warehouseStock === 'object') {
      return Number(product.data.warehouseStock[warehouse || '']) || 0;
    }
    // Backward compat: if no warehouseStock map, use single warehouse field
    return product.data.warehouse === warehouse ? (Number(product.data.stock) || 0) : 0;
  };

  const getTotalStock = (product: InvProduct) => {
    if (product.data.warehouseStock && typeof product.data.warehouseStock === 'object') {
      return Object.values(product.data.warehouseStock).reduce((s: number, v: any) => s + (Number(v) || 0), 0);
    }
    return Number(product.data.stock) || 0;
  };

  const buildWarehouseStock = (product: InvProduct) => {
    if (product.data.warehouseStock && typeof product.data.warehouseStock === 'object') {
      const ws = { ...product.data.warehouseStock };
      // Ensure all warehouses have entries
      INV_WAREHOUSES.forEach(w => { if (ws[w] === undefined) ws[w] = 0; });
      return ws;
    }
    // Migrate old format
    const ws: Record<string, number> = {};
    INV_WAREHOUSES.forEach(w => { ws[w] = w === (product.data.warehouse || 'Almacén Principal') ? (Number(product.data.stock) || 0) : 0; });
    return ws;
  };

  const saveInvProduct = async () => {
    const name = forms.invProdName || '';
    if (!name) { showToast('El nombre es obligatorio', 'error'); return; }
    if (!authUser) { showToast('Error: no hay sesión activa', 'error'); return; }
    try {
      const db = getFirebase().firestore();
      const ts = getFirebase().firestore.FieldValue.serverTimestamp();
      const warehouseStock: Record<string, number> = {};
      INV_WAREHOUSES.forEach(w => { warehouseStock[w] = Number(forms[`invProdWS_${w.replace(/\s/g, '_')}`]) || 0; });
      const totalStock = Object.values(warehouseStock).reduce((s: number, v: any) => s + (Number(v) || 0), 0);
      const raw = { name, sku: forms.invProdSku || '', categoryId: forms.invProdCat || '', unit: forms.invProdUnit || 'Unidad', price: Number(forms.invProdPrice) || 0, stock: totalStock, minStock: Number(forms.invProdMinStock) || 0, description: forms.invProdDesc || '', imageData: forms.invProdImage || '', warehouse: forms.invProdWarehouse || 'Almacén Principal', warehouseStock, updatedAt: ts, updatedBy: authUser.uid };
      const data = scrubUndefined(raw);
      if (editingId) { await db.collection('invProducts').doc(editingId).update(data); showToast('Producto actualizado'); }
      else { await db.collection('invProducts').add(scrubUndefined({ ...raw, tenantId: activeTenantId || '', createdAt: ts, createdBy: authUser.uid })); showToast('Producto creado'); }
      closeModal('invProduct'); setEditingId(null);
      const resetForms: Record<string, any> = { invProdName: '', invProdSku: '', invProdCat: '', invProdUnit: 'Unidad', invProdPrice: '', invProdMinStock: '5', invProdDesc: '', invProdImage: '', invProdWarehouse: 'Almacén Principal' };
      INV_WAREHOUSES.forEach(w => { resetForms[`invProdWS_${w.replace(/\s/g, '_')}`] = '0'; });
      setForms(p => ({ ...p, ...resetForms }));
    } catch (err) { console.error('[Archii] saveInvProduct error:', err); showToast('Error al guardar', 'error'); }
  };

  const deleteInvProduct = async (id: string) => {
    const product = invProducts.find(p => p.id === id);
    const productData = product ? { ...product.data } : null;
    setPendingDeleteAction({
      open: true,
      title: 'Eliminar producto',
      description: '¿Estás seguro de que deseas eliminar este producto del inventario?',
      onConfirm: async () => {
        setPendingDeleteAction(null);
        try {
          await getFirebase().firestore().collection('invProducts').doc(id).delete();
          if (productData) {
            toast.success('Producto eliminado', {
              duration: 5000,
              action: {
                label: 'Deshacer',
                onClick: async () => {
                  try {
                    await getFirebase().firestore().collection('invProducts').doc(id).set(scrubUndefined({ ...productData, updatedAt: getFirebase().firestore.FieldValue.serverTimestamp() }));
                    toast.success('Producto restaurado');
                  } catch (err) { console.error('[Archii] undo deleteInvProduct:', err); toast.error('Error al restaurar'); }
                },
              },
            });
          } else {
            showToast('Producto eliminado');
          }
        } catch (err) { console.error('[Archii]', err); showToast('Error al eliminar', 'error'); }
      },
    });
  };

  const openEditInvProduct = (p: InvProduct) => {
    setEditingId(p.id);
    const ws = buildWarehouseStock(p);
    const f: Record<string, any> = { invProdName: p.data.name, invProdSku: p.data.sku || '', invProdCat: p.data.categoryId || '', invProdUnit: p.data.unit || 'Unidad', invProdPrice: String(p.data.price || ''), invProdMinStock: String(p.data.minStock || '5'), invProdDesc: p.data.description || '', invProdImage: p.data.imageData || '', invProdWarehouse: p.data.warehouse || 'Almacén Principal' };
    INV_WAREHOUSES.forEach(w => { f[`invProdWS_${w.replace(/\s/g, '_')}`] = String(ws[w] || 0); });
    setForms(prev => ({ ...prev, ...f }));
    openModal('invProduct');
  };

  const saveInvCategory = async () => {
    const name = forms.invCatName || '';
    if (!name) { showToast('El nombre es obligatorio', 'error'); return; }
    try {
      const db = getFirebase().firestore();
      const ts = getFirebase().firestore.FieldValue.serverTimestamp();
      const data = scrubUndefined({ name, color: forms.invCatColor || CAT_COLORS[invCategories.length % CAT_COLORS.length], description: forms.invCatDesc || '', tenantId: activeTenantId || '', createdAt: ts });
      if (editingId) { await db.collection('invCategories').doc(editingId).update(data); showToast('Categoría actualizada'); }
      else { await db.collection('invCategories').add(data); showToast('Categoría creada'); }
      closeModal('invCategory'); setEditingId(null); setForms(p => ({ ...p, invCatName: '', invCatColor: '', invCatDesc: '' }));
    } catch (err) { console.error('[Archii] saveInvCategory error:', err); showToast('Error al guardar', 'error'); }
  };

  const deleteInvCategory = async (id: string) => {
    const category = invCategories.find(c => c.id === id);
    const categoryData = category ? { ...category.data } : null;
    setPendingDeleteAction({
      open: true,
      title: 'Eliminar categoría',
      description: '¿Estás seguro de que deseas eliminar esta categoría?',
      onConfirm: async () => {
        setPendingDeleteAction(null);
        try {
          await getFirebase().firestore().collection('invCategories').doc(id).delete();
          if (categoryData) {
            toast.success('Categoría eliminada', {
              duration: 5000,
              action: {
                label: 'Deshacer',
                onClick: async () => {
                  try {
                    await getFirebase().firestore().collection('invCategories').doc(id).set(scrubUndefined({ ...categoryData, updatedAt: getFirebase().firestore.FieldValue.serverTimestamp() }));
                    toast.success('Categoría restaurada');
                  } catch (err) { console.error('[Archii] undo deleteInvCategory:', err); toast.error('Error al restaurar'); }
                },
              },
            });
          } else {
            showToast('Categoría eliminada');
          }
        } catch (err) { console.error('[Archii]', err); showToast('Error al eliminar', 'error'); }
      },
    });
  };
  const openEditInvCategory = (c: InvCategory) => { setEditingId(c.id); setForms(f => ({ ...f, invCatName: c.data.name, invCatColor: c.data.color || '', invCatDesc: c.data.description || '' })); openModal('invCategory'); };

  const saveInvMovement = async () => {
    const productId = forms.invMovProduct || '';
    const qty = Number(forms.invMovQty) || 0;
    const warehouse = forms.invMovWarehouse || 'Almacén Principal';
    if (!productId || qty <= 0) { showToast('Selecciona producto, almacén y cantidad', 'error'); return; }
    if (!authUser) { showToast('Error: no hay sesión activa', 'error'); return; }
    try {
      const db = getFirebase().firestore();
      const ts = getFirebase().firestore.FieldValue.serverTimestamp();
      const type = forms.invMovType || 'Entrada';
      // Use transaction to prevent race condition on stock update
      const productDocRef = db.collection('invProducts').doc(productId);
      await db.runTransaction(async (transaction: any) => {
        const productDoc = await transaction.get(productDocRef);
        if (!productDoc.exists) throw new Error('Producto no encontrado');
        const ws = buildWarehouseStock({ id: productId, data: productDoc.data() });
        ws[warehouse] = type === 'Entrada' ? (ws[warehouse] || 0) + qty : Math.max(0, (ws[warehouse] || 0) - qty);
        const newTotal = Object.values(ws).reduce((s: number, v: any) => s + (Number(v) || 0), 0);
        transaction.update(productDocRef, { stock: newTotal, warehouseStock: ws, updatedAt: ts });
      });
      // Record the movement after successful stock update
      await db.collection('invMovements').add(scrubUndefined({ productId, type, quantity: qty, warehouse, reason: forms.invMovReason || '', reference: forms.invMovRef || '', date: forms.invMovDate || new Date().toISOString().split('T')[0], tenantId: activeTenantId || '', createdAt: ts, createdBy: authUser.uid }));
      showToast(`${type === 'Entrada' ? 'Entrada' : 'Salida'} registrada en ${warehouse}: ${qty} uds`);
      closeModal('invMovement'); setForms(p => ({ ...p, invMovProduct: '', invMovType: 'Entrada', invMovWarehouse: 'Almacén Principal', invMovQty: '', invMovReason: '', invMovRef: '', invMovDate: '' }));
    } catch (err: any) { showToast(err.message || 'Error al registrar movimiento', 'error'); }
  };

  const deleteInvMovement = async (id: string) => {
    const movement = invMovements.find(m => m.id === id);
    const movementData = movement ? { ...movement.data } : null;
    setPendingDeleteAction({
      open: true,
      title: 'Eliminar movimiento',
      description: '¿Estás seguro de que deseas eliminar este movimiento de inventario?',
      onConfirm: async () => {
        setPendingDeleteAction(null);
        try {
          await getFirebase().firestore().collection('invMovements').doc(id).delete();
          if (movementData) {
            toast.success('Movimiento eliminado', {
              duration: 5000,
              action: {
                label: 'Deshacer',
                onClick: async () => {
                  try {
                    await getFirebase().firestore().collection('invMovements').doc(id).set(scrubUndefined({ ...movementData, updatedAt: getFirebase().firestore.FieldValue.serverTimestamp() }));
                    toast.success('Movimiento restaurado');
                  } catch (err) { console.error('[Archii] undo deleteInvMovement:', err); toast.error('Error al restaurar'); }
                },
              },
            });
          } else {
            showToast('Movimiento eliminado');
          }
        } catch (err) { console.error('[Archii]', err); showToast('Error al eliminar', 'error'); }
      },
    });
  };

  const saveInvTransfer = async () => {
    const productId = forms.invTrProduct || '';
    const qty = Number(forms.invTrQty) || 0;
    const from = forms.invTrFrom || '';
    const to = forms.invTrTo || '';
    if (!productId || !from || !to || from === to || qty <= 0) { showToast('Completa todos los campos y asegúrate que los almacenes sean diferentes', 'error'); return; }
    if (!authUser) { showToast('Error: no hay sesión activa', 'error'); return; }
    try {
      const db = getFirebase().firestore();
      const ts = getFirebase().firestore.FieldValue.serverTimestamp();
      // Use transaction to prevent race condition on stock update
      const productDocRef = db.collection('invProducts').doc(productId);
      await db.runTransaction(async (transaction: any) => {
        const productDoc = await transaction.get(productDocRef);
        if (!productDoc.exists) throw new Error('Producto no encontrado');
        const ws = buildWarehouseStock({ id: productId, data: productDoc.data() });
        const fromStock = ws[from] || 0;
        if (qty > fromStock) throw new Error(`Stock insuficiente en ${from}. Disponible: ${fromStock}`);
        ws[from] = Math.max(0, fromStock - qty);
        ws[to] = (ws[to] || 0) + qty;
        const newTotal = Object.values(ws).reduce((s: number, v: any) => s + (Number(v) || 0), 0);
        transaction.update(productDocRef, { stock: newTotal, warehouseStock: ws, updatedAt: ts });
      });
      // Save transfer record after successful stock update
      const product = invProducts.find(p => p.id === productId);
      await db.collection('invTransfers').add(scrubUndefined({
        productId, productName: product?.data.name || '', fromWarehouse: from, toWarehouse: to, quantity: qty,
        status: 'Completada', date: forms.invTrDate || new Date().toISOString().split('T')[0],
        notes: forms.invTrNotes || '', tenantId: activeTenantId || '', createdAt: ts, createdBy: authUser.uid, completedAt: ts
      }));
      showToast(`Transferencia completada: ${qty} uds de ${from} → ${to}`);
      closeModal('invTransfer'); setForms(p => ({ ...p, invTrProduct: '', invTrFrom: '', invTrTo: '', invTrQty: '', invTrDate: '', invTrNotes: '' }));
    } catch (err: any) { showToast(err.message || 'Error en transferencia', 'error'); }
  };

  const deleteInvTransfer = async (id: string) => {
    const transfer = invTransfers.find(t => t.id === id);
    const transferData = transfer ? { ...transfer.data } : null;
    setPendingDeleteAction({
      open: true,
      title: 'Eliminar transferencia',
      description: '¿Estás seguro de que deseas eliminar este registro de transferencia?',
      onConfirm: async () => {
        setPendingDeleteAction(null);
        try {
          await getFirebase().firestore().collection('invTransfers').doc(id).delete();
          if (transferData) {
            toast.success('Transferencia eliminada', {
              duration: 5000,
              action: {
                label: 'Deshacer',
                onClick: async () => {
                  try {
                    await getFirebase().firestore().collection('invTransfers').doc(id).set(scrubUndefined({ ...transferData, updatedAt: getFirebase().firestore.FieldValue.serverTimestamp() }));
                    toast.success('Transferencia restaurada');
                  } catch (err) { console.error('[Archii] undo deleteInvTransfer:', err); toast.error('Error al restaurar'); }
                },
              },
            });
          } else {
            showToast('Transferencia eliminada');
          }
        } catch (err) { console.error('[Archii]', err); showToast('Error al eliminar', 'error'); }
      },
    });
  };

  const getInvCategoryName = (catId: string) => { const c = invCategories.find(x => x.id === catId); return c ? c.data.name : 'Sin categoría'; };
  const getInvCategoryColor = (catId: string) => { const c = invCategories.find(x => x.id === catId); return c ? c.data.color : '#6b7280'; };
  const getInvProductName = (prodId: string) => { const p = invProducts.find(x => x.id === prodId); return p ? p.data.name : 'Desconocido'; };

  const handleInvProductImageSelect = async (e: any) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Solo imágenes', 'error'); return; }
    if (file.size > 3 * 1024 * 1024) { showToast('Máx 3 MB', 'error'); return; }
    try {
      const base64 = await fileToBase64(file);
      setForms(p => ({ ...p, invProdImage: base64 }));
    } catch { showToast('Error al procesar', 'error'); }
  };

  // ===== DERIVED VALUES =====
  const invTotalValue = invProducts.reduce((s, p) => s + (Number(p.data.price) || 0) * getTotalStock(p), 0);
  const invLowStock = invProducts.filter(p => getTotalStock(p) <= (Number(p.data.minStock) || 0));
  const invTotalStock = invProducts.reduce((s, p) => s + getTotalStock(p), 0);
  const invPendingTransfers = invTransfers.filter(t => t.data.status === 'Pendiente' || t.data.status === 'En tránsito').length;
  const invAlerts = [
    ...(invLowStock.map(p => ({ type: 'low_stock' as const, msg: `${p.data.name}: stock ${getTotalStock(p)} (mín: ${p.data.minStock})`, severity: 'high' as const }))),
    ...(invTransfers.filter(t => t.data.status === 'Pendiente').map(t => ({ type: 'pending_transfer' as const, msg: `Transferencia pendiente: ${t.data.quantity} uds de ${t.data.fromWarehouse} → ${t.data.toWarehouse}`, severity: 'medium' as const }))),
    ...(invProducts.filter(p => getTotalStock(p) === 0).map(p => ({ type: 'out_of_stock' as const, msg: `${p.data.name}: AGOTADO`, severity: 'critical' as const }))),
  ];

  // ===== CONTEXT VALUE =====
  const value: InventoryContextValue = {
    invProducts, invCategories, invMovements, invTransfers,
    invTab, setInvTab, invFilterCat, setInvFilterCat, invSearch, setInvSearch,
    invMovFilterType, setInvMovFilterType, invTransferFilterStatus, setInvTransferFilterStatus,
    invWarehouseFilter, setInvWarehouseFilter,
    getWarehouseStock, getTotalStock, buildWarehouseStock,
    saveInvProduct, deleteInvProduct, openEditInvProduct,
    saveInvCategory, deleteInvCategory, openEditInvCategory,
    saveInvMovement, deleteInvMovement,
    saveInvTransfer, deleteInvTransfer,
    getInvCategoryName, getInvCategoryColor, getInvProductName,
    handleInvProductImageSelect,
    invTotalValue, invLowStock, invTotalStock, invPendingTransfers, invAlerts,
  };

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
}

/* ===== HOOK ===== */
export function useInventoryContext() {
  const ctx = useContext(InventoryContext);
  if (!ctx) throw new Error('useInventoryContext must be used within an InventoryProvider');
  return ctx;
}
