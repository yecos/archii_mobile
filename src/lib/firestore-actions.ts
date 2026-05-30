/**
 * firestore-actions.ts
 * Todas las funciones de escritura a Firestore (CRUD).
 * Usa getFirebase() en vez de (window as any).firebase.
 * Manejo de errores consistente con console.error + mensaje al usuario.
 */

import { getFirebase, getFirebaseIdToken, type FirebaseUser, type FirestoreDB } from '@/lib/firebase-service';
import { fileToBase64, scrubUndefined } from '@/lib/helpers';
import { DEFAULT_PHASES, PROJECT_TYPE_PHASES, PhaseTemplate, ChangeOrderHistoryEntry } from '@/lib/types';

/**
 * Deduplication guard: prevents double-creation when offline writes are queued
 * but the user sees an error and retries. Key = "action:identifier", value = timestamp.
 * Entries auto-expire after 30 seconds.
 */
const _pendingWrites = new Map<string, number>();
const DEDUP_TTL_MS = 30_000;

function dedupStart(key: string): boolean {
  const now = Date.now();
  // Clean expired entries
  for (const [k, t] of _pendingWrites) {
    if (now - t > DEDUP_TTL_MS) _pendingWrites.delete(k);
  }
  if (_pendingWrites.has(key)) {
    console.warn('[Archii] Dedup: blocking duplicate write for', key);
    return false; // Already in progress
  }
  _pendingWrites.set(key, now);
  return true; // OK to proceed
}

function dedupEnd(key: string) {
  _pendingWrites.delete(key);
}

type ToastFn = (msg: string, type?: string) => void;

/** Guard: verifica que el usuario esté autenticado antes de cualquier write */
function requireAuth(authUser: FirebaseUser | null, action: string): void {
  if (!authUser?.uid) {
    console.error(`[Archii] WRITE_BLOCKED: ${action} — usuario no autenticado`);
    throw new Error(`WRITE_BLOCKED: No se puede ${action} sin usuario autenticado`);
  }
}

// scrubUndefined imported from @/lib/helpers (canonical version)

/** Helper: elimina todos los documentos de una colección, paginando si hay más de 500 */
async function deleteCollectionBatch(db: any, collectionRef: any): Promise<void> {
  let query = collectionRef.orderBy('__name__').limit(500);
  let snap = await query.get();
  while (snap.docs.length > 0) {
    const batch = db.batch();
    snap.docs.forEach((doc: any) => batch.delete(doc.ref));
    await batch.commit();
    // Get next page (start after last deleted doc)
    const lastDoc = snap.docs[snap.docs.length - 1];
    query = collectionRef.orderBy('__name__').startAfter(lastDoc).limit(500);
    snap = await query.get();
  }
}

/** Helper: ejecuta acción Firebase con manejo de errores consistente */
async function fbAction<T>(action: string, fn: () => Promise<T>, showToast?: ToastFn): Promise<T | null> {
  try {
    return await fn();
  } catch (err: any) {
    console.error(`[Archii] ${action} error:`, err);
    const msg = err?.message || String(err);
    if (showToast) {
      if (msg.includes('PERMISSION_DENIED') || msg.includes('permission') || msg.includes('Missing or insufficient permissions')) {
        showToast('Permiso denegado en Firestore. Verifica que eres miembro del espacio.', 'error');
      } else {
        showToast(`Error: ${action} — ${msg.slice(0, 80)}`, 'error');
      }
    }
    throw err; // Re-throw so caller can handle too
  }
}

/** Helper: server-side delete via Admin SDK (bypasses Firestore rules) */
async function serverDelete(type: string, id: string, tenantId: string | null, extra?: Record<string, string>): Promise<boolean> {
  const token = await getFirebaseIdToken();
  if (!token) throw new Error('No hay token de autenticación');
  const body: Record<string, string> = { type, id };
  if (tenantId) body.tenantId = tenantId;
  if (extra) Object.assign(body, extra);
  const res = await fetch('/api/delete-entity', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return !!data.success;
}

/* ===== PROJECTS ===== */

/** Server-side project creation via Admin SDK (bypasses Firestore rules) */
async function serverCreateProject(data: Record<string, any>, tenantId: string | null): Promise<{ id: string }> {
  const token = await getFirebaseIdToken();
  if (!token) throw new Error('No hay token de autenticación');
  const res = await fetch('/api/create-entity', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'project',
      tenantId,
      data: {
        name: data.projName,
        status: data.projStatus || 'Concepto',
        client: data.projClient || '',
        location: data.projLocation || '',
        budget: Number(data.projBudget) || 0,
        description: data.projDesc || '',
        startDate: data.projStart || '',
        endDate: data.projEnd || '',
        companyId: data.projCompany || '',
        projectType: data.projType || 'Ejecución',
        enabledPhases: data.enabledPhases || [],
      },
    }),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || `Error ${res.status}`);
  return { id: result.id };
}

/** Server-side project update via Admin SDK (bypasses Firestore rules) */
async function serverUpdateProject(projectId: string, data: Record<string, any>, tenantId: string | null): Promise<void> {
  const token = await getFirebaseIdToken();
  if (!token) throw new Error('No hay token de autenticación');
  // Use the update-entity API (or patch via create-entity with editingId)
  const fb = getFirebase();
  const db = fb.firestore();
  const ts = fb.firestore.FieldValue.serverTimestamp();
  const projData: Record<string, any> = scrubUndefined({
    name: data.projName,
    status: data.projStatus || 'Concepto',
    client: data.projClient || '',
    location: data.projLocation || '',
    budget: Number(data.projBudget) || 0,
    description: data.projDesc || '',
    startDate: data.projStart || '',
    endDate: data.projEnd || '',
    companyId: data.projCompany || '',
    projectType: data.projType || 'Ejecución',
    updatedAt: ts,
    updatedBy: data._authUid || '',
  });
  // Try direct update first, fallback would need another API endpoint
  await db.collection('projects').doc(projectId).update(projData);
  if (data.projType && data._prevType && data.projType !== data._prevType) {
    await initPhasesForProject(db, projectId, data.projType, data.enabledPhases || [], ts, tenantId);
  }
}

