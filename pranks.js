// ============================================================
//  pranks.js — Pranks locaux + broadcast admin
// ============================================================

window.pranksState = {
  invertedControls: false,
  invertTimer: null,
  rotateTimer: null,
};

let pranksChannel = null;

function initPranksChannel() {
  if (pranksChannel) db.removeChannel(pranksChannel);
  pranksChannel = db
    .channel('pranks-broadcast', { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'prank' }, ({ payload }) => {
      executePrank(payload.type, payload.options || {});
    })
    .subscribe();
}

function dispatchPrank(type, options = {}, toAll = false) {
  if (toAll && AppState.isAdmin && AppState.adminMode) {
    pranksChannel.send({ type: 'broadcast', event: 'prank', payload: { type, options } });
    executePrank(type, options);
    showToast('😈 Prank envoyé à TOUS les connectés !', 3000);
  } else {
    executePrank(type, options);
  }
}

function executePrank(type, options = {}) {
  switch (type) {
    case 'rotate':  prankRotateExec(); break;
    case 'invert':  prankInvertExec(); break;
    case 'bsod':    prankBSODExec(options.message); break;
    case 'windows': prankWindowsExec(options.title, options.message); break;
  }
}

/* ── Prank 1 : rotation 180° ── */
function prankRotateExec() {
  if (window.pranksState.rotateTimer) return;
  document.body.classList.add('rotate-body');
  window.pranksState.rotateTimer = setTimeout(() => {
    document.body.classList.remove('rotate-body');
    window.pranksState.rotateTimer = null;
    showToast('✅ Remis à l\'endroit.', 2000);
  }, 10000);
}

/* ── Prank 2 : inversion commandes ── */
function prankInvertExec() {
  if (window.pranksState.invertedControls) return;
  window.pranksState.invertedControls = true;
  showToast('🔀 Contrôles inversés pendant 30s !', 30000);
  window.pranksState.invertTimer = setTimeout(() => {
    window.pranksState.invertedControls = false;
    window.pranksState.invertTimer = null;
    showToast('✅ Contrôles restaurés.', 2000);
  }, 30000);
}

/* ── Prank 3 : BSOD ── */
function prankBSODExec(customMsg) {
  const overlay = document.getElementById('bsodOverlay');
  const textEl = document.getElementById('bsodText');
  if (!overlay) return;
  if (textEl) textEl.textContent = customMsg || 'Erreur fatale système détectée. Sauvegarde en cours...';
  overlay.classList.remove('hidden');
  overlay.style.display = 'flex';
  // Animation barre de progression
  const bar = document.getElementById('bsodBar');
  if (bar) {
    bar.style.width = '0%';
    let pct = 0;
    const iv = setInterval(() => {
      pct += Math.random() * 8;
      bar.style.width = Math.min(pct, 100) + '%';
      if (pct >= 100) clearInterval(iv);
    }, 300);
  }
  // Trembler le body
  document.body.classList.add('shaking');
  setTimeout(() => document.body.classList.remove('shaking'), 1200);
}

function closeBSOD() {
  const overlay = document.getElementById('bsodOverlay');
  if (overlay) { overlay.classList.add('hidden'); overlay.style.display = ''; }
}

/* ── Prank 4 : fausse alerte Windows ── */
function prankWindowsExec(title, message) {
  const overlay = document.getElementById('winAlertOverlay');
  const titleEl = document.getElementById('winAlertTitle');
  const msgEl = document.getElementById('winAlertMsg');
  if (!overlay) return;
  if (titleEl) titleEl.textContent = title || '⚠️ Alerte système';
  if (msgEl) msgEl.textContent = message || '⚠️ CPE EN APPROCHE ! Rangez tout immédiatement.';
  overlay.classList.remove('hidden');
  overlay.style.display = 'flex';
}

function closeWinAlert() {
  const overlay = document.getElementById('winAlertOverlay');
  if (overlay) { overlay.classList.add('hidden'); overlay.style.display = ''; }
}

/* ── Handlers boutons UI ── */
function prankRotate(toAll = false) {
  dispatchPrank('rotate', {}, toAll);
}

function prankInvert(toAll = false) {
  dispatchPrank('invert', {}, toAll);
}

function prankBSOD(toAll = false) {
  const msg = (document.getElementById('bsodMessage') || {}).value || '';
  dispatchPrank('bsod', { message: msg || undefined }, toAll);
}

