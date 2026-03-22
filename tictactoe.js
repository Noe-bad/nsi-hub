// ============================================================
//  tictactoe.js — Morpion avec salons (code à 4 chiffres)
// ============================================================

const TTT = {
  channel: null,
  roomCode: null,
  gameState: null,
  mySymbol: null,
  initialized: false,
};

// ─── Init ────────────────────────────────────────────────────
function initTicTacToe() {
  buildTTTBoard(); // toujours construire les cellules
  if (!TTT.initialized) {
    TTT.initialized = true;
    showTTTLobby();
  }
}

// ─── Afficher le lobby (avant de rejoindre une partie) ───────
function showTTTLobby() {
  document.getElementById('tttLobby').classList.remove('hidden');
  document.getElementById('tttGame').classList.add('hidden');
  if (TTT.channel) { db.removeChannel(TTT.channel); TTT.channel = null; }
  TTT.roomCode  = null;
  TTT.gameState = null;
  TTT.mySymbol  = null;
}

// ─── Créer un salon ──────────────────────────────────────────
async function createTTTRoom() {
  const code = String(Math.floor(1000 + Math.random() * 9000));
  const initial = {
    code,
    board: JSON.stringify(['','','','','','','','','']),
    current_turn: 'X',
    player_x: AppState.username,
    player_o: '',
    winner: '',
    updated_at: new Date().toISOString(),
  };

  const { error } = await db.from('ttt_rooms').insert(initial);
  if (error) { showToast('❌ Erreur création salon : ' + error.message, 3000); return; }

  TTT.roomCode = code;
  TTT.mySymbol = 'X';
  await joinTTTChannel(code);
  showToast(`✅ Salon créé ! Code : ${code}`, 3000);
}

// ─── Rejoindre un salon ──────────────────────────────────────
async function joinTTTRoom() {
  const input = document.getElementById('tttCodeInput');
  const code  = input ? input.value.trim() : '';
  if (!code || code.length !== 4) { showToast('⚠️ Saisis un code à 4 chiffres.', 2000); return; }

  const { data, error } = await db.from('ttt_rooms').select('*').eq('code', code).single();
  if (error || !data) { showToast('❌ Salon introuvable.', 2000); return; }

  if (data.player_x === AppState.username) {
    // Reconnexion en tant que X
    TTT.mySymbol = 'X';
  } else if (!data.player_o) {
    // Rejoindre en O
    const { error: e2 } = await db.from('ttt_rooms').update({
      player_o: AppState.username,
      updated_at: new Date().toISOString(),
    }).eq('code', code);
    if (e2) { showToast('❌ Erreur', 2000); return; }
    TTT.mySymbol = 'O';
  } else if (data.player_o === AppState.username) {
    TTT.mySymbol = 'O';
  } else {
    showToast('👥 Salon plein !', 2000); return;
  }

  TTT.roomCode = code;
  await joinTTTChannel(code);
  showToast(`✅ Salon rejoint en tant que ${TTT.mySymbol} !`, 2000);
}

// ─── S'abonner au canal realtime du salon ────────────────────
async function joinTTTChannel(code) {
  if (TTT.channel) db.removeChannel(TTT.channel);

  TTT.channel = db
    .channel('ttt-room-' + code)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'ttt_rooms',
      filter: `code=eq.${code}`,
    }, (payload) => {
      TTT.gameState = payload.new;
      renderTTT();
    })
    .subscribe();

  // Charger l'état initial
  const { data } = await db.from('ttt_rooms').select('*').eq('code', code).single();
  if (data) { TTT.gameState = data; }

  // Afficher le jeu
  document.getElementById('tttLobby').classList.add('hidden');
  document.getElementById('tttGame').classList.remove('hidden');
  document.getElementById('tttRoomCode').textContent = code;
  buildTTTBoard(); // reconstruire les cellules maintenant que le div est visible
  renderTTT();
}

// ─── Construire les 9 cellules ────────────────────────────────
function buildTTTBoard() {
  const board = document.getElementById('tttBoard');
  if (!board) return;
  // Vider et reconstruire à chaque fois pour éviter les doublons
  board.innerHTML = '';
  // Forcer le style grid inline pour être sûr
  board.style.cssText = 'display:grid; grid-template-columns:repeat(3,1fr); gap:8px; width:fit-content; margin:0 auto;';
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement('div');
    cell.id = 'tttCell' + i;
    cell.className = 'ttt-cell';
    cell.onclick = () => playTTT(i);
    board.appendChild(cell);
  }
}

