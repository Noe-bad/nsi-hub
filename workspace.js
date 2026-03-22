// ============================================================
//  workspace.js — Espace de travail v2
//  Dossiers navigables, sélection fichiers, verrou par code
// ============================================================

const WS = {
  initialized: false,
  folders:     [],
  currentFolder: null,  // { id, name, is_locked, lock_code } | null = racine
  selectedFile: null,   // { name, url, ext }
  pendingFiles: [],
};

const BUCKET = 'workspace';

// ─── Init ────────────────────────────────────────────────────
async function initWorkspace() {
  if (WS.initialized) { await renderRoot(); return; }
  WS.initialized = true;
  await renderRoot();
}

// ─── Afficher la racine (liste des dossiers) ─────────────────
async function renderRoot() {
  WS.currentFolder = null;
  WS.selectedFile  = null;
  const root = document.getElementById('travailRoot');
  if (!root) return;

  root.innerHTML = `<p class="font-mono text-xs animate-pulse" style="color:#3a4060">Chargement...</p>`;

  const { data: folders, error } = await db
    .from('workspace_folders')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) { root.innerHTML = `<p class="font-mono text-xs" style="color:#ff2d78">Erreur : ${escapeHtml(error.message)}</p>`; return; }

  WS.folders = folders || [];

  if (WS.folders.length === 0) {
    root.innerHTML = `
      <div class="card text-center py-12" style="border-color:rgba(0,212,255,0.1);">
        <div style="font-size:52px; margin-bottom:12px;">📂</div>
        <p class="font-mono text-sm" style="color:#4a5580">Aucun dossier pour l'instant.</p>
        ${AppState.isAdmin && AppState.adminMode
          ? '<p class="font-mono text-xs mt-2" style="color:#3a4060">Crée un dossier avec la barre ci-dessus !</p>'
          : '<p class="font-mono text-xs mt-2" style="color:#3a4060">Attends qu\'un admin crée un dossier.</p>'}
      </div>`;
    return;
  }

  // Grille de dossiers
  root.innerHTML = '<div id="folderGrid" style="display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:14px;"></div>';
  const grid = document.getElementById('folderGrid');
  WS.folders.forEach(f => grid.appendChild(buildFolderTile(f)));
}

// ─── Tuile d'un dossier ──────────────────────────────────────
function buildFolderTile(folder) {
  const tile = document.createElement('div');
  tile.className = 'ws-folder-tile';
  tile.style.cssText = `
    background: rgba(0,212,255,0.04);
    border: 1.5px solid rgba(0,212,255,0.18);
    border-radius: 12px;
    padding: 18px 12px 14px;
    text-align: center;
    cursor: pointer;
    transition: all 0.15s;
    position: relative;
    user-select: none;
  `;
  tile.onmouseenter = () => { tile.style.borderColor='rgba(0,212,255,0.55)'; tile.style.background='rgba(0,212,255,0.08)'; };
  tile.onmouseleave = () => { tile.style.borderColor='rgba(0,212,255,0.18)'; tile.style.background='rgba(0,212,255,0.04)'; };

  const icon = folder.is_locked ? '🔒' : '📁';
  tile.innerHTML = `
    <div style="font-size:40px; margin-bottom:10px; line-height:1;">${icon}</div>
    <div style="font-family:'Orbitron',monospace; font-size:11px; font-weight:700; color:#e0e0ff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(folder.name)}</div>
    ${folder.is_locked ? '<div style="font-family:monospace; font-size:9px; color:#ffd60a; margin-top:4px;">🔐 Verrouillé</div>' : ''}
    ${AppState.isAdmin && AppState.adminMode
      ? `<button onclick="event.stopPropagation(); deleteFolderConfirm('${folder.id}','${escapeHtml(folder.name)}')"
           style="position:absolute; top:6px; right:6px; background:rgba(255,45,120,0.15); border:1px solid rgba(255,45,120,0.3); color:#ff2d78; border-radius:6px; width:22px; height:22px; font-size:11px; cursor:pointer; display:flex; align-items:center; justify-content:center; line-height:1;">🗑</button>`
      : ''}`;

  // Double-clic pour ouvrir
  tile.addEventListener('dblclick', () => openFolder(folder));
  // Simple clic aussi (pour mobile)
  tile.onclick = (e) => { if (!e.target.closest('button')) openFolder(folder); };
  return tile;
}