function prankWindows(toAll = false) {
  const title = (document.getElementById('winTitle') || {}).value || '';
  const message = (document.getElementById('winMessage') || {}).value || '';
  dispatchPrank('windows', {
    title: title || undefined,
    message: message || undefined
  }, toAll);
}

function cleanupPranks() {
  if (pranksChannel) { db.removeChannel(pranksChannel); pranksChannel = null; }
  if (window.pranksState.invertTimer) clearTimeout(window.pranksState.invertTimer);
  if (window.pranksState.rotateTimer) clearTimeout(window.pranksState.rotateTimer);
  window.pranksState.invertedControls = false;
  document.body.classList.remove('rotate-body', 'shaking');
}

// ================================================================
//  PRANKS ADMIN ONLY — broadcast forcé vers tous
// ================================================================

/* Garde les timers des pranks admin */
Object.assign(window.pranksState, {
  zoomTimer: null,
  cursorTimer: null,
  beepCtx: null,
  winUpdateTimer: null,
});

/* Helper : vérifie que c'est un admin en mode admin */
function requireAdmin(fn) {
  if (!AppState.isAdmin || !AppState.adminMode) {
    showToast('🔒 Accès refusé — active le mode admin d\'abord.', 3000);
    return;
  }
  fn();
}

/* Ajouter les nouveaux types dans executePrank */
const _origExecutePrank = executePrank;
// On réécrit executePrank pour gérer les nouveaux types
window.executePrank = function(type, options = {}) {
  switch (type) {
    case 'rotate':     prankRotateExec(); break;
    case 'invert':     prankInvertExec(); break;
    case 'bsod':       prankBSODExec(options.message); break;
    case 'windows':    prankWindowsExec(options.title, options.message); break;
    // Admin-only (reçus par broadcast)
    case 'winupdate':  prankWinUpdateExec(); break;
    case 'hidecursor': prankHideCursorExec(); break;
    case 'zoom':       prankZoomExec(); break;
    case 'rickroll':   prankRickrollExec(); break;
    case 'beep':       prankBeepExec(options.freq); break;
  }
};

/* ══════════════════════════════════════
   ADMIN A — Fake Windows Update
══════════════════════════════════════ */
function prankWinUpdateExec() {
  if (window.pranksState.winUpdateTimer) return;
  const overlay = document.getElementById('winUpdateOverlay');
  const bar = document.getElementById('winUpdateBar');
  const pctEl = document.getElementById('winUpdatePct');
  const stepEl = document.getElementById('winUpdateStep');
  if (!overlay) return;

  overlay.classList.remove('hidden');
  overlay.style.display = 'flex';

  const steps = [
    'Préparation de la mise à jour...',
    'Téléchargement des fichiers système...',
    'Installation des composants critiques...',
    'Application des correctifs de sécurité...',
    'Configuration du système...',
    'Finalisation... Ne pas redémarrer.',
  ];
  let pct = 0;
  let stepIdx = 0;

  const iv = setInterval(() => {
    pct += Math.random() * 4 + 1;
    if (pct > 100) pct = 100;
    if (bar) bar.style.width = pct + '%';
    if (pctEl) pctEl.textContent = Math.floor(pct) + '%';
    const si = Math.floor((pct / 100) * (steps.length - 1));
    if (si !== stepIdx && stepEl) { stepIdx = si; stepEl.textContent = steps[si]; }
    if (pct >= 100) clearInterval(iv);
  }, 500);

  window.pranksState.winUpdateTimer = setTimeout(() => {
    overlay.classList.add('hidden');
    overlay.style.display = '';
    if (bar) bar.style.width = '0%';
    window.pranksState.winUpdateTimer = null;
  }, 30000);
}

function prankWinUpdate() {
  requireAdmin(() => {
    pranksChannel.send({ type: 'broadcast', event: 'prank', payload: { type: 'winupdate', options: {} } });
    prankWinUpdateExec();
    showToast('💀 Fake update envoyée à TOUS !', 3000);
  });
}

