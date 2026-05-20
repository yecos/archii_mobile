import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { getTenantMsToken } from '@/lib/onedrive-auth';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET — Download a file from the tenant's OneDrive.
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  let user: any;
  try {
    user = await requireAuth(request);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Error de autenticación' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'ID de archivo requerido' }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get('tenantId') || '';

  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId es requerido' }, { status: 400 });
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
    const graphUrl = `${GRAPH_BASE}/me/drive/items/${id}/content`;

    const res = await fetch(graphUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
      return NextResponse.json(
        { error: 'Token expirado', code: 'TOKEN_EXPIRED' },
        { status: 401, headers: { 'X-Tenant-OD-Status': 'token-expired' } }
      );
    }
    if (res.status === 404) {
      return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 });
    }
    if (!res.ok) {
      const errBody = await res.text();
      return NextResponse.json({ error: `Error de Graph API: ${errBody}` }, { status: res.status });
    }

    // Get metadata for filename
    let filename = 'descargar';
    try {
      const metaRes = await fetch(`${GRAPH_BASE}/me/drive/items/${id}?$select=name,file`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (metaRes.ok) {
        const meta = await metaRes.json();
        filename = meta.name || 'descargar';
      }
    } catch {
      // Use default filename
    }

    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    const buffer = await res.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Content-Length': String(buffer.byteLength),
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno';
    console.error('[Tenant OneDrive File Download]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH — Rename a file in the tenant's OneDrive.
 */
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
) {
  let user: any;
  try {
    user = await requireAuth(request);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Error de autenticación' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'ID de archivo requerido' }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get('tenantId') || '';

  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId es requerido' }, { status: 400 });
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
    const body = await request.json();
    const { name } = body;

    if (!name) {
      return NextResponse.json({ error: 'Nombre es requerido' }, { status: 400 });
    }

    const graphUrl = `${GRAPH_BASE}/me/drive/items/${id}`;

    const res = await fetch(graphUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    });

    if (res.status === 401) {
      return NextResponse.json(
        { error: 'Token expirado', code: 'TOKEN_EXPIRED' },
        { status: 401, headers: { 'X-Tenant-OD-Status': 'token-expired' } }
      );
    }
    if (res.status === 409) {
      return NextResponse.json(
        { error: 'Ya existe un archivo con este nombre' },
        { status: 409 }
      );
    }
    if (!res.ok) {
      const errBody = await res.text();
      return NextResponse.json({ error: `Error de Graph API: ${errBody}` }, { status: res.status });
    }

    const updatedItem = await res.json();
    return NextResponse.json({ item: updatedItem });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno';
    console.error('[Tenant OneDrive File PATCH]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE — Delete a file from the tenant's OneDrive.
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  let user: any;
  try {
    user = await requireAuth(request);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Error de autenticación' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'ID de archivo requerido' }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get('tenantId') || '';

  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId es requerido' }, { status: 400 });
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
    const graphUrl = `${GRAPH_BASE}/me/drive/items/${id}`;

    const res = await fetch(graphUrl, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
      return NextResponse.json(
        { error: 'Token expirado', code: 'TOKEN_EXPIRED' },
        { status: 401, headers: { 'X-Tenant-OD-Status': 'token-expired' } }
      );
    }
    if (res.status === 404) {
      return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 });
    }
    if (!res.ok && res.status !== 204) {
      const errBody = await res.text();
      return NextResponse.json({ error: `Error de Graph API: ${errBody}` }, { status: res.status });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno';
    console.error('[Tenant OneDrive File DELETE]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
