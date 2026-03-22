// ============================================================
//  whiteboard.js v4 — 2 canvas, zéro duplication, Ctrl+Z
// ============================================================
//
//  strokeCanvas (bas, fond blanc) : UNIQUEMENT les traits
//  imageCanvas  (haut, transparent) : UNIQUEMENT les images
//
//  Règle absolue : RIEN d'autre ne dessine sur imageCanvas
//  que redrawImageLayer(). Aucune fonction externe ne touche
//  directement aux canvas.
// ============================================================

const WB = {
  strokeCanvas: null, sCtx: null,
  imageCanvas:  null, iCtx: null,
  initialized: false,
  channel: null,

  // Outil
  tool:  'pen',   // 'pen' | 'eraser' | 'select'
  color: '#ff2d78',
  size:  5,

  // État dessin (pen/eraser)
  isDrawing: false,
  lastX: 0, lastY: 0,

  // Images (imageCanvas seulement)
  images:      [],   // [{ id, el, x, y, w, h }]
  selectedImg: null,

  // Drag / resize
  isDragging:    false,
  isResizing:    false,
  resizeCorner:  null,
  dragOffX: 0, dragOffY: 0,
  resizeAnchor:  null,  // { x, y, w, h } — état au début du resize

  // Historique undo
  // Chaque entrée : { strokeData: ImageData, images: [...copie...] }
  history: [],
  MAX_HISTORY: 40,
};

const H = 10; // demi-taille des handles (px canvas)

// ─── Init ─────────────────────────────────────────────────────
function initWhiteboard() {
  if (WB.initialized) return;
  WB.strokeCanvas = document.getElementById('strokeCanvas');
  WB.imageCanvas  = document.getElementById('imageCanvas');
  if (!WB.strokeCanvas || !WB.imageCanvas) return;
  WB.initialized = true;
  WB.sCtx = WB.strokeCanvas.getContext('2d');
  WB.iCtx = WB.imageCanvas.getContext('2d');
  resizeCanvases();

  // Tous les events sur imageCanvas (il est au-dessus)
  const ic = WB.imageCanvas;
  ic.addEventListener('mousedown',  evDown);
  ic.addEventListener('mousemove',  evMove);
  ic.addEventListener('mouseup',    evUp);
  ic.addEventListener('mouseleave', evUp);
  ic.addEventListener('touchstart', e => { e.preventDefault(); evDown(e.touches[0]); }, { passive: false });
  ic.addEventListener('touchmove',  e => { e.preventDefault(); evMove(e.touches[0]); }, { passive: false });
  ic.addEventListener('touchend',   evUp);

  document.addEventListener('paste',   onPaste);
  document.addEventListener('keydown', onKeyDown);

  document.getElementById('wbColor')?.addEventListener('input', e => {
    WB.color = e.target.value; activateTool('pen');
  });
  document.getElementById('wbSize')?.addEventListener('input', e => {
    WB.size = parseInt(e.target.value);
    const l = document.getElementById('wbSizeVal'); if (l) l.textContent = e.target.value;
  });

  startWBChannel();
  saveToHistory(); // état initial
}

function resizeCanvases() {
  const c = WB.strokeCanvas, p = c.parentElement;
  const w = p.clientWidth || 900;
  const h = Math.max(420, Math.floor(w * 0.55));
  WB.strokeCanvas.width  = WB.imageCanvas.width  = w;
  WB.strokeCanvas.height = WB.imageCanvas.height = h;
}

// ─── Canal Supabase ────────────────────────────────────────────
function startWBChannel() {
  if (WB.channel) db.removeChannel(WB.channel);
  WB.channel = db.channel('whiteboard-live', { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'stroke' }, ({ payload }) => applyRemoteStroke(payload))
    .on('broadcast', { event: 'clear'  }, () => {
      WB.sCtx.clearRect(0, 0, WB.strokeCanvas.width, WB.strokeCanvas.height);
      WB.images = []; WB.selectedImg = null;
      redrawImageLayer();
      saveToHistory();
    })
    .subscribe();
}

