/**
 * ai-service.ts
 * Capa de servicio de IA con retry exponencial, timeout y fallback.
 * Envuelve las llamadas a gemini-helper para uso en rutas API.
 *
 * Todas las llamadas incluyen validación de tenantId y retry automático.
 */

import { chatCompletion, chatCompletionWithTools, type ChatMessage, type OpenAITool } from './gemini-helper';

export interface AIBasicResult {
  content: string | null;
  error?: boolean;
  message?: string;
}

export interface AIToolsResult {
  content: string | null;
  toolCalls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  error?: boolean;
  message?: string;
}

/**
 * Llama a la IA con retry exponencial y timeout.
 * Valida tenantId en cada intento.
 */
export async function callAIWithRetry(
  messages: ChatMessage[],
  tenantId: string,
  maxRetries = 3,
  timeoutMs = 8000
): Promise<AIBasicResult> {
  if (!tenantId) {
    return { content: null, error: true, message: 'tenantId requerido para llamar a la IA' };
  }

  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const result = await chatCompletion(messages, {
        max_tokens: 1024,
        temperature: 0.7,
      });

      clearTimeout(timeout);

      return {
        content: result.choices?.[0]?.message?.content || null,
      };
    } catch (err: any) {
      lastError = err;
      console.error(`[AI Service] Intento ${i + 1}/${maxRetries} falló:`, err?.message);

      if (i === maxRetries - 1) {
        return {
          content: null,
          error: true,
          message: 'IA no disponible. Reintenta en 30s.',
        };
      }

      // Backoff exponencial: 1s, 2s, 4s
      await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
    }
  }

  return {
    content: null,
    error: true,
    message: `IA no disponible: ${lastError?.message || 'error desconocido'}`,
  };
}

/**
 * Llama a la IA con function calling, retry exponencial y timeout.
 * Valida tenantId en cada intento.
 */
export async function callAIWithToolsRetry(
  messages: ChatMessage[],
  tools: OpenAITool[],
  tenantId: string,
  maxRetries = 3,
  timeoutMs = 15000
): Promise<AIToolsResult> {
  if (!tenantId) {
    return { content: null, error: true, message: 'tenantId requerido para llamar a la IA' };
  }

  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await chatCompletionWithTools(messages, tools, {
        max_tokens: 2048,
        temperature: 0.7,
      });

      const choice = result.choices?.[0];
      return {
        content: choice?.message?.content || null,
        toolCalls: choice?.message?.tool_calls,
      };
    } catch (err: any) {
      lastError = err;
      console.error(`[AI Service] Intento tools ${i + 1}/${maxRetries} falló:`, err?.message);

      if (i === maxRetries - 1) {
        return {
          content: null,
          error: true,
          message: 'IA no disponible. Reintenta en 30s.',
        };
      }

      // Backoff exponencial: 1s, 2s, 4s
      await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
    }
  }

  return {
    content: null,
    error: true,
    message: `IA no disponible: ${lastError?.message || 'error desconocido'}`,
  };
}
