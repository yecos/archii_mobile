/**
 * /api/health-score/route.ts
 * Endpoint para consultar y calcular Health Scores.
 *
 * GET /api/health-score?tenantId=xxx&projectId=yyy
 *   — Obtiene el último health score de un proyecto
 *
 * GET /api/health-score?tenantId=xxx&projectId=yyy&history=true
 *   — Obtiene historial de scores
 *
 * POST /api/health-score
 *   Body: { action: 'calculate', tenantId, projectId? }
 *   — Calcula score(s) para el tenant (o proyecto específico)
 *
 * POST /api/health-score
 *   Body: { action: 'calculate-all', tenantId }
 *   — Calcula scores para todos los proyectos del tenant
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import {
  getHealthScoreHistory,
  calculateAllTenantScores,
  getHealthColor,
  getHealthEmoji,
} from '@/lib/health-score';
import { getAdminDb } from '@/lib/firebase-admin';
import { isFlagEnabled } from '@/lib/feature-flags';

export async function GET(request: NextRequest) {
  try {
    if (!isFlagEnabled('health_score_predictive')) {
      return NextResponse.json(
        { error: 'Health Score no está habilitado' },
        { status: 403 }
      );
    }

    const user = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');
    const projectId = searchParams.get('projectId');
    const history = searchParams.get('history') === 'true';

    if (!tenantId || !projectId) {
      return NextResponse.json(
        { error: 'tenantId y projectId requeridos' },
        { status: 400 }
      );
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

    if (history) {
      const limitParam = searchParams.get('limit');
      const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 30, 1), 100) : 30;
      const scores = await getHealthScoreHistory(projectId, limit);
      return NextResponse.json({ scores, count: scores.length });
    }

    // Obtener último score
    const snapshot = await db
      .collection('project_health_scores')
      .where('projectId', '==', projectId)
      .orderBy('calculatedAt', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) {
      return NextResponse.json({ score: null, message: 'No hay scores calculados aún' });
    }

    const data = snapshot.docs[0].data();
    const color = getHealthColor(data.score);
    const emoji = getHealthEmoji(data.score);

    return NextResponse.json({
      score: data.score,
      breakdown: data.breakdown,
      trend: data.trend,
      previousScore: data.previousScore,
      insights: data.insights || [],
      recommendations: data.recommendations || [],
      calculatedAt: data.calculatedAt,
      period: data.period,
      color,
      emoji,
    });
  } catch (error: any) {
    console.error('[HealthScore API] Error:', error?.message);
    if (error?.status === 401) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isFlagEnabled('health_score_predictive')) {
      return NextResponse.json(
        { error: 'Health Score no está habilitado' },
        { status: 403 }
      );
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
      case 'calculate-all': {
        const result = await calculateAllTenantScores(tenantId);
        return NextResponse.json({
          message: `Cálculo completado: ${result.calculated} proyectos, ${result.errors} errores`,
          ...result,
        });
      }

      default:
        return NextResponse.json(
          { error: `Acción no válida: ${action}. Usa 'calculate-all'` },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('[HealthScore API] Error:', error?.message);
    if (error?.status === 401) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