// ─── Événements ───────────────────────────────────────────────
function evDown(e) {
  const [x, y] = getPos(e);

  if (WB.tool === 'select') {
    // Priorité 1 : handle de resize sur image sélectionnée ?
    if (WB.selectedImg) {
      const corner = hitHandle(x, y, WB.selectedImg);
      if (corner) {
        WB.isResizing   = true;
        WB.resizeCorner = corner;
        WB.resizeAnchor = { x: WB.selectedImg.x, y: WB.selectedImg.y, w: WB.selectedImg.w, h: WB.selectedImg.h };
        // Point de départ du drag pour calculer le delta
        WB.dragOffX = x;
        WB.dragOffY = y;
        return;
      }
      // Priorité 2 : drag de l'image sélectionnée ?
      if (inImg(x, y, WB.selectedImg)) {
        WB.isDragging = true;
        WB.dragOffX   = x - WB.selectedImg.x;
        WB.dragOffY   = y - WB.selectedImg.y;
        return;
      }
    }
    // Priorité 3 : sélectionner une image ?
    WB.selectedImg = null;
    for (let i = WB.images.length - 1; i >= 0; i--) {
      if (inImg(x, y, WB.images[i])) { WB.selectedImg = WB.images[i]; break; }
    }
    redrawImageLayer();
    return;
  }

  // Mode dessin — sauvegarder l'état avant de commencer un trait
  saveToHistory();
  WB.isDrawing = true;
  WB.lastX = x; WB.lastY = y;
}

function evMove(e) {
  const [x, y] = getPos(e);

  if (WB.tool === 'select') {
    if (WB.isResizing && WB.selectedImg && WB.resizeAnchor) {
      doResize(x, y);
      redrawImageLayer();
      return;
    }
    if (WB.isDragging && WB.selectedImg) {
      WB.selectedImg.x = x - WB.dragOffX;
      WB.selectedImg.y = y - WB.dragOffY;
      redrawImageLayer();
      return;
    }
    // Mettre à jour le curseur
    updateCursor(x, y);
    return;
  }

  if (!WB.isDrawing) return;
  const s = mkStroke(x, y);
  drawStroke(WB.sCtx, s, 1, 1);
  WB.channel?.send({ type: 'broadcast', event: 'stroke', payload: s });
  WB.lastX = x; WB.lastY = y;
}

function evUp() {
  if (WB.isDragging || WB.isResizing) saveToHistory(); // undo après move/resize
  WB.isDrawing  = false;
  WB.isDragging = false;
  WB.isResizing = false;
  WB.resizeCorner = null;
}

// ─── Touches clavier ──────────────────────────────────────────
function onKeyDown(e) {
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (AppState.currentSection !== 'whiteboard') return;

  // Ctrl+Z / Cmd+Z → undo
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    doUndo();
  }
  // Suppr → supprimer l'image sélectionnée
  if ((e.key === 'Delete' || e.key === 'Backspace') && WB.selectedImg) {
    e.preventDefault();
    saveToHistory();
    WB.images = WB.images.filter(i => i !== WB.selectedImg);
    WB.selectedImg = null;
    redrawImageLayer();
  }
}

// ─── Presse-papier ────────────────────────────────────────────
function onPaste(e) {
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (AppState.currentSection !== 'whiteboard') return;
  for (const item of (e.clipboardData?.items || [])) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      wbAddImageFromUrl(URL.createObjectURL(item.getAsFile()));
      return;
    }
  }
}

// ─── Trait ────────────────────────────────────────────────────
function mkStroke(x, y) {
  return {
    x0: WB.lastX, y0: WB.lastY, x1: x, y1: y,
    color:  WB.color,
    size:   WB.tool === 'eraser' ? WB.size * 4 : WB.size,
    eraser: WB.tool === 'eraser',
    rW: WB.strokeCanvas.width,
    rH: WB.strokeCanvas.height,
  };
}

function drawStroke(ctx, s, sx, sy) {
  ctx.beginPath();
  ctx.moveTo(s.x0 * sx, s.y0 * sy);
  ctx.lineTo(s.x1 * sx, s.y1 * sy);
  ctx.strokeStyle = s.eraser ? '#ffffff' : s.color;
  ctx.lineWidth   = s.size;
  ctx.lineCap     = 'round'; ctx.lineJoin = 'round';
  ctx.stroke();
}

