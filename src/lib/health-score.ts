/**
 * health-score.ts
 * Motor de Health Score predictivo para proyectos.
 *
 * Calcula un score 0-100 por proyecto basado en:
 *   - Task completion rate (peso: 30%)
 *   - Delay/sobrepaso de fechas (peso: 20%)
 *   - Budget usage vs progreso (peso: 20%)
 *   - Activity level reciente (peso: 15%)
 *   - RFI/Submittal resolution rate (peso: 15%)
 *
 * Almacena resultados en collection 'project_health_scores'.
 * Soporta historial para análisis de tendencias.
 * Gated por feature flag 'health_score_predictive'.
 */

import { getAdminDb } from './firebase-admin';
import { isFlagEnabled } from './feature-flags';
import type { Timestamp } from 'firebase-admin/firestore';
import { isOverdue as checkOverdue } from './kanban-helpers';

/* ---- Types ---- */

export interface HealthScoreBreakdown {
  /** 0-100: Porcentaje de tareas completadas */
  taskCompletion: number;
  /** 0-100: Inverso del porcentaje de tareas vencidas */
  timeliness: number;
  /** 0-100: Que tan alineado está el gasto con el progreso */
  budgetHealth: number;
  /** 0-100: Nivel de actividad en los últimos 7 días */
  activityLevel: number;
  /** 0-100: Tasa de resolución de RFIs y Submittals */
  resolutionRate: number;
}

export interface HealthScoreRecord {
  projectId: string;
  tenantId: string;
  score: number;
  breakdown: HealthScoreBreakdown;
  trend: 'improving' | 'stable' | 'declining' | 'unknown';
  previousScore?: number;
  insights: string[];
  recommendations: string[];
  calculatedAt: string;
  period: string; // YYYY-MM-DD del cálculo
}

export interface ProjectMetrics {
  id: string;
  tenantId: string;
  // Task metrics
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  inProgressTasks: number;
  // Budget
  budget: number;
  totalSpent: number;
  progress: number;
  // Timeline
  startDate: string;
  endDate: string;
  // Activity (timestamps de acciones recientes)
  recentActivityTimestamps?: number[];
  // RFIs / Submittals
  openRFIs: number;
  totalRFIs: number;
  resolvedSubmittals: number;
  totalSubmittals: number;
}

/* ---- Score Calculation ---- */

/**
 * Calcula el health score completo para un proyecto.
 * Retorna el score 0-100 con breakdown detallado.
 */
export function calculateHealthScore(metrics: ProjectMetrics): HealthScoreRecord {
  const breakdown = calculateBreakdown(metrics);
  const score = Math.round(
    breakdown.taskCompletion * 0.30 +
    breakdown.timeliness * 0.20 +
    breakdown.budgetHealth * 0.20 +
    breakdown.activityLevel * 0.15 +
    breakdown.resolutionRate * 0.15
  );

  const insights = generateInsights(breakdown, metrics);
  const recommendations = generateRecommendations(breakdown, metrics, score);

  return {
    projectId: metrics.id,
    tenantId: metrics.tenantId,
    score: Math.max(0, Math.min(100, score)),
    breakdown,
    trend: 'unknown', // Se calcula al comparar con historial
    insights,
    recommendations,
    calculatedAt: new Date().toISOString(),
    period: new Date().toISOString().split('T')[0],
  };
}

/**
 * Calcula el breakdown de cada dimensión del score.
 */