// ─── Ouvrir un dossier ───────────────────────────────────────
async function openFolder(folder) {
  // Si verrouillé et pas admin
  if (folder.is_locked && !(AppState.isAdmin && AppState.adminMode)) {
    const code = prompt(`🔐 Ce dossier est verrouillé.\nSaisis le code d'accès :`);
    if (code === null) return;
    if (code.trim() !== folder.lock_code) { showToast('❌ Code incorrect.', 2000); return; }
  }

  WS.currentFolder = folder;
  WS.selectedFile  = null;
  await renderFolderContents(folder);
}

// ─── Afficher le contenu d'un dossier ────────────────────────
async function renderFolderContents(folder) {
  const root = document.getElementById('travailRoot');
  if (!root) return;

  root.innerHTML = `<p class="font-mono text-xs animate-pulse" style="color:#3a4060">Chargement...</p>`;

  const { data: files, error } = await db.storage
    .from(BUCKET)
    .list(folder.id + '/', { sortBy: { column: 'created_at', order: 'desc' } });

  const realFiles = (files || []).filter(f => f.name !== '.emptyFolderPlaceholder');

  root.innerHTML = `
    <!-- Fil d'ariane + boutons -->
    <div style="display:flex; align-items:center; gap:12px; margin-bottom:18px; flex-wrap:wrap;">
      <button onclick="renderRoot()" style="background:none; border:1px solid rgba(0,212,255,0.2); color:#00d4ff; padding:6px 12px; border-radius:8px; font-family:'Share Tech Mono',monospace; font-size:11px; cursor:pointer;">
        ← Dossiers
      </button>
      <span style="font-size:18px;">${folder.is_locked ? '🔒' : '📁'}</span>
      <span style="font-family:'Orbitron',monospace; font-weight:700; font-size:14px; color:#e0e0ff;">${escapeHtml(folder.name)}</span>
      <div style="margin-left:auto; display:flex; gap:8px; flex-wrap:wrap;">
        <button onclick="openUploadModal('${folder.id}','${escapeHtml(folder.name)}')"
          style="background:linear-gradient(135deg,#00d4ff22,#00ff8822); border:1.5px solid rgba(0,255,136,0.4); color:#00ff88; padding:8px 16px; border-radius:8px; font-family:'Press Start 2P',monospace; font-size:9px; cursor:pointer;"
          onmouseenter="this.style.background='rgba(0,255,136,0.15)'"
          onmouseleave="this.style.background='linear-gradient(135deg,#00d4ff22,#00ff8822)'">
          ⬆️ DÉPOSER
        </button>
        ${AppState.isAdmin && AppState.adminMode ? `
        <button onclick="deleteFolderConfirm('${folder.id}','${escapeHtml(folder.name)}')"
          style="background:rgba(255,45,120,0.12); border:1.5px solid rgba(255,45,120,0.4); color:#ff2d78; padding:8px 16px; border-radius:8px; font-family:'Press Start 2P',monospace; font-size:9px; cursor:pointer;"
          onmouseenter="this.style.background='rgba(255,45,120,0.25)'"
          onmouseleave="this.style.background='rgba(255,45,120,0.12)'">
          🗑 SUPPRIMER LE DOSSIER
        </button>` : ''}
      </div>
    </div>

    <!-- Barre d'actions sur sélection (cachée par défaut) -->
    <div id="wsActionBar" class="hidden" style="display:none; align-items:center; gap:10px; margin-bottom:14px; padding:10px 14px; background:rgba(0,212,255,0.06); border:1px solid rgba(0,212,255,0.25); border-radius:10px; flex-wrap:wrap;">
      <span id="wsSelectedName" style="font-family:'Share Tech Mono',monospace; font-size:12px; color:#00d4ff; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"></span>
      <button onclick="wsBtnDownload()" style="background:#00d4ff; color:#000; border:none; padding:8px 16px; border-radius:8px; font-family:'Orbitron',monospace; font-weight:700; font-size:11px; cursor:pointer;">⬇️ ENREGISTRER</button>
      <button onclick="wsBtnCopyUrl()" style="background:#00ff88; color:#000; border:none; padding:8px 16px; border-radius:8px; font-family:'Orbitron',monospace; font-weight:700; font-size:11px; cursor:pointer;">📋 COPIER LIEN</button>
      <button id="wsEditBtn" onclick="wsBtnEditWhiteboard()" style="background:#bf5af2; color:#fff; border:none; padding:8px 16px; border-radius:8px; font-family:'Orbitron',monospace; font-weight:700; font-size:11px; cursor:pointer; display:none;">📝 WHITEBOARD</button>
      <button onclick="wsBtnDelete()" style="background:#ff2d78; color:#fff; border:none; padding:8px 16px; border-radius:8px; font-family:'Orbitron',monospace; font-weight:700; font-size:11px; cursor:pointer;">🗑 SUPPRIMER</button>
      <button onclick="clearWsSelection()" style="background:rgba(255,255,255,0.08); color:#aaa; border:1px solid rgba(255,255,255,0.15); padding:8px 12px; border-radius:8px; font-family:monospace; font-size:11px; cursor:pointer;">✕</button>
    </div>

    <!-- Grille fichiers -->
    <div id="wsFilesGrid" style="display:grid; grid-template-columns:repeat(auto-fill,minmax(130px,1fr)); gap:12px;"></div>
    ${error ? `<p class="font-mono text-xs mt-3" style="color:#ff2d78">Erreur chargement : ${escapeHtml(error.message)}</p>` : ''}
    ${!error && realFiles.length === 0 ? `
      <div style="text-align:center; padding:48px 0; color:#3a4060; font-family:'Share Tech Mono',monospace; font-size:12px;">
        <div style="font-size:44px; margin-bottom:10px;">📭</div>
        Dossier vide — dépose des fichiers !
      </div>` : ''}`;

  if (!error && realFiles.length > 0) {
    const grid = document.getElementById('wsFilesGrid');
    realFiles.forEach(file => {
      const { data } = db.storage.from(BUCKET).getPublicUrl(`${folder.id}/${file.name}`);
      grid.appendChild(buildFileTile(file, data.publicUrl, folder.id));
    });
  }
}