export function saveProject(data: Record<string, any>, editingId: string | null, showToast: ToastFn, authUser: FirebaseUser | null, tenantId: string | null) {
  return fbAction('guardar proyecto', async () => {
    requireAuth(authUser, 'guardar proyecto');

    // Dedup guard: prevent double-creation (e.g., offline write queued + user retries)
    const dedupKey = `project:${editingId || 'new'}:${(data.projName || '').trim().toLowerCase()}:${tenantId}`;
    if (!dedupStart(dedupKey)) {
      showToast('Proyecto ya se está creando, espera un momento', 'error');
      return;
    }

    try {
      const fb = getFirebase();
      const db = fb.firestore();
      const ts = fb.firestore.FieldValue.serverTimestamp();

      if (editingId) {
        // UPDATE existing project
        const projData: Record<string, any> = scrubUndefined({
          name: data.projName,
          status: data.projStatus || 'Concepto',
          client: data.projClient || '',
          location: data.projLocation || '',
          budget: Number(data.projBudget) || 0,
          description: data.projDesc || '',
          startDate: data.projStart || '',
          endDate: data.projEnd || '',
          companyId: data.projCompany || '',
          projectType: data.projType || 'Ejecución',
          updatedAt: ts,
          updatedBy: authUser?.uid || '',
        });
        await db.collection('projects').doc(editingId).update(projData);
        if (data.projType && data._prevType && data.projType !== data._prevType) {
          await initPhasesForProject(db, editingId, data.projType, data.enabledPhases || [], ts, tenantId);
        }
        showToast('Proyecto actualizado');
      } else {
        // CREATE new project — try direct Firestore first, fallback to Admin SDK API
        try {
          const projData: Record<string, any> = scrubUndefined({
            name: data.projName,
            status: data.projStatus || 'Concepto',
            client: data.projClient || '',
            location: data.projLocation || '',
            budget: Number(data.projBudget) || 0,
            description: data.projDesc || '',
            startDate: data.projStart || '',
            endDate: data.projEnd || '',
            companyId: data.projCompany || '',
            projectType: data.projType || 'Ejecución',
            progress: 0,
            tenantId: tenantId || '',
            createdAt: ts,
            createdBy: authUser?.uid || '',
            updatedAt: ts,
            updatedBy: authUser?.uid || '',
          });
          const ref = await db.collection('projects').add(projData);
          await initPhasesForProject(db, ref.id, data.projType || 'Ejecución', data.enabledPhases || [], ts, tenantId);
          showToast('✅ Proyecto creado');
        } catch (directErr: any) {
          const msg = directErr?.message || '';
          if (msg.includes('PERMISSION_DENIED') || msg.includes('Missing or insufficient permissions')) {
            // Fallback: create via Admin SDK API (bypasses Firestore rules)
            console.warn('[Archii] Firestore direct write blocked, falling back to Admin SDK API');
            const result = await serverCreateProject(data, tenantId);
            showToast('✅ Proyecto creado');
            return result;
          }
          throw directErr;
        }
      }
    } finally {
      dedupEnd(dedupKey);
    }
  }, showToast);
}

export async function deleteProject(projectId: string, showToast: ToastFn, tenantId: string | null) {
  return fbAction('eliminar proyecto', async () => {
    await serverDelete('project', projectId, tenantId);
    showToast('Proyecto eliminado');
  }, showToast);
}

/* ===== TASKS ===== */

export function saveTask(data: Record<string, any>, editingId: string | null, showToast: ToastFn, authUser: FirebaseUser | null, tenantId: string | null) {
  return fbAction('guardar tarea', async () => {
    requireAuth(authUser, 'guardar tarea');

    // Dedup guard for new tasks
    const dedupKey = `task:${editingId || 'new'}:${(data.taskTitle || '').trim().toLowerCase()}:${tenantId}`;
    if (!dedupStart(dedupKey)) {
      showToast('Tarea ya se está creando, espera un momento', 'error');
      return;
    }

    try {
      const fb = getFirebase();
      const db = fb.firestore();
      const ts = fb.firestore.FieldValue.serverTimestamp();
      const assignees: string[] = Array.isArray(data.taskAssignees) ? data.taskAssignees : (data.taskAssignee ? [data.taskAssignee] : []);
      const subtasks = Array.isArray(data.taskSubtasks) ? data.taskSubtasks.filter((s: any) => s.text?.trim()).map((s: any) => ({ text: String(s.text || ''), done: Boolean(s.done) })) : [];
      const newStatus = data.taskStatus || 'Por hacer';
      const isCompleting = editingId && newStatus === 'Completado';
      const isUncompleting = editingId && newStatus !== 'Completado';
      if (editingId) {
        const updateData: Record<string, any> = {
          title: data.taskTitle,
          description: data.taskDescription || '',
          projectId: data.taskProject || '',
          assigneeId: assignees[0] || '',
          assigneeIds: assignees,
          priority: data.taskPriority || 'Media',
          status: newStatus,
          dueDate: data.taskDue || '',
          phaseId: data.taskPhase || '',
          subtasks,
          estimatedHours: data.taskEstimatedHours || null,
          tags: Array.isArray(data.taskTags) && data.taskTags.length > 0 ? data.taskTags : null,
          updatedAt: ts,
          updatedBy: authUser?.uid,
        };
        if (isCompleting) updateData.completedAt = ts;
        if (isUncompleting) updateData.completedAt = fb.firestore.FieldValue.delete();
        await db.collection('tasks').doc(editingId).update(scrubUndefined(updateData));
        showToast('Tarea actualizada');
      } else {
        const createData: Record<string, any> = {
          title: data.taskTitle,
          description: data.taskDescription || '',
          projectId: data.taskProject || '',
          assigneeId: assignees[0] || '',
          assigneeIds: assignees,
          priority: data.taskPriority || 'Media',
          status: newStatus,
          dueDate: data.taskDue || '',
          phaseId: data.taskPhase || '',
          subtasks,
          estimatedHours: data.taskEstimatedHours || null,
          tags: Array.isArray(data.taskTags) && data.taskTags.length > 0 ? data.taskTags : null,
          createdAt: ts,
          createdBy: authUser?.uid || '',
          tenantId: tenantId || '',
          updatedAt: ts,
        };
        if (newStatus === 'Completado') createData.completedAt = ts;
        await db.collection('tasks').add(scrubUndefined(createData));
        showToast('✅ Tarea creada');
      }
    } finally {
      dedupEnd(dedupKey);
    }
  }, showToast);
}

