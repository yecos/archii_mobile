'use client';
import React from 'react';
import { useApp } from '@/contexts/AppContext';
import { useInventoryContext } from '@/hooks/useInventory';
import { Package } from 'lucide-react';
import { SkeletonKPI, SkeletonTableRow } from '@/components/ui/SkeletonLoaders';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import InventoryDashboard from '@/components/inventory/InventoryDashboard';
import InventoryProducts from '@/components/inventory/InventoryProducts';
import InventoryCategories from '@/components/inventory/InventoryCategories';
import InventoryWarehouse from '@/components/inventory/InventoryWarehouse';
import InventoryMovements from '@/components/inventory/InventoryMovements';
import InventoryTransfers from '@/components/inventory/InventoryTransfers';
import InventoryReports from '@/components/inventory/InventoryReports';

export default function InventoryScreen() {
  const { openModal, setEditingId, setForms, showToast } = useApp();
  const {
    deleteInvCategory, deleteInvMovement, deleteInvProduct, deleteInvTransfer, getInvCategoryColor,
    getInvCategoryName, getInvProductName, getTotalStock, getWarehouseStock, invAlerts,
    invCategories, invFilterCat, invMovFilterType, invMovements, invPendingTransfers,
    invProducts, invSearch, invTab, invTotalStock, invTotalValue,
    invTransferFilterStatus, invTransfers, invWarehouseFilter, openEditInvCategory, openEditInvProduct,
    setInvFilterCat, setInvMovFilterType, setInvSearch, setInvTab, setInvTransferFilterStatus,
    setInvWarehouseFilter,
  } = useInventoryContext();

  const confirmDialog = useConfirmDialog();
  const confirm = confirmDialog.confirm;

  return (
<div className="animate-fadeIn space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Package size={20} className="text-[var(--af-accent)]" aria-hidden="true"/>
            Inventario
          </h2>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{invProducts.length} productos · {invCategories.length} categorías</p>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-[var(--af-bg3)] rounded-lg p-1 overflow-x-auto scrollbar-none">
              {[{ id: 'dashboard' as const, label: '📊 Panel' }, { id: 'products' as const, label: '📦 Productos' }, { id: 'categories' as const, label: '🏷️ Categorías' }, { id: 'warehouse' as const, label: '🏢 Almacén' }, { id: 'movements' as const, label: '📋 Movimientos' }, { id: 'transfers' as const, label: '🔄 Transferencias' }, { id: 'reports' as const, label: '📊 Reportes' }].map(tab => (
                <button key={tab.id} className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer transition-all flex items-center gap-1 ${invTab === tab.id ? 'bg-[var(--af-accent)] text-background' : 'bg-[var(--af-bg3)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`} onClick={() => setInvTab(tab.id)}>
                  {tab.label}
                  {tab.id === 'dashboard' && invAlerts.length > 0 && <span className="w-4 h-4 rounded-full bg-red-500 text-[9px] text-white flex items-center justify-center">{invAlerts.length}</span>}
                  {tab.id === 'transfers' && invPendingTransfers > 0 && <span className="w-4 h-4 rounded-full bg-amber-500 text-[9px] text-white flex items-center justify-center">{invPendingTransfers}</span>}
                </button>
              ))}
            </div>

            {/* Loading skeleton */}
            {!invProducts.length && !invCategories.length && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {Array.from({ length: 4 }).map((_, i) => <SkeletonKPI key={i} />)}
                </div>
                <SkeletonTableRow cols={5} />
              </div>
            )}

            {/* ===== Dashboard Tab ===== */}
            {invTab === 'dashboard' && <InventoryDashboard
              invProducts={invProducts}
              invTotalValue={invTotalValue}
              invTotalStock={invTotalStock}
              invAlerts={invAlerts}
              invMovements={invMovements}
              invCategories={invCategories}
              getWarehouseStock={getWarehouseStock}
              getTotalStock={getTotalStock}
              getInvProductName={getInvProductName}
            />}

            {/* ===== Products Tab ===== */}
            {invTab === 'products' && <InventoryProducts
              invProducts={invProducts}
              invCategories={invCategories}
              invSearch={invSearch}
              invFilterCat={invFilterCat}
              getInvCategoryColor={getInvCategoryColor}
              getInvCategoryName={getInvCategoryName}
              getTotalStock={getTotalStock}
              getWarehouseStock={getWarehouseStock}
              deleteInvProduct={deleteInvProduct}
              openEditInvProduct={openEditInvProduct}
              confirm={confirm}
              setEditingId={setEditingId}
              setForms={setForms}
              setInvSearch={setInvSearch}
              setInvFilterCat={setInvFilterCat}
              openModal={openModal}
            />}

            {/* ===== Categories Tab ===== */}
            {invTab === 'categories' && <InventoryCategories
              invCategories={invCategories}
              invProducts={invProducts}
              openEditInvCategory={openEditInvCategory}
              deleteInvCategory={deleteInvCategory}
              confirm={confirm}
              setEditingId={setEditingId}
              setForms={setForms}
              openModal={openModal}
            />}

            {/* ===== Warehouse Tab ===== */}
            {invTab === 'warehouse' && <InventoryWarehouse
              invProducts={invProducts}
              invWarehouseFilter={invWarehouseFilter}
              getWarehouseStock={getWarehouseStock}
              getInvCategoryColor={getInvCategoryColor}
              setInvWarehouseFilter={setInvWarehouseFilter}
              setEditingId={setEditingId}
              setForms={setForms}
              openModal={openModal}
            />}

            {/* ===== Movements Tab ===== */}
            {invTab === 'movements' && <InventoryMovements
              invMovements={invMovements}
              invMovFilterType={invMovFilterType}
              invWarehouseFilter={invWarehouseFilter}
              getInvProductName={getInvProductName}
              deleteInvMovement={deleteInvMovement}
              confirm={confirm}
              setEditingId={setEditingId}
              setForms={setForms}
              openModal={openModal}
              setInvMovFilterType={setInvMovFilterType}
              setInvWarehouseFilter={setInvWarehouseFilter}
            />}

            {/* ===== Transfers Tab ===== */}
            {invTab === 'transfers' && <InventoryTransfers
              invTransfers={invTransfers}
              invTransferFilterStatus={invTransferFilterStatus}
              getInvProductName={getInvProductName}
              deleteInvTransfer={deleteInvTransfer}
              confirm={confirm}
              setEditingId={setEditingId}
              setForms={setForms}
              openModal={openModal}
              setInvTransferFilterStatus={setInvTransferFilterStatus}
            />}

            {/* ===== Reports Tab ===== */}
            {invTab === 'reports' && <InventoryReports
              invProducts={invProducts}
              invCategories={invCategories}
              invMovements={invMovements}
              invTransfers={invTransfers}
              invTotalValue={invTotalValue}
              invTotalStock={invTotalStock}
              getInvCategoryName={getInvCategoryName}
              getInvCategoryColor={getInvCategoryColor}
              getInvProductName={getInvProductName}
              getTotalStock={getTotalStock}
              getWarehouseStock={getWarehouseStock}
              showToast={showToast}
            />}
          <ConfirmDialog {...confirmDialog} />
          </div>
  );
}