/* ══════════════════════════════════════
   ADMIN B — Curseur invisible
══════════════════════════════════════ */
function prankHideCursorExec() {
  if (window.pranksState.cursorTimer) return;
  document.body.style.cursor = 'none';
  document.querySelectorAll('*').forEach(el => el.style.cursor = 'none');
  showToast('👁️ Curseur disparu pour 20s...', 20000);
  window.pranksState.cursorTimer = setTimeout(() => {
    document.body.style.cursor = '';
    document.querySelectorAll('*').forEach(el => el.style.cursor = '');
    window.pranksState.cursorTimer = null;
    showToast('✅ Curseur restauré.', 2000);
  }, 20000);
}

function prankHideCursor() {
  requireAdmin(() => {
    pranksChannel.send({ type: 'broadcast', event: 'prank', payload: { type: 'hidecursor', options: {} } });
    prankHideCursorExec();
    showToast('💀 Curseur invisible envoyé à TOUS !', 3000);
  });
}

/* ══════════════════════════════════════
   ADMIN C — Zoom pulsant
══════════════════════════════════════ */
function prankZoomExec() {
  if (window.pranksState.zoomTimer) return;

  // Injection d'une keyframe dynamique
  const styleId = 'prank-zoom-style';
  if (!document.getElementById(styleId)) {
    const s = document.createElement('style');
    s.id = styleId;
    s.textContent = `
      @keyframes prankZoomPulse {
        0%,100% { transform: scale(1); }
        25%      { transform: scale(1.08); }
        75%      { transform: scale(0.94); }
      }
      body.zoom-prank { animation: prankZoomPulse 0.7s ease-in-out infinite; transform-origin: center center; }
    `;
    document.head.appendChild(s);
  }

  document.body.classList.add('zoom-prank');
  window.pranksState.zoomTimer = setTimeout(() => {
    document.body.classList.remove('zoom-prank');
    window.pranksState.zoomTimer = null;
  }, 12000);
}

function prankZoom() {
  requireAdmin(() => {
    pranksChannel.send({ type: 'broadcast', event: 'prank', payload: { type: 'zoom', options: {} } });
    prankZoomExec();
    showToast('💀 Zoom psychédélique envoyé à TOUS !', 3000);
  });
}

/* ══════════════════════════════════════
   ADMIN D — Rickroll
══════════════════════════════════════ */
function prankRickrollExec() {
  const overlay = document.getElementById('rickrollOverlay');
  const frame = document.getElementById('rickrollFrame');
  if (!overlay || !frame) return;
  // autoplay via param YouTube embed
  frame.src = 'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&controls=0&modestbranding=1';
  overlay.classList.remove('hidden');
  overlay.style.display = 'flex';
}

function closeRickroll() {
  const overlay = document.getElementById('rickrollOverlay');
  const frame = document.getElementById('rickrollFrame');
  if (overlay) { overlay.classList.add('hidden'); overlay.style.display = ''; }
  if (frame) frame.src = ''; // couper l'audio
}

function prankRickroll() {
  requireAdmin(() => {
    pranksChannel.send({ type: 'broadcast', event: 'prank', payload: { type: 'rickroll', options: {} } });
    prankRickrollExec();
    showToast('💀 Rickroll envoyé à TOUS ! 🎵', 3000);
  });
}

/* ══════════════════════════════════════
   ADMIN E — Bip infernal (Web Audio)
══════════════════════════════════════ */
function prankBeepExec(freq) {
  const hz = parseFloat(freq) || 880;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    let t = ctx.currentTime;
    const totalDuration = 10; // secondes
    const pattern = [0.12, 0.08]; // [ON, OFF] en secondes

    for (let i = 0; t < ctx.currentTime + totalDuration; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'square';
      osc.frequency.setValueAtTime(hz, t);
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.setValueAtTime(0, t + pattern[0]);
      osc.start(t);
      osc.stop(t + pattern[0]);
      t += pattern[0] + pattern[1];
    }

    // Fermer le contexte après 11s
    setTimeout(() => ctx.close(), 11000);
  } catch (e) {
    showToast('❌ Web Audio non supporté sur ce navigateur.', 3000);
  }
}

function prankBeep() {
  requireAdmin(() => {
    const freqInput = document.getElementById('bipFreq');
    const freq = freqInput ? freqInput.value : 880;
    pranksChannel.send({ type: 'broadcast', event: 'prank', payload: { type: 'beep', options: { freq } } });
    prankBeepExec(freq);
    showToast('💀 Bip infernal envoyé à TOUS ! 🔊', 3000);
  });
}