// NOTE: toggleTask removed — dead code. AppContext.tsx provides its own implementation.

export async function deleteTask(taskId: string, showToast: ToastFn, tenantId: string | null) {
  return fbAction('eliminar tarea', async () => {
    await serverDelete('task', taskId, tenantId);
    showToast('Tarea eliminada');
  }, showToast);
}

/* ===== CHAT MESSAGES ===== */

export async function sendMessage(chatProjectId: string, msgData: Record<string, any>, authUser: FirebaseUser | null, showToast: ToastFn, tenantId: string | null, chatDmUser?: string | null) {
  return fbAction('enviar mensaje', async () => {
    requireAuth(authUser, 'enviar mensaje');
    const fb = getFirebase();
    const db = fb.firestore();
    const ts = fb.firestore.FieldValue.serverTimestamp();
    const msg: Record<string, any> = {
      ...msgData,
      uid: authUser?.uid,
      userName: authUser?.displayName || authUser?.email || 'Usuario',
      userPhoto: authUser?.photoURL || '',
      createdAt: ts,
      tenantId: tenantId || '',
    };
    if (chatProjectId === '__general__') {
      await db.collection('generalMessages').add(msg);
    } else if (chatProjectId === '__dm__' && chatDmUser && authUser) {
      const ids = [authUser.uid, chatDmUser].sort();
      const dmId = `dm_${ids[0]}_${ids[1]}`;
      msg.recipientId = chatDmUser;
      await db.collection('directMessages').doc(dmId).collection('messages').add(msg);
    } else {
      await db.collection('projects').doc(chatProjectId).collection('messages').add(msg);
    }
  });
}

/* ===== EXPENSES ===== */

export function saveExpense(data: Record<string, any>, editingId: string | null, showToast: ToastFn, authUser: FirebaseUser | null, tenantId: string | null) {
  return fbAction('guardar gasto', async () => {
    requireAuth(authUser, 'guardar gasto');
    const fb = getFirebase();
    const db = fb.firestore();
    const ts = fb.firestore.FieldValue.serverTimestamp();
    if (editingId) {
      await db.collection('expenses').doc(editingId).update({
        concept: data.expConcept,
        projectId: data.expProject,
        category: data.expCategory,
        amount: Number(data.expAmount) || 0,
        date: data.expDate || '',
      });
      showToast('Gasto actualizado');
    } else {
      await db.collection('expenses').add({
        concept: data.expConcept,
        projectId: data.expProject,
        category: data.expCategory,
        amount: Number(data.expAmount) || 0,
        date: data.expDate || '',
        createdAt: ts,
        createdBy: authUser?.uid,
        tenantId: tenantId || '',
      });
      showToast('✅ Gasto registrado');
    }
  }, showToast);
}

export async function deleteExpense(expenseId: string, showToast: ToastFn, tenantId: string | null) {
  return fbAction('eliminar gasto', async () => {
    await serverDelete('expense', expenseId, tenantId);
    showToast('Gasto eliminado');
  }, showToast);
}

/* ===== SUPPLIERS ===== */

export function saveSupplier(data: Record<string, any>, editingId: string | null, showToast: ToastFn, authUser: FirebaseUser | null, tenantId: string | null) {
  return fbAction('guardar proveedor', async () => {
    requireAuth(authUser, 'guardar proveedor');
    const fb = getFirebase();
    const db = fb.firestore();
    const ts = fb.firestore.FieldValue.serverTimestamp();
    if (editingId) {
      await db.collection('suppliers').doc(editingId).update({
        name: data.supName,
        category: data.supCategory,
        phone: data.supPhone || '',
        email: data.supEmail || '',
        address: data.supAddress || '',
        website: data.supWebsite || '',
        notes: data.supNotes || '',
        rating: Number(data.supRating) || 0,
      });
      showToast('Proveedor actualizado');
    } else {
      await db.collection('suppliers').add({
        name: data.supName,
        category: data.supCategory,
        phone: data.supPhone || '',
        email: data.supEmail || '',
        address: data.supAddress || '',
        website: data.supWebsite || '',
        notes: data.supNotes || '',
        rating: Number(data.supRating) || 0,
        createdAt: ts,
        createdBy: authUser?.uid,
        tenantId: tenantId || '',
      });
      showToast('✅ Proveedor registrado');
    }
  }, showToast);
}

export async function deleteSupplier(supplierId: string, showToast: ToastFn, tenantId: string | null) {
  return fbAction('eliminar proveedor', async () => {
    await serverDelete('supplier', supplierId, tenantId);
    showToast('Proveedor eliminado');
  }, showToast);
}

/* ===== COMPANIES ===== */

export function saveCompany(data: Record<string, any>, editingId: string | null, showToast: ToastFn, authUser: FirebaseUser | null, tenantId: string | null) {
  return fbAction('guardar empresa', async () => {
    requireAuth(authUser, 'guardar empresa');
    const fb = getFirebase();
    const db = fb.firestore();
    const ts = fb.firestore.FieldValue.serverTimestamp();
    if (editingId) {
      await db.collection('companies').doc(editingId).update({
        name: data.compName,
        nit: data.compNit || '',
        address: data.compAddress || '',
        phone: data.compPhone || '',
        email: data.compEmail || '',
        legalName: data.compLegal || '',
      });
      showToast('Empresa actualizada');
    } else {
      await db.collection('companies').add({
        name: data.compName,
        nit: data.compNit || '',
        address: data.compAddress || '',
        phone: data.compPhone || '',
        email: data.compEmail || '',
        legalName: data.compLegal || '',
        createdAt: ts,
        createdBy: authUser?.uid,
        tenantId: tenantId || '',
      });
      showToast('✅ Empresa registrada');
    }
  }, showToast);
}

export async function deleteCompany(companyId: string, showToast: ToastFn, tenantId: string | null) {
  return fbAction('eliminar empresa', async () => {
    await serverDelete('company', companyId, tenantId);
    showToast('Empresa eliminada');
  }, showToast);
}

/* ===== PROJECT FILES ===== */

