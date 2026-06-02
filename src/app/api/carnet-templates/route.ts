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

/* ─── Helper: check tenant membership ─── */
async function isTenantMember(uid: string, tenantId: string): Promise<boolean> {
  const db = getAdminDb();
  const tenantDoc = await db.collection('tenants').doc(tenantId).get();
  if (!tenantDoc.exists) return false;
  const members: string[] = tenantDoc.data()?.members || [];
  return members.includes(uid);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, tenantId, templateId, template } = body;

    // ─── Public: none, all actions require auth ───
    const decoded = await verifyAuth(req);
    const uid = decoded.uid;

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId es requerido' }, { status: 400 });
    }

    const isMember = await isTenantMember(uid, tenantId);
    if (!isMember) {
      return NextResponse.json({ error: 'Sin permisos para este tenant' }, { status: 403 });
    }

    const db = getAdminDb();
    const col = db.collection('carnet-templates');

    switch (action) {
      /* ─── LIST ─── */
      case 'list': {
        const snap = await col.where('tenantId', '==', tenantId).get();
        const templates = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Sort: default first, then by name
        templates.sort((a: any, b: any) => {
          if (a.isDefault && !b.isDefault) return -1;
          if (!a.isDefault && b.isDefault) return 1;
          return (a.name || '').localeCompare(b.name || '');
        });
        return NextResponse.json({ templates });
      }

      /* ─── GET ─── */
      case 'get': {
        if (!templateId) return NextResponse.json({ error: 'templateId requerido' }, { status: 400 });
        const doc = await col.doc(templateId).get();
        if (!doc.exists) return NextResponse.json({ error: 'Template no encontrado' }, { status: 404 });
        const data = doc.data();
        if (data?.tenantId !== tenantId) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
        return NextResponse.json({ id: doc.id, ...data });
      }

      /* ─── SAVE (create or update) ─── */
      case 'save': {
        if (!template) return NextResponse.json({ error: 'template requerido' }, { status: 400 });

        // Validate required fields
        if (!template.name?.trim()) {
          return NextResponse.json({ error: 'Nombre del template es requerido' }, { status: 400 });
        }
        if (!template.elements || !Array.isArray(template.elements)) {
          return NextResponse.json({ error: 'Elements debe ser un array' }, { status: 400 });
        }

        // Safety net: strip any oversized base64 images that somehow slipped through
        // Firestore limit: ~1,048,487 bytes per field value
        const FIRESTORE_FIELD_LIMIT = 900000;
        const sanitizeOversizedImages = (data: any): any => {
          const cleaned = { ...data };
          if (cleaned.backgroundImage && typeof cleaned.backgroundImage === 'string' && cleaned.backgroundImage.startsWith('data:') && cleaned.backgroundImage.length > FIRESTORE_FIELD_LIMIT) {
            console.warn('[carnet-templates] Removing oversized backgroundImage:', cleaned.backgroundImage.length, 'bytes');
            delete cleaned.backgroundImage;
          }
          if (cleaned.logo?.image && typeof cleaned.logo.image === 'string' && cleaned.logo.image.startsWith('data:') && cleaned.logo.image.length > FIRESTORE_FIELD_LIMIT) {
            console.warn('[carnet-templates] Removing oversized logo image:', cleaned.logo.image.length, 'bytes');
            cleaned.logo = { ...cleaned.logo, image: '' };
          }
          if (Array.isArray(cleaned.elements)) {
            cleaned.elements = cleaned.elements.map((el: any) => {
              if (el.image && typeof el.image === 'string' && el.image.startsWith('data:') && el.image.length > FIRESTORE_FIELD_LIMIT) {
                console.warn('[carnet-templates] Removing oversized element image:', el.image.length, 'bytes');
                return { ...el, image: '' };
              }
              return el;
            });
          }
          return cleaned;
        };

        const now = new Date();

        if (template.id) {
          // Update existing
          const docRef = col.doc(template.id);
          const existing = await docRef.get();
          if (!existing.exists) return NextResponse.json({ error: 'Template no encontrado' }, { status: 404 });
          if (existing.data()?.tenantId !== tenantId) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });

          const updateData = sanitizeOversizedImages({
            ...template,
            tenantId,
            updatedAt: now,
          });
          delete updateData.id;
          await docRef.update(updateData);
          return NextResponse.json({ id: template.id, message: 'Template actualizado' });
        } else {
          // Create new
          const docData = sanitizeOversizedImages({
            ...template,
            tenantId,
            createdAt: now,
            updatedAt: now,
          });
          delete docData.id;
          const ref = await col.add(docData);
          return NextResponse.json({ id: ref.id, message: 'Template creado' });
        }
      }

      /* ─── DELETE ─── */
      case 'delete': {
        if (!templateId) return NextResponse.json({ error: 'templateId requerido' }, { status: 400 });
        const docRef = col.doc(templateId);
        const existing = await docRef.get();
        if (!existing.exists) return NextResponse.json({ error: 'Template no encontrado' }, { status: 404 });
        if (existing.data()?.tenantId !== tenantId) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
        await docRef.delete();
        return NextResponse.json({ message: 'Template eliminado' });
      }

      /* ─── SET DEFAULT ─── */
      case 'set-default': {
        if (!templateId) return NextResponse.json({ error: 'templateId requerido' }, { status: 400 });

        // Unset all defaults for this tenant and side
        const side = template?.side || 'front';
        const snap = await col.where('tenantId', '==', tenantId).where('side', '==', side).where('isDefault', '==', true).get();
        const batch = db.batch();
        snap.docs.forEach(d => {
          batch.update(d.ref, { isDefault: false });
        });

        // Set the new default
        batch.update(col.doc(templateId), { isDefault: true });
        await batch.commit();

        return NextResponse.json({ message: 'Template establecido como default' });
      }

      /* ─── DUPLICATE ─── */
      case 'duplicate': {
        if (!templateId) return NextResponse.json({ error: 'templateId requerido' }, { status: 400 });
        const srcDoc = await col.doc(templateId).get();
        if (!srcDoc.exists) return NextResponse.json({ error: 'Template no encontrado' }, { status: 404 });
        const srcData = srcDoc.data()!;
        if (srcData?.tenantId !== tenantId) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });

        const now = new Date();
        const newTemplate: any = {
          ...srcData,
          name: `${srcData!.name} (copia)`,
          isDefault: false,
          createdAt: now,
          updatedAt: now,
        };
        // Regenerate element IDs to avoid duplicates
        newTemplate.elements = (newTemplate.elements || []).map((el: any) => ({
          ...el,
          id: `${el.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        }));
        delete newTemplate.id;

        const ref = await col.add(newTemplate);
        return NextResponse.json({ id: ref.id, message: 'Template duplicado' });
      }

      default:
        return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
    }
  } catch (err: any) {
    console.error('[carnet-templates] Error:', err.message);
    if (err.message === 'No autenticado') {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    // Handle Firebase quota exhaustion
    const code = err.code || '';
    if (code === 'RESOURCE_EXHAUSTED' || err.message.includes('quota') || err.message.includes('Quota') || err.message.includes('RESOURCE_EXHAUSTED')) {
      return NextResponse.json(
        { error: 'Cuota de Firebase excedida. Intente de nuevo más tarde.', isQuotaError: true },
        { status: 429 }
      );
    }
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 });
  }
}
