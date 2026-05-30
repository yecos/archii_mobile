import type { Firestore } from "firebase-admin/firestore";
import type { FirestoreDoc } from "./types";
import { findProjectByName } from "./helpers";

/**
 * Resolve a project by ID or name within a tenant.
 * Returns { projectId, projectName } or throws with a user-friendly message.
 */
export async function resolveProjectId(
  db: Firestore,
  tenantId: string,
  args: { project_id?: string; project_name?: string }
): Promise<{ projectId: string; projectName: string }> {
  // If project_id is provided, use it directly
  if (args.project_id) {
    const doc = await db.collection("projects").doc(args.project_id).get();
    if (!doc.exists) throw new Error(`Proyecto con ID "${args.project_id}" no encontrado.`);
    return { projectId: args.project_id, projectName: (doc.data() as Record<string, any>)?.name || args.project_id };
  }
  // If project_name is provided, search by name
  if (args.project_name) {
    const snap = await db.collection("projects").where("tenantId", "==", tenantId).orderBy("createdAt", "desc").limit(20).get();
    const projects: FirestoreDoc[] = snap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
    const found = findProjectByName(projects, args.project_name);
    if (!found) throw new Error(`No se encontró un proyecto llamado "${args.project_name}". Proyectos disponibles: ${projects.map(p => p.data.name).join(", ")}`);
    return { projectId: found.id, projectName: found.data.name };
  }
  throw new Error("Se requiere project_id o project_name para identificar el proyecto.");
}

/**
 * Resolve a user by name within a tenant.
 * Returns { userId, userName } or null if not found.
 */
export async function resolveUserByName(
  db: Firestore,
  tenantId: string,
  name?: string
): Promise<{ userId: string; userName: string } | null> {
  if (!name) return null;
  const tenantDoc = await db.collection("tenants").doc(tenantId).get();
  const memberIds: string[] = (tenantDoc.data() as Record<string, any>)?.members || [];
  const users = await Promise.all(
    memberIds.map(async (uid: string) => {
      const uDoc = await db.collection("users").doc(uid).get();
      return { id: uid, data: uDoc.data() || {} };
    })
  );
  const lower = name.toLowerCase();
  const found = users.find(u =>
    ((u.data as Record<string, any>).displayName || (u.data as Record<string, any>).name || "").toLowerCase().includes(lower) ||
    ((u.data as Record<string, any>).email || "").toLowerCase().includes(lower)
  );
  if (!found) return null;
  const data = found.data as Record<string, any>;
  return { userId: found.id, userName: data.displayName || data.name || data.email || name };
}

/**
 * Verify tenant access — check if user is a member or superAdmin.
 */
export async function verifyTenantAccess(
  db: Firestore,
  tenantId: string,
  userUid: string
): Promise<{ isMember: boolean; isSuperAdmin: boolean; role?: string }> {
  const tenantDoc = await db.collection("tenants").doc(tenantId).get();
  if (!tenantDoc.exists) return { isMember: false, isSuperAdmin: false };
  const data = tenantDoc.data()!;
  const members: string[] = data.members || [];
  const superAdmins: string[] = data.superAdmins || [];
  const isSuperAdmin = superAdmins.includes(userUid);
  const isMember = members.includes(userUid) || isSuperAdmin;
  return { isMember, isSuperAdmin, role: isSuperAdmin ? "Super Admin" : undefined };
}
