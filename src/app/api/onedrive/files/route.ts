import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { verifyArchiiAuth, getAccessToken, autoRefreshPersonalToken } from '@/lib/onedrive-auth';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

/**
 * GET — List files from a OneDrive folder and optionally sync metadata to Firestore.
 */
export async function GET(request: NextRequest) {
  try {
    if (!(await verifyArchiiAuth(request))) {
      return NextResponse.json({ error: 'Archii authentication required' }, { status: 401 });
    }

    const token = getAccessToken(request);
    if (!token) {
      return NextResponse.json({ error: 'MS access token required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get('folderId') || 'root';
    const projectId = searchParams.get('projectId') || '';
    const top = searchParams.get('top') || '50';
    const topParam = Math.min(Math.max(parseInt(top, 10) || 50, 1), 200);

    const select =
      'id,name,size,mimeType,lastModifiedDateTime,thumbnails,file,folder,createdDateTime';
    const graphUrl = `${GRAPH_BASE}/me/drive/items/${folderId}/children?$top=${topParam}&$orderby=name&$select=${select}`;

    const res = await fetch(graphUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
      return NextResponse.json({ error: 'Token expired', code: 'TOKEN_EXPIRED' }, { status: 401 });
    }
    if (res.status === 404) {
      return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
    }
    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After') || '60';
      return NextResponse.json(
        { error: 'Throttled by Graph API', retryAfter: Number(retryAfter) },
        { status: 429 }
      );
    }
    if (!res.ok) {
      const errBody = await res.text();
      return NextResponse.json({ error: `Graph API error: ${errBody}` }, { status: res.status });
    }

    const data = await res.json();
    const items = data.value || [];

    // Sync to Firestore if projectId is provided
    if (projectId) {
      try {
        const db = getAdminDb();
        const batch = db.batch();
        let ops = 0;

        for (const item of items) {
          if (ops >= 500) break; // Firestore batch limit

          const docRef = db
            .collection('onedrive_files')
            .doc(`${projectId}_${item.id}`);
          batch.set(docRef, {
            projectId,
            driveItemId: item.id,
            name: item.name,
            mimeType: item.file?.mimeType || item.folder ? 'folder' : 'unknown',
            size: item.size || 0,
            category: '',
            uploadedBy: '',
            parentId: folderId,
            createdAt: item.createdDateTime ? new Date(item.createdDateTime) : null,
            lastModified: item.lastModifiedDateTime ? new Date(item.lastModifiedDateTime) : null,
            isFolder: !!item.folder,
          }, { merge: true });
          ops++;
        }

        if (ops > 0) await batch.commit();
      } catch (firestoreErr) {
        // Firestore sync failure should not block the response
        console.error('[OneDrive] Firestore sync warning:', firestoreErr);
      }
    }

    return NextResponse.json({ items, count: items.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[OneDrive Files GET]', message);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

/**
 * POST — Upload a file to a OneDrive folder.
 * Small files (< 4 MB): simple PUT
 * Large files (>= 4 MB): create upload session, then upload in 5 MB chunks sequentially.
 */
export async function POST(request: NextRequest) {
  try {
    if (!(await verifyArchiiAuth(request))) {
      return NextResponse.json({ error: 'Archii authentication required' }, { status: 401 });
    }

    const token = getAccessToken(request);
    if (!token) {
      return NextResponse.json({ error: 'MS access token required' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const folderId = (formData.get('folderId') as string) || 'root';
    const projectId = (formData.get('projectId') as string) || '';
    const category = (formData.get('category') as string) || '';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Max file size: 250 MB for serverless safety
    const MAX_FILE_SIZE = 250 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'Archivo demasiado grande. Máximo 250 MB.' }, { status: 413 });
    }

    const fileSize = file.size;
    const SMALL_FILE_LIMIT = 4 * 1024 * 1024; // 4 MB
    const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB chunks for upload session
    const filename = file.name;
    const encodedFilename = encodeURIComponent(filename);

    let uploadResult: unknown;

    if (fileSize < SMALL_FILE_LIMIT) {
      // Simple PUT upload
      const uploadUrl = `${GRAPH_BASE}/me/drive/items/${folderId}:/${encodedFilename}/content`;
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
        return NextResponse.json({ error: 'Token expired', code: 'TOKEN_EXPIRED' }, { status: 401 });
      }
      if (res.status === 404) {
        return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
      }
      if (res.status === 409) {
        return NextResponse.json({ error: 'A file with this name already exists' }, { status: 409 });
      }
      if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After') || '60';
        return NextResponse.json(
          { error: 'Throttled by Graph API', retryAfter: Number(retryAfter) },
          { status: 429 }
        );
      }
      if (!res.ok) {
        const errBody = await res.text();
        return NextResponse.json({ error: `Graph API upload error: ${errBody}` }, { status: res.status });
      }

      uploadResult = await res.json();
    } else {
      // Large file — create upload session, then chunk upload
      const sessionUrl = `${GRAPH_BASE}/me/drive/items/${folderId}:/${encodedFilename}/createUploadSession`;

      const sessionRes = await fetch(sessionUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          item: {
            '@microsoft.graph.conflictBehavior': 'rename',
          },
        }),
      });

      if (!sessionRes.ok) {
        const errBody = await sessionRes.text();
        return NextResponse.json(
          { error: `Failed to create upload session: ${errBody}` },
          { status: sessionRes.status }
        );
      }

      const sessionData = await sessionRes.json();
      const uploadUrl: string = sessionData.uploadUrl;

      // Read the entire file into a buffer
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

        if (chunkRes.status === 401) {
          return NextResponse.json({ error: 'Token expired during upload', code: 'TOKEN_EXPIRED' }, { status: 401 });
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
          // Retry after waiting
          const waitMs = Number(retryAfter) * 1000;
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          // Retry this chunk
          continue;
        }
        if (!chunkRes.ok && chunkRes.status !== 202) {
          const errBody = await chunkRes.text();
          return NextResponse.json(
            { error: `Chunk upload error at offset ${offset}: ${errBody}` },
            { status: chunkRes.status }
          );
        }

        // If the response is 200 or 201, the upload is complete
        if (chunkRes.status === 200 || chunkRes.status === 201) {
          uploadResult = await chunkRes.json();
          break;
        }

        // 202 means more chunks to come
        offset = chunkEnd;
        chunkRetries = 0;
      }

      // If we finished the loop without a final 200/201, fetch the result
      if (!uploadResult) {
        // The last PUT should have returned 200/201
        uploadResult = { id: sessionData.id, name: filename };
      }
    }

    // Sync metadata to Firestore if projectId is provided
    if (projectId && uploadResult && typeof uploadResult === 'object' && 'id' in uploadResult) {
      const item = uploadResult as Record<string, unknown>;
      try {
        const db = getAdminDb();
        await db.collection('onedrive_files').doc(`${projectId}_${item.id}`).set({
          projectId,
          driveItemId: item.id,
          name: filename,
          mimeType: file.type || 'application/octet-stream',
          size: fileSize,
          category,
          uploadedBy: '',
          parentId: folderId,
          createdAt: item.createdDateTime ? new Date(item.createdDateTime as string) : new Date(),
          lastModified: new Date(),
          isFolder: false,
        }, { merge: true });
      } catch (firestoreErr) {
        console.error('[OneDrive Upload] Firestore sync warning:', firestoreErr);
      }
    }

    return NextResponse.json({ item: uploadResult });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[OneDrive Files POST]', message);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