// ─── Tuile d'un fichier ──────────────────────────────────────
function buildFileTile(file, url, folderId) {
  const ext    = file.name.split('.').pop().toLowerCase();
  const isImg  = ['jpg','jpeg','png','gif','webp','svg','bmp'].includes(ext);
  const sizeKb = file.metadata?.size ? Math.round(file.metadata.size / 1024) : null;

  // Nom d'affichage sans timestamp
  const displayName = file.name.replace(/^\d+_/, '');
  const shortName   = displayName.length > 18 ? displayName.slice(0, 16) + '…' : displayName;

  const tile = document.createElement('div');
  tile.dataset.fileName = file.name;
  tile.dataset.fileUrl  = url;
  tile.dataset.fileExt  = ext;
  tile.dataset.isImg    = isImg;
  tile.style.cssText = `
    background: rgba(0,0,0,0.3);
    border: 2px solid rgba(0,212,255,0.12);
    border-radius: 10px;
    padding: 10px 8px 8px;
    display: flex; flex-direction: column; align-items: center; gap: 6px;
    cursor: pointer; transition: all 0.15s; position: relative;
    user-select: none;
  `;

  const preview = isImg
    ? `<img src="${url}" style="width:90px; height:68px; object-fit:cover; border-radius:6px;" loading="lazy">`
    : `<div style="font-size:40px; line-height:1;">${fileIcon(ext)}</div>`;

  tile.innerHTML = `
    ${preview}
    <span style="font-family:'Share Tech Mono',monospace; font-size:10px; color:#b0b8e0; text-align:center; word-break:break-all; line-height:1.3;">${escapeHtml(shortName)}</span>
    ${sizeKb ? `<span style="font-family:monospace; font-size:9px; color:#3a4060;">${sizeKb > 1024 ? (sizeKb/1024).toFixed(1)+' Mo' : sizeKb+' Ko'}</span>` : ''}`;

  tile.onmouseenter = () => { if (!tile.classList.contains('ws-selected')) tile.style.borderColor='rgba(0,212,255,0.4)'; };
  tile.onmouseleave = () => { if (!tile.classList.contains('ws-selected')) tile.style.borderColor='rgba(0,212,255,0.12)'; };

  // Clic = sélectionner
  tile.addEventListener('click', () => selectWsFile(tile, file.name, url, ext, isImg, folderId));
  // Double-clic image = visionneuse
  if (isImg) tile.addEventListener('dblclick', () => openImageViewer(url));

  return tile;
}