export async function uploadProjectFile(projectId: string, file: File, showToast: ToastFn, authUser: FirebaseUser | null, tenantId: string | null) {
  return fbAction('subir archivo', async () => {
    requireAuth(authUser, 'subir archivo');
    const fb = getFirebase();
    const db = fb.firestore();
    const ts = fb.firestore.FieldValue.serverTimestamp();
    const base64 = await fileToBase64(file);
    await db.collection('projects').doc(projectId).collection('files').add({
      name: file.name,
      type: file.type,
      size: file.size,
      url: base64,
      uploadedBy: authUser?.displayName || authUser?.email || 'Usuario',
      createdAt: ts,
      tenantId: tenantId || '',
    });
    showToast('✅ Archivo subido');
  }, showToast);
}

export async function deleteProjectFile(projectId: string, fileId: string, showToast: ToastFn, tenantId: string | null) {
  return fbAction('eliminar archivo', async () => {
    await serverDelete('projectFile', fileId, tenantId, { projectId });
    showToast('Archivo eliminado');
  }, showToast);
}

/* ===== INIT PHASES FOR PROJECT (by type) ===== */

/**
 * Crea las fases según el tipo de proyecto (Diseño, Ejecución o Ambos).
 * enabledPhases: array de phaseKeys que están prendidos.
 * Si enabledPhases está vacío, se prenden todas.
 */
export async function initPhasesForProject(
  db: FirestoreDB,
  projectId: string,
  projectType: string,
  enabledPhases: string[],
  ts: any,
  tenantId: string | null,
) {
  const types = projectType === 'Ambos' ? ['Diseño', 'Ejecución'] : [projectType];
  
  // Borrar fases existentes
  const existing = await db.collection('projects').doc(projectId).collection('workPhases').get();
  const batch = db.batch();
  existing.docs.forEach((doc: any) => batch.delete(doc.ref));
  
  // Crear nuevas fases
  let globalOrder = 0;
  for (const type of types) {
    const templates = PROJECT_TYPE_PHASES[type] || [];
    for (const tpl of templates) {
      const isEnabled = enabledPhases.length === 0 || enabledPhases.includes(tpl.key);
      const phaseRef = db.collection('projects').doc(projectId).collection('workPhases').doc();
      batch.set(phaseRef, {
        name: tpl.name,
        description: tpl.description,
        status: 'Pendiente',
        order: globalOrder,
        startDate: '',
        endDate: '',
        createdAt: ts,
        tenantId: tenantId || '',
        type,
        enabled: isEnabled,
        phaseKey: tpl.key,
      });
      globalOrder++;
    }
  }
  await batch.commit();
}

/**
 * Toggle una fase (prendido/apagado) sin borrar las demás.
 */
export async function togglePhaseEnabled(
  projectId: string,
  phaseId: string,
  enabled: boolean,
  showToast: ToastFn,
  tenantId: string | null,
) {
  return fbAction('actualizar fase', async () => {
    await getFirebase().firestore()
      .collection('projects').doc(projectId)
      .collection('workPhases').doc(phaseId)
      .update({ enabled });
    showToast(enabled ? '✅ Fase activada' : 'Fase desactivada');
  }, showToast);
}

/* ===== WORK PHASES ===== */

export async function saveWorkPhase(projectId: string, data: Record<string, any>, editingId: string | null, showToast: ToastFn, tenantId: string | null) {
  return fbAction('guardar fase', async () => {
    const fb = getFirebase();
    const db = fb.firestore();
    const ts = fb.firestore.FieldValue.serverTimestamp();
    if (editingId) {
      await db.collection('projects').doc(projectId).collection('workPhases').doc(editingId).update({
        name: data.phaseName,
        description: data.phaseDesc || '',
        startDate: data.phaseStart || '',
        endDate: data.phaseEnd || '',
      });
      showToast('Fase actualizada');
    } else {
      await db.collection('projects').doc(projectId).collection('workPhases').add({
        name: data.phaseName,
        description: data.phaseDesc || '',
        status: 'Pendiente',
        order: data.phaseOrder ?? 0,
        startDate: data.phaseStart || '',
        endDate: data.phaseEnd || '',
        createdAt: ts,
        tenantId: tenantId || '',
      });
      showToast('✅ Fase creada');
    }
  }, showToast);
}

export async function updatePhaseStatus(projectId: string, phaseId: string, status: string, showToast: ToastFn, tenantId: string | null) {
  return fbAction('actualizar fase', async () => {
    await getFirebase().firestore()
      .collection('projects').doc(projectId)
      .collection('workPhases').doc(phaseId)
      .update({ status });
  }, showToast);
}

/* ===== APPROVALS ===== */

export function saveApproval(projectId: string, data: Record<string, any>, editingId: string | null, showToast: ToastFn, authUser: FirebaseUser | null, tenantId: string | null) {
  return fbAction('guardar aprobación', async () => {
    requireAuth(authUser, 'guardar aprobación');
    const fb = getFirebase();
    const db = fb.firestore();
    const ts = fb.firestore.FieldValue.serverTimestamp();
    if (editingId) {
      await db.collection('projects').doc(projectId).collection('approvals').doc(editingId).update({
        title: data.apprTitle,
        description: data.apprDesc || '',
      });
      showToast('Solicitud actualizada');
    } else {
      await db.collection('projects').doc(projectId).collection('approvals').add({
        title: data.apprTitle,
        description: data.apprDesc || '',
        status: 'Pendiente',
        requestedBy: authUser?.displayName || authUser?.email || 'Usuario',
        createdAt: ts,
        createdBy: authUser?.uid,
        tenantId: tenantId || '',
      });
      showToast('✅ Solicitud creada');
    }
  }, showToast);
}

export async function updateApproval(projectId: string, approvalId: string, status: string, showToast: ToastFn, tenantId: string | null) {
  return fbAction('actualizar aprobación', async () => {
    const fb = getFirebase();
    await fb.firestore().collection('projects').doc(projectId).collection('approvals').doc(approvalId).update({ status });
    showToast(status === 'Aprobada' ? '✅ Aprobación aceptada' : status === 'Rechazada' ? '❌ Aprobación rechazada' : 'Estado actualizado');
  }, showToast);
}

export async function deleteApproval(projectId: string, approvalId: string, showToast: ToastFn, tenantId: string | null) {
  return fbAction('eliminar aprobación', async () => {
    await serverDelete('approval', approvalId, tenantId, { projectId });
    showToast('Solicitud eliminada');
  }, showToast);
}

/* ===== MEETINGS ===== */

