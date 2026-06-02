import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/api-auth";
import { getAdminDb, getAdminFieldValue, getAdminAuth, isAdminInitialized } from "@/lib/firebase-admin";
import { getAllFlags } from "@/lib/feature-flags";

/* ─── In-memory cache for expensive queries (3-minute TTL) ─── */
const apiCache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_TTL = 3 * 60 * 1000; // 3 minutes

/** Invalidate all cached data — call after any write operation */
function invalidateCache() {
  apiCache.clear();
}

/**
 * POST /api/super-admin
 *
 * Panel de Super Administrador — gestión global de toda la plataforma.
 * PROTEGIDO: Solo administradores globales (requireAdmin).
 *
 * Operaciones:
 *   - dashboard: Obtener estadísticas globales de la plataforma
 *   - list-tenants: Listar todos los tenants con detalles
 *   - create-tenant: Crear un nuevo tenant directamente
 *   - delete-tenant: Eliminar un tenant y opcionalmente sus datos
 *   - update-tenant: Actualizar nombre/código de un tenant
 *   - tenant-detail: Obtener detalle completo de un tenant
 *   - list-all-users: Listar todos los usuarios del sistema
 *   - update-user-role: Cambiar rol global de un usuario
 *   - delete-user: Eliminar un usuario del sistema
 *   - add-user-to-tenant: Agregar un usuario a un tenant
 *   - remove-user-from-tenant: Remover un usuario de un tenant
 *   - regenerate-code: Regenerar código de invitación de un tenant
 *   - transfer-ownership: Transferir propiedad de un tenant
 *   - tenant-stats: Estadísticas detalladas de un tenant
 *   - bulk-action: Acción masiva sobre múltiples tenants/usuarios
 *   - global-audit: Obtener audit logs de TODOS los tenants
 *   - global-errors: Obtener reportes de error de TODOS los tenants
 *   - global-feedback: Obtener feedback beta de TODOS los tenants
 *   - resolve-error-global: Marcar un error reportado como resuelto (global)
 *   - review-feedback-global: Revisar feedback (global)
 *   - get-feature-flags: Obtener feature flags actuales
 *   - update-feature-flag: Actualizar una feature flag
 *   - health-check: Ejecutar health check de la plataforma
 */

