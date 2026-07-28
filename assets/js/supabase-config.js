/* ============================================================
   SUPABASE CONFIG
   ------------------------------------------------------------
   Fill in the two values below from:
   Supabase Dashboard → Project Settings → API

   SUPABASE_URL  → "Project URL"
   SUPABASE_ANON_KEY → "anon public" key

   The anon key is safe to expose in front-end code — that's
   how Supabase is designed to work. Real protection comes from
   the Row Level Security policies set up in supabase-setup.sql,
   not from hiding this key.
   ============================================================ */

const SUPABASE_URL = 'https://sqayzhsybgfgyrnpwxyn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_t-_OryiioljtSOGH985nAw_z8MJ2wk4';

window.supabaseClient = (window.supabase && SUPABASE_URL.startsWith('http'))
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

if (!window.supabaseClient) {
  console.warn('Supabase is not configured yet — fill in assets/js/supabase-config.js with your project URL and anon key.');
}