function calculateBreakdown(metrics: ProjectMetrics): HealthScoreBreakdown {
  // 1. Task Completion Rate (30%)
  const taskCompletion = metrics.totalTasks > 0
    ? Math.round((metrics.completedTasks / metrics.totalTasks) * 100)
    : 50; // Neutral si no hay tareas

  // 2. Timeliness — Penaliza tareas vencidas
  let timeliness = 100;
  if (metrics.totalTasks > 0) {
    const overdueRatio = metrics.overdueTasks / metrics.totalTasks;
    timeliness = Math.round(100 - (overdueRatio * 200)); // 10% vencidas = 80, 50% vencidas = 0
    timeliness = Math.max(0, Math.min(100, timeliness));
  }

  // 3. Budget Health — Compara gasto con progreso
  let budgetHealth = 100;
  if (metrics.budget > 0 && metrics.progress > 0) {
    const budgetUsedPercent = (metrics.totalSpent / metrics.budget) * 100;
    const progressGap = budgetUsedPercent - metrics.progress;
    // Si gastamos más de lo que avanzamos, penalizamos
    budgetHealth = Math.round(100 - Math.max(0, progressGap));
    budgetHealth = Math.max(0, Math.min(100, budgetHealth));
  } else if (metrics.budget > 0 && metrics.totalSpent > 0) {
    const spentRatio = (metrics.totalSpent / metrics.budget) * 100;
    budgetHealth = spentRatio > 90 ? 30 : spentRatio > 70 ? 60 : 90;
  }

  // 4. Activity Level — Basado en actividad reciente (últimos 7 días)
  let activityLevel = 50; // Default medio
  if (metrics.recentActivityTimestamps && metrics.recentActivityTimestamps.length > 0) {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentCount = metrics.recentActivityTimestamps.filter(
      (ts) => ts > sevenDaysAgo
    ).length;

    if (recentCount >= 20) activityLevel = 100;
    else if (recentCount >= 15) activityLevel = 90;
    else if (recentCount >= 10) activityLevel = 80;
    else if (recentCount >= 5) activityLevel = 65;
    else if (recentCount >= 2) activityLevel = 50;
    else activityLevel = 25;
  }

  // 5. Resolution Rate — RFIs y Submittals resueltos
  let resolutionRate = 100;
  const totalItems = metrics.totalRFIs + metrics.totalSubmittals;
  if (totalItems > 0) {
    const resolved = (metrics.totalRFIs - metrics.openRFIs) + metrics.resolvedSubmittals;
    resolutionRate = Math.round((resolved / totalItems) * 100);
  }

  return {
    taskCompletion: Math.max(0, Math.min(100, taskCompletion)),
    timeliness: Math.max(0, Math.min(100, timeliness)),
    budgetHealth: Math.max(0, Math.min(100, budgetHealth)),
    activityLevel: Math.max(0, Math.min(100, activityLevel)),
    resolutionRate: Math.max(0, Math.min(100, resolutionRate)),
  };
}

/* ---- Insights & Recommendations ---- */

function generateInsights(
  breakdown: HealthScoreBreakdown,
  metrics: ProjectMetrics
): string[] {
  const insights: string[] = [];

  if (breakdown.taskCompletion < 40) {
    insights.push(`Solo el ${breakdown.taskCompletion}% de las tareas están completadas (${metrics.completedTasks}/${metrics.totalTasks})`);
  } else if (breakdown.taskCompletion >= 80) {
    insights.push(`Buen progreso: ${breakdown.taskCompletion}% de tareas completadas`);
  }

  if (metrics.overdueTasks > 0) {
    insights.push(`${metrics.overdueTasks} tarea(s) vencida(s) requieren atención inmediata`);
  }

  if (metrics.budget > 0) {
    const spentPercent = Math.round((metrics.totalSpent / metrics.budget) * 100);
    if (spentPercent > 90) {
      insights.push(`Presupuesto al ${spentPercent}% — riesgo de sobrecosto`);
    } else if (spentPercent > 75) {
      insights.push(`Presupuesto al ${spentPercent}% — monitorear de cerca`);
    }
  }

  if (breakdown.activityLevel < 40) {
    insights.push('Actividad baja en los últimos 7 días — posible bloqueo');
  }

  if (metrics.openRFIs > 5) {
    insights.push(`${metrics.openRFIs} RFIs abiertos sin resolver`);
  }

  return insights;
}

function generateRecommendations(
  breakdown: HealthScoreBreakdown,
  metrics: ProjectMetrics,
  score: number
): string[] {
  const recs: string[] = [];

  if (breakdown.taskCompletion < 50) {
    recs.push('Priorizar tareas en progreso y eliminar bloqueadores');
  }

  if (breakdown.timeliness < 60) {
    recs.push('Revisar cronograma y reasignar recursos a tareas críticas');
  }

  if (breakdown.budgetHealth < 50) {
    recs.push('Auditar gastos recientes y renegociar con proveedores si es posible');
  }

  if (breakdown.activityLevel < 40) {
    recs.push('Programar reunión de seguimiento con el equipo');
  }

  if (breakdown.resolutionRate < 50) {
    recs.push('Asignar responsables para resolver RFIs y Submittals pendientes');
  }

  if (score >= 80) {
    recs.push('Proyecto en buen estado — mantener el ritmo actual');
  }

  return recs;
}

/* ---- Firestore Persistence ---- */

/**
 * Guarda un health score en Firestore y calcula la tendencia.
 */
