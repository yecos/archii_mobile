import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { encryptToken, decryptToken } from '@/lib/token-encryption';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const TOKEN_ENDPOINT = 'https://login.microsoftonline.com/common/oauth2/v2/token';

/**
 * POST /api/tenants/onedrive/connect
 *
 * Connect a tenant's Microsoft 365 account (Super Admin only).
 * Stores the MS access token + refresh token in the tenant Firestore document.
 *
 * Actions:
 *   - save: Save tokens to tenant doc (Super Admin provides accessToken + refreshToken)
 *   - status: Check if tenant has connected MS account
 *   - disconnect: Remove tokens from tenant doc (Super Admin only)
 *   - refresh: Refresh the tenant's MS access token using stored refresh token
 */
export async function POST(request: NextRequest) {
  // Auth check
  let user: any;
  try {
    user = await requireAuth(request);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Error de autenticación' }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const { action, tenantId, accessToken, refreshToken } = body;

  if (!action || !['save', 'status', 'disconnect', 'refresh'].includes(action)) {
    return NextResponse.json(
      { error: 'Acción inválida. Usa: save, status, disconnect, refresh' },
      { status: 400 }
    );
  }

  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId es requerido' }, { status: 400 });
  }

  try {
    const db = getAdminDb();
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();

    if (!tenantDoc.exists) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
    }

    const tenantData = tenantDoc.data()!;
    const isSuperAdmin = tenantData.createdBy === user.uid;

    // ── STATUS: Check if tenant has MS account connected ──
    if (action === 'status') {
      const hasToken = !!(tenantData.msAccessToken);
      return NextResponse.json({
        connected: hasToken,
        connectedByEmail: tenantData.msConnectedEmail || null,
        connectedAt: tenantData.msConnectedAt || null,
        folderId: tenantData.msRootFolderId || null,
      });
    }

    // ── SAVE: Save tokens (Super Admin only) ──
    if (action === 'save') {
      if (!isSuperAdmin) {
        return NextResponse.json(
          { error: 'Solo el Super Admin puede conectar la cuenta de Microsoft del equipo' },
          { status: 403 }
        );
      }

      if (!accessToken) {
        return NextResponse.json({ error: 'accessToken es requerido' }, { status: 400 });
      }

      // Verify the token works by fetching the user's profile from Graph API
      let msEmail = '';
      try {
        const profileRes = await fetch(`${GRAPH_BASE}/me`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (profileRes.ok) {
          const profile = await profileRes.json();
          msEmail = profile.mail || profile.userPrincipalName || '';
        } else if (profileRes.status === 401) {
          return NextResponse.json(
            { error: 'Token de Microsoft inválido o expirado' },
            { status: 401 }
          );
        } else {
          // Token might still work for OneDrive even if /me fails
          msEmail = user.email; // fallback
        }
      } catch {
        msEmail = user.email; // fallback
      }

      // Try to find or create Archii/<tenantName> folder
      // Each tenant gets its own subfolder to isolate files
      let rootFolderId: string | null = null;
      const tenantName = (tenantData.name || tenantId).replace(/[/\\:*?"<>|]/g, '-').substring(0, 50);
      const tenantFolderName = `Archii_${tenantName}`;

      try {
        // First ensure the Archii parent folder exists
        let archiiFolderId: string | null = null;
        const searchParentUrl = `${GRAPH_BASE}/me/drive/root/children?$filter=name eq 'Archii'&$select=id,name`;
        const searchParentRes = await fetch(searchParentUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (searchParentRes.ok) {
          const searchData = await searchParentRes.json();
          if (searchData.value && searchData.value.length > 0) {
            archiiFolderId = searchData.value[0].id;
          }
        }

        if (!archiiFolderId) {
          // Create Archii parent folder
          const createParentRes = await fetch(`${GRAPH_BASE}/me/drive/root/children`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: 'Archii',
              folder: {},
              '@microsoft.graph.conflictBehavior': 'fail',
            }),
          });
          if (createParentRes.ok) {
            const parentData = await createParentRes.json();
            archiiFolderId = parentData.id;
          }
        }

        // Now find or create the tenant-specific subfolder
        if (archiiFolderId) {
          const searchTenantUrl = `${GRAPH_BASE}/me/drive/items/${archiiFolderId}/children?$filter=name eq '${encodeURIComponent(tenantFolderName)}'&$select=id,name`;
          const searchTenantRes = await fetch(searchTenantUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });

          if (searchTenantRes.ok) {
            const searchData = await searchTenantRes.json();
            if (searchData.value && searchData.value.length > 0) {
              rootFolderId = searchData.value[0].id;
            }
          }

          if (!rootFolderId) {
            // Create tenant-specific folder inside Archii
            const createTenantRes = await fetch(`${GRAPH_BASE}/me/drive/items/${archiiFolderId}/children`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                name: tenantFolderName,
                folder: {},
                '@microsoft.graph.conflictBehavior': 'fail',
              }),
            });

            if (createTenantRes.ok) {
              const data = await createTenantRes.json();
              rootFolderId = data.id;
            }
          }
        }
      } catch {
        // Ignore search errors
      }

      // Encrypt tokens before storing in Firestore
      const updateData: Record<string, any> = {
        msAccessToken: encryptToken(accessToken),
        msConnectedEmail: msEmail,
        msConnectedBy: user.uid,
        msConnectedAt: new Date().toISOString(),
      };

      if (rootFolderId) {
        updateData.msRootFolderId = rootFolderId;
      }

      // Only store refresh token if provided (encrypted)
      if (refreshToken) {
        updateData.msRefreshToken = encryptToken(refreshToken);
      }

      await db.collection('tenants').doc(tenantId).update(updateData);

      return NextResponse.json({
        success: true,
        email: msEmail,
        folderId: rootFolderId,
        // SECURITY: Don't echo tokens back to client
      });
    }

    // ── DISCONNECT: Remove tokens (Super Admin only) ──
    if (action === 'disconnect') {
      if (!isSuperAdmin) {
        return NextResponse.json(
          { error: 'Solo el Super Admin puede desconectar la cuenta' },
          { status: 403 }
        );
      }

      await db.collection('tenants').doc(tenantId).update({
        msAccessToken: null,
        msRefreshToken: null,
        msConnectedEmail: null,
        msConnectedBy: null,
        msConnectedAt: null,
        msRootFolderId: null,
      });

      return NextResponse.json({ success: true });
    }

    // ── REFRESH: Refresh the tenant's MS access token ──
    if (action === 'refresh') {
      // Decrypt the stored refresh token
      const storedRefresh = decryptToken(tenantData.msRefreshToken || '');
      if (!storedRefresh) {
        return NextResponse.json(
          { error: 'No hay refresh token almacenado. Reconecta la cuenta de Microsoft.' },
          { status: 400 }
        );
      }

      const clientId =
        process.env.AZURE_CLIENT_ID || process.env.NEXT_PUBLIC_MS_CLIENT_ID;
      const clientSecret = process.env.AZURE_CLIENT_SECRET;

      if (!clientSecret) {
        return NextResponse.json(
          { error: 'Azure AD no configurado. AZURE_CLIENT_SECRET no está configurado.' },
          { status: 503 }
        );
      }

      const params = new URLSearchParams({
        client_id: clientId || '',
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

      if (!tokenRes.ok) {
        const errBody = await tokenRes.text();
        console.error('[Tenant OneDrive] Token refresh failed:', errBody);

        // If refresh token expired, clear it
        if (tokenRes.status === 400) {
          await db.collection('tenants').doc(tenantId).update({
            msAccessToken: null,
            msRefreshToken: null,
          });
          return NextResponse.json(
            { error: 'Refresh token expirado. Reconecta la cuenta de Microsoft.', code: 'REFRESH_EXPIRED' },
            { status: 401 }
          );
        }

        return NextResponse.json(
          { error: 'Error al refrescar token', detail: errBody },
          { status: tokenRes.status }
        );
      }

      const tokenData = await tokenRes.json();
      const newAccessToken = tokenData.access_token;
      const newRefreshToken = tokenData.refresh_token || storedRefresh;

      // Encrypt and save updated tokens
      await db.collection('tenants').doc(tenantId).update({
        msAccessToken: encryptToken(newAccessToken),
        msRefreshToken: encryptToken(newRefreshToken),
      });

      // SECURITY: Don't return the full access token — client doesn't need it.
      // Token is stored server-side and used by tenant OneDrive endpoints.
      return NextResponse.json({
        success: true,
        expiresIn: tokenData.expires_in || 3600,
      });
    }

    return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    console.error('[Tenant OneDrive Connect]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
