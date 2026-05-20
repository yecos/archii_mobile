// ============================================================================
// Archii - Shared OneDrive Authentication Utilities
// ============================================================================
//
// Consolidated from 8 route files (5 personal + 3 tenant OneDrive routes).
// All OneDrive API routes should import from here instead of defining
// their own local copies.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { authenticateRequest } from '@/lib/api-auth';
import { decryptToken, encryptToken } from '@/lib/token-encryption';

const TOKEN_ENDPOINT = 'https://login.microsoftonline.com/common/oauth2/v2/token';

// ---- Personal OneDrive Auth ----

/**
 * Verify Archii authentication from X-Firebase-Token header.
 * OneDrive routes use the Authorization header for MS access tokens,
 * so Archii auth is passed via a separate custom header.
 */
export async function verifyArchiiAuth(request: NextRequest): Promise<boolean> {
  const fbToken = request.headers.get('x-firebase-token');
  if (!fbToken) return false;
  try {
    const user = await authenticateRequest({
      ...request,
      headers: new Headers({ 'authorization': `Bearer ${fbToken}` }),
    } as NextRequest);
    return !!user;
  } catch {
    return false;
  }
}

/**
 * Extract the MS access token from the Authorization header.
 */
export function getAccessToken(request: NextRequest): string | null {
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

/**
 * Attempt to auto-refresh a personal MS access token using client credentials.
 * Personal tokens are stored client-side via Firebase Auth, so this is a best-effort
 * server-side fallback using the app's Azure AD credentials.
 */
export async function autoRefreshPersonalToken(refreshToken: string): Promise<string | null> {
  const clientId = process.env.AZURE_CLIENT_ID || process.env.NEXT_PUBLIC_MS_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: 'Files.ReadWrite.All offline_access',
    });
    const tokenRes = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!tokenRes.ok) return null;
    const tokenData = await tokenRes.json();
    return tokenData.access_token || null;
  } catch {
    return null;
  }
}

// ---- Tenant OneDrive Auth ----

/**
 * Get the tenant's MS access token from Firestore.
 * Always decrypts the stored token before returning.
 *
 * @returns `{ token }` on success, or a `NextResponse` error to return directly.
 */
export async function getTenantMsToken(
  tenantId: string
): Promise<{ token: string } | NextResponse> {
  const db = getAdminDb();
  const tenantDoc = await db.collection('tenants').doc(tenantId).get();

  if (!tenantDoc.exists) {
    return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
  }

  const tenantData = tenantDoc.data()!;

  if (!tenantData.msAccessToken) {
    return NextResponse.json(
      { error: 'Cuenta de Microsoft no conectada. El Super Admin debe conectar la cuenta del equipo.' },
      { status: 400, headers: { 'X-Tenant-OD-Status': 'not-connected' } }
    );
  }

  // Decrypt and return the stored access token.
  // If the token is expired, Graph API will return 401 and the caller should
  // use autoRefreshTenantToken() to obtain a fresh one.
  return { token: decryptToken(tenantData.msAccessToken || '') };
}

/**
 * Attempt to auto-refresh the tenant's Microsoft access token.
 * Decrypts the stored refresh token, calls the OAuth2 endpoint,
 * and persists the new (encrypted) tokens back to Firestore.
 *
 * @returns The new access token if successful, or null if refresh failed.
 */
export async function autoRefreshTenantToken(
  tenantId: string,
  tenantData: Record<string, unknown>
): Promise<string | null> {
  const storedRefresh = decryptToken((tenantData.msRefreshToken as string) || '');
  if (!storedRefresh) return null;

  const clientId = process.env.AZURE_CLIENT_ID || process.env.NEXT_PUBLIC_MS_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: storedRefresh,
      scope: 'Files.ReadWrite.All Sites.ReadWrite.All offline_access',
    });

    const tokenRes = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!tokenRes.ok) return null;

    const tokenData = await tokenRes.json();
    const newAccessToken = tokenData.access_token;
    const newRefreshToken = tokenData.refresh_token || storedRefresh;

    // Encrypt and persist updated tokens to Firestore
    const db = getAdminDb();
    await db.collection('tenants').doc(tenantId).update({
      msAccessToken: encryptToken(newAccessToken),
      msRefreshToken: encryptToken(newRefreshToken),
    });

    return newAccessToken;
  } catch {
    return null;
  }
}