function fileIcon(ext) {
  if (['jpg','jpeg','png','gif','webp','svg'].includes(ext)) return '🖼️';
  if (ext === 'pdf') return '📄';
  if (['doc','docx'].includes(ext)) return '📝';
  if (['xls','xlsx'].includes(ext)) return '📊';
  if (['zip','rar','7z'].includes(ext)) return '📦';
  if (['mp4','mov','avi','mkv'].includes(ext)) return '🎬';
  if (['mp3','wav','ogg'].includes(ext)) return '🎵';
  return '📎';
}

// ─── Sélection fichier ────────────────────────────────────────
function selectWsFile(tile, fileName, url, ext, isImg, folderId) {
  // Désélectionner l'ancien
  document.querySelectorAll('.ws-selected').forEach(t => {
    t.classList.remove('ws-selected');
    t.style.borderColor = 'rgba(0,212,255,0.12)';
    t.style.background  = 'rgba(0,0,0,0.3)';
  });

  tile.classList.add('ws-selected');
  tile.style.borderColor = '#00d4ff';
  tile.style.background  = 'rgba(0,212,255,0.1)';

  WS.selectedFile = { name: fileName, url, ext, isImg, folderId };

  // Afficher la barre d'actions
  const bar = document.getElementById('wsActionBar');
  if (bar) {
    bar.style.display = 'flex';
    bar.classList.remove('hidden');
    document.getElementById('wsSelectedName').textContent = fileName.replace(/^\d+_/, '');
    // Bouton whiteboard seulement pour les images
    const editBtn = document.getElementById('wsEditBtn');
    if (editBtn) editBtn.style.display = isImg ? 'block' : 'none';
  }
}

function clearWsSelection() {
  document.querySelectorAll('.ws-selected').forEach(t => {
    t.classList.remove('ws-selected');
    t.style.borderColor = 'rgba(0,212,255,0.12)';
    t.style.background  = 'rgba(0,0,0,0.3)';
  });
  WS.selectedFile = null;
  const bar = document.getElementById('wsActionBar');
  if (bar) { bar.style.display = 'none'; bar.classList.add('hidden'); }
}

// ─── Boutons de la barre d'actions ───────────────────────────
function wsBtnDownload() {
  if (!WS.selectedFile) return;
  const a = document.createElement('a');
  a.href = WS.selectedFile.url;
  a.download = WS.selectedFile.name.replace(/^\d+_/, '');
  a.target = '_blank';
  a.click();
}

