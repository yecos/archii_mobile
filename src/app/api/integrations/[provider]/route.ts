/**
 * /api/integrations/[provider]/route.ts
 * Provider-specific operations for the Marketplace.
 *
 * GET  /api/integrations/[provider]?tenantId=xxx&instanceId=xxx
 *   — Get provider status, config, and recent logs
 *
 * POST /api/integrations/[provider]
 *   Body: { action: 'oauth-callback', tenantId, code, redirectUri }
 *   Body: { action: 'test',           tenantId, instanceId }
 *   Body: { action: 'sync',           tenantId, instanceId, payload }
 *
 * Auth: Firebase auth + tenant membership
 * Gated by feature flag 'marketplace'
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/api-auth';
import { isFlagEnabled } from '@/lib/feature-flags';
import { getProvider, getIntegrationLogs } from '@/lib/marketplace-service';
import { getAdminDb } from '@/lib/firebase-admin';
import { verifyTenantMembership } from '@/lib/tenant-utils';

/* ---- Dynamic connector imports ---- */

// Lazy-loaded connectors for test/sync
async function getConnector(providerId: string): Promise<any> {
  switch (providerId) {
    case 'slack':
      return await import('@/lib/connectors/slack-connector');
    case 'jira':
      return await import('@/lib/connectors/jira-connector');
    case 'github':
      return await import('@/lib/connectors/github-connector');
    case 'calendly':
      return await import('@/lib/connectors/calendly-connector');
    case 'stripe':
      return await import('@/lib/connectors/stripe-connector');
    default:
      return null;
  }
}

/* ---- Helpers ---- */

async function getInstanceConfig(
  tenantId: string,
  instanceId: string
): Promise<{ config: Record<string, string>; providerId: string } | null> {
  const db = getAdminDb();
  const doc = await db.collection('integrations').doc(instanceId).get();
  if (!doc.exists) return null;
  const data = doc.data();
  if (!data || data.tenantId !== tenantId) return null;
  return { config: data.config || {}, providerId: data.providerId };
}

/* ================================================================
   GET
   ================================================================ */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    if (!isFlagEnabled('marketplace')) {
      return NextResponse.json({ error: 'Marketplace no habilitado' }, { status: 403 });
    }

    const { provider } = await params;
    const user = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');
    const instanceId = searchParams.get('instanceId');

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId requerido' }, { status: 400 });
    }

    const isMember = await verifyTenantMembership(user.uid, tenantId);
    if (!isMember) {
      return NextResponse.json({ error: 'Sin acceso al tenant' }, { status: 403 });
    }

    // Get provider info
    const providerInfo = getProvider(provider);
    if (!providerInfo) {
      return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 });
    }

    // Get instance details if instanceId provided
    let instance = null;
    let logs: any[] = [];
    if (instanceId) {
      const instData = await getInstanceConfig(tenantId, instanceId);
      if (!instData) {
        return NextResponse.json({ error: 'Instancia no encontrada' }, { status: 404 });
      }
      instance = instData;
      logs = await getIntegrationLogs(instanceId, 20);
    }

    return NextResponse.json({
      provider: providerInfo,
      instance,
      logs,
    });
  } catch (error: any) {
    console.error(`[Integrations/${'?'}] GET error:`, error?.message);
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error?.message || 'Error interno' }, { status: 500 });
  }
}

