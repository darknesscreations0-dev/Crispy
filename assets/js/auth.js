/* ============================================================
   DARKNESS CREATIONS — SHARED AUTH (real Supabase auth)
   ------------------------------------------------------------
   Replaces the old localStorage demo. Uses Supabase Auth for
   real accounts (email/password + Google), shared across every
   page on the site via window.supabaseClient.
   ============================================================ */

const DCAuth = (() => {
  function client() {
    return window.supabaseClient || null;
  }

  /* ---------- Core actions ---------- */

  async function getUser() {
    const c = client();
    if (!c) return null;
    const { data: { session } } = await c.auth.getSession();
    return session ? session.user : null;
  }

  async function signUp(email, password) {
    const c = client();
    if (!c) return { error: { message: 'Store is not configured yet.' } };
    return c.auth.signUp({ email, password });
  }

  async function signIn(email, password) {
    const c = client();
    if (!c) return { error: { message: 'Store is not configured yet.' } };
    return c.auth.signInWithPassword({ email, password });
  }

  async function signInWithGoogle() {
    const c = client();
    if (!c) return { error: { message: 'Store is not configured yet.' } };
    // Build the redirect from the current folder so it works inside a
    // GitHub Pages subfolder (e.g. /Darkness-Creations-site/), not just the domain root.
    const basePath = window.location.pathname.replace(/[^/]*$/, '');
    return c.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + basePath + 'account.html' }
    });
  }

  async function signOut() {
    const c = client();
    if (!c) return;
    await c.auth.signOut();
    document.dispatchEvent(new CustomEvent('dc-auth-change'));
  }

  /* ---------- Profile (username, etc.) ---------- */

  // Reads the signed-in user's row from the `profiles` table.
  // NOTE: this assumes the profile row's primary key column is `id`
  // and equals the auth user id (the standard Supabase profiles setup).
  // If your table uses `user_id` instead, change `.eq('id', ...)` and
  // the upsert key below to `user_id`.
  async function getProfile() {
    const c = client();
    const user = await getUser();
    if (!c || !user) return null;
    const { data, error } = await c
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .maybeSingle();
    if (error) return null;
    return data; // { username } or null if no row yet
  }

  // Saves the username for the signed-in user. Creates the profile row
  // if it doesn't exist yet (upsert). Returns { data } or { error }.
  async function updateUsername(username) {
    const c = client();
    const user = await getUser();
    if (!c || !user) return { error: { message: 'You are not signed in.' } };
    return c
      .from('profiles')
      .upsert({ id: user.id, username: username }, { onConflict: 'id' })
      .select()
      .maybeSingle();
  }

  /* ---------- Wire up any [data-dc-account] nav slot ---------- */

  async function renderAccountSlots() {
    const user = await getUser();

    // If signed in, try to show their username; fall back to email.
    let label = 'Account';
    if (user) {
      label = user.email || 'Account';
      try {
        const profile = await getProfile();
        if (profile && profile.username) label = profile.username;
      } catch (e) { /* keep email fallback if profile fetch fails */ }
    }

    document.querySelectorAll('[data-dc-account]').forEach((slot) => {
      if (user) {
        slot.innerHTML = `
          <a class="dc-account-name" href="account.html" style="margin-right:.7rem; color:inherit; text-decoration:none;">${label}</a>
          <button class="dc-account-logout" data-dc-logout>Log out</button>
        `;
      } else {
        slot.innerHTML = `<a class="btn btn--ghost dc-login-trigger" href="login.html"><span>Log in</span></a>`;
      }
    });
    document.querySelectorAll('[data-dc-logout]').forEach((btn) =>
      btn.addEventListener('click', signOut)
    );
  }

  document.addEventListener('DOMContentLoaded', renderAccountSlots);
  document.addEventListener('dc-auth-change', renderAccountSlots);

  const c = client();
  if (c) {
    c.auth.onAuthStateChange(() => {
      document.dispatchEvent(new CustomEvent('dc-auth-change'));
    });
  }

  return { getUser, signUp, signIn, signInWithGoogle, signOut, getProfile, updateUsername, renderAccountSlots };
})();