function wsBtnCopyUrl() {
  if (!WS.selectedFile) return;
  navigator.clipboard.writeText(WS.selectedFile.url).then(() => showToast('📋 Lien copié !', 2000));
}

function wsBtnEditWhiteboard() {
  if (!WS.selectedFile || !WS.selectedFile.isImg) return;
  importToWhiteboard(WS.selectedFile.url);
}

async function wsBtnDelete() {
  if (!WS.selectedFile) return;
  if (!AppState.isAdmin && !AppState.adminMode) { showToast('🔒 Réservé aux admins.', 2000); return; }
  if (!confirm(`Supprimer "${WS.selectedFile.name.replace(/^\d+_/,'')}" ?`)) return;
  await db.storage.from(BUCKET).remove([`${WS.selectedFile.folderId}/${WS.selectedFile.name}`]);
  showToast('🗑 Fichier supprimé.', 2000);
  clearWsSelection();
  renderFolderContents(WS.currentFolder);
}

// ─── Admin : créer un dossier ─────────────────────────────────
async function createFolder() {
  if (!AppState.isAdmin || !AppState.adminMode) return;
  const input    = document.getElementById('newFolderName');
  const lockCheck = document.getElementById('folderLockCheck');
  const lockInput = document.getElementById('folderLockCode');
  const name = input?.value.trim();
  if (!name) { showToast('⚠️ Saisis un nom.', 2000); return; }

  const isLocked = lockCheck?.checked || false;
  const lockCode = isLocked ? lockInput?.value.trim() : null;
  if (isLocked && (!lockCode || lockCode.length < 2)) {
    showToast('⚠️ Saisis un code de verrouillage (min 2 caractères).', 2500); return;
  }

  const { data, error } = await db.from('workspace_folders')
    .insert({ name, created_by: AppState.username, is_locked: isLocked, lock_code: lockCode })
    .select().single();

  if (error) { showToast('❌ ' + error.message, 3000); return; }

  // Placeholder Storage
  await db.storage.from(BUCKET).upload(
    `${data.id}/.emptyFolderPlaceholder`,
    new Blob([''], { type: 'text/plain' }), { upsert: true }
  );

  if (input) input.value = '';
  if (lockInput) lockInput.value = '';
  if (lockCheck) lockCheck.checked = false;
  toggleLockFields();
  showToast(`📁 Dossier "${name}" créé !`, 2000);
  renderRoot();
}

function toggleLockFields() {
  const check = document.getElementById('folderLockCheck');
  const codeRow = document.getElementById('lockCodeRow');
  if (codeRow) codeRow.style.display = check?.checked ? 'flex' : 'none';
}

async function deleteFolderConfirm(folderId, folderName) {
  if (!AppState.isAdmin || !AppState.adminMode) return;
  if (!confirm(`Supprimer le dossier "${folderName}" et tous ses fichiers ?`)) return;
  const { data: files } = await db.storage.from(BUCKET).list(folderId + '/');
  if (files?.length) await db.storage.from(BUCKET).remove(files.map(f => `${folderId}/${f.name}`));
  await db.from('workspace_folders').delete().eq('id', folderId);
  showToast('🗑 Dossier supprimé.', 2000);
  renderRoot();
}

// ─── Modal upload ─────────────────────────────────────────────
function openUploadModal(folderId, folderName) {
  WS.currentFolder = WS.currentFolder || { id: folderId, name: folderName };
  WS.pendingFiles  = [];
  document.getElementById('uploadFolderName').textContent = folderName;
  document.getElementById('uploadQueue').innerHTML = '';
  document.getElementById('uploadProgress').classList.add('hidden');
  document.getElementById('uploadModal').classList.remove('hidden');
}

function closeUploadModal() {
  document.getElementById('uploadModal').classList.add('hidden');
  WS.pendingFiles = [];
}

