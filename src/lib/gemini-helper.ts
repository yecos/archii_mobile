/**
 * Gemini Helper — OpenAI-compatible wrapper for Google Gemini API.
 *
 * Exposes `chatCompletion()` and `chatCompletionWithTools()` that accept
 * OpenAI-style messages/tools and return OpenAI-style responses, so the
 * existing route handlers need minimal changes.
 *
 * Requires: GEMINI_API_KEY environment variable (set in Vercel dashboard).
 *
 * AUTO-DISCOVERY: On first call (or every 4 hours), queries the Gemini API
 * model list to find the best available flash model. This means when Google
 * deprecates or releases new models, the system adapts automatically
 * without any code changes.
 *
 * MULTIMODAL: Supports inline images via `inlineData` parts.
 */

// ── Types (OpenAI-compatible subset used by routes) ──────────────────

export interface ImageData {
  mimeType: string;
  data: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  images?: ImageData[];
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface CompletionOptions {
  max_tokens?: number;
  temperature?: number;
}

interface OpenAIResponse {
  choices: {
    message: {
      content: string | null;
      tool_calls?: ToolCall[];
    };
    finish_reason: "stop" | "tool_calls";
  }[];
}

// ── Helpers ──────────────────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY no está configurada. Agrégala como variable de entorno en Vercel."
    );
  }
  return key;
}

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

/**
 * Hardcoded fallback models — used ONLY if the auto-discovery API call fails.
 * Ordered by preference (newest first).
 */
const FALLBACK_MODELS = [
  "gemini-2.5-flash-preview-05-20",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
];

// ── Auto-discovery ──────────────────────────────────────────────────

/** Cached list of discovered models + timestamp */
let cachedModels: string[] | null = null;
let cachedAt = 0;
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Query the Gemini API to discover available flash models.
 * Returns models sorted by version (newest first).
 */
async function discoverModels(): Promise<string[]> {
  const apiKey = getApiKey();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(`${BASE_URL}/models`, {
      signal: controller.signal,
      headers: { 'x-goog-api-key': apiKey },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.error(`[Gemini Discovery] HTTP ${res.status} — using fallback models`);
      return FALLBACK_MODELS;
    }

    const data = await res.json();
    const models: string[] = (data.models || [])
      .filter((m: any) => {
        const name: string = m.name || "";
        const methods: string[] = m.supportedGenerationMethods || [];
        return (
          name.includes("gemini") &&
          name.includes("flash") &&
          methods.includes("generateContent")
        );
      })
      .map((m: any) => {
        const name: string = m.name || "";
        return name.replace(/^models\//, "");
      });

    if (models.length === 0) {
      console.warn("[Gemini Discovery] No flash models found — using fallback");
      return FALLBACK_MODELS;
    }

    models.sort((a, b) => {
      const va = a.match(/(\d+\.\d+)/)?.[0] || "0";
      const vb = b.match(/(\d+\.\d+)/)?.[0] || "0";
      if (va !== vb) return vb.localeCompare(va, undefined, { numeric: true });
      const aPreview = a.includes("preview");
      const bPreview = b.includes("preview");
      if (aPreview && !bPreview) return 1;
      if (!aPreview && bPreview) return -1;
      return b.localeCompare(a);
    });

    return models;
  } catch (err: any) {
    console.error("[Gemini Discovery] Failed:", err?.message, "— using fallback models");
    return FALLBACK_MODELS;
  }
}

async function getModels(): Promise<string[]> {
  const now = Date.now();
  if (cachedModels && now - cachedAt < CACHE_TTL) {
    return cachedModels;
  }
  cachedModels = await discoverModels();
  cachedAt = now;
  return cachedModels;
}

export async function refreshGeminiModels(): Promise<string[]> {
  cachedModels = null;
  cachedAt = 0;
  return getModels();
}

// ── Message / Tool conversion (OpenAI → Gemini) ─────────────────────

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: {
    name: string;
    response: { content: string };
  };
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

function convertMessages(
  messages: ChatMessage[]
): { systemInstruction: { parts: GeminiPart[] }; contents: GeminiContent[] } {
  const systemParts: GeminiPart[] = [];
  const contents: GeminiContent[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      systemParts.push({ text: msg.content });
      continue;
    }

    if (msg.role === "tool") {
      contents.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              name: msg.name || msg.tool_call_id || "unknown",
              response: { content: msg.content },
            },
          },
        ],
      });
      continue;
    }

    const geminiRole = msg.role === "assistant" ? "model" : "user";

    // User messages can have images
    if (msg.role === "user" && msg.images && msg.images.length > 0) {
      const parts: GeminiPart[] = [];
      if (msg.content) parts.push({ text: msg.content });
      for (const img of msg.images) {
        parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
      }
      contents.push({ role: "user", parts });
      continue;
    }

    if (msg.role === "assistant" && msg.tool_calls && msg.tool_calls.length > 0) {
      const parts: GeminiPart[] = [];
      if (msg.content) {
        parts.push({ text: msg.content });
      }
      for (const tc of msg.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments);
        } catch {
          args = {};
        }
        parts.push({
          functionCall: {
            name: tc.function.name,
            args,
          },
        });
      }
      contents.push({ role: geminiRole, parts });
      continue;
    }

    contents.push({
      role: geminiRole,
      parts: [{ text: msg.content }],
    });
  }

  return {
    systemInstruction: systemParts.length > 0 ? { parts: systemParts } : undefined as any,
    contents,
  };
}