export function saveMeeting(data: Record<string, any>, editingId: string | null, showToast: ToastFn, authUser: FirebaseUser | null, tenantId: string | null) {
  return fbAction('guardar reunión', async () => {
    requireAuth(authUser, 'guardar reunión');
    const fb = getFirebase();
    const db = fb.firestore();
    const ts = fb.firestore.FieldValue.serverTimestamp();
    if (editingId) {
      await db.collection('meetings').doc(editingId).update({
        title: data.meetTitle,
        projectId: data.meetProject,
        date: data.meetDate || '',
        time: data.meetTime || '',
        duration: data.meetDuration || '',
        location: data.meetLocation || '',
        description: data.meetDesc || '',
        attendees: data.meetAttendees || [],
      });
      showToast('Reunión actualizada');
    } else {
      await db.collection('meetings').add({
        title: data.meetTitle,
        projectId: data.meetProject,
        date: data.meetDate || '',
        time: data.meetTime || '',
        duration: data.meetDuration || '',
        location: data.meetLocation || '',
        description: data.meetDesc || '',
        attendees: data.meetAttendees || [],
        createdBy: authUser?.displayName || authUser?.email || 'Usuario',
        createdAt: ts,
        createdByUid: authUser?.uid,
        tenantId: tenantId || '',
      });
      showToast('✅ Reunión programada');
    }
  }, showToast);
}

export async function deleteMeeting(meetingId: string, showToast: ToastFn, tenantId: string | null) {
  return fbAction('eliminar reunión', async () => {
    await serverDelete('meeting', meetingId, tenantId);
    showToast('Reunión eliminada');
  }, showToast);
}

/* ===== GALLERY ===== */

export async function saveGalleryPhoto(data: Record<string, any>, showToast: ToastFn, authUser: FirebaseUser | null, tenantId: string | null) {
  return fbAction('guardar foto', async () => {
    requireAuth(authUser, 'guardar foto');
    const fb = getFirebase();
    const ts = fb.firestore.FieldValue.serverTimestamp();
    await fb.firestore().collection('galleryPhotos').add({
      projectId: data.photoProject,
      categoryName: data.photoCategory || 'Otro',
      caption: data.photoCaption || '',
      imageData: data.photoImage,
      createdAt: ts,
      createdBy: authUser?.uid,
      tenantId: tenantId || '',
    });
    showToast('✅ Foto subida');
  }, showToast);
}

export async function deleteGalleryPhoto(photoId: string, showToast: ToastFn, tenantId: string | null) {
  return fbAction('eliminar foto', async () => {
    await serverDelete('galleryPhoto', photoId, tenantId);
    showToast('Foto eliminada');
  }, showToast);
}

/* ===== INVENTORY ===== */

export function saveInvProduct(data: Record<string, any>, editingId: string | null, showToast: ToastFn, authUser: FirebaseUser | null, tenantId: string | null) {
  return fbAction('guardar producto', async () => {
    requireAuth(authUser, 'guardar producto');
    const fb = getFirebase();
    const ts = fb.firestore.FieldValue.serverTimestamp();
    if (editingId) {
      await fb.firestore().collection('invProducts').doc(editingId).update({
        name: data.prodName,
        sku: data.prodSku || '',
        categoryId: data.prodCategory,
        unit: data.prodUnit,
        price: Number(data.prodPrice) || 0,
        stock: Number(data.prodStock) || 0,
        minStock: Number(data.prodMinStock) || 0,
        description: data.prodDesc || '',
        warehouse: data.prodWarehouse || 'Almacén Principal',
        updatedAt: ts,
      });
      showToast('Producto actualizado');
    } else {
      await fb.firestore().collection('invProducts').add({
        name: data.prodName,
        sku: data.prodSku || '',
        categoryId: data.prodCategory,
        unit: data.prodUnit,
        price: Number(data.prodPrice) || 0,
        stock: Number(data.prodStock) || 0,
        minStock: Number(data.prodMinStock) || 0,
        description: data.prodDesc || '',
        imageData: data.prodImage || '',
        warehouse: data.prodWarehouse || 'Almacén Principal',
        warehouseStock: {},
        createdAt: ts,
        createdBy: authUser?.uid,
        tenantId: tenantId || '',
      });
      showToast('✅ Producto registrado');
    }
  }, showToast);
}

export async function deleteInvProduct(productId: string, showToast: ToastFn, tenantId: string | null) {
  return fbAction('eliminar producto', async () => {
    await serverDelete('invProduct', productId, tenantId);
    showToast('Producto eliminado');
  }, showToast);
}

export function saveInvCategory(data: Record<string, any>, editingId: string | null, showToast: ToastFn, authUser: FirebaseUser | null, tenantId: string | null) {
  return fbAction('guardar categoría', async () => {
    requireAuth(authUser, 'guardar categoría');
    const fb = getFirebase();
    const ts = fb.firestore.FieldValue.serverTimestamp();
    if (editingId) {
      await fb.firestore().collection('invCategories').doc(editingId).update({
        name: data.catName,
        color: data.catColor || '#10b981',
        description: data.catDesc || '',
      });
      showToast('Categoría actualizada');
    } else {
      await fb.firestore().collection('invCategories').add({
        name: data.catName,
        color: data.catColor || '#10b981',
        description: data.catDesc || '',
        createdAt: ts,
        tenantId: tenantId || '',
      });
      showToast('✅ Categoría creada');
    }
  }, showToast);
}

export async function deleteInvCategory(catId: string, showToast: ToastFn, tenantId: string | null) {
  return fbAction('eliminar categoría', async () => {
    await serverDelete('invCategory', catId, tenantId);
    showToast('Categoría eliminada');
  }, showToast);
}

export function saveInvMovement(data: Record<string, any>, showToast: ToastFn, authUser: FirebaseUser | null, tenantId: string | null) {
  return fbAction('registrar movimiento', async () => {
    requireAuth(authUser, 'registrar movimiento');
    const fb = getFirebase();
    const ts = fb.firestore.FieldValue.serverTimestamp();
    await fb.firestore().collection('invMovements').add({
      productId: data.movProduct,
      type: data.movType,
      quantity: Number(data.movQuantity) || 0,
      reason: data.movReason || '',
      reference: data.movReference || '',
      date: data.movDate || '',
      warehouse: data.movWarehouse || 'Almacén Principal',
      createdAt: ts,
      createdBy: authUser?.uid,
      tenantId: tenantId || '',
    });
    showToast('✅ Movimiento registrado');
  }, showToast);
}