function handleFileSelect(e) { addFilesToQueue([...e.target.files]); e.target.value = ''; }
function handleFileDrop(e) {
  e.preventDefault();
  document.getElementById('dropZone').style.borderColor = 'rgba(0,212,255,0.3)';
  addFilesToQueue([...e.dataTransfer.files]);
}

function addFilesToQueue(files) {
  files.forEach(f => { if (!WS.pendingFiles.find(p => p.name === f.name)) WS.pendingFiles.push(f); });
  renderUploadQueue();
}

function renderUploadQueue() {
  const q = document.getElementById('uploadQueue');
  if (!q) return;
  q.innerHTML = WS.pendingFiles.map((f, i) => {
    const ext = f.name.split('.').pop().toLowerCase();
    const size = f.size > 1024*1024 ? `${(f.size/1024/1024).toFixed(1)} Mo` : `${Math.round(f.size/1024)} Ko`;
    return `<div style="display:flex; align-items:center; gap:8px; padding:6px 8px; background:rgba(0,212,255,0.04); border-radius:8px;">
      <span>${fileIcon(ext)}</span>
      <span style="font-family:'Share Tech Mono',monospace; font-size:11px; color:#b0b8e0; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(f.name)}</span>
      <span style="font-family:monospace; font-size:10px; color:#4a5580;">${size}</span>
      <button onclick="WS.pendingFiles.splice(${i},1);renderUploadQueue();" style="background:none;border:none;color:#ff2d78;cursor:pointer;font-size:13px;">✕</button>
    </div>`;
  }).join('');
}

async function uploadFiles() {
  if (!WS.currentFolder || WS.pendingFiles.length === 0) { showToast('⚠️ Sélectionne des fichiers.', 2000); return; }
  const btn = document.getElementById('uploadBtn');
  const progress = document.getElementById('uploadProgress');
  const bar = document.getElementById('uploadProgressBar');
  const txt = document.getElementById('uploadProgressText');
  btn.disabled = true;
  progress.classList.remove('hidden');
  let done = 0;
  for (const file of WS.pendingFiles) {
    const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    txt.textContent = `Envoi de ${file.name}...`;
    const { error } = await db.storage.from(BUCKET).upload(
      `${WS.currentFolder.id}/${safeName}`, file,
      { cacheControl: '3600', upsert: false, contentType: file.type || 'application/octet-stream' }
    );
    if (error) showToast(`❌ ${file.name} : ${error.message}`, 2000);
    done++;
    bar.style.width = `${(done / WS.pendingFiles.length) * 100}%`;
  }
  txt.textContent = `✅ ${done} fichier${done > 1 ? 's' : ''} envoyé${done > 1 ? 's' : ''} !`;
  btn.disabled = false;
  WS.pendingFiles = [];
  setTimeout(() => { closeUploadModal(); renderFolderContents(WS.currentFolder); }, 900);
}

