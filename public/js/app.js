// FinTrack — app.js
document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  // ============================================================
  // CONSTANTES Y HELPERS
  // ============================================================
  const MONTHS = [
    'Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
  ];
  const MONTH_SHORT  = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const WEEKDAY_SHORT = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const THEME_KEY    = 'fintrack-theme';

  const ACCOUNT_META = {
    bank:   { cls: 'ai-checking', emoji: '🏦', label: 'Banco'      },
    wallet: { cls: 'ai-savings',  emoji: '💰', label: 'Billetera'  },
    cash:   { cls: 'ai-cash',     emoji: '💵', label: 'Efectivo'   },
    credit: { cls: 'ai-credit',   emoji: '💳', label: 'Crédito'    },
    person: { cls: 'ai-invest',   emoji: '👤', label: 'Persona'    },
  };

  const $ = id  => document.getElementById(id);
  const $$ = sel => document.querySelectorAll(sel);

  function formatCOP(centavos) {
    return '$' + Math.round(centavos / 100).toLocaleString('es-CO');
  }

  function showToast(msg, type = 'success') {
    const c = $('toast-container');
    if (!c) return;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    c.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function today() { return new Date().toISOString().slice(0, 10); }

  function formatDateLabel(dateStr) {
    const t    = today();
    const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (dateStr === t)    return 'Hoy';
    if (dateStr === yest) return 'Ayer';
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return `${WEEKDAY_SHORT[dt.getDay()]} ${d} ${MONTH_SHORT[m - 1]}`;
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function monthKey(year, month) { // month: 0-indexed
    return `${year}-${String(month + 1).padStart(2, '0')}`;
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

  applyTheme(localStorage.getItem(THEME_KEY) !== 'light');

  themeSwitch && themeSwitch.addEventListener('click', () => applyTheme(html.getAttribute('data-theme') !== 'dark'));
  themeItem   && themeItem.addEventListener('click', e => {
    if (e.target !== themeSwitch) applyTheme(html.getAttribute('data-theme') !== 'dark');
  });

  // ============================================================
  // 2. NAVEGACIÓN
  // ============================================================
  const fab = $('fab');

  function navigateTo(viewName) {
    $$('.view').forEach(v => v.classList.remove('active'));
    const target = $('view-' + viewName);
    if (target) target.classList.add('active');
    $$('#nav-tabs .nav-tab').forEach(t => t.classList.toggle('active', t.dataset.view === viewName));
    fab && fab.classList.toggle('visible', viewName === 'transactions');

    if (viewName === 'transactions') loadAllTransactions();
    if (viewName === 'resumen')      loadResumen();
  }

  $$('#nav-tabs .nav-tab').forEach(tab => tab.addEventListener('click', () => navigateTo(tab.dataset.view)));
  $$('[data-nav]').forEach(el => el.addEventListener('click', () => navigateTo(el.dataset.nav)));

  // ============================================================
  // 3. TOGGLE TIPO DE TRANSACCIÓN
  // ============================================================
  const CONTRAPARTIDA = { credit: 'Destino (crédito)', debit: 'Origen (débito)', transfer: 'Cuenta destino' };

  function getActiveType(toggleId) {
    return document.querySelector(`#${toggleId} .type-toggle-btn.active`)?.dataset.type || 'debit';
  }

  function initTypeToggle(toggleId, onChangeCb) {
    const container = $(toggleId);
    if (!container) return;
    const btns = container.querySelectorAll('.type-toggle-btn');
    btns.forEach(btn => btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      onChangeCb && onChangeCb(btn.dataset.type);
    }));
  }

  initTypeToggle('type-toggle', null);
  initTypeToggle('modal-type-toggle', null);

  // ============================================================
  // 4. PARTIDA DOBLE — PANEL COLAPSABLE (quick-add + modal)
  // ============================================================
  let _cachedAccounts = [];

  function makeDeAccountOptions() {
    return `<option value="">Cuenta…</option>` +
      _cachedAccounts.map(a =>
        `<option value="${a.id}">${escHtml(a.icon || '🏦')} ${escHtml(a.name)}</option>`
      ).join('');
  }

  // cfg = { panel, rowsEl, checkEl, statusEl, amtGetter, toggleId }
  function buildDeRow(cfg) {
    const row = document.createElement('div');
    row.className = 'entry-row';
    row.innerHTML = `
      <select class="de-acct-sel">${makeDeAccountOptions()}</select>
      <input type="number" class="de-pct-inp" placeholder="%" min="0" max="100" step="1" inputmode="numeric">
      <span class="de-amt-display">—</span>
      <button type="button" class="entry-del">✕</button>`;

    const pctInp  = row.querySelector('.de-pct-inp');
    const amtDisp = row.querySelector('.de-amt-display');

    function refreshAmt() {
      const pct  = parseFloat(pctInp.value) || 0;
      const main = cfg.amtGetter(); // pesos
      // formatCOP(centavos): pesos*100 * pct/100 = pesos*pct
      amtDisp.textContent = (pct > 0 && main > 0) ? formatCOP(Math.round(main * pct)) : '—';
      updateDePercent(cfg);
    }

    pctInp.addEventListener('input', refreshAmt);
    row.querySelector('.entry-del').addEventListener('click', () => {
      row.remove();
      updateDePercent(cfg);
    });

    return row;
  }

  function updateDePercent(cfg) {
    const { rowsEl, checkEl, statusEl } = cfg;
    if (!rowsEl || !checkEl || !statusEl) return;
    const rows = rowsEl.querySelectorAll('.entry-row');
    if (!rows.length) { checkEl.style.display = 'none'; return; }
    checkEl.style.display = 'flex';

    let total = 0;
    rows.forEach(r => { total += parseFloat(r.querySelector('.de-pct-inp')?.value || '0') || 0; });
    total = Math.round(total * 10) / 10;

    if (total > 100) {
      statusEl.className   = 'balance-fail';
      statusEl.textContent = `${total}% — excede 100`;
    } else if (total === 100) {
      statusEl.className   = 'balance-ok';
      statusEl.textContent = `${total}% ✓`;
    } else {
      statusEl.className   = '';
      statusEl.textContent = `${total}%`;
    }
  }

  function initDePanel(cfg, addLineId) {
    const toggle  = $(cfg.toggleId);
    const addLine = $(addLineId);

    toggle && toggle.addEventListener('click', () => {
      const open = cfg.panel.classList.toggle('open');
      toggle.classList.toggle('open', open);
      if (!open) { cfg.rowsEl.innerHTML = ''; cfg.checkEl.style.display = 'none'; }
    });

    addLine && addLine.addEventListener('click', () => {
      if (!cfg.rowsEl) return;
      cfg.rowsEl.appendChild(buildDeRow(cfg));
      updateDePercent(cfg);
    });
  }

  function resetDePanel(cfg) {
    const toggle = $(cfg.toggleId);
    cfg.panel?.classList.remove('open');
    toggle?.classList.remove('open');
    if (cfg.rowsEl) cfg.rowsEl.innerHTML = '';
    if (cfg.checkEl) cfg.checkEl.style.display = 'none';
  }

  function refreshDeAmounts(cfg) {
    if (!cfg.panel?.classList.contains('open')) return;
    const main = cfg.amtGetter();
    cfg.rowsEl.querySelectorAll('.entry-row').forEach(row => {
      const pct = parseFloat(row.querySelector('.de-pct-inp')?.value) || 0;
      row.querySelector('.de-amt-display').textContent =
        (pct > 0 && main > 0) ? formatCOP(Math.round(main * pct)) : '—';
    });
  }

  function collectDeEntries(cfg, mainAmountCentavos, txType) {
    if (!cfg.panel?.classList.contains('open')) return null;
    const rows = cfg.rowsEl?.querySelectorAll('.entry-row') || [];
    if (!rows.length) return null;

    const entryType = txType === 'credit' ? 'debit' : 'credit';
    const entries = [];
    for (const row of rows) {
      const accountId = row.querySelector('.de-acct-sel')?.value;
      const pct       = parseFloat(row.querySelector('.de-pct-inp')?.value || '0');
      if (!accountId || pct <= 0) return 'invalid';
      entries.push({
        account_id: accountId,
        amount:     Math.round(mainAmountCentavos * pct / 100),
        entry_type: entryType,
        note:       `Partida doble ${pct}%`,
        pct,
      });
    }
    return entries;
  }

  // Ejecuta el guardado: transacción principal + transacciones PD + journal_entries
  async function executeSave(payload, deEntries) {
    const tx = await API.createTransaction(payload);

    if (deEntries && deEntries.length) {
      for (const entry of deEntries) {
        // Segunda transacción en la cuenta contraparte
        await API.createTransaction({
          description: `${payload.description} (PD ${entry.pct}%)`,
          amount:      entry.amount,
          account_id:  entry.account_id,
          category_id: payload.category_id,
          type:        entry.entry_type,
          date:        payload.date,
        });

        // Journal entry vinculado a la transacción principal
        await API.createJournalEntries({
          transaction_id: tx.id,
          entries: [{
            account_id: entry.account_id,
            amount:     entry.amount,
            entry_type: entry.entry_type,
            note:       entry.note,
          }],
        });
      }
    }

    return { tx, hasPD: !!(deEntries && deEntries.length) };
  }

  // Panel configs
  const qaCfg = {
    toggleId: 'de-toggle',
    panel:    $('de-panel'),
    rowsEl:   $('de-rows'),
    checkEl:  $('de-balance-check'),
    statusEl: $('de-balance-status'),
    amtGetter: () => parseFloat($('tx-amount')?.value) || 0,
  };
  const modalDeCfg = {
    toggleId: 'modal-de-toggle',
    panel:    $('modal-de-panel'),
    rowsEl:   $('modal-de-rows'),
    checkEl:  $('modal-de-balance-check'),
    statusEl: $('modal-de-balance-status'),
    amtGetter: () => parseFloat($('modal-tx-amount')?.value) || 0,
  };

  initDePanel(qaCfg, 'de-add-line');
  initDePanel(modalDeCfg, 'modal-de-add-line');

  $('tx-amount')       && $('tx-amount').addEventListener('input',       () => refreshDeAmounts(qaCfg));
  $('modal-tx-amount') && $('modal-tx-amount').addEventListener('input', () => refreshDeAmounts(modalDeCfg));

  // ============================================================
  // 5. MODAL DE TRANSACCIÓN
  // ============================================================
  const modalOverlay = $('modal-overlay');
  const modalClose   = $('modal-close');
  const modalSubmit  = $('modal-submit');

  function openModal() {
    if (!modalOverlay) return;
    modalOverlay.classList.add('open');
    const df = $('modal-tx-date');
    if (df && !df.value) df.value = today();
  }

  function closeModal() {
    modalOverlay?.classList.remove('open');
    resetDePanel(modalDeCfg);
  }

  function resetModal() {
    ['modal-tx-name','modal-tx-amount','modal-tx-notes'].forEach(id => {
      const el = $(id); if (el) el.value = '';
    });
    const df = $('modal-tx-date'); if (df) df.value = today();
  }

  fab          && fab.addEventListener('click', openModal);
  modalClose   && modalClose.addEventListener('click', closeModal);
  modalOverlay && modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  modalSubmit && modalSubmit.addEventListener('click', async () => {
    const name      = $('modal-tx-name')?.value.trim();
    const amount    = parseFloat($('modal-tx-amount')?.value);
    const accountId = $('modal-tx-account')?.value;
    const catId     = $('modal-tx-category')?.value;
    const date      = $('modal-tx-date')?.value || today();
    const notes     = $('modal-tx-notes')?.value.trim();
    const type      = getActiveType('modal-type-toggle');

    if (!name)            { showToast('Escribe una descripción', 'error'); return; }
    if (!amount || amount <= 0) { showToast('Escribe un monto válido', 'error'); return; }
    if (!accountId)       { showToast('Selecciona una cuenta', 'error'); return; }

    const amountCentavos = Math.round(amount * 100);
    const deEntries = collectDeEntries(modalDeCfg, amountCentavos, type);

    if (deEntries === 'invalid') { showToast('Completa cuenta y % en todas las líneas', 'error'); return; }
    if (deEntries !== null) {
      const totalPct = [...modalDeCfg.rowsEl.querySelectorAll('.de-pct-inp')]
        .reduce((s, el) => s + (parseFloat(el.value) || 0), 0);
      if (totalPct > 100) { showToast('La suma de porcentajes excede 100%', 'error'); return; }
    }

    try {
      const { hasPD } = await executeSave({
        description: name, amount: amountCentavos,
        account_id: accountId, category_id: catId || null,
        type, date, notes: notes || null,
      }, deEntries);

      showToast(hasPD ? 'Transacción y partida doble guardadas ✓' : 'Transacción guardada ✓', 'success');
      resetModal(); closeModal();
      invalidateTxCache(); loadDashboard(); loadTransactions(); loadResumen();
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
  });

  // ============================================================
  // 6. QUICK-ADD FORM
  // ============================================================
  const quickAddForm = $('quick-add-form');

  quickAddForm && quickAddForm.addEventListener('submit', async e => {
    e.preventDefault();
    const name      = $('tx-name')?.value.trim();
    const amount    = parseFloat($('tx-amount')?.value);
    const accountId = $('tx-account')?.value;
    const catId     = $('tx-category')?.value;
    const type      = getActiveType('type-toggle');

    if (!name)            { showToast('Escribe una descripción', 'error'); return; }
    if (!amount || amount <= 0) { showToast('Escribe un monto válido', 'error'); return; }
    if (!accountId)       { showToast('Selecciona una cuenta', 'error'); return; }

    // ---- Partida doble ----
    const amountCentavos = Math.round(amount * 100);
    const deEntries = collectDeEntries(qaCfg, amountCentavos, type);

    if (deEntries === 'invalid') { showToast('Completa cuenta y % en todas las líneas', 'error'); return; }
    if (deEntries !== null) {
      const totalPct = [...qaCfg.rowsEl.querySelectorAll('.de-pct-inp')]
        .reduce((s, el) => s + (parseFloat(el.value) || 0), 0);
      if (totalPct > 100) { showToast('La suma de porcentajes excede 100%', 'error'); return; }
    }

    try {
      const { hasPD } = await executeSave({
        description: name, amount: amountCentavos,
        account_id: accountId, category_id: catId || null,
        type, date: today(),
      }, deEntries);

      showToast(hasPD ? 'Transacción y partida doble guardadas ✓' : 'Transacción registrada ✓', 'success');

      quickAddForm.reset();
      const firstBtn = $$('#type-toggle .type-toggle-btn')[0];
      if (firstBtn) {
        $$('#type-toggle .type-toggle-btn').forEach(b => b.classList.remove('active'));
        firstBtn.classList.add('active');
      }
      resetDePanel(qaCfg);

      invalidateTxCache(); loadDashboard(); loadTransactions(); loadResumen();
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
  });

  // ============================================================
  // 7. FILTER CHIPS (Movimientos)
  // ============================================================
  let _currentFilter = 'all';

  $$('#tx-filters .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      $$('#tx-filters .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      _currentFilter = chip.dataset.filter;
      loadAllTransactions();
    });
  });

  // ============================================================
  // 8. PRESUPUESTO — PERÍODO
  // ============================================================
  let budgetMonth = new Date().getMonth();
  let budgetYear  = new Date().getFullYear();

  function renderBudgetPeriod() {
    const lbl = $('budget-period-label');
    if (lbl) lbl.textContent = `${MONTHS[budgetMonth]} ${budgetYear}`;
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

  const headerPeriod = $('header-period');
  if (headerPeriod) {
    const n = new Date();
    headerPeriod.textContent = `${MONTHS[n.getMonth()].slice(0, 3)} ${n.getFullYear()}`;
  }

  // ============================================================
  // 9. RESUMEN — PERÍODO + CARGA
  // ============================================================
  let resumenMonth = new Date().getMonth(); // 0-indexed
  let resumenYear  = new Date().getFullYear();

  function renderResumenPeriod() {
    const lbl = $('resumen-period-label');
    if (lbl) lbl.textContent = `${MONTHS[resumenMonth]} ${resumenYear}`;
  }

  $('resumen-prev') && $('resumen-prev').addEventListener('click', () => {
    if (--resumenMonth < 0) { resumenMonth = 11; resumenYear--; }
    renderResumenPeriod(); loadResumen();
  });
  $('resumen-next') && $('resumen-next').addEventListener('click', () => {
    if (++resumenMonth > 11) { resumenMonth = 0; resumenYear++; }
    renderResumenPeriod(); loadResumen();
  });

  renderResumenPeriod();

  async function loadResumen() {
    try {
      const data = await API.getResumen(monthKey(resumenYear, resumenMonth));
      renderResumenAccounts(data.accounts, data.net_total);
      renderResumenPersons(data.persons || []);
      renderResumenCategories(data.categories);
    } catch (e) {
      console.error('Error cargando resumen:', e);
    }
  }

  function renderResumenAccounts(accounts, netTotal) {
    const list  = $('resumen-accounts-list');
    const netEl = $('resumen-net-total');
    if (!list) return;

    if (!accounts.length) {
      list.innerHTML = `<div class="empty-state"><div class="empty-icon">🏦</div>
        <div class="empty-title">Sin cuentas</div></div>`;
      if (netEl) netEl.textContent = '$0';
      return;
    }

    list.innerHTML = accounts.map(a => {
      const meta = ACCOUNT_META[a.type] || { cls: 'ai-checking', emoji: '🏦', label: a.type };
      const neg  = a.balance < 0 ? ' neg' : '';
      return `<div class="account-card">
        <div class="account-icon ${meta.cls}">${escHtml(a.icon || meta.emoji)}</div>
        <div class="account-info">
          <div class="account-name">${escHtml(a.name)}</div>
          <div class="account-type">${meta.label}</div>
        </div>
        <div class="account-balance${neg}">${formatCOP(a.balance)}</div>
      </div>`;
    }).join('');

    if (netEl) netEl.textContent = formatCOP(netTotal || 0);
  }

  function renderResumenPersons(persons) {
    const header = $('resumen-persons-header');
    const list   = $('resumen-persons-list');
    if (!list) return;

    if (!persons.length) {
      if (header) header.style.display = 'none';
      list.style.display = 'none';
      return;
    }

    if (header) header.style.display = '';
    list.style.display = '';

    list.innerHTML = persons.map(p => {
      const neg    = p.balance < 0;
      const cls    = neg ? 'expense' : 'income';
      const label  = neg ? 'Les debo' : 'Me debe';
      return `<div class="account-card">
        <div class="account-icon ai-invest">${escHtml(p.icon || '👤')}</div>
        <div class="account-info">
          <div class="account-name">${escHtml(p.name)}</div>
          <div class="account-type">${label}</div>
        </div>
        <div class="account-balance ${cls}">${formatCOP(Math.abs(p.balance))}</div>
      </div>`;
    }).join('');
  }

  function renderResumenCategories(categories) {
    const list = $('resumen-categories-list');
    if (!list) return;

    if (!categories.length) {
      list.innerHTML = `<div class="empty-state"><div class="empty-icon">🏷️</div>
        <div class="empty-title">Sin movimientos este mes</div></div>`;
      return;
    }

    list.innerHTML = `<div class="tx-group">` +
      categories.map(cat => {
        const cls  = cat.total >= 0 ? 'income' : 'expense';
        const sign = cat.total >= 0 ? '+' : '';
        return `<div class="tx-group-item">
          <div class="tx-icon">${escHtml(cat.icon || '🏷️')}</div>
          <div class="tx-info">
            <div class="tx-name">${escHtml(cat.name)}</div>
          </div>
          <div class="tx-amount ${cls}">${sign}${formatCOP(Math.abs(cat.total))}</div>
        </div>`;
      }).join('') + `</div>`;
  }

  // ============================================================
  // 10. DASHBOARD
  // ============================================================
  async function loadDashboard() {
    try {
      const d     = await API.getDashboard();
      const total = $('balance-total');
      const inc   = $('balance-income');
      const exp   = $('balance-expenses');
      if (total) total.textContent = formatCOP(d.balance);
      if (inc)   inc.textContent   = formatCOP(d.monthly_income);
      if (exp)   exp.textContent   = formatCOP(d.monthly_expenses);
    } catch (e) { console.error('Error cargando dashboard:', e); }
  }

  // ============================================================
  // 11. CATEGORÍAS (selects)
  // ============================================================
  async function loadCategories() {
    try {
      const cats = await API.getCategories();
      ['tx-category', 'modal-tx-category'].forEach(id => {
        const sel = $(id); if (!sel) return;
        sel.innerHTML = '<option value="">Categoría (opcional)</option>';
        cats.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c.id;
          opt.textContent = `${c.icon || ''} ${c.name}`;
          sel.appendChild(opt);
        });
      });
    } catch (e) { console.error('Error cargando categorías:', e); }
  }

  // ============================================================
  // 12. CUENTAS — selects + caché para de-panel
  // ============================================================
  async function loadAccounts() {
    try {
      const accounts = await API.getAccounts();
      _cachedAccounts = accounts; // caché completa para de-panel (incluye persons)

      const bankAccounts = accounts.filter(a => a.type !== 'person');

      ['tx-account', 'modal-tx-account'].forEach(id => {
        const sel = $(id); if (!sel) return;
        sel.innerHTML = '<option value="">Seleccionar cuenta</option>';
        bankAccounts.forEach(a => {
          const opt = document.createElement('option');
          opt.value = a.id;
          opt.textContent = `${a.icon || '🏦'} ${a.name}`;
          sel.appendChild(opt);
        });
      });
    } catch (e) { console.error('Error cargando cuentas:', e); }
  }

  // ============================================================
  // 13. TRANSACCIONES RECIENTES (home)
  // ============================================================
  async function loadTransactions() {
    try {
      const txs  = await API.getTransactions(10);
      const list = $('tx-list');
      if (!list) return;

      if (!txs.length) {
        list.innerHTML = `<div class="empty-state">
          <div class="empty-icon">📭</div>
          <div class="empty-title">Sin movimientos</div>
          <div class="empty-desc">Registra tu primera transacción arriba</div>
        </div>`;
        return;
      }

      list.innerHTML = txs.map(tx => {
        const sign = tx.type === 'credit' ? '+' : (tx.type === 'debit' ? '−' : '');
        const cls  = tx.type === 'credit' ? 'income' : (tx.type === 'transfer' ? 'transfer' : 'expense');
        return `<div class="tx-item">
          <div class="tx-icon">${tx.category?.icon || '💸'}</div>
          <div class="tx-info">
            <div class="tx-name">${escHtml(tx.description)}</div>
            <div class="tx-meta">${tx.account?.name || ''} · ${formatDateLabel(tx.date)}</div>
          </div>
          <div class="tx-amount ${cls}">${sign}${formatCOP(tx.amount)}</div>
        </div>`;
      }).join('');
    } catch (e) { console.error('Error cargando transacciones:', e); }
  }

  // ============================================================
  // 14. TODOS LOS MOVIMIENTOS (vista Movimientos)
  // ============================================================
  let _txCache = null;
  function invalidateTxCache() { _txCache = null; }

  async function loadAllTransactions() {
    try {
      if (!_txCache) _txCache = await API.getAllTransactions();

      let txs = _txCache;
      if (_currentFilter === 'income')   txs = txs.filter(t => t.type === 'credit');
      if (_currentFilter === 'expense')  txs = txs.filter(t => t.type === 'debit');
      if (_currentFilter === 'transfer') txs = txs.filter(t => t.type === 'transfer');

      const list = $('tx-list-full');
      if (!list) return;

      if (!txs.length) {
        list.innerHTML = `<div class="empty-state">
          <div class="empty-icon">🔍</div>
          <div class="empty-title">Sin resultados</div>
          <div class="empty-desc">No hay movimientos para este filtro</div>
        </div>`;
        return;
      }

      const groups = {};
      txs.forEach(tx => { (groups[tx.date] = groups[tx.date] || []).push(tx); });

      list.innerHTML = Object.entries(groups).map(([date, items]) => {
        const rows = items.map(tx => {
          const sign = tx.type === 'credit' ? '+' : (tx.type === 'debit' ? '−' : '');
          const cls  = tx.type === 'credit' ? 'income' : (tx.type === 'transfer' ? 'transfer' : 'expense');
          return `<div class="tx-group-item">
            <div class="tx-icon">${tx.category?.icon || '💸'}</div>
            <div class="tx-info">
              <div class="tx-name">${escHtml(tx.description)}</div>
              <div class="tx-meta">${tx.account?.name || ''}${tx.category ? ' · ' + escHtml(tx.category.name) : ''}</div>
            </div>
            <div class="tx-amount ${cls}">${sign}${formatCOP(tx.amount)}</div>
          </div>`;
        }).join('');
        return `<div class="tx-group">
          <div class="tx-group-date">${formatDateLabel(date)}</div>${rows}</div>`;
      }).join('');
    } catch (e) { console.error('Error cargando movimientos:', e); }
  }

  // ============================================================
  // INIT
  // ============================================================
  navigateTo('home');
  loadDashboard();
  loadCategories();
  loadAccounts();
  loadTransactions();
});
