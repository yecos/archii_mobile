/**
 * rag-service.ts
 * Servicio RAG (Retrieval-Augmented Generation) por tenant.
 *
 * Usa Gemini Embeddings API para generar vectores y Firestore
 * para almacenar documentos indexados con aislamiento estricto por tenantId.
 *
 * Flujo:
 *   1. indexDocument() — Genera embedding y guarda chunk en Firestore
 *   2. searchDocuments() — Busca por similitud coseno filtrando por tenantId
 *   3. askWithRAG() — Busca contexto relevante y genera respuesta con IA
 *
 * Gated por feature flag 'rag_search'.
 */

import { getAdminDb } from './firebase-admin';
import { isFlagEnabled } from './feature-flags';

/* ---- Types ---- */

export interface DocumentChunk {
  /** ID auto-generado por Firestore */
  id?: string;
  /** tenantId obligatorio — aislamiento de datos */
  tenantId: string;
  /** Fuente del documento (ej: 'projects', 'tasks', 'dailyLogs') */
  source: string;
  /** ID del documento original en Firestore */
  sourceDocId: string;
  /** Texto del chunk */
  text: string;
  /** Vector de embedding (768 dimensiones para text-embedding-004) */
  embedding: number[];
  /** Metadata adicional */
  metadata?: Record<string, any>;
  /** Timestamp de indexación */
  indexedAt?: any;
}

export interface RAGSearchResult {
  chunkId: string;
  text: string;
  source: string;
  sourceDocId: string;
  score: number;
  metadata?: Record<string, any>;
}

export interface RAGQueryOptions {
  tenantId: string;
  query: string;
  topK?: number;
  /** Filtro por fuente (ej: 'projects') */
  sourceFilter?: string;
  /** Score mínimo de similitud (0-1) */
  minScore?: number;
}

export interface RAGIndexOptions {
  tenantId: string;
  source: string;
  sourceDocId: string;
  text: string;
  /** Tamaño del chunk en caracteres (default: 500) */
  chunkSize?: number;
  /** Overlap entre chunks (default: 50) */
  chunkOverlap?: number;
  metadata?: Record<string, any>;
}

/* ---- Embedding Generation ---- */

const EMBEDDING_MODEL = 'text-embedding-004';

/**
 * Genera embeddings usando la Gemini API.
 * Retorna un vector de 768 dimensiones.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no configurada para embeddings');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text }] },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini Embedding API error ${response.status}: ${errorText.slice(0, 200)}`);
  }

  const data = await response.json();
  const embedding = data?.embedding?.values;

  if (!embedding || !Array.isArray(embedding)) {
    throw new Error('No se recibió embedding de la API');
  }

  return embedding;
}

/**
 * Genera embeddings para múltiples textos en batch.
 * Más eficiente que llamar generateEmbedding() N veces.
 */