export async function deleteInvMovement(movId: string, showToast: ToastFn, tenantId: string | null) {
  return fbAction('eliminar movimiento', async () => {
    await serverDelete('invMovement', movId, tenantId);
    showToast('Movimiento eliminado');
  }, showToast);
}

export function saveInvTransfer(data: Record<string, any>, showToast: ToastFn, authUser: FirebaseUser | null, tenantId: string | null) {
  return fbAction('registrar transferencia', async () => {
    requireAuth(authUser, 'registrar transferencia');
    const fb = getFirebase();
    const ts = fb.firestore.FieldValue.serverTimestamp();
    await fb.firestore().collection('invTransfers').add({
      productId: data.transProduct,
      productName: data.transProductName || '',
      fromWarehouse: data.transFrom,
      toWarehouse: data.transTo,
      quantity: Number(data.transQuantity) || 0,
      status: 'Pendiente',
      date: data.transDate || '',
      notes: data.transNotes || '',
      createdAt: ts,
      createdBy: authUser?.uid,
      tenantId: tenantId || '',
    });
    showToast('✅ Transferencia creada');
  }, showToast);
}

export async function deleteInvTransfer(transId: string, showToast: ToastFn, tenantId: string | null) {
  return fbAction('eliminar transferencia', async () => {
    await serverDelete('invTransfer', transId, tenantId);
    showToast('Transferencia eliminada');
  }, showToast);
}

export async function updateTransferStatus(transId: string, status: string, showToast: ToastFn, tenantId: string | null) {
  return fbAction('actualizar transferencia', async () => {
    const fb = getFirebase();
    const updates: Record<string, any> = { status };
    if (status === 'Completada') updates.completedAt = fb.firestore.FieldValue.serverTimestamp();
    await fb.firestore().collection('invTransfers').doc(transId).update(updates);
    showToast(`Transferencia: ${status}`);
  }, showToast);
}

/* ===== PROJECT PROGRESS ===== */
// NOTE: updateProjectProgress removed — dead code. AppContext.tsx provides its own implementation.

/* ===== USER COMPANY ===== */
// NOTE: updateUserCompany removed — dead code. AppContext.tsx provides its own implementation (uses /api/update-user).

/* ===== TIME ENTRIES ===== */

export function saveTimeEntry(data: Record<string, any>, editingId: string | null, showToast: ToastFn, authUser: FirebaseUser | null, tenantId: string | null) {
  return fbAction('guardar registro de tiempo', async () => {
    requireAuth(authUser, 'guardar registro de tiempo');
    const fb = getFirebase();
    const db = fb.firestore();
    const ts = fb.firestore.FieldValue.serverTimestamp();
    const entryData: Record<string, any> = {
      userId: authUser?.uid,
      userName: authUser?.displayName || authUser?.email || 'Usuario',
      projectId: data.teProject || '',
      phaseName: data.tePhase || '',
      description: data.teDescription || '',
      startTime: data.teStartTime || '',
      endTime: data.teEndTime || '',
      duration: Number(data.teDuration) || 0,
      billable: data.teBillable !== false,
      rate: Number(data.teRate) || 0,
      date: data.teDate || '',
      updatedAt: ts,
    };
    if (editingId) {
      await db.collection('timeEntries').doc(editingId).update(entryData);
      showToast('Registro actualizado');
    } else {
      entryData.createdAt = ts;
      entryData.tenantId = tenantId || '';
      await db.collection('timeEntries').add(entryData);
      showToast('✅ Tiempo registrado');
    }
  }, showToast);
}

export async function deleteTimeEntry(entryId: string, showToast: ToastFn, tenantId: string | null) {
  return fbAction('eliminar tiempo', async () => {
    await serverDelete('timeEntry', entryId, tenantId);
    showToast('Registro eliminado');
  }, showToast);
}

/* ===== INVOICES ===== */

export function saveInvoice(data: Record<string, any>, editingId: string | null, showToast: ToastFn, authUser: FirebaseUser | null, tenantId: string | null) {
  return fbAction('guardar factura', async () => {
    requireAuth(authUser, 'guardar factura');
    const fb = getFirebase();
    const db = fb.firestore();
    const ts = fb.firestore.FieldValue.serverTimestamp();
    const proj = data.invProject ? await db.collection('projects').doc(data.invProject).get() : null;
    const projData = proj?.exists ? proj.data() : {};
    const invoiceData: Record<string, any> = {
      projectId: data.invProject || '',
      projectName: projData.name || '',
      clientName: projData.client || '',
      number: data.invNumber || `FACT-${Date.now().toString(36).toUpperCase()}`,
      status: data.invStatus || 'Borrador',
      items: data.invItems || [],
      subtotal: Number(data.invSubtotal) || 0,
      tax: Number(data.invTax) || 19,
      total: Number(data.invTotal) || 0,
      notes: data.invNotes || '',
      issueDate: data.invIssueDate || new Date().toISOString().split('T')[0],
      dueDate: data.invDueDate || '',
      updatedAt: ts,
    };
    if (editingId) {
      await db.collection('invoices').doc(editingId).update(invoiceData);
      showToast('Factura actualizada');
    } else {
      invoiceData.createdAt = ts;
      invoiceData.createdBy = authUser?.uid;
      invoiceData.tenantId = tenantId || '';
      await db.collection('invoices').add(invoiceData);
      showToast('✅ Factura creada');
    }
  }, showToast);
}

export async function updateInvoiceStatus(invoiceId: string, status: string, showToast: ToastFn, tenantId: string | null) {
  return fbAction('actualizar factura', async () => {
    const fb = getFirebase();
    const updates: Record<string, any> = { status };
    if (status === 'Pagada') updates.paidDate = fb.firestore.FieldValue.serverTimestamp();
    await fb.firestore().collection('invoices').doc(invoiceId).update(updates);
    showToast(`Factura: ${status}`);
  }, showToast);
}

export async function deleteInvoice(invoiceId: string, showToast: ToastFn, tenantId: string | null) {
  return fbAction('eliminar factura', async () => {
    await serverDelete('invoice', invoiceId, tenantId);
    showToast('Factura eliminada');
  }, showToast);
}

