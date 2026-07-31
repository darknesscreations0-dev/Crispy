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
      .select('username, full_name, phone, backup_email, date_of_birth, avatar_url')
      .eq('id', user.id)
      .maybeSingle();
    if (error) return null;
    return data; // profile row, or null if no row yet
  }

  // Saves any subset of profile fields for the signed-in user. Creates the
  // profile row if it doesn't exist yet (upsert). Pass only the fields you
  // want to update, e.g. updateProfile({ username: 'x', phone: 'y' }).
  async function updateProfile(fields) {
    const c = client();
    const user = await getUser();
    if (!c || !user) return { error: { message: 'You are not signed in.' } };
    return c
      .from('profiles')
      .upsert({ id: user.id, ...fields }, { onConflict: 'id' })
      .select()
      .maybeSingle();
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

  // Turns whatever the person typed into the "email or username" field
  // into a real email Supabase Auth understands. If it's already an
  // email, this is a no-op network call that just hands it back. If
  // it's a username, the resolve-login edge function looks up the real
  // email server-side (see that file for why this needs a function
  // instead of a plain query).
  async function resolveIdentifier(identifier) {
    const c = client();
    if (!c) return { error: { message: 'Store is not configured yet.' } };
    try {
      const res = await fetch(`${window.SUPABASE_URL}/functions/v1/resolve-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': window.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${window.SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({ identifier })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) return { error: { message: data.error || 'Could not find that account.' } };
      return { email: data.email };
    } catch (e) {
      return { error: { message: 'Could not reach the server. Try again.' } };
    }
  }

  /* ---------- Password reset ---------- */

  // Sends a reset-password email to the given address. The link in that
  // email lands on reset-password.html, which establishes a recovery
  // session and lets the person set a new password.
  async function resetPassword(email) {
    const c = client();
    if (!c) return { error: { message: 'Store is not configured yet.' } };
    const basePath = window.location.pathname.replace(/[^/]*$/, '');
    return c.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + basePath + 'reset-password.html'
    });
  }

  // Called from reset-password.html once Supabase has established a
  // recovery session from the emailed link, to actually set the new password.
  async function updatePassword(newPassword) {
    const c = client();
    if (!c) return { error: { message: 'Store is not configured yet.' } };
    return c.auth.updateUser({ password: newPassword });
  }

  /* ---------- Wire up any [data-dc-account] nav slot ---------- */

  async function renderAccountSlots() {
    const user = await getUser();

    // If signed in, try to show their username; fall back to email.
    let label = 'Account';
    let avatarUrl = null;
    if (user) {
      label = user.email || 'Account';
      try {
        const profile = await getProfile();
        if (profile && profile.username) label = profile.username;
        if (profile && profile.avatar_url) avatarUrl = profile.avatar_url;
      } catch (e) { /* keep email fallback if profile fetch fails */ }
    }
    const initial = (label || '?').trim().charAt(0).toUpperCase();

    document.querySelectorAll('[data-dc-account]').forEach((slot) => {
      if (user) {
        slot.innerHTML = `
          <a class="dc-account-name" href="account.html" title="${label}" style="text-decoration:none;">
            <span class="nav__avatar">${avatarUrl ? `<img src="${avatarUrl}" alt="${label}">` : initial}</span>
          </a>
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

  return { getUser, signUp, signIn, signInWithGoogle, signOut, getProfile, updateProfile, updateUsername, resolveIdentifier, resetPassword, updatePassword, renderAccountSlots };
})();
