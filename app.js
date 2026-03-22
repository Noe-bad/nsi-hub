// ================================================================
// app.js — Auth, routing SPA, mode admin, utilitaires globaux
// ================================================================

// État global de l'application (accessible par tous les modules)
const AppState = {
  user:       null,
  username:   null,
  isAdmin:    false,   // Vrai uniquement si l'email est dans ADMIN_EMAILS
  adminMode:  false,   // Mode admin actif/inactif (toggle par l'admin)
  currentSection: 'snake',
};

// ================================================================
// UTILITAIRES GLOBAUX
// ================================================================

/** Échappe les caractères HTML pour éviter les injections XSS */
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'": '&#39;' }[c])
  );
}

/** Affiche un toast de notification en bas à droite */
function showToast(msg, duration = 3200) {
  const toast   = document.getElementById('toast');
  const toastEl = document.getElementById('toastMsg');
  toastEl.textContent = msg;
  toast.style.display = 'block';
  toast.style.opacity  = '1';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => { toast.style.display = 'none'; }, 300);
  }, duration);
}

// ================================================================
// AUTH — Onglets
// ================================================================

/** Bascule entre les onglets connexion et inscription */
function showTab(tab) {
  // Cacher tous les formulaires
  ['formLogin','formRegister','formReset','formNewPassword'].forEach(id => {
    document.getElementById(id)?.classList.add('hidden');
  });

  // Réinitialiser les onglets
  const tLogin    = document.getElementById('tabLogin');
  const tRegister = document.getElementById('tabRegister');
  tLogin.classList.remove('tab-active');
  tRegister.classList.remove('tab-active');
  tLogin.style.color    = '';
  tRegister.style.color = '';

  // Afficher le bon formulaire
  if (tab === 'login') {
    document.getElementById('formLogin').classList.remove('hidden');
    tLogin.classList.add('tab-active');
  } else if (tab === 'register') {
    document.getElementById('formRegister').classList.remove('hidden');
    tRegister.classList.add('tab-active');
  } else if (tab === 'reset') {
    document.getElementById('formReset').classList.remove('hidden');
    // Pas d'onglet actif pour reset/newpassword — on masque la barre d'onglets
  } else if (tab === 'newpassword') {
    document.getElementById('formNewPassword').classList.remove('hidden');
  }
}

// ================================================================
// AUTH — Mot de passe oublié
// ================================================================

async function handleForgotPassword() {
  const email  = document.getElementById('resetEmail').value.trim();
  const errEl  = document.getElementById('resetError');
  const okEl   = document.getElementById('resetSuccess');
  const btn    = document.getElementById('resetBtn');

  errEl.classList.add('hidden');
  okEl.classList.add('hidden');

  if (!email) {
    errEl.textContent = '❌ Saisis ton email.';
    errEl.classList.remove('hidden');
    return;
  }

  btn.textContent = '⏳ Envoi...';
  btn.disabled = true;

  const { error } = await db.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname,
  });

  btn.textContent = '📧 ENVOYER LE LIEN';
  btn.disabled = false;

  if (error) {
    errEl.textContent = '❌ ' + error.message;
    errEl.classList.remove('hidden');
  } else {
    okEl.textContent = '✅ Email envoyé ! Vérifie ta boîte mail (et tes spams).';
    okEl.classList.remove('hidden');
    document.getElementById('resetEmail').value = '';
  }
}

// ================================================================
// AUTH — Nouveau mot de passe (après clic sur le lien email)
// ================================================================

async function handleNewPassword() {
  const pwd1  = document.getElementById('newPassword').value;
  const pwd2  = document.getElementById('newPasswordConfirm').value;
  const errEl = document.getElementById('newPasswordError');
  const okEl  = document.getElementById('newPasswordSuccess');
  const btn   = document.getElementById('newPasswordBtn');

  errEl.classList.add('hidden');
  okEl.classList.add('hidden');

  if (!pwd1 || !pwd2) {
    errEl.textContent = '❌ Remplis les deux champs.';
    errEl.classList.remove('hidden');
    return;
  }
  if (pwd1 !== pwd2) {
    errEl.textContent = '❌ Les mots de passe ne correspondent pas.';
    errEl.classList.remove('hidden');
    return;
  }
  if (pwd1.length < 6) {
    errEl.textContent = '❌ Minimum 6 caractères.';
    errEl.classList.remove('hidden');
    return;
  }

  btn.textContent = '⏳ Enregistrement...';
  btn.disabled = true;

  const { error } = await db.auth.updateUser({ password: pwd1 });

  btn.textContent = '✅ CHANGER MON MOT DE PASSE';
  btn.disabled = false;

  if (error) {
    errEl.textContent = '❌ ' + error.message;
    errEl.classList.remove('hidden');
  } else {
    okEl.textContent = '🎉 Mot de passe changé ! Redirection...';
    okEl.classList.remove('hidden');
    setTimeout(() => {
      // Nettoyer l'URL et aller à la connexion
      window.history.replaceState({}, '', window.location.pathname);
      showTab('login');
    }, 2000);
  }
}