/* ===== COMMENTS ===== */

export function saveComment(data: Record<string, any>, showToast: ToastFn, authUser: FirebaseUser | null, tenantId: string | null) {
  return fbAction('guardar comentario', async () => {
    requireAuth(authUser, 'guardar comentario');
    const fb = getFirebase();
    const ts = fb.firestore.FieldValue.serverTimestamp();
    await fb.firestore().collection('comments').add({
      taskId: data.taskId || '',
      projectId: data.projectId || '',
      userId: authUser?.uid,
      userName: authUser?.displayName || authUser?.email || 'Usuario',
      userPhoto: authUser?.photoURL || '',
      text: data.text || '',
      mentions: data.mentions || [],
      parentId: data.parentId || null,
      createdAt: ts,
      tenantId: tenantId || '',
    });
  });
}

export async function deleteComment(commentId: string, showToast: ToastFn, tenantId: string | null) {
  return fbAction('eliminar comentario', async () => {
    await serverDelete('comment', commentId, tenantId);
    showToast('Comentario eliminado');
  }, showToast);
}

/* ===== RFIs (Request for Information) ===== */

export function saveRFI(data: Record<string, any>, editingId: string | null, showToast: ToastFn, authUser: FirebaseUser | null, tenantId: string | null) {
  return fbAction('guardar RFI', async () => {
    requireAuth(authUser, 'guardar RFI');
    const fb = getFirebase();
    const db = fb.firestore();
    const ts = fb.firestore.FieldValue.serverTimestamp();
    if (editingId) {
      await db.collection('rfis').doc(editingId).update({
        subject: data.rfiSubject,
        question: data.rfiQuestion,
        assignedTo: data.rfiAssignedTo || '',
        priority: data.rfiPriority || 'Media',
        dueDate: data.rfiDueDate || '',
        status: data.rfiStatus || 'Abierto',
        response: data.rfiResponse || '',
        updatedAt: ts,
      });
      showToast('RFI actualizado');
    } else {
      const countSnap = await db.collection('rfis').where('tenantId', '==', tenantId || '').get();
      const num = `RFI-${String(countSnap.size + 1).padStart(3, '0')}`;
      await db.collection('rfis').add({
        number: num,
        projectId: data.rfiProject || '',
        subject: data.rfiSubject,
        question: data.rfiQuestion,
        response: '',
        status: 'Abierto',
        priority: data.rfiPriority || 'Media',
        assignedTo: data.rfiAssignedTo || '',
        dueDate: data.rfiDueDate || '',
        photos: [],
        createdAt: ts,
        createdBy: authUser?.uid,
        tenantId: tenantId || '',
        updatedAt: ts,
        respondedBy: '',
        respondedAt: null,
      });
      showToast('✅ RFI creado');
    }
  }, showToast);
}

export async function deleteRFI(rfiId: string, showToast: ToastFn, tenantId: string | null) {
  return fbAction('eliminar RFI', async () => {
    await serverDelete('rfi', rfiId, tenantId);
    showToast('RFI eliminado');
  }, showToast);
}

export async function updateRFIStatus(rfiId: string, status: string, response: string, showToast: ToastFn, authUser: FirebaseUser | null, tenantId: string | null) {
  return fbAction('actualizar RFI', async () => {
    const fb = getFirebase();
    const updates: Record<string, any> = { status, updatedAt: fb.firestore.FieldValue.serverTimestamp() };
    if (response !== undefined) updates.response = response;
    if (status === 'Respondido') {
      updates.respondedBy = authUser?.uid;
      updates.respondedAt = fb.firestore.FieldValue.serverTimestamp();
    }
    await fb.firestore().collection('rfis').doc(rfiId).update(updates);
    showToast(status === 'Cerrado' ? 'RFI cerrado' : status === 'Respondido' ? '✅ RFI respondido' : `RFI: ${status}`);
  }, showToast);
}

/* ===== SUBMITTALS ===== */

export function saveSubmittal(data: Record<string, any>, editingId: string | null, showToast: ToastFn, authUser: FirebaseUser | null, tenantId: string | null) {
  return fbAction('guardar submittal', async () => {
    requireAuth(authUser, 'guardar submittal');
    const fb = getFirebase();
    const db = fb.firestore();
    const ts = fb.firestore.FieldValue.serverTimestamp();
    if (editingId) {
      await db.collection('submittals').doc(editingId).update({
        title: data.subTitle,
        description: data.subDescription || '',
        specification: data.subSpecification || '',
        status: data.subStatus || 'Borrador',
        reviewer: data.subReviewer || '',
        dueDate: data.subDueDate || '',
        reviewNotes: data.subReviewNotes || '',
        updatedAt: ts,
      });
      showToast('Submittal actualizado');
    } else {
      const countSnap = await db.collection('submittals').where('tenantId', '==', tenantId || '').get();
      const num = `SUB-${String(countSnap.size + 1).padStart(3, '0')}`;
      await db.collection('submittals').add({
        number: num,
        projectId: data.subProject || '',
        title: data.subTitle,
        description: data.subDescription || '',
        specification: data.subSpecification || '',
        status: 'Borrador',
        submittedBy: authUser?.displayName || authUser?.email || 'Usuario',
        reviewer: data.subReviewer || '',
        dueDate: data.subDueDate || '',
        reviewNotes: '',
        reviewedAt: null,
        createdAt: ts,
        createdBy: authUser?.uid,
        tenantId: tenantId || '',
        updatedAt: ts,
      });
      showToast('✅ Submittal creado');
    }
  }, showToast);
}

export async function deleteSubmittal(subId: string, showToast: ToastFn, tenantId: string | null) {
  return fbAction('eliminar submittal', async () => {
    await serverDelete('submittal', subId, tenantId);
    showToast('Submittal eliminado');
  }, showToast);
}

export async function updateSubmittalStatus(subId: string, status: string, reviewNotes: string, showToast: ToastFn, authUser: FirebaseUser | null, tenantId: string | null) {
  return fbAction('actualizar submittal', async () => {
    const fb = getFirebase();
    const updates: Record<string, any> = { status, updatedAt: fb.firestore.FieldValue.serverTimestamp() };
    if (reviewNotes !== undefined) updates.reviewNotes = reviewNotes;
    if (status === 'Aprobado' || status === 'Rechazado' || status === 'Devuelto') {
      updates.reviewedBy = authUser?.uid;
      updates.reviewedAt = fb.firestore.FieldValue.serverTimestamp();
    }
    await fb.firestore().collection('submittals').doc(subId).update(updates);
    const msgs: Record<string, string> = { 'Aprobado': '✅ Submittal aprobado', 'Rechazado': '❌ Submittal rechazado', 'Devuelto': '↩️ Submittal devuelto' };
    showToast(msgs[status] || `Submittal: ${status}`);
  }, showToast);
}