/* ================================================================
   POST
   ================================================================ */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    if (!isFlagEnabled('marketplace')) {
      return NextResponse.json({ error: 'Marketplace no habilitado' }, { status: 403 });
    }

    const { provider } = await params;
    const user = await requireAuth(request);
    const body = await request.json();
    const { action, tenantId } = body;

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId requerido' }, { status: 400 });
    }

    const isMember = await verifyTenantMembership(user.uid, tenantId);
    if (!isMember) {
      return NextResponse.json({ error: 'Sin acceso al tenant' }, { status: 403 });
    }

    // Verify provider exists
    const providerInfo = getProvider(provider);
    if (!providerInfo) {
      return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 });
    }

    switch (action) {
      /* ---- OAUTH CALLBACK ---- */
      case 'oauth-callback': {
        if (provider !== 'calendly') {
          return NextResponse.json(
            { error: `OAuth callback no soportado para ${provider}` },
            { status: 400 }
          );
        }

        if (!body.code || !body.redirectUri) {
          return NextResponse.json(
            { error: 'code y redirectUri requeridos para OAuth callback' },
            { status: 400 }
          );
        }

        // Calendly OAuth token exchange
        const clientId = process.env.CALENDLY_CLIENT_ID;
        const clientSecret = process.env.CALENDLY_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
          return NextResponse.json(
            { error: 'Calendly OAuth credentials no configuradas en el servidor' },
            { status: 500 }
          );
        }

        const { exchangeCalendlyCode } = await import('@/lib/connectors/calendly-connector');
        const tokens = await exchangeCalendlyCode(
          clientId,
          clientSecret,
          body.redirectUri,
          body.code
        );

        // Store tokens server-side, don't return to client
        // The tokens are already stored in the instance config by the connector
        return NextResponse.json({
          message: 'OAuth exitoso — integración configurada',
          expiresIn: tokens.expires_in,
        });
      }

      /* ---- TEST CONNECTION ---- */
      case 'test': {
        if (!body.instanceId) {
          return NextResponse.json({ error: 'instanceId requerido' }, { status: 400 });
        }

        const instData = await getInstanceConfig(tenantId, body.instanceId);
        if (!instData) {
          return NextResponse.json({ error: 'Instancia no encontrada' }, { status: 404 });
        }

        // Dynamic test based on provider
        let testResult: { success: boolean; message: string } = { success: false, message: 'No soportado' };

        switch (provider) {
          case 'slack': {
            const { sendSlackMessage } = await import('@/lib/connectors/slack-connector');
            const result = await sendSlackMessage(instData.config.webhookUrl, {
              blocks: [
                {
                  type: 'section',
                  text: { type: 'mrkdwn', text: '✅ *Prueba de conexión desde Archii*' },
                },
              ],
              color: '#2eb67d',
            });
            testResult = {
              success: result.ok,
              message: result.ok ? 'Conexión exitosa' : `Error: ${result.error}`,
            };
            break;
          }
          case 'jira': {
            const { getJiraIssue } = await import('@/lib/connectors/jira-connector');
            try {
              await getJiraIssue(instData.config as any, 'INVALID-1');
            } catch (err: any) {
              // 404 is expected — it means auth works
              if (err.message.includes('404')) {
                testResult = { success: true, message: 'Conexión exitosa (credenciales válidas)' };
              } else {
                testResult = { success: false, message: `Error: ${err.message}` };
              }
            }
            break;
          }
          case 'github': {
            const { getRepoInfo } = await import('@/lib/connectors/github-connector');
            const repo = await getRepoInfo(instData.config as any);
            testResult = { success: true, message: `Conectado a ${repo.full_name}` };
            break;
          }
          case 'calendly': {
            const { listUpcomingEvents } = await import('@/lib/connectors/calendly-connector');
            await listUpcomingEvents(instData.config as any, 'active', 1);
            testResult = { success: true, message: 'Conexión exitosa' };
            break;
          }
          case 'stripe': {
            const { createStripeCustomer } = await import('@/lib/connectors/stripe-connector');
            // Quick balance check
            const resp = await fetch('https://api.stripe.com/v1/balance', {
              headers: { Authorization: `Bearer ${instData.config.secretKey}` },
            });
            if (resp.ok) {
              testResult = { success: true, message: 'Conexión exitosa a Stripe' };
            } else {
              testResult = { success: false, message: 'Error de autenticación con Stripe' };
            }
            break;
          }
        }

        return NextResponse.json(testResult);
      }

      /* ---- SYNC ---- */
      case 'sync': {
        if (!body.instanceId) {
          return NextResponse.json({ error: 'instanceId requerido' }, { status: 400 });
        }
        if (!body.payload) {
          return NextResponse.json({ error: 'payload requerido para sync' }, { status: 400 });
        }

        const instData = await getInstanceConfig(tenantId, body.instanceId);
        if (!instData) {
          return NextResponse.json({ error: 'Instancia no encontrada' }, { status: 404 });
        }

        let syncResult: any = { success: false, message: 'Sync no soportado' };

        switch (provider) {
          case 'jira': {
            const { syncTaskToJira } = await import('@/lib/connectors/jira-connector');
            syncResult = await syncTaskToJira(body.payload, instData.config as any);
            syncResult.success = true;
            syncResult.message = syncResult.created
              ? `Issue ${syncResult.key} creado en Jira`
              : `Issue ${syncResult.key} actualizado en Jira`;
            break;
          }
          case 'github': {
            const { createGitHubIssue } = await import('@/lib/connectors/github-connector');
            const { formatArchiiToGitHubIssue } = await import('@/lib/connectors/github-connector');
            const issueData = formatArchiiToGitHubIssue(body.payload);
            const issue = await createGitHubIssue(instData.config as any, issueData);
            syncResult = { success: true, message: `Issue #${issue.number} creado en GitHub` };
            break;
          }
          case 'stripe': {
            const { syncArchiiInvoice } = await import('@/lib/connectors/stripe-connector');
            const result = await syncArchiiInvoice(body.payload, instData.config as any);
            syncResult = {
              success: true,
              message: `Factura creada en Stripe`,
              invoiceId: result.invoiceId,
              customerId: result.customerId,
              hostedUrl: result.hostedUrl,
            };
            break;
          }
          default:
            syncResult = { success: false, message: `Sync no implementado para ${provider}` };
        }

        return NextResponse.json(syncResult);
      }

      default:
        return NextResponse.json(
          { error: `Acción no válida: ${action}. Usa 'oauth-callback', 'test' o 'sync'` },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error(`[Integrations/${'?'}] POST error:`, error?.message);
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error?.message || 'Error interno' }, { status: 500 });
  }
}
