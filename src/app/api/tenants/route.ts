import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { getAdminDb, getAdminFieldValue } from "@/lib/firebase-admin";

/**
 * POST /api/tenants
 *
 * Gestión de tenants (espacios de trabajo) para multi-tenancy.
 * Flujo:
 *   1. Login/Register (Firebase Auth)
 *   2. Pantalla de Tenant:
 *      - Si NO tiene tenants → Crear uno (se convierte en Super Admin)
 *      - Si tiene 1 tenant → Auto-seleccionar
 *      - Si tiene varios → Mostrar selector
 *      - Si lo invitan con código → Entra como Miembro
 *
 * Operaciones:
 *   - create: Crear un nuevo tenant (creador = Super Admin)
 *   - join: Unirse a un tenant por código (entra como Miembro)
 *   - list: Listar los tenants del usuario con su rol
 */

function generateCode(): string {
  // SEC-H07: Increased from 6 to 10 characters for stronger invite codes (~60 bits of entropy)
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 10; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function ensureUniqueCode(db: any): Promise<string> {
  let code = generateCode();
  let attempts = 0;
  while (attempts < 20) {
    const snap = await db.collection("tenants").where("code", "==", code).limit(1).get();
    if (snap.empty) return code;
    code = generateCode();
    attempts++;
  }
  return code;
}

// SEC-H07: Rate limiting for join attempts (max 5 per user per 15 minutes)
const joinRateLimits = new Map<string, { count: number; resetAt: number }>();
// Clean up expired entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of joinRateLimits) {
    if (entry.resetAt <= now) joinRateLimits.delete(key);
  }
}, 10 * 60 * 1000);

/**
 * Migrate existing unassigned data to a new tenant.
 * Updates all documents in the collections that either:
 * - Don't have a 'tenantId' field
 * - Have 'tenantId' set to null or empty string
 *
 * Each collection may use different field names for the user reference:
 * - Most use 'createdBy'
 * - Comments and messages use 'userId'
 *
 * This is used when creating a new tenant and the user wants to
 * assign their existing data to the new tenant for isolation.
 */
async function migrateExistingData(
  db: any,
  tenantId: string,
  userId: string
): Promise<Record<string, number>> {
  // Mapping: collection name -> possible user reference field names
  const collectionConfig: Record<string, string[]> = {
    'projects': ['createdBy'],
    'tasks': ['createdBy'],
    'expenses': ['createdBy'],
    'suppliers': ['createdBy'],
    'companies': ['createdBy'],
    'meetings': ['createdBy'],
    'galleryPhotos': ['createdBy'],
    'invProducts': ['createdBy'],
    'invCategories': ['createdBy'],
    'invMovements': ['createdBy'],
    'invTransfers': ['createdBy'],
    'timeEntries': ['createdBy'],
    'invoices': ['createdBy', 'userId'],
    'comments': ['userId'],
    'generalMessages': ['userId', 'senderId'],
  };

  const counts: Record<string, number> = {};
  let totalMigrated = 0;

  for (const [collectionName, userFields] of Object.entries(collectionConfig)) {
    try {
      let migrated = 0;
      let batch = db.batch();
      let batchCount = 0;

      // Try each user field until we find documents
      for (const userField of userFields) {
        try {
          const snap = await db.collection(collectionName)
            .where(userField, '==', userId)
            .limit(500)
            .get();

          for (const doc of snap.docs) {
            const data = doc.data();
            const currentTenantId = data.tenantId;
            // Only migrate if not already assigned to a tenant
            if (!currentTenantId || currentTenantId === '' || currentTenantId === null) {
              batch.update(doc.ref, { tenantId });
              batchCount++;
              migrated++;

              if (batchCount >= 450) {
                await batch.commit();
                batch = db.batch();
                batchCount = 0;
              }
            }
          }

          // If we found documents with this field, no need to try other fields
          if (!snap.empty) break;
        } catch (queryErr: any) {
          // If the field doesn't exist in the collection, the query will fail
          // Skip to the next user field
          console.warn(`[Tenants] Query on ${collectionName}.${userField} failed:`, queryErr.message);
          continue;
        }
      }

      // Commit remaining
      if (batchCount > 0) {
        await batch.commit();
      }

      if (migrated > 0) {
        counts[collectionName] = migrated;
        totalMigrated += migrated;
      }
    } catch (err) {
      console.error(`[Tenants] Error migrating ${collectionName}:`, err);
      counts[collectionName] = -1; // Error marker
    }
  }

  return counts;
}

