/**
 * /api/webhooks/route.ts
 * Gestión de webhooks y log de entregas.
 *
 * POST /api/webhooks
 *   Body: { action: 'create', tenantId, url, events?, name?, customHeaders? }
 *   Body: { action: 'delete', tenantId, webhookId }
 *   Body: { action: 'test', tenantId, webhookId }
 *
 * GET /api/webhooks?tenantId=xxx
 *   — Lista webhooks del tenant
 *
 * GET /api/webhooks?tenantId=xxx&deliveries=true
 *   — Lista log de entregas recientes
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import {
  createWebhook,
  listWebhooks,
  deleteWebhook,
  getWebhookDeliveries,
  generateWebhookSecret,
  dispatchWebhookEvent,
  generateEventId,
  type WebhookEventType,
} from '@/lib/webhook-service';
import { isFlagEnabled } from '@/lib/feature-flags';

export async function GET(request: NextRequest) {
  try {
    if (!isFlagEnabled('webhooks_system')) {
      return NextResponse.json({ error: 'Sistema de webhooks no habilitado' }, { status: 403 });
    }

    const user = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');
    const deliveries = searchParams.get('deliveries') === 'true';

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId requerido' }, { status: 400 });
    }

    // Verify tenant membership
    const { getAdminDb } = await import('@/lib/firebase-admin');
    const db = getAdminDb();
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (!tenantDoc.exists) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
    }
    const tData = tenantDoc.data()!;
    const hasAccess = (tData.members || []).includes(user.uid) || tData.createdBy === user.uid || (tData.superAdmins || []).includes(user.uid);
    if (!hasAccess) {
      return NextResponse.json({ error: 'No tienes acceso a este tenant' }, { status: 403 });
    }

    if (deliveries) {
      const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10) || 50, 1), 200);
      const logs = await getWebhookDeliveries(tenantId, limit);
      return NextResponse.json({ deliveries: logs, count: logs.length });
    }

    const webhooks = await listWebhooks(tenantId);
    return NextResponse.json({ webhooks, count: webhooks.length });
  } catch (error: any) {
    console.error('[Webhooks API] GET error:', error?.message);
    if (error?.status === 401) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    return NextResponse.json({ error: error?.message || 'Error interno' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isFlagEnabled('webhooks_system')) {
      return NextResponse.json({ error: 'Sistema de webhooks no habilitado' }, { status: 403 });
    }

    const user = await requireAuth(request);
    const body = await request.json();
    const { action, tenantId } = body;

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId requerido' }, { status: 400 });
    }

    // Verify tenant membership
    const { getAdminDb } = await import('@/lib/firebase-admin');
    const db = getAdminDb();
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (!tenantDoc.exists) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
    }
    const tData = tenantDoc.data()!;
    const hasAccess = (tData.members || []).includes(user.uid) || tData.createdBy === user.uid || (tData.superAdmins || []).includes(user.uid);
    if (!hasAccess) {
      return NextResponse.json({ error: 'No tienes acceso a este tenant' }, { status: 403 });
    }

    switch (action) {
      case 'create': {
        if (!body.url?.trim()) {
          return NextResponse.json({ error: 'url requerida' }, { status: 400 });
        }

        // Validar URL
        try {
          new URL(body.url);
        } catch {
          return NextResponse.json({ error: 'URL inválida' }, { status: 400 });
        }

        // SSRF protection (SEC-H08): comprehensive check against private/internal IPs
        const parsedUrl = new URL(body.url);
        const hostname = parsedUrl.hostname.toLowerCase();

        // Block known internal hostnames
        const blockedHostnames = ['localhost', '0.0.0.0', 'metadata.google.internal', 'metadata.internal'];
        if (blockedHostnames.includes(hostname) || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
          return NextResponse.json({ error: 'URLs internas no permitidas' }, { status: 400 });
        }

        // Block IPv4/IPv6 private ranges
        const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
        const ipv6Regex = /^\[([0-9a-f:]+)\]$/i;
        const ipv4Match = hostname.match(ipv4Regex);
        const ipv6Match = hostname.match(ipv6Regex);

        if (ipv4Match) {
          const [, a, b] = ipv4Match.map(Number);
          if (a === 127 || a === 10) {
            return NextResponse.json({ error: 'URLs internas no permitidas' }, { status: 400 });
          }
          // 172.16.0.0/12 (SEC-H08: was incorrectly blocking ALL 172.*)
          if (a === 172 && b >= 16 && b <= 31) {
            return NextResponse.json({ error: 'URLs internas no permitidas' }, { status: 400 });
          }
          if (a === 192 && b === 168) {
            return NextResponse.json({ error: 'URLs internas no permitidas' }, { status: 400 });
          }
          // 169.254.0.0/16 (link-local, includes cloud metadata)
          if (a === 169 && b === 254) {
            return NextResponse.json({ error: 'URLs internas no permitidas' }, { status: 400 });
          }
          // 100.64.0.0/10 (carrier-grade NAT)
          if (a === 100 && b >= 64 && b <= 127) {
            return NextResponse.json({ error: 'URLs internas no permitidas' }, { status: 400 });
          }
          // 198.18.0.0/15 (benchmark testing)
          if (a === 198 && (b === 18 || b === 19)) {
            return NextResponse.json({ error: 'URLs internas no permitidas' }, { status: 400 });
          }
        }

        // Block IPv6 loopback and private
        if (ipv6Match) {
          const addr = ipv6Match[1];
          if (addr === '::1' || addr.startsWith('fc') || addr.startsWith('fd') || addr.startsWith('fe80')) {
            return NextResponse.json({ error: 'URLs internas no permitidas' }, { status: 400 });
          }
          // Block IPv6-mapped IPv4 (::ffff:127.0.0.1 etc)
          if (addr.includes('::ffff:')) {
            return NextResponse.json({ error: 'URLs internas no permitidas' }, { status: 400 });
          }
        }

        // Block ::1 directly
        if (hostname === '::1') {
          return NextResponse.json({ error: 'URLs internas no permitidas' }, { status: 400 });
        }

        // Validate events
        const validEvents = ['task.created', 'task.updated', 'task.deleted', 'project.created', 'project.updated', 'task.assigned', 'task.completed', 'comment.created', 'member.joined', 'member.removed'];
        const events = (body.events || []).filter((e: string) => validEvents.includes(e));

        // SEC-M10: Block dangerous custom headers (expanded blocklist)
        const blockedHeaders = [
          'authorization', 'cookie', 'host', 'proxy-authorization',
          'x-api-key', 'x-auth-token', 'x-csrf-token', 'x-forwarded-for',
          'x-forwarded-host', 'x-forwarded-proto', 'x-original-url', 'x-rewrite-url',
          'set-cookie', 'forwarded', 'te', 'transfer-encoding', 'origin', 'referer',
        ];
        const customHeaders = body.customHeaders || {};
        for (const key of Object.keys(customHeaders)) {
          const lowerKey = key.toLowerCase();
          if (blockedHeaders.includes(lowerKey) || lowerKey.startsWith('proxy-')) {
            return NextResponse.json({ error: `Header "${key}" no permitido` }, { status: 400 });
          }
        }

        const secret = generateWebhookSecret();
        const webhookId = await createWebhook({
          tenantId,
          url: body.url,
          events,
          secret,
          name: body.name || body.url,
          active: body.active !== false,
          customHeaders,
          createdBy: user.uid,
        });

        return NextResponse.json({
          message: 'Webhook creado exitosamente',
          webhookId,
          secret,
          url: body.url,
        }, { status: 201 });
      }

      case 'delete': {
        if (!body.webhookId) {
          return NextResponse.json({ error: 'webhookId requerido' }, { status: 400 });
        }

        const deleted = await deleteWebhook(body.webhookId, tenantId);
        if (!deleted) {
          return NextResponse.json(
            { error: 'Webhook no encontrado o no pertenece al tenant' },
            { status: 404 }
          );
        }

        return NextResponse.json({ message: 'Webhook eliminado' });
      }

      case 'test': {
        if (!body.webhookId) {
          return NextResponse.json({ error: 'webhookId requerido' }, { status: 400 });
        }

        // Enviar un evento de prueba
        await dispatchWebhookEvent({
          event: 'task.created',
          tenantId,
          resourceId: 'test-id',
          resourceType: 'test',
          payload: {
            message: 'Webhook de prueba desde Archii',
            timestamp: new Date().toISOString(),
          },
          timestamp: new Date().toISOString(),
          eventId: generateEventId(),
        });

        return NextResponse.json({ message: 'Evento de prueba enviado' });
      }

      default:
        return NextResponse.json(
          { error: `Acción no válida: ${action}. Usa 'create', 'delete' o 'test'` },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('[Webhooks API] POST error:', error?.message);
    if (error?.status === 401) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    return NextResponse.json({ error: error?.message || 'Error interno' }, { status: 500 });
  }
}
