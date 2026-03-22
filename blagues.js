// ============================================================
//  blagues.js — Générateur de blagues avec votes
// ============================================================

const BLG = {
  initialized: false,
  current: null,
  index: -1,
  votes: {},       // blague id → score local
  adminBlagues: [], // blagues ajoutées par admin
};

// Base de blagues françaises
const BLAGUES_DB = [
  { id:1,  setup:"Pourquoi l'épouvantail a eu une promotion ?",         punchline:"Parce qu'il était exceptionnel dans son domaine." },
  { id:2,  setup:"Qu'est-ce qu'un canif ?",                            punchline:"Un petit fien !" },
  { id:3,  setup:"Pourquoi les plongeurs plongent-ils toujours en arrière ?", punchline:"Parce que sinon ils tomberaient dans le bateau." },
  { id:4,  setup:"Qu'est-ce qu'un crocodile qui surveille une cour de collège ?", punchline:"Un sac-à-dents !" },
  { id:5,  setup:"Pourquoi l'ordinateur tousse ?",                     punchline:"Il a un virus !" },
  { id:6,  setup:"Comment appelle-t-on un chat tombé dans un pot de peinture le jour de Noël ?", punchline:"Un chat-peint de Noël !" },
  { id:7,  setup:"Qu'est-ce que le Petit Poucet est devenu adulte ?",   punchline:"Un agent de voyages." },
  { id:8,  setup:"Pourquoi les girafes ont-elles un long cou ?",        punchline:"Parce que leurs pieds sentent mauvais." },
  { id:9,  setup:"Qu'est-ce qu'un caniche au 5ème étage ?",             punchline:"Un ascenseur." },
  { id:10, setup:"Quel est le comble pour un géographe ?",              punchline:"De ne pas trouver sa femme." },
  { id:11, setup:"Pourquoi les vaches portent-elles des cloches ?",     punchline:"Parce que leurs cornes ne fonctionnent plus." },
  { id:12, setup:"C'est l'histoire d'une frite qui court dans la rue...", punchline:"Et pourtant elle était cuite !" },
  { id:13, setup:"Qu'est-ce qu'un Martien qui arrive sur Terre ?",      punchline:"Un extra-terrestre. Et quand il repart ? Un partir-terrestre !" },
  { id:14, setup:"Pourquoi le sac à main de la reine d'Angleterre est-il toujours vide ?", punchline:"Parce que c'est la re-in-e !" },
  { id:15, setup:"Qu'est-ce que 1000 avocats au fond de la mer ?",      punchline:"Un bon début." },
  { id:16, setup:"Pourquoi est-ce que les mathématiciens ont du mal à dormir ?", punchline:"Parce qu'ils ont des problèmes." },
  { id:17, setup:"Comment appelle-t-on un chat tout mouillé ?",         punchline:"Un chat-trempé (champ de riz)." },
  { id:18, setup:"Qu'est-ce qu'un Belge qui court après un bus ?",      punchline:"Le premier Belge à l'heure." },
  { id:19, setup:"Quel est le summum de la confiance en soi ?",         punchline:"Se mettre sur liste rouge, puis se chercher dans l'annuaire." },
  { id:20, setup:"Pourquoi Batman ne mange-t-il jamais seul ?",         punchline:"Parce qu'il a toujours un Robin !" },
  { id:21, setup:"C'est quoi la différence entre un prof et une pizza ?", punchline:"La pizza nourrit son homme." },
  { id:22, setup:"Qu'est-ce qu'un bœuf en haut d'un arbre ?",           punchline:"Vache perchée." },
  { id:23, setup:"Pourquoi les poissons vivent-ils dans l'eau salée ?",  punchline:"Parce que le poivre les fait éternuer !" },
  { id:24, setup:"Comment appelle-t-on un chien sans pattes ?",         punchline:"Peu importe, il viendra pas." },
  { id:25, setup:"Quel est le sport préféré des boulangers ?",          punchline:"Le pain-athon." },
];

function initBlagues() {
  if (BLG.initialized) return;
  BLG.initialized = true;

  // Charger votes et blagues admin depuis localStorage
  const savedVotes = localStorage.getItem('ph-blague-votes');
  if (savedVotes) BLG.votes = JSON.parse(savedVotes);

  const savedAdmin = localStorage.getItem('ph-admin-blagues');
  if (savedAdmin) BLG.adminBlagues = JSON.parse(savedAdmin);

  nextBlague();
  renderTopBlagues();
}

function getAllBlagues() {
  return [...BLAGUES_DB, ...BLG.adminBlagues];
}

/* ─── Blague suivante ─── */
function nextBlague() {
  const all = getAllBlagues();
  let newIdx;
  do { newIdx = Math.floor(Math.random() * all.length); }
  while (newIdx === BLG.index && all.length > 1);
  BLG.index = newIdx;
  BLG.current = all[newIdx];
  renderBlague(false);
}

