import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { getTenantMsToken, autoRefreshTenantToken } from '@/lib/onedrive-auth';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

/**
 * GET — List files from the tenant's OneDrive folder.
 * Uses the MS token stored in the tenant Firestore document.
 */
export async function GET(request: NextRequest) {
  let user: any;
  try {
    user = await requireAuth(request);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Error de autenticación' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get('tenantId') || '';
  const folderId = searchParams.get('folderId') || 'root';
  const top = searchParams.get('top') || '100';

  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId es requerido' }, { status: 400 });
  }

  // Verify user is a member of this tenant
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
    // Determine the folder path to use
    let actualFolderId = folderId;

    // If root, use the tenant's Archii folder if configured
    if (folderId === 'root' && tenantData.msRootFolderId) {
      actualFolderId = tenantData.msRootFolderId;
    } else if (folderId === 'root') {
      actualFolderId = 'root'; // Use OneDrive root
    }

    const select =
      'id,name,size,mimeType,lastModifiedDateTime,thumbnails,file,folder,createdDateTime,webUrl';
    const graphUrl = `${GRAPH_BASE}/me/drive/items/${actualFolderId}/children?$top=${top}&$orderby=name&$select=${select}`;

    const res = await fetch(graphUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // If token expired, try auto-refresh
    if (res.status === 401) {
      // Try to auto-refresh the token
      const refreshed = await autoRefreshTenantToken(tenantId, tenantData);
      if (refreshed) {
        // Retry the request with the new token
        const retryRes = await fetch(graphUrl, {
          headers: { Authorization: `Bearer ${refreshed}` },
        });
        if (retryRes.ok) {
          const retryData = await retryRes.json();
          const retryItems = retryData.value || [];
          retryItems.sort((a: any, b: any) => {
            const aIsFolder = !!a.folder;
            const bIsFolder = !!b.folder;
            if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1;
            return (a.name || '').localeCompare(b.name || '');
          });
          return NextResponse.json({ items: retryItems, count: retryItems.length, folderId: actualFolderId });
        }
      }
      return NextResponse.json(
        { error: 'Token de Microsoft expirado', code: 'TOKEN_EXPIRED' },
        { status: 401, headers: { 'X-Tenant-OD-Status': 'token-expired' } }
      );
    }
    if (res.status === 404) {
      return NextResponse.json({ error: 'Carpeta no encontrada' }, { status: 404 });
    }
    if (!res.ok) {
      const errBody = await res.text();
      return NextResponse.json({ error: `Error de Graph API: ${errBody}` }, { status: res.status });
    }

    const data = await res.json();
    const items = data.value || [];

    // Sort: folders first, then files alphabetically
    items.sort((a: any, b: any) => {
      const aIsFolder = !!a.folder;
      const bIsFolder = !!b.folder;
      if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1;
      return (a.name || '').localeCompare(b.name || '');
    });

    const folderName = folderId === 'root'
      ? `Archii/${(tenantData.name || tenantId).replace(/[/\\:*?"<>|]/g, '-')}`
      : undefined;

    return NextResponse.json({
      items,
      count: items.length,
      folderId: actualFolderId,
      folderName,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    console.error('[Tenant OneDrive Files GET]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST — Upload a file to the tenant's OneDrive.
 * Small files (< 4 MB): simple PUT
 * Large files (>= 4 MB): create upload session, then upload in 5 MB chunks.
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

  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get('tenantId') || '';
  const folderId = searchParams.get('folderId') || 'root';

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
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No se proporcionó archivo' }, { status: 400 });
    }

    // Max file size: 250 MB for serverless safety (prevents OOM)
    const fileSize = file.size;
    const MAX_FILE_SIZE = 250 * 1024 * 1024;
    if (fileSize > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'Archivo demasiado grande. Máximo 250 MB.' },
        { status: 413 }
      );
    }

    const SMALL_FILE_LIMIT = 4 * 1024 * 1024; // 4 MB
    const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB chunks
    const filename = file.name;
    const encodedFilename = encodeURIComponent(filename);

    // Determine actual folder ID
    let actualFolderId = folderId;
    if (folderId === 'root' && tenantData.msRootFolderId) {
      actualFolderId = tenantData.msRootFolderId;
    }

    let uploadResult: unknown;

    if (fileSize < SMALL_FILE_LIMIT) {
      // Simple PUT upload
      const uploadUrl = `${GRAPH_BASE}/me/drive/items/${actualFolderId}:/${encodedFilename}/content`;
      const buffer = Buffer.from(await file.arrayBuffer());

      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': file.type || 'application/octet-stream',
        },
        body: buffer,
      });

      if (res.status === 401) {
        // Try auto-refresh for upload too
        const refreshed = await autoRefreshTenantToken(tenantId, tenantData);
        if (refreshed) {
          const retryRes = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${refreshed}`,
              'Content-Type': file.type || 'application/octet-stream',
            },
            body: buffer,
          });
          if (retryRes.ok) {
            uploadResult = await retryRes.json();
          } else {
            return NextResponse.json({ error: 'Token expirado', code: 'TOKEN_EXPIRED' }, { status: 401 });
          }
        } else {
          return NextResponse.json({ error: 'Token expirado', code: 'TOKEN_EXPIRED' }, { status: 401 });
        }
      }
      if (res.status === 409) {
        return NextResponse.json({ error: 'Ya existe un archivo con este nombre' }, { status: 409 });
      }
      if (!res.ok) {
        const errBody = await res.text();
        return NextResponse.json({ error: `Error al subir: ${errBody}` }, { status: res.status });
      }

      uploadResult = await res.json();
    } else {
      // Large file — create upload session
      const sessionUrl = `${GRAPH_BASE}/me/drive/items/${actualFolderId}:/${encodedFilename}/createUploadSession`;

      const sessionRes = await fetch(sessionUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          item: { '@microsoft.graph.conflictBehavior': 'rename' },
        }),
      });

      if (!sessionRes.ok) {
        const errBody = await sessionRes.text();
        return NextResponse.json(
          { error: `Error al crear sesión de subida: ${errBody}` },
          { status: sessionRes.status }
        );
      }

      const sessionData = await sessionRes.json();
      const uploadUrl: string = sessionData.uploadUrl;
      const fileBuffer = Buffer.from(await file.arrayBuffer());
      let offset = 0;
      const MAX_CHUNK_RETRIES = 3;
      let chunkRetries = 0;

      while (offset < fileSize) {
        const chunkEnd = Math.min(offset + CHUNK_SIZE, fileSize);
        const chunkLength = chunkEnd - offset;
        const chunk = fileBuffer.subarray(offset, chunkEnd);

        const chunkRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Length': String(chunkLength),
            'Content-Range': `bytes ${offset}-${chunkEnd - 1}/${fileSize}`,
          },
          body: chunk,
        });

        if (chunkRes.status === 200 || chunkRes.status === 201) {
          uploadResult = await chunkRes.json();
          break;
        }

        if (chunkRes.status === 429) {
          const retryAfter = chunkRes.headers.get('Retry-After') || '60';
          chunkRetries++;
          if (chunkRetries > MAX_CHUNK_RETRIES) {
            return NextResponse.json(
              { error: 'Demasiados reintentos por throttling. Intenta más tarde.' },
              { status: 429 }
            );
          }
          await new Promise((resolve) => setTimeout(resolve, Number(retryAfter) * 1000));
          continue;
        }

        if (!chunkRes.ok && chunkRes.status !== 202) {
          const errBody = await chunkRes.text();
          return NextResponse.json(
            { error: `Error en subida del chunk en offset ${offset}: ${errBody}` },
            { status: chunkRes.status }
          );
        }

        offset = chunkEnd;
        chunkRetries = 0;
      }

      if (!uploadResult) {
        uploadResult = { id: sessionData.id, name: filename };
      }
    }

    return NextResponse.json({ item: uploadResult });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    console.error('[Tenant OneDrive Files POST]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
