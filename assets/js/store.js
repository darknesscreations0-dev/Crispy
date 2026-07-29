/* ============================================================
   CRISPY — STORE ENGINE
   Loads products from Supabase, runs the cart (localStorage),
   and wires shared UI (cart badge, toast, faq, countdown, reveals).
   ============================================================ */

const CrispyStore = (() => {
  const CART_KEY = 'crispy_cart';
  const CURRENCY = '$';

  /* ---------- helpers ---------- */
  function client(){ return window.supabaseClient || null; }
  function money(n){ return CURRENCY + Number(n).toFixed(2); }
  function esc(s){ return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function stars(r){ const full = Math.round(Number(r) || 0); return '★'.repeat(Math.max(0,Math.min(5,full))); }
  function discountPct(p){
    if (!p.compare_at || Number(p.compare_at) <= Number(p.price)) return 0;
    return Math.round((1 - Number(p.price) / Number(p.compare_at)) * 100);
  }

  /* ---------- cart storage ---------- */
  function getCart(){
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
    catch(e){ return []; }
  }
  function saveCart(items){
    try { localStorage.setItem(CART_KEY, JSON.stringify(items)); } catch(e){}
    updateCartBadge();
    document.dispatchEvent(new CustomEvent('crispy-cart-change'));
  }
  function cartCount(){ return getCart().reduce((n,i)=> n + (i.qty||1), 0); }
  function cartTotal(){ return getCart().reduce((s,i)=> s + Number(i.price) * (i.qty||1), 0); }

  function addToCart(product){
    if (product.is_free || Number(product.price) === 0){
      showToast('This one is free — grab it from the product page!');
      return;
    }
    const items = getCart();
    const found = items.find(i => i.id === product.id);
    if (found){ found.qty = (found.qty||1) + 1; }
    else {
      items.push({ id: product.id, name: product.name, price: Number(product.price), image: product.image_url || '', qty: 1 });
    }
    saveCart(items);
    showToast(`Added "${product.name}" to cart`);
  }
  function setQty(id, qty){
    let items = getCart();
    if (qty <= 0){ items = items.filter(i => i.id !== id); }
    else { const it = items.find(i => i.id === id); if (it) it.qty = qty; }
    saveCart(items);
  }
  function removeFromCart(id){ saveCart(getCart().filter(i => i.id !== id)); }

  function updateCartBadge(){
    const n = cartCount();
    document.querySelectorAll('[data-cart-count]').forEach(el => {
      el.textContent = n;
      el.style.display = n > 0 ? 'flex' : 'none';
    });
  }

  /* ---------- toast ---------- */
  let toastEl, toastTimer;
  function showToast(msg){
    if (!toastEl){
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    requestAnimationFrame(() => toastEl.classList.add('is-show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-show'), 2200);
  }

  /* ---------- product fetch ---------- */
  const productCache = { all: null };
  async function fetchProducts(){
    if (productCache.all) return productCache.all;
    const c = client();
    if (!c) return [];
    const { data, error } = await c
      .from('products')
      .select('*')
      .eq('is_active', true)
      .order('is_featured', { ascending: false })
      .order('created_at', { ascending: true });
    if (error){ console.warn('Products load failed:', error.message); return []; }
    productCache.all = data || [];
    return productCache.all;
  }

  /* ---------- card markup ---------- */
  function cardHTML(p){
    const off = discountPct(p);
    const free = p.is_free || Number(p.price) === 0;
    const media = p.image_url
      ? `<img src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy">`
      : esc(p.name);
    return `
      <article class="card reveal">
        <div class="card__media">
          ${p.badge ? `<span class="card__badge">${esc(p.badge)}</span>` : ''}
          ${off ? `<span class="card__off">-${off}%</span>` : ''}
          ${media}
        </div>
        <div class="card__body">
          <h4 class="card__title">${esc(p.name)}</h4>
          <div class="card__rating"><span class="stars">${stars(p.rating)}</span> ${Number(p.rating || 5).toFixed(1)}</div>
          <div class="card__price">
            ${free
              ? `<span class="now free">Free</span>`
              : `<span class="now">${money(p.price)}</span>${p.compare_at ? `<span class="was">${money(p.compare_at)}</span>` : ''}`}
          </div>
          <button class="btn btn--sm btn--block card__btn" data-add="${p.id}">
            ${free ? 'Download' : 'Add to cart'}
          </button>
        </div>
      </article>`;
  }

  function wireAddButtons(products){
    document.querySelectorAll('[data-add]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = products.find(x => String(x.id) === String(btn.dataset.add));
        if (p) addToCart(p);
      });
    });
  }

  /* ---------- 3D tilt on product cards (follows mouse) ---------- */
  function wireTilt(){
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.matchMedia('(hover: none)').matches) return; // skip on touch
    document.querySelectorAll('.card').forEach((card, i) => {
      card.style.setProperty('--i', i % 4);
      if (card.dataset.tilt) return;
      card.dataset.tilt = '1';
      card.addEventListener('mousemove', (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = `translateY(-6px) rotateX(${(-py*7).toFixed(2)}deg) rotateY(${(px*9).toFixed(2)}deg)`;
      });
      card.addEventListener('mouseleave', () => { card.style.transform = ''; });
    });
  }

  /* ---------- Interactive demo panel ---------- */
  function wireDemo(){
    const demo = document.querySelector('[data-demo]');
    if (!demo) return;
    const stage = demo.querySelector('.demo__word');
    const presets = {
      easing: ['Smooth Bounce', 'Soft Spring', 'Snap In', 'Overshoot'],
      text:   ['Word Reveal', 'Letter Stagger', 'Typewriter', 'Kinetic Pop'],
      glass:  ['Frost Blur', 'Light Sweep', 'Glass Shine', 'Depth Fade'],
    };
    const list = demo.querySelector('[data-demo-list]');
    const tabs = demo.querySelectorAll('.demo__tab');

    function animateStage(){
      stage.style.transform = 'scale(.6) translateY(20px)';
      stage.style.opacity = '0';
      requestAnimationFrame(() => {
        stage.style.transition = 'transform .5s cubic-bezier(.2,.9,.2,1.2), opacity .5s ease';
        stage.style.transform = 'scale(1) translateY(0)';
        stage.style.opacity = '1';
      });
    }
    function paintList(key){
      list.innerHTML = presets[key].map((p, i) =>
        `<div class="demo__preset${i===0?' is-active':''}" data-p="${p}">${p}<span>▶</span></div>`
      ).join('');
      list.querySelectorAll('.demo__preset').forEach(row => {
        row.addEventListener('click', () => {
          list.querySelectorAll('.demo__preset').forEach(r => r.classList.remove('is-active'));
          row.classList.add('is-active');
          stage.textContent = row.dataset.p;
          animateStage();
        });
      });
      stage.textContent = presets[key][0];
      animateStage();
    }
    tabs.forEach(t => t.addEventListener('click', () => {
      tabs.forEach(x => x.classList.remove('is-active'));
      t.classList.add('is-active');
      paintList(t.dataset.tab);
    }));
    paintList('easing');
  }

  /* ---------- page renderers ---------- */
  async function renderHome(){
    const grid = document.querySelector('[data-home-grid]');
    if (!grid) return;
    const products = await fetchProducts();
    const featured = products.filter(p => p.is_featured).slice(0, 4);
    const list = featured.length ? featured : products.slice(0, 4);
    grid.innerHTML = list.length ? list.map(cardHTML).join('') : `<p class="state-msg">Products coming soon.</p>`;
    wireAddButtons(products);
    observeReveals();
    wireTilt();
  }

  async function renderCatalog(){
    const grid = document.querySelector('[data-catalog-grid]');
    if (!grid) return;
    const products = await fetchProducts();
    const countEl = document.querySelector('[data-catalog-count]');

    function paint(cat){
      const list = cat === 'all' ? products : products.filter(p => p.category === cat);
      grid.innerHTML = list.length ? list.map(cardHTML).join('') : `<p class="state-msg">Nothing here yet.</p>`;
      if (countEl) countEl.textContent = `${list.length} product${list.length===1?'':'s'}`;
      wireAddButtons(products);
      observeReveals(); wireTilt();
    }
    document.querySelectorAll('[data-filter]').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('[data-filter]').forEach(c => c.classList.remove('is-active'));
        chip.classList.add('is-active');
        paint(chip.dataset.filter);
      });
    });
    paint('all');
  }

  function renderCart(){
    const wrap = document.querySelector('[data-cart-wrap]');
    if (!wrap) return;
    const items = getCart();
    if (!items.length){
      wrap.innerHTML = `
        <div class="cart-empty">
          <p style="font-size:1.1rem;margin-bottom:1rem;">Your cart is empty.</p>
          <a href="catalog.html" class="btn btn--sm">Browse tools</a>
        </div>`;
      return;
    }
    const rows = items.map(i => `
      <div class="cart-item" data-row="${i.id}">
        <div class="cart-item__media">${i.image ? `<img src="${esc(i.image)}" alt="">` : ''}</div>
        <div class="cart-item__info">
          <h4>${esc(i.name)}</h4>
          <div class="price">${money(i.price)}</div>
        </div>
        <div class="cart-item__qty">
          <button data-dec="${i.id}" aria-label="Decrease">–</button>
          <span>${i.qty}</span>
          <button data-inc="${i.id}" aria-label="Increase">+</button>
        </div>
        <button class="cart-item__remove" data-remove="${i.id}">Remove</button>
      </div>`).join('');

    const total = cartTotal();
    wrap.innerHTML = `
      ${rows}
      <div class="cart-summary">
        <div class="cart-summary__row"><span>Subtotal</span><span>${money(total)}</span></div>
        <div class="cart-summary__row"><span>Taxes</span><span>Calculated at checkout</span></div>
        <div class="cart-summary__row total"><span>Total</span><span>${money(total)}</span></div>
        <button class="btn btn--block" style="margin-top:1.2rem;" data-checkout>Checkout</button>
        <p style="text-align:center;color:var(--c-text-faint);font-size:.78rem;margin-top:.8rem;">Secure checkout — coming soon.</p>
      </div>`;

    wrap.querySelectorAll('[data-inc]').forEach(b => b.addEventListener('click', () => {
      const it = getCart().find(x => x.id === b.dataset.inc); setQty(b.dataset.inc, (it?.qty||1)+1); renderCart();
    }));
    wrap.querySelectorAll('[data-dec]').forEach(b => b.addEventListener('click', () => {
      const it = getCart().find(x => x.id === b.dataset.dec); setQty(b.dataset.dec, (it?.qty||1)-1); renderCart();
    }));
    wrap.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => { removeFromCart(b.dataset.remove); renderCart(); }));
    const co = wrap.querySelector('[data-checkout]');
    if (co) co.addEventListener('click', () => showToast('Checkout isn\'t live yet — hang tight!'));
  }

  /* ---------- FAQ accordion ---------- */
  function wireFaq(){
    document.querySelectorAll('.faq__q').forEach(q => {
      q.addEventListener('click', () => {
        const faq = q.closest('.faq');
        const a = faq.querySelector('.faq__a');
        const open = faq.classList.toggle('is-open');
        a.style.maxHeight = open ? a.scrollHeight + 'px' : '0';
      });
    });
  }

  /* ---------- countdown (rolling, resets each visit) ---------- */
  function wireCountdown(){
    const el = document.querySelector('[data-countdown]');
    if (!el) return;
    let remaining = 60 * 60; // 60 minutes
    function tick(){
      const m = String(Math.floor(remaining/60)).padStart(2,'0');
      const s = String(remaining%60).padStart(2,'0');
      el.textContent = `Ends in ${m}:${s}`;
      if (remaining > 0){ remaining--; setTimeout(tick, 1000); }
    }
    tick();
  }

  /* ---------- reveal on scroll ---------- */
  let revealObs;
  function observeReveals(){
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce){ document.querySelectorAll('.reveal').forEach(el => el.classList.add('is-visible')); return; }
    if (!('IntersectionObserver' in window)){ document.querySelectorAll('.reveal').forEach(el => el.classList.add('is-visible')); return; }
    if (!revealObs){
      revealObs = new IntersectionObserver((entries) => {
        entries.forEach(e => { if (e.isIntersecting){ e.target.classList.add('is-visible'); revealObs.unobserve(e.target); } });
      }, { threshold: 0.12 });
    }
    document.querySelectorAll('.reveal:not(.is-visible)').forEach(el => revealObs.observe(el));
  }

  /* ---------- init ---------- */
  function init(){
    updateCartBadge();
    wireFaq();
    wireCountdown();
    observeReveals();
    wireDemo();
    renderHome();
    renderCatalog();
    renderCart();
  }
  document.addEventListener('DOMContentLoaded', init);
  document.addEventListener('crispy-cart-change', () => { renderCart(); });

  return { addToCart, getCart, cartCount, cartTotal, showToast, money };
})();
