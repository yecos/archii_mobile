import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/api-auth";
import { getAdminDb, getAdminFieldValue } from "@/lib/firebase-admin";

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
  ];

  if (!action || !validActions.includes(action)) {
    return NextResponse.json({ error: `Acción inválida. Usa: ${validActions.join(", ")}` }, { status: 400 });
  }

  try {
    const db = getAdminDb();
    const FieldValue = getAdminFieldValue();

    // ===== DASHBOARD — Global Stats =====
    if (action === "dashboard") {
      const [tenantsSnap, usersSnap, projectsSnap] = await Promise.all([
        db.collection("tenants").get(),
        db.collection("users").get(),
        db.collection("projects").get(),
      ]);

      const totalTenants = tenantsSnap.size;
      const totalUsers = usersSnap.size;
      const totalProjects = projectsSnap.size;

      // Count tasks, expenses, etc. with collection counts
      const [tasksSnap, expensesSnap, meetingsSnap] = await Promise.all([
        db.collection("tasks").get(),
        db.collection("expenses").get(),
        db.collection("meetings").get(),
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

      return NextResponse.json({
        totalTenants,
        totalUsers,
        totalProjects,
        totalTasks: tasksSnap.size,
        totalExpenses: expensesSnap.size,
        totalMeetings: meetingsSnap.size,
        tenantSummaries,
        orphanUsersCount: orphanUsers.length,
        orphanUsers: orphanUsers.map((d: any) => ({
          uid: d.id,
          name: d.data()?.name || "Sin nombre",
          email: d.data()?.email || "",
          role: d.data()?.role || "Miembro",
        })),
      });
    }

    // ===== LIST TENANTS =====
    if (action === "list-tenants") {
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

      const tenants = [];
      for (const doc of snap.docs) {
        const data = doc.data();
        const membersResolved: any[] = [];

        for (const uid of (data.members || [])) {
          const uData = userMap[uid];
          membersResolved.push({
            uid,
            name: uData?.name || "Desconocido",
            email: uData?.email || "N/A",
            role: uData?.role || "Miembro",
            photoURL: uData?.photoURL || "",
            isCreator: uid === data.createdBy,
          });
        }

        // Count tenant documents
        let projectCount = 0;
        let taskCount = 0;
        try {
          const [pSnap, tSnap] = await Promise.all([
            db.collection("projects").where("tenantId", "==", doc.id).count().get(),
            db.collection("tasks").where("tenantId", "==", doc.id).count().get(),
          ]);
          projectCount = pSnap.data().count;
          taskCount = tSnap.data().count;
        } catch (e) {
          // Fallback: use .get() if .count() not supported
          try {
            const [pSnap2, tSnap2] = await Promise.all([
              db.collection("projects").where("tenantId", "==", doc.id).get(),
              db.collection("tasks").where("tenantId", "==", doc.id).get(),
            ]);
            projectCount = pSnap2.size;
            taskCount = tSnap2.size;
          } catch (e2) { /* skip */ }
        }

        tenants.push({
          id: doc.id,
          name: data.name || "Sin nombre",
          code: data.code || "",
          members: data.members || [],
          membersResolved,
          createdBy: data.createdBy || "",
          createdAt: data.createdAt?._seconds ? new Date(data.createdAt._seconds * 1000).toISOString() : null,
          projectCount,
          taskCount,
          memberCount: membersResolved.length,
        });
      }

      return NextResponse.json({ tenants });
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
      return NextResponse.json({ updated: true, ...updates });
    }

    // ===== TENANT DETAIL =====
    if (action === "tenant-detail") {
      const { tenantId } = body;
      if (!tenantId) return NextResponse.json({ error: "tenantId requerido" }, { status: 400 });

      const tenantDoc = await db.collection("tenants").doc(tenantId).get();
      if (!tenantDoc.exists) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });

      const data = tenantDoc.data()!;
      const membersResolved: any[] = [];
      for (const uid of (data.members || [])) {
        const uDoc = await db.collection("users").doc(uid).get();
        membersResolved.push({
          uid,
          name: uDoc.exists ? uDoc.data()?.name : "Desconocido",
          email: uDoc.exists ? uDoc.data()?.email : "N/A",
          role: uDoc.exists ? uDoc.data()?.role : "Miembro",
          photoURL: uDoc.exists ? uDoc.data()?.photoURL || "" : "",
          isCreator: uid === data.createdBy,
        });
      }

      // Get all collections counts for this tenant
      const colNames = ["projects", "tasks", "expenses", "suppliers", "companies", "meetings", "galleryPhotos", "invProducts", "invCategories", "invMovements", "invTransfers", "timeEntries", "invoices", "comments"];
      const collectionStats: Record<string, number> = {};
      for (const col of colNames) {
        try {
          const snap = await db.collection(col).where("tenantId", "==", tenantId).count().get();
          collectionStats[col] = snap.data().count;
        } catch {
          try {
            const snap = await db.collection(col).where("tenantId", "==", tenantId).limit(1).get();
            collectionStats[col] = snap.size;
          } catch {
            collectionStats[col] = 0;
          }
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
      const usersSnap = await db.collection("users").orderBy("createdAt", "desc").get();

      // Get all tenants to cross-reference
      const tenantsSnap = await db.collection("tenants").get();
      const userTenantMap: Record<string, { tenantId: string; tenantName: string; role: string }[]> = {};

      for (const doc of tenantsSnap.docs) {
        const data = doc.data()!;
        for (const uid of (data.members || [])) {
          if (!userTenantMap[uid]) userTenantMap[uid] = [];
          userTenantMap[uid].push({
            tenantId: doc.id,
            tenantName: data.name || "Sin nombre",
            role: uid === data.createdBy ? "Super Admin" : "Miembro",
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

      return NextResponse.json({ users });
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

      return NextResponse.json({ transferred: true, tenantName: tenantData.name, newOwnerUid });
    }

    // ===== TENANT STATS =====
    if (action === "tenant-stats") {
      const { tenantId } = body;
      if (!tenantId) return NextResponse.json({ error: "tenantId requerido" }, { status: 400 });

      const colNames = ["projects", "tasks", "expenses", "suppliers", "companies", "meetings", "galleryPhotos", "invProducts", "invCategories", "invMovements", "invTransfers", "timeEntries", "invoices", "comments", "generalMessages"];
      const stats: Record<string, number> = {};
      const recentActivity: any[] = [];

      for (const col of colNames) {
        try {
          const snap = await db.collection(col).where("tenantId", "==", tenantId).orderBy("createdAt", "desc").limit(1).get();
          stats[col] = snap.size > 0 ? 1 : 0; // Using limit(1) to check existence
        } catch {
          stats[col] = 0;
        }
      }

      // Get actual counts for main collections
      try {
        const [pSnap, tSnap, eSnap] = await Promise.all([
          db.collection("projects").where("tenantId", "==", tenantId).count().get(),
          db.collection("tasks").where("tenantId", "==", tenantId).count().get(),
          db.collection("expenses").where("tenantId", "==", tenantId).count().get(),
        ]);
        stats.projects = pSnap.data().count;
        stats.tasks = tSnap.data().count;
        stats.expenses = eSnap.data().count;
      } catch {
        try {
          const [pSnap, tSnap, eSnap] = await Promise.all([
            db.collection("projects").where("tenantId", "==", tenantId).get(),
            db.collection("tasks").where("tenantId", "==", tenantId).get(),
            db.collection("expenses").where("tenantId", "==", tenantId).get(),
          ]);
          stats.projects = pSnap.size;
          stats.tasks = tSnap.size;
          stats.expenses = eSnap.size;
        } catch { /* skip */ }
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
        for (const uid of targetIds) {
          try {
            await db.collection("users").doc(uid).delete();
            results.push({ uid, success: true });
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

      return NextResponse.json({ type, processed: results.length, succeeded: results.filter((r: any) => r.success).length, failed: results.filter((r: any) => !r.success).length, results });
    }

    return NextResponse.json({ error: "Acción no reconocida" }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error interno";
    console.error("[SuperAdmin] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
