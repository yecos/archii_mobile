import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { getAdminDb } from "@/lib/firebase-admin";
import { chatCompletionWithTools, type ChatMessage } from "@/lib/gemini-helper";
import type { ToolCall, ExecutedAction } from "./_lib/types";
import { SYSTEM_PROMPT } from "./_lib/system-prompt";
import { TOOLS } from "./_lib/tool-definitions";
import { executeToolCall } from "./_lib/execute-tool-call";

/**
 * POST /api/ai-agent
 *
 * Super IA Agent para Archii.
 * Usa Google Gemini API con function calling para ejecutar acciones reales en la app:
 * - Crear/editar tareas, proyectos, gastos, proveedores, reuniones
 * - Consultar datos del proyecto, equipo, presupuesto
 * - Gestionar fases de obra, aprobaciones, inventario
 *
 * Powered by Google Gemini (gemini-2.0-flash)
 */

export async function POST(request: NextRequest) {
  // Auth check
  let user: { uid: string; email: string; role?: string };
  try {
    user = await requireAuth(request);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Error de autenticación" }, { status: 401 });
  }

  try {
    const { messages, projectContext, tenantId } = await request.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Se requiere al menos un mensaje" },
        { status: 400 }
      );
    }

    if (!tenantId) {
      return NextResponse.json(
        { error: "Se requiere el ID del espacio de trabajo (tenantId)" },
        { status: 400 }
      );
    }

    // Verify tenant membership - prevent cross-tenant access
    const db = getAdminDb();
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (!tenantDoc.exists) {
      return NextResponse.json({ error: 'Espacio de trabajo no encontrado' }, { status: 404 });
    }
    const tenantData = tenantDoc.data()!;
    const tenantMembers: string[] = tenantData.members || [];
    const tenantSuperAdmins: string[] = tenantData.superAdmins || [];
    const tenantCreatedBy: string = tenantData.createdBy || '';
    if (!tenantMembers.includes(user.uid) && !tenantSuperAdmins.includes(user.uid)) {
      return NextResponse.json({ error: 'No tienes acceso a este espacio de trabajo' }, { status: 403 });
    }

    // Determine user role for RBAC in tool execution
    let userRole: string = 'Miembro';
    if (tenantSuperAdmins.includes(user.uid)) userRole = 'Super Admin';
    else if (tenantCreatedBy === user.uid) userRole = 'Admin';
    else if (tenantData.memberRoles?.[user.uid]) userRole = tenantData.memberRoles[user.uid];

    // Rate limiting: 20 requests per minute per user per tenant (protects Gemini API costs)
    const { checkRateLimit } = await import("@/lib/rate-limiter");
    const rateKey = `ai_agent:${user.uid}:${tenantId}`;
    const rateResult = await checkRateLimit(rateKey, { limit: 20, windowSeconds: 60 });
    if (!rateResult.allowed) {
      return NextResponse.json(
        {
          error: "Has superado el límite de mensajes al asistente. Intenta de nuevo en un minuto.",
          retryAfter: Math.ceil((rateResult.resetAt - Date.now()) / 1000),
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((rateResult.resetAt - Date.now()) / 1000)),
            "X-RateLimit-Limit": String(rateResult.limit),
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }

    const actions: ExecutedAction[] = [];

    // Build messages
    const apiMessages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    if (projectContext) {
      apiMessages.push({
        role: "system",
        content: `Contexto actual del usuario:\n${projectContext}`,
      });
    }

    // Add conversation history
    const recentMessages = messages.slice(-20);
    for (const msg of recentMessages) {
      if (msg.role === "user" || msg.role === "assistant") {
        const apiMsg: ChatMessage = { role: msg.role, content: msg.content };
        if (msg.images && msg.images.length > 0) {
          apiMsg.images = msg.images;
        }
        apiMessages.push(apiMsg);
      }
    }

    // First call: with tools (using Gemini API)
    let data;
    try {
      data = await chatCompletionWithTools(apiMessages, TOOLS, {
        max_tokens: 2048,
        temperature: 0.7,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("[AI Agent] SDK error:", msg);
      return NextResponse.json({
        error: "Error en la API de IA",
        message: `⚠️ Error de la IA. Intenta de nuevo.`,
      });
    }
    const choice = data.choices?.[0];

    if (!choice) {
      return NextResponse.json({
        error: "Sin respuesta",
        message: "⚠️ La IA no generó una respuesta. Intenta de nuevo.",
      });
    }

    const finishReason = choice.finish_reason;
    const assistantMessage = choice.message;

    // If the model wants to call tools, execute them
    if (finishReason === "tool_calls" && assistantMessage.tool_calls) {
      // Add assistant message with tool calls to history
      apiMessages.push({ role: "assistant", content: assistantMessage.content || "", tool_calls: assistantMessage.tool_calls });

      // Execute each tool call
      for (const toolCall of assistantMessage.tool_calls as ToolCall[]) {
        const funcName = toolCall.function.name;
        let funcArgs: Record<string, any>;
        try {
          funcArgs = JSON.parse(toolCall.function.arguments);
        } catch {
          funcArgs = {};
        }

        const result = await executeToolCall(funcName, funcArgs, db, user.uid, actions, tenantId, userRole);

        // Add tool result to conversation
        apiMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        });
      }

      // Second call: get final response with tool results (using Gemini API)
      try {
        const followUpData = await chatCompletionWithTools(apiMessages, undefined, {
          max_tokens: 2048,
          temperature: 0.7,
        });

        const finalMessage = followUpData.choices?.[0]?.message?.content;

        return NextResponse.json({
          message: finalMessage || "Acciones ejecutadas correctamente.",
          actions: actions.length > 0 ? actions : undefined,
        });
      } catch (error: unknown) {
        console.error("[AI Agent] Follow-up error:", error instanceof Error ? error.message : String(error));
        return NextResponse.json({
          message: "Acciones ejecutadas correctamente.",
          actions: actions.length > 0 ? actions : undefined,
        });
      }
    }

    // No tool calls — just return the text response
    return NextResponse.json({
      message: assistantMessage.content || "No pude generar una respuesta.",
      actions: actions.length > 0 ? actions : undefined,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error interno del servidor";
    console.error("[AI Agent] Error:", message);
    return NextResponse.json(
      {
        error: "Error de conexión",
        message: "⚠️ Error de conexión con la IA. Intenta de nuevo.",
      },
      { status: 500 }
    );
  }
}