export async function POST(request: NextRequest) {
  let user: any;
  try {
    user = await requireAdmin(request);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Error de autenticación" }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { action } = body;

  const validActions = [
    "dashboard", "list-tenants", "create-tenant", "delete-tenant",
    "update-tenant", "tenant-detail", "list-all-users", "update-user-role",
    "delete-user", "add-user-to-tenant", "remove-user-from-tenant",
    "regenerate-code", "transfer-ownership", "tenant-stats", "bulk-action",
    "global-audit", "global-errors", "global-feedback",
    "resolve-error-global", "review-feedback-global",
    "get-feature-flags", "update-feature-flag", "health-check",
  ];

  if (!action || !validActions.includes(action)) {
    return NextResponse.json({ error: `Acción inválida. Usa: ${validActions.join(", ")}` }, { status: 400 });
  }

  try {
    const db = getAdminDb();
    const FieldValue = getAdminFieldValue();

    // ===== DASHBOARD — Global Stats =====
    if (action === "dashboard") {
      // Check cache first — dashboard data rarely changes
      const cacheKey = `dashboard`;
      const cached = apiCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return NextResponse.json(cached.data);
      }

      // Get full data for tenants and users (needed for orphan detection + summaries)
      const [tenantsSnap, usersSnap] = await Promise.all([
        db.collection("tenants").get(),
        db.collection("users").get(),
      ]);

      const totalTenants = tenantsSnap.size;
      const totalUsers = usersSnap.size;

      // Use .count().get() for collections where we only need counts
      const [totalProjects, totalTasks, totalExpenses, totalMeetings] = await Promise.all([
        db.collection("projects").count().get().then((s: any) => s.data().count).catch(() => 0),
        db.collection("tasks").count().get().then((s: any) => s.data().count).catch(() => 0),
        db.collection("expenses").count().get().then((s: any) => s.data().count).catch(() => 0),
        db.collection("meetings").count().get().then((s: any) => s.data().count).catch(() => 0),
      ]);

      // Build tenant summaries
      const tenantSummaries = tenantsSnap.docs.map((d: any) => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name || "Sin nombre",
          code: data.code || "",
          memberCount: (data.members || []).length,
          createdBy: data.createdBy || "",
          createdAt: data.createdAt?._seconds ? new Date(data.createdAt._seconds * 1000).toISOString() : null,
        };
      }).sort((a: any, b: any) => (b.memberCount || 0) - (a.memberCount || 0));

      // Users without tenant
      const usersInAnyTenant = new Set<string>();
      tenantsSnap.docs.forEach((d: any) => {
        (d.data().members || []).forEach((uid: string) => usersInAnyTenant.add(uid));
      });
      const orphanUsers = usersSnap.docs.filter((d: any) => !usersInAnyTenant.has(d.id));

      const dashboardData = {
        totalTenants,
        totalUsers,
        totalProjects,
        totalTasks,
        totalExpenses,
        totalMeetings,
        tenantSummaries,
        orphanUsersCount: orphanUsers.length,
        orphanUsers: orphanUsers.map((d: any) => ({
          uid: d.id,
          name: d.data()?.name || "Sin nombre",
          email: d.data()?.email || "",
          role: d.data()?.role || "Miembro",
        })),
      };
      // Cache the dashboard response
      apiCache.set('dashboard', { data: dashboardData, expiresAt: Date.now() + CACHE_TTL });
      return NextResponse.json(dashboardData);
    }

    // ===== LIST TENANTS =====
    if (action === "list-tenants") {
      // Check cache first
      const cacheKey = 'list-tenants';
      const cached = apiCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return NextResponse.json(cached.data);
      }

      const snap = await db.collection("tenants").orderBy("createdAt", "desc").get();
      const allTenants = snap.docs.map((doc: any) => {
        const data = doc.data();
        return { id: doc.id, ...data };
      });

      // Batch user lookups instead of N+1
      const allMemberUids = [...new Set(allTenants.flatMap((t: any) => (t.members || [])))];
      const userMap: Record<string, any> = {};
      const batchSize = 20; // Concurrent Firestore reads
      for (let i = 0; i < allMemberUids.length; i += batchSize) {
        const batch = allMemberUids.slice(i, i + batchSize);
        const docs = await Promise.all(batch.map((uid: string) => db.collection("users").doc(uid).get()));
        for (const doc of docs) {
          if (doc.exists) userMap[doc.id] = doc.data();
        }
      }

      // Sin N+1: ya no se consultan projectCount/taskCount por cada tenant
      // Esos datos están disponibles vía tenant-detail cuando el usuario hace clic en "Ver Detalle"
      const tenants = snap.docs.map((doc: any) => {
        const data = doc.data();
        const membersResolved: any[] = (data.members || []).map((uid: string) => {
          const uData = userMap[uid];
          return {
            uid,
            name: uData?.name || "Desconocido",
            email: uData?.email || "N/A",
            role: uData?.role || "Miembro",
            photoURL: uData?.photoURL || "",
            isCreator: uid === data.createdBy,
          };
        });

        return {
          id: doc.id,
          name: data.name || "Sin nombre",
          code: data.code || "",
          members: data.members || [],
          membersResolved,
          createdBy: data.createdBy || "",
          createdAt: data.createdAt?._seconds ? new Date(data.createdAt._seconds * 1000).toISOString() : null,
          memberCount: membersResolved.length,
        };
      });

      const tenantsResponse = { tenants };
      // Cache the list-tenants response
      apiCache.set('list-tenants', { data: tenantsResponse, expiresAt: Date.now() + CACHE_TTL });
      return NextResponse.json(tenantsResponse);
    }

    // ===== CREATE TENANT =====
    if (action === "create-tenant") {
      const { name, ownerEmail, migrateExistingOwner } = body;

      if (!name || typeof name !== "string" || name.trim().length < 2) {
        return NextResponse.json({ error: "El nombre debe tener al menos 2 caracteres" }, { status: 400 });
      }

      // Generate unique code
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let code = "";
      for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
      let attempts = 0;
      while (attempts < 20) {
        const snap = await db.collection("tenants").where("code", "==", code).limit(1).get();
        if (snap.empty) break;
        code = "";
        for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
        attempts++;
      }

      // Determine owner UID
      let ownerUid = user.uid;
      if (ownerEmail) {
        const uSnap = await db.collection("users").where("email", "==", ownerEmail.trim().toLowerCase()).limit(1).get();
        if (uSnap.empty) {
          return NextResponse.json({ error: `No se encontró usuario con email: ${ownerEmail}` }, { status: 404 });
        }
        ownerUid = uSnap.docs[0].id;
      }

      const tenantRef = await db.collection("tenants").add({
        name: name.trim(),
        code,
        members: [ownerUid],
        createdBy: ownerUid,
        createdAt: FieldValue.serverTimestamp(),
      });

      // Optionally migrate existing data for the owner
      let migratedCounts: Record<string, number> = {};
      if (migrateExistingOwner) {
        const collections = ["projects", "tasks", "expenses", "suppliers", "companies", "meetings", "galleryPhotos", "invProducts", "invCategories", "invMovements", "invTransfers", "timeEntries", "invoices", "comments", "generalMessages"];
        for (const col of collections) {
          try {
            let snap2 = await db.collection(col).where("createdBy", "==", ownerUid).limit(500).get();
            if (snap2.empty) {
              snap2 = await db.collection(col).where("userId", "==", ownerUid).limit(500).get();
            }
            if (!snap2.empty) {
              let batch = db.batch();
              let count = 0;
              for (const d of snap2.docs) {
                if (!d.data().tenantId) {
                  batch.update(d.ref, { tenantId: tenantRef.id });
                  count++;
                  if (count % 400 === 0) {
                    await batch.commit();
                    batch = db.batch();
                  }
                }
              }
              if (count > 0) {
                await batch.commit();
                migratedCounts[col] = count;
              }
            }
          } catch (e) { /* collection may not exist */ }
        }
      }

      invalidateCache();
      return NextResponse.json({
        tenantId: tenantRef.id,
        name: name.trim(),
        code,
        ownerUid,
        migratedCounts,
      });
    }

    // ===== DELETE TENANT =====
    if (action === "delete-tenant") {
      const { tenantId, deleteData } = body;
      if (!tenantId) return NextResponse.json({ error: "tenantId requerido" }, { status: 400 });

      const tenantDoc = await db.collection("tenants").doc(tenantId).get();
      if (!tenantDoc.exists) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });

      const tenantData = tenantDoc.data()!;
      const tenantName = tenantData.name || "Sin nombre";

      if (deleteData) {
        // Delete all tenant-scoped data
        const collections = ["projects", "tasks", "expenses", "suppliers", "companies", "meetings", "galleryPhotos", "invProducts", "invCategories", "invMovements", "invTransfers", "timeEntries", "invoices", "comments", "generalMessages"];
        let totalDeleted = 0;
        for (const col of collections) {
          try {
            let keepGoing = true;
            while (keepGoing) {
              const snap = await db.collection(col).where("tenantId", "==", tenantId).limit(500).get();
              if (snap.empty) { keepGoing = false; break; }
              let batch = db.batch();
              for (const d of snap.docs) {
                batch.delete(d.ref);
                totalDeleted++;
                if (totalDeleted % 400 === 0) {
                  await batch.commit();
                  batch = db.batch();
                }
              }
              await batch.commit();
              if (snap.size < 500) keepGoing = false; // Got all docs
            }
          } catch (e) { /* collection may not exist or not have tenantId index */ }
        }

        // Also delete project subcollections
        try {
          const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).get();
          // Projects were already deleted above if they had tenantId
        } catch (e) { /* skip */ }

      }

      await db.collection("tenants").doc(tenantId).delete();
      invalidateCache();
      return NextResponse.json({ deleted: tenantName, tenantId });
    }

    // ===== UPDATE TENANT =====
    if (action === "update-tenant") {
      const { tenantId, name, code } = body;
      if (!tenantId) return NextResponse.json({ error: "tenantId requerido" }, { status: 400 });

      const tenantDoc = await db.collection("tenants").doc(tenantId).get();
      if (!tenantDoc.exists) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });

      const updates: Record<string, any> = {};
      if (name && typeof name === "string" && name.trim().length >= 2) updates.name = name.trim();
      if (code && typeof code === "string") {
        // Check uniqueness
        const existing = await db.collection("tenants").where("code", "==", code.trim().toUpperCase()).limit(1).get();
        if (!existing.empty && existing.docs[0].id !== tenantId) {
          return NextResponse.json({ error: "El código ya está en uso por otro tenant" }, { status: 409 });
        }
        updates.code = code.trim().toUpperCase();
      }

      if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: "No hay cambios para aplicar" }, { status: 400 });
      }

      await db.collection("tenants").doc(tenantId).update(updates);
      invalidateCache();
      return NextResponse.json({ updated: true, ...updates });
    }

    // ===== TENANT DETAIL =====
    if (action === "tenant-detail") {
      const { tenantId } = body;
      if (!tenantId) return NextResponse.json({ error: "tenantId requerido" }, { status: 400 });

      const tenantDoc = await db.collection("tenants").doc(tenantId).get();
      if (!tenantDoc.exists) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });

      const data = tenantDoc.data()!;

      // Batch user lookups instead of sequential N+1
      const memberUids = (data.members || []);
      const userMap: Record<string, any> = {};
      const batchSize = 20;
      for (let i = 0; i < memberUids.length; i += batchSize) {
        const batch = memberUids.slice(i, i + batchSize);
        const docs = await Promise.all(batch.map((uid: string) => db.collection("users").doc(uid).get()));
        for (const doc of docs) {
          if (doc.exists) userMap[doc.id] = doc.data();
        }
      }
      const membersResolved = memberUids.map((uid: string) => {
        const uData = userMap[uid];
        return {
          uid,
          name: uData?.name || "Desconocido",
          email: uData?.email || "N/A",
          role: uData?.role || "Miembro",
          photoURL: uData?.photoURL || "",
          isCreator: uid === data.createdBy,
        };
      });

      // Get all collections counts for this tenant — ejecución paralela con Promise.allSettled
      const colNames = ["projects", "tasks", "expenses", "suppliers", "companies", "meetings", "galleryPhotos", "invProducts", "invCategories", "invMovements", "invTransfers", "timeEntries", "invoices", "comments"];
      const countResults = await Promise.allSettled(
        colNames.map(col =>
          db.collection(col).where("tenantId", "==", tenantId).count().get()
            .then((s: any) => ({ col, count: s.data().count }))
            .catch(() => ({ col, count: -1 }))
        )
      );
      const collectionStats: Record<string, number> = {};
      for (const r of countResults) {
        if (r.status === 'fulfilled' && r.value.count >= 0) {
          collectionStats[r.value.col] = r.value.count;
        }
      }
      // Fallback para .count() fallido — intentar .get() con limit
      for (const r of countResults) {
        if (r.status === 'fulfilled' && r.value.count === -1) {
          try {
            const snap = await db.collection(r.value.col).where("tenantId", "==", tenantId).limit(500).get();
            collectionStats[r.value.col] = snap.size;
          } catch { collectionStats[r.value.col] = 0; }
        }
      }

      // Get projects list
      let projects: any[] = [];
      try {
        const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).orderBy("createdAt", "desc").limit(50).get();
        projects = projSnap.docs.map((d: any) => ({
          id: d.id,
          name: d.data()!.name || "Sin nombre",
          status: d.data()!.status || "",
          progress: d.data()!.progress || 0,
          client: d.data()!.client || "",
          createdAt: d.data()!.createdAt?._seconds ? new Date(d.data()!.createdAt._seconds * 1000).toISOString() : null,
        }));
      } catch (e) { /* projects index may not exist */ }

      return NextResponse.json({
        id: tenantDoc.id,
        name: data.name || "",
        code: data.code || "",
        members: data.members || [],
        membersResolved,
        createdBy: data.createdBy || "",
        createdAt: data.createdAt?._seconds ? new Date(data.createdAt._seconds * 1000).toISOString() : null,
        collectionStats,
        projects,
      });
    }

    // ===== LIST ALL USERS =====
    if (action === "list-all-users") {
      // Check cache first
      const cacheKey = 'list-all-users';
      const cached = apiCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return NextResponse.json(cached.data);
      }

      const usersSnap = await db.collection("users").orderBy("createdAt", "desc").get();

      // Build a map of user UID → user doc data for role lookups
      const userDocMap: Record<string, any> = {};
      for (const d of usersSnap.docs) {
        userDocMap[d.id] = d.data();
      }

      // Get all tenants to cross-reference
      const tenantsSnap = await db.collection("tenants").get();
      const userTenantMap: Record<string, { tenantId: string; tenantName: string; role: string }[]> = {};

      for (const doc of tenantsSnap.docs) {
        const data = doc.data()!;
        for (const uid of (data.members || [])) {
          if (!userTenantMap[uid]) userTenantMap[uid] = [];
          // Use the user's actual role from their user document, not a guess from tenant membership
          const userDoc = userDocMap[uid];
          const userRole = userDoc?.role || "Miembro";
          const isCreator = uid === data.createdBy;
          const isSuperAdmin = isCreator || (data.superAdmins || []).includes(uid);
          const tenantRole = isSuperAdmin ? "Super Admin" : userRole;
          userTenantMap[uid].push({
            tenantId: doc.id,
            tenantName: data.name || "Sin nombre",
            role: tenantRole,
          });
        }
      }

      const users = usersSnap.docs.map((d: any) => {
        const data = d.data()!;
        return {
          uid: d.id,
          name: data.name || "Sin nombre",
          email: data.email || "",
          role: data.role || "Miembro",
          photoURL: data.photoURL || "",
          createdAt: data.createdAt?._seconds ? new Date(data.createdAt._seconds * 1000).toISOString() : null,
          tenants: userTenantMap[d.id] || [],
          tenantsCount: (userTenantMap[d.id] || []).length,
        };
      });

      const usersResponse = { users };
      // Cache the list-all-users response
      apiCache.set('list-all-users', { data: usersResponse, expiresAt: Date.now() + CACHE_TTL });
      return NextResponse.json(usersResponse);
    }

    // ===== UPDATE USER ROLE =====
    if (action === "update-user-role") {
      const { targetUid, newRole } = body;
      if (!targetUid || !newRole) return NextResponse.json({ error: "targetUid y newRole requeridos" }, { status: 400 });

      const validRoles = ["Admin", "Director", "Arquitecto", "Interventor", "Contratista", "Cliente", "Miembro"];
      if (!validRoles.includes(newRole)) {
        return NextResponse.json({ error: `Rol inválido. Roles válidos: ${validRoles.join(", ")}` }, { status: 400 });
      }

      const userDoc = await db.collection("users").doc(targetUid).get();
      if (!userDoc.exists) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

      const oldRole = userDoc.data()?.role || "Miembro";
      await db.collection("users").doc(targetUid).update({ role: newRole });

      invalidateCache();
      return NextResponse.json({ updated: true, uid: targetUid, oldRole, newRole });
    }

    // ===== DELETE USER =====
    if (action === "delete-user") {
      const { targetUid } = body;
      if (!targetUid) return NextResponse.json({ error: "targetUid requerido" }, { status: 400 });
      if (targetUid === user.uid) return NextResponse.json({ error: "No puedes eliminarte a ti mismo" }, { status: 400 });

      const userDoc = await db.collection("users").doc(targetUid).get();
      if (!userDoc.exists) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

      const userData = userDoc.data()!;

      // Remove from all tenants
      const tenantsSnap = await db.collection("tenants").where("members", "array-contains", targetUid).get();
      for (const doc of tenantsSnap.docs) {
        await db.collection("tenants").doc(doc.id).update({
          members: FieldValue.arrayRemove(targetUid),
        });
        // If user was creator, transfer ownership
        if (doc.data().createdBy === targetUid) {
          const members = (doc.data().members || []).filter((m: string) => m !== targetUid);
          if (members.length > 0) {
            await db.collection("tenants").doc(doc.id).update({ createdBy: members[0] });
          }
        }
      }

      // Delete user doc
      await db.collection("users").doc(targetUid).delete();

      // Optionally disable Firebase Auth user
      try {
        const { getAdminAuth } = await import("@/lib/firebase-admin");
        const adminAuth = getAdminAuth();
        await adminAuth.updateUser(targetUid, { disabled: true });
      } catch (e: any) {
        console.warn(`[SuperAdmin] Could not disable Auth user: ${e.message}`);
      }

      invalidateCache();
      return NextResponse.json({ deleted: true, email: userData.email, removedFromTenants: tenantsSnap.size });
    }

    // ===== ADD USER TO TENANT =====
    if (action === "add-user-to-tenant") {
      const { tenantId, targetUid } = body;
      if (!tenantId || !targetUid) return NextResponse.json({ error: "tenantId y targetUid requeridos" }, { status: 400 });

      const tenantDoc = await db.collection("tenants").doc(tenantId).get();
      if (!tenantDoc.exists) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });

      const tenantData = tenantDoc.data()!;
      if ((tenantData.members || []).includes(targetUid)) {
        return NextResponse.json({ error: "El usuario ya es miembro de este tenant" }, { status: 409 });
      }

      await db.collection("tenants").doc(tenantId).update({
        members: FieldValue.arrayUnion(targetUid),
      });

      // Get user info
      const uDoc = await db.collection("users").doc(targetUid).get();
      const userName = uDoc.exists ? uDoc.data()?.name || "Desconocido" : "Desconocido";
      const userEmail = uDoc.exists ? uDoc.data()?.email || "" : "";

      invalidateCache();
      return NextResponse.json({ added: true, tenantName: tenantData.name, userName, userEmail });
    }

    // ===== REMOVE USER FROM TENANT =====
    if (action === "remove-user-from-tenant") {
      const { tenantId, targetUid } = body;
      if (!tenantId || !targetUid) return NextResponse.json({ error: "tenantId y targetUid requeridos" }, { status: 400 });

      const tenantDoc = await db.collection("tenants").doc(tenantId).get();
      if (!tenantDoc.exists) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });

      const tenantData = tenantDoc.data()!;
      if (tenantData.createdBy === targetUid) {
        return NextResponse.json({ error: "No puedes remover al creador del tenant. Transfiere la propiedad primero." }, { status: 400 });
      }

      if (!(tenantData.members || []).includes(targetUid)) {
        return NextResponse.json({ error: "El usuario no es miembro de este tenant" }, { status: 409 });
      }

      await db.collection("tenants").doc(tenantId).update({
        members: FieldValue.arrayRemove(targetUid),
      });

      invalidateCache();
      return NextResponse.json({ removed: true, tenantName: tenantData.name });
    }

    // ===== REGENERATE CODE =====
    if (action === "regenerate-code") {
      const { tenantId } = body;
      if (!tenantId) return NextResponse.json({ error: "tenantId requerido" }, { status: 400 });

      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let code = "";
      for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];

      // Ensure uniqueness before writing
      let attempts = 0;
      while (attempts < 20) {
        const existing = await db.collection("tenants").where("code", "==", code).limit(1).get();
        if (existing.empty || existing.docs[0].id === tenantId) break;
        code = "";
        for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
        attempts++;
      }

      await db.collection("tenants").doc(tenantId).update({ code });
      invalidateCache();
      return NextResponse.json({ code, tenantId });
    }

    // ===== TRANSFER OWNERSHIP =====
    if (action === "transfer-ownership") {
      const { tenantId, newOwnerUid } = body;
      if (!tenantId || !newOwnerUid) return NextResponse.json({ error: "tenantId y newOwnerUid requeridos" }, { status: 400 });

      const tenantDoc = await db.collection("tenants").doc(tenantId).get();
      if (!tenantDoc.exists) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });

      const tenantData = tenantDoc.data()!;
      if (!(tenantData.members || []).includes(newOwnerUid)) {
        return NextResponse.json({ error: "El nuevo owner debe ser miembro del tenant" }, { status: 400 });
      }

      await db.collection("tenants").doc(tenantId).update({ createdBy: newOwnerUid });

      invalidateCache();
      return NextResponse.json({ transferred: true, tenantName: tenantData.name, newOwnerUid });
    }

    // ===== TENANT STATS =====
    if (action === "tenant-stats") {
      const { tenantId } = body;
      if (!tenantId) return NextResponse.json({ error: "tenantId requerido" }, { status: 400 });

      const colNames = ["projects", "tasks", "expenses", "suppliers", "companies", "meetings", "galleryPhotos", "invProducts", "invCategories", "invMovements", "invTransfers", "timeEntries", "invoices", "comments", "generalMessages"];

      // Ejecución paralela con Promise.allSettled (igual que tenant-detail)
      const countResults = await Promise.allSettled(
        colNames.map(col =>
          db.collection(col).where("tenantId", "==", tenantId).count().get()
            .then((s: any) => ({ col, count: s.data().count }))
            .catch(() => ({ col, count: -1 }))
        )
      );
      const stats: Record<string, number> = {};
      for (const r of countResults) {
        if (r.status === 'fulfilled' && r.value.count >= 0) {
          stats[r.value.col] = r.value.count;
        }
      }
      // Fallback para .count() fallido — intentar .get() con limit
      for (const r of countResults) {
        if (r.status === 'fulfilled' && r.value.count === -1) {
          try {
            const snap = await db.collection(r.value.col).where("tenantId", "==", tenantId).limit(500).get();
            stats[r.value.col] = snap.size;
          } catch { stats[r.value.col] = 0; }
        }
      }

      return NextResponse.json({ tenantId, stats });
    }

    // ===== BULK ACTION =====
    if (action === "bulk-action") {
      const { type, targetIds } = body;
      if (!type || !Array.isArray(targetIds)) {
        return NextResponse.json({ error: "type (string) y targetIds (array) requeridos" }, { status: 400 });
      }

      const results: any[] = [];

      if (type === "remove-users-from-tenant") {
        const { tenantId } = body;
        if (!tenantId) return NextResponse.json({ error: "tenantId requerido para esta acción" }, { status: 400 });

        for (const uid of targetIds) {
          try {
            await db.collection("tenants").doc(tenantId).update({
              members: FieldValue.arrayRemove(uid),
            });
            results.push({ uid, success: true });
          } catch (e: any) {
            results.push({ uid, success: false, error: e.message });
          }
        }
      } else if (type === "add-users-to-tenant") {
        const { tenantId } = body;
        if (!tenantId) return NextResponse.json({ error: "tenantId requerido para esta acción" }, { status: 400 });

        for (const uid of targetIds) {
          try {
            await db.collection("tenants").doc(tenantId).update({
              members: FieldValue.arrayUnion(uid),
            });
            results.push({ uid, success: true });
          } catch (e: any) {
            results.push({ uid, success: false, error: e.message });
          }
        }
      } else if (type === "change-roles") {
        const { newRole } = body;
        if (!newRole) return NextResponse.json({ error: "newRole requerido para esta acción" }, { status: 400 });

        for (const uid of targetIds) {
          try {
            await db.collection("users").doc(uid).update({ role: newRole });
            results.push({ uid, success: true, newRole });
          } catch (e: any) {
            results.push({ uid, success: false, error: e.message });
          }
        }
      } else if (type === "bulk-delete") {
        // Prevent admin from deleting themselves
        if (targetIds.includes(user.uid)) {
          return NextResponse.json({ error: "No puedes eliminarte a ti mismo" }, { status: 400 });
        }

        for (const uid of targetIds) {
          try {
            // 1. Remove from all tenants (same as delete-user)
            const tenantsSnap = await db.collection("tenants").where("members", "array-contains", uid).get();
            for (const doc of tenantsSnap.docs) {
              await db.collection("tenants").doc(doc.id).update({
                members: FieldValue.arrayRemove(uid),
              });
              // If user was creator, transfer ownership to another member
              if (doc.data().createdBy === uid) {
                const members = (doc.data().members || []).filter((m: string) => m !== uid);
                if (members.length > 0) {
                  await db.collection("tenants").doc(doc.id).update({ createdBy: members[0] });
                }
              }
            }

            // 2. Delete user doc
            await db.collection("users").doc(uid).delete();

            // 3. Disable Firebase Auth user (same as delete-user)
            try {
              const { getAdminAuth } = await import("@/lib/firebase-admin");
              const adminAuth = getAdminAuth();
              await adminAuth.updateUser(uid, { disabled: true });
            } catch (e: any) {
              console.warn(`[SuperAdmin] Could not disable Auth user ${uid}: ${e.message}`);
            }

            results.push({ uid, success: true, removedFromTenants: tenantsSnap.size });
          } catch (e: any) {
            results.push({ uid, success: false, error: e.message });
          }
        }
      } else if (type === "delete-tenants") {
        for (const tid of targetIds) {
          try {
            await db.collection("tenants").doc(tid).delete();
            results.push({ tenantId: tid, success: true });
          } catch (e: any) {
            results.push({ tenantId: tid, success: false, error: e.message });
          }
        }
      } else {
        return NextResponse.json({ error: `Tipo de acción masiva no reconocida: ${type}` }, { status: 400 });
      }

      invalidateCache();
      return NextResponse.json({ type, processed: results.length, succeeded: results.filter((r: any) => r.success).length, failed: results.filter((r: any) => !r.success).length, results });
    }

    // ===== GLOBAL AUDIT — Audit logs across ALL tenants =====
    if (action === "global-audit") {
      const snap = await db.collection("audit_logs").orderBy("createdAt", "desc").limit(100).get();

      const logs = snap.docs.map((d: any) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          createdAt: data.createdAt?._seconds
            ? new Date(data.createdAt._seconds * 1000).toISOString()
            : data.createdAt || null,
        };
      });

      // Resolve userNames for logs that don't have it
      const uidsToResolve = [...new Set(
        logs
          .filter((l: any) => l.userId && !l.userName)
          .map((l: any) => l.userId as string)
      )];
      const userMap: Record<string, string> = {};
      if (uidsToResolve.length > 0) {
        const batchSize = 20;
        for (let i = 0; i < uidsToResolve.length; i += batchSize) {
          const batch = uidsToResolve.slice(i, i + batchSize);
          const docs = await Promise.all(batch.map((uid: string) => db.collection("users").doc(uid).get()));
          for (const doc of docs) {
            if (doc.exists) userMap[doc.id] = doc.data()?.name || "Desconocido";
          }
        }
      }

      // Resolve tenant names for logs that have tenantId
      const tenantIdsToResolve = [...new Set(
        logs.filter((l: any) => l.tenantId).map((l: any) => l.tenantId as string)
      )];
      const tenantMap: Record<string, string> = {};
      if (tenantIdsToResolve.length > 0) {
        const batchSize = 20;
        for (let i = 0; i < tenantIdsToResolve.length; i += batchSize) {
          const batch = tenantIdsToResolve.slice(i, i + batchSize);
          const docs = await Promise.all(batch.map((tid: string) => db.collection("tenants").doc(tid).get()));
          for (const doc of docs) {
            if (doc.exists) tenantMap[doc.id] = doc.data()?.name || "Sin nombre";
          }
        }
      }

      const resolvedLogs = logs.map((l: any) => ({
        ...l,
        userName: l.userName || userMap[l.userId] || "Desconocido",
        tenantName: l.tenantId ? (tenantMap[l.tenantId] || "Sin nombre") : undefined,
      }));

      return NextResponse.json({ logs: resolvedLogs });
    }

    // ===== GLOBAL ERRORS — Error reports across ALL tenants =====
    if (action === "global-errors") {
      const snap = await db.collection("error_reports").orderBy("createdAt", "desc").limit(100).get();

      const reports = snap.docs.map((d: any) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          createdAt: data.createdAt?._seconds
            ? new Date(data.createdAt._seconds * 1000).toISOString()
            : data.createdAt || null,
        };
      });

      // Group by message field for error frequency
      const groupMap: Record<string, { message: string; count: number; firstSeen: string | null; lastSeen: string | null; sampleIds: string[] }> = {};
      for (const report of reports) {
        const key = report.message || "(unknown error)";
        if (!groupMap[key]) {
          groupMap[key] = {
            message: key,
            count: 0,
            firstSeen: report.createdAt,
            lastSeen: report.createdAt,
            sampleIds: [],
          };
        }
        groupMap[key].count++;
        // Update firstSeen / lastSeen
        if (report.createdAt) {
          if (!groupMap[key].firstSeen || report.createdAt < groupMap[key].firstSeen!) {
            groupMap[key].firstSeen = report.createdAt;
          }
          if (!groupMap[key].lastSeen || report.createdAt > groupMap[key].lastSeen!) {
            groupMap[key].lastSeen = report.createdAt;
          }
        }
        if (groupMap[key].sampleIds.length < 5) {
          groupMap[key].sampleIds.push(report.id);
        }
      }

      const groups = Object.values(groupMap).sort((a, b) => b.count - a.count);

      return NextResponse.json({ groups, totalReports: reports.length });
    }

    // ===== GLOBAL FEEDBACK — Beta feedback across ALL tenants =====
    if (action === "global-feedback") {
      const snap = await db.collection("beta_feedback").orderBy("createdAt", "desc").limit(100).get();

      const items = snap.docs.map((d: any) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          createdAt: data.createdAt?._seconds
            ? new Date(data.createdAt._seconds * 1000).toISOString()
            : data.createdAt || null,
        };
      });

      // Compute category stats
      const categoryStats: Record<string, number> = {};
      for (const item of items) {
        const cat = item.category || "Sin categoría";
        categoryStats[cat] = (categoryStats[cat] || 0) + 1;
      }

      return NextResponse.json({ items, categoryStats });
    }

    // ===== RESOLVE ERROR GLOBAL — Mark error report as resolved =====
    if (action === "resolve-error-global") {
      const { errorId } = body;
      if (!errorId) return NextResponse.json({ error: "errorId requerido" }, { status: 400 });

      const doc = await db.collection("error_reports").doc(errorId).get();
      if (!doc.exists) return NextResponse.json({ error: "Error report no encontrado" }, { status: 404 });

      await db.collection("error_reports").doc(errorId).update({
        resolved: true,
        resolvedAt: FieldValue.serverTimestamp(),
        resolvedBy: user.uid,
      });

      return NextResponse.json({ resolved: true });
    }

    // ===== REVIEW FEEDBACK GLOBAL — Review feedback (global) =====
    if (action === "review-feedback-global") {
      const { feedbackId, status, adminNote } = body;
      if (!feedbackId) return NextResponse.json({ error: "feedbackId requerido" }, { status: 400 });

      const validStatuses = ["pending", "reviewed", "resolved"];
      if (!status || !validStatuses.includes(status)) {
        return NextResponse.json({ error: `status requerido. Valores válidos: ${validStatuses.join(", ")}` }, { status: 400 });
      }

      const doc = await db.collection("beta_feedback").doc(feedbackId).get();
      if (!doc.exists) return NextResponse.json({ error: "Feedback no encontrado" }, { status: 404 });

      const updates: Record<string, any> = {
        status,
        reviewedBy: user.uid,
        reviewedAt: FieldValue.serverTimestamp(),
      };
      if (adminNote !== undefined) {
        updates.adminNote = adminNote;
      }

      await db.collection("beta_feedback").doc(feedbackId).update(updates);

      return NextResponse.json({ reviewed: true });
    }

    // ===== GET FEATURE FLAGS =====
    if (action === "get-feature-flags") {
      // Try reading from Firestore config doc first
      const configDoc = await db.collection("_platform_config").doc("feature_flags").get();

      if (configDoc.exists) {
        const data = configDoc.data()!;
        // Firestore doc stores flags as { [key]: { enabled, description } }
        return NextResponse.json({ flags: data });
      }

      // Fallback to defaults from feature-flags module
      const allFlags = getAllFlags();
      const flags: Record<string, { enabled: boolean; description: string }> = {};
      for (const [key, val] of Object.entries(allFlags)) {
        flags[key] = {
          enabled: val.enabled,
          description: val.description,
        };
      }

      return NextResponse.json({ flags });
    }

    // ===== UPDATE FEATURE FLAG =====
    if (action === "update-feature-flag") {
      const { flagKey, enabled } = body;
      if (!flagKey || typeof flagKey !== "string") {
        return NextResponse.json({ error: "flagKey requerido (string)" }, { status: 400 });
      }
      if (typeof enabled !== "boolean") {
        return NextResponse.json({ error: "enabled requerido (boolean)" }, { status: 400 });
      }

      // Read existing doc or use defaults for description
      const configDoc = await db.collection("_platform_config").doc("feature_flags").get();
      let description = "";
      if (configDoc.exists && configDoc.data()?.[flagKey]?.description) {
        description = configDoc.data()![flagKey].description;
      } else {
        // Try to get description from FLAG_REGISTRY via getAllFlags
        const allFlags = getAllFlags();
        if (allFlags[flagKey]) {
          description = allFlags[flagKey].description;
        }
      }

      await db.collection("_platform_config").doc("feature_flags").set({
        [flagKey]: { enabled, description },
      }, { merge: true });

      invalidateCache();
      return NextResponse.json({ updated: true, flagKey, enabled });
    }

    // ===== HEALTH CHECK — Platform health check =====
    if (action === "health-check") {
      const checks: {
        adminSdk: boolean;
        auth: boolean;
        firestoreRead: boolean;
        firestoreWrite: boolean;
        totalTenants: number;
        totalUsers: number;
        totalProjects: number;
      } = {
        adminSdk: false,
        auth: false,
        firestoreRead: false,
        firestoreWrite: false,
        totalTenants: 0,
        totalUsers: 0,
        totalProjects: 0,
      };

      // 1. Verify Firebase Admin SDK initialization
      try {
        const initCheck = isAdminInitialized();
        checks.adminSdk = initCheck.ok;
      } catch {
        checks.adminSdk = false;
      }

      // 2. Verify Auth token verification works
      try {
        const adminAuth = getAdminAuth();
        // Just listing 1 user is enough to verify the Auth service is reachable
        await adminAuth.listUsers(1);
        checks.auth = true;
      } catch {
        checks.auth = false;
      }

      // 3. Test Firestore read (try reading a non-existent doc)
      try {
        await db.collection("_platform_config").doc("__health_check_read__").get();
        checks.firestoreRead = true;
      } catch {
        checks.firestoreRead = false;
      }

      // 4. Test Firestore write + delete
      try {
        const healthRef = db.collection("_platform_config").doc("health_check");
        await healthRef.set({
          timestamp: FieldValue.serverTimestamp(),
          checkedBy: user.uid,
        });
        await healthRef.delete();
        checks.firestoreWrite = true;
      } catch {
        checks.firestoreWrite = false;
      }

      // 5. Count total docs in key collections using efficient .count() aggregation
      try {
        const [tenantsCount, usersCount, projectsCount] = await Promise.all([
          db.collection("tenants").count().get().then((s: any) => s.data().count).catch(() => 0),
          db.collection("users").count().get().then((s: any) => s.data().count).catch(() => 0),
          db.collection("projects").count().get().then((s: any) => s.data().count).catch(() => 0),
        ]);
        checks.totalTenants = tenantsCount;
        checks.totalUsers = usersCount;
        checks.totalProjects = projectsCount;
      } catch {
        // Keep zeros
      }

      // Determine overall status
      const criticalChecks = [checks.adminSdk, checks.firestoreRead, checks.firestoreWrite];
      const allCritical = criticalChecks.every(Boolean);
      const anyCritical = criticalChecks.some(Boolean);

      let status: "healthy" | "degraded" | "down";
      if (allCritical) {
        status = checks.auth ? "healthy" : "degraded";
      } else if (anyCritical) {
        status = "degraded";
      } else {
        status = "down";
      }

      return NextResponse.json({ status, checks });
    }

    return NextResponse.json({ error: "Acción no reconocida" }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error interno";
    console.error("[SuperAdmin] Error:", message);

    // Detect quota exhaustion
    if (message.includes("RESOURCE_EXHAUSTED") || message.includes("quota exceeded")) {
      return NextResponse.json({
        error: "Cuota de Firebase excedida. Las operaciones de lectura se han limitado. Intente de nuevo más tarde o contacte al administrador."
      }, { status: 429 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
