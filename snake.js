// ============================================================
//  snake.js — Moteur basé sur requestAnimationFrame (straker)
//  Adapté pour PermanceHub : score, niveaux, HUD, pranks, admin kill
// ============================================================

// ─── Config ───────────────────────────────────────────────
const GRID  = 20;         // taille d'une case en px
const COLS  = 24;         // nombre de colonnes
const ROWS  = 24;         // nombre de lignes
const W     = GRID * COLS; // 480px
const H     = GRID * ROWS; // 480px

// Vitesse : frames à sauter entre chaque tick (plus = plus lent)
// 60fps natif → on joue 1 tick tous les SKIP frames
const SPEED_LEVELS = [8, 7, 6, 5, 4, 3]; // index 0 = lv1, 5 = lv6+
function getSkip(level) {
  return SPEED_LEVELS[Math.min(level - 1, SPEED_LEVELS.length - 1)];
}

// ─── État du jeu ──────────────────────────────────────────
let snakeCtx, snakeCanvas;
let frameCount  = 0;
let rafId       = null;     // requestAnimationFrame id
let gameRunning = false;
let gamePaused  = false;

const S = {           // état snake (remplace l'objet snake de straker)
  x: COLS / 2 * GRID,
  y: ROWS / 2 * GRID,
  dx: GRID, dy: 0,
  cells: [],
  maxCells: 4,
  score: 0,
  highScore: 0,
  level: 1,
};

const apple = { x: 0, y: 0 };

// Direction tampon pour éviter le double-input dans le même tick
let pendingDx = GRID, pendingDy = 0;

// ─── Init (appelé une seule fois) ─────────────────────────
let snakeInitialized = false;
function initSnake() {
  if (snakeInitialized) { drawStartScreen(); return; }
  snakeInitialized = true;

  snakeCanvas = document.getElementById('snakeCanvas');
  if (!snakeCanvas) return;

  snakeCanvas.width  = W;
  snakeCanvas.height = H;
  snakeCtx = snakeCanvas.getContext('2d');

  document.addEventListener('keydown', onSnakeKey);
  drawStartScreen();
  initSnakeMiniLB();
}

// ─── Démarrer / rejouer ───────────────────────────────────
function startSnake() {
  if (gameRunning) return;

  // Reset
  S.x = Math.floor(COLS / 2) * GRID;
  S.y = Math.floor(ROWS / 2) * GRID;
  S.dx = GRID; S.dy = 0;
  pendingDx = GRID; pendingDy = 0;
  S.cells = [];
  S.maxCells = 4;
  S.score = 0;
  S.level = 1;
  frameCount = 0;
  gamePaused = false;

  spawnApple();
  updateHUD();

  gameRunning = true;
  document.getElementById('snakeStartBtn').textContent = '⏸ PAUSE';
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(gameLoop);
}

function pauseSnake() {
  if (!gameRunning) { startSnake(); return; }
  gamePaused = !gamePaused;
  const btn = document.getElementById('snakeStartBtn');
  if (gamePaused) {
    btn.textContent = '▶ REPRENDRE';
    drawPauseScreen();
  } else {
    btn.textContent = '⏸ PAUSE';
    rafId = requestAnimationFrame(gameLoop);
  }
}

// ─── Boucle principale ────────────────────────────────────
function gameLoop() {
  if (!gameRunning || gamePaused) return;
  rafId = requestAnimationFrame(gameLoop);

  frameCount++;
  if (frameCount < getSkip(S.level)) return;
  frameCount = 0;

  tick();
}

function tick() {
  // Appliquer la direction en attente
  S.dx = pendingDx;
  S.dy = pendingDy;

  // Déplacer la tête
  S.x += S.dx;
  S.y += S.dy;

  // Mort sur les murs
  if (S.x < 0 || S.x >= W || S.y < 0 || S.y >= H) {
    endGame(); return;
  }

  // Historique des cases occupées
  S.cells.unshift({ x: S.x, y: S.y });
  if (S.cells.length > S.maxCells) S.cells.pop();

  // Collision avec soi-même
  for (let i = 1; i < S.cells.length; i++) {
    if (S.cells[i].x === S.x && S.cells[i].y === S.y) {
      endGame(); return;
    }
  }

  // Manger la pomme
  if (S.x === apple.x && S.y === apple.y) {
    S.maxCells++;
    S.score += 10 * S.level;
    // Montée de niveau toutes les 10 pommes
    const pommes = S.maxCells - 4;
    S.level = Math.min(6, 1 + Math.floor(pommes / 10));
    updateHUD();
    spawnApple();
  }

  draw();
}