function applyRemoteStroke(s) {
  const sx = WB.strokeCanvas.width  / (s.rW || WB.strokeCanvas.width);
  const sy = WB.strokeCanvas.height / (s.rH || WB.strokeCanvas.height);
  drawStroke(WB.sCtx, s, sx, sy);
}

// ─── Redessiner les images ─────────────────────────────────────
// C'est LA SEULE fonction qui dessine sur imageCanvas.
// Elle efface tout et redessine proprement → zéro duplication.
function redrawImageLayer() {
  WB.iCtx.clearRect(0, 0, WB.imageCanvas.width, WB.imageCanvas.height);
  for (const img of WB.images) {
    WB.iCtx.drawImage(img.el, img.x, img.y, img.w, img.h);
  }
  if (WB.selectedImg) drawHandles(WB.selectedImg);
}

function drawHandles(img) {
  const ctx = WB.iCtx;
  // Bordure pointillée
  ctx.save();
  ctx.strokeStyle = '#00d4ff';
  ctx.lineWidth   = 2;
  ctx.setLineDash([5, 3]);
  ctx.strokeRect(img.x, img.y, img.w, img.h);
  ctx.setLineDash([]);
  // 4 handles aux coins
  for (const [hx, hy] of Object.values(handlePos(img))) {
    ctx.fillStyle   = '#00d4ff';
    ctx.fillRect(hx - H, hy - H, H * 2, H * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 1.5;
    ctx.strokeRect(hx - H, hy - H, H * 2, H * 2);
  }
  ctx.restore();
}

// ─── Handles ──────────────────────────────────────────────────
function handlePos(img) {
  return {
    nw: [img.x,         img.y],
    ne: [img.x + img.w, img.y],
    sw: [img.x,         img.y + img.h],
    se: [img.x + img.w, img.y + img.h],
  };
}

function hitHandle(x, y, img) {
  for (const [key, [hx, hy]] of Object.entries(handlePos(img))) {
    if (Math.abs(x - hx) <= H + 2 && Math.abs(y - hy) <= H + 2) return key;
  }
  return null;
}

function inImg(x, y, img) {
  return x >= img.x && x <= img.x + img.w && y >= img.y && y <= img.y + img.h;
}

// ─── Resize ───────────────────────────────────────────────────
function doResize(x, y) {
  const img = WB.selectedImg;
  const a   = WB.resizeAnchor;
  const dx  = x - WB.dragOffX;
  const dy  = y - WB.dragOffY;
  const MIN = 20;

  switch (WB.resizeCorner) {
    case 'se':
      img.w = Math.max(MIN, a.w + dx);
      img.h = Math.max(MIN, a.h + dy);
      break;
    case 'sw':
      img.w = Math.max(MIN, a.w - dx);
      img.x = a.x + a.w - img.w;
      img.h = Math.max(MIN, a.h + dy);
      break;
    case 'ne':
      img.w = Math.max(MIN, a.w + dx);
      img.h = Math.max(MIN, a.h - dy);
      img.y = a.y + a.h - img.h;
      break;
    case 'nw':
      img.w = Math.max(MIN, a.w - dx);
      img.x = a.x + a.w - img.w;
      img.h = Math.max(MIN, a.h - dy);
      img.y = a.y + a.h - img.h;
      break;
  }
}

// ─── Curseur ──────────────────────────────────────────────────
function updateCursor(x, y) {
  if (!WB.selectedImg) { WB.imageCanvas.style.cursor = 'default'; return; }
  const h = hitHandle(x, y, WB.selectedImg);
  if (h === 'nw' || h === 'se') WB.imageCanvas.style.cursor = 'nwse-resize';
  else if (h === 'ne' || h === 'sw') WB.imageCanvas.style.cursor = 'nesw-resize';
  else if (inImg(x, y, WB.selectedImg)) WB.imageCanvas.style.cursor = 'move';
  else WB.imageCanvas.style.cursor = 'default';
}

// ─── Historique Undo ──────────────────────────────────────────
function saveToHistory() {
  const entry = {
    // Snapshot pixel du strokeCanvas
    strokeData: WB.sCtx.getImageData(0, 0, WB.strokeCanvas.width, WB.strokeCanvas.height),
    // Copie sérialisable des images (sans l'élément DOM)
    images: WB.images.map(i => ({ id: i.id, el: i.el, x: i.x, y: i.y, w: i.w, h: i.h })),
  };
  WB.history.push(entry);
  if (WB.history.length > WB.MAX_HISTORY) WB.history.shift();
}

function doUndo() {
  if (WB.history.length <= 1) { showToast('⚠️ Rien à annuler.', 1500); return; }
  WB.history.pop(); // retirer l'état courant
  const prev = WB.history[WB.history.length - 1];
  // Restaurer les traits
  WB.sCtx.putImageData(prev.strokeData, 0, 0);
  // Restaurer les images
  WB.images = prev.images.map(i => ({ ...i }));
  WB.selectedImg = null;
  redrawImageLayer();
  showToast('↩️ Annulé.', 1200);
}

// ─── Ajouter une image ────────────────────────────────────────
function wbAddImageFromUrl(url) {
  const el = new Image();
  el.crossOrigin = 'anonymous';
  el.onload = () => {
    const maxW = WB.strokeCanvas.width  * 0.45;
    const maxH = WB.strokeCanvas.height * 0.45;
    const ratio = Math.min(maxW / el.width, maxH / el.height, 1);
    const w = Math.round(el.width  * ratio);
    const h = Math.round(el.height * ratio);
    const x = Math.round((WB.strokeCanvas.width  - w) / 2);
    const y = Math.round((WB.strokeCanvas.height - h) / 2);

    saveToHistory(); // undo point avant ajout
    const imgObj = { id: Date.now(), el, x, y, w, h };
    WB.images.push(imgObj);
    WB.selectedImg = imgObj;
    activateTool('select');
    redrawImageLayer(); // ← seul endroit qui dessine sur imageCanvas
    showToast('✅ Image ajoutée ! Ctrl+Z pour annuler.', 3000);
  };
  el.onerror = () => showToast('❌ Impossible de charger l\'image.', 2000);
  el.src = url;
}

// ─── Charger depuis PC ────────────────────────────────────────
function wbLoadLocalImage(e) {
  const f = e.target.files[0];
  if (!f) return;
  wbAddImageFromUrl(URL.createObjectURL(f));
  e.target.value = '';
}

// ─── Outils ───────────────────────────────────────────────────
function activateTool(tool) {
  WB.tool = tool;
  if (tool !== 'select') {
    WB.selectedImg = null;
    redrawImageLayer();
  }
  WB.imageCanvas.style.cursor = tool === 'select' ? 'default' : 'crosshair';

  // Tip sélection
  document.getElementById('wbSelectTip')?.classList.toggle('hidden', tool !== 'select');

  // Styles boutons
  ['eraserBtn', 'wbSelectBtn'].forEach(id => {
    const b = document.getElementById(id);
    if (b) { b.style.boxShadow = ''; b.style.borderColor = ''; }
  });
  if (tool === 'eraser') {
    const b = document.getElementById('eraserBtn');
    if (b) { b.style.boxShadow = '0 0 10px rgba(0,255,136,0.6)'; b.style.borderColor = '#00ff88'; b.textContent = '✏️ CRAYON'; }
  } else {
    const b = document.getElementById('eraserBtn');
    if (b) b.textContent = '🗑 GOMME';
  }
  if (tool === 'select') {
    const b = document.getElementById('wbSelectBtn');
    if (b) { b.style.boxShadow = '0 0 10px rgba(191,90,242,0.6)'; b.style.borderColor = '#bf5af2'; }
  }
}

// setTool exposé pour le HTML
function setTool(t) { activateTool(t); }
function toggleEraser() { activateTool(WB.tool === 'eraser' ? 'pen' : 'eraser'); }

// ─── Effacer tout ─────────────────────────────────────────────
function clearWhiteboard() {
  saveToHistory();
  WB.sCtx.clearRect(0, 0, WB.strokeCanvas.width, WB.strokeCanvas.height);
  WB.images = []; WB.selectedImg = null;
  redrawImageLayer();
  WB.channel?.send({ type: 'broadcast', event: 'clear', payload: {} });
}

// ─── Export PNG ───────────────────────────────────────────────
function getComposite() {
  const tmp = document.createElement('canvas');
  tmp.width  = WB.strokeCanvas.width;
  tmp.height = WB.strokeCanvas.height;
  const ctx = tmp.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, tmp.width, tmp.height);
  ctx.drawImage(WB.strokeCanvas, 0, 0);
  ctx.drawImage(WB.imageCanvas,  0, 0);
  return tmp;
}

