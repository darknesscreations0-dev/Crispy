/* ============================================================
   CRISPY PIZZA — PAGE JS
   ============================================================ */

(function () {
  function renderGreeting() {
    const user = window.DCAuth ? window.DCAuth.getUser() : null;
    const nameSlot = document.querySelector('[data-cp-username]');
    const loginPrompt = document.querySelector('[data-cp-login-prompt]');

    if (user) {
      if (nameSlot) nameSlot.textContent = user.name;
      if (loginPrompt) loginPrompt.style.display = 'none';
    } else {
      if (nameSlot) nameSlot.textContent = 'Creator';
      if (loginPrompt) loginPrompt.style.display = 'inline-flex';
    }
  }

  document.addEventListener('DOMContentLoaded', renderGreeting);
  document.addEventListener('dc-auth-change', renderGreeting);

  document.querySelectorAll('[data-cp-login-prompt]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (window.DCAuth) window.DCAuth.openModal();
    });
  });

  /* ---------- Reveal on scroll (no GSAP needed here — lightweight) ---------- */
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if ('IntersectionObserver' in window && !prefersReducedMotion) {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    document.querySelectorAll('.reveal').forEach((el) => obs.observe(el));
  } else {
    document.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-visible'));
  }
})();