// ================================================================
// AUTH — Connexion
// ================================================================

async function handleLogin() {
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl    = document.getElementById('loginError');
  const btn      = document.getElementById('loginBtn');

  if (!email || !password) {
    showAuthError(errEl, '❌ Remplis tous les champs !');
    return;
  }

  btn.textContent = 'Connexion...';
  btn.disabled = true;

  try {
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // onAuthStateChange gère la suite automatiquement
  } catch (err) {
    showAuthError(errEl, '❌ ' + (err.message || 'Erreur de connexion'));
    btn.textContent = '⚡ CONNECTER';
    btn.disabled = false;
  }
}

// ================================================================
// AUTH — Inscription (ouverte à tous)
// ================================================================

async function handleRegister() {
  const email    = document.getElementById('regEmail').value.trim();
  const username = document.getElementById('regUsername').value.trim();
  const password = document.getElementById('regPassword').value;
  const errEl    = document.getElementById('regError');
  const sucEl    = document.getElementById('regSuccess');

  errEl.classList.add('hidden');
  sucEl.classList.add('hidden');

  if (!email || !username || !password) {
    showAuthError(errEl, '❌ Remplis tous les champs !');
    return;
  }
  if (username.length < 2) {
    showAuthError(errEl, '❌ Pseudo trop court (2 caractères min)');
    return;
  }
  if (password.length < 6) {
    showAuthError(errEl, '❌ Mot de passe : 6 caractères minimum');
    return;
  }

  try {
    const { data, error } = await db.auth.signUp({
      email,
      password,
      options: {
        data: { username }   // Stocké dans user_metadata
      }
    });
    if (error) throw error;

    sucEl.textContent = '✅ Compte créé ! Connecte-toi maintenant.';
    sucEl.classList.remove('hidden');
    // Passe automatiquement sur l'onglet connexion après 2s
    setTimeout(() => showTab('login'), 2000);
  } catch (err) {
    showAuthError(errEl, '❌ ' + (err.message || "Erreur d'inscription"));
  }
}

// ================================================================
// AUTH — Déconnexion
// ================================================================

async function handleLogout() {
  await db.auth.signOut();
  AppState.adminMode = false;
  localStorage.removeItem('permanceAdminMode');
}

/** Affiche un message d'erreur temporaire dans un élément */
function showAuthError(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 5000);
}

// ================================================================
// SESSION — Écoute les changements d'état d'authentification
// ================================================================

// ================================================================
// DÉTECTION RECOVERY AU CHARGEMENT
// ================================================================
// On détecte si l'URL contient un hash de recovery SANS l'effacer.
// Supabase a besoin du hash pour extraire le token et déclencher
// l'événement PASSWORD_RECOVERY. On l'efface seulement après.
const IS_RECOVERY_MODE = window.location.hash.includes('type=recovery');

if (IS_RECOVERY_MODE) {
  // Cacher l'app immédiatement pour éviter tout flash
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('authPage').style.display = 'flex';
    document.getElementById('mainApp').style.display  = 'none';
  });
}