function downloadWhiteboard() {
  const a = document.createElement('a');
  a.download = 'whiteboard_' + Date.now() + '.png';
  a.href = getComposite().toDataURL('image/png');
  a.click();
}

// ─── Sauvegarder dans le workspace ────────────────────────────
async function saveWhiteboardToWorkspace() {
  const { data: folders } = await db.from('workspace_folders').select('id,name,is_locked').order('created_at');
  if (!folders?.length) { showToast('❌ Aucun dossier dans le Workspace.', 2500); return; }

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:400;background:rgba(0,0,0,0.8);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div style="background:#0c0c1a;border:1px solid rgba(0,212,255,0.3);border-radius:14px;padding:28px;max-width:380px;width:90%;text-align:center;">
      <h3 style="font-family:'Press Start 2P',monospace;font-size:11px;color:#00d4ff;margin-bottom:16px;">💾 SAUVEGARDER</h3>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:18px;">
        ${folders.map(f => `
          <button data-fid="${f.id}"
            style="background:rgba(0,212,255,0.06);border:1.5px solid rgba(0,212,255,0.2);color:#e0e0ff;padding:10px 16px;border-radius:8px;font-family:'Orbitron',monospace;font-size:11px;cursor:pointer;display:flex;align-items:center;gap:8px;">
            <span>${f.is_locked ? '🔒' : '📁'}</span><span>${escapeHtml(f.name)}</span>
          </button>`).join('')}
      </div>
      <button onclick="this.closest('[style*=position]').remove()"
        style="background:none;border:1px solid rgba(255,255,255,0.15);color:#666;padding:8px 20px;border-radius:8px;font-family:monospace;font-size:11px;cursor:pointer;">Annuler</button>
    </div>`;
  overlay.querySelectorAll('button[data-fid]').forEach(btn => {
    btn.onclick = () => { overlay.remove(); doSaveWbToFolder(btn.dataset.fid); };
  });
  document.body.appendChild(overlay);
}

async function doSaveWbToFolder(folderId) {
  showToast('⏳ Sauvegarde...', 2000);
  getComposite().toBlob(async blob => {
    const name = `${Date.now()}_whiteboard_${new Date().toISOString().slice(0,10)}.png`;
    const { error } = await db.storage.from('workspace').upload(`${folderId}/${name}`, blob, { contentType: 'image/png' });
    showToast(error ? '❌ ' + error.message : '✅ Whiteboard sauvegardé !', 3000);
  }, 'image/png');
}

// ─── Import depuis workspace ──────────────────────────────────
function importToWhiteboard(url) {
  showSection('whiteboard');
  setTimeout(() => wbAddImageFromUrl(url), 350);
}

// ─── Position dans le canvas ──────────────────────────────────
function getPos(e) {
  const r = WB.imageCanvas.getBoundingClientRect();
  return [
    (e.clientX - r.left) * (WB.imageCanvas.width  / r.width),
    (e.clientY - r.top)  * (WB.imageCanvas.height / r.height),
  ];
}

// ─── Nettoyage ────────────────────────────────────────────────
function cleanupWhiteboard() {
  if (WB.channel) { db.removeChannel(WB.channel); WB.channel = null; }
  document.removeEventListener('paste',   onPaste);
  document.removeEventListener('keydown', onKeyDown);
  WB.initialized = false;
}