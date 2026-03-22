// ============================================================
//  roulette.js — Roulette russe avec Supabase Presence
// ============================================================

const RLT = {
  channel: null,
  initialized: false,
  gages: [],
  currentGage: null,
  // Présence gérée par Supabase — liste des pseudos en ligne
  onlineUsers: [],
};

const DEFAULT_GAGES = [
  "Faire 10 pompes en direct",
  "Chanter la Marseillaise à voix haute",
  "Envoyer un message gênant dans le chat",
  "Faire une imitation de quelqu'un dans le groupe",
  "Décrire son crush sans le nommer",
  "Poster sa pire photo de profil",
  "Faire la voix de Mickey pendant 1 minute",
  "Raconter son pire souvenir scolaire",
  "Faire 30 secondes de danse sans musique",
  "Dire un vrai compliment à chaque personne connectée",
  "Jouer la prochaine partie de Snake les yeux fermés",
  "Utiliser uniquement des mots de 5 lettres pendant 2 minutes",
];

function initRoulette() {
  if (RLT.initialized) return;
  RLT.initialized = true;

  const saved = localStorage.getItem('ph-roulette-gages');
  RLT.gages = saved ? JSON.parse(saved) : [...DEFAULT_GAGES];
  renderGageList();
  startRouletteChannel();
}

/* ─── Canal avec Presence API ─── */
function startRouletteChannel() {
  if (RLT.channel) db.removeChannel(RLT.channel);

  RLT.channel = db.channel('roulette-room', {
    config: {
      presence: { key: AppState.username },
      broadcast: { self: false },
    }
  });

  // Résultat de la roulette broadcasté à tous
  RLT.channel.on('broadcast', { event: 'roulette-result' }, ({ payload }) => {
    displayRouletteResult(payload);
  });

  // Presence : quelqu'un arrive ou part
  RLT.channel.on('presence', { event: 'sync' }, () => {
    const state = RLT.channel.presenceState();
    // state = { "username1": [{...}], "username2": [{...}] }
    RLT.onlineUsers = Object.keys(state);
    updateRouletteOnlineCount();
  });

  RLT.channel.on('presence', { event: 'join' }, ({ newPresences }) => {
    newPresences.forEach(p => {
      if (!RLT.onlineUsers.includes(p.username)) {
        RLT.onlineUsers.push(p.username);
      }
    });
    updateRouletteOnlineCount();
  });

  RLT.channel.on('presence', { event: 'leave' }, ({ leftPresences }) => {
    leftPresences.forEach(p => {
      RLT.onlineUsers = RLT.onlineUsers.filter(u => u !== p.username);
    });
    updateRouletteOnlineCount();
  });

  // S'abonner puis tracker notre présence
  RLT.channel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await RLT.channel.track({ username: AppState.username, online_at: new Date().toISOString() });
    }
  });
}

function updateRouletteOnlineCount() {
  const count = RLT.onlineUsers.length;
  const el = document.getElementById('rouletteOnline');
  if (el) el.textContent = `${count} joueur${count > 1 ? 's' : ''} connecté${count > 1 ? 's' : ''}`;
}

/* ─── Lancer la roulette ─── */
function spinRoulette(withPrank = false) {
  const btn = document.getElementById('rouletteSpinBtn');
  if (btn && btn.disabled) return;

  const players = RLT.onlineUsers.length > 0 ? RLT.onlineUsers : [AppState.username];
  const chosen  = players[Math.floor(Math.random() * players.length)];
  const gage    = RLT.gages[Math.floor(Math.random() * RLT.gages.length)];

  animateWheel(chosen, players, () => {
    const payload = { chosen, gage, withPrank, spinner: AppState.username, ts: Date.now() };
    // Broadcaster à tous (self:false donc on appelle aussi localement)
    RLT.channel?.send({ type: 'broadcast', event: 'roulette-result', payload });
    displayRouletteResult(payload);
  });
}

function spinRouletteWithPrank() { spinRoulette(true); }

