import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { verifyArchiiAuth, getAccessToken } from '@/lib/onedrive-auth';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Generate a thumbnail URL for a given drive item ID and size.
 */
function thumbnailUrl(itemId: string, size: string = 'medium'): string {
  return `${GRAPH_BASE}/me/drive/items/${itemId}/thumbnails/0/${size}`;
}

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * GET — Get photos for a project gallery.
 * Checks Firestore cache first (stale threshold: 5 minutes).
 * Falls back to Graph API if cache is stale or empty.
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    if (!(await verifyArchiiAuth(request))) {
      return NextResponse.json({ error: 'Archii authentication required' }, { status: 401 });
    }

    const token = getAccessToken(request);
    if (!token) {
      return NextResponse.json({ error: 'Authorization token required' }, { status: 401 });
    }

    const { projectId } = await params;
    if (!projectId) {
      return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const thumbnailSize = searchParams.get('size') || 'medium'; // small | medium | large | custom
    const forceRefresh = searchParams.get('refresh') === 'true';

    const db = getAdminDb();

    // ── Step 1: Try Firestore cache ──────────────────────────────────
    if (!forceRefresh) {
      try {
        const snapshot = await db
          .collection('onedrive_files')
          .where('projectId', '==', projectId)
          .get();

        const photos: Record<string, unknown>[] = [];
        let cacheFresh = false;

        snapshot.forEach((doc) => {
          const data = doc.data();
          const isImage =
            data.mimeType?.includes('image') ||
            data.category === 'fotos' ||
            data.name?.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg|heic|heif)$/i);

          if (isImage && data.driveItemId) {
            // Check if cache is fresh
            const lastSync = data.lastModified || data.createdAt;
            if (lastSync) {
              const lastSyncDate = new Date(lastSync as string);
              const ageMs = Date.now() - lastSyncDate.getTime();
              if (ageMs < STALE_THRESHOLD_MS) {
                cacheFresh = true;
              }
            }

            photos.push({
              id: data.driveItemId,
              name: data.name,
              mimeType: data.mimeType,
              size: data.size,
              category: data.category,
              thumbnailUrl: thumbnailUrl(data.driveItemId as string, thumbnailSize),
              thumbnailSmall: thumbnailUrl(data.driveItemId as string, 'small'),
              thumbnailLarge: thumbnailUrl(data.driveItemId as string, 'large'),
            });
          }
        });

        // Return cached results if we have photos and cache is fresh
        if (photos.length > 0 && cacheFresh) {
          return NextResponse.json({
            items: photos,
            count: photos.length,
            projectId,
            source: 'cache',
          });
        }

        // If we have cached photos but they're stale, fall through to refresh
        if (photos.length > 0 && !cacheFresh) {
          // Continue below to refresh from Graph API
        }
      } catch (firestoreErr) {
        console.error('[OneDrive Gallery] Firestore cache read warning:', firestoreErr);
        // Fall through to Graph API
      }
    }

    // ── Step 2: Fetch from Graph API ─────────────────────────────────
    // Try to find the "fotos" folder for this project
    let folderItems: unknown[] = [];
    let foundFolder = false;

    try {
      // Look for the project's fotos folder in Firestore first
      const folderSnapshot = await db
        .collection('onedrive_folders')
        .where('projectId', '==', projectId)
        .where('folderType', '==', 'fotos')
        .limit(1)
        .get();

      if (!folderSnapshot.empty) {
        const folderDoc = folderSnapshot.docs[0].data();
        const fotosFolderId = folderDoc.driveItemId;

        if (fotosFolderId) {
          const select =
            'id,name,size,mimeType,lastModifiedDateTime,thumbnails,file,createdDateTime';
          const graphUrl = `${GRAPH_BASE}/me/drive/items/${fotosFolderId}/children?$top=100&$select=${select}`;

          const res = await fetch(graphUrl, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (res.ok) {
            const data = await res.json();
            folderItems = data.value || [];
            foundFolder = true;
          }
        }
      }
    } catch {
      // If folder lookup fails, fall through to root search
    }

    // Fallback: search for image files in the project's root folder
    if (!foundFolder) {
      try {
        const rootFolderSnapshot = await db
          .collection('onedrive_folders')
          .where('projectId', '==', projectId)
          .where('folderType', '==', 'planos')
          .limit(1)
          .get();

        let parentFolderId = 'root';
        if (!rootFolderSnapshot.empty) {
          const folderDoc = rootFolderSnapshot.docs[0].data();
          parentFolderId = folderDoc.parentFolderId || 'root';
        }

        const select =
          'id,name,size,mimeType,lastModifiedDateTime,thumbnails,file,createdDateTime';
        const graphUrl = `${GRAPH_BASE}/me/drive/items/${parentFolderId}/children?$top=200&$select=${select}`;

        const res = await fetch(graphUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          const allItems = data.value || [];
          folderItems = allItems.filter(
            (item: Record<string, unknown>) => {
              const name = (item.name as string) || '';
              const mime = (item.file as Record<string, unknown>)?.mimeType as string || '';
              return (
                mime.includes('image') ||
                name.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg|heic|heif)$/i)
              );
            }
          );
        }
      } catch {
        // If this also fails, return empty
      }
    }

    // ── Step 3: Format results and update cache ──────────────────────
    const typedItems = folderItems as Record<string, unknown>[];
    const photos = typedItems
      .map((item) => ({
        id: item.id,
        name: item.name,
        mimeType: (item.file as Record<string, unknown>)?.mimeType || 'image/unknown',
        size: item.size,
        thumbnailUrl: thumbnailUrl(item.id as string, thumbnailSize),
        thumbnailSmall: thumbnailUrl(item.id as string, 'small'),
        thumbnailLarge: thumbnailUrl(item.id as string, 'large'),
        createdDateTime: item.createdDateTime,
        lastModifiedDateTime: item.lastModifiedDateTime,
      }))
      .filter((p) => !!p.id);

    // Update Firestore cache
    if (photos.length > 0) {
      try {
        const batch = db.batch();
        let ops = 0;

        for (const photo of photos) {
          if (ops >= 500) break;
          const docRef = db
            .collection('onedrive_files')
            .doc(`${projectId}_${photo.id}`);
          batch.set(docRef, {
            projectId,
            driveItemId: photo.id,
            name: photo.name,
            mimeType: photo.mimeType,
            size: photo.size || 0,
            category: 'fotos',
            uploadedBy: '',
            parentId: '',
            createdAt: photo.createdDateTime ? new Date(photo.createdDateTime as string) : new Date(),
            lastModified: new Date(),
            isFolder: false,
          }, { merge: true });
          ops++;
        }

        if (ops > 0) await batch.commit();
      } catch (firestoreErr) {
        console.error('[OneDrive Gallery] Firestore cache update warning:', firestoreErr);
      }
    }

    return NextResponse.json({
      items: photos,
      count: photos.length,
      projectId,
      source: foundFolder ? 'graph-api' : 'graph-api-fallback',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[OneDrive Gallery GET]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
