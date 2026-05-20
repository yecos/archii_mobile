/**
 * /api/ai/rag/route.ts
 * Endpoint RAG: búsqueda semántica y问答 con contexto.
 *
 * POST /api/ai/rag
 * Body:
 *   { action: 'search', tenantId, query, topK?, sourceFilter?, minScore? }
 *   { action: 'ask', tenantId, question, sourceFilter?, maxContext? }
 *   { action: 'index', tenantId, source, sourceDocId, text, chunkSize?, chunkOverlap?, metadata? }
 *   { action: 'delete', tenantId, sourceDocId }
 *   { action: 'reindex', tenantId, collection, textFields: string[] }
 *
 * Requiere autenticación Firebase + tenantId.
 * Gated por feature flag 'rag_search'.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import {
  searchDocuments,
  askWithRAG,
  indexDocument,
  deleteDocumentChunks,
  reindexCollection,
} from '@/lib/rag-service';
import { isFlagEnabled } from '@/lib/feature-flags';

export async function POST(request: NextRequest) {
  try {
    // Feature gate
    if (!isFlagEnabled('rag_search')) {
      return NextResponse.json(
        { error: 'RAG search no está habilitado. Contacta al administrador.' },
        { status: 403 }
      );
    }

    // Auth
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
      // ── Búsqueda semántica ──
      case 'search': {
        const { query, topK, sourceFilter, minScore } = body;
        if (!query?.trim()) {
          return NextResponse.json({ error: 'query requerida' }, { status: 400 });
        }

        const boundedTopK = Math.min(Math.max(topK || 10, 1), 50);
        const boundedMinScore = Math.max(Math.min(minScore || 0.3, 1), 0);

        const results = await searchDocuments({
          tenantId,
          query,
          topK: boundedTopK,
          sourceFilter,
          minScore: boundedMinScore,
        });

        return NextResponse.json({
          results,
          count: results.length,
          query,
        });
      }

      // ── Pregunta con contexto RAG ──
      case 'ask': {
        const { question, sourceFilter, maxContext } = body;
        if (!question?.trim()) {
          return NextResponse.json({ error: 'question requerida' }, { status: 400 });
        }

        const response = await askWithRAG(tenantId, question, {
          sourceFilter,
          maxContext: maxContext || 5,
        });

        return NextResponse.json(response);
      }

      // ── Indexar documento ──
      case 'index': {
        const { source, sourceDocId, text, chunkSize, chunkOverlap, metadata } = body;
        if (!source || !sourceDocId || !text?.trim()) {
          return NextResponse.json(
            { error: 'source, sourceDocId y text son requeridos' },
            { status: 400 }
          );
        }

        // SEC-M07: Validate that sourceDocId actually exists in the source collection
        try {
          const sourceDoc = await db.collection(source).doc(sourceDocId).get();
          if (!sourceDoc.exists) {
            return NextResponse.json(
              { error: `El documento ${source}/${sourceDocId} no existe. Solo se pueden indexar documentos reales.` },
              { status: 400 }
            );
          }
          // Verify source doc belongs to same tenant
          if (sourceDoc.data()?.tenantId && sourceDoc.data()?.tenantId !== tenantId) {
            return NextResponse.json(
              { error: 'El documento fuente no pertenece a este tenant' },
              { status: 403 }
            );
          }
        } catch (err: any) {
          return NextResponse.json(
            { error: `Error verificando documento fuente: ${err.message}` },
            { status: 400 }
          );
        }

        const chunkCount = await indexDocument({
          tenantId,
          source,
          sourceDocId,
          text,
          chunkSize,
          chunkOverlap,
          metadata,
        });

        return NextResponse.json({
          message: `Documento indexado: ${chunkCount} chunks creados`,
          chunkCount,
          source,
          sourceDocId,
        });
      }

      // ── Eliminar chunks de un documento ──
      case 'delete': {
        const { sourceDocId } = body;
        if (!sourceDocId) {
          return NextResponse.json({ error: 'sourceDocId requerido' }, { status: 400 });
        }

        const deletedCount = await deleteDocumentChunks(tenantId, sourceDocId);

        return NextResponse.json({
          message: `${deletedCount} chunks eliminados`,
          deletedCount,
        });
      }

      // ── Re-indexar colección completa ──
      case 'reindex': {
        const { collection, textFields } = body;
        if (!collection || !textFields?.length) {
          return NextResponse.json(
            { error: 'collection y textFields son requeridos' },
            { status: 400 }
          );
        }

        // Re-indexar es asíncrono — devolvemos confirmación inmediata
        reindexCollection(tenantId, collection, textFields).catch((err) => {
          console.error(`[RAG] Error en reindex asíncrono:`, err);
        });

        return NextResponse.json({
          message: `Re-indexación iniciada para ${collection}`,
          collection,
          textFields,
        });
      }

      default:
        return NextResponse.json(
          { error: `Acción no válida: ${action}. Usa 'search', 'ask', 'index', 'delete' o 'reindex'` },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('[RAG API] Error:', error?.message);

    if (error?.status === 401) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
