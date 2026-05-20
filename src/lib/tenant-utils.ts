/**
 * tenant-utils.ts
 * Shared tenant verification utilities for API routes.
 * Prevents cross-tenant data access (IDOR).
 */

import { getAdminDb } from '@/lib/firebase-admin';

/**
 * Verify that a user belongs to a tenant.
 * Checks the tenant's members array (primary) and falls back to
 * checking createdBy / superAdmins fields.
 *
 * @returns true if user is a member, false otherwise
 */
export async function verifyTenantMembership(
  uid: string,
  tenantId: string
): Promise<boolean> {
  const db = getAdminDb();

  try {
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (!tenantDoc.exists) return false;

    const data = tenantDoc.data()!;
    const members: string[] = data.members || [];

    // Check members array
    if (members.includes(uid)) return true;

    // Check createdBy
    if (data.createdBy === uid) return true;

    // Check superAdmins
    const superAdmins: string[] = data.superAdmins || [];
    if (superAdmins.includes(uid)) return true;

    return false;
  } catch {
    return false;
  }
}

/**
 * Verify tenant membership and return tenant data.
 * Throws NextResponse error if not a member.
 */
export async function requireTenantMembership(
  uid: string,
  tenantId: string
): Promise<{ verified: true; tenantData: Record<string, any> }> {
  const db = getAdminDb();
  const tenantDoc = await db.collection('tenants').doc(tenantId).get();

  if (!tenantDoc.exists) {
    throw { status: 404, message: 'Tenant no encontrado' };
  }

  const data = tenantDoc.data()!;
  const members: string[] = data.members || [];
  const isMember =
    members.includes(uid) ||
    data.createdBy === uid ||
    (data.superAdmins || []).includes(uid);

  if (!isMember) {
    throw { status: 403, message: 'No eres miembro de este tenant' };
  }

  return { verified: true, tenantData: data };
}

/**
 * Check if a user is Super Admin of a specific tenant.
 */
export function isSuperAdmin(tenantData: Record<string, any>, uid: string): boolean {
  return tenantData.createdBy === uid || (tenantData.superAdmins || []).includes(uid);
}

/**
 * Clamp a number within min/max bounds.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