/* ── Listener fréquence bip ── */
document.addEventListener('DOMContentLoaded', () => {
  const bipFreq = document.getElementById('bipFreq');
  const bipFreqVal = document.getElementById('bipFreqVal');
  if (bipFreq) bipFreq.addEventListener('input', (e) => {
    if (bipFreqVal) bipFreqVal.textContent = e.target.value + 'Hz';
  });
});

// ================================================================
//  PRANK F — VIRUS POPUP STORM
// ================================================================

const VIRUS = {
  active: false,
  popups: [],
  spawnTimer: null,
  killTimer: null,
  zBase: 100000,
  count: 0,
};

const VIRUS_MESSAGES = [
  { title: '⚠️ VIRUS DÉTECTÉ', msg: 'Votre ordinateur est infecté par 1,337 virus !\nCLIQUEZ OK POUR NETTOYER IMMÉDIATEMENT.' },
  { title: '🔴 ALERTE SÉCURITÉ', msg: 'Accès non autorisé détecté.\nVos fichiers sont en cours de chiffrement !' },
  { title: '💣 ERREUR CRITIQUE', msg: 'CRITICAL_PROCESS_DIED\nVeuillez contacter le support au 0-800-VIRUS.' },
  { title: '🦠 MALWARE FOUND', msg: 'TrojanDropper.Win32.Agent detected!\nRemove immediately or lose all data.' },
  { title: '🔥 VOTRE PC BRÛLE', msg: 'Température CPU : 847°C\nÉteignez votre ordinateur maintenant !!!' },
  { title: '👁️ SURVEILLANCE', msg: 'Votre webcam est activée.\nQuelqu\'un vous regarde en ce moment.' },
  { title: '💾 DISQUE EFFACÉ', msg: 'Suppression de C:\\ en cours...\n████████░░ 87% — NE PAS ÉTEINDRE' },
  { title: '🚨 POLICE NATIONALE', msg: 'Activité illégale détectée.\nVotre IP a été transmise aux autorités.' },
  { title: '📡 HACK EN COURS', msg: 'Connexion distante établie.\nMot de passe en cours d\'extraction...' },
  { title: '☢️ RADIATION DÉTECTÉE', msg: 'Émissions radioactives anormales.\nEvacuez la pièce immédiatement.' },
];

function prankVirusExec(intensity) {
  if (VIRUS.active) return;
  VIRUS.active = true;
  VIRUS.count = 0;

  const lvl = parseInt(intensity) || 3;
  // intervalle entre spawns (ms) et max fenêtres selon intensité
  const config = [
    null,
    { interval: 1800, max: 8  },   // 1
    { interval: 1200, max: 15 },   // 2
    { interval: 800,  max: 25 },   // 3
    { interval: 450,  max: 40 },   // 4
    { interval: 200,  max: 80 },   // 5
  ][lvl];

  function spawnOne() {
    if (!VIRUS.active) return;
    if (VIRUS.count >= config.max) return;
    createVirusPopup();
    VIRUS.spawnTimer = setTimeout(spawnOne, config.interval + Math.random() * 300);
  }
  spawnOne();

  // Durée totale 20s
  VIRUS.killTimer = setTimeout(stopVirus, 20000);
}