// ─── Dessin ───────────────────────────────────────────────
function draw() {
  const ctx = snakeCtx;

  // Fond
  ctx.fillStyle = '#05050f';
  ctx.fillRect(0, 0, W, H);

  // Grille subtile
  ctx.strokeStyle = 'rgba(0,212,255,0.03)';
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= W; x += GRID) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
  for (let y = 0; y <= H; y += GRID) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

  // Bordure / murs néon
  ctx.strokeStyle = 'rgba(0,212,255,0.5)';
  ctx.shadowColor = '#00d4ff';
  ctx.shadowBlur  = 8;
  ctx.lineWidth   = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);
  ctx.shadowBlur  = 0;

  // Pomme
  ctx.fillStyle = '#ff2d78';
  ctx.shadowColor = '#ff2d78';
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(apple.x + GRID/2, apple.y + GRID/2, GRID/2 - 1, 0, Math.PI * 2);
  ctx.fill();
  // Reflet
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(apple.x + GRID/2 - 3, apple.y + GRID/2 - 3, 3, 0, Math.PI * 2);
  ctx.fill();

  // Corps du snake
  S.cells.forEach((cell, i) => {
    const ratio = 1 - (i / S.cells.length) * 0.55;
    // Dégradé vert → cyan le long du corps
    const r = Math.round(0   * ratio);
    const g = Math.round(255 * ratio);
    const b = Math.round(Math.round(136 + (i / S.cells.length) * 119) * ratio);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.shadowColor = i === 0 ? '#00ff88' : 'transparent';
    ctx.shadowBlur  = i === 0 ? 12 : 0;

    const pad = i === 0 ? 1 : 2;
    const r2  = i === 0 ? 6 : 4;
    roundRect(ctx, cell.x + pad, cell.y + pad, GRID - pad*2, GRID - pad*2, r2);
    ctx.fill();
  });
  ctx.shadowBlur = 0;

  // Yeux sur la tête
  if (S.cells.length > 0) drawEyes(ctx, S.cells[0]);
}

function drawEyes(ctx, head) {
  const cx = head.x + GRID / 2;
  const cy = head.y + GRID / 2;
  // Offset des yeux selon la direction
  let ex1, ey1, ex2, ey2;
  if (S.dx > 0)       { ex1=cx+4; ey1=cy-4; ex2=cx+4; ey2=cy+4; }
  else if (S.dx < 0)  { ex1=cx-4; ey1=cy-4; ex2=cx-4; ey2=cy+4; }
  else if (S.dy < 0)  { ex1=cx-4; ey1=cy-4; ex2=cx+4; ey2=cy-4; }
  else                { ex1=cx-4; ey1=cy+4; ex2=cx+4; ey2=cy+4; }

  ctx.fillStyle = '#ffffff';
  ctx.shadowBlur = 0;
  [[ex1,ey1],[ex2,ey2]].forEach(([x,y]) => {
    ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI*2); ctx.fill();
  });
  ctx.fillStyle = '#000';
  [[ex1,ey1],[ex2,ey2]].forEach(([x,y]) => {
    ctx.beginPath(); ctx.arc(x+0.5, y+0.5, 1.2, 0, Math.PI*2); ctx.fill();
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y); ctx.arcTo(x+w,y,   x+w,y+r,  r);
  ctx.lineTo(x+w, y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
  ctx.lineTo(x+r, y+h);   ctx.arcTo(x,y+h,  x,y+h-r,  r);
  ctx.lineTo(x, y+r);     ctx.arcTo(x,y,     x+r,y,    r);
  ctx.closePath();
}

// ─── Pomme ────────────────────────────────────────────────
function spawnApple() {
  // Spawn hors du corps du snake
  let nx, ny, safe;
  do {
    nx = Math.floor(Math.random() * COLS) * GRID;
    ny = Math.floor(Math.random() * ROWS) * GRID;
    safe = !S.cells.some(c => c.x === nx && c.y === ny);
  } while (!safe);
  apple.x = nx;
  apple.y = ny;
}

// ─── Écrans ───────────────────────────────────────────────
function drawStartScreen() {
  const ctx = snakeCtx;
  if (!ctx) return;
  ctx.fillStyle = '#05050f';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';

  ctx.fillStyle = '#00ff88';
  ctx.shadowColor = '#00ff88';
  ctx.shadowBlur = 20;
  ctx.font = '18px "Press Start 2P"';
  ctx.fillText('SNAKE', W/2, H/2 - 30);

  ctx.shadowBlur = 0;
  ctx.fillStyle = '#4a5580';
  ctx.font = '8px "Press Start 2P"';
  ctx.fillText('Appuie sur ▶ JOUER', W/2, H/2 + 10);
  ctx.fillText('ou une touche flèche', W/2, H/2 + 28);

  ctx.font = '7px "Press Start 2P"';
  ctx.fillStyle = '#3a4060';
  ctx.fillText('WASD ou ↑↓←→', W/2, H/2 + 52);
}

function drawPauseScreen() {
  const ctx = snakeCtx;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#00d4ff';
  ctx.shadowColor = '#00d4ff';
  ctx.shadowBlur = 20;
  ctx.font = '14px "Press Start 2P"';
  ctx.fillText('PAUSE', W/2, H/2);
  ctx.shadowBlur = 0;
}

// ─── Fin de partie ────────────────────────────────────────
function endGame(killedByAdmin = false) {
  gameRunning = false;
  gamePaused  = false;
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }

  if (S.score > S.highScore) {
    S.highScore = S.score;
    document.getElementById('snakeHighScore').textContent = S.highScore;
  }

  const ctx = snakeCtx;
  if (killedByAdmin) {
    setTimeout(() => {
      ctx.fillStyle = 'rgba(0,0,0,0.88)';
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd60a';
      ctx.shadowColor = '#ffd60a';
      ctx.shadowBlur = 28;
      ctx.font = '11px "Press Start 2P"';
      ctx.fillText('☠️ KILLED BY', W/2, H/2 - 28);
      ctx.fillText('ADMIN', W/2, H/2 - 6);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ff2d78';
      ctx.font = '7px "Press Start 2P"';
      ctx.fillText('score perdu. bien fait.', W/2, H/2 + 20);
    }, 80);
    document.getElementById('snakeStartBtn').textContent = '▶ REJOUER';
    return; // pas de popup score
  }

  ctx.fillStyle = 'rgba(0,0,0,0.82)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff2d78';
  ctx.shadowColor = '#ff2d78';
  ctx.shadowBlur = 22;
  ctx.font = '14px "Press Start 2P"';
  ctx.fillText('GAME OVER', W/2, H/2 - 24);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#00d4ff';
  ctx.shadowColor = '#00d4ff';
  ctx.shadowBlur = 10;
  ctx.font = '10px "Press Start 2P"';
  ctx.fillText('SCORE : ' + S.score, W/2, H/2 + 16);
  ctx.shadowBlur = 0;

  document.getElementById('snakeStartBtn').textContent = '▶ REJOUER';
  setTimeout(() => showScorePopup(S.score), 700);
}

