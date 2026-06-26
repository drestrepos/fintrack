// FinTrack — app.js
document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  const MONTHS = [
    'Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
  ];

  const THEME_KEY = 'fintrack-theme';

  const $ = id => document.getElementById(id);
  const $$ = sel => document.querySelectorAll(sel);

  function showToast(msg, type = 'success') {
    const container = $('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  // ============================================================
  // 1. TEMA
  // ============================================================
  const html        = document.documentElement;
  const themeSwitch = $('theme-toggle');
  const themeItem   = $('theme-toggle-item');

  function applyTheme(dark) {
    html.setAttribute('data-theme', dark ? 'dark' : 'light');
    themeSwitch && themeSwitch.classList.toggle('on', dark);
    localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
  }

  function toggleTheme() {
    applyTheme(html.getAttribute('data-theme') !== 'dark');
  }

  applyTheme(localStorage.getItem(THEME_KEY) !== 'light');

  themeSwitch && themeSwitch.addEventListener('click', toggleTheme);
  themeItem && themeItem.addEventListener('click', e => {
    if (e.target !== themeSwitch) toggleTheme();
  });

  // ============================================================
  // 2. NAVEGACIÓN
  // ============================================================
  const fab = $('fab');

  function navigateTo(viewName) {
    $$('.view').forEach(v => v.classList.remove('active'));
    const target = $('view-' + viewName);
    if (target) target.classList.add('active');
    $$('#nav-tabs .nav-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.view === viewName);
    });
    fab && fab.classList.toggle('visible', viewName === 'transactions');
  }

  $$('#nav-tabs .nav-tab').forEach(tab => {
    tab.addEventListener('click', () => navigateTo(tab.dataset.view));
  });

  $$('[data-nav]').forEach(el => {
    el.addEventListener('click', () => navigateTo(el.dataset.nav));
  });

  navigateTo('home');

  // ============================================================
  // 3. TOGGLE TIPO DE TRANSACCIÓN
  // ============================================================
  function initTypeToggle(toggleId, onChangeCb) {
    const container = $(toggleId);
    if (!container) return;
    const btns = container.querySelectorAll('.type-toggle-btn');
    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        btns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        onChangeCb && onChangeCb(btn.dataset.type);
      });
    });
  }

  initTypeToggle('type-toggle', type => {
    const label = $('de-contrapartida-label');
    if (label) {
      label.textContent = type === 'debit' ? 'Origen (débito)' : 'Destino (crédito)';
    }
  });

  initTypeToggle('modal-type-toggle', null);

  // ============================================================
  // 4. PARTIDA DOBLE COLAPSABLE
  // ============================================================
  const deToggle = $('de-toggle');
  const dePanel  = $('de-panel');

  if (deToggle && dePanel) {
    deToggle.addEventListener('click', () => {
      const open = dePanel.classList.toggle('open');
      deToggle.classList.toggle('open', open);
    });
  }

  const deAddLine = $('de-add-line');
  const deRows    = $('de-rows');

  if (deAddLine && deRows) {
    deAddLine.addEventListener('click', () => {
      const row = document.createElement('div');
      row.className = 'entry-row';
      row.innerHTML = `
        <span class="entry-account" contenteditable="true">Cuenta</span>
        <span class="entry-side debe">Debe</span>
        <span class="entry-amount" contenteditable="true">$0.00</span>
        <button type="button" style="color:var(--text-dim);font-size:14px;padding:0 4px;"
          onclick="this.parentElement.remove()">✕</button>
      `;
      deRows.appendChild(row);
    });
  }

  // ============================================================
  // 5. MODAL
  // ============================================================
  const modalOverlay = $('modal-overlay');
  const modalClose   = $('modal-close');
  const modalSubmit  = $('modal-submit');

  function openModal() {
    if (!modalOverlay) return;
    modalOverlay.classList.add('open');
    const dateField = $('modal-tx-date');
    if (dateField && !dateField.value) {
      dateField.value = new Date().toISOString().slice(0, 10);
    }
  }

  function closeModal() {
    modalOverlay && modalOverlay.classList.remove('open');
  }

  fab        && fab.addEventListener('click', openModal);
  modalClose && modalClose.addEventListener('click', closeModal);
  modalOverlay && modalOverlay.addEventListener('click', e => {
    if (e.target === modalOverlay) closeModal();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  modalSubmit && modalSubmit.addEventListener('click', () => {
    const name   = $('modal-tx-name')?.value.trim();
    const amount = $('modal-tx-amount')?.value;
    if (!name || !amount || Number(amount) <= 0) {
      showToast('Completa descripción y monto', 'error');
      return;
    }
    showToast('Transacción guardada ✓', 'success');
    closeModal();
  });

  // ============================================================
  // 6. QUICK-ADD
  // ============================================================
  const quickAddForm = $('quick-add-form');
  quickAddForm && quickAddForm.addEventListener('submit', async e => {
    e.preventDefault();
    const name     = $('tx-name')?.value.trim();
    const amount   = parseFloat($('tx-amount')?.value);
    const accountId  = $('tx-account')?.value;
    const categoryId = $('tx-category')?.value;
    const typeBtn  = document.querySelector('#type-toggle .type-toggle-btn.active');
    const type     = typeBtn?.dataset.type || 'debit';

    if (!name) { showToast('Escribe una descripción', 'error'); return; }
    if (!amount || amount <= 0) { showToast('Escribe un monto válido', 'error'); return; }
    if (!accountId) { showToast('Selecciona una cuenta', 'error'); return; }

    try {
      await API.createTransaction({
        description: name,
        amount: Math.round(amount * 100),
        account_id: accountId,
        category_id: categoryId || null,
        type,
        source: 'manual'
      });
      showToast('Transacción registrada ✓', 'success');
      quickAddForm.reset();
      loadTransactions();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  });

  // ============================================================
  // 7. FILTER CHIPS
  // ============================================================
  $$('#tx-filters .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      $$('#tx-filters .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    });
  });

  // ============================================================
  // 8. PRESUPUESTO — PERÍODO
  // ============================================================
  let budgetMonth = new Date().getMonth();
  let budgetYear  = new Date().getFullYear();

  function renderBudgetPeriod() {
    const label = $('budget-period-label');
    if (label) label.textContent = `${MONTHS[budgetMonth]} ${budgetYear}`;
    const headerPeriod = $('header-period');
    if (headerPeriod) {
      headerPeriod.textContent = `${MONTHS[new Date().getMonth()].slice(0, 3)} ${new Date().getFullYear()}`;
    }
  }

  $('budget-prev') && $('budget-prev').addEventListener('click', () => {
    if (--budgetMonth < 0) { budgetMonth = 11; budgetYear--; }
    renderBudgetPeriod();
  });

  $('budget-next') && $('budget-next').addEventListener('click', () => {
    if (++budgetMonth > 11) { budgetMonth = 0; budgetYear++; }
    renderBudgetPeriod();
  });

  renderBudgetPeriod();
// ============================================================
  // 9. CARGAR DATOS INICIALES
  // ============================================================
  async function loadCategories() {
    try {
      const cats = await API.getCategories();
      const selects = ['tx-category', 'modal-tx-category'];
      selects.forEach(id => {
        const sel = $(id);
        if (!sel) return;
        sel.innerHTML = '<option value="">Categoría (opcional)</option>';
        cats.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c.id;
          opt.textContent = `${c.icon} ${c.name}`;
          sel.appendChild(opt);
        });
      });
    } catch (e) {
      console.error('Error cargando categorías:', e);
    }
  }

  async function loadAccounts() {
    try {
      const accounts = await API.getAccounts();
      const selects = ['tx-account', 'modal-tx-account'];
      selects.forEach(id => {
        const sel = $(id);
        if (!sel) return;
        sel.innerHTML = '<option value="">Seleccionar cuenta</option>';
        accounts.forEach(a => {
          const opt = document.createElement('option');
          opt.value = a.id;
          opt.textContent = `${a.icon || '🏦'} ${a.name}`;
          sel.appendChild(opt);
        });
      });
    } catch (e) {
      console.error('Error cargando cuentas:', e);
    }
  }

  async function loadTransactions() {
    try {
      const txs = await API.getTransactions(10);
      const list = $('tx-list');
      if (!list) return;
      if (txs.length === 0) {
        list.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">📭</div>
            <div class="empty-title">Sin movimientos</div>
            <div class="empty-desc">Registra tu primera transacción arriba</div>
          </div>`;
        return;
      }
      list.innerHTML = txs.map(tx => `
        <div class="tx-item">
          <div class="tx-icon">${tx.category?.icon || '💸'}</div>
          <div class="tx-info">
            <div class="tx-name">${tx.description}</div>
            <div class="tx-meta">${tx.account?.name || ''} · ${tx.date}</div>
          </div>
          <div class="tx-amount ${tx.type === 'credit' ? 'income' : 'expense'}">
            ${tx.type === 'credit' ? '+' : '-'}$${(tx.amount/100).toLocaleString('es-CO')}
          </div>
        </div>
      `).join('');
    } catch (e) {
      console.error('Error cargando transacciones:', e);
    }
  }

  // Inicializar
  loadCategories();
  loadAccounts();
  loadTransactions();
});