'use client';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useChatContext } from '@/hooks/useChat';
import { fmtRecTime, fmtSize as fmtFileSize } from '@/lib/helpers';
import { Search, ChevronLeft, X, Pause, Play, Download, MoreVertical, Paperclip, Mic, Send } from 'lucide-react';

/* ===== EMOJI DATA ===== */
const EMOJI_CATEGORIES = [
  { name: 'Frecuentes', icon: '🕐', emojis: ['👍','❤️','😂','🔥','😮','😢','🙏','🎉','💯','✅','❌','👀','💪','🤝','✨'] },
  { name: 'Smileys', icon: '😀', emojis: ['😀','😃','😄','😁','😅','🤣','😂','🙂','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🫡','🤐','🤨','😐','😑','😶','🫥','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐'] },
  { name: 'Gestos', icon: '👋', emojis: ['👋','🤚','🖐️','✋','🖖','🫱','🫲','🫳','🫴','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','🫵','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🤝','🙏'] },
  { name: 'Corazones', icon: '❤️', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','❣️','💕','💞','💓','💗','💖','💘','💝'] },
  { name: 'Construcción', icon: '🏗️', emojis: ['🏗️','🏠','🏢','📐','🔧','🔨','⚒️','🪛','⛏️','🪚','🔩','⚙️','🧱','🪨','🪵','🛖','🏘️','🏚️','🚧'] },
  { name: 'Naturaleza', icon: '🌿', emojis: ['🌳','🌲','🌴','🌵','🌱','🌿','☘️','🍀','🍁','🍂','🍃','🍄','🌾','💐','🌷','🌹','🥀','🌺','🌸','🌼','🌻','🌞','🌙','⭐','🌈','💧','🔥','🌊','❄️','⚡'] },
  { name: 'Comida', icon: '🍕', emojis: ['🍕','🍔','🍟','🌭','🍿','🧂','🥨','🥯','🍞','🥐','🥖','🧀','🥚','🍳','🥞','🧇','🥓','🥩','🍗','🍖','🌮','🌯','🥙','🧆','🥗','🥘','🍝','🍜','🍲','🍛','🍣','🍱'] },
  { name: 'Objetos', icon: '💡', emojis: ['💡','📱','💻','⌨️','🖥️','🖨️','📷','📹','🎥','📞','☎️','📺','📻','🎙️','⏰','📅','📎','📌','✂️','📁','📂','📊','📈','📋','📝','✏️','🖊️','🔖','💰','💎','🔑','🔒'] },
  { name: 'Banderas', icon: '🇨🇴', emojis: ['🇨🇴','🇺🇸','🇪🇸','🇲🇽','🇦🇷','🇧🇷','🇨🇱','🇵🇪','🇪🇨','🇻🇪','🇺🇾','🇵🇾','🇧🇴','🇵🇦','🇨🇷','🇬🇹','🏳️','🏴','🏴‍☠️'] },
];

/* ===== REACTION QUICK PICKS ===== */
const QUICK_REACTIONS = ['👍','❤️','😂','😮','😢','🔥','🙏','🎉'];

/* ===== DATE FORMATTER ===== */
const formatDateLabel = (date: Date): string => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = today.getTime() - msgDay.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  if (days < 7) return ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][date.getDay()];
  return date.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
};

/* ===== AVATAR COLOR ===== */
const getAvatarHSL = (uid: string) => {
  let h = 0;
  for (let i = 0; i < (uid || '').length; i++) h = uid.charCodeAt(i) + ((h << 5) - h);
  return `hsl(${Math.abs(h) % 360}, 55%, 45%)`;
};

