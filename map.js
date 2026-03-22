// ============================================================
//  map.js — GéoDéfi : Leaflet + OSM + roue d'indices
// ============================================================

const GEO = {
  map:         null,
  channel:     null,
  initialized: false,

  // Markers
  adminPin:    null,
  myGuessPin:  null,
  playerPins:  {},
  lineLayers:  [],

  // État
  state:       'idle',   // 'idle' | 'playing' | 'revealed'
  secretLat:   null,
  secretLng:   null,
  secretCity:  null,     // récupéré via Nominatim au moment du pin
  secretCountry: null,
  adminDraftLat: null,
  adminDraftLng: null,
  adminDraftCity: null,
  adminDraftCountry: null,

  guesses:     {},
  timerInterval: null,
  timeLeft:    0,
  myGuessConfirmed: false,
  myHintType:  null,     // 'city' | 'country' | 'both' | 'none' — déterminé par la roue
  hintSpun:    false,    // a-t-on déjà tourné la roue ?
};

// Probabilités de la roue
const HINT_OUTCOMES = [
  { type: 'city',    label: '🏙️ Ville',          prob: 0.375 },
  { type: 'country', label: '🌍 Pays',           prob: 0.375 },
  { type: 'both',    label: '🏙️+🌍 Ville & Pays', prob: 0.15  },
  { type: 'none',    label: '❌ Aucun indice',    prob: 0.10  },
];

// Couleurs joueurs
const PIN_COLORS = ['#00d4ff','#00ff88','#bf5af2','#ffd60a','#ff6b35','#ff2d78','#06d6a0'];
function pinColor(u) {
  let h = 0;
  for (let i = 0; i < u.length; i++) h = u.charCodeAt(i) + ((h << 5) - h);
  return PIN_COLORS[Math.abs(h) % PIN_COLORS.length];
}

// ─── Init ───────────────────────────────────────────────────────
function initGeoDefi() {
  if (GEO.initialized) { GEO.map?.invalidateSize(); return; }
  GEO.initialized = true;

  GEO.map = L.map('geoMap', { zoomControl: true }).setView([46.5, 2.5], 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 18,
  }).addTo(GEO.map);

  GEO.map.on('click', onMapClick);
  startGeoChannel();
}

// ─── Canal Supabase ─────────────────────────────────────────────
function startGeoChannel() {
  if (GEO.channel) db.removeChannel(GEO.channel);

  GEO.channel = db.channel('geo-defi', {
    config: { broadcast: { self: false }, presence: { key: AppState.username } }
  });

  GEO.channel.on('presence', { event: 'sync' }, () => {
    const count = Object.keys(GEO.channel.presenceState()).length;
    const el = document.getElementById('geoOnline');
    if (el) el.textContent = `${count} joueur${count > 1 ? 's' : ''} connecté${count > 1 ? 's' : ''}`;
  });

  GEO.channel.on('broadcast', { event: 'geo-start'  }, ({ payload }) => receiveGeoStart(payload));
  GEO.channel.on('broadcast', { event: 'geo-guess'  }, ({ payload }) => receiveGeoGuess(payload));
  GEO.channel.on('broadcast', { event: 'geo-reveal' }, ({ payload }) => receiveGeoReveal(payload));
  GEO.channel.on('broadcast', { event: 'geo-reset'  }, () => resetGeoState());

  GEO.channel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await GEO.channel.track({ username: AppState.username });
      loadGeoState();
    }
  });
}

// ─── Charger l'état courant (retardataires) ─────────────────────
async function loadGeoState() {
  const { data } = await db.from('geo_challenge').select('*').eq('id', 1).single();
  if (!data || data.state === 'idle') return;

  const base = {
    lat: data.secret_lat, lng: data.secret_lng,
    city: data.secret_city, country: data.secret_country,
    duration: data.duration, started_at: data.started_at,
    guesses: data.guesses || {}
  };

  if (data.state === 'playing') {
    receiveGeoStart(base);
  } else if (data.state === 'revealed') {
    receiveGeoStart(base);
    receiveGeoReveal({ ...base, placeName: data.place_name });
  }
}

