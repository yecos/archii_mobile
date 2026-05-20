/**
 * /api/collab/route.ts
 * Collaboration signaling API route.
 *
 * POST /api/collab
 *   Body: { action, tenantId, documentId, ...params }
 *
 * Actions:
 *   'join'   – Upsert presence document with heartbeat in Firestore collab_presence
 *   'leave'  – Delete presence document
 *   'cursor' – Update presence with cursor position
 *   'comment'– Add to collab_comments subcollection, trigger webhook if webhooks_system enabled
 *   'sync'   – Apply incoming changes with conflict resolution (version vector check)
 *
 * Auth: Firebase ID token (Bearer) + tenant membership verification
 * All operations scoped by tenantId for multi-tenant isolation
 * Rate limited: max 30 req/min per user for cursor updates
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { isFlagEnabled } from '@/lib/feature-flags';
import { checkRateLimit } from '@/lib/rate-limiter';
import { triggerWebhook } from '@/lib/webhook-service';
import { verifyTenantMembership } from '@/lib/tenant-utils';
import { FieldValue } from 'firebase-admin/firestore';

/* ---- Rate limit config per action ---- */

const CURSOR_RATE_LIMIT = { limit: 30, windowSeconds: 60 };
const DEFAULT_RATE_LIMIT = { limit: 120, windowSeconds: 60 };

/* ---- POST handler ---- */