// ─── Sauvegarder le whiteboard dans un dossier ───────────────
async function saveWhiteboardToWorkspace() {
  if (!WB.canvas) { showToast('❌ Whiteboard non initialisé.', 2000); return; }

  // Charger les dossiers
  const { data: folders } = await db.from('workspace_folders').select('id, name, is_locked').order('created_at');
  if (!folders || folders.length === 0) { showToast('❌ Aucun dossier disponible dans le Workspace.', 2500); return; }

  // Popup de sélection de dossier
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:400;background:rgba(0,0,0,0.8);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div style="background:#0c0c1a;border:1px solid rgba(0,212,255,0.3);border-radius:14px;padding:28px;max-width:380px;width:90%;text-align:center;">
      <h3 style="font-family:'Press Start 2P',monospace;font-size:11px;color:#00d4ff;margin-bottom:16px;">💾 SAUVEGARDER LE WHITEBOARD</h3>
      <p style="font-family:'Share Tech Mono',monospace;font-size:11px;color:#6070a0;margin-bottom:16px;">Choisir le dossier de destination :</p>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:18px;">
        ${folders.map(f => `
          <button onclick="doSaveWbToFolder('${f.id}', this.closest('[data-overlay]'))" data-folder-id="${f.id}"
            style="background:rgba(0,212,255,0.06);border:1.5px solid rgba(0,212,255,0.2);color:#e0e0ff;padding:10px 16px;border-radius:8px;font-family:'Orbitron',monospace;font-size:11px;cursor:pointer;text-align:left;display:flex;align-items:center;gap:8px;transition:all 0.15s;"
            onmouseenter="this.style.borderColor='#00d4ff';this.style.background='rgba(0,212,255,0.12)'"
            onmouseleave="this.style.borderColor='rgba(0,212,255,0.2)';this.style.background='rgba(0,212,255,0.06)'">
            <span>${f.is_locked ? '🔒' : '📁'}</span><span>${escapeHtml(f.name)}</span>
          </button>`).join('')}
      </div>
      <button onclick="this.closest('[style*=\"position:fixed\"]').remove()"
        style="background:none;border:1px solid rgba(255,255,255,0.15);color:#666;padding:8px 20px;border-radius:8px;font-family:monospace;font-size:11px;cursor:pointer;">
        Annuler
      </button>
    </div>`;
  overlay.setAttribute('data-overlay', '1');
  document.body.appendChild(overlay);
  // Passer l'overlay aux boutons
  overlay.querySelectorAll('button[data-folder-id]').forEach(btn => {
    btn.onclick = () => { doSaveWbToFolder(btn.dataset.folderId, overlay); };
  });
}

async function doSaveWbToFolder(folderId, overlay) {
  overlay?.remove();
  showToast('⏳ Sauvegarde en cours...', 2000);

  WB.canvas.toBlob(async (blob) => {
    const fileName = `whiteboard_${new Date().toISOString().slice(0,19).replace(/[T:]/g,'_')}.png`;
    const safeName = `${Date.now()}_${fileName}`;
    const { error } = await db.storage.from(BUCKET).upload(
      `${folderId}/${safeName}`, blob,
      { contentType: 'image/png', cacheControl: '3600' }
    );
    if (error) { showToast('❌ Erreur : ' + error.message, 3000); return; }
    showToast('✅ Whiteboard sauvegardé dans le dossier !', 3000);
  }, 'image/png');
}

// ─── Visionneuse image ────────────────────────────────────────
function openImageViewer(url) {
  const viewer = document.getElementById('imageViewer');
  const img    = document.getElementById('imageViewerImg');
  if (!viewer || !img) return;
  img.src = url;
  viewer.classList.remove('hidden');
}

function closeImageViewer() {
  document.getElementById('imageViewer')?.classList.add('hidden');
  document.getElementById('imageViewerImg').src = '';
}

// ─── Importer une image dans le whiteboard ───────────────────
function importToWhiteboard(url) {
  showSection('whiteboard');
  setTimeout(() => {
    if (!WB.canvas || !WB.ctx) { showToast('❌ Whiteboard non initialisé.', 2000); return; }
    wbAddImageFromUrl(url);
  }, 350);
}

// ─── Ouvrir la modale de sélection de fichier du workspace depuis le WB ─
async function openWsPickerForWhiteboard() {
  const { data: folders } = await db.from('workspace_folders').select('id,name,is_locked,lock_code').order('created_at');
  if (!folders || folders.length === 0) { showToast('❌ Aucun dossier dans le Workspace.', 2500); return; }

  const overlay = document.createElement('div');
  overlay.id = 'wsPicker';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:400;background:rgba(0,0,0,0.85);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div style="background:#0c0c1a;border:1px solid rgba(0,212,255,0.3);border-radius:14px;padding:24px;max-width:540px;width:92%;max-height:80vh;overflow-y:auto;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <h3 style="font-family:'Press Start 2P',monospace;font-size:10px;color:#00d4ff;">📂 IMPORTER DEPUIS LE WORKSPACE</h3>
        <button onclick="document.getElementById('wsPicker').remove()" style="background:none;border:none;color:#4a5580;font-size:20px;cursor:pointer;line-height:1;">✕</button>
      </div>
      <div id="wsPickerContent"></div>
    </div>`;
  document.body.appendChild(overlay);
  renderWsPickerFolders(folders);
}