// ─── Clic sur la carte ──────────────────────────────────────────
function onMapClick(e) {
  const { lat, lng } = e.latlng;

  // Admin en mode idle : choisir le lieu secret
  if (AppState.isAdmin && AppState.adminMode && GEO.state === 'idle') {
    adminPickLocation(lat, lng);
    return;
  }

  // Joueur en partie : placer son guess
  if (GEO.state === 'playing' && !GEO.myGuessConfirmed) {
    if (!GEO.hintSpun) {
      showToast('🎡 Tourne ta roue d\'abord pour obtenir ton indice !', 2500);
      return;
    }
    if (GEO.myGuessPin) GEO.map.removeLayer(GEO.myGuessPin);
    const color = pinColor(AppState.username);
    GEO.myGuessPin = L.marker([lat, lng], { icon: makeIcon('📍', color) })
      .addTo(GEO.map)
      .bindPopup(`<b>${escapeHtml(AppState.username)}</b><br>Clique "Confirmer" pour valider !`);
    document.getElementById('geoGuessBtn')?.classList.remove('hidden');
  }
}

// ─── Admin : choisir le lieu (avec géocodage immédiat) ──────────
async function adminPickLocation(lat, lng) {
  GEO.adminDraftLat = lat;
  GEO.adminDraftLng = lng;
  GEO.adminDraftCity = null;
  GEO.adminDraftCountry = null;

  const statusEl = document.getElementById('geoAdminPinStatus');
  if (statusEl) statusEl.innerHTML = `<span style="color:#ffd60a">⏳ Recherche du lieu...</span>`;

  if (GEO.adminPin) GEO.map.removeLayer(GEO.adminPin);
  GEO.adminPin = L.marker([lat, lng], { icon: makeIcon('👑', '#ff2d78') })
    .addTo(GEO.map)
    .bindPopup(`<b>📍 Lieu secret</b><br>Recherche en cours...`)
    .openPopup();

  // Appel Nominatim immédiat
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=fr`,
      { headers: { 'User-Agent': 'NSIHub-GeoDefi/1.0' } }
    );
    const data = await res.json();
    const a = data.address || {};
    GEO.adminDraftCity    = a.city || a.town || a.village || a.municipality || a.county || null;
    GEO.adminDraftCountry = a.country || null;

    const hint = [GEO.adminDraftCity, GEO.adminDraftCountry].filter(Boolean).join(', ') || 'Lieu inconnu';
    GEO.adminPin.setPopupContent(`<b>📍 Lieu secret</b><br><span style="color:#ffd60a">${escapeHtml(hint)}</span>`);
    if (statusEl) statusEl.innerHTML = `<span style="color:#00ff88">✅ ${escapeHtml(hint)}</span>`;
  } catch (e) {
    if (statusEl) statusEl.innerHTML = `<span style="color:#00ff88">✅ Lieu sélectionné (pas d'infos)</span>`;
  }

  const launchBtn = document.getElementById('geoLaunchBtn');
  if (launchBtn) launchBtn.disabled = false;
}

// ─── Admin : lancer le défi ─────────────────────────────────────
async function launchGeoChallenge() {
  if (!AppState.isAdmin || GEO.adminDraftLat === null) return;

  const duration = parseInt(document.getElementById('geoTimer')?.value || 60);
  const payload = {
    lat: GEO.adminDraftLat, lng: GEO.adminDraftLng,
    city: GEO.adminDraftCity, country: GEO.adminDraftCountry,
    duration, started_at: Date.now(), guesses: {},
  };

  await db.from('geo_challenge').upsert({
    id: 1, state: 'playing',
    secret_lat: payload.lat, secret_lng: payload.lng,
    secret_city: payload.city, secret_country: payload.country,
    duration: payload.duration,
    started_at: new Date(payload.started_at).toISOString(),
    guesses: {},
  });

  GEO.channel.send({ type: 'broadcast', event: 'geo-start', payload });
  receiveGeoStart(payload);
}