db.auth.onAuthStateChange(async (event, session) => {

  // PASSWORD_RECOVERY : afficher le formulaire nouveau mot de passe
  if (event === 'PASSWORD_RECOVERY') {
    // Nettoyer l'URL maintenant que Supabase a traité le token
    history.replaceState(null, '', window.location.pathname);
    document.getElementById('authPage').style.display = 'flex';
    document.getElementById('mainApp').style.display  = 'none';
    showTab('newpassword');
    return;
  }

  // SIGNED_IN déclenché juste avant PASSWORD_RECOVERY sur un lien reset
  // → on l'ignore pour ne pas charger l'app trop tôt
  if (event === 'SIGNED_IN' && IS_RECOVERY_MODE) {
    return;
  }

  if (session && session.user) {
    AppState.user     = session.user;
    AppState.username = session.user.user_metadata?.username
                        || session.user.email.split('@')[0];
    AppState.isAdmin  = ADMIN_EMAILS
      .map(e => e.toLowerCase())
      .includes(session.user.email.toLowerCase());

    if (!AppState.isAdmin) {
      localStorage.removeItem('permanceAdminMode');
      AppState.adminMode = false;
    } else {
      AppState.adminMode = localStorage.getItem('permanceAdminMode') === 'true';
    }

    onUserLoggedIn();
  } else {
    AppState.user      = null;
    AppState.isAdmin   = false;
    AppState.adminMode = false;
    onUserLoggedOut();
  }
});

// ================================================================
// SESSION — Connexion réussie
// ================================================================

function onUserLoggedIn() {
  // Cache la page auth, montre l'app
  document.getElementById('authPage').style.display    = 'none';
  document.getElementById('mainApp').style.display = 'flex';

  // Met à jour le header
  document.getElementById('topUsername').textContent = AppState.username;

  // Bouton admin : visible seulement pour les admins
  const adminBtn = document.getElementById('adminBtn');
  if (AppState.isAdmin) {
    adminBtn.classList.remove('hidden');
    updateAdminUI();
  } else {
    adminBtn.classList.add('hidden');
  }

  // Réinitialise les champs auth pour la prochaine fois
  ['loginEmail','loginPassword','regEmail','regUsername','regPassword']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('loginBtn').textContent = '⚡ CONNECTER';
  document.getElementById('loginBtn').disabled    = false;

  // Affiche la section Snake par défaut
  showSection('snake');

  // Initialise les modules temps réel
  initLeaderboard();
  initPranksChannel();
  // initTicTacToe() → appelé automatiquement dans showSection('morpion')
  startAnnounceChannel(); // écoute les annonces dès la connexion
}

// ================================================================
// SESSION — Déconnexion
// ================================================================

function onUserLoggedOut() {
  document.getElementById('authPage').style.display = 'flex';
  document.getElementById('mainApp').style.display  = 'none';
  document.getElementById('topUsername').textContent = '';

  // Réinitialise l'onglet login
  showTab('login');
}

// ================================================================
// MODE ADMIN — Toggle
// ================================================================

function toggleAdminMode() {
  if (!AppState.isAdmin) return;

  AppState.adminMode = !AppState.adminMode;
  localStorage.setItem('permanceAdminMode', AppState.adminMode.toString());

  updateAdminUI();
  showToast(AppState.adminMode ? '👑 Mode admin activé !' : '🔓 Mode admin désactivé');
}

/** Met à jour toute l'interface en fonction du mode admin */
function updateAdminUI() {
  const adminBtn   = document.getElementById('adminBtn');
  const adminBadge = document.getElementById('adminBadge');
  const adminNote  = document.getElementById('adminPranksNote');
  const adminZone  = document.getElementById('adminOnlyPranks');

  const adminPrankBtns = ['rotateAdminBtn','invertAdminBtn','bsodAdminBtn','windowsAdminBtn'];
  const adminEls = ['adminAnnounceForm','roulettePrankBtn','rouletteAdminGages','blagueAdminForm','geoAdminPanel','travailAdminBar'];

  // Sécurité absolue : si pas admin, tout cacher sans exception
  if (!AppState.isAdmin) {
    adminBtn?.classList.add('hidden');
    adminBadge?.classList.add('hidden');
    if (adminNote) adminNote.classList.add('hidden');
    if (adminZone) adminZone.classList.add('hidden');
    adminPrankBtns.forEach(id => document.getElementById(id)?.classList.add('hidden'));
    adminEls.forEach(id => document.getElementById(id)?.classList.add('hidden'));
    return;
  }

  // Admin confirmé — afficher/masquer selon adminMode
  adminBtn?.classList.remove('hidden');
  if (AppState.adminMode) {
    adminBtn.textContent = '🔒 QUITTER ADMIN';
    adminBadge?.classList.remove('hidden');
    if (adminNote) adminNote.classList.remove('hidden');
    if (adminZone) adminZone.classList.remove('hidden');
    adminPrankBtns.forEach(id => document.getElementById(id)?.classList.remove('hidden'));
    adminEls.forEach(id => document.getElementById(id)?.classList.remove('hidden'));
  } else {
    adminBtn.textContent = '🔓 MODE ADMIN';
    adminBadge?.classList.add('hidden');
    if (adminNote) adminNote.classList.add('hidden');
    if (adminZone) adminZone.classList.add('hidden');
    adminPrankBtns.forEach(id => document.getElementById(id)?.classList.add('hidden'));
    adminEls.forEach(id => document.getElementById(id)?.classList.add('hidden'));
  }
}