/* ─── Afficher la blague ─── */
function renderBlague(showPunchline = false) {
  const b = BLG.current;
  if (!b) return;

  const score = BLG.votes[b.id] || 0;
  document.getElementById('upvoteCount').textContent   = Math.max(0, score);
  document.getElementById('downvoteCount').textContent = Math.max(0, -score);

  const content = document.getElementById('blagueContent');
  if (!content) return;

  if (showPunchline) {
    content.innerHTML = `
      <div class="text-left w-full">
        <p style="font-family:'Share Tech Mono',monospace; font-size:14px; color:#b0b8e0; margin-bottom:20px; line-height:1.6;">❓ ${escapeHtml(b.setup)}</p>
        <div style="border-top:1px solid rgba(255,214,10,0.2); padding-top:16px;">
          <p style="font-family:'Orbitron',monospace; font-size:15px; font-weight:700; color:#ffd60a; line-height:1.5;">💡 ${escapeHtml(b.punchline)}</p>
        </div>
      </div>`;
  } else {
    content.innerHTML = `
      <div class="text-center w-full">
        <p style="font-family:'Share Tech Mono',monospace; font-size:14px; color:#b0b8e0; line-height:1.6; margin-bottom:20px;">❓ ${escapeHtml(b.setup)}</p>
        <button onclick="revealPunchline()" class="btn-neon btn-neon-yellow px-5 py-2.5 font-pixel text-[9px] tracking-widest">
          VOIR LA CHUTE 👁️
        </button>
      </div>`;
  }
}

function revealPunchline() {
  renderBlague(true);
}

/* ─── Vote ─── */
function voteBlague(val) {
  if (!BLG.current) return;
  const id = BLG.current.id;
  BLG.votes[id] = (BLG.votes[id] || 0) + val;
  localStorage.setItem('ph-blague-votes', JSON.stringify(BLG.votes));
  // Mettre à jour les compteurs
  const score = BLG.votes[id];
  document.getElementById('upvoteCount').textContent   = Math.max(0, score);
  document.getElementById('downvoteCount').textContent = Math.max(0, -score);
  showToast(val > 0 ? '👍 +1' : '👎 -1', 1200);
  renderTopBlagues();
}

/* ─── Partager dans le chat ─── */
function shareBlagueToChat() {
  if (!BLG.current) return;
  sendBlagueToChat(BLG.current.setup, BLG.current.punchline);
}

/* ─── Top blagues ─── */
function renderTopBlagues() {
  const container = document.getElementById('blagueTopList');
  if (!container) return;

  const all = getAllBlagues();
  const scored = all
    .map(b => ({ ...b, score: BLG.votes[b.id] || 0 }))
    .filter(b => b.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (scored.length === 0) {
    container.innerHTML = `<p class="font-mono text-xs text-[#3a4060]">Votez sur des blagues pour les voir apparaître ici !</p>`;
    return;
  }

  container.innerHTML = scored.map((b, i) => `
    <div style="display:flex; align-items:flex-start; gap:14px; padding:14px 16px; border-bottom:1px solid rgba(255,255,255,0.05); background:rgba(255,255,255,0.02); border-radius:10px; margin-bottom:4px;">
      <span style="font-size:22px; flex-shrink:0; padding-top:2px;">${i===0?'🥇':i===1?'🥈':'🥉'}</span>
      <div style="flex:1; min-width:0;">
        <p style="font-family:'Share Tech Mono',monospace; font-size:13px; color:#b0b8e0; margin-bottom:6px; line-height:1.5;">${escapeHtml(b.setup)}</p>
        <p style="font-family:'Orbitron',monospace; font-size:12px; font-weight:700; color:#ffd60a; line-height:1.4;">${escapeHtml(b.punchline)}</p>
      </div>
      <span style="font-family:'Press Start 2P',monospace; font-size:11px; color:#00ff88; flex-shrink:0; padding-top:4px;">+${b.score}</span>
    </div>`).join('');
}

/* ─── Ajouter blague admin ─── */
function addAdminBlague() {
  const setup     = document.getElementById('blagueAdminSetup')?.value.trim();
  const punchline = document.getElementById('blagueAdminPunchline')?.value.trim();
  if (!setup || !punchline) { showToast('⚠️ Remplis les deux champs.', 2000); return; }

  const newBlague = { id: 'admin_' + Date.now(), setup, punchline };
  BLG.adminBlagues.push(newBlague);
  localStorage.setItem('ph-admin-blagues', JSON.stringify(BLG.adminBlagues));

  document.getElementById('blagueAdminSetup').value = '';
  document.getElementById('blagueAdminPunchline').value = '';

  showToast('😂 Blague ajoutée !', 2000);
  BLG.current = newBlague;
  BLG.index = getAllBlagues().length - 1;
  renderBlague(true);
}