function createVirusPopup() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pw = 340, ph = 140;
  const x = Math.max(0, Math.random() * (vw - pw));
  const y = Math.max(0, Math.random() * (vh - ph));

  const data = VIRUS_MESSAGES[Math.floor(Math.random() * VIRUS_MESSAGES.length)];
  VIRUS.count++;
  VIRUS.zBase++;

  const win = document.createElement('div');
  win.className = 'virus-window';
  win.style.cssText = `
    position: fixed;
    left: ${x}px; top: ${y}px;
    width: ${pw}px;
    z-index: ${VIRUS.zBase};
    font-family: 'Tahoma', 'Arial', sans-serif;
    box-shadow: 3px 3px 0 #000;
    user-select: none;
  `;
  win.innerHTML = `
    <div class="virus-titlebar" style="
      background: linear-gradient(90deg, #0a246a, #3a6ea5);
      color: white; padding: 3px 6px;
      display: flex; align-items: center; justify-content: space-between;
      font-size: 12px; font-weight: bold; cursor: move;
    ">
      <span>🛡️ ${data.title}</span>
      <button class="virus-close-x" style="
        background: linear-gradient(#d4453c, #a02020);
        color: white; border: 1px solid #600;
        width: 18px; height: 18px; font-size: 10px;
        cursor: pointer; border-radius: 2px; font-weight: bold;
        display: flex; align-items: center; justify-content: center;
      ">✕</button>
    </div>
    <div style="
      background: #ece9d8; padding: 12px 14px;
      display: flex; gap: 10px; align-items: flex-start;
      border: 1px solid #888; border-top: none;
    ">
      <span style="font-size: 30px; flex-shrink:0; line-height:1;">⛔</span>
      <div>
        <p style="font-size: 12px; color: #000; white-space: pre-line; margin-bottom: 10px;">${data.msg}</p>
        <div style="display:flex; gap:6px; justify-content:flex-end;">
          <button class="virus-ok-btn" style="
            background: linear-gradient(#f0f0e8, #d4d0c8);
            border: 1px solid #888; padding: 2px 20px;
            font-size: 12px; cursor: pointer; font-family: Tahoma, Arial;
          ">OK</button>
          <button class="virus-ok-btn" style="
            background: linear-gradient(#f0f0e8, #d4d0c8);
            border: 1px solid #888; padding: 2px 14px;
            font-size: 12px; cursor: pointer; font-family: Tahoma, Arial;
          ">Annuler</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(win);
  VIRUS.popups.push(win);

  // Draggable
  makeDraggable(win, win.querySelector('.virus-titlebar'));

  // Fermer = spawn 2 nouvelles + se détruire
  win.querySelectorAll('.virus-close-x, .virus-ok-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (VIRUS.active && VIRUS.count < 80) {
        createVirusPopup();
        createVirusPopup();
      }
      win.remove();
      VIRUS.popups = VIRUS.popups.filter(p => p !== win);
    });
  });
}

function makeDraggable(el, handle) {
  let ox = 0, oy = 0, mx = 0, my = 0;
  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    mx = e.clientX; my = e.clientY;
    VIRUS.zBase++;
    el.style.zIndex = VIRUS.zBase;
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);
  });
  function onDrag(e) {
    ox = mx - e.clientX; oy = my - e.clientY;
    mx = e.clientX; my = e.clientY;
    el.style.top  = (el.offsetTop  - oy) + 'px';
    el.style.left = (el.offsetLeft - ox) + 'px';
  }
  function stopDrag() {
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', stopDrag);
  }
}

function stopVirus() {
  VIRUS.active = false;
  if (VIRUS.spawnTimer) clearTimeout(VIRUS.spawnTimer);
  if (VIRUS.killTimer)  clearTimeout(VIRUS.killTimer);
  VIRUS.popups.forEach(p => p.remove());
  VIRUS.popups = [];
  VIRUS.count = 0;
}

function prankVirus() {
  requireAdmin(() => {
    const lvl = (document.getElementById('virusIntensity') || {}).value || 3;
    pranksChannel.send({ type: 'broadcast', event: 'prank', payload: { type: 'virus', options: { intensity: lvl } } });
    prankVirusExec(lvl);
    showToast('🦠 VIRUS lancé sur TOUS ! Intensité ' + lvl, 3000);
  });
}

// Ajouter le case 'virus' dans executePrank
const _execPrev = window.executePrank;
window.executePrank = function(type, options = {}) {
  if (type === 'virus') { prankVirusExec(options.intensity); return; }
  if (type === 'killsnake') { forceSnakeGameOver(); return; }
  _execPrev(type, options);
};

// Listener intensité virus
document.addEventListener('DOMContentLoaded', () => {
  const virusSlider = document.getElementById('virusIntensity');
  const virusVal = document.getElementById('virusIntensityVal');
  if (virusSlider) virusSlider.addEventListener('input', (e) => {
    if (virusVal) virusVal.textContent = e.target.value;
  });
});

// ================================================================
//  PRANK G — KILL ALL SNAKE
// ================================================================

function killAllSnake() {
  requireAdmin(() => {
    pranksChannel.send({ type: 'broadcast', event: 'prank', payload: { type: 'killsnake', options: {} } });
    forceSnakeGameOver();
    showToast('☠️ Game Over envoyé à TOUS !', 3000);
  });
}

function forceSnakeGameOver() {
  // snake.js expose snake.running et endGame()
  if (typeof snake !== 'undefined' && snake.running) {
    if (typeof endGame === 'function') endGame(true); // true = killed by admin, skip score popup
  }
}