export async function generateEmbeddingBatch(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no configurada para embeddings');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents`;

  const requests = texts.map((text) => ({
    model: `models/${EMBEDDING_MODEL}`,
    content: { parts: [{ text }] },
  }));

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({ requests }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini Batch Embedding API error ${response.status}: ${errorText.slice(0, 200)}`);
  }

  const data = await response.json();
  return (data?.embeddings || []).map((e: any) => e?.values || []);
}

/* ---- Text Chunking ---- */

/**
 * Divide un texto en chunks con overlap.
 * Mantiene párrafos enteros cuando es posible.
 */
function chunkText(text: string, chunkSize: number, chunkOverlap: number): string[] {
  if (!text || text.trim().length === 0) return [];

  // Si el texto es menor al chunk, devolverlo completo
  if (text.length <= chunkSize) return [text];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + chunkSize;

    // Intentar cortar en un salto de línea o punto
    if (end < text.length) {
      const lastBreak = text.lastIndexOf('\n', end);
      const lastPeriod = text.lastIndexOf('. ', end);

      if (lastBreak > start + chunkSize * 0.3) {
        end = lastBreak + 1;
      } else if (lastPeriod > start + chunkSize * 0.3) {
        end = lastPeriod + 2;
      }
    }

    const chunk = text.slice(start, end).trim();
    if (chunk.length > 10) { // Ignorar chunks muy cortos
      chunks.push(chunk);
    }

    start = end - chunkOverlap;
  }

  return chunks;
}

/* ---- Vector Similarity ---- */

/**
 * Calcula similitud coseno entre dos vectores.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/* ---- Core RAG Operations ---- */

/**
 * Indexa un documento dividiéndolo en chunks y generando embeddings.
 * Reemplaza chunks existentes del mismo sourceDocId.
 */
export async function indexDocument(options: RAGIndexOptions): Promise<number> {
  if (!isFlagEnabled('rag_search')) {
    return 0;
  }

  const {
    tenantId, source, sourceDocId, text,
    chunkSize = 500, chunkOverlap = 50, metadata,
  } = options;

  if (!tenantId || !text?.trim()) return 0;

  // Eliminar chunks existentes de este documento
  try {
    const db = getAdminDb();
    const existingChunks = await db
      .collection('document_chunks')
      .where('tenantId', '==', tenantId)
      .where('sourceDocId', '==', sourceDocId)
      .get();

    const batch = db.batch();
    existingChunks.docs.forEach((doc) => batch.delete(doc.ref));
    if (existingChunks.size > 0) await batch.commit();
  } catch (err) {
    console.error('[RAG] Error eliminando chunks existentes:', err);
  }

  // Dividir en chunks
  const chunks = chunkText(text, chunkSize, chunkOverlap);
  if (chunks.length === 0) return 0;

  // Generar embeddings en batch (max 100 por request)
  const db = getAdminDb();
  let indexed = 0;

  for (let i = 0; i < chunks.length; i += 100) {
    const batchChunks = chunks.slice(i, i + 100);
    const embeddings = await generateEmbeddingBatch(batchChunks);

    const writeBatch = db.batch();
    for (let j = 0; j < batchChunks.length; j++) {
      const docRef = db.collection('document_chunks').doc();
      writeBatch.set(docRef, {
        tenantId,
        source,
        sourceDocId,
        text: batchChunks[j],
        embedding: embeddings[j] || [],
        metadata: {
          ...metadata,
          chunkIndex: i + j,
          totalChunks: chunks.length,
        },
        indexedAt: new Date().toISOString(),
      });
      indexed++;
    }

    await writeBatch.commit();
  }

  return indexed;
}

/**
 * Elimina todos los chunks de un documento.
 */
export async function deleteDocumentChunks(
  tenantId: string,
  sourceDocId: string
): Promise<number> {
  const db = getAdminDb();

  const snapshot = await db
    .collection('document_chunks')
    .where('tenantId', '==', tenantId)
    .where('sourceDocId', '==', sourceDocId)
    .get();

  if (snapshot.size === 0) return 0;

  const batch = db.batch();
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();

  return snapshot.size;
}

/**
 * Busca documentos relevantes por similitud semántica.
 * CRÍTICO: Solo retorna resultados del tenantId solicitado.
 */
export async function searchDocuments(
  options: RAGQueryOptions
): Promise<RAGSearchResult[]> {
  if (!isFlagEnabled('rag_search')) {
    return [];
  }

  const {
    tenantId, query, topK = 10, sourceFilter, minScore = 0.3,
  } = options;

  if (!tenantId || !query?.trim()) return [];

  // Generar embedding de la query
  const queryEmbedding = await generateEmbedding(query);

  // Buscar chunks del tenant (con filtro de fuente opcional)
  const db = getAdminDb();
  let collectionRef = db
    .collection('document_chunks')
    .where('tenantId', '==', tenantId)
    .limit(200); // Limitar para performance

  const snapshot = await collectionRef.get();

  // Calcular similitud y rankear
  const results: RAGSearchResult[] = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();

    // Filtro por fuente
    if (sourceFilter && data.source !== sourceFilter) continue;

    const docEmbedding = data.embedding;
    if (!docEmbedding || !Array.isArray(docEmbedding) || docEmbedding.length === 0) continue;

    const score = cosineSimilarity(queryEmbedding, docEmbedding);

    if (score >= minScore) {
      results.push({
        chunkId: doc.id,
        text: data.text,
        source: data.source,
        sourceDocId: data.sourceDocId,
        score,
        metadata: data.metadata,
      });
    }
  }

  // Ordenar por score descendente y limitar
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

/**
 * Pregunta con contexto RAG: busca documentos relevantes y genera
 * una respuesta usando la IA con el contexto encontrado.
 */
export async function askWithRAG(
  tenantId: string,
  question: string,
  options?: { sourceFilter?: string; maxContext?: number }
): Promise<{ answer: string; sources: RAGSearchResult[] }> {
  const { sourceFilter, maxContext = 5 } = options || {};

  // 1. Buscar contexto relevante
  const sources = await searchDocuments({
    tenantId,
    query: question,
    topK: maxContext,
    sourceFilter,
    minScore: 0.25,
  });

  if (sources.length === 0) {
    return {
      answer: 'No encontré información relevante en los documentos del proyecto para responder esa pregunta.',
      sources: [],
    };
  }

  // 2. Construir prompt con contexto
  const contextText = sources
    .map((s, i) => `[${i + 1}] (${s.source}) ${s.text}`)
    .join('\n\n');

  const messages = [
    {
      role: 'system' as const,
      content: `Eres un asistente experto en gestión de proyectos de arquitectura y construcción.
Responde la pregunta del usuario basándote ÚNICAMENTE en el contexto proporcionado.
Si el contexto no contiene suficiente información, indícalo claramente.
Cita las fuentes usando [1], [2], etc.
Responde en español.`,
    },
    {
      role: 'user' as const,
      content: `CONTEXTO DEL PROYECTO:\n${contextText}\n\nPREGUNTA: ${question}`,
    },
  ];

  // 3. Generar respuesta con IA
  const { chatCompletion } = await import('./gemini-helper');
  const result = await chatCompletion(messages, {
    max_tokens: 1024,
    temperature: 0.5,
  });

  return {
    answer: result.choices?.[0]?.message?.content || 'No pude generar una respuesta.',
    sources,
  };
}

/**
 * Re-indexa todos los documentos de una colección para un tenant.
 * Útil para actualizar embeddings después de cambios masivos.
 */
export async function reindexCollection(
  tenantId: string,
  collectionName: string,
  textFields: string[],
  batchSize = 20
): Promise<number> {
  const db = getAdminDb();

  const snapshot = await db
    .collection(collectionName)
    .where('tenantId', '==', tenantId)
    .get();

  let totalIndexed = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();

    // Extraer texto de los campos especificados
    const textParts = textFields
      .map((f) => data[f])
      .filter((v) => v && typeof v === 'string');

    if (textParts.length === 0) continue;

    const text = textParts.join('\n');
    try {
      const count = await indexDocument({
        tenantId,
        source: collectionName,
        sourceDocId: doc.id,
        text,
        metadata: {
          name: data.name || data.title || data.subject || '',
        },
      });
      totalIndexed += count;
    } catch (err) {
      console.error(`[RAG] Error indexando ${collectionName}/${doc.id}:`, err);
    }
  }

  return totalIndexed;
}