export async function POST(request: NextRequest) {
  try {
    // Feature flag gate
    if (!isFlagEnabled('realtime_collab')) {
      return NextResponse.json(
        { error: 'Colaboración en tiempo real no habilitada' },
        { status: 403 }
      );
    }

    // Auth
    const user = await requireAuth(request);
    const body = await request.json();
    const { action, tenantId, documentId } = body;

    // Validate required fields
    if (!tenantId || !documentId || !action) {
      return NextResponse.json(
        { error: 'tenantId, documentId y action son requeridos' },
        { status: 400 }
      );
    }

    // Verify tenant membership
    const isMember = await verifyTenantMembership(user.uid, tenantId);
    if (!isMember) {
      return NextResponse.json(
        { error: 'No tienes acceso a este tenant' },
        { status: 403 }
      );
    }

    const db = getAdminDb();
    const sessionId = body.sessionId || `${user.uid}_${documentId}`;

    switch (action) {
      /* ---- JOIN: Upsert presence document ---- */
      case 'join': {
        const presenceRef = db
          .collection('tenants')
          .doc(tenantId)
          .collection('collab_presence')
          .doc(sessionId);

        await presenceRef.set(
          {
            userId: user.uid,
            userName: body.userName || user.email,
            userPhoto: body.userPhoto || null,
            userRole: body.userRole || 'Miembro', // display-only; real role enforced by server
            documentId,
            tenantId,
            cursor: null,
            isTyping: false,
            lastHeartbeat: FieldValue.serverTimestamp(),
            joinedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        return NextResponse.json({
          message: 'Sesión de colaboración iniciada',
          sessionId,
        });
      }

      /* ---- LEAVE: Delete presence document ---- */
      case 'leave': {
        await db
          .collection('tenants')
          .doc(tenantId)
          .collection('collab_presence')
          .doc(sessionId)
          .delete();

        return NextResponse.json({ message: 'Sesión de colaboración terminada' });
      }

      /* ---- CURSOR: Update presence with cursor position ---- */
      case 'cursor': {
        // Rate limit cursor updates
        const rateKey = `collab_cursor:${user.uid}:${tenantId}`;
        const rateResult = await checkRateLimit(rateKey, CURSOR_RATE_LIMIT);

        if (!rateResult.allowed) {
          return NextResponse.json(
            {
              error: 'Rate limit excedido para actualizaciones de cursor',
              retryAfter: rateResult.resetAt,
            },
            {
              status: 429,
              headers: {
                'X-RateLimit-Remaining': String(rateResult.remaining),
                'X-RateLimit-Reset': String(rateResult.resetAt),
              },
            }
          );
        }

        const { line, column, section, isTyping } = body;
        if (typeof line !== 'number' || typeof column !== 'number') {
          return NextResponse.json(
            { error: 'line y column son requeridos (números)' },
            { status: 400 }
          );
        }

        const updateData: Record<string, any> = {
          cursor: {
            line,
            column,
            ...(section ? { section } : {}),
          },
          lastHeartbeat: FieldValue.serverTimestamp(),
        };

        if (typeof isTyping === 'boolean') {
          updateData.isTyping = isTyping;
        }

        await db
          .collection('tenants')
          .doc(tenantId)
          .collection('collab_presence')
          .doc(sessionId)
          .update(updateData);

        return NextResponse.json({
          message: 'Cursor actualizado',
          remaining: rateResult.remaining,
        });
      }

      /* ---- COMMENT: Add anchored comment ---- */
      case 'comment': {
        const { text, location } = body;

        if (!text?.trim()) {
          return NextResponse.json(
            { error: 'text es requerido para el comentario' },
            { status: 400 }
          );
        }

        if (!location || typeof location.line !== 'number') {
          return NextResponse.json(
            { error: 'location con line es requerido' },
            { status: 400 }
          );
        }

        const commentRef = await db
          .collection('tenants')
          .doc(tenantId)
          .collection('collab_comments')
          .add({
            documentId,
            tenantId,
            userId: user.uid,
            userName: body.userName || user.email,
            userPhoto: body.userPhoto || null,
            userRole: body.userRole || 'Miembro',
            location,
            text: text.trim(),
            status: 'active',
            parentId: body.parentId || null,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });

        // Trigger webhook if webhooks_system is enabled
        if (isFlagEnabled('webhooks_system')) {
          triggerWebhook(
            'comment.created',
            tenantId,
            'collab_comments',
            commentRef.id,
            {
              documentId,
              userId: user.uid,
              userName: body.userName || user.email,
              location,
              text: text.trim(),
              parentId: body.parentId || null,
            }
          );
        }

        return NextResponse.json(
          {
            message: 'Comentario agregado',
            commentId: commentRef.id,
          },
          { status: 201 }
        );
      }

      /* ---- SYNC: Apply incoming changes with conflict resolution ---- */
      case 'sync': {
        const { changes, version } = body;

        if (!Array.isArray(changes) || changes.length === 0) {
          return NextResponse.json(
            { error: 'changes debe ser un array no vacío' },
            { status: 400 }
          );
        }
        if (changes.length > 200) {
          return NextResponse.json(
            { error: 'Máximo 200 cambios por solicitud' },
            { status: 400 }
          );
        }

        if (!version || typeof version !== 'object') {
          return NextResponse.json(
            { error: 'version (vector de versión) es requerido' },
            { status: 400 }
          );
        }
        // Validate version vector keys and values
        for (const [key, val] of Object.entries(version)) {
          if (typeof val !== 'number') {
            return NextResponse.json(
              { error: 'version vector values must be numbers' },
              { status: 400 }
            );
          }
        }

        // General rate limit for sync
        const syncRateKey = `collab_sync:${user.uid}:${tenantId}`;
        const syncRate = await checkRateLimit(syncRateKey, DEFAULT_RATE_LIMIT);
        if (!syncRate.allowed) {
          return NextResponse.json(
            { error: 'Rate limit excedido para sincronización' },
            { status: 429 }
          );
        }

        const docRef = db
          .collection('tenants')
          .doc(tenantId)
          .collection('collab_documents')
          .doc(documentId);

        // Use Firestore transaction for conflict resolution
        let mergedVersion: Record<string, number> = {};
        let conflicted = false;

        await db.runTransaction(async (tx) => {
          const txDoc = await tx.get(docRef);
          const existing = txDoc.exists ? txDoc.data() : null;
          const serverVersion: Record<string, number> = existing?.version || {};
          const changeLog = existing?.changeLog || [];

          // Detect conflicts
          for (const [uid, clientVer] of Object.entries(version)) {
            const serverVer = serverVersion[uid] || 0;
            if ((clientVer as number) < serverVer) {
              conflicted = true;
            }
          }

          // Merge version vectors (take max)
          mergedVersion = { ...serverVersion };
          for (const [uid, ver] of Object.entries(version)) {
            mergedVersion[uid] = Math.max(
              mergedVersion[uid] || 0,
              ver as number
            );
          }

          // Append new changes to log
          const updatedLog = [...changeLog, ...changes].slice(-500);

          if (existing) {
            tx.update(docRef, {
              version: mergedVersion,
              modifiedBy: user.uid,
              lastModified: FieldValue.serverTimestamp(),
              changeLog: updatedLog,
            });
          } else {
            tx.set(docRef, {
              documentId,
              tenantId,
              content: {},
              version: mergedVersion,
              lastModified: FieldValue.serverTimestamp(),
              modifiedBy: user.uid,
              changeLog: updatedLog,
            });
          }
        });

        return NextResponse.json({
          message: conflicted ? 'Cambios sincronizados con conflictos resueltos' : 'Cambios sincronizados',
          version: mergedVersion,
          conflicted,
        });
      }

      default:
        return NextResponse.json(
          {
            error: `Acción no válida: ${action}. Usa 'join', 'leave', 'cursor', 'comment' o 'sync'`,
          },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('[Collab API] POST error:', error?.message);

    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