// ─── Recevoir le démarrage ───────────────────────────────────────
function receiveGeoStart(payload) {
  GEO.state         = 'playing';
  GEO.secretLat     = payload.lat;
  GEO.secretLng     = payload.lng;
  GEO.secretCity    = payload.city    || null;
  GEO.secretCountry = payload.country || null;
  GEO.guesses       = payload.guesses || {};
  GEO.myGuessConfirmed = false;
  GEO.hintSpun      = false;
  GEO.myHintType    = null;

  clearGeoMap();

  setGeoStatus('🟢', 'Partie en cours ! Tourne ta roue pour obtenir ton indice.', true);
  document.getElementById('geoInstruction')?.classList.add('hidden');
  document.getElementById('geoGuessBtn')?.classList.add('hidden');
  document.getElementById('geoResults')?.classList.add('hidden');

  // Afficher la roue d'indices
  renderHintWheel();
  document.getElementById('geoHintSection')?.classList.remove('hidden');
  document.getElementById('geoHintResult')?.classList.add('hidden');

  // Guesses déjà reçus (retardataires)
  Object.entries(GEO.guesses).forEach(([u, g]) => {
    if (u !== AppState.username) renderPlayerGuessPin(u, g.lat, g.lng);
  });

  if (GEO.guesses[AppState.username]) {
    GEO.myGuessConfirmed = true;
    GEO.hintSpun = true;
    showAlreadyGuessed();
  }

  const elapsed = payload.started_at ? Math.floor((Date.now() - payload.started_at) / 1000) : 0;
  GEO.timeLeft = Math.max(0, payload.duration - elapsed);
  startGeoTimer();

  document.getElementById('geoRevealBtn') && (document.getElementById('geoRevealBtn').disabled = !AppState.isAdmin);
  document.getElementById('geoLaunchBtn') && (document.getElementById('geoLaunchBtn').disabled = true);
}

// ─── ROUE D'INDICES ─────────────────────────────────────────────
function renderHintWheel() {
  const section = document.getElementById('geoHintSection');
  if (!section) return;

  section.innerHTML = `
    <div class="card mb-4" style="border-color:rgba(191,90,242,0.3); background:rgba(191,90,242,0.03);">
      <div class="flex items-center gap-3 mb-3">
        <span class="text-xl">🎡</span>
        <h3 class="font-orbitron font-bold text-sm neon-text-purple">TOURNE TA ROUE D'INDICE</h3>
      </div>
      <p class="font-mono text-xs text-[#4a5580] mb-4">Lance la roue pour savoir quel indice tu obtiens sur le lieu secret !</p>

      <!-- Roue SVG animée -->
      <div class="flex flex-col items-center gap-4">
        <div style="position:relative; width:180px; height:180px;">
          <!-- Flèche indicateur -->
          <div style="position:absolute; top:-14px; left:50%; transform:translateX(-50%); font-size:24px; z-index:10; filter:drop-shadow(0 0 6px #bf5af2);">▼</div>
          <canvas id="geoWheelCanvas" width="180" height="180" style="border-radius:50%; cursor:pointer;"></canvas>
        </div>
        <button onclick="spinHintWheel()" id="geoSpinBtn"
          class="btn-neon btn-neon-purple px-8 py-3 font-pixel text-[10px] tracking-widest">
          🎡 TOURNER
        </button>
      </div>
    </div>`;

  drawWheel(0, -1);
}

// Les 8 cases de la roue (distribution = les probabilités souhaitées)
// city×3 = 37.5%, country×3 = 37.5%, both×1 = 12.5%, none×1 = 12.5%
const WHEEL_SLICES = [
  { type: 'city',    label: '🏙️ Ville',      color: '#00d4ff', textColor: '#000' },
  { type: 'country', label: '🌍 Pays',        color: '#00ff88', textColor: '#000' },
  { type: 'city',    label: '🏙️ Ville',      color: '#00d4ff', textColor: '#000' },
  { type: 'both',    label: '🏙️+🌍 Les deux', color: '#bf5af2', textColor: '#fff' },
  { type: 'country', label: '🌍 Pays',        color: '#00ff88', textColor: '#000' },
  { type: 'city',    label: '🏙️ Ville',      color: '#00d4ff', textColor: '#000' },
  { type: 'none',    label: '❌ Rien',        color: '#3a4060', textColor: '#888' },
  { type: 'country', label: '🌍 Pays',        color: '#00ff88', textColor: '#000' },
];

