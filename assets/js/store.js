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
  // Renders a product's media as <img> or <video> depending on media_type,
  // set from the admin panel when a file was uploaded there. When autofit
  // is true, the tag gets a marker class so autoFitMedia() (below) can
  // resize its container to the real image/video's aspect ratio once it
  // loads, instead of the container's fixed square ratio letterboxing it.
  function mediaTag(p, w, h, autofit){
    const cls = autofit ? ' class="js-autofit-media"' : '';
    if (p.media_type === 'video' && p.image_url){
      return `<video${cls} src="${esc(p.image_url)}" autoplay muted loop playsinline></video>`;
    }
    return `<img${cls} src="${esc(p.image_url || placeholderImg(p.name || p.id, w, h))}" alt="${esc(p.name)}" loading="lazy">`;
  }

  // Resizes `container` to match the natural aspect ratio of the
  // .js-autofit-media element inside it (image or video), once its real
  // dimensions are known — so a landscape image never gets stuck inside
  // a square box with empty bars top/bottom.
  function autoFitMedia(container){
    if (!container) return;
    const el = container.querySelector('.js-autofit-media');
    if (!el) return;
    const apply = () => {
      const w = el.tagName === 'VIDEO' ? el.videoWidth : el.naturalWidth;
      const h = el.tagName === 'VIDEO' ? el.videoHeight : el.naturalHeight;
      if (w && h) container.style.aspectRatio = `${w} / ${h}`;
    };
    if (el.tagName === 'VIDEO'){
      if (el.readyState >= 1) apply(); else el.addEventListener('loadedmetadata', apply, { once:true });
    } else {
      if (el.complete && el.naturalWidth) apply(); else el.addEventListener('load', apply, { once:true });
    }
  }

  function discountPct(p){
    if (!p.compare_at || Number(p.compare_at) <= Number(p.price)) return 0;
    return Math.round((1 - Number(p.price) / Number(p.compare_at)) * 100);
  }
  // Temporary placeholder art until real product images are uploaded —
  // generated locally as an inline SVG data URI so it always renders,
  // even with no internet connection (no external image service).
  function placeholderImg(seed, w, h){
    w = w || 600; h = h || 400;
    const str = String(seed || 'crispy');
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    const hue = hash % 360;
    const initial = esc(str.trim().charAt(0).toUpperCase() || 'C');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="hsl(${hue},55%,22%)"/>
        <stop offset="1" stop-color="hsl(${hue},55%,10%)"/>
      </linearGradient></defs>
      <rect width="${w}" height="${h}" fill="url(#g)"/>
      <text x="50%" y="53%" font-family="Inter,sans-serif" font-size="${Math.round(Math.min(w,h)*0.32)}" font-weight="700" fill="rgba(255,255,255,0.18)" text-anchor="middle" dominant-baseline="middle">${initial}</text>
    </svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }
  const APP_ABBR = { 'After Effects':'Ae', 'Premiere Pro':'Pr', 'Photoshop':'Ps', 'Illustrator':'Ai', 'Cinema 4D':'C4', 'DaVinci Resolve':'Dv' };
  function appChips(compat){
    const apps = String(compat || 'After Effects').split(',').map(a => a.trim()).filter(Boolean);
    if (!apps.length) return '';
    return `<div class="card__apps">${apps.map(a => `<span class="card__app-chip">${esc(APP_ABBR[a] || a.slice(0,2))}</span>`).join('')}</div>`;
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
    const media = mediaTag(p, 500, 500);
    return `
      <article class="card reveal">
        <div class="card__media">
          ${p.badge ? `<span class="card__badge">${esc(p.badge)}</span>` : ''}
          ${off ? `<span class="card__off">-${off}%</span>` : ''}
          ${appChips(p.compatible_with)}
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
          <div class="card__actions">
            <button class="btn btn--sm card__btn" data-add="${p.id}">${free ? 'Download' : 'Add to cart'}</button>
            ${free ? '' : `<button class="btn btn--sm btn--ghost card__btn" data-buy="${p.id}">Buy now</button>`}
          </div>
        </div>
      </article>`;
  }

  /* ---------- banner markup (home spotlight) ---------- */
  const BANNER_ICONS = {
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/></svg>'
  };
  // Renders one custom banner slide from the `banners` table — fully
  // admin-authored: its own image/video, headline, subtitle, optional
  // price tag, optional badge, and a link to wherever the admin points it
  // (a product page, the catalog, an external URL, whatever).
  function bannerHTML(b){
    const media = b.image_url
      ? (b.media_type === 'video'
          ? `<video src="${esc(b.image_url)}" autoplay muted loop playsinline></video>`
          : `<img src="${esc(b.image_url)}" alt="${esc(b.title || '')}">`)
      : '';
    const href = b.link_url || '';
    const external = /^https?:\/\//i.test(href);
    const ctaText = b.cta_text || 'Learn more';
    return `
      <div class="banner reveal">
        <div class="banner__media">${media}</div>
        ${b.price_label ? `<div class="banner__price"><strong>${esc(b.price_label)}</strong></div>` : ''}
        <div class="banner__overlay">
          ${b.badge ? `<div class="banner__eyebrow">${esc(b.badge)}</div>` : ''}
          <h3 class="banner__title">${esc(b.title || '')}</h3>
          ${b.subtitle ? `<p class="banner__sub">${esc(b.subtitle)}</p>` : ''}
          ${href ? `<a class="btn btn--sm banner__cta" href="${esc(href)}"${external ? ' target="_blank" rel="noopener"' : ''}>${esc(ctaText)}</a>` : ''}
        </div>
      </div>`;
  }

  /* ---------- catalog card markup (marketplace grid) ---------- */
  function catalogCardHTML(p){
    const free = p.is_free || Number(p.price) === 0;
    const off = discountPct(p);
    const media = mediaTag(p, 500, 500);
    const desc = p.description ? esc(p.description) : 'No description yet — details coming soon.';
    const href = `product.html?id=${encodeURIComponent(p.id)}`;
    return `
      <article class="card reveal">
        <a class="card__media" href="${href}">
          ${p.badge ? `<span class="card__badge">${esc(p.badge)}</span>` : ''}
          ${off ? `<span class="card__off">-${off}%</span>` : ''}
          ${appChips(p.compatible_with)}
          ${media}
        </a>
        <div class="card__body">
          <div class="card__author">${esc(p.author || 'Crispy')}</div>
          <h4 class="card__title"><a href="${href}" style="color:inherit;">${esc(p.name)}</a></h4>
          <p class="card__desc">${desc}</p>
          <div class="card__rating"><span class="stars">${stars(p.rating)}</span> ${Number(p.rating || 5).toFixed(1)}</div>
          <div class="card__price">
            ${free
              ? `<span class="now free">Free</span>`
              : `<span class="now">${money(p.price)}</span>${p.compare_at ? `<span class="was">${money(p.compare_at)}</span>` : ''}`}
          </div>
          <div class="card__actions">
            ${p.video_url ? `<a class="btn btn--ghost" href="${esc(p.video_url)}" target="_blank" rel="noopener">Video</a>` : ''}
            <button class="btn" data-add="${p.id}">${free ? 'Download' : 'Add to cart'}</button>
            ${free ? '' : `<button class="btn btn--ghost" data-buy="${p.id}">Buy now</button>`}
            <a class="btn btn--ghost" href="${href}">More info</a>
          </div>
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
    document.querySelectorAll('[data-buy]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = products.find(x => String(x.id) === String(btn.dataset.buy));
        if (p) buyNow(p);
      });
    });
  }

  // "Buy now" — adds the item then jumps straight to the cart, skipping
  // the "keep browsing" step. There's no live payment gateway yet (see
  // cart.html), so for now this is just a faster path to checkout, same
  // as Add to cart followed by manually opening the cart.
  function buyNow(product){
    addToCart(product);
    window.location.href = 'cart.html';
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

  // Homepage banner timing/count — configurable from the admin panel
  // (site_settings table, singleton row id=1). Falls back to the old
  // hardcoded defaults if the table/row isn't there yet.
  async function fetchBannerSettings(){
    const c = client();
    if (!c) return { banner_interval_seconds: 5, banner_max_slides: 6 };
    const { data, error } = await c.from('site_settings').select('*').eq('id', 1).maybeSingle();
    if (error || !data) return { banner_interval_seconds: 5, banner_max_slides: 6 };
    return data;
  }

  // The homepage banner slides — fully custom, from the `banners` table,
  // not derived from any product.
  async function fetchBanners(){
    const c = client();
    if (!c) return [];
    const { data, error } = await c.from('banners').select('*').eq('is_active', true).order('sort_order', { ascending: true });
    if (error) return [];
    return data || [];
  }

  /* ---------- page renderers ---------- */
  async function renderHome(){
    const products = await fetchProducts();

    const bannerWrap = document.querySelector('[data-home-banners]');
    if (bannerWrap){
      const settings = await fetchBannerSettings();
      const maxSlides = Math.max(1, Number(settings.banner_max_slides) || 6);
      const intervalMs = Math.max(1, Number(settings.banner_interval_seconds) || 5) * 1000;
      const list = (await fetchBanners()).slice(0, maxSlides);
      if (!list.length){
        bannerWrap.innerHTML = `<p class="state-msg">No banners set up yet — add one in the admin panel.</p>`;
      } else {
        let i = 0;
        const go = (n) => { i = (n + list.length) % list.length; paint(); resetTimer(); };
        const paint = () => {
          bannerWrap.innerHTML =
            (list.length > 1 ? `
              <button class="banner-nav banner-nav--prev" data-prev aria-label="Previous"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg></button>
              <button class="banner-nav banner-nav--next" data-next aria-label="Next"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></button>
            ` : '') +
            bannerHTML(list[i]) +
            (list.length > 1 ? `
              <div class="banner-counter">
                <span>${i+1} / ${list.length}</span>
                <div class="banner-dots">${list.map((_, idx) => `<button data-dot="${idx}" class="${idx===i?'is-active':''}" aria-label="Slide ${idx+1}"></button>`).join('')}</div>
              </div>` : '');
          bannerWrap.querySelectorAll('[data-dot]').forEach(dot => {
            dot.addEventListener('click', (e) => { e.preventDefault(); go(Number(dot.dataset.dot)); });
          });
          const prev = bannerWrap.querySelector('[data-prev]');
          const next = bannerWrap.querySelector('[data-next]');
          if (prev) prev.addEventListener('click', (e) => { e.preventDefault(); go(i - 1); });
          if (next) next.addEventListener('click', (e) => { e.preventDefault(); go(i + 1); });
        };
        let timer = null;
        const resetTimer = () => {
          if (timer) clearInterval(timer);
          if (list.length > 1) timer = setInterval(() => { i = (i + 1) % list.length; paint(); }, intervalMs);
        };
        paint();
        resetTimer();
      }
    }

    const grid = document.querySelector('[data-home-grid]');
    if (grid){
      const featured = products.filter(p => p.is_featured).slice(0, 4);
      const list = featured.length ? featured : products.slice(0, 4);
      grid.innerHTML = list.length ? list.map(cardHTML).join('') : `<p class="state-msg">Products coming soon.</p>`;
    }

    wireAddButtons(products);
    observeReveals();
  }

  async function renderCatalog(){
    const grid = document.querySelector('[data-catalog-grid]');
    if (!grid) return;
    const products = await fetchProducts();
    const countEl = document.querySelector('[data-catalog-count]');
    const searchInput = document.querySelector('[data-search]');
    const catSelect = document.querySelector('[data-filter-category]');
    const priceSelect = document.querySelector('[data-filter-price]');
    const compatSelect = document.querySelector('[data-filter-compat]');
    const sortTabs = document.querySelectorAll('[data-sort]');

    // Populate category options from real data
    if (catSelect){
      const cats = [...new Set(products.map(p => p.category).filter(Boolean))];
      catSelect.innerHTML = `<option value="all">All categories</option>` +
        cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    }

    // Pre-fill from URL (?q=... &cat=...) — lets the homepage search bar and
    // category links land here already filtered.
    const params = new URLSearchParams(window.location.search);
    if (searchInput && params.get('q')) searchInput.value = params.get('q');
    if (catSelect && params.get('cat')){
      const wanted = params.get('cat');
      if ([...catSelect.options].some(o => o.value === wanted)) catSelect.value = wanted;
    }
    // Populate compatible-with options from real data (falls back to After Effects)
    if (compatSelect){
      const apps = [...new Set(products.map(p => p.compatible_with || 'After Effects').filter(Boolean))];
      compatSelect.innerHTML = `<option value="all">All apps</option>` +
        apps.map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join('');
    }

    let sort = 'featured';
    function paint(){
      const q = searchInput ? searchInput.value.trim().toLowerCase() : '';
      const cat = catSelect ? catSelect.value : 'all';
      const price = priceSelect ? priceSelect.value : 'all';
      const compat = compatSelect ? compatSelect.value : 'all';

      let list = products.filter(p => {
        if (cat !== 'all' && p.category !== cat) return false;
        if (compat !== 'all' && (p.compatible_with || 'After Effects') !== compat) return false;
        const n = Number(p.price) || 0;
        if (price === 'free' && n !== 0) return false;
        if (price === 'under25' && !(n > 0 && n <= 25)) return false;
        if (price === '25to50' && !(n > 25 && n <= 50)) return false;
        if (price === 'over50' && !(n > 50)) return false;
        if (q){
          const hay = `${p.name||''} ${p.author||'Crispy'} ${p.description||''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });

      if (sort === 'latest') list = [...list].sort((a,b) => new Date(b.created_at||0) - new Date(a.created_at||0));
      else if (sort === 'popular') list = [...list].sort((a,b) => (Number(b.rating)||0) - (Number(a.rating)||0));
      else list = [...list].sort((a,b) => (b.is_featured === a.is_featured) ? 0 : (b.is_featured ? 1 : -1));

      grid.innerHTML = list.length ? list.map(catalogCardHTML).join('') : `<p class="state-msg">Nothing here yet.</p>`;
      if (countEl) countEl.textContent = `${list.length} product${list.length===1?'':'s'}`;
      wireAddButtons(products);
      observeReveals();
    }

    if (searchInput) searchInput.addEventListener('input', paint);
    if (catSelect) catSelect.addEventListener('change', paint);
    if (priceSelect) priceSelect.addEventListener('change', paint);
    if (compatSelect) compatSelect.addEventListener('change', paint);
    sortTabs.forEach(tab => tab.addEventListener('click', () => {
      sortTabs.forEach(t => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      sort = tab.dataset.sort;
      paint();
    }));

    paint();
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
  const NAV_ICONS = {
    'index.html': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
    'catalog.html': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
    'faq.html': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 3.5"/><line x1="12" y1="17" x2="12" y2="17"/></svg>',
    'contact.html': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="1"/><path d="M2 6l10 7 10-7"/></svg>'
  };
  function wireMobileNav(){
    const burger = document.querySelector('[data-nav-burger]');
    const links = document.querySelector('[data-nav-links]');
    if (!burger || !links) return;

    // Inject icons per link (once)
    links.querySelectorAll('a').forEach(a => {
      if (a.querySelector('svg')) return;
      const href = (a.getAttribute('href') || '').split('?')[0];
      const icon = NAV_ICONS[href];
      if (icon) a.insertAdjacentHTML('afterbegin', icon);
    });

    // Inject close button (once)
    if (!links.querySelector('[data-nav-close]')) {
      links.insertAdjacentHTML('afterbegin', `<button type="button" class="nav__close" data-nav-close aria-label="Close menu"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`);
    }

    // Inject backdrop scrim (once)
    let scrim = document.querySelector('[data-nav-scrim]');
    if (!scrim) {
      scrim = document.createElement('div');
      scrim.className = 'nav__scrim';
      scrim.setAttribute('data-nav-scrim', '');
      document.body.appendChild(scrim);
    }

    const closeMenu = () => {
      links.classList.remove('is-open');
      scrim.classList.remove('is-open');
      burger.setAttribute('aria-expanded', 'false');
    };
    const openMenu = () => {
      links.classList.add('is-open');
      scrim.classList.add('is-open');
      burger.setAttribute('aria-expanded', 'true');
    };

    burger.addEventListener('click', () => {
      links.classList.contains('is-open') ? closeMenu() : openMenu();
    });
    scrim.addEventListener('click', closeMenu);
    links.querySelector('[data-nav-close]').addEventListener('click', closeMenu);
    links.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
  }

  /* ---------- Cookie consent + update subscription ---------- */
  function wireCookieBanner(){
    if (localStorage.getItem('crispy-cookie-consent')) return;
    if (document.querySelector('[data-cookie-banner]')) return;

    const el = document.createElement('div');
    el.className = 'cookie-banner';
    el.setAttribute('data-cookie-banner', '');
    el.innerHTML = `
      <div class="cookie-banner__text">
        <strong>We use cookies</strong> to keep things like your cart working. Want product updates in your inbox too? Drop your email — no spam, just new releases and sales.
      </div>
      <form class="cookie-banner__form" data-cookie-form>
        <input type="email" placeholder="you@email.com" data-cookie-email autocomplete="email">
        <button type="submit" class="btn">Accept &amp; subscribe</button>
        <button type="button" class="btn btn--ghost" data-cookie-dismiss>Just accept</button>
      </form>
      <div class="cookie-banner__msg" data-cookie-msg></div>
    `;
    document.body.appendChild(el);

    function closeBanner(){
      localStorage.setItem('crispy-cookie-consent', '1');
      el.remove();
    }

    el.querySelector('[data-cookie-dismiss]').addEventListener('click', closeBanner);

    el.querySelector('[data-cookie-form]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = el.querySelector('[data-cookie-email]');
      const msg = el.querySelector('[data-cookie-msg]');
      const email = input.value.trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
        msg.textContent = 'Enter a valid email, or tap "Just accept" to skip.';
        msg.style.color = '#ff6b6b';
        return;
      }
      const c = client();
      if (!c){ closeBanner(); return; }
      msg.textContent = 'Saving…'; msg.style.color = 'var(--c-text-faint)';
      const { error } = await c.from('subscribers').insert({ email });
      if (error && error.code !== '23505'){ // 23505 = already subscribed, treat as success
        msg.textContent = 'Could not save — try "Just accept" instead.'; msg.style.color = '#ff6b6b';
        return;
      }
      msg.textContent = "You're in! Closing…"; msg.style.color = '#4ade80';
      setTimeout(closeBanner, 900);
    });
  }

  function init(){
    updateCartBadge();
    wireFaq();
    wireCountdown();
    observeReveals();
    wireDemo();
    wireMobileNav();
    wireCookieBanner();
    renderHome();
    renderCatalog();
    renderCart();
  }
  document.addEventListener('DOMContentLoaded', init);
  document.addEventListener('crispy-cart-change', () => { renderCart(); });

  return { addToCart, buyNow, getCart, cartCount, cartTotal, showToast, money, placeholderImg, autoFitMedia };
})();
window.CrispyStore = CrispyStore;
