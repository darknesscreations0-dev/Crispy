/* ============================================================
   CRISPY AI — FAQ assistant (real AI, via Supabase Edge Function)
   ------------------------------------------------------------
   Sends the visitor's question, the live FAQ content on this page,
   and recent chat history to the "crispy-ai" Supabase Edge Function,
   which calls Claude server-side (API key never touches the client).
   Requires assets/js/supabase-config.js to run first (sets up
   window.supabaseClient) — same client auth.js already relies on.
   ============================================================ */

(function () {
  const openBtn = document.getElementById('aiOpenBtn');
  const closeBtn = document.getElementById('aiCloseBtn');
  const panel = document.getElementById('aiPanel');
  const messagesEl = document.getElementById('aiMessages');
  const form = document.getElementById('aiForm');
  const input = document.getElementById('aiInput');
  if (!openBtn || !panel) return;

  const FUNCTION_NAME = 'crispy-ai';
  const history = []; // [{role, content}, ...] kept client-side for this session only

  // Pull the real FAQ content straight from the page so the assistant's
  // answers always match whatever questions are actually listed here.
  function getFaqBank() {
    return [...document.querySelectorAll('.faq')].map((f) => ({
      q: f.querySelector('.faq__q').textContent.replace('+', '').trim(),
      a: f.querySelector('.faq__a p').textContent.trim(),
    }));
  }

  function addMsg(text, who) {
    const div = document.createElement('div');
    div.className = 'ai-msg ai-msg--' + who;
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  function addTyping() {
    const div = document.createElement('div');
    div.className = 'ai-msg ai-msg--bot ai-msg--typing';
    div.textContent = '…';
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  function open() {
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    input.focus();
  }
  function close() {
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
  }
  openBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);

  async function askCrispyAI(message) {
    const client = window.supabaseClient;
    if (!client) {
      throw new Error('Store is not configured yet.');
    }
    const { data, error } = await client.functions.invoke(FUNCTION_NAME, {
      body: { message, faq: getFaqBank(), history },
    });
    if (error) throw error;
    if (data && data.error) throw new Error(data.error);
    return data.reply;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const val = input.value.trim();
    if (!val) return;

    addMsg(val, 'user');
    history.push({ role: 'user', content: val });
    input.value = '';
    input.disabled = true;

    const typingEl = addTyping();

    try {
      const reply = await askCrispyAI(val);
      typingEl.remove();
      addMsg(reply, 'bot');
      history.push({ role: 'assistant', content: reply });
    } catch (err) {
      console.warn('Crispy AI error:', err);
      typingEl.remove();
      addMsg(
        "Sorry, I'm having trouble reaching the AI right now — try again in a moment, or reach out on the Contact page.",
        'bot'
      );
    } finally {
      input.disabled = false;
      input.focus();
    }
  });
})();