/* ─── Animation de la roue ─── */
function animateWheel(finalName, players, onDone) {
  const wheel  = document.getElementById('rouletteWheel');
  const textEl = document.getElementById('rouletteWheelText');
  const btn    = document.getElementById('rouletteSpinBtn');

  if (btn) btn.disabled = true;
  if (wheel) wheel.classList.add('spinning');

  let ticks = 0;
  const totalTicks = 22 + Math.floor(Math.random() * 10);
  let delay = 55;

  function tick() {
    const shown = players[Math.floor(Math.random() * players.length)];
    if (textEl) textEl.textContent = shown.length > 10 ? shown.slice(0, 9) + '…' : shown;
    ticks++;
    if (ticks >= totalTicks) {
      if (textEl) textEl.textContent = finalName.length > 10 ? finalName.slice(0, 9) + '…' : finalName;
      if (wheel) wheel.classList.remove('spinning');
      if (btn) btn.disabled = false;
      onDone();
    } else {
      delay = Math.min(delay + 14, 340);
      setTimeout(tick, delay);
    }
  }
  tick();
}

/* ─── Afficher le résultat ─── */
function displayRouletteResult({ chosen, gage, withPrank, spinner }) {
  const resultEl = document.getElementById('rouletteResult');
  const gageBox  = document.getElementById('rouletteGageBox');
  const gageText = document.getElementById('rouletteGageText');
  const isMe     = chosen === AppState.username;

  if (resultEl) {
    const color = isMe ? '#ff2d78' : '#00d4ff';
    resultEl.innerHTML = `
      <div class="text-center">
        <div style="font-size:40px; margin-bottom:8px;">${isMe ? '😱' : '😈'}</div>
        <p style="font-family:'Orbitron',monospace; font-size:14px; font-weight:700; color:${color}; margin-bottom:4px;">
          ${escapeHtml(chosen)}
        </p>
        <p style="font-family:monospace; font-size:11px; color:#4a5580;">
          ${isMe ? '💀 C\'est TOI la victime !' : 'est désigné(e) !'}
          ${spinner !== chosen ? `<span style="color:#3a4060"> (lancé par ${escapeHtml(spinner)})</span>` : ''}
        </p>
      </div>`;
  }

  if (gageBox && gageText) {
    gageText.textContent = gage;
    gageBox.classList.remove('hidden');
  }

  // Prank auto si victime = moi
  if (withPrank && isMe) {
    const types = ['rotate', 'invert'];
    setTimeout(() => executePrank(types[Math.floor(Math.random() * types.length)], {}), 800);
  }

  showToast(`🎰 ${chosen} est désigné(e) !`, 4000);
}

/* ─── Gestion des gages (admin) ─── */
function renderGageList() {
  const list = document.getElementById('rouletteGageList');
  if (!list) return;
  list.innerHTML = RLT.gages.map((g, i) => `
    <div style="display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.04);">
      <span style="font-family:monospace; font-size:11px; color:#6070a0; flex:1;">${escapeHtml(g)}</span>
      <button onclick="removeRouletteGage(${i})" style="background:none; border:none; color:#ff2d78; cursor:pointer; font-size:14px; padding:0 4px;">✕</button>
    </div>`).join('');
}

function addRouletteGage() {
  const input = document.getElementById('rouletteNewGage');
  if (!input) return;
  const val = input.value.trim();
  if (!val) return;
  RLT.gages.push(val);
  localStorage.setItem('ph-roulette-gages', JSON.stringify(RLT.gages));
  input.value = '';
  renderGageList();
  showToast('✅ Gage ajouté !', 1500);
}

function removeRouletteGage(index) {
  RLT.gages.splice(index, 1);
  localStorage.setItem('ph-roulette-gages', JSON.stringify(RLT.gages));
  renderGageList();
}

function cleanupRoulette() {
  if (RLT.channel) {
    RLT.channel.untrack();
    db.removeChannel(RLT.channel);
    RLT.channel = null;
  }
  RLT.initialized = false;
  RLT.onlineUsers = [];
}