// ================================================================
// ROUTING — Affiche une section (SPA)
// ================================================================

function showSection(name) {
  AppState.currentSection = name;

  // Cache toutes les sections
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));

  // Active la bonne section
  const section = document.getElementById('section-' + name);
  if (section) section.classList.add('active');

  // Met à jour la nav sidebar ET la bottom nav mobile
  document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.section === name);
  });

  // Actions spécifiques au changement de section
  if (name === 'leaderboard') refreshLeaderboard();
  if (name === 'whiteboard')  initWhiteboard();
  if (name === 'morpion')     refreshTTT();
  if (name === 'snake')       { initSnake(); initSnakeMiniLB(); }
  if (name === 'chat')        initChat();
  if (name === 'annonces')    initAnnounces();
  if (name === 'roulette')    initRoulette();
  if (name === 'blagues')     initBlagues();
  if (name === 'carte')       initGeoDefi();
  if (name === 'travail')     initWorkspace();
}

// ================================================================
// POPUP SCORE SNAKE
// ================================================================

let pendingScore = 0;

/** Ouvre la popup de fin de partie avec le score */
function showScorePopup(score) {
  pendingScore = score;
  document.getElementById('popupScore').textContent = score;
  const popup = document.getElementById('scorePopup');
  popup.style.display = 'flex';
  popup.classList.remove('hidden');
}

/** Ferme la popup sans sauvegarder */
function closeScorePopup() {
  document.getElementById('scorePopup').style.display = 'none';
  document.getElementById('scorePopup').classList.add('hidden');
}

/** Sauvegarde le score dans Supabase et ferme la popup */
async function saveScore() {
  if (!AppState.user) {
    showToast('❌ Tu n\'es pas connecté !');
    return;
  }

  try {
    const { error } = await db.from('scores').insert({
      user_id:  AppState.user.id,
      username: AppState.username,
      score:    pendingScore,
    });

    if (error) throw error;

    showToast('🏆 Score enregistré !');
    closeScorePopup();
    // Rafraîchit les deux affichages du leaderboard
    refreshLeaderboard();
    initSnakeMiniLB();
  } catch (err) {
    console.error('Erreur saveScore:', err);
    showToast('❌ Erreur : ' + err.message);
  }
}

// ================================================================
// INITIALISATION au chargement de la page
// ================================================================

document.addEventListener('DOMContentLoaded', () => {
  // onAuthStateChange s'en occupe automatiquement
  // On vérifie juste s'il y a déjà une session active
  db.auth.getSession().then(({ data: { session } }) => {
    // Si pas de session, onAuthStateChange a déjà appelé onUserLoggedOut
    // Si session existante, il a appelé onUserLoggedIn
    console.log('Session actuelle:', session ? session.user?.email : 'aucune');
  });
});

// ================================================================
// MODE CLAIR / SOMBRE
// ================================================================

function toggleTheme() {
  const isLight = document.body.classList.toggle('light-mode');
  localStorage.setItem('ph-theme', isLight ? 'light' : 'dark');
  const btn = document.getElementById('themeBtn');
  if (btn) btn.textContent = isLight ? '☀️' : '🌙';
}

// Appliquer le thème sauvegardé au chargement
(function applyStoredTheme() {
  if (localStorage.getItem('ph-theme') === 'light') {
    document.body.classList.add('light-mode');
    // Le bouton n'existe peut-être pas encore au moment du script,
    // on l'ajuste dès que le DOM est prêt
    document.addEventListener('DOMContentLoaded', () => {
      const btn = document.getElementById('themeBtn');
      if (btn) btn.textContent = '☀️';
    });
  }
})();