function convertTools(
  tools?: OpenAITool[]
): { functionDeclarations: any[] }[] | undefined {
  if (!tools || tools.length === 0) return undefined;

  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      })),
    },
  ];
}

// ── Response conversion (Gemini → OpenAI) ────────────────────────────

interface GeminiResponse {
  candidates?: {
    content?: {
      parts?: GeminiPart[];
    };
    finishReason?: string;
  }[];
  error?: { message: string; code: number };
}

function convertResponse(geminiRes: GeminiResponse): OpenAIResponse {
  if (geminiRes.error) {
    throw new Error(
      `Gemini API error ${geminiRes.error.code}: ${geminiRes.error.message}`
    );
  }

  const candidate = geminiRes.candidates?.[0];
  if (!candidate || !candidate.content?.parts) {
    throw new Error("Gemini: No se recibió respuesta del modelo.");
  }

  const parts = candidate.content.parts;
  const textParts = parts.filter((p) => p.text);
  const functionCallParts = parts.filter((p) => p.functionCall);

  if (functionCallParts.length > 0) {
    const tool_calls: ToolCall[] = functionCallParts.map((p, i) => ({
      id: `call_${Date.now()}_${i}`,
      type: "function" as const,
      function: {
        name: p.functionCall!.name,
        arguments: JSON.stringify(p.functionCall!.args),
      },
    }));

    return {
      choices: [
        {
          message: {
            content: textParts.length > 0 ? textParts.map((p) => p.text!).join("") : null,
            tool_calls,
          },
          finish_reason: "tool_calls",
        },
      ],
    };
  }

  return {
    choices: [
      {
        message: {
          content: textParts.map((p) => p.text!).join(""),
        },
        finish_reason: "stop",
      },
    ],
  };
}

// ── Core API call ────────────────────────────────────────────────────

async function callGemini(body: Record<string, unknown>): Promise<GeminiResponse> {
  const apiKey = getApiKey();
  const models = await getModels();

  let lastError: Error | null = null;
  for (const model of models) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const res = await fetch(`${BASE_URL}/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const text = await res.text();
        const errMsg = `Gemini API HTTP ${res.status} (model=${model}): ${text.slice(0, 300)}`;
        console.error(`[Gemini] ${errMsg}`);
        lastError = new Error(errMsg);
        continue;
      }

      const data = await res.json();
      if (data.error) {
        const errMsg = `Gemini API error (model=${model}): ${data.error.message}`;
        console.error(`[Gemini] ${errMsg}`);
        lastError = new Error(errMsg);
        continue;
      }

      return data;
    } catch (err: any) {
      if (err?.name === "AbortError") {
        console.error(`[Gemini] Timeout (model=${model})`);
        lastError = new Error(`Gemini API timeout (model=${model})`);
      } else {
        console.error(`[Gemini] Error (model=${model}):`, err?.message);
        lastError = err;
      }
      continue;
    }
  }

  throw lastError || new Error("All Gemini models failed");
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Simple chat completion (no tools / function calling).
 */
export async function chatCompletion(
  messages: ChatMessage[],
  options?: CompletionOptions
): Promise<OpenAIResponse> {
  const { systemInstruction, contents } = convertMessages(messages);

  const geminiRes = await callGemini({
    systemInstruction,
    contents,
    generationConfig: {
      maxOutputTokens: options?.max_tokens ?? 1024,
      temperature: options?.temperature ?? 0.7,
    },
  });

  return convertResponse(geminiRes);
}

/**
 * Chat completion with tool / function calling support.
 */
export async function chatCompletionWithTools(
  messages: ChatMessage[],
  tools?: OpenAITool[],
  options?: CompletionOptions
): Promise<OpenAIResponse> {
  const { systemInstruction, contents } = convertMessages(messages);
  const geminiTools = convertTools(tools);

  const geminiRes = await callGemini({
    systemInstruction,
    contents,
    tools: geminiTools,
    toolConfig: {
      functionCallingConfig: {
        mode: "AUTO",
      },
    },
    generationConfig: {
      maxOutputTokens: options?.max_tokens ?? 2048,
      temperature: options?.temperature ?? 0.7,
    },
  });

  return convertResponse(geminiRes);
}
