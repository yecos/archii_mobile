import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { verifyArchiiAuth, getAccessToken } from '@/lib/onedrive-auth';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

/** Subfolders that are created inside each project folder */
const PROJECT_SUBFOLDERS = [
  'planos',
  'fotos',
  'contratos',
  'presupuestos',
  'otros',
] as const;

type FolderType = (typeof PROJECT_SUBFOLDERS)[number];

/**
 * POST — Create a project folder structure in OneDrive:
 *   Archii / {projectName} / planos
 *                                   / fotos
 *                                   / contratos
 *                                   / presupuestos
 *                                   / otros
 *
 * Syncs folder IDs to Firestore 'onedrive_folders' collection.
 */
export async function POST(request: NextRequest) {
  try {
    if (!(await verifyArchiiAuth(request))) {
      return NextResponse.json({ error: 'Archii authentication required' }, { status: 401 });
    }

    const token = getAccessToken(request);
    if (!token) {
      return NextResponse.json({ error: 'Authorization token required' }, { status: 401 });
    }

    const body = await request.json();
    const { projectName, projectId } = body;

    if (!projectName || typeof projectName !== 'string') {
      return NextResponse.json({ error: 'projectName is required' }, { status: 400 });
    }
    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    const graphHeaders = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    // ── Step 1: Ensure Archii root folder exists ───────────────────
    let archiiId: string | undefined;

    try {
      // Search for existing Archii folder
      const searchUrl = `${GRAPH_BASE}/me/drive/root/children?$filter=name eq 'Archii'&$select=id,name`;
      const searchRes = await fetch(searchUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.value && searchData.value.length > 0) {
          archiiId = searchData.value[0].id;
        }
      }
    } catch {
      // Ignore search errors, will create below
    }

    if (!archiiId) {
      // Create Archii root folder
      const createRootUrl = `${GRAPH_BASE}/me/drive/root/children`;
      const createRootRes = await fetch(createRootUrl, {
        method: 'POST',
        headers: graphHeaders,
        body: JSON.stringify({
          name: 'Archii',
          folder: {},
          '@microsoft.graph.conflictBehavior': 'fail',
        }),
      });

      if (createRootRes.status === 409) {
        // Already exists — fetch it
        const searchUrl = `${GRAPH_BASE}/me/drive/root/children?$filter=name eq 'Archii'&$select=id,name`;
        const searchRes = await fetch(searchUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          if (searchData.value && searchData.value.length > 0) {
            archiiId = searchData.value[0].id;
          }
        }
        if (!archiiId) {
          return NextResponse.json(
            { error: 'Archii folder conflict could not be resolved' },
            { status: 409 }
          );
        }
      } else if (!createRootRes.ok) {
        const errBody = await createRootRes.text();
        return NextResponse.json(
          { error: `Failed to create Archii folder: ${errBody}` },
          { status: createRootRes.status }
        );
      } else {
        const rootData = await createRootRes.json();
        archiiId = rootData.id;
      }
    }

    // ── Step 2: Create project folder inside Archii ────────────────
    const encodedProjectName = encodeURIComponent(projectName);
    const projectFolderUrl = `${GRAPH_BASE}/me/drive/items/${archiiId}/children`;

    const projectFolderRes = await fetch(projectFolderUrl, {
      method: 'POST',
      headers: graphHeaders,
      body: JSON.stringify({
        name: projectName,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'rename',
      }),
    });

    if (projectFolderRes.status === 401) {
      return NextResponse.json({ error: 'Token expired', code: 'TOKEN_EXPIRED' }, { status: 401 });
    }
    if (projectFolderRes.status === 429) {
      const retryAfter = projectFolderRes.headers.get('Retry-After') || '60';
      return NextResponse.json(
        { error: 'Throttled by Graph API', retryAfter: Number(retryAfter) },
        { status: 429 }
      );
    }
    if (!projectFolderRes.ok) {
      const errBody = await projectFolderRes.text();
      return NextResponse.json(
        { error: `Failed to create project folder: ${errBody}` },
        { status: projectFolderRes.status }
      );
    }

    const projectFolderData = await projectFolderRes.json();
    const projectFolderId: string = projectFolderData.id;

    // ── Step 3: Create subfolders ────────────────────────────────────
    const subfolders: Record<FolderType, string | null> = {
      planos: null,
      fotos: null,
      contratos: null,
      presupuestos: null,
      otros: null,
    };

    for (const folderName of PROJECT_SUBFOLDERS) {
      try {
        const subfolderUrl = `${GRAPH_BASE}/me/drive/items/${projectFolderId}/children`;

        const subRes = await fetch(subfolderUrl, {
          method: 'POST',
          headers: graphHeaders,
          body: JSON.stringify({
            name: folderName,
            folder: {},
            '@microsoft.graph.conflictBehavior': 'fail',
          }),
        });

        if (subRes.ok) {
          const subData = await subRes.json();
          subfolders[folderName] = subData.id;
        } else if (subRes.status === 409) {
          // Folder already exists — find it
          const existingUrl = `${GRAPH_BASE}/me/drive/items/${projectFolderId}/children?$filter=name eq '${folderName}'&$select=id,name`;
          const existingRes = await fetch(existingUrl, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (existingRes.ok) {
            const existingData = await existingRes.json();
            if (existingData.value && existingData.value.length > 0) {
              subfolders[folderName] = existingData.value[0].id;
            }
          }
        }
      } catch (err) {
        console.error(`[OneDrive Folders] Failed to create subfolder "${folderName}":`, err);
      }
    }

    // ── Step 4: Sync folder metadata to Firestore ────────────────────
    try {
      const db = getAdminDb();
      const batch = db.batch();

      // Save project root folder
      const rootFolderDoc = db
        .collection('onedrive_folders')
        .doc(`${projectId}_root`);
      batch.set(rootFolderDoc, {
        projectId,
        folderName: projectName,
        driveItemId: projectFolderId,
        parentFolderId: archiiId,
        folderType: 'root',
        createdAt: new Date(),
      }, { merge: true });

      // Save each subfolder
      for (const [type, driveItemId] of Object.entries(subfolders)) {
        if (driveItemId) {
          const docRef = db
            .collection('onedrive_folders')
            .doc(`${projectId}_${type}`);
          batch.set(docRef, {
            projectId,
            folderName: type,
            driveItemId,
            parentFolderId: projectFolderId,
            folderType: type,
            createdAt: new Date(),
          }, { merge: true });
        }
      }

      await batch.commit();
    } catch (firestoreErr) {
      console.error('[OneDrive Folders] Firestore sync warning:', firestoreErr);
    }

    return NextResponse.json({
      success: true,
      rootFolderId: projectFolderId,
      archiiFolderId: archiiId,
      subfolders,
      projectName,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[OneDrive Folders POST]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
