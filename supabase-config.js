// ================================================================
// supabase-config.js — Configuration Supabase de PermanceHub
// ================================================================
// 🔧 REMPLACE les valeurs ci-dessous avec celles de ton projet.
//    Dashboard Supabase → ton projet → Settings → API
// ================================================================

const SUPABASE_URL     = 'https://myoiyojeemtdkfixemof.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_5PZu2gneRYrOzynDccYS-Q_i_s1-KPb';

// ================================================================
// 👑 EMAILS ADMIN — seuls ces deux comptes verront le bouton admin
//    (Modifie la 2ème entrée avec le vrai email de ton pote)
// ================================================================
const ADMIN_EMAILS = [
  'noelt3309@gmail.com',
  'admin2@gmail.com'       // ← 🔧 Remplace par le vrai 2ème email admin
];

// ================================================================
// Création du client Supabase (disponible globalement via `db`)
// ================================================================
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: {
    params: { eventsPerSecond: 30 }
  }
});

console.log('✅ Supabase client initialisé — PermanceHub');
