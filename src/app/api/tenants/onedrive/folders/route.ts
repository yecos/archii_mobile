import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { getTenantMsToken } from '@/lib/onedrive-auth';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

/**
 * POST — Create a folder in the tenant's OneDrive.
 *
 * Body: { tenantId: string, folderId?: string, name: string }
 *   - tenantId: Required. The tenant to create the folder in.
 *   - folderId: Optional. Parent folder ID. Defaults to tenant's Archii root.
 *   - name: Required. Name of the new folder.
 */
export async function POST(request: NextRequest) {
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

  const { tenantId, folderId, name } = body;

  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId es requerido' }, { status: 400 });
  }
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'Nombre de carpeta es requerido' }, { status: 400 });
  }

  // Verify user is a member
  const db = getAdminDb();
  const tenantDoc = await db.collection('tenants').doc(tenantId).get();
  if (!tenantDoc.exists) {
    return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
  }
  const tenantData = tenantDoc.data()!;
  const members: string[] = tenantData.members || [];
  if (!members.includes(user.uid)) {
    return NextResponse.json({ error: 'No eres miembro de este tenant' }, { status: 403 });
  }

  // Get tenant MS token
  const tokenResult = await getTenantMsToken(tenantId);
  if (tokenResult instanceof NextResponse) return tokenResult;
  const { token } = tokenResult;

  try {
    // Determine parent folder
    let parentFolderId = folderId || 'root';
    if (parentFolderId === 'root') {
      parentFolderId = tenantData.msRootFolderId || 'root';
    }

    const createUrl = `${GRAPH_BASE}/me/drive/items/${parentFolderId}/children`;

    const res = await fetch(createUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: name.trim(),
        folder: {},
        '@microsoft.graph.conflictBehavior': 'rename',
      }),
    });

    if (res.status === 401) {
      return NextResponse.json(
        { error: 'Token expirado', code: 'TOKEN_EXPIRED' },
        { status: 401, headers: { 'X-Tenant-OD-Status': 'token-expired' } }
      );
    }
    if (res.status === 409) {
      // Folder already exists — find it and return it
      const searchUrl = `${GRAPH_BASE}/me/drive/items/${parentFolderId}/children?$filter=name eq '${encodeURIComponent(name.trim())}'&$select=id,name,folder`;
      const searchRes = await fetch(searchUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.value && searchData.value.length > 0) {
          return NextResponse.json({
            item: searchData.value[0],
            alreadyExisted: true,
          });
        }
      }
      return NextResponse.json(
        { error: 'Conflicto de nombre de carpeta' },
        { status: 409 }
      );
    }
    if (!res.ok) {
      const errBody = await res.text();
      return NextResponse.json(
        { error: `Error al crear carpeta: ${errBody}` },
        { status: res.status }
      );
    }

    const folderData = await res.json();
    return NextResponse.json({ item: folderData });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno';
    console.error('[Tenant OneDrive Folders POST]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
