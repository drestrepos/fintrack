// FinTrack — auth.js
// Forgot password UI + onboarding wizard
// Loaded after api.js and app.js. Uses global storeAuth/getStoredToken from app.js
// and API from api.js. Exposes window.initOnboarding and window.initForgotPassword.
(function () {
  'use strict';

  const ONBOARDING_KEY = 'fintrack-onboarding-done';

  // 12 default categories created for every new user
  const DEFAULT_CATEGORIES = [
    { name: 'Mercado',        icon: '🛒', color: '#4caf50' },
    { name: 'Comida',         icon: '🍕', color: '#f44336' },
    { name: 'Transporte',     icon: '🚗', color: '#ff9800' },
    { name: 'Servicios',      icon: '💡', color: '#2196f3' },
    { name: 'Salud',          icon: '🏥', color: '#e91e63' },
    { name: 'Viajes',         icon: '✈️', color: '#009688' },
    { name: 'Entretenimiento',icon: '🎬', color: '#9c27b0' },
    { name: 'Ropa',           icon: '👕', color: '#673ab7' },
    { name: 'Educación',      icon: '📚', color: '#3f51b5' },
    { name: 'Gastos apto',    icon: '🏠', color: '#795548' },
    { name: 'Sueldo',         icon: '💼', color: '#1d9e75' },
    { name: 'Otros',          icon: '📦', color: '#607d8b' },
  ];

  // Categories shown in onboarding step 2
  const ONBOARDING_CATS = [
    { name: 'Mercado',    icon: '🛒' },
    { name: 'Comida',     icon: '🍕' },
    { name: 'Transporte', icon: '🚗' },
    { name: 'Servicios',  icon: '💡' },
    { name: 'Salud',      icon: '🏥' },
  ];

  async function createDefaultCategories() {
    try {
      await Promise.allSettled(DEFAULT_CATEGORIES.map(cat => API.createCategory(cat)));
    } catch (e) {
      // Non-fatal: user can add categories manually
    }
  }

  // ============================================================
  // ONBOARDING WIZARD
  // ============================================================
  window.initOnboarding = function initOnboarding(afterDoneCb) {
    const screen = document.getElementById('onboarding-screen');
    if (!screen) return;

    const step1   = document.getElementById('onboarding-step-1');
    const step2   = document.getElementById('onboarding-step-2');
    const dot1    = document.getElementById('ob-dot-1');
    const dot2    = document.getElementById('ob-dot-2');
    const stepLbl = document.getElementById('ob-step-label');

    // Register the show function so app.js can call it after auth
    window._showOnboarding = function () {
      document.getElementById('auth-screen')?.classList.add('hidden');
      const app = document.getElementById('app');
      if (app) app.style.display = 'none';
      screen.style.display = 'flex';
      goToStep(1);
      // Seed default categories for new user (non-blocking)
      createDefaultCategories();
    };

    function completeOnboarding() {
      localStorage.setItem(ONBOARDING_KEY, '1');
      screen.style.display = 'none';
      afterDoneCb();
    }

    function goToStep(n) {
      if (step1)   step1.style.display = n === 1 ? '' : 'none';
      if (step2)   step2.style.display = n === 2 ? '' : 'none';
      if (stepLbl) stepLbl.textContent = `Paso ${n} de 2`;
      if (dot1)    dot1.classList.toggle('active', n === 1);
      if (dot2)    dot2.classList.toggle('active', n === 2);
    }

    // ── Step 1: First account ────────────────────────────────────
    const s1Btn  = document.getElementById('ob-step1-btn');
    const s1Skip = document.getElementById('ob-step1-skip');
    const s1Name = document.getElementById('ob-account-name');
    const s1Type = document.getElementById('ob-account-type');
    const s1Bal  = document.getElementById('ob-account-balance');
    const s1Err  = document.getElementById('ob-step1-error');

    s1Btn?.addEventListener('click', async () => {
      const name = s1Name?.value.trim();
      const type = s1Type?.value || 'bank';
      const bal  = parseFloat(s1Bal?.value || '0');
      if (!name) { setErr(s1Err, 'Escribe el nombre de la cuenta'); return; }
      setErr(s1Err, '');
      s1Btn.textContent = 'Guardando…'; s1Btn.disabled = true;
      try {
        await API.createAccount({
          name, type,
          icon: typeIcon(type),
          initial_balance: Math.round(bal * 100),
        });
        await goStep2();
      } catch (err) {
        setErr(s1Err, err.message);
      } finally {
        s1Btn.textContent = 'Agregar cuenta'; s1Btn.disabled = false;
      }
    });

    s1Skip?.addEventListener('click', () => goStep2());

    async function goStep2() {
      goToStep(2);
      await loadStep2();
    }

    // Called from _showOnboarding to seed categories before wizard
    window._createDefaultCategories = createDefaultCategories;

    // ── Step 2: Monthly budgets ──────────────────────────────────
    const s2Btn  = document.getElementById('ob-step2-btn');
    const s2Skip = document.getElementById('ob-step2-skip');
    const s2List = document.getElementById('ob-budget-list');
    const s2Err  = document.getElementById('ob-step2-error');

    async function loadStep2() {
      if (s2List) s2List.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:8px 0;">Cargando categorías…</div>';
      try {
        const cats = await API.getCategories();
        renderBudgetList(cats);
      } catch {
        renderBudgetList([]);
      }
    }

    function renderBudgetList(allCats) {
      if (!s2List) return;
      s2List.innerHTML = '';

      const matched = ONBOARDING_CATS
        .map(oc => {
          const found = allCats.find(c => c.name.toLowerCase() === oc.name.toLowerCase());
          return found ? { ...found, displayIcon: oc.icon } : null;
        })
        .filter(Boolean);

      // Fallback: first 5 from the API if none matched by name
      const rows = matched.length ? matched : allCats.slice(0, 5).map(c => ({ ...c, displayIcon: c.icon || '📁' }));

      rows.forEach(cat => {
        const row = document.createElement('div');
        row.className = 'ob-budget-row';
        row.innerHTML = `
          <label class="ob-budget-check">
            <input type="checkbox" class="ob-cat-check" data-id="${escHtml(cat.id)}" checked>
            <span class="ob-cat-icon">${cat.displayIcon}</span>
            <span class="ob-cat-name">${escHtml(cat.name)}</span>
          </label>
          <input type="number" class="ob-budget-amount field-input" placeholder="Monto COP" min="0" step="1000">
        `;
        s2List.appendChild(row);
      });
    }

    s2Btn?.addEventListener('click', async () => {
      const now   = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      const entries = [];
      s2List?.querySelectorAll('.ob-budget-row').forEach(row => {
        const chk = row.querySelector('.ob-cat-check');
        const amt = row.querySelector('.ob-budget-amount');
        const val = parseFloat(amt?.value || '0');
        if (chk?.checked && val > 0) {
          entries.push({ category_id: chk.dataset.id, month, amount: Math.round(val * 100) });
        }
      });

      setErr(s2Err, '');
      s2Btn.textContent = 'Guardando…'; s2Btn.disabled = true;
      try {
        if (entries.length) await Promise.all(entries.map(e => API.createBudget(e)));
        completeOnboarding();
      } catch (err) {
        setErr(s2Err, err.message);
        s2Btn.textContent = 'Guardar y empezar'; s2Btn.disabled = false;
      }
    });

    s2Skip?.addEventListener('click', completeOnboarding);
  };

  // ============================================================
  // FORGOT PASSWORD UI
  // ============================================================
  window.initForgotPassword = function initForgotPassword() {
    const loginForm  = document.getElementById('auth-login-form');
    const forgotForm = document.getElementById('auth-forgot-form');
    const tabsEl     = document.getElementById('auth-tabs');
    const forgotBtn  = document.getElementById('btn-forgot-password');
    const backBtn    = document.getElementById('auth-back-to-login');
    const sendBtn    = document.getElementById('btn-send-reset');
    const msgEl      = document.getElementById('forgot-message');
    const emailInp   = document.getElementById('forgot-email');

    function openForgot() {
      if (loginForm)  loginForm.style.display  = 'none';
      if (tabsEl)     tabsEl.style.display     = 'none';
      if (forgotForm) forgotForm.style.display = '';
      if (msgEl) { msgEl.style.color = ''; msgEl.textContent = ''; }
      if (sendBtn) { sendBtn.style.display = ''; sendBtn.textContent = 'Enviar instrucciones'; sendBtn.disabled = false; }
    }

    function closeForgot() {
      if (forgotForm) forgotForm.style.display = 'none';
      if (loginForm)  loginForm.style.display  = '';
      if (tabsEl)     tabsEl.style.display     = '';
      if (emailInp)   emailInp.value           = '';
    }

    forgotBtn?.addEventListener('click', openForgot);
    backBtn?.addEventListener('click', closeForgot);

    sendBtn?.addEventListener('click', async () => {
      const email = emailInp?.value.trim();
      if (msgEl) { msgEl.style.color = ''; msgEl.textContent = ''; }
      if (!email) { if (msgEl) msgEl.textContent = 'Escribe tu correo electrónico'; return; }

      sendBtn.textContent = 'Enviando…'; sendBtn.disabled = true;
      try {
        await API.resetPassword({ email });
        if (msgEl) {
          msgEl.style.color = 'var(--income)';
          msgEl.textContent = 'Te enviamos un email con instrucciones para restablecer tu contraseña';
        }
        if (sendBtn) sendBtn.style.display = 'none';
      } catch (err) {
        if (msgEl) msgEl.textContent = err.message;
        sendBtn.textContent = 'Enviar instrucciones'; sendBtn.disabled = false;
      }
    });
  };

  // ── Helpers ───────────────────────────────────────────────────
  function typeIcon(type) {
    return { bank: '🏦', wallet: '💰', cash: '💵', credit: '💳', person: '👤' }[type] || '💰';
  }

  function setErr(el, msg) { if (el) el.textContent = msg; }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
})();