function drawWheel(rotationAngle, highlightIndex) {
  const canvas = document.getElementById('geoWheelCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const cx = 90, cy = 90, r = 88;
  const sliceAngle = (2 * Math.PI) / WHEEL_SLICES.length;

  ctx.clearRect(0, 0, 180, 180);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotationAngle);
  ctx.translate(-cx, -cy);

  WHEEL_SLICES.forEach((s, i) => {
    const start = i * sliceAngle - Math.PI / 2;
    const end   = start + sliceAngle;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, end);
    ctx.closePath();
    ctx.fillStyle = (highlightIndex === i) ? '#ffd60a' : s.color;
    ctx.fill();
    ctx.strokeStyle = '#05050f';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Label
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(start + sliceAngle / 2);
    ctx.textAlign = 'right';
    ctx.fillStyle = (highlightIndex === i) ? '#000' : s.textColor;
    ctx.font = `bold 9px "Share Tech Mono"`;
    ctx.fillText(s.label, r - 6, 4);
    ctx.restore();
  });

  ctx.restore();

  // Centre décoratif
  ctx.beginPath();
  ctx.arc(cx, cy, 14, 0, 2 * Math.PI);
  ctx.fillStyle = '#05050f';
  ctx.fill();
  ctx.strokeStyle = 'rgba(191,90,242,0.6)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function spinHintWheel() {
  if (GEO.hintSpun) return;
  const btn = document.getElementById('geoSpinBtn');
  if (btn) btn.disabled = true;

  // 1. Tirer une case au hasard (distribution directe des 8 cases)
  const winIndex = Math.floor(Math.random() * WHEEL_SLICES.length);
  const result   = HINT_OUTCOMES.find(o => o.type === WHEEL_SLICES[winIndex].type) || HINT_OUTCOMES[0];

  // 2. Calculer l'angle final pour que la flèche (haut) pointe sur le centre de la case gagnante
  //    La case i a son centre à l'angle : (i + 0.5) * sliceAngle - π/2 (dans le repère de la roue)
  //    Pour que ce point soit en haut (angle 0 de l'écran), la roue doit avoir tourné de :
  //    R = π/2 - (i + 0.5) * sliceAngle  +  k * 2π  (avec k pour rester positif)
  // La flèche est en HAUT (angle -π/2 dans le repère canvas).
  // Le centre de la case i est à : (i + 0.5) * sliceAngle - π/2 + rotation
  // On veut que ce centre soit en haut, donc égal à -π/2 (mod 2π)
  // → rotation = -(i + 0.5) * sliceAngle  (mod 2π)
  const sliceAngle = (2 * Math.PI) / WHEEL_SLICES.length;
  let targetAngle  = -((winIndex + 0.5) * sliceAngle);
  // Normaliser en positif
  targetAngle = ((targetAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  // Ajouter N tours complets pour l'animation (5 à 8 tours)
  const extraTurns = 5 + Math.floor(Math.random() * 4);
  const totalAngle = extraTurns * 2 * Math.PI + targetAngle;

  // 3. Animer
  const canvas = document.getElementById('geoWheelCanvas');
  if (!canvas) { GEO.hintSpun = true; GEO.myHintType = result.type; applyHintResult(result); return; }

  const duration = 3800;
  const start    = performance.now();

  function animate(now) {
    const t      = Math.min((now - start) / duration, 1);
    const eased  = 1 - Math.pow(1 - t, 5); // easing out quintic
    const angle  = eased * totalAngle;

    drawWheel(angle, -1);

    if (t < 1) {
      requestAnimationFrame(animate);
    } else {
      // Fin : dessiner avec la case gagnante surlignée en or
      drawWheel(totalAngle, winIndex);
      GEO.hintSpun   = true;
      GEO.myHintType = result.type;
      setTimeout(() => applyHintResult(result), 400);
    }
  }
  requestAnimationFrame(animate);
}

function applyHintResult(result) {
  const section = document.getElementById('geoHintSection');
  if (!section) return;

  // Supprimer l'ancien résultat s'il existe
  const old = document.getElementById('geoHintResult');
  if (old) old.remove();

  // Construire le HTML selon le type — strictement 1 seule info par cas
  let hintHTML = '';
  let borderColor = 'rgba(0,212,255,0.3)';
  let toastMsg = '';

  if (result.type === 'none') {
    hintHTML = `
      <span style="font-size:22px;">❌</span>
      <div class="ml-3">
        <div class="font-mono text-[10px] text-[#4a5580] mb-1">TON INDICE</div>
        <div class="font-orbitron font-bold text-base text-[#ff2d78]">Aucun indice !</div>
        <div class="font-mono text-xs text-[#4a5580] mt-1">Bonne chance quand même...</div>
      </div>`;
    borderColor = 'rgba(255,45,120,0.3)';
    toastMsg = '❌ Pas de chance, aucun indice !';

  } else if (result.type === 'city') {
    // UNIQUEMENT la ville — pas le pays
    const city = GEO.secretCity || '???';
    hintHTML = `
      <span style="font-size:22px;">🏙️</span>
      <div class="ml-3">
        <div class="font-mono text-[10px] text-[#4a5580] mb-1">TON INDICE — VILLE</div>
        <div class="font-orbitron font-bold text-xl neon-text-cyan">${escapeHtml(city)}</div>
      </div>`;
    borderColor = 'rgba(0,212,255,0.4)';
    toastMsg = `🏙️ Indice ville : ${city}`;

  } else if (result.type === 'country') {
    // UNIQUEMENT le pays — pas la ville
    const country = GEO.secretCountry || '???';
    hintHTML = `
      <span style="font-size:22px;">🌍</span>
      <div class="ml-3">
        <div class="font-mono text-[10px] text-[#4a5580] mb-1">TON INDICE — PAYS</div>
        <div class="font-orbitron font-bold text-xl neon-text-green">${escapeHtml(country)}</div>
      </div>`;
    borderColor = 'rgba(0,255,136,0.4)';
    toastMsg = `🌍 Indice pays : ${country}`;

  } else if (result.type === 'both') {
    // Ville ET pays
    const city    = GEO.secretCity    || '???';
    const country = GEO.secretCountry || '???';
    hintHTML = `
      <span style="font-size:22px;">🎉</span>
      <div class="ml-3">
        <div class="font-mono text-[10px] text-[#4a5580] mb-1">TON INDICE — VILLE & PAYS</div>
        <div class="font-orbitron font-bold text-xl" style="color:#ffd60a;">${escapeHtml(city)}</div>
        <div class="font-orbitron font-bold text-sm neon-text-green mt-1">${escapeHtml(country)}</div>
      </div>`;
    borderColor = 'rgba(255,214,10,0.5)';
    toastMsg = `🎉 Jackpot ! ${city} — ${country}`;
  }

  // Créer et injecter le div résultat
  const div = document.createElement('div');
  div.id = 'geoHintResult';
  div.className = 'card flex items-center mt-3 py-4 px-4';
  div.style.borderColor = borderColor;
  div.innerHTML = hintHTML;
  section.querySelector('.card')?.appendChild(div);

  document.getElementById('geoInstruction')?.classList.remove('hidden');
  showToast(toastMsg, 4000);
}

// ─── Timer ──────────────────────────────────────────────────────
function startGeoTimer() {
  if (GEO.timerInterval) clearInterval(GEO.timerInterval);
  updateTimerDisplay();
  GEO.timerInterval = setInterval(() => {
    GEO.timeLeft--;
    updateTimerDisplay();
    if (GEO.timeLeft <= 0) {
      clearInterval(GEO.timerInterval);
      if (AppState.isAdmin && AppState.adminMode) revealGeoAnswer();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const badge = document.getElementById('geoRoundBadge');
  if (!badge) return;
  badge.classList.remove('hidden');
  const s = GEO.timeLeft;
  const c = s <= 10 ? '#ff2d78' : s <= 20 ? '#ffd60a' : '#00ff88';
  badge.innerHTML = `<span style="color:${c}">⏱ ${s}s</span>`;
}

// ─── Confirmer le guess ─────────────────────────────────────────
async function confirmGeoGuess() {
  if (!GEO.myGuessPin || GEO.myGuessConfirmed) return;
  const pos  = GEO.myGuessPin.getLatLng();
  const dist = haversineKm(pos.lat, pos.lng, GEO.secretLat, GEO.secretLng);

  GEO.myGuessConfirmed = true;
  GEO.guesses[AppState.username] = { lat: pos.lat, lng: pos.lng, dist };

  GEO.map.removeLayer(GEO.myGuessPin);
  GEO.myGuessPin = L.marker([pos.lat, pos.lng], { icon: makeIcon('✅', pinColor(AppState.username)) })
    .addTo(GEO.map).bindPopup(`<b>${escapeHtml(AppState.username)}</b> (confirmé)`);

  const payload = { username: AppState.username, lat: pos.lat, lng: pos.lng, dist };
  GEO.channel.send({ type: 'broadcast', event: 'geo-guess', payload });

  await db.from('geo_challenge').update({ guesses: { ...GEO.guesses } }).eq('id', 1);

  document.getElementById('geoGuessBtn')?.classList.add('hidden');
  const instr = document.getElementById('geoInstruction');
  if (instr) instr.innerHTML = `<p class="font-mono text-sm" style="color:#00ff88">✅ Pin confirmé ! En attente des autres...</p>`;
  showToast('📍 Position confirmée !', 2000);
}

function showAlreadyGuessed() {
  document.getElementById('geoHintSection')?.classList.add('hidden');
  const instr = document.getElementById('geoInstruction');
  if (instr) { instr.classList.remove('hidden'); instr.innerHTML = `<p class="font-mono text-sm" style="color:#00ff88">✅ Tu as déjà posé ton pin ! En attente des autres...</p>`; }
}

// ─── Recevoir guess d'un autre ──────────────────────────────────
function receiveGeoGuess(payload) {
  GEO.guesses[payload.username] = { lat: payload.lat, lng: payload.lng, dist: payload.dist };
  if (payload.username !== AppState.username) renderPlayerGuessPin(payload.username, payload.lat, payload.lng);
  showToast(`📍 ${escapeHtml(payload.username)} a posé son pin !`, 2000);
}

function renderPlayerGuessPin(username, lat, lng) {
  if (GEO.playerPins[username]) GEO.map.removeLayer(GEO.playerPins[username]);
  GEO.playerPins[username] = L.marker([lat, lng], { icon: makeIcon('📍', pinColor(username)) })
    .addTo(GEO.map).bindPopup(`<b>${escapeHtml(username)}</b>`);
}

// ─── Admin révéler ──────────────────────────────────────────────
async function revealGeoAnswer() {
  if (!AppState.isAdmin) return;
  if (GEO.timerInterval) clearInterval(GEO.timerInterval);

  const placeName = [GEO.secretCity, GEO.secretCountry].filter(Boolean).join(', ') || null;
  const payload = { lat: GEO.secretLat, lng: GEO.secretLng, guesses: GEO.guesses, placeName };

  await db.from('geo_challenge').update({ state: 'revealed', guesses: GEO.guesses, place_name: placeName }).eq('id', 1);
  GEO.channel.send({ type: 'broadcast', event: 'geo-reveal', payload });
  receiveGeoReveal(payload);
}

// ─── Recevoir révélation ────────────────────────────────────────
function receiveGeoReveal(payload) {
  GEO.state   = 'revealed';
  GEO.guesses = payload.guesses || {};
  if (GEO.timerInterval) clearInterval(GEO.timerInterval);

  const placeName = payload.placeName || null;

  // Pin secret
  if (GEO.adminPin) GEO.map.removeLayer(GEO.adminPin);
  const popupContent = placeName
    ? `<b>🎯 LIEU SECRET</b><br><span style="color:#ffd60a; font-weight:700;">${escapeHtml(placeName)}</span><br><span style="color:#6070a0; font-size:10px;">${payload.lat.toFixed(4)}, ${payload.lng.toFixed(4)}</span>`
    : `<b>🎯 LIEU SECRET</b><br><span style="color:#6070a0; font-size:10px;">${payload.lat.toFixed(4)}, ${payload.lng.toFixed(4)}</span>`;
  GEO.adminPin = L.marker([payload.lat, payload.lng], { icon: makeIcon('🎯', '#ffd60a', true) })
    .addTo(GEO.map).bindPopup(popupContent, { maxWidth: 220 }).openPopup();

  // Lignes + markers
  GEO.lineLayers.forEach(l => GEO.map.removeLayer(l));
  GEO.lineLayers = [];
  Object.entries(GEO.guesses).forEach(([username, g]) => {
    const color = pinColor(username);
    const dist  = haversineKm(g.lat, g.lng, payload.lat, payload.lng);
    GEO.guesses[username].dist = dist;
    const line = L.polyline([[g.lat, g.lng],[payload.lat, payload.lng]], { color, weight: 2, dashArray:'6,4', opacity:0.7 }).addTo(GEO.map);
    GEO.lineLayers.push(line);
    if (GEO.playerPins[username]) GEO.map.removeLayer(GEO.playerPins[username]);
    GEO.playerPins[username] = L.marker([g.lat, g.lng], { icon: makeIcon('📍', color) })
      .addTo(GEO.map).bindPopup(`<b>${escapeHtml(username)}</b><br>Distance : ${formatDist(dist)}`);
  });

  const allPoints = [[payload.lat, payload.lng], ...Object.values(GEO.guesses).map(g=>[g.lat,g.lng])];
  if (allPoints.length > 1) GEO.map.fitBounds(L.latLngBounds(allPoints), { padding:[40,40] });

  setGeoStatus('🎯', placeName ? `🎯 C'était : ${placeName}` : 'Résultats révélés !', false);
  renderGeoResults(payload.lat, payload.lng, placeName);

  document.getElementById('geoHintSection')?.classList.add('hidden');
  document.getElementById('geoInstruction')?.classList.add('hidden');
  document.getElementById('geoGuessBtn')?.classList.add('hidden');
  document.getElementById('geoRoundBadge')?.classList.add('hidden');
  document.getElementById('geoRevealBtn') && (document.getElementById('geoRevealBtn').disabled = true);
}

// ─── Classement ─────────────────────────────────────────────────
function renderGeoResults(secretLat, secretLng, placeName) {
  const resultsEl = document.getElementById('geoResults');
  const listEl    = document.getElementById('geoResultsList');
  if (!resultsEl || !listEl) return;

  const sorted = Object.entries(GEO.guesses)
    .map(([u,g]) => ({ username:u, dist: haversineKm(g.lat,g.lng,secretLat,secretLng) }))
    .sort((a,b) => a.dist - b.dist);

  const titleEl = resultsEl.querySelector('h3');
  if (titleEl && placeName) titleEl.innerHTML = `🏆 RÉSULTATS — <span style="color:#ffd60a">${escapeHtml(placeName)}</span>`;

  if (sorted.length === 0) {
    listEl.innerHTML = `<p class="font-mono text-xs text-[#3a4060]">Personne n'a guessé.</p>`;
  } else {
    const medals = ['🥇','🥈','🥉'];
    listEl.innerHTML = sorted.map((r,i) => {
      const isMe  = r.username === AppState.username;
      const medal = medals[i] || `#${i+1}`;
      const color = i===0?'#ffd60a':i===1?'#c0c0c0':i===2?'#cd7f32':'#6070a0';
      return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
        <span style="font-size:18px;">${medal}</span>
        <span style="font-family:'Orbitron',monospace;font-size:12px;font-weight:700;color:${isMe?'#00ff88':color};flex:1;">${escapeHtml(r.username)}${isMe?' (toi)':''}</span>
        <span style="font-family:'Share Tech Mono',monospace;font-size:12px;color:${color};font-weight:700;">${formatDist(r.dist)}</span>
      </div>`;
    }).join('');
  }

  resultsEl.classList.remove('hidden');
  if (sorted.length > 0) {
    const hint = placeName ? ` — C'était ${placeName}` : '';
    showToast(`🥇 ${sorted[0].username} gagne avec ${formatDist(sorted[0].dist)}${hint} !`, 6000);
  }
}

// ─── Reset ──────────────────────────────────────────────────────
async function resetGeoChallenge() {
  if (!AppState.isAdmin) return;
  if (GEO.timerInterval) clearInterval(GEO.timerInterval);
  await db.from('geo_challenge').upsert({ id:1, state:'idle', guesses:{}, secret_lat:null, secret_lng:null, secret_city:null, secret_country:null, place_name:null });
  GEO.channel.send({ type:'broadcast', event:'geo-reset', payload:{} });
  resetGeoState();
}

function resetGeoState() {
  GEO.state='idle'; GEO.guesses={}; GEO.myGuessConfirmed=false;
  GEO.hintSpun=false; GEO.myHintType=null;
  GEO.adminDraftLat=null; GEO.adminDraftLng=null;
  GEO.adminDraftCity=null; GEO.adminDraftCountry=null;
  if (GEO.timerInterval) clearInterval(GEO.timerInterval);
  clearGeoMap();
  setGeoStatus('⏳','Aucune partie en cours. Attends qu\'un admin lance un défi !', false);
  ['geoInstruction','geoGuessBtn','geoResults','geoRoundBadge','geoHintSection'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
  document.getElementById('geoLaunchBtn') && (document.getElementById('geoLaunchBtn').disabled=true);
  document.getElementById('geoRevealBtn') && (document.getElementById('geoRevealBtn').disabled=true);
  const p=document.getElementById('geoAdminPinStatus'); if(p) p.innerHTML='📍 Aucun lieu sélectionné';
}

// ─── Utilitaires ────────────────────────────────────────────────
function clearGeoMap() {
  if (GEO.adminPin) { GEO.map.removeLayer(GEO.adminPin); GEO.adminPin=null; }
  if (GEO.myGuessPin) { GEO.map.removeLayer(GEO.myGuessPin); GEO.myGuessPin=null; }
  Object.values(GEO.playerPins).forEach(m=>GEO.map.removeLayer(m)); GEO.playerPins={};
  GEO.lineLayers.forEach(l=>GEO.map.removeLayer(l)); GEO.lineLayers=[];
}

function setGeoStatus(icon, text, active) {
  const i=document.getElementById('geoStatusIcon'); if(i) i.textContent=icon;
  const t=document.getElementById('geoStatusText'); if(t) t.textContent=text;
  const b=document.getElementById('geoStatusBar');
  if(b){ b.style.borderColor=active?'rgba(0,255,136,0.4)':'rgba(0,255,136,0.1)'; b.style.background=active?'rgba(0,255,136,0.04)':''; }
}

function formatDist(km) {
  if(km<1) return `${Math.round(km*1000)} m`;
  if(km<10) return `${km.toFixed(1)} km`;
  if(km<1000) return `${Math.round(km)} km`;
  return `${Math.round(km/100)/10} 000 km`;
}

function haversineKm(lat1,lng1,lat2,lng2) {
  const R=6371, dLat=(lat2-lat1)*Math.PI/180, dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

function makeIcon(emoji, color, large=false) {
  const s=large?42:34;
  return L.divIcon({ html:`<div style="width:${s}px;height:${s}px;background:${color};border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;border:2px solid rgba(255,255,255,0.4);box-shadow:0 0 12px ${color}88;"><span style="transform:rotate(45deg);font-size:${large?18:14}px;">${emoji}</span></div>`, className:'', iconSize:[s,s], iconAnchor:[s/2,s] });
}

function cleanupGeoDefi() {
  if(GEO.channel){db.removeChannel(GEO.channel);GEO.channel=null;}
  if(GEO.timerInterval) clearInterval(GEO.timerInterval);
  GEO.initialized=false;
}