function renderWsPickerFolders(folders) {
  const content = document.getElementById('wsPickerContent');
  if (!content) return;
  content.innerHTML = `
    <p style="font-family:'Share Tech Mono',monospace;font-size:11px;color:#4a5580;margin-bottom:12px;">Choisis un dossier :</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;">
      ${folders.map(f => `
        <div onclick="wsPickerOpenFolder('${f.id}','${escapeHtml(f.name)}',${f.is_locked},'${f.lock_code||''}')"
          style="background:rgba(0,212,255,0.05);border:1.5px solid rgba(0,212,255,0.18);border-radius:10px;padding:14px 10px;text-align:center;cursor:pointer;transition:all 0.15s;"
          onmouseenter="this.style.borderColor='#00d4ff';this.style.background='rgba(0,212,255,0.1)'"
          onmouseleave="this.style.borderColor='rgba(0,212,255,0.18)';this.style.background='rgba(0,212,255,0.05)'">
          <div style="font-size:32px;margin-bottom:8px;">${f.is_locked ? '🔒' : '📁'}</div>
          <div style="font-family:'Orbitron',monospace;font-size:10px;font-weight:700;color:#e0e0ff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(f.name)}</div>
        </div>`).join('')}
    </div>`;
}

async function wsPickerOpenFolder(folderId, folderName, isLocked, lockCode) {
  if (isLocked && !(AppState.isAdmin && AppState.adminMode)) {
    const code = prompt(`🔐 Code d'accès pour "${folderName}" :`);
    if (code === null) return;
    if (code.trim() !== lockCode) { showToast('❌ Code incorrect.', 2000); return; }
  }

  const content = document.getElementById('wsPickerContent');
  content.innerHTML = `<p class="font-mono text-xs animate-pulse" style="color:#3a4060">Chargement...</p>`;

  const { data: files } = await db.storage.from(BUCKET).list(folderId + '/', { sortBy: { column: 'created_at', order: 'desc' } });
  const imgs = (files || []).filter(f => {
    const ext = f.name.split('.').pop().toLowerCase();
    return ['jpg','jpeg','png','gif','webp','svg','bmp'].includes(ext);
  });

  if (imgs.length === 0) {
    content.innerHTML = `<p style="font-family:'Share Tech Mono',monospace;font-size:11px;color:#4a5580;text-align:center;padding:24px;">Aucune image dans ce dossier.</p>`;
    return;
  }

  content.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
      <span style="font-family:'Orbitron',monospace;font-size:12px;font-weight:700;color:#e0e0ff;">📁 ${escapeHtml(folderName)}</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px;">
      ${imgs.map(f => {
        const { data } = db.storage.from(BUCKET).getPublicUrl(`${folderId}/${f.name}`);
        const url = data.publicUrl;
        const dName = f.name.replace(/^\d+_/,'');
        return `<div onclick="document.getElementById('wsPicker').remove(); importToWhiteboard('${url}')"
          style="cursor:pointer;border:1.5px solid rgba(0,212,255,0.15);border-radius:8px;overflow:hidden;transition:all 0.15s;"
          onmouseenter="this.style.borderColor='#00d4ff'"
          onmouseleave="this.style.borderColor='rgba(0,212,255,0.15)'">
          <img src="${url}" style="width:100%;height:80px;object-fit:cover;display:block;" loading="lazy">
          <div style="padding:4px 6px;font-family:'Share Tech Mono',monospace;font-size:9px;color:#6070a0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(dName)}</div>
        </div>`;
      }).join('')}
    </div>`;
}