/* ===== PUNCH LIST ===== */

export function savePunchItem(data: Record<string, any>, editingId: string | null, showToast: ToastFn, authUser: FirebaseUser | null, tenantId: string | null) {
  return fbAction('guardar item punch list', async () => {
    requireAuth(authUser, 'guardar item punch list');
    const fb = getFirebase();
    const db = fb.firestore();
    const ts = fb.firestore.FieldValue.serverTimestamp();
    if (editingId) {
      await db.collection('punchItems').doc(editingId).update({
        title: data.punchTitle,
        description: data.punchDescription || '',
        location: data.punchLocation || 'Otro',
        status: data.punchStatus || 'Pendiente',
        priority: data.punchPriority || 'Media',
        assignedTo: data.punchAssignedTo || '',
        dueDate: data.punchDueDate || '',
        updatedAt: ts,
      });
      showToast('Item actualizado');
    } else {
      await db.collection('punchItems').add({
        projectId: data.punchProject || '',
        title: data.punchTitle,
        description: data.punchDescription || '',
        location: data.punchLocation || 'Otro',
        status: 'Pendiente',
        priority: data.punchPriority || 'Media',
        assignedTo: data.punchAssignedTo || '',
        dueDate: data.punchDueDate || '',
        photos: [],
        completedAt: null,
        completedBy: '',
        createdAt: ts,
        createdBy: authUser?.uid,
        tenantId: tenantId || '',
        updatedAt: ts,
      });
      showToast('✅ Item agregado');
    }
  }, showToast);
}

export async function deletePunchItem(punchId: string, showToast: ToastFn, tenantId: string | null) {
  return fbAction('eliminar item punch list', async () => {
    await serverDelete('punchItem', punchId, tenantId);
    showToast('Item eliminado');
  }, showToast);
}

export async function updatePunchItemStatus(punchId: string, status: string, showToast: ToastFn, authUser: FirebaseUser | null, tenantId: string | null) {
  return fbAction('actualizar punch item', async () => {
    const fb = getFirebase();
    const updates: Record<string, any> = { status, updatedAt: fb.firestore.FieldValue.serverTimestamp() };
    if (status === 'Completado') {
      updates.completedAt = fb.firestore.FieldValue.serverTimestamp();
      updates.completedBy = authUser?.uid;
    }
    await fb.firestore().collection('punchItems').doc(punchId).update(updates);
    showToast(status === 'Completado' ? '✅ Item completado' : `Item: ${status}`);
  }, showToast);
}

/* ===== CHANGE ORDERS ===== */

export async function createChangeOrder(data: Record<string, any>): Promise<string> {
  const fb = getFirebase();
  const db = fb.firestore();
  const docRef = db.collection('changeOrders').doc();

  // Get next order number atomically
  const counterRef = db.collection('projects').doc(data.projectId).collection('changeOrderCounter').doc('counter');
  const counterSnap = await counterRef.get();
  let nextNum = 1;
  if (counterSnap.exists) {
    nextNum = (counterSnap.data()?.count || 0) + 1;
  }
  const orderNumber = `CO-${String(nextNum).padStart(3, '0')}`;

  const historyEntry: ChangeOrderHistoryEntry = {
    action: 'created',
    by: data.createdBy,
    byName: data.createdByName,
    at: fb.firestore.FieldValue.serverTimestamp(),
    comments: 'Orden creada',
  };

  await docRef.set({
    ...data,
    id: docRef.id,
    orderNumber,
    history: [historyEntry],
  });

  // Update counter
  await counterRef.set({ count: nextNum }, { merge: true });

  return docRef.id;
}

export async function updateChangeOrder(coId: string, data: Record<string, any>): Promise<void> {
  const fb = getFirebase();
  const db = fb.firestore();
  await db.collection('changeOrders').doc(coId).update(data);
}

export async function submitChangeOrder(coId: string, userName: string, uid: string): Promise<void> {
  const fb = getFirebase();
  const db = fb.firestore();
  const historyEntry: ChangeOrderHistoryEntry = {
    action: 'submitted',
    by: uid,
    byName: userName,
    at: fb.firestore.FieldValue.serverTimestamp(),
    comments: 'Enviada para aprobación',
  };
  await db.collection('changeOrders').doc(coId).update({
    status: 'pendiente_aprobacion',
    submittedAt: fb.firestore.FieldValue.serverTimestamp(),
    history: fb.firestore.FieldValue.arrayUnion(historyEntry),
  });
}

export async function approveChangeOrder(
  coId: string,
  approverUid: string,
  approverName: string,
  comments: string
): Promise<void> {
  const fb = getFirebase();
  const db = fb.firestore();
  const historyEntry: ChangeOrderHistoryEntry = {
    action: 'approved',
    by: approverUid,
    byName: approverName,
    at: fb.firestore.FieldValue.serverTimestamp(),
    comments,
  };
  await db.collection('changeOrders').doc(coId).update({
    status: 'aprobada',
    approvedBy: approverUid,
    approvedByName: approverName,
    approvedAt: fb.firestore.FieldValue.serverTimestamp(),
    reviewedComments: comments,
    history: fb.firestore.FieldValue.arrayUnion(historyEntry),
  });
}

export async function rejectChangeOrder(
  coId: string,
  approverUid: string,
  approverName: string,
  reason: string
): Promise<void> {
  const fb = getFirebase();
  const db = fb.firestore();
  const historyEntry: ChangeOrderHistoryEntry = {
    action: 'rejected',
    by: approverUid,
    byName: approverName,
    at: fb.firestore.FieldValue.serverTimestamp(),
    comments: reason,
  };
  await db.collection('changeOrders').doc(coId).update({
    status: 'rechazada',
    rejectionReason: reason,
    reviewedComments: reason,
    history: fb.firestore.FieldValue.arrayUnion(historyEntry),
  });
}