export default function ChatScreen() {
  const { authUser, projects, teamUsers, forms, setForms, showToast } = useApp();
  const {
    audioPreviewBlobRef, audioPreviewDuration, audioPreviewUrl, audioProgress,
    chatDropActive, chatMobileShow, chatProjectId, fileIcon,
    fileInputRef, handleFileSelect, handleMicButton, isRecording,
    messages, pendingFiles, playingAudio, recDuration,
    recVolume, removePendingFile, sendAll, setAudioPreviewDuration, setAudioPreviewUrl,
    setChatDropActive, setChatMobileShow, setChatProjectId, setChatReplyingTo, setMessages,
    setShowEmojiPicker, showEmojiPicker, stopRecording, toggleAudioPlay,
    chatReplyingTo,
    messageReactions, toggleReaction,
    chatMenuMsg, setChatMenuMsg,
    chatMsgSearch, setChatMsgSearch,
    deleteMessage, copyMessageText,
  } = useChatContext();

  const [emojiSearch, setEmojiSearch] = useState('');
  const [activeEmojiCat, setActiveEmojiCat] = useState('Frecuentes');
  const [recentEmojis, setRecentEmojis] = useState<string[]>(QUICK_REACTIONS.slice(0, 8));
  const [lightboxImg, setLightboxImg] = useState<{ src: string; name?: string; size?: number } | null>(null);
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null);
  const msgsEndRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Close menu on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setChatMenuMsg(null);
        setShowReactionPicker(null);
      }
    };
    if (chatMenuMsg || showReactionPicker) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [chatMenuMsg, showReactionPicker]);

  // Filter emojis by search
  const filteredEmojis = useMemo(() => {
    if (!emojiSearch.trim()) return null;
    const allEmojis = EMOJI_CATEGORIES.flatMap(c => c.emojis);
    // Simple search: just return all (emojis don't have text names easily searchable)
    return allEmojis;
  }, [emojiSearch]);

  // Track recent emoji usage
  const addRecentEmoji = (emoji: string) => {
    setRecentEmojis(prev => {
      const filtered = prev.filter(e => e !== emoji);
      return [emoji, ...filtered].slice(0, 15);
    });
  };

  const insertEmoji = (emoji: string) => {
    addRecentEmoji(emoji);
    setForms(p => ({ ...p, chatInput: (p.chatInput || '') + emoji }));
    document.getElementById('chat-input-field')?.focus();
  };

  // Filter messages by search
  const filteredMessages = useMemo(() => {
    if (!chatMsgSearch.trim()) return messages;
    const q = chatMsgSearch.toLowerCase();
    return messages.filter((m: any) => {
      const text = (m.text || '').toLowerCase();
      const name = (m.userName || '').toLowerCase();
      return text.includes(q) || name.includes(q);
    });
  }, [messages, chatMsgSearch]);

  // Group messages by date
  const messagesByDate = useMemo(() => {
    const groups: { date: Date; dateLabel: string; messages: any[] }[] = [];
    let currentGroup: { date: Date; dateLabel: string; messages: any[] } | null = null;

    for (const m of filteredMessages) {
      const ts = m.createdAt?.toDate ? m.createdAt.toDate() : new Date();
      const label = formatDateLabel(ts);
      if (!currentGroup || currentGroup.dateLabel !== label) {
        currentGroup = { date: ts, dateLabel: label, messages: [m] };
        groups.push(currentGroup);
      } else {
        currentGroup.messages.push(m);
      }
    }
    return groups;
  }, [filteredMessages]);

  // Conversation title/subtitle
  const convTitle = chatProjectId === '__general__' ? '💬 Chat General' : projects.find(p => p.id === chatProjectId)?.data.name || 'Selecciona un proyecto';
  const convSubtitle = chatProjectId === '__general__' ? 'Canal de todo el equipo' : chatProjectId ? 'Canal del equipo' : '';

  return (
    <div className="animate-fadeIn flex flex-col md:h-full pb-[calc(60px+env(safe-area-inset-bottom,0px))] md:pb-0" style={{ minHeight: 0, flex: 1 }}>

      {/* ===== SIDEBAR ===== */}
      <div className={`${chatMobileShow ? 'hidden md:flex' : 'flex'} flex-col flex-1 md:w-[280px] md:flex-shrink-0 border-r border-[var(--border)] overflow-hidden bg-[var(--card)] md:bg-transparent`}>
        {/* Search */}
        <div className="p-3 border-b border-[var(--border)]">
          <div className="relative">
            <Search size={16} className="stroke-current fill-none flex-shrink-0 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" aria-hidden="true"/>
            <input className="w-full bg-[var(--af-bg3)] border border-[var(--border)] rounded-xl pl-9 pr-3 py-2.5 text-[13px] text-[var(--foreground)] outline-none focus:border-[var(--af-accent)] transition-colors placeholder:text-[var(--af-text3)]" placeholder="Buscar conversaciones..." value={forms.chatSearch || ''} onChange={e => setForms(p => ({ ...p, chatSearch: e.target.value }))} />
          </div>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          {/* Chat General */}
          <div
            className={`flex items-center gap-3 px-3 py-3.5 cursor-pointer transition-all duration-200 border-l-[3px] ${chatProjectId === '__general__' ? 'bg-[var(--accent)] border-l-[var(--af-accent)]' : 'border-l-transparent hover:bg-[var(--af-bg3)]'}`}
            onClick={() => { setChatProjectId('__general__'); setChatMobileShow(true); setShowEmojiPicker(false); }}
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--af-accent)] to-purple-500 flex items-center justify-center text-lg flex-shrink-0 shadow-md">💬</div>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-[var(--foreground)]">Chat General</div>
              <div className="text-[11px] text-[var(--af-text3)] truncate">Canal de todo el equipo</div>
            </div>
          </div>

          {/* Project chats */}
          {projects.length > 0 && (
            <div className="mt-1">
              <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-[var(--muted-foreground)]">Proyectos ({projects.length})</div>
              {projects
                .filter(p => !forms.chatSearch || p.data.name.toLowerCase().includes((forms.chatSearch || '').toLowerCase()))
                .map(p => {
                  const projColor = (p.data as Record<string, any>).color || 'var(--af-accent)';
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-all duration-200 border-l-[3px] ${p.id === chatProjectId && chatProjectId !== '__general__' ? 'bg-[var(--accent)] border-l-[var(--af-accent)]' : 'border-l-transparent hover:bg-[var(--af-bg3)]'}`}
                      onClick={() => { setChatProjectId(p.id); setChatMobileShow(true); setShowEmojiPicker(false); }}
                    >
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: projColor }} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium truncate text-[var(--foreground)]">{p.data.name}</div>
                        <div className="text-[11px] text-[var(--af-text3)] truncate">{p.data.client ? `Cliente: ${p.data.client}` : 'Canal del equipo'}</div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {/* ===== MESSAGE AREA ===== */}
      <div className={`${chatMobileShow ? 'flex' : 'hidden'} md:flex flex-col flex-1 min-h-0 overflow-hidden bg-background`}>
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--border)] flex-shrink-0 backdrop-blur-xl bg-[var(--card)]/80 z-10">
          <button aria-label="Volver a conversaciones" className="w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer hover:bg-[var(--af-bg3)] transition-colors lg:hidden" onClick={() => { setChatMobileShow(false); setShowEmojiPicker(false); }}>
            <ChevronLeft size={20} aria-hidden="true"/>
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate text-[var(--foreground)]">{convTitle}</div>
            <div className="text-[11px] text-[var(--muted-foreground)]">{convSubtitle}</div>
          </div>
          {/* Message search */}
          <div className="relative w-8 h-8 flex items-center justify-center">
            <button
              aria-label="Buscar mensajes"
              className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer hover:bg-[var(--af-bg3)] transition-colors"
              onClick={() => { if (chatMsgSearch) setChatMsgSearch(''); else setChatMsgSearch(' '); }}
              title="Buscar mensajes"
            >
              <Search size={16} className={`transition-colors ${chatMsgSearch ? 'text-[var(--af-accent)]' : 'text-[var(--muted-foreground)]'}`} aria-hidden="true"/>
            </button>
          </div>
        </div>

        {/* Message search bar */}
        {chatMsgSearch !== '' && (
          <div className="px-3 py-2 border-b border-[var(--border)] bg-[var(--card)] animate-fadeIn">
            <div className="relative">
              <Search size={14} className="stroke-current fill-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" aria-hidden="true"/>
              <input
                className="w-full bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg pl-8 pr-8 py-1.5 text-[12px] text-[var(--foreground)] outline-none focus:border-[var(--af-accent)] placeholder:text-[var(--af-text3)]"
                placeholder="Buscar en esta conversación..."
                value={chatMsgSearch === ' ' ? '' : chatMsgSearch}
                onChange={e => setChatMsgSearch(e.target.value)}
                autoFocus
              />
              <button aria-label="Limpiar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center hover:bg-[var(--af-bg4)] text-[var(--muted-foreground)] cursor-pointer border-none bg-transparent" onClick={() => setChatMsgSearch('')}>
                <X size={12} strokeWidth={2.5} aria-hidden="true"/>
              </button>
            </div>
          </div>
        )}

        {/* Messages scroll area */}
        <div
          id="chat-msgs"
          className="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-1"
          style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--border) transparent' }}
          onDragOver={(e) => { e.preventDefault(); setChatDropActive(true); }}
          onDragLeave={() => setChatDropActive(false)}
          onDrop={(e) => { e.preventDefault(); setChatDropActive(false); if (e.dataTransfer.files) handleFileSelect(e.dataTransfer.files); }}
          onPaste={(e) => { const items = e.clipboardData?.items; if (items) { const imgs: File[] = []; for (let i = 0; i < items.length; i++) { if (items[i].type.startsWith('image/')) { const f = items[i].getAsFile(); if (f) imgs.push(f); } } if (imgs.length > 0) { e.preventDefault(); handleFileSelect(imgs as unknown as FileList); } } }}
        >
          {/* Drag overlay */}
          {chatDropActive && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--af-accent)]/5 border-2 border-dashed border-[var(--af-accent)]/40 rounded-xl m-4 animate-fadeIn">
              <div className="text-center">
                <div className="text-5xl mb-3">📎</div>
                <div className="text-sm font-semibold text-[var(--af-accent)]">Suelta archivos aquí</div>
              </div>
            </div>
          )}

          {/* Empty state */}
          {filteredMessages.length === 0 && (
            <div className="flex-1 flex items-center justify-center py-12">
              <div className="text-center max-w-[240px]">
                <div className="w-20 h-20 rounded-2xl bg-[var(--af-bg3)] flex items-center justify-center mx-auto mb-4">
                  <span className="text-4xl">💬</span>
                </div>
                <div className="text-[14px] font-semibold text-[var(--foreground)] mb-1">
                  {chatMsgSearch.trim() ? 'Sin resultados' : 'Empieza la conversación'}
                </div>
                <div className="text-[12px] text-[var(--af-text3)] leading-relaxed">
                  {chatMsgSearch.trim() ? 'No se encontraron mensajes con ese criterio' : '¡Saluda al equipo y comparte actualizaciones!'}
                </div>
              </div>
            </div>
          )}

          {/* Message groups by date */}
          {messagesByDate.map((group, gi) => (
            <React.Fragment key={gi}>
              {/* Date separator */}
              {gi > 0 && (
                <div className="flex items-center gap-3 my-3">
                  <div className="flex-1 h-px bg-[var(--border)]" />
                  <span className="text-[11px] font-medium text-[var(--muted-foreground)] px-2 bg-background">{group.dateLabel}</span>
                  <div className="flex-1 h-px bg-[var(--border)]" />
                </div>
              )}
              {/* First date separator */}
              {gi === 0 && (
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1 h-px bg-[var(--border)]" />
                  <span className="text-[11px] font-medium text-[var(--muted-foreground)] px-2 bg-background">{group.dateLabel}</span>
                  <div className="flex-1 h-px bg-[var(--border)]" />
                </div>
              )}

              {/* Messages in group */}
              {group.messages.map((m: any, mi: number) => {
                const isMe = m.uid === authUser?.uid;
                const ts = m.createdAt?.toDate ? m.createdAt.toDate() : new Date();
                const msgType = m.type || 'TEXT';
                const prevMsg = mi > 0 ? group.messages[mi - 1] : null;
                const isSameSender = prevMsg && prevMsg.uid === m.uid;
                const reactions = messageReactions[m.id] || {};
                const reactionKeys = Object.keys(reactions);
                const hasReactions = reactionKeys.length > 0;
                const isMenuOpen = chatMenuMsg === m.id;
                const isReactionOpen = showReactionPicker === m.id;

                return (
                  <div
                    key={m.id}
                    className={`group relative flex flex-col ${isMe ? 'items-end' : 'items-start'} ${isSameSender ? 'mt-0.5' : 'mt-3'} animate-fadeIn`}
                    style={{ animationDuration: '0.2s' }}
                    onContextMenu={(e) => { e.preventDefault(); setChatMenuMsg(m.id); setShowReactionPicker(null); }}
                  >
                    {/* Sender info (show for new sender groups) */}
                    {!isSameSender && !isMe && (
                      <div className="flex items-center gap-2 mb-1 ml-1">
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                          style={{ background: getAvatarHSL(m.uid || ''), color: '#fff' }}
                        >
                          {(m.userName || '?')[0].toUpperCase()}
                        </div>
                        <span className="text-[11px] font-semibold text-[var(--foreground)]">{m.userName || 'Equipo'}</span>
                        <span className="text-[10px] text-[var(--af-text3)]">{ts.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    )}
                    {/* Timestamp for own messages */}
                    {!isSameSender && isMe && (
                      <div className="flex items-center gap-2 mb-1 mr-1">
                        <span className="text-[10px] text-[var(--af-text3)]">{ts.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span>
                        <span className="text-[11px] font-semibold text-[var(--foreground)]">Tú</span>
                      </div>
                    )}

                    {/* Reply reference */}
                    {m.replyTo && (
                      <div className={`mb-1 ml-1 max-w-[260px] px-2.5 py-1.5 rounded-lg border-l-2 border-l-[var(--af-accent)] bg-[var(--af-bg3)]/60 cursor-pointer transition-colors hover:bg-[var(--af-bg3)] ${isMe ? 'mr-1' : ''}`} onClick={() => {
                        const target = filteredMessages.find((msg: any) => msg.id === m.replyTo?.id);
                        if (target) {
                          const el = document.getElementById(`msg-${target.id}`);
                          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                      }}>
                        <div className="text-[10px] font-semibold text-[var(--af-accent)]">{m.replyTo.userName || 'Usuario'}</div>
                        <div className="text-[11px] text-[var(--af-text3)] truncate">{(m.replyTo.text || '').substring(0, 80)}</div>
                      </div>
                    )}

                    {/* Message bubble */}
                    <div
                      id={`msg-${m.id}`}
                      className={`relative max-w-[80%] rounded-2xl shadow-sm transition-shadow hover:shadow-md ${isMe ? 'rounded-br-md' : 'rounded-bl-md'}`}
                    >
                      {/* TEXT */}
                      {msgType === 'TEXT' && m.text && (
                        <div className={`px-3.5 py-2.5 text-[13px] leading-relaxed ${isMe ? 'bg-[var(--accent)] text-[var(--af-accent2)] border border-[var(--af-accent)]/20' : 'bg-[var(--af-bg3)] text-[var(--foreground)]'}`}>
                          {m.text.split('\n').map((l: string, i: number) => <span key={i}>{l}{i < m.text.split('\n').length - 1 ? <br /> : ''}</span>)}
                        </div>
                      )}

                      {/* AUDIO */}
                      {msgType === 'AUDIO' && m.audioData && (
                        <div className={`flex items-center gap-2.5 px-3 py-2.5 ${isMe ? 'bg-[var(--accent)] border border-[var(--af-accent)]/20' : 'bg-[var(--af-bg3)]'}`}>
                          <audio id={'audio-' + m.id} src={m.audioData} preload="metadata" className="hidden" />
                          <button
                            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 cursor-pointer border-none transition-transform active:scale-95"
                            style={{ background: playingAudio === m.id ? 'var(--af-accent)' : 'var(--af-bg4)' }}
                            onClick={() => toggleAudioPlay(m.id)}
                          >
                            {playingAudio === m.id ? (
                              <Pause size={14} fill="currentColor" stroke="none" aria-hidden="true"/>
                            ) : (
                              <Play size={14} fill="currentColor" stroke="none" className="ml-0.5" aria-hidden="true"/>
                            )}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex gap-0.5 items-end h-5">
                              {Array.from({ length: 28 }).map((_, i) => (
                                <div key={i} className="w-[3px] rounded-full transition-all duration-100" style={{ height: (i % 3 === 0 ? '6px' : i % 3 === 1 ? '12px' : '18px'), backgroundColor: playingAudio === m.id && ((i / 28) * 100 <= audioProgress) ? 'var(--af-accent)' : 'var(--border)' }} />
                              ))}
                            </div>
                            <div className="text-[10px] text-[var(--muted-foreground)] mt-0.5">{m.audioDuration ? fmtRecTime(m.audioDuration) : '0:00'}</div>
                          </div>
                          <div className="text-[10px]">🎙️</div>
                        </div>
                      )}

                      {/* IMAGE */}
                      {msgType === 'IMAGE' && m.fileData && (
                        <div className={`rounded-2xl overflow-hidden ${isMe ? 'border border-[var(--af-accent)]/20' : 'border border-[var(--border)]'}`}>
                          <img src={m.fileData} alt={m.fileName || 'Imagen'} className="max-w-full max-h-[300px] object-cover cursor-pointer rounded-2xl" onClick={() => setLightboxImg({ src: m.fileData, name: m.fileName, size: m.fileSize })} />
                          {m.fileName && <div className="text-[10px] text-[var(--muted-foreground)] px-2.5 py-1 bg-[var(--af-bg3)]">{m.fileName}{m.fileSize ? ` · ${fmtFileSize(m.fileSize)}` : ''}</div>}
                        </div>
                      )}

                      {/* FILE */}
                      {msgType === 'FILE' && m.fileData && (
                        <div className={`flex items-center gap-3 px-3.5 py-2.5 ${isMe ? 'bg-[var(--accent)] border border-[var(--af-accent)]/20' : 'bg-[var(--af-bg3)] border border-[var(--border)]'}`}>
                          <div className="text-2xl flex-shrink-0">{fileIcon(m.fileType || '')}</div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-medium truncate">{m.fileName || 'Archivo'}</div>
                            {m.fileSize && <div className="text-[10px] text-[var(--muted-foreground)]">{fmtFileSize(m.fileSize)}</div>}
                          </div>
                          <a href={m.fileData} download={m.fileName || 'archivo'} className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--af-bg4)] hover:bg-[var(--af-accent)]/10 transition-colors flex-shrink-0" title="Descargar">
                            <Download size={14} className="stroke-current fill-none" aria-hidden="true"/>
                          </a>
                        </div>
                      )}

                      {/* Action button (3 dots) */}
                      <button
                        aria-label="Más opciones del mensaje"
                        className={`absolute -top-2 ${isMe ? '-left-8' : '-right-8'} w-7 h-7 rounded-full flex items-center justify-center bg-[var(--af-bg4)] hover:bg-[var(--af-bg3)] md:opacity-0 md:group-hover:opacity-100 transition-opacity cursor-pointer border-none`}
                        style={{ top: -4, [isMe ? 'left' : 'right']: -32 }}
                        onClick={(e) => { e.stopPropagation(); setChatMenuMsg(chatMenuMsg === m.id ? null : m.id); setShowReactionPicker(null); }}
                      >
                        <MoreVertical size={14} className="text-[var(--muted-foreground)]" aria-hidden="true"/>
                      </button>

                      {/* Context menu */}
                      {isMenuOpen && (
                        <div ref={menuRef} className={`absolute z-20 bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-xl py-1 min-w-[160px] animate-fadeIn ${isMe ? 'right-0 mr-8' : 'left-0 ml-8'}`} style={{ bottom: 0, animationDuration: '0.12s' }}>
                          <button className="w-full px-3.5 py-2 text-[12px] text-left hover:bg-[var(--af-bg3)] transition-colors flex items-center gap-2.5 cursor-pointer border-none bg-transparent text-[var(--foreground)]" onClick={() => { setChatReplyingTo({ id: m.id, text: m.text || '', userName: m.userName, uid: m.uid }); setChatMenuMsg(null); }}>
                            <span className="text-sm">↩️</span> Responder
                          </button>
                          {m.text && (
                            <button className="w-full px-3.5 py-2 text-[12px] text-left hover:bg-[var(--af-bg3)] transition-colors flex items-center gap-2.5 cursor-pointer border-none bg-transparent text-[var(--foreground)]" onClick={() => copyMessageText(m.text)}>
                              <span className="text-sm">📋</span> Copiar texto
                            </button>
                          )}
                          <button className="w-full px-3.5 py-2 text-[12px] text-left hover:bg-[var(--af-bg3)] transition-colors flex items-center gap-2.5 cursor-pointer border-none bg-transparent text-[var(--foreground)]" onClick={() => { setShowReactionPicker(m.id); setChatMenuMsg(null); }}>
                            <span className="text-sm">😊</span> Reaccionar
                          </button>
                          {isMe && (
                            <div className="border-t border-[var(--border)] my-1" />
                          )}
                          {isMe && (
                            <button className="w-full px-3.5 py-2 text-[12px] text-left hover:bg-red-500/10 transition-colors flex items-center gap-2.5 cursor-pointer border-none bg-transparent text-red-400" onClick={() => deleteMessage(m.id)}>
                              <span className="text-sm">🗑️</span> Eliminar
                            </button>
                          )}
                        </div>
                      )}

                      {/* Reaction picker */}
                      {isReactionOpen && (
                        <div ref={menuRef} className={`absolute z-20 bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-xl px-2 py-1.5 flex gap-0.5 animate-fadeIn ${isMe ? 'right-0 mr-8' : 'left-0 ml-8'}`} style={{ bottom: 0, animationDuration: '0.12s' }}>
                          {QUICK_REACTIONS.map(e => (
                            <button key={e} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--af-bg3)] transition-transform hover:scale-125 cursor-pointer border-none bg-transparent text-lg" onClick={() => { toggleReaction(m.id, e); setShowReactionPicker(null); }}>{e}</button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Reactions row */}
                    {(hasReactions) && (
                      <div className={`flex flex-wrap gap-1 mt-0.5 ${isMe ? 'justify-end mr-1' : 'ml-1'}`}>
                        {reactionKeys.map(emoji => (
                          <button
                            key={emoji}
                            className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[12px] border cursor-pointer transition-all hover:scale-105 ${reactions[emoji].includes(authUser?.uid ?? '') ? 'bg-[var(--af-accent)]/15 border-[var(--af-accent)]/30' : 'bg-[var(--af-bg3)] border-[var(--border)] hover:border-[var(--af-accent)]/30'}`}
                            onClick={() => toggleReaction(m.id, emoji)}
                          >
                            <span>{emoji}</span>
                            <span className="text-[10px] text-[var(--muted-foreground)]">{reactions[emoji].length}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
          <div ref={msgsEndRef} />
        </div>

        {/* Recording state */}
        {isRecording && (
          <div className="flex-shrink-0 px-4 py-3 border-t border-[var(--border)] bg-red-500/5 flex items-center gap-3 animate-fadeIn">
            <div className="flex items-end gap-[3px]">
              {[recVolume * 28 + 4, recVolume * 22 + 6, recVolume * 32 + 3, recVolume * 18 + 5].map((h, i) => (
                <div key={i} className="w-[3px] bg-red-500 rounded-full animate-pulse" style={{ height: `${Math.max(h, 4)}px` }} />
              ))}
            </div>
            <span className="text-[13px] text-red-500 font-mono font-semibold">{fmtRecTime(recDuration)}</span>
            <button
              className="ml-auto text-[11px] px-4 py-1.5 rounded-full bg-red-500 text-white font-semibold cursor-pointer border-none hover:bg-red-600 transition-colors"
              onClick={async () => { const blob = await stopRecording(); if (blob) { const url = URL.createObjectURL(blob); setAudioPreviewUrl(url); setAudioPreviewDuration(recDuration); audioPreviewBlobRef.current = blob; } }}
            >
              Detener
            </button>
          </div>
        )}

        {/* Audio preview */}
        {audioPreviewUrl && !isRecording && (
          <div className="flex-shrink-0 px-4 py-2.5 border-t border-[var(--border)] bg-[var(--af-accent)]/5 flex items-center gap-3 animate-fadeIn">
            <div className="w-10 h-10 rounded-full bg-[var(--af-accent)]/15 flex items-center justify-center text-lg">🎙️</div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-medium text-[var(--muted-foreground)]">Nota de voz ({fmtRecTime(audioPreviewDuration)})</div>
            </div>
            <button className="text-[11px] px-3 py-1.5 rounded-full border border-red-500/30 text-red-400 hover:bg-red-500/10 cursor-pointer bg-transparent transition-colors" onClick={() => { setAudioPreviewUrl(null); audioPreviewBlobRef.current = null; }}>
              Descartar
            </button>
          </div>
        )}

        {/* Pending files */}
        {pendingFiles.length > 0 && (
          <div className="flex-shrink-0 px-4 py-2.5 border-t border-[var(--border)] bg-[var(--af-bg3)] animate-fadeIn">
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              {pendingFiles.map((f: any) => (
                <div key={f.id} className="flex-shrink-0 w-[72px] h-[72px] rounded-xl border border-[var(--border)] bg-[var(--card)] p-1 relative overflow-hidden shadow-sm">
                  {f.preview ? <img src={f.preview} className="w-full h-full object-cover rounded-lg" alt="" /> : <div className="w-full h-full flex items-center justify-center text-2xl">{fileIcon(f.type)}</div>}
                  <button className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center cursor-pointer border-none leading-none shadow-md" onClick={() => removePendingFile(f.id)}>✕</button>
                  <div className="absolute bottom-0 inset-x-0 bg-black/60 text-[9px] text-white truncate px-0.5 py-px rounded-b-lg">{f.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== EMOJI PICKER ===== */}
        {showEmojiPicker && (
          <div className="flex-shrink-0 border-t border-[var(--border)] bg-[var(--card)] animate-fadeIn flex flex-col" style={{ animationDuration: '0.15s', maxHeight: '280px' }}>
            {/* Emoji search */}
            <div className="px-3 pt-2 pb-1">
              <input
                className="w-full bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-[12px] text-[var(--foreground)] outline-none focus:border-[var(--af-accent)] placeholder:text-[var(--af-text3)]"
                placeholder="Buscar emoji..."
                value={emojiSearch}
                onChange={e => setEmojiSearch(e.target.value)}
              />
            </div>

            {/* Category tabs */}
            <div className="flex gap-0.5 px-2 py-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              {EMOJI_CATEGORIES.map(cat => (
                <button
                  key={cat.name}
                  className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm cursor-pointer border-none transition-colors ${activeEmojiCat === cat.name ? 'bg-[var(--af-accent)]/15' : 'bg-transparent hover:bg-[var(--af-bg3)]'}`}
                  onClick={() => { setActiveEmojiCat(cat.name); setEmojiSearch(''); }}
                  title={cat.name}
                >
                  {cat.icon}
                </button>
              ))}
            </div>

            {/* Emoji grid */}
            <div className="flex-1 overflow-y-auto px-2 pb-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--border) transparent' }}>
              {/* Recent emojis */}
              {activeEmojiCat === 'Frecuentes' && !emojiSearch.trim() && (
                <div className="py-1">
                  <div className="text-[10px] font-semibold uppercase text-[var(--muted-foreground)] px-1 mb-1">Recientes</div>
                  <div className="flex flex-wrap gap-0.5">
                    {recentEmojis.map((e, i) => (
                      <button key={`recent-${i}`} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[var(--af-bg3)] transition-colors cursor-pointer border-none bg-transparent text-[20px]" onClick={() => insertEmoji(e)}>{e}</button>
                    ))}
                  </div>
                  <div className="text-[10px] font-semibold uppercase text-[var(--muted-foreground)] px-1 mb-1 mt-2">Comunes</div>
                </div>
              )}

              {/* Emojis for active category or search */}
              {(emojiSearch.trim() ? filteredEmojis : EMOJI_CATEGORIES.find(c => c.name === activeEmojiCat)?.emojis || [])?.map((e, i) => (
                <button key={`${activeEmojiCat}-${i}`} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[var(--af-bg3)] transition-colors cursor-pointer border-none bg-transparent text-[20px]" onClick={() => insertEmoji(e)}>{e}</button>
              ))}
            </div>

            {/* Close button */}
            <div className="text-center py-1 border-t border-[var(--border)]">
              <button className="text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer border-none bg-transparent py-1 px-4" onClick={() => { setShowEmojiPicker(false); setEmojiSearch(''); }}>Cerrar</button>
            </div>
          </div>
        )}

        {/* ===== INPUT AREA ===== */}
        <div className="flex-shrink-0 border-t border-[var(--border)] bg-[var(--card)]">
          {/* Reply indicator */}
          {chatReplyingTo && (
            <div className="px-3 pt-2.5 pb-1 animate-fadeIn" style={{ animationDuration: '0.15s' }}>
              <div className="flex items-center gap-2 bg-[var(--af-bg3)] rounded-lg px-3 py-2 border-l-2 border-l-[var(--af-accent)]">
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-semibold text-[var(--af-accent)]">Respondiendo a {chatReplyingTo.userName || 'Usuario'}</div>
                  <div className="text-[11px] text-[var(--af-text3)] truncate">{(chatReplyingTo.text || '').substring(0, 100)}</div>
                </div>
                <button
                  aria-label="Cancelar respuesta"
                  className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-[var(--af-bg4)] text-[var(--muted-foreground)] cursor-pointer border-none bg-transparent flex-shrink-0"
                  onClick={() => setChatReplyingTo(null)}
                >
                  <X size={14} strokeWidth={2.5} aria-hidden="true"/>
                </button>
              </div>
            </div>
          )}

          <div className="flex gap-1 items-end px-2.5 py-2.5 safe-bottom">
            <input ref={fileInputRef} type="file" className="hidden" multiple onChange={(e) => handleFileSelect(e.target.files)} accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.dwg,.txt,.csv" />
            <button aria-label="Adjuntar archivo" className="w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer border-none bg-transparent hover:bg-[var(--af-bg3)] transition-colors flex-shrink-0" onClick={() => fileInputRef.current?.click()} title="Adjuntar archivo">
              <Paperclip size={18} className="stroke-[var(--muted-foreground)]" strokeWidth={1.75} aria-hidden="true"/>
            </button>
            <input
              id="chat-input-field"
              className="flex-1 bg-[var(--af-bg3)] border border-[var(--border)] rounded-2xl px-4 py-2.5 text-[15px] text-[var(--foreground)] outline-none focus:border-[var(--af-accent)] min-w-0 transition-colors placeholder:text-[var(--af-text3)]"
              placeholder="Escribe un mensaje..."
              value={forms.chatInput || ''}
              onChange={e => setForms(p => ({ ...p, chatInput: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAll(); } }}
            />
            <button
              className="w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer border-none bg-transparent hover:bg-[var(--af-bg3)] transition-colors flex-shrink-0"
              onClick={() => setShowEmojiPicker((p: any) => !p)}
              title="Emojis"
            >
              <span className="text-[20px]" role="img" aria-label="emojis">😀</span>
            </button>
            <button
              aria-label={isRecording ? 'Detener grabación' : audioPreviewUrl ? 'Descartar nota' : 'Grabar nota de voz'}
              className={`w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer border-none flex-shrink-0 transition-all ${isRecording ? 'bg-red-500 animate-pulse' : audioPreviewUrl ? 'bg-[var(--af-accent)]' : 'bg-transparent hover:bg-[var(--af-bg3)]'}`}
              onClick={handleMicButton}
              title={isRecording ? 'Detener grabación' : audioPreviewUrl ? 'Descartar nota' : 'Grabar nota de voz'}
            >
              {isRecording ? (
                <div className="w-3 h-3 bg-white rounded-sm" />
              ) : (
                <Mic size={18} fill={audioPreviewUrl ? 'var(--background)' : 'none'} stroke={audioPreviewUrl ? 'none' : 'currentColor'} strokeWidth={1.75} aria-hidden="true"/>
              )}
            </button>
            <button
              aria-label="Enviar"
              className="w-10 h-10 rounded-xl bg-[var(--af-accent)] flex items-center justify-center cursor-pointer border-none flex-shrink-0 active:scale-95 transition-transform hover:opacity-90 shadow-md"
              onClick={sendAll}
              title="Enviar"
            >
              <Send size={18} className="stroke-background" strokeWidth={2.5} aria-hidden="true"/>
            </button>
          </div>
        </div>
      </div>

      {/* ===== IMAGE LIGHTBOX ===== */}
      {lightboxImg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm animate-fadeIn cursor-pointer"
          onClick={() => setLightboxImg(null)}
        >
          <button
            aria-label="Cerrar"
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer border-none text-white z-10 transition-colors"
            onClick={() => setLightboxImg(null)}
          >
            <X size={20} strokeWidth={2.5} aria-hidden="true"/>
          </button>
          <img
            src={lightboxImg.src}
            alt={lightboxImg.name || 'Imagen'}
            className="max-w-[90vw] max-h-[80vh] object-contain rounded-lg shadow-2xl animate-fadeIn"
            style={{ animationDuration: '0.2s' }}
            onClick={e => e.stopPropagation()}
          />
          {(lightboxImg.name || lightboxImg.size) && (
            <div className="absolute bottom-6 text-center text-white/70 text-[12px]">
              {lightboxImg.name}{lightboxImg.size ? ` · ${fmtFileSize(lightboxImg.size)}` : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