// ─── Jouer un coup ────────────────────────────────────────────
async function playTTT(index) {
  if (!TTT.gameState || !TTT.mySymbol || !TTT.roomCode) {
    showToast('⚠️ Rejoins un salon d\'abord !', 2000); return;
  }
  const board = parseBoard(TTT.gameState.board);
  const turn  = TTT.gameState.current_turn;

  if (TTT.gameState.winner)  { showToast('🏁 Partie terminée !', 1500); return; }
  if (turn !== TTT.mySymbol) { showToast('⏳ Pas ton tour !', 1500); return; }
  if (board[index])          { showToast('❌ Case déjà jouée !', 1000); return; }

  // Vérifier que c'est bien notre tour (double sécurité)
  const myName = AppState.username;
  if (turn === 'X' && TTT.gameState.player_x !== myName) return;
  if (turn === 'O' && TTT.gameState.player_o !== myName) return;

  board[index] = turn;
  const winner = checkTTTWinner(board);
  const isDraw = !winner && board.every(c => c !== '');

  const { data } = await db.from('ttt_rooms').update({
    board:        JSON.stringify(board),
    current_turn: turn === 'X' ? 'O' : 'X',
    winner:       winner || (isDraw ? 'DRAW' : ''),
    updated_at:   new Date().toISOString(),
  }).eq('code', TTT.roomCode).select().single();

  if (data) { TTT.gameState = data; renderTTT(); }
}

// ─── Nouvelle partie dans le même salon ──────────────────────
async function newTTTGame() {
  if (!TTT.roomCode) return;
  TTT.mySymbol = TTT.gameState?.player_x === AppState.username ? 'X' : 'O';

  const { data } = await db.from('ttt_rooms').update({
    board:        JSON.stringify(['','','','','','','','','']),
    current_turn: 'X',
    winner:       '',
    updated_at:   new Date().toISOString(),
  }).eq('code', TTT.roomCode).select().single();

  if (data) { TTT.gameState = data; renderTTT(); }
  showToast('🔄 Nouvelle partie !', 2000);
}

// ─── Quitter le salon ─────────────────────────────────────────
function leaveTTTRoom() {
  showTTTLobby();
  showToast('👋 Salon quitté.', 1500);
}

// ─── Vérifier victoire ────────────────────────────────────────
function checkTTTWinner(board) {
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const [a,b,c] of lines)
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  return null;
}

// ─── Parser le board (jsonb ou string) ───────────────────────
function parseBoard(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      if (Array.isArray(p) && p.length === 9) return p;
    } catch(e) {}
  }
  return ['','','','','','','','',''];
}

// ─── Rendu ────────────────────────────────────────────────────
function renderTTT() {
  const s = TTT.gameState;
  if (!s) return;

  const board     = parseBoard(s.board);
  const isMyTurn  = TTT.mySymbol && s.current_turn === TTT.mySymbol && !s.winner;
  const waitingO  = !s.player_o;

  for (let i = 0; i < 9; i++) {
    const cell = document.getElementById('tttCell' + i);
    if (!cell) continue;
    cell.textContent = board[i];
    cell.className   = 'ttt-cell';
    if (board[i] === 'X') cell.classList.add('ttt-x');
    if (board[i] === 'O') cell.classList.add('ttt-o');
    if (!board[i] && isMyTurn && !waitingO) cell.classList.add('ttt-playable');
    if (s.winner) cell.classList.add('ttt-finished');
  }

  // Joueurs
  const pxEl = document.getElementById('playerX');
  const poEl = document.getElementById('playerO');
  if (pxEl) pxEl.textContent = s.player_x || '(libre)';
  if (poEl) poEl.textContent = s.player_o || '⏳ En attente...';

  // Statut
  const statusEl = document.getElementById('tttStatus');
  if (statusEl) {
    if (waitingO) {
      statusEl.innerHTML = `<span style="color:#ffd60a">⏳ En attente du 2ème joueur...<br><span style="font-size:10px">Partage le code <strong>${TTT.roomCode}</strong> à ton adversaire !</span></span>`;
    } else if (s.winner === 'DRAW') {
      statusEl.innerHTML = `<span style="color:#ffd60a">🤝 Match nul !</span>`;
    } else if (s.winner) {
      const wName = s.winner === 'X' ? s.player_x : s.player_o;
      statusEl.innerHTML = `<span style="color:#00ff88">🏆 ${escapeHtml(wName)} gagne !</span>`;
    } else {
      const turnName = s.current_turn === 'X' ? s.player_x : s.player_o;
      const isMe     = isMyTurn;
      const c        = s.current_turn === 'X' ? '#00d4ff' : '#ff2d78';
      statusEl.innerHTML = `<span style="color:${c}">Tour de ${escapeHtml(turnName)}${isMe ? ' ← TON TOUR !' : ''}</span>`;
    }
  }
}

function cleanupTicTacToe() {
  if (TTT.channel) { db.removeChannel(TTT.channel); TTT.channel = null; }
  TTT.initialized = false;
  TTT.roomCode = null;
}

// Alias pour compatibilité
function refreshTTT() { renderTTT(); }