export async function saveHealthScore(
  record: HealthScoreRecord
): Promise<void> {
  if (!isFlagEnabled('health_score_predictive')) return;

  const db = getAdminDb();

  // Obtener el score anterior para calcular tendencia
  const previousScores = await db
    .collection('project_health_scores')
    .where('projectId', '==', record.projectId)
    .orderBy('calculatedAt', 'desc')
    .limit(1)
    .get();

  if (!previousScores.empty) {
    const prevData = previousScores.docs[0].data();
    const prevScore = prevData.score as number;
    record.previousScore = prevScore;

    const diff = record.score - prevScore;
    if (diff > 5) record.trend = 'improving';
    else if (diff < -5) record.trend = 'declining';
    else record.trend = 'stable';
  }

  // Guardar nuevo score
  await db.collection('project_health_scores').add({
    ...record,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Recupera el historial de health scores de un proyecto.
 */
export async function getHealthScoreHistory(
  projectId: string,
  limit = 30
): Promise<HealthScoreRecord[]> {
  const db = getAdminDb();

  const snapshot = await db
    .collection('project_health_scores')
    .where('projectId', '==', projectId)
    .orderBy('calculatedAt', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      projectId: data.projectId,
      tenantId: data.tenantId,
      score: data.score,
      breakdown: data.breakdown,
      trend: data.trend || 'unknown',
      previousScore: data.previousScore,
      insights: data.insights || [],
      recommendations: data.recommendations || [],
      calculatedAt: data.calculatedAt,
      period: data.period,
    };
  });
}

/**
 * Calcula y guarda health scores para todos los proyectos de un tenant.
 * Diseñado para ser ejecutado por Cloud Scheduler (diario).
 */
export async function calculateAllTenantScores(
  tenantId: string
): Promise<{ calculated: number; errors: number }> {
  if (!isFlagEnabled('health_score_predictive')) {
    return { calculated: 0, errors: 0 };
  }

  const db = getAdminDb();
  let calculated = 0;
  let errors = 0;

  // Obtener todos los proyectos del tenant
  const projectsSnapshot = await db
    .collection('projects')
    .where('tenantId', '==', tenantId)
    .get();

  for (const projectDoc of projectsSnapshot.docs) {
    try {
      const projectId = projectDoc.id;
      const projectData = projectDoc.data();

      // Obtener métricas de tareas
      const tasksSnapshot = await db
        .collection('tasks')
        .where('tenantId', '==', tenantId)
        .where('projectId', '==', projectId)
        .get();

      const now = Date.now();
      const tasks = tasksSnapshot.docs.map((doc) => doc.data());

      // Obtener gastos
      const expensesSnapshot = await db
        .collection('expenses')
        .where('tenantId', '==', tenantId)
        .where('projectId', '==', projectId)
        .get();

      const totalSpent = expensesSnapshot.docs.reduce(
        (sum, doc) => sum + (doc.data().amount || 0), 0
      );

      // Obtener RFIs
      const rfisSnapshot = await db
        .collection('rfis')
        .where('tenantId', '==', tenantId)
        .where('projectId', '==', projectId)
        .get();

      const rfis = rfisSnapshot.docs.map((doc) => doc.data());
      const openRFIs = rfis.filter(
        (r) => r.status === 'Abierto' || r.status === 'En revisión'
      ).length;

      // Obtener Submittals
      const submittalsSnapshot = await db
        .collection('submittals')
        .where('tenantId', '==', tenantId)
        .where('projectId', '==', projectId)
        .get();

      const submittals = submittalsSnapshot.docs.map((doc) => doc.data());
      const resolvedSubmittals = submittals.filter(
        (s) => s.status === 'Aprobado'
      ).length;

      // Timestamps de actividad reciente
      const recentActivity: number[] = [];
      tasks.forEach((t) => {
        if (t.updatedAt?.seconds) recentActivity.push(t.updatedAt.seconds * 1000);
        if (t.createdAt?.seconds) recentActivity.push(t.createdAt.seconds * 1000);
      });

      // Construir métricas
      const metrics: ProjectMetrics = {
        id: projectId,
        tenantId,
        totalTasks: tasks.length,
        completedTasks: tasks.filter((t) => t.status === 'Completado').length,
        overdueTasks: tasks.filter((t) => {
          if (t.status === 'Completado') return false;
          if (!t.dueDate) return false;
          return checkOverdue(t.dueDate as string);
        }).length,
        inProgressTasks: tasks.filter((t) => t.status === 'En progreso').length,
        budget: projectData.budget || 0,
        totalSpent,
        progress: projectData.progress || 0,
        startDate: projectData.startDate || '',
        endDate: projectData.endDate || '',
        recentActivityTimestamps: recentActivity,
        openRFIs,
        totalRFIs: rfis.length,
        resolvedSubmittals,
        totalSubmittals: submittals.length,
      };

      const record = calculateHealthScore(metrics);
      await saveHealthScore(record);
      calculated++;
    } catch (err) {
      console.error(`[HealthScore] Error calculando score para ${projectDoc.id}:`, err);
      errors++;
    }
  }

  return { calculated, errors };
}

/* ---- Utility ---- */

/**
 * Retorna el color del semáforo según el score.
 */
export function getHealthColor(score: number): { bg: string; text: string; label: string } {
  if (score >= 80) {
    return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Saludable' };
  } else if (score >= 60) {
    return { bg: 'bg-amber-500/10', text: 'text-amber-400', label: 'Atención' };
  } else {
    return { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Crítico' };
  }
}

/**
 * Retorna el emoji del semáforo.
 */
export function getHealthEmoji(score: number): string {
  if (score >= 80) return '🟢';
  if (score >= 60) return '🟡';
  return '🔴';
}