export async function POST(request: NextRequest) {
  // Auth check first (reads Authorization header, not body)
  let user: any;
  try {
    user = await requireAuth(request);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Error de autenticación" }, { status: 401 });
  }

  // Read body ONCE — request.json() can only be called once
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { action, name, code, tenantId, emails, memberUid, email } = body;

  if (!action || !["create", "join", "list", "add-members", "remove-member", "delete-member", "get-members", "add-all-users", "set-super-admin"].includes(action)) {
    return NextResponse.json({ error: "Acción inválida. Usa: create, join, list, add-members, remove-member, delete-member, get-members, add-all-users, set-super-admin" }, { status: 400 });
  }

  try {
    const db = getAdminDb();
    const FieldValue = getAdminFieldValue();

    if (action === "list") {
      // List tenants where user is a member, with their role in each tenant
      const snap = await db.collection("tenants").where("members", "array-contains", user.uid).get();
      const tenants = snap.docs.map((d: any) => {
        const data = d.data();
        // Determine user's role: Super Admin if they created it, Miembro otherwise
        const isCreator = data.createdBy === user.uid;
        const isSuperAdmin = isCreator || (data.superAdmins || []).includes(user.uid);
        return {
          id: d.id,
          name: data.name || '',
          code: data.code || '',
          members: data.members || [],
          createdBy: data.createdBy || '',
          superAdmins: data.superAdmins || [],
          createdAt: data.createdAt || null,
          role: isSuperAdmin ? 'Super Admin' : 'Miembro',
        };
      });

      // Auto-fix: if user is Super Admin in any tenant, ensure defaultTenantRole is correct
      // This fixes the case where defaultTenantRole was incorrectly saved as "Miembro"
      const userDoc = await db.collection("users").doc(user.uid).get();
      if (userDoc.exists) {
        const userData = userDoc.data()!;
        const isSAInAnyTenant = tenants.some((t: any) => t.role === 'Super Admin');
        if (isSAInAnyTenant && (userData.defaultTenantRole || 'Miembro') !== 'Super Admin') {
          // Check if the default tenant is one where they're SA
          const defaultTenant = tenants.find((t: any) => t.id === userData.defaultTenantId);
          if (defaultTenant && defaultTenant.role === 'Super Admin') {
            await db.collection("users").doc(user.uid).update({ defaultTenantRole: "Super Admin" });

          }
        }
      }

      return NextResponse.json({ tenants });
    }

    if (action === "create") {
      if (!name || typeof name !== "string" || name.trim().length < 2) {
        return NextResponse.json({ error: "El nombre debe tener al menos 2 caracteres" }, { status: 400 });
      }

      const migrateExisting = body.migrateExisting === true;
      const tenantCode = await ensureUniqueCode(db);
      const tenantRef = await db.collection("tenants").add({
        name: name.trim(),
        code: tenantCode,
        members: [user.uid],
        createdBy: user.uid,
        createdAt: FieldValue.serverTimestamp(),
      });

      // Migrate existing unassigned data to this new tenant
      let migratedCounts: Record<string, number> | null = null;
      if (migrateExisting) {
        migratedCounts = await migrateExistingData(db, tenantRef.id, user.uid);
      }

      return NextResponse.json({
        tenantId: tenantRef.id,
        name: name.trim(),
        code: tenantCode,
        role: 'Super Admin', // Creator is always Super Admin
        migratedCounts,
      });
    }

    if (action === "join") {
      // SEC-H07: Rate limiting on join attempts (max 5 per user per 15 minutes)
      const joinRateKey = `join_${user.uid}`;
      const now = Date.now();
      const rateEntry = joinRateLimits.get(joinRateKey);
      if (rateEntry && rateEntry.resetAt > now && rateEntry.count >= 5) {
        return NextResponse.json({ error: "Demasiados intentos de union. Intenta de nuevo en 15 minutos." }, { status: 429 });
      }
      if (!rateEntry || rateEntry.resetAt <= now) {
        joinRateLimits.set(joinRateKey, { count: 1, resetAt: now + 15 * 60 * 1000 });
      } else {
        rateEntry.count++;
      }

      if (!code || typeof code !== "string") {
        return NextResponse.json({ error: "Código requerido" }, { status: 400 });
      }

      const snap = await db.collection("tenants").where("code", "==", code.trim().toUpperCase()).limit(1).get();

      if (snap.empty) {
        return NextResponse.json({ error: "Código no encontrado. Verifica e intenta de nuevo." }, { status: 404 });
      }

      const tenantDoc = snap.docs[0];
      const tenantData = tenantDoc.data();
      const tenantId = tenantDoc.id;
      const isCreator = tenantData.createdBy === user.uid;
      const isSuperAdmin = isCreator || (tenantData.superAdmins || []).includes(user.uid);

      if (tenantData.members && tenantData.members.includes(user.uid)) {
        return NextResponse.json({
          tenantId,
          name: tenantData.name,
          code: tenantData.code,
          role: isSuperAdmin ? 'Super Admin' : 'Miembro',
          alreadyMember: true,
        });
      }

      // Add user to members array (joins as Miembro)
      await db.collection("tenants").doc(tenantId).update({
        members: FieldValue.arrayUnion(user.uid),
      });

      return NextResponse.json({
        tenantId,
        name: tenantData.name,
        code: tenantData.code,
        role: 'Miembro', // Joined users are always Miembro
      });
    }

    // ===== ADD MEMBERS =====
    if (action === "add-members") {
      if (!tenantId || !Array.isArray(emails) || emails.length === 0) {
        return NextResponse.json({ error: "Faltan tenantId o emails" }, { status: 400 });
      }

      const tenantDoc = await db.collection("tenants").doc(tenantId).get();
      if (!tenantDoc.exists) {
        return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
      }
      const tenantData = tenantDoc.data()!;
      const isSuperAdminAdd = tenantData.createdBy === user.uid || (tenantData.superAdmins || []).includes(user.uid);
      if (!isSuperAdminAdd) {
        return NextResponse.json({ error: "Solo el Super Admin puede agregar miembros" }, { status: 403 });
      }

      const uidsToAdd: string[] = [];
      const notFound: string[] = [];
      const alreadyMembers: string[] = [];
      const currentMembers: string[] = tenantData.members || [];

      for (const email of emails) {
        const snap = await db.collection("users").where("email", "==", email.trim().toLowerCase()).limit(1).get();
        if (snap.empty) {
          notFound.push(email);
          continue;
        }
        const uid = snap.docs[0].id;
        if (currentMembers.includes(uid)) {
          alreadyMembers.push(email);
        } else {
          uidsToAdd.push(uid);
        }
      }

      if (uidsToAdd.length > 0) {
        await db.collection("tenants").doc(tenantId).update({
          members: FieldValue.arrayUnion(...uidsToAdd),
        });
      }

      return NextResponse.json({
        tenantName: tenantData.name,
        added: uidsToAdd.length,
        notFound,
        alreadyMembers,
        totalMembers: currentMembers.length + uidsToAdd.length,
      });
    }

    // ===== ADD ALL EXISTING USERS =====
    if (action === "add-all-users") {
      if (!tenantId) {
        return NextResponse.json({ error: "Faltan tenantId" }, { status: 400 });
      }

      const tenantDoc = await db.collection("tenants").doc(tenantId).get();
      if (!tenantDoc.exists) {
        return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
      }
      const tenantData = tenantDoc.data()!;
      // Require Super Admin to add all users
      const isSuperAdminCheck = tenantData.createdBy === user.uid || (tenantData.superAdmins || []).includes(user.uid);
      if (!isSuperAdminCheck) {
        return NextResponse.json({ error: "Solo el Super Admin puede agregar todos los usuarios" }, { status: 403 });
      }

      const currentMembers: string[] = tenantData.members || [];

      // Get all users (from both Firestore users collection and ensure all auth users have docs)
      const usersSnap = await db.collection("users").get();
      const allUids = usersSnap.docs.map(d => d.id);
      const uidsToAdd = allUids.filter(uid => !currentMembers.includes(uid));

      // Also get Firebase Auth users that might not have a users/ doc yet
      try {
        const { getAdminAuth } = await import("@/lib/firebase-admin");
        const adminAuth = getAdminAuth();
        let pageToken: string | undefined;
        do {
          const listResult = await adminAuth.listUsers(1000, pageToken);
          for (const authUser of listResult.users) {
            if (!allUids.includes(authUser.uid) && !currentMembers.includes(authUser.uid)) {
              uidsToAdd.push(authUser.uid);
              // Create missing users/ document
              const { getAdminFieldValue } = await import("@/lib/firebase-admin");
              const fValue = getAdminFieldValue();
              await db.collection("users").doc(authUser.uid).set({
                name: authUser.displayName || (authUser.email || '').split('@')[0],
                email: authUser.email || '',
                photoURL: authUser.photoURL || '',
                role: 'Miembro',
                createdAt: fValue.serverTimestamp(),
              });
            }
          }
          pageToken = listResult.pageToken;
        } while (pageToken);
      } catch (err: any) {
        console.warn('[Tenants] listUsers failed, using only Firestore users:', err.message);
      }

      if (uidsToAdd.length > 0) {
        await db.collection("tenants").doc(tenantId).update({
          members: FieldValue.arrayUnion(...uidsToAdd),
        });
      }

      return NextResponse.json({
        tenantName: tenantData.name,
        totalUsers: allUids.length,
        alreadyMembers: currentMembers.length,
        added: uidsToAdd.length,
        newTotalMembers: currentMembers.length + uidsToAdd.length,
      });
    }

    // ===== REMOVE MEMBER =====
    if (action === "remove-member") {
      if (!tenantId || !memberUid) {
        return NextResponse.json({ error: "Faltan tenantId o memberUid" }, { status: 400 });
      }

      const tenantDoc = await db.collection("tenants").doc(tenantId).get();
      if (!tenantDoc.exists) {
        return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
      }
      const tenantData = tenantDoc.data()!;
      const isCreatorCheck = tenantData.createdBy === user.uid;
      const isInSuperAdmins = (tenantData.superAdmins || []).includes(user.uid);
      const isSuperAdmin = isCreatorCheck || isInSuperAdmins;
      if (!isSuperAdmin) {
        return NextResponse.json({ error: "Solo el creador o Super Admin puede eliminar miembros" }, { status: 403 });
      }
      if (memberUid === user.uid) {
        return NextResponse.json({ error: "No puedes eliminarte a ti mismo" }, { status: 400 });
      }
      // Un Super Admin no puede eliminar al creador
      if (tenantData.createdBy === memberUid) {
        return NextResponse.json({ error: "No puedes eliminar al creador del tenant" }, { status: 400 });
      }

      // Check that member is actually in the members array
      const currentMembers: string[] = tenantData.members || [];
      if (!currentMembers.includes(memberUid)) {
        // Maybe they're a super admin but not in members — just skip silently

        // Also remove from superAdmins if present
        const updates: any = {};
        if ((tenantData.superAdmins || []).includes(memberUid)) {
          updates.superAdmins = FieldValue.arrayRemove(memberUid);
        }
        if (Object.keys(updates).length > 0) {
          await db.collection("tenants").doc(tenantId).update(updates);
        }
        return NextResponse.json({
          tenantName: tenantData.name,
          removed: memberUid,
          totalMembers: currentMembers.length,
          note: 'Usuario no estaba en members, removido de superAdmins si aplicaba',
        });
      }

      await db.collection("tenants").doc(tenantId).update({
        members: FieldValue.arrayRemove(memberUid),
      });

      return NextResponse.json({
        tenantName: tenantData.name,
        removed: memberUid,
        totalMembers: (tenantData.members || []).length - 1,
      });
    }

    // ===== DELETE MEMBER (remove from tenant + delete user doc) =====
    if (action === "delete-member") {
      if (!tenantId || !memberUid) {
        return NextResponse.json({ error: "Faltan tenantId o memberUid" }, { status: 400 });
      }



      const tenantDoc = await db.collection("tenants").doc(tenantId).get();
      if (!tenantDoc.exists) {
        return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
      }
      const tenantData = tenantDoc.data()!;

      // Permission check: must be creator, Super Admin, or Admin/Director role
      const isCreatorCheck = tenantData.createdBy === user.uid;
      const isInSuperAdmins = (tenantData.superAdmins || []).includes(user.uid);
      const isSuperAdmin = isCreatorCheck || isInSuperAdmins;

      // Also check if caller has Admin or Director role in the users collection
      const callerDoc = await db.collection("users").doc(user.uid).get();
      const callerRole = callerDoc.exists ? callerDoc.data()?.role || 'Miembro' : 'Miembro';
      const callerIsAdminOrDirector = callerRole === 'Admin' || callerRole === 'Director';

      if (!isSuperAdmin && !callerIsAdminOrDirector) {
        return NextResponse.json({ error: "Solo Admin, Director o Super Admin pueden eliminar miembros" }, { status: 403 });
      }
      if (memberUid === user.uid) {
        return NextResponse.json({ error: "No puedes eliminarte a ti mismo" }, { status: 400 });
      }
      if (tenantData.createdBy === memberUid) {
        return NextResponse.json({ error: "No puedes eliminar al creador del tenant" }, { status: 400 });
      }

      const currentMembers: string[] = tenantData.members || [];

      // 1. Remove from tenant members array
      const tenantUpdates: any = {};
      if (currentMembers.includes(memberUid)) {
        tenantUpdates.members = FieldValue.arrayRemove(memberUid);
      }
      // Also remove from superAdmins if present
      if ((tenantData.superAdmins || []).includes(memberUid)) {
        tenantUpdates.superAdmins = FieldValue.arrayRemove(memberUid);
      }

      if (Object.keys(tenantUpdates).length > 0) {
        await db.collection("tenants").doc(tenantId).update(tenantUpdates);
      }

      // 2. Delete the user document from Firestore (Admin SDK bypasses rules)
      try {
        const memberDoc = await db.collection("users").doc(memberUid).get();
        if (memberDoc.exists) {
          await db.collection("users").doc(memberUid).delete();

        }
      } catch (err: any) {
        console.warn(`[Tenants] delete-member: could not delete user doc ${memberUid}:`, err.message);
        // Non-critical — member was removed from tenant, user doc deletion is best-effort
      }

      // 3. Unassign tasks that were assigned to this user
      try {
        const tasksSnap = await db.collection("tasks").where("assigneeId", "==", memberUid).where("tenantId", "==", tenantId).limit(500).get();
        if (!tasksSnap.empty) {
          const batch = db.batch();
          for (const doc of tasksSnap.docs) {
            batch.update(doc.ref, { assigneeId: null });
          }
          await batch.commit();

        }
      } catch (err: any) {
        console.warn(`[Tenants] delete-member: could not unassign tasks:`, err.message);
      }

      return NextResponse.json({
        tenantName: tenantData.name,
        removed: memberUid,
        totalMembers: (tenantData.members || []).length - 1,
      });
    }

    // ===== SET SUPER ADMIN =====
    // Accepts: { action: 'set-super-admin', tenantId, email } OR { ..., memberUid }
    // If email is provided, it searches by email (handles duplicates by picking the one with name)
    if (action === "set-super-admin") {
      if (!tenantId) {
        return NextResponse.json({ error: "Falta tenantId" }, { status: 400 });
      }

      const tenantDoc = await db.collection("tenants").doc(tenantId).get();
      if (!tenantDoc.exists) {
        return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
      }
      const tenantData = tenantDoc.data()!;
      // Check if user is Super Admin of THIS tenant only (prevent cross-tenant escalation)
      const isCurrentSuperAdmin = tenantData.createdBy === user.uid || (tenantData.superAdmins || []).includes(user.uid);
      if (!isCurrentSuperAdmin) {
        return NextResponse.json({ error: "Solo un Super Admin puede designar otro Super Admin" }, { status: 403 });
      }

      // Resolve target UID: by memberUid directly, or search by email
      let targetUid = memberUid || '';
      let targetName = '';

      if (email && !memberUid) {
        // Search users by email (case-insensitive)
        const normalizedEmail = email.trim().toLowerCase();
        const usersByMail = await db.collection('users')
          .where('email', '==', normalizedEmail)
          .get();

        if (usersByMail.empty) {
          // Try partial match (contains)
          const allUsers = await db.collection('users').get();
          const matches: any[] = [];
          for (const doc of allUsers.docs) {
            const data = doc.data();
            if (data.email && data.email.toLowerCase().includes(normalizedEmail)) {
              matches.push({ uid: doc.id, name: data.name, email: data.email });
            }
            // Also search by name (Juan Mateo Yepes Correa)
            if (data.name && data.name.toLowerCase().includes(email.toLowerCase())) {
              matches.push({ uid: doc.id, name: data.name, email: data.email });
            }
          }
          if (matches.length === 0) {
            return NextResponse.json({ error: `No se encontró usuario con email/nombre "${email}"` }, { status: 404 });
          }
          // Pick the one with a real name (not just email prefix)
          const withName = matches.filter(m => m.name && m.name.length > 3 && !m.name.includes('@'));
          const picked = withName.length > 0 ? withName[0] : matches[0];
          targetUid = picked.uid;
          targetName = picked.name || picked.email;
        } else if (usersByMail.docs.length === 1) {
          targetUid = usersByMail.docs[0].id;
          targetName = usersByMail.docs[0].data()?.name || normalizedEmail;
        } else {
          // Multiple docs with same email (duplicates) — pick the one with a real name
          let picked = usersByMail.docs[0];
          for (const doc of usersByMail.docs) {
            const d = doc.data();
            if (d.name && d.name.length > 3 && !d.name.includes('@')) {
              picked = doc;
              break;
            }
          }
          targetUid = picked.id;
          targetName = picked.data()?.name || normalizedEmail;
          // Report duplicates
          console.warn(`[Tenants] Duplicates found for ${normalizedEmail}: ${usersByMail.docs.length} docs. Using UID: ${targetUid}`);
        }
      }

      if (!targetUid) {
        return NextResponse.json({ error: "Falta memberUid o email" }, { status: 400 });
      }

      // Already creator = already Super Admin
      if (targetUid === tenantData.createdBy) {
        return NextResponse.json({
          success: true,
          alreadySuperAdmin: true,
          message: `${targetName || targetUid} ya es Super Admin (creador del espacio)`,
        });
      }

      // Add to superAdmins array
      await db.collection("tenants").doc(tenantId).update({
        superAdmins: FieldValue.arrayUnion(targetUid),
      });

      // Also ensure they are in members
      if (!(tenantData.members || []).includes(targetUid)) {
        await db.collection("tenants").doc(tenantId).update({
          members: FieldValue.arrayUnion(targetUid),
        });
      }

      // Get the user's name for the response (if not already resolved)
      if (!targetName) {
        const targetUserDoc = await db.collection("users").doc(targetUid).get();
        targetName = targetUserDoc.exists ? (targetUserDoc.data()?.name || '') : targetUid;
      }

      return NextResponse.json({
        success: true,
        tenantName: tenantData.name,
        userName: targetName,
        userId: targetUid,
        message: `${targetName} es ahora Super Admin de "${tenantData.name}"`,
      });
    }

    // ===== GET MEMBERS =====
    if (action === "get-members") {
      if (!tenantId) {
        return NextResponse.json({ error: "Faltan tenantId" }, { status: 400 });
      }

      const tenantDoc = await db.collection("tenants").doc(tenantId).get();
      if (!tenantDoc.exists) {
        return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
      }
      const tenantData = tenantDoc.data()!;
      // Verify caller is a member of this tenant
      const isMemberCheck = (tenantData.members || []).includes(user.uid) || tenantData.createdBy === user.uid || (tenantData.superAdmins || []).includes(user.uid);
      if (!isMemberCheck) {
        return NextResponse.json({ error: "No eres miembro de este tenant" }, { status: 403 });
      }
      const members: any[] = [];
      const memberUids: string[] = tenantData.members || [];

      // Auto-generate invite code if tenant doesn't have one (legacy tenants)
      if (!tenantData.code) {
        const newCode = await ensureUniqueCode(db);
        await db.collection("tenants").doc(tenantId).update({ code: newCode });
        tenantData.code = newCode;

      }

      for (const uid of memberUids) {
        const uDoc = await db.collection("users").doc(uid).get();
        members.push({
          uid,
          name: uDoc.exists ? uDoc.data()?.name : "Desconocido",
          email: uDoc.exists ? uDoc.data()?.email : "N/A",
          photoURL: uDoc.exists ? uDoc.data()?.photoURL || '' : '',
          isCreator: uid === tenantData.createdBy,
        });
      }

      // Also get users NOT in this tenant (available to add)
      const allUsersSnap = await db.collection("users").get();
      const availableUsers: any[] = [];
      for (const doc of allUsersSnap.docs) {
        if (!memberUids.includes(doc.id)) {
          availableUsers.push({
            uid: doc.id,
            name: doc.data()?.name || "Sin nombre",
            email: doc.data()?.email || "",
          });
        }
      }

      return NextResponse.json({
        tenantName: tenantData.name,
        tenantCode: tenantData.code,
        createdBy: tenantData.createdBy,
        members,
        availableUsers,
      });
    }

    return NextResponse.json({ error: "Acción no reconocida" }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error interno";
    console.error("[Tenants] Error:", message);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
