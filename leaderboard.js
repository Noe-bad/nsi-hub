// ============================================================
//  leaderboard.js — Classement global + temps réel
// ============================================================

let lbChannel = null;
let lbAutoRefresh = null;

async function initLeaderboard() {
  await refreshLeaderboard();
  startLBRealtime();
  startLBAutoRefresh();
}

async function refreshLeaderboard() {
  const tbody = document.getElementById('leaderboardBody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="4" class="text-center py-6 font-mono text-xs animate-pulse" style="color:#3a4060">Chargement...</td></tr>`;

  const { data, error } = await db
    .from('scores')
    .select('username, score, created_at')
    .order('score', { ascending: false })
    .limit(10);

  if (error) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4 font-mono text-xs" style="color:#ff2d78">Erreur : ${escapeHtml(error.message)}</td></tr>`;
    return;
  }
  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center py-8 font-mono text-xs" style="color:#3a4060">Aucun score pour l'instant. Sois le premier !</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map((row, i) => {
    const rank = i + 1;
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
    const scoreColor = rank === 1 ? '#ffd60a' : rank <= 3 ? '#00d4ff' : '#00ff88';
    const rowBg = rank <= 3 ? 'background:rgba(0,212,255,0.04);' : '';
    const date = new Date(row.created_at).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'2-digit' });
    return `<tr style="${rowBg}border-bottom:1px solid rgba(255,255,255,0.04)">
      <td class="py-3 px-3 text-center text-lg">${medal}</td>
      <td class="py-3 px-3 font-bold font-mono text-sm" style="color:#e0e0ff">${escapeHtml(row.username)}</td>
      <td class="py-3 px-3 text-right font-pixel text-sm" style="color:${scoreColor}">${row.score.toLocaleString()}</td>
      <td class="py-3 px-3 text-right font-mono text-xs" style="color:#4a5580">${date}</td>
    </tr>`;
  }).join('');
}

function startLBRealtime() {
  if (lbChannel) db.removeChannel(lbChannel);
  lbChannel = db.channel('leaderboard-realtime')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'scores' }, (payload) => {
      refreshLeaderboard();
      showToast(`🏆 ${escapeHtml(payload.new.username)} : ${payload.new.score} pts !`);
    })
    .subscribe();
}

function startLBAutoRefresh() {
  if (lbAutoRefresh) clearInterval(lbAutoRefresh);
  lbAutoRefresh = setInterval(refreshLeaderboard, 10000);
}

function cleanupLeaderboard() {
  if (lbChannel) { db.removeChannel(lbChannel); lbChannel = null; }
  if (lbAutoRefresh) { clearInterval(lbAutoRefresh); lbAutoRefresh = null; }
}
