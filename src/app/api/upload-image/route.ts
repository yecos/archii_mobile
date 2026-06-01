import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';

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
 * Validates and returns a compressed image for storage in templates.
 * If the image is too large for Firestore's 1MB field limit, it strips it.
 *
 * In the future, this can be extended to upload to Firebase Storage.
 *
 * Body: { tenantId, imageData (base64 data URL) }
 * Returns: { url: string, sizeBytes: number }
 */
export async function POST(req: NextRequest) {
  try {
    const decoded = await verifyAuth(req);
    const uid = decoded.uid;

    const body = await req.json();
    const { tenantId, imageData } = body;

    if (!tenantId || !imageData) {
      return NextResponse.json({ error: 'tenantId e imageData son requeridos' }, { status: 400 });
    }

    // Verify tenant membership
    const db = getAdminDb();
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (!tenantDoc.exists) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
    }
    const members: string[] = tenantDoc.data()?.members || [];
    if (!members.includes(uid)) {
      return NextResponse.json({ error: 'Sin permisos para este tenant' }, { status: 403 });
    }

    // Check if it's a valid data URL
    if (!imageData.startsWith('data:image/')) {
      return NextResponse.json({ error: 'Formato de imagen inválido' }, { status: 400 });
    }

    // Calculate size
    const base64Part = imageData.split(',')[1] || '';
    const sizeBytes = Math.ceil(base64Part.length * 0.75);

    // If it's already a URL (not base64), just return it
    if (imageData.startsWith('http')) {
      return NextResponse.json({ url: imageData, sizeBytes: 0, stored: 'url' });
    }

    // If too large for Firestore (>900KB), reject and ask client to compress more
    const FIRESTORE_LIMIT = 900000;
    if (sizeBytes > FIRESTORE_LIMIT) {
      return NextResponse.json({
        error: `Imagen demasiado grande (${Math.round(sizeBytes / 1024)}KB). El límite es ~900KB. Comprime la imagen e intenta de nuevo.`,
        sizeBytes,
        limit: FIRESTORE_LIMIT,
      }, { status: 400 });
    }

    return NextResponse.json({
      url: imageData,
      sizeBytes,
      stored: 'inline',
    });
  } catch (err: any) {
    console.error('[upload-image] Error:', err.message);
    if (err.message === 'No autenticado') {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 });
  }
}
