// ============================================================
//  chat.js — Chat de groupe temps réel via Supabase
// ============================================================

const CHAT = {
  channel: null,
  initialized: false,
  messages: [],       // historique local (max 80)
  MAX: 80,
};

// Palette de couleurs par username (toujours la même couleur pour le même pseudo)
const CHAT_COLORS = ['#00d4ff','#00ff88','#bf5af2','#ffd60a','#ff6b35','#ff2d78','#06d6a0','#f72585'];
function usernameColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return CHAT_COLORS[Math.abs(hash) % CHAT_COLORS.length];
}

function initChat() {
  if (CHAT.initialized) return;
  CHAT.initialized = true;
  loadChatHistory();
  startChatChannel();
}

/* ─── Charger les 50 derniers messages depuis Supabase ─── */
async function loadChatHistory() {
  const { data, error } = await db
    .from('chat_messages')
    .select('username, content, created_at, type')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) { console.error('[Chat]', error); return; }

  const msgs = (data || []).reverse();
  const box = document.getElementById('chatMessages');
  if (!box) return;
  box.innerHTML = '';
  msgs.forEach(m => appendChatMessage(m, false));
  scrollChatBottom();
}

/* ─── Canal Realtime ─── */
function startChatChannel() {
  if (CHAT.channel) db.removeChannel(CHAT.channel);

  CHAT.channel = db
    .channel('chat-live', { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'message' }, ({ payload }) => {
      appendChatMessage(payload, true);
    })
    .subscribe();
}

/* ─── Ajouter un message dans l'UI ─── */
function appendChatMessage(msg, animate = true) {
  const box = document.getElementById('chatMessages');
  if (!box) return;

  const isMine = msg.username === AppState.username;
  const color  = usernameColor(msg.username);
  const time   = new Date(msg.created_at || Date.now()).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });

  // Type spécial : annonce admin dans le chat
  if (msg.type === 'announce') {
    const el = document.createElement('div');
    el.className = 'chat-announce-msg' + (animate ? ' chat-in' : '');
    el.innerHTML = `
      <div style="background:rgba(255,45,120,0.1); border:1px solid rgba(255,45,120,0.3); border-radius:8px; padding:10px 14px; text-align:center;">
        <span style="color:#ff2d78; font-family:'Orbitron',monospace; font-size:11px; font-weight:700;">📢 ANNONCE ADMIN</span>
        <p style="color:#e0e0ff; font-family:'Share Tech Mono',monospace; font-size:12px; margin-top:4px;">${escapeHtml(msg.content)}</p>
        <span style="color:#4a5580; font-size:10px; font-family:monospace;">${time}</span>
      </div>`;
    box.appendChild(el);
    scrollChatBottom();
    return;
  }

  const el = document.createElement('div');
  el.className = 'chat-msg' + (animate ? ' chat-in' : '') + (isMine ? ' chat-mine' : '');
  el.innerHTML = `
    <div class="chat-bubble ${isMine ? 'chat-bubble-mine' : ''}">
      ${!isMine ? `<span class="chat-username" style="color:${color}">${escapeHtml(msg.username)}</span>` : ''}
      <p class="chat-text">${escapeHtml(msg.content)}</p>
      <span class="chat-time">${time}</span>
    </div>`;
  box.appendChild(el);

  // Limite locale
  CHAT.messages.push(msg);
  if (box.children.length > CHAT.MAX) box.removeChild(box.firstChild);

  if (animate) scrollChatBottom();
}

function scrollChatBottom() {
  const box = document.getElementById('chatMessages');
  if (box) box.scrollTop = box.scrollHeight;
}

/* ─── Envoyer un message ─── */
async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  if (!input) return;
  const content = input.value.trim();
  if (!content) return;
  input.value = '';

  const msg = {
    username: AppState.username,
    content,
    created_at: new Date().toISOString(),
    type: 'chat',
  };

  // Afficher localement tout de suite
  appendChatMessage(msg, true);

  // Sauvegarder en DB
  await db.from('chat_messages').insert({
    user_id: AppState.user.id,
    username: AppState.username,
    content,
    type: 'chat',
  });

  // Broadcast aux autres
  CHAT.channel?.send({ type: 'broadcast', event: 'message', payload: msg });
}

/* ─── Envoyer une blague dans le chat ─── */
async function sendBlagueToChat(setup, punchline) {
  const content = `😂 ${setup}\n👉 ${punchline}`;

  // S'assurer que le canal est ouvert même si l'onglet Chat n'a jamais été visité
  if (!CHAT.initialized) initChat();
  // Laisser le temps au channel de s'abonner si tout juste initialisé
  if (!CHAT.channel) {
    await new Promise(r => setTimeout(r, 600));
  }

  const msg = {
    username: AppState.username,
    content,
    created_at: new Date().toISOString(),
    type: 'chat',
  };

  // Afficher localement tout de suite
  appendChatMessage(msg, true);

  // Persister en base
  await db.from('chat_messages').insert({
    user_id: AppState.user.id,
    username: AppState.username,
    content,
    type: 'chat',
  });

  // Broadcaster aux autres
  CHAT.channel?.send({ type: 'broadcast', event: 'message', payload: msg });
  showToast('💬 Blague envoyée dans le chat !', 2000);
}

function cleanupChat() {
  if (CHAT.channel) { db.removeChannel(CHAT.channel); CHAT.channel = null; }
  CHAT.initialized = false;
}