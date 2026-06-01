import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp, getAdminAuth } from '@/lib/firebase-admin';

/* ─── Helper: verify auth ─── */
async function verifyAuth(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) throw new Error('No autenticado');
  const decoded = await getAdminAuth().verifyIdToken(token);
  return decoded;
}

/**
 * POST /api/upload-image
 * Uploads a base64 image to Firebase Storage and returns the download URL.
 * This avoids Firestore's ~1MB field size limit for large images.
 *
 * Body: { tenantId, imageData (base64 data URL), path (storage path), contentType? }
 * Returns: { url: string, path: string }
 *
 * The path should be something like "carnet-templates/background" or "carnet-templates/logo"
 * The file will be stored at: tenants/{tenantId}/{path}/{timestamp}.jpg
 */
export async function POST(req: NextRequest) {
  try {
    const decoded = await verifyAuth(req);
    const uid = decoded.uid;

    const body = await req.json();
    const { tenantId, imageData, path: storagePath, contentType } = body;

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId es requerido' }, { status: 400 });
    }

    // If it's already a URL (not base64), just return it — no need to re-upload
    if (imageData && (imageData.startsWith('https://') || imageData.startsWith('http://'))) {
      return NextResponse.json({ url: imageData, path: '', stored: 'url' });
    }

    if (!imageData || !imageData.startsWith('data:image/')) {
      return NextResponse.json({ error: 'imageData debe ser un data URL de imagen (data:image/...)' }, { status: 400 });
    }

    // Verify tenant membership
    const adminApp = getAdminApp();
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore(adminApp);
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (!tenantDoc.exists) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
    }
    const members: string[] = tenantDoc.data()?.members || [];
    if (!members.includes(uid)) {
      return NextResponse.json({ error: 'Sin permisos para este tenant' }, { status: 403 });
    }

    // Decode base64 data URL to Buffer
    const matches = imageData.match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/);
    if (!matches || !matches[2]) {
      return NextResponse.json({ error: 'Formato de data URL inválido' }, { status: 400 });
    }

    const mimeType = matches[1] || contentType || 'image/jpeg';
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');

    // Build storage path: tenants/{tenantId}/{path}/{timestamp}_{random}.ext
    const safePath = (storagePath || 'carnet-templates/images').replace(/^\/+|\/+$/g, '');
    const ext = mimeType.includes('png') ? 'png' : 'jpg';
    const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const filePath = `tenants/${tenantId}/${safePath}/${fileName}`;

    // Upload to Firebase Storage using Admin SDK
    const { getStorage } = await import('firebase-admin/storage');
    const bucket = getStorage(adminApp).bucket();
    const file = bucket.file(filePath);

    await file.save(buffer, {
      metadata: {
        contentType: mimeType,
        cacheControl: 'public, max-age=31536000, immutable',
        metadata: {
          uploadedBy: uid,
          tenantId,
        },
      },
      public: true, // Make publicly accessible via download URL
    });

    // Get the public download URL
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

    console.log(`[upload-image] Uploaded ${filePath} (${buffer.length} bytes) for tenant ${tenantId}`);

    return NextResponse.json({
      url: publicUrl,
      path: filePath,
      sizeBytes: buffer.length,
      stored: 'storage',
    });
  } catch (err: any) {
    console.error('[upload-image] Error:', err.message, err.stack);
    if (err.message === 'No autenticado') {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 });
  }
}