// ─── HUD ──────────────────────────────────────────────────
function updateHUD() {
  document.getElementById('snakeScore').textContent     = S.score;
  document.getElementById('snakeHighScore').textContent = S.highScore;
  document.getElementById('snakeLevel').textContent     = S.level;
}

// ─── Contrôles clavier ────────────────────────────────────
function onSnakeKey(e) {
  // Ignorer si l'utilisateur tape dans un champ texte
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;

  // Ignorer si on n'est pas sur la section Snake
  if (AppState.currentSection !== 'snake') return;

  // Ignorer si la partie n'est pas en cours (le bouton JOUER sert à démarrer)
  if (!gameRunning) return;

  const inv = window.pranksState?.invertedControls;

  const map = {
    'ArrowLeft':  { dx: -GRID, dy: 0     },
    'ArrowRight': { dx:  GRID, dy: 0     },
    'ArrowUp':    { dx: 0,     dy: -GRID },
    'ArrowDown':  { dx: 0,     dy:  GRID },
    'a': { dx: -GRID, dy: 0     }, 'A': { dx: -GRID, dy: 0     },
    'd': { dx:  GRID, dy: 0     }, 'D': { dx:  GRID, dy: 0     },
    'w': { dx: 0,     dy: -GRID }, 'W': { dx: 0,     dy: -GRID },
    's': { dx: 0,     dy:  GRID }, 'S': { dx: 0,     dy:  GRID },
  };

  let dir = map[e.key];
  if (!dir) return;

  e.preventDefault();

  if (inv) {
    dir = { dx: -dir.dx, dy: -dir.dy };
    if (dir.dx === 0 && dir.dy === 0) return;
  }

  // Empêcher le demi-tour
  if (dir.dx !== 0 && S.dx !== 0) return;
  if (dir.dy !== 0 && S.dy !== 0) return;

  pendingDx = dir.dx;
  pendingDy = dir.dy;
}

// ─── Mini leaderboard Snake ───────────────────────────────
async function initSnakeMiniLB() {
  const container = document.getElementById('snakeMiniLB');
  if (!container) return;

  const { data } = await db
    .from('scores')
    .select('username, score')
    .order('score', { ascending: false })
    .limit(5);

  if (!data || data.length === 0) {
    container.innerHTML = `<p class="font-mono text-xs" style="color:#3a4060">Aucun score.</p>`;
    return;
  }

  const medals = ['🥇','🥈','🥉','4.','5.'];
  container.innerHTML = data.map((row, i) => `
    <div style="display:flex; justify-content:space-between; align-items:center; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.04);">
      <span style="font-size:13px;">${medals[i]}</span>
      <span style="font-family:'Share Tech Mono',monospace; font-size:11px; color:#b0b8e0; flex:1; margin:0 8px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(row.username)}</span>
      <span style="font-family:'Press Start 2P',monospace; font-size:9px; color:#00ff88;">${row.score}</span>
    </div>`).join('');
}