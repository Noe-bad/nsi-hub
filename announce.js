// ============================================================
//  announce.js — Annonces admin broadcast + overlay plein écran
// ============================================================

const ANN = {
  channel: null,
  initialized: false,
  type: 'info',
  history: [],
};

const ANN_CONFIG = {
  info:    { icon:'ℹ️',  color:'#00d4ff', badge:'INFO',    border:'rgba(0,212,255,0.4)' },
  warning: { icon:'⚠️',  color:'#ffd60a', badge:'ALERTE',  border:'rgba(255,214,10,0.4)' },
  success: { icon:'✅',  color:'#00ff88', badge:'SUCCÈS',  border:'rgba(0,255,136,0.4)' },
  danger:  { icon:'🚨',  color:'#ff2d78', badge:'URGENT',  border:'rgba(255,45,120,0.6)' },
};

function initAnnounces() {
  if (ANN.initialized) return;
  ANN.initialized = true;
  loadAnnounceHistory();
  startAnnounceChannel();
}

/* ─── Canal Realtime broadcast ─── */
function startAnnounceChannel() {
  if (ANN.channel) db.removeChannel(ANN.channel);

  ANN.channel = db
    .channel('announce-broadcast', { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'announce' }, ({ payload }) => {
      displayAnnounceOverlay(payload);
      addAnnounceToHistory(payload);
      // Envoyer aussi dans le chat
      if (CHAT.channel) {
        const chatMsg = { username: '📢 Admin', content: `[ANNONCE] ${payload.title}${payload.body ? ' — ' + payload.body : ''}`, created_at: new Date().toISOString(), type: 'announce' };
        const box = document.getElementById('chatMessages');
        if (box) appendChatMessage(chatMsg, true);
      }
    })
    .subscribe();
}

/* ─── Charger historique depuis DB ─── */
async function loadAnnounceHistory() {
  const { data } = await db
    .from('announcements')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  const container = document.getElementById('announceHistory');
  if (!container) return;
  if (!data || data.length === 0) {
    container.innerHTML = `<p class="font-mono text-xs text-[#3a4060]">Aucune annonce pour l'instant.</p>`;
    return;
  }
  container.innerHTML = '';
  data.forEach(a => addAnnounceToHistory(a, false));
}

/* ─── Ajouter dans l'historique UI ─── */
function addAnnounceToHistory(a, prepend = true) {
  const container = document.getElementById('announceHistory');
  if (!container) return;

  const cfg = ANN_CONFIG[a.type] || ANN_CONFIG.info;
  const date = new Date(a.created_at || Date.now()).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });

  const el = document.createElement('div');
  el.className = 'announce-history-item';
  el.style.cssText = `border-left:4px solid ${cfg.color}; background:rgba(255,255,255,0.02); border-radius:0 10px 10px 0; padding:14px 18px; animation: fadeInSection 0.2s ease; margin-bottom:2px;`;
  el.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
      <span style="font-size:18px;">${cfg.icon}</span>
      <span style="font-family:'Orbitron',monospace; font-weight:700; font-size:14px; color:${cfg.color};">${escapeHtml(a.title)}</span>
      <span style="font-family:monospace; font-size:11px; color:#4a5580; margin-left:auto; white-space:nowrap;">${date}</span>
    </div>
    ${a.body ? `<p style="font-family:'Share Tech Mono',monospace; font-size:12px; color:#9090c0; margin-left:28px; line-height:1.6;">${escapeHtml(a.body)}</p>` : ''}
    <p style="font-family:monospace; font-size:11px; color:#4a5580; margin-left:28px; margin-top:6px;">— ${escapeHtml(a.from || 'Admin')}</p>
  `;

  if (prepend && container.firstChild) container.insertBefore(el, container.firstChild);
  else container.appendChild(el);

  // Vider le placeholder
  const placeholder = container.querySelector('p');
  if (placeholder && placeholder.textContent.includes('Chargement')) placeholder.remove();
}

/* ─── Afficher l'overlay plein écran ─── */
function displayAnnounceOverlay(a) {
  const cfg = ANN_CONFIG[a.type] || ANN_CONFIG.info;
  const overlay = document.getElementById('announceOverlay');
  const box     = document.getElementById('announceOverlayBox');

  document.getElementById('announceOverlayIcon').textContent  = cfg.icon;
  document.getElementById('announceOverlayTitle').textContent = a.title;
  document.getElementById('announceOverlayBody').textContent  = a.body || '';
  document.getElementById('announceOverlayFrom').textContent  = `— envoyé par ${a.from || 'Admin'}`;

  const badge = document.getElementById('announceOverlayBadge');
  badge.textContent = cfg.badge;
  badge.style.color = cfg.color;
  badge.style.borderColor = cfg.color;

  const titleEl = document.getElementById('announceOverlayTitle');
  titleEl.style.color = cfg.color;

  if (box) box.style.borderColor = cfg.border;

  overlay.classList.remove('hidden');
  overlay.style.display = 'flex';

  // Auto-close après 30s (sauf urgent)
  if (a.type !== 'danger') {
    setTimeout(closeAnnounceOverlay, 30000);
  }
}

function closeAnnounceOverlay() {
  const overlay = document.getElementById('announceOverlay');
  if (overlay) { overlay.classList.add('hidden'); overlay.style.display = ''; }
}

/* ─── Sélectionner le type d'annonce ─── */
function setAnnounceType(type) {
  ANN.type = type;
  document.querySelectorAll('.announce-type-btn').forEach(btn => btn.classList.remove('active-type'));
  document.getElementById('aType' + type.charAt(0).toUpperCase() + type.slice(1))?.classList.add('active-type');
}

/* ─── Envoyer une annonce ─── */
async function sendAnnouncement() {
  if (!AppState.isAdmin || !AppState.adminMode) {
    showToast('🔒 Accès réservé aux admins.', 2000); return;
  }
  const title = document.getElementById('announceTitleInput')?.value.trim();
  const body  = document.getElementById('announceBodyInput')?.value.trim();
  const fullscreen = document.getElementById('announceFullscreen')?.checked;

  if (!title) { showToast('⚠️ Saisis un titre.', 2000); return; }

  const payload = {
    type: ANN.type,
    title,
    body: body || '',
    from: AppState.username,
    fullscreen,
    created_at: new Date().toISOString(),
  };

  // Sauvegarder en DB
  await db.from('announcements').insert({
    type: payload.type,
    title: payload.title,
    body: payload.body,
    from: payload.from,
    created_at: payload.created_at,
  });

  // Broadcast
  ANN.channel?.send({ type: 'broadcast', event: 'announce', payload });

  // Afficher localement
  if (fullscreen) displayAnnounceOverlay(payload);
  addAnnounceToHistory(payload, true);

  // Vider le formulaire
  document.getElementById('announceTitleInput').value = '';
  document.getElementById('announceBodyInput').value  = '';

  showToast('📢 Annonce envoyée à tous !', 3000);
}

function cleanupAnnounces() {
  if (ANN.channel) { db.removeChannel(ANN.channel); ANN.channel = null; }
  ANN.initialized = false;
}