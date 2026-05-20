'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { HelpCircle, X, Loader2, ImageIcon, Send, Check } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import { useApp } from '@/contexts/AppContext';
import { getAuthHeaders } from '@/lib/firebase-service';

interface ExecutedAction {
  type: string;
  label: string;
  icon: string;
  details: string;
  success: boolean;
  error?: string;
}

interface MessageImage {
  url: string;
  mimeType: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  displayContent?: string;
  timestamp: Date;
  isError?: boolean;
  isSetupRequired?: boolean;
  helpText?: boolean;
  isTyping?: boolean;
  actions?: ExecutedAction[];
  images?: MessageImage[];
}

interface AIChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const QUICK_PROMPTS = [
  { text: 'Crea una tarea', icon: '📋' },
  { text: 'Resume mi proyecto', icon: '🏗️' },
  { text: 'Registra un gasto', icon: '💰' },
  { text: 'Agrega al inventario', icon: '📦' },
  { text: 'Crea una factura', icon: '🧾' },
  { text: 'Registra tiempo de trabajo', icon: '⏱️' },
  { text: '¿Qué tareas tengo?', icon: '✅' },
  { text: 'Analiza esta imagen', icon: '📸' },
];

/** Sanitiza HTML generado por la IA */
function sanitizeHTML(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*["']?javascript:[^"'>]*/gi, '$1="#"')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<(iframe|embed|object|form|input|select|textarea)\b[^>]*>/gi, '')
    .replace(/<(meta|link|base)\b[^>]*>/gi, '')
    .replace(/<(?!\/?(br|p|div|span|strong|b|em|i|u|s|ul|ol|li|code|pre|blockquote|h[1-6]|a|table|tr|td|th|thead|tbody|hr))\b[^>]*>/gi, '');
}

const formatMessage = (content: string): string => {
  const html = content
    .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre class="bg-black/20 rounded-lg p-3 my-2 overflow-x-auto text-xs"><code>$2</code></pre>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code class="bg-black/20 px-1.5 py-0.5 rounded text-xs">$1</code>')
    .replace(/^• (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/^## (.+)$/gm, '<h3 class="font-semibold text-sm mt-2 mb-1">$1</h3>')
    .replace(/\n/g, '<br/>');

  return sanitizeHTML(html);
};

/* ─── Typewriter Hook ─── */
function useTypewriter(messages: Message[], setMessages: React.Dispatch<React.SetStateAction<Message[]>>) {
  const typingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const pendingMsg = useMemo(() => {
    for (const m of messages) {
      if (m.isTyping && m.displayContent !== m.content) return m;
    }
    return null;
  }, [messages]);

  useEffect(() => {
    if (!pendingMsg) return;
    const msgId = pendingMsg.id;

    const tick = () => {
      setMessages(prev => {
        const msg = prev.find(m => m.id === msgId && m.isTyping);
        if (!msg || !msg.isTyping) return prev;
        const full = msg.content;
        const current = msg.displayContent || '';
        if (current.length >= full.length) {
          return prev.map(m => m.id === msgId ? { ...m, displayContent: full, isTyping: false } : m);
        }
        const nextChar = full[current.length];
        let chunkSize = 1;
        if (nextChar === ' ' || nextChar === '\n') chunkSize = 1;
        else if ('.!?;:,'.includes(nextChar)) chunkSize = 1;
        else chunkSize = 3;
        const newIndex = Math.min(current.length + chunkSize, full.length);
        return prev.map(m => m.id === msgId ? { ...m, displayContent: full.slice(0, newIndex) } : m);
      });
      // Use ref instead of stale closure for delay calculation
      const msg = messagesRef.current.find(m => m.id === msgId);
      if (!msg) return;
      const currentLen = (msg.displayContent || '').length;
      const nextChar = msg.content[currentLen];
      let delay = 8;
      if (nextChar === '\n') delay = 20;
      else if ('.!?'.includes(nextChar)) delay = 60;
      else if (';:,'.includes(nextChar)) delay = 30;
      else if (nextChar === ' ') delay = 10;
      else delay = 6 + Math.random() * 6;
      typingRef.current = setTimeout(tick, delay);
    };

    typingRef.current = setTimeout(tick, 40);
    return () => { if (typingRef.current) clearTimeout(typingRef.current); };
  }, [pendingMsg?.id]);

  const scrollContainer = document.querySelector('[data-ai-messages]');
  if (pendingMsg && scrollContainer) {
    scrollContainer.scrollTop = scrollContainer.scrollHeight;
  }
}

/* ─── Typing Cursor ─── */
function TypingCursor() {
  return (
    <span className="inline-block w-[2px] h-[1.1em] bg-[var(--af-accent)] ml-0.5 align-text-bottom animate-af-blink" />
  );
}

/* ─── Action Card Component ─── */
function ActionCard({ action }: { action: ExecutedAction }) {
  return (
    <div className={cn(
      'flex items-start gap-2.5 px-3 py-2.5 rounded-xl border text-xs',
      action.success
        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
        : 'bg-red-500/10 border-red-500/20 text-red-300'
    )}>
      <span className="text-base leading-none mt-0.5 shrink-0">{action.icon}</span>
      <div className="min-w-0">
        <p className="font-semibold text-xs">{action.label}</p>
        <p className="text-[11px] opacity-80 mt-0.5 break-words">{action.details}</p>
      </div>
      {action.success && (
        <Check size={16} className="text-emerald-400 shrink-0 mt-0.5 ml-auto" strokeWidth={2.5} aria-hidden="true"/>
      )}
    </div>
  );
}

export default function AIChatPanel({ isOpen, onClose }: AIChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: '¡Hola! Soy tu **Super IA** de Archii. 🚀\n\nPuedo **gestionar toda tu app** desde aquí:\n\n**Proyectos y Tareas**\n• ✅ Crear tareas, proyectos y actualizar estados\n• 📊 Consultar presupuestos y gastos\n• 🏗️ Gestionar fases de obra\n\n**Finanzas y Compras**\n• 💰 Registrar gastos y crear facturas\n• 🤝 Agregar proveedores y empresas\n• 🧾 Gestionar facturas (borrador → pagada)\n\n**Obra e Inventario**\n• 📦 Gestionar inventario y movimientos\n• 📓 Registrar bitácoras de obra diarias\n• 🔧 Crear punch items y submittals\n• ❓ Gestionar RFIs\n\n**Equipo y Tiempos**\n• 👥 Consultar equipo y asignar tareas\n• ⏱️ Registrar tiempos de trabajo\n• 📅 Programar reuniones\n\n**Análisis Visual**\n• 📸 Analizar imágenes (planos, obras, cotizaciones)\n\n**Ejemplos:**\n"Crea una tarea para revisar planos eléctricos"\n"¿Cuánto he gastado en materiales este mes?"\n"Agrega cemento Portland al inventario"\n"Crea una factura para el proyecto Torre 3"\n"Registra el tiempo de hoy: 4h en estructura"\n"Analiza esta imagen" (adjunta imagen 📸)\n\n¿En qué te ayudo hoy?',
      displayContent: '',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [executingTools, setExecutingTools] = useState(false);
  const [pendingImages, setPendingImages] = useState<{ url: string; mimeType: string; base64: string; name: string }[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const projectContext = useUIStore((s) => s.aiProjectContext);
  const { activeTenantId } = useApp();

  useTypewriter(messages, setMessages);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const isTypingActive = useMemo(() => messages.some(m => m.isTyping), [messages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTypingActive, scrollToBottom]);

  useEffect(() => {
    if (isOpen && inputRef.current && window.innerWidth >= 768) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  /* ─── Image Processing ─── */
  const processImage = (file: File): Promise<{ url: string; mimeType: string; base64: string; name: string } | null> => {
    return new Promise((resolve) => {
      if (!file.type.startsWith('image/')) {
        resolve(null);
        return;
      }
      if (file.size > 4 * 1024 * 1024) {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_DIM = 1024;
          let width = img.width;
          let height = img.height;
          if (width > MAX_DIM || height > MAX_DIM) {
            if (width > height) {
              height = (height / width) * MAX_DIM;
              width = MAX_DIM;
            } else {
              width = (width / height) * MAX_DIM;
              height = MAX_DIM;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL(file.type, 0.8);
          const base64 = dataUrl.split(',')[1];
          resolve({ url: dataUrl, mimeType: file.type, base64, name: file.name });
        };
        img.onerror = () => resolve(null);
        img.src = URL.createObjectURL(file);
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          const base64 = dataUrl.split(',')[1];
          resolve({ url: dataUrl, mimeType: file.type, base64, name: file.name });
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      }
    });
  };

  const sendMessage = async (content: string) => {
    if ((!content.trim() && pendingImages.length === 0) || isLoading) return;

    const userImages = pendingImages.length > 0
      ? pendingImages.map(img => ({ url: img.url, mimeType: img.mimeType }))
      : undefined;

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: content.trim() || 'Analiza esta imagen',
      timestamp: new Date(),
      images: userImages,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setPendingImages([]);
    setIsLoading(true);
    setExecutingTools(true);

    // Abort any previous in-flight request
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 120_000); // 2 min timeout

    try {
      const authHeaders = await getAuthHeaders();

      const apiMessages = [
        ...messages
          .filter((m) => m.id !== 'welcome' && !m.isError)
          .slice(-20)
          .map((m) => {
            const msg: any = { role: m.role, content: m.content };
            if (m.images && m.images.length > 0) {
              // For history messages, we don't have base64 — skip images in history
            }
            return msg;
          }),
      ];

      // Build the last user message with images
      const lastMsg: any = { role: userMessage.role, content: userMessage.content };
      if (pendingImages.length > 0) {
        lastMsg.images = pendingImages.map(img => ({ mimeType: img.mimeType, data: img.base64 }));
      }
      apiMessages.push(lastMsg);

      const response = await fetch('/api/ai-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        signal: controller.signal,
        body: JSON.stringify({
          messages: apiMessages,
          projectContext: projectContext || undefined,
          tenantId: activeTenantId || undefined,
        }),
      });

      const data = await response.json();
      clearTimeout(timeoutId);
      setExecutingTools(false);

      if (!response.ok) {
        if (data.setupRequired) {
          const errorMessage: Message = {
            id: `msg-${Date.now() + 1}`,
            role: 'assistant',
            content: `⚠️ ${data.error}\n\n${data.help}`,
            timestamp: new Date(),
            isError: true,
            isSetupRequired: true,
            helpText: data.help,
          };
          setMessages((prev) => [...prev, errorMessage]);
        } else {
          const errorMessage: Message = {
            id: `msg-${Date.now() + 1}`,
            role: 'assistant',
            content: `⚠️ ${data.error || 'Error desconocido'}`,
            timestamp: new Date(),
            isError: true,
          };
          setMessages((prev) => [...prev, errorMessage]);
        }
        return;
      }

      const assistantMessage: Message = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        content: data.message,
        displayContent: '',
        timestamp: new Date(),
        isTyping: true,
        actions: data.actions || undefined,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      clearTimeout(timeoutId);
      setExecutingTools(false);
      if ((error as Error).name === 'AbortError') {
        const errorMessage: Message = {
          id: `msg-${Date.now() + 1}`,
          role: 'assistant',
          content: '⚠️ La solicitud tardó demasiado. Intenta de nuevo con una consulta más corta.',
          timestamp: new Date(),
          isError: true,
        };
        setMessages((prev) => [...prev, errorMessage]);
      } else {
        console.error('[Archii AI] Error en chat:', error);
        const errorMessage: Message = {
          id: `msg-${Date.now() + 1}`,
          role: 'assistant',
          content: '⚠️ Error de conexión. Verifica tu internet e intenta de nuevo.',
          timestamp: new Date(),
          isError: true,
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          processImage(file).then((result) => {
            if (result) {
              setPendingImages(prev => [...prev, result]);
            }
          });
        }
      }
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      const result = await processImage(files[i]);
      if (result) {
        setPendingImages(prev => [...prev, result]);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Cleanup: abort in-flight request on unmount
  useEffect(() => {
    return () => { abortControllerRef.current?.abort(); };
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div
        className={cn(
          'relative w-full sm:max-w-lg h-[100dvh] sm:h-[80vh] max-h-[100dvh] sm:max-h-[700px] flex flex-col',
          'bg-[var(--af-bg1)] border border-[var(--af-bg4)] sm:rounded-2xl rounded-t-2xl shadow-2xl',
          'animate-slideUp overflow-hidden'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--af-bg4)]" style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 16px)' }}>
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--af-accent)] to-amber-600 flex items-center justify-center shadow-lg shadow-[var(--af-accent)]/20">
                <HelpCircle size={20} className="text-black" aria-hidden="true"/>
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-[var(--af-bg1)]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-bold text-foreground">Super IA</h3>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--af-accent)]/15 text-[var(--af-accent)] font-semibold">AGENT</span>
              </div>
              <p className="text-[11px] text-muted-foreground">Gestiono toda tu app: proyectos, inventario, finanzas y más</p>
            </div>
          </div>
          <button
            aria-label="Cerrar"
            onClick={onClose}
            className="w-10 h-10 rounded-lg hover:bg-[var(--af-bg4)] active:bg-[var(--af-bg4)] flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={16} aria-hidden="true"/>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 scrollbar-thin" data-ai-messages>
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                'flex',
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-gradient-to-br from-[var(--af-accent)] to-amber-600 text-black rounded-br-md shadow-md shadow-[var(--af-accent)]/10'
                    : msg.isError
                    ? 'bg-red-500/10 border border-red-500/20 text-red-400 rounded-bl-md'
                    : 'bg-[var(--af-bg3)] text-foreground rounded-bl-md'
                )}
              >
                {msg.role === 'assistant' && !msg.isError ? (
                  <div className="relative">
                    <div dangerouslySetInnerHTML={{ __html: formatMessage(msg.displayContent || msg.content) }} />
                    {msg.isTyping && <TypingCursor />}

                    {/* Action Cards */}
                    {msg.actions && msg.actions.length > 0 && !msg.isTyping && (
                      <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
                          Acciones ejecutadas
                        </p>
                        {msg.actions.map((action, i) => (
                          <ActionCard key={`${msg.id}-action-${i}`} action={action} />
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    {/* User images */}
                    {msg.role === 'user' && msg.images && msg.images.length > 0 && (
                      <div className="flex gap-1.5 flex-wrap mb-1.5">
                        {msg.images.map((img, i) => (
                          <img key={i} src={img.url} alt="" className="max-w-[200px] max-h-[150px] rounded-lg object-cover" />
                        ))}
                      </div>
                    )}
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Thinking indicator */}
          {isLoading && !isTypingActive && (
            <div className="flex justify-start">
              <div className="bg-[var(--af-bg3)] rounded-2xl rounded-bl-md px-4 py-3">
                {executingTools ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 size={14} className="animate-spin text-[var(--af-accent)]" aria-hidden="true"/>
                    <span className="text-[var(--af-accent)]">Ejecutando acciones...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-[var(--af-accent)]/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 rounded-full bg-[var(--af-accent)]/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 rounded-full bg-[var(--af-accent)]/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                )}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick prompts */}
        {messages.length <= 1 && (
          <div className="px-4 sm:px-5 pb-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 px-1">Acciones rápidas</p>
            <div className="grid grid-cols-2 gap-1.5">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt.text}
                  onClick={() => sendMessage(prompt.text)}
                  className="flex items-center gap-2 text-xs px-3 py-2.5 rounded-xl bg-[var(--af-bg3)] text-muted-foreground hover:text-foreground active:bg-[var(--af-bg4)] transition-all duration-200 border border-transparent hover:border-[var(--af-bg4)] text-left"
                >
                  <span className="text-sm">{prompt.icon}</span>
                  <span>{prompt.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="px-5 py-4 border-t border-[var(--af-bg4)]">
          {/* Pending images preview */}
          {pendingImages.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-2 px-1" style={{ scrollbarWidth: 'none' }}>
              {pendingImages.map((img, i) => (
                <div key={i} className="relative flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border border-[var(--af-bg4)]">
                  <img src={img.url} alt="" className="w-full h-full object-cover" />
                  <button
                    className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/60 text-white rounded-full text-[10px] flex items-center justify-center leading-none cursor-pointer border-none"
                    onClick={() => setPendingImages(prev => prev.filter((_, idx) => idx !== i))}
                  >✕</button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />

            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder="Dime qué necesitas... puedes adjuntar imágenes"
                rows={1}
                className={cn(
                  'w-full resize-none rounded-xl bg-[var(--af-bg3)] border border-[var(--af-bg4)]',
                  'px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground',
                  'focus:outline-none focus:ring-2 focus:ring-[var(--af-accent)]/40 focus:border-[var(--af-accent)]/40',
                  'transition-all duration-200',
                  'max-h-32 scrollbar-thin'
                )}
                style={{ minHeight: '44px' }}
              />
            </div>

            {/* Image upload button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-11 h-11 rounded-xl flex items-center justify-center hover:bg-[var(--af-bg4)] active:bg-[var(--af-bg4)] transition-all duration-200 shrink-0 text-muted-foreground hover:text-foreground"
              title="Subir imagen"
            >
              <ImageIcon size={20} aria-hidden="true"/>
            </button>

            {/* Send button */}
            <button
              onClick={() => sendMessage(input)}
              disabled={(!input.trim() && pendingImages.length === 0) || isLoading}
              className={cn(
                'w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 shrink-0',
                (input.trim() || pendingImages.length > 0) && !isLoading
                  ? 'bg-gradient-to-br from-[var(--af-accent)] to-amber-600 text-black hover:opacity-90 shadow-lg shadow-[var(--af-accent)]/20'
                  : 'bg-[var(--af-bg4)] text-muted-foreground cursor-not-allowed'
              )}
            >
              {isLoading ? (
                <Loader2 size={20} className="animate-spin" aria-hidden="true"/>
              ) : (
                <Send size={20} aria-hidden="true"/>
              )}
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground/50 mt-1 text-center pb-[env(safe-area-inset-bottom,0px)]">
            Super IA puede ejecutar acciones reales y analizar imágenes.
          </p>
        </div>
      </div>
    </div>
  );
}
