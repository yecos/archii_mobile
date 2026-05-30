'use client';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import { getFirebase } from '@/lib/firebase-service';
import { fmtDateTime } from '@/lib/helpers';
import type { DirectMessageConversation, DirectMessageMsg } from '@/lib/types';
import { Search, ChevronLeft, Send, Plus, X } from 'lucide-react';

/* ===== AVATAR COLOR ===== */
const getAvatarHSL = (uid: string) => {
  let h = 0;
  for (let i = 0; i < (uid || '').length; i++) h = uid.charCodeAt(i) + ((h << 5) - h);
  return `hsl(${Math.abs(h) % 360}, 55%, 45%)`;
};

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

const formatTimeShort = (ts: any): string => {
  try {
    const d = ts && typeof ts === 'object' && typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][d.getDay()];
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
};

/* ===== CONVERSATION ID HELPER ===== */
function getDmId(uid1: string, uid2: string): string {
  return `dm_${[uid1, uid2].sort().join('_')}`;
}

export default function DirectMessagesScreen() {
  const { authUser, activeTenantId, teamUsers, showToast } = useApp();

  /* ===== STATE ===== */
  const [conversations, setConversations] = useState<DirectMessageConversation[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DirectMessageMsg[]>([]);
  const [inputText, setInputText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [showNewConvDialog, setShowNewConvDialog] = useState(false);
  const [newConvSearch, setNewConvSearch] = useState('');
  const [loadingConvs, setLoadingConvs] = useState(true);

  const msgsEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const unsubsRef = useRef<(() => void)[]>([]);

  /* ===== LISTEN TO CONVERSATIONS ===== */
  useEffect(() => {
    if (!authUser || !activeTenantId) { setConversations([]); setLoadingConvs(false); return; }

    const db = getFirebase().firestore();
    // Query conversations where the current user is a participant
    // Since Firestore doesn't support array-contains-any on multiple fields easily,
    // we use two queries: one for each possible position in the sorted array
    const uid = authUser.uid;

    // Actually, we can query by array-contains on participants
    const q = db.collection('directMessages')
      .where('participants', 'array-contains', uid)
      .where('tenantId', '==', activeTenantId)
      .orderBy('lastMessageAt', 'desc');

    const unsub = q.onSnapshot((snap: any) => {
      const convs = snap.docs.map((d: any) => ({
        id: d.id,
        data: d.data(),
      })) as DirectMessageConversation[];
      setConversations(convs);
      setLoadingConvs(false);
    }, (err: any) => {
      console.error('[DM] Error loading conversations:', err.code, err.message);
      setLoadingConvs(false);
    });

    return () => unsub();
  }, [authUser, activeTenantId]);

  /* ===== LISTEN TO MESSAGES FOR SELECTED CONVERSATION ===== */
  useEffect(() => {
    if (!selectedConvId || !authUser) { setMessages([]); return; }

    const db = getFirebase().firestore();
    const q = db.collection('directMessages')
      .doc(selectedConvId)
      .collection('messages')
      .orderBy('createdAt', 'asc');

    const unsub = q.onSnapshot((snap: any) => {
      const msgs = snap.docs.map((d: any) => ({
        id: d.id,
        data: d.data(),
      })) as DirectMessageMsg[];
      setMessages(msgs);
    }, (err: any) => {
      console.error('[DM] Error loading messages:', err.code, err.message);
    });

    return () => unsub();
  }, [selectedConvId, authUser]);

  /* ===== MARK MESSAGES AS READ ===== */
  useEffect(() => {
    if (!selectedConvId || !authUser || messages.length === 0) return;

    const unread = messages.filter(
      m => m.data.senderId !== authUser.uid && !m.data.readAt
    );
    if (unread.length === 0) return;

    const db = getFirebase().firestore();
    const batch = db.batch();
    const now = getFirebase().firestore.FieldValue.serverTimestamp();

    unread.forEach(m => {
      const ref = db.collection('directMessages')
        .doc(selectedConvId)
        .collection('messages')
        .doc(m.id);
      batch.update(ref, { readAt: now });
    });

    batch.commit().catch((err: any) => {
      console.error('[DM] Error marking messages as read:', err);
    });
  }, [selectedConvId, messages, authUser]);

  /* ===== AUTO-SCROLL ===== */
  useEffect(() => {
    msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  /* ===== DERIVED: OTHER PARTICIPANT ===== */
  const getOtherParticipant = useCallback((conv: DirectMessageConversation) => {
    if (!authUser) return null;
    const otherUid = conv.data.participants.find(p => p !== authUser.uid);
    if (!otherUid) return null;
    const teamUser = teamUsers.find(u => u.id === otherUid);
    return {
      uid: otherUid,
      name: conv.data.participantNames?.[otherUid] || teamUser?.data.name || 'Usuario',
      photo: conv.data.participantPhotos?.[otherUid] || teamUser?.data.photoURL || '',
      role: teamUser?.data.role || '',
    };
  }, [authUser, teamUsers]);

  /* ===== DERIVED: UNREAD COUNT ===== */
  const getUnreadCount = useCallback((conv: DirectMessageConversation): number => {
    if (!authUser) return 0;
    // We can't easily compute unread from just the conversation doc
    // without reading messages. We'll use a simple heuristic:
    // if lastMessageBy is not me and there's no read tracking on the conv level,
    // we show a dot. For proper unread counts, we'd need a per-user read timestamp.
    // For now, we'll track unread conversations in local state.
    return 0; // Simplified — would need more complex tracking
  }, [authUser]);

  /* ===== FILTERED CONVERSATIONS ===== */
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter(conv => {
      const other = getOtherParticipant(conv);
      return other?.name.toLowerCase().includes(q) || conv.data.lastMessage?.toLowerCase().includes(q);
    });
  }, [conversations, searchQuery, getOtherParticipant]);

  /* ===== GROUP MESSAGES BY DATE ===== */
  const messagesByDate = useMemo(() => {
    const groups: { dateLabel: string; messages: DirectMessageMsg[] }[] = [];
    let currentGroup: { dateLabel: string; messages: DirectMessageMsg[] } | null = null;

    for (const m of messages) {
      const ts = m.data.createdAt && typeof m.data.createdAt === 'object' && typeof (m.data.createdAt as any).toDate === 'function' ? (m.data.createdAt as any).toDate() : new Date();
      const label = formatDateLabel(ts);
      if (!currentGroup || currentGroup.dateLabel !== label) {
        currentGroup = { dateLabel: label, messages: [m] };
        groups.push(currentGroup);
      } else {
        currentGroup.messages.push(m);
      }
    }
    return groups;
  }, [messages]);

  /* ===== SELECTED CONVERSATION INFO ===== */
  const selectedConv = useMemo(() => {
    if (!selectedConvId) return null;
    return conversations.find(c => c.id === selectedConvId) || null;
  }, [selectedConvId, conversations]);

  const selectedOther = useMemo(() => {
    if (!selectedConv) return null;
    return getOtherParticipant(selectedConv);
  }, [selectedConv, getOtherParticipant]);

  /* ===== SEND MESSAGE ===== */
  const sendMessage = useCallback(async () => {
    if (!inputText.trim() || !authUser || !activeTenantId || !selectedOther) return;

    const text = inputText.trim();
    setInputText('');

    const db = getFirebase().firestore();
    const FieldValue = getFirebase().firestore.FieldValue;
    const dmId = getDmId(authUser.uid, selectedOther.uid);

    try {
      // Get current user info for senderName / senderPhoto
      const myTeamUser = teamUsers.find(u => u.id === authUser.uid);
      const senderName = myTeamUser?.data.name || authUser.displayName || authUser.email?.split('@')[0] || 'Yo';
      const senderPhoto = myTeamUser?.data.photoURL || authUser.photoURL || '';

      // Create or update the conversation document
      const convRef = db.collection('directMessages').doc(dmId);
      const convSnap = await convRef.get();

      if (!convSnap.exists) {
        // Create new conversation
        await convRef.set({
          participants: [authUser.uid, selectedOther.uid].sort(),
          participantNames: {
            [authUser.uid]: senderName,
            [selectedOther.uid]: selectedOther.name,
          },
          participantPhotos: {
            [authUser.uid]: senderPhoto,
            [selectedOther.uid]: selectedOther.photo,
          },
          tenantId: activeTenantId,
          lastMessage: text,
          lastMessageAt: FieldValue.serverTimestamp(),
          lastMessageBy: authUser.uid,
          createdAt: FieldValue.serverTimestamp(),
        });
      } else {
        // Update existing conversation
        await convRef.update({
          lastMessage: text,
          lastMessageAt: FieldValue.serverTimestamp(),
          lastMessageBy: authUser.uid,
          participantNames: {
            [authUser.uid]: senderName,
            [selectedOther.uid]: selectedOther.name,
          },
          participantPhotos: {
            [authUser.uid]: senderPhoto,
            [selectedOther.uid]: selectedOther.photo,
          },
        });
      }

      // Add the message to the subcollection
      await convRef.collection('messages').add({
        text,
        senderId: authUser.uid,
        senderName,
        senderPhoto,
        createdAt: FieldValue.serverTimestamp(),
        readAt: null,
      });

      // If we weren't on this conversation, select it
      if (selectedConvId !== dmId) {
        setSelectedConvId(dmId);
        setMobileShowChat(true);
      }
    } catch (err: any) {
      console.error('[DM] Error sending message:', err);
      showToast('Error al enviar mensaje', 'error');
      setInputText(text); // Restore the text
    }
  }, [inputText, authUser, activeTenantId, selectedOther, selectedConvId, teamUsers, showToast]);

  /* ===== START NEW CONVERSATION ===== */
  const startConversation = useCallback((targetUid: string) => {
    if (!authUser) return;
    const dmId = getDmId(authUser.uid, targetUid);
    setSelectedConvId(dmId);
    setMobileShowChat(true);
    setShowNewConvDialog(false);
    setNewConvSearch('');
    // Focus input after a short delay
    setTimeout(() => inputRef.current?.focus(), 300);
  }, [authUser]);

  /* ===== SELECT CONVERSATION ===== */
  const selectConversation = useCallback((convId: string) => {
    setSelectedConvId(convId);
    setMobileShowChat(true);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  /* ===== BACK TO LIST (MOBILE) ===== */
  const goBackToList = useCallback(() => {
    setMobileShowChat(false);
  }, []);

  /* ===== FILTERED TEAM USERS FOR NEW CONVERSATION ===== */
  const availableUsers = useMemo(() => {
    if (!authUser) return [];
    return teamUsers
      .filter(u => u.id !== authUser.uid)
      .filter(u => {
        if (!newConvSearch.trim()) return true;
        const q = newConvSearch.toLowerCase();
        return u.data.name?.toLowerCase().includes(q) || u.data.email?.toLowerCase().includes(q);
      });
  }, [teamUsers, authUser, newConvSearch]);

  return (
    <div className="animate-fadeIn flex flex-col md:flex-row md:h-full pb-[calc(60px+env(safe-area-inset-bottom,0px))] md:pb-0" style={{ minHeight: 0, flex: 1 }}>

      {/* ===== LEFT PANEL: CONVERSATIONS LIST ===== */}
      <div className={`${mobileShowChat ? 'hidden md:flex' : 'flex'} flex-col flex-1 md:w-[320px] md:flex-shrink-0 border-r border-[var(--border)] overflow-hidden bg-[var(--card)] md:bg-transparent`}>
        {/* Header */}
        <div className="p-3 border-b border-[var(--border)] flex items-center gap-2">
          <div className="flex-1 relative">
            <Search size={16} className="stroke-current fill-none flex-shrink-0 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" aria-hidden="true"/>
            <input
              className="w-full bg-[var(--af-bg3)] border border-[var(--border)] rounded-xl pl-9 pr-3 py-2.5 text-[13px] text-[var(--foreground)] outline-none focus:border-[var(--af-accent)] transition-colors placeholder:text-[var(--af-text3)]"
              placeholder="Buscar conversaciones..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <button
            aria-label="Nueva conversación"
            className="w-10 h-10 rounded-xl bg-[var(--af-accent)] flex items-center justify-center cursor-pointer border-none flex-shrink-0 active:scale-95 transition-transform hover:opacity-90 shadow-md"
            onClick={() => setShowNewConvDialog(true)}
            title="Nueva conversación"
          >
            <Plus size={18} className="stroke-background" strokeWidth={2.5} aria-hidden="true"/>
          </button>
        </div>

        {/* Scrollable conversations list */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          {/* Empty state */}
          {!loadingConvs && filteredConversations.length === 0 && (
            <div className="flex-1 flex items-center justify-center py-16 px-6">
              <div className="text-center max-w-[240px]">
                <div className="w-20 h-20 rounded-2xl bg-[var(--af-bg3)] flex items-center justify-center mx-auto mb-4">
                  <span className="text-4xl">✉️</span>
                </div>
                <div className="text-[14px] font-semibold text-[var(--foreground)] mb-1">
                  {searchQuery.trim() ? 'Sin resultados' : 'Sin conversaciones'}
                </div>
                <div className="text-[12px] text-[var(--af-text3)] leading-relaxed">
                  {searchQuery.trim()
                    ? 'No se encontraron conversaciones con ese criterio'
                    : 'Inicia una conversación privada con un miembro del equipo'}
                </div>
                {!searchQuery.trim() && (
                  <button
                    className="mt-4 px-4 py-2 bg-[var(--af-accent)] text-background rounded-xl text-[12px] font-semibold cursor-pointer border-none hover:opacity-90 transition-opacity"
                    onClick={() => setShowNewConvDialog(true)}
                  >
                    Nueva Conversación
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Conversation items */}
          {filteredConversations.map(conv => {
            const other = getOtherParticipant(conv);
            if (!other) return null;
            const isSelected = conv.id === selectedConvId;
            const lastMsgTime = conv.data.lastMessageAt && typeof conv.data.lastMessageAt === 'object' && typeof (conv.data.lastMessageAt as any).toDate === 'function' ? (conv.data.lastMessageAt as any).toDate() : null;
            const isLastByMe = conv.data.lastMessageBy === authUser?.uid;

            return (
              <div
                key={conv.id}
                className={`flex items-center gap-3 px-3 py-3 cursor-pointer transition-all duration-200 border-l-[3px] ${isSelected ? 'bg-[var(--accent)] border-l-[var(--af-accent)]' : 'border-l-transparent hover:bg-[var(--af-bg3)]'}`}
                onClick={() => selectConversation(conv.id)}
              >
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center text-[14px] font-bold"
                    style={{ background: other.photo ? undefined : getAvatarHSL(other.uid), color: '#fff' }}
                  >
                    {other.photo
                      ? <img src={other.photo} alt="" className="w-full h-full rounded-full object-cover" />
                      : (other.name || '?')[0].toUpperCase()
                    }
                  </div>
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[13px] font-semibold truncate text-[var(--foreground)]">{other.name}</div>
                    {lastMsgTime && (
                      <div className="text-[10px] text-[var(--af-text3)] flex-shrink-0">{formatTimeShort(lastMsgTime)}</div>
                    )}
                  </div>
                  <div className="text-[12px] text-[var(--af-text3)] truncate mt-0.5">
                    {conv.data.lastMessage
                      ? (isLastByMe ? `Tú: ${conv.data.lastMessage}` : conv.data.lastMessage)
                      : 'Sin mensajes aún'
                    }
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ===== RIGHT PANEL: MESSAGE THREAD ===== */}
      <div className={`${mobileShowChat ? 'flex' : 'hidden'} md:flex flex-col flex-1 min-h-0 overflow-hidden bg-background`}>
        {selectedOther ? (
          <>
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--border)] flex-shrink-0 backdrop-blur-xl bg-[var(--card)]/80 z-10">
              <button
                aria-label="Volver a conversaciones"
                className="w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer hover:bg-[var(--af-bg3)] transition-colors lg:hidden"
                onClick={goBackToList}
              >
                <ChevronLeft size={20} aria-hidden="true"/>
              </button>
              <div className="relative flex-shrink-0">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold"
                  style={{ background: selectedOther.photo ? undefined : getAvatarHSL(selectedOther.uid), color: '#fff' }}
                >
                  {selectedOther.photo
                    ? <img src={selectedOther.photo} alt="" className="w-full h-full rounded-full object-cover" />
                    : (selectedOther.name || '?')[0].toUpperCase()
                  }
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate text-[var(--foreground)]">{selectedOther.name}</div>
                <div className="text-[11px] text-[var(--muted-foreground)]">{selectedOther.role || 'Miembro del equipo'}</div>
              </div>
            </div>

            {/* Messages scroll area */}
            <div
              className="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-1"
              style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--border) transparent' }}
            >
              {/* Empty state */}
              {messages.length === 0 && (
                <div className="flex-1 flex items-center justify-center py-12">
                  <div className="text-center max-w-[240px]">
                    <div className="w-20 h-20 rounded-2xl bg-[var(--af-bg3)] flex items-center justify-center mx-auto mb-4">
                      <span className="text-4xl">🤝</span>
                    </div>
                    <div className="text-[14px] font-semibold text-[var(--foreground)] mb-1">Inicia una conversación</div>
                    <div className="text-[12px] text-[var(--af-text3)] leading-relaxed">
                      Envía el primer mensaje para iniciar el chat directo con {selectedOther.name}
                    </div>
                  </div>
                </div>
              )}

              {/* Message groups by date */}
              {messagesByDate.map((group, gi) => (
                <React.Fragment key={gi}>
                  {/* Date separator */}
                  <div className="flex items-center gap-3 my-3">
                    <div className="flex-1 h-px bg-[var(--border)]" />
                    <span className="text-[11px] font-medium text-[var(--muted-foreground)] px-2 bg-background">{group.dateLabel}</span>
                    <div className="flex-1 h-px bg-[var(--border)]" />
                  </div>

                  {/* Messages in group */}
                  {group.messages.map((m, mi) => {
                    const isMe = m.data.senderId === authUser?.uid;
                    const ts = m.data.createdAt && typeof m.data.createdAt === 'object' && typeof (m.data.createdAt as any).toDate === 'function' ? (m.data.createdAt as any).toDate() : new Date();
                    const prevMsg = mi > 0 ? group.messages[mi - 1] : null;
                    const isSameSender = prevMsg && prevMsg.data.senderId === m.data.senderId;

                    return (
                      <div
                        key={m.id}
                        className={`group relative flex flex-col ${isMe ? 'items-end' : 'items-start'} ${isSameSender ? 'mt-0.5' : 'mt-3'} animate-fadeIn`}
                        style={{ animationDuration: '0.2s' }}
                      >
                        {/* Sender info (show for new sender groups) */}
                        {!isSameSender && !isMe && (
                          <div className="flex items-center gap-2 mb-1 ml-1">
                            <div
                              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                              style={{ background: m.data.senderPhoto ? undefined : getAvatarHSL(m.data.senderId), color: '#fff' }}
                            >
                              {m.data.senderPhoto
                                ? <img src={m.data.senderPhoto} alt="" className="w-full h-full rounded-full object-cover" />
                                : (m.data.senderName || '?')[0].toUpperCase()
                              }
                            </div>
                            <span className="text-[11px] font-semibold text-[var(--foreground)]">{m.data.senderName || 'Usuario'}</span>
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

                        {/* Message bubble */}
                        <div className={`relative max-w-[80%] rounded-2xl shadow-sm transition-shadow hover:shadow-md ${isMe ? 'rounded-br-md' : 'rounded-bl-md'}`}>
                          <div className={`px-3.5 py-2.5 text-[13px] leading-relaxed ${isMe ? 'bg-[var(--accent)] text-[var(--af-accent2)] border border-[var(--af-accent)]/20' : 'bg-[var(--af-bg3)] text-[var(--foreground)]'}`}>
                            {m.data.text.split('\n').map((l, i) => <span key={i}>{l}{i < m.data.text.split('\n').length - 1 ? <br /> : ''}</span>)}
                          </div>
                        </div>

                        {/* Read indicator for own messages */}
                        {isMe && mi === group.messages.length - 1 && m.data.readAt && (
                          <div className="text-[10px] text-[var(--af-text3)] mr-1 mt-0.5">Leído</div>
                        )}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
              <div ref={msgsEndRef} />
            </div>

            {/* Input area */}
            <div className="flex-shrink-0 px-3 py-2.5 border-t border-[var(--border)] bg-[var(--card)]/80 backdrop-blur-xl">
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  className="flex-1 bg-[var(--af-bg3)] border border-[var(--border)] rounded-2xl px-4 py-2.5 text-[15px] text-[var(--foreground)] outline-none focus:border-[var(--af-accent)] min-w-0 transition-colors placeholder:text-[var(--af-text3)]"
                  placeholder="Escribe un mensaje..."
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                />
                <button
                  aria-label="Enviar"
                  className="w-10 h-10 rounded-xl bg-[var(--af-accent)] flex items-center justify-center cursor-pointer border-none flex-shrink-0 active:scale-95 transition-transform hover:opacity-90 shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={sendMessage}
                  disabled={!inputText.trim()}
                  title="Enviar"
                >
                  <Send size={18} className="stroke-background" strokeWidth={2.5} aria-hidden="true"/>
                </button>
              </div>
            </div>
          </>
        ) : (
          /* No conversation selected */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-[260px]">
              <div className="w-24 h-24 rounded-2xl bg-[var(--af-bg3)] flex items-center justify-center mx-auto mb-4">
                <span className="text-5xl">✉️</span>
              </div>
              <div className="text-[15px] font-semibold text-[var(--foreground)] mb-1">Mensajes Directos</div>
              <div className="text-[12px] text-[var(--af-text3)] leading-relaxed">
                Selecciona una conversación o inicia una nueva para comunicarte directamente con tu equipo
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== NEW CONVERSATION DIALOG ===== */}
      {showNewConvDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fadeIn" onClick={() => setShowNewConvDialog(false)}>
          <div
            className="bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl w-[90vw] max-w-[400px] max-h-[80vh] flex flex-col animate-fadeIn overflow-hidden"
            onClick={e => e.stopPropagation()}
            style={{ animationDuration: '0.15s' }}
          >
            {/* Dialog header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <h2 className="text-[15px] font-bold text-[var(--foreground)]">Nueva Conversación</h2>
              <button
                aria-label="Cerrar"
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--af-bg3)] text-[var(--muted-foreground)] cursor-pointer border-none bg-transparent transition-colors"
                onClick={() => setShowNewConvDialog(false)}
              >
                <X size={16} aria-hidden="true"/>
              </button>
            </div>

            {/* Search */}
            <div className="px-4 pt-3 pb-2">
              <div className="relative">
                <Search size={16} className="stroke-current fill-none flex-shrink-0 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" aria-hidden="true"/>
                <input
                  className="w-full bg-[var(--af-bg3)] border border-[var(--border)] rounded-xl pl-9 pr-3 py-2.5 text-[13px] text-[var(--foreground)] outline-none focus:border-[var(--af-accent)] transition-colors placeholder:text-[var(--af-text3)]"
                  placeholder="Buscar miembro..."
                  value={newConvSearch}
                  onChange={e => setNewConvSearch(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            {/* User list */}
            <div className="flex-1 overflow-y-auto px-2 pb-2" style={{ scrollbarWidth: 'thin' }}>
              {availableUsers.length === 0 && (
                <div className="py-8 text-center">
                  <div className="text-[13px] text-[var(--af-text3)]">
                    {newConvSearch.trim() ? 'No se encontraron miembros' : 'No hay miembros disponibles'}
                  </div>
                </div>
              )}
              {availableUsers.map(u => {
                // Check if conversation already exists
                const existingConvId = getDmId(authUser?.uid || '', u.id);
                const hasExisting = conversations.some(c => c.id === existingConvId);

                return (
                  <div
                    key={u.id}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-200 ${hasExisting ? 'hover:bg-[var(--af-bg3)]' : 'hover:bg-[var(--af-bg3)]'}`}
                    onClick={() => startConversation(u.id)}
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-bold flex-shrink-0"
                      style={{ background: u.data.photoURL ? undefined : getAvatarHSL(u.id), color: '#fff' }}
                    >
                      {u.data.photoURL
                        ? <img src={u.data.photoURL} alt="" className="w-full h-full rounded-full object-cover" />
                        : (u.data.name || u.data.email || '?')[0].toUpperCase()
                      }
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium truncate text-[var(--foreground)]">{u.data.name || u.data.email}</div>
                      <div className="text-[11px] text-[var(--af-text3)] truncate">
                        {u.data.role || 'Miembro'}
                        {hasExisting && ' · Conversación existente'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
