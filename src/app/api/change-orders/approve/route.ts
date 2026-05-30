import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getAdminDb, getAdminFieldValue } from '@/lib/firebase-admin';

/**
 * POST /api/change-orders/approve
 * Approve or reject a change order.
 * When approving with cost impact, updates the project budget.
 * When approving with schedule impact, updates the project endDate.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const body = await request.json();
    const { coId, action, comments, uid, name } = body;

    if (!coId || !action || !uid || !name) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos: coId, action, uid, name' },
        { status: 400 }
      );
    }

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json(
        { error: 'Acción inválida. Debe ser "approve" o "reject"' },
        { status: 400 }
      );
    }

    if (action === 'reject' && (!comments || !comments.trim())) {
      return NextResponse.json(
        { error: 'Se requiere una razón para rechazar' },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    const FieldValue = getAdminFieldValue();

    // Get the change order
    const coRef = db.collection('changeOrders').doc(coId);
    const coSnap = await coRef.get();

    if (!coSnap.exists) {
      return NextResponse.json(
        { error: 'Orden de cambio no encontrada' },
        { status: 404 }
      );
    }

    const coData = coSnap.data()!;

    // Verify the CO is in pending status
    if (coData.status !== 'pendiente_aprobacion') {
      return NextResponse.json(
        { error: 'La orden no está pendiente de aprobación' },
        { status: 400 }
      );
    }

    const now = FieldValue.serverTimestamp();

    if (action === 'approve') {
      // Update the change order
      const coUpdates: Record<string, any> = {
        status: 'aprobada',
        approvedBy: uid,
        approvedByName: name,
        approvedAt: now,
        reviewedComments: comments || '',
        history: FieldValue.arrayUnion({
          action: 'approved',
          by: uid,
          byName: name,
          at: now,
          comments: comments || 'Orden aprobada',
        }),
      };

      await coRef.update(coUpdates);

      // If there's cost impact, update the project budget
      if (coData.costImpact && coData.projectId) {
        const projectRef = db.collection('projects').doc(coData.projectId);
        const projectSnap = await projectRef.get();

        if (projectSnap.exists) {
          const projectData = projectSnap.data()!;
          const newBudget = coData.costImpact.newBudget || projectData.budget;
          await projectRef.update({
            budget: newBudget,
            updatedAt: now,
          });
        }
      }

      // If there's schedule impact, update the project endDate
      if (coData.scheduleImpact && coData.scheduleImpact.daysExtension > 0 && coData.projectId) {
        const projectRef = db.collection('projects').doc(coData.projectId);
        const projectSnap = await projectRef.get();

        if (projectSnap.exists) {
          const projectData = projectSnap.data()!;
          if (projectData.endDate) {
            const currentEnd = new Date(projectData.endDate);
            currentEnd.setDate(currentEnd.getDate() + coData.scheduleImpact.daysExtension);
            const newEndDate = currentEnd.toISOString().split('T')[0];
            await projectRef.update({
              endDate: newEndDate,
              updatedAt: now,
            });
          }
        }
      }

      return NextResponse.json({ success: true, status: 'aprobada' });
    } else {
      // Reject
      const coUpdates: Record<string, any> = {
        status: 'rechazada',
        rejectionReason: comments,
        reviewedComments: comments,
        history: FieldValue.arrayUnion({
          action: 'rejected',
          by: uid,
          byName: name,
          at: now,
          comments: comments,
        }),
      };

      await coRef.update(coUpdates);

      return NextResponse.json({ success: true, status: 'rechazada' });
    }
  } catch (err: any) {
    console.error('[Archii] Change order approve/reject error:', err);
    const status = err.status || 500;
    const message = err.message || 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status });
  }
}
