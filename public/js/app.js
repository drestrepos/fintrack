// FinTrack — app.js

// ============================================================
// AUTH HELPERS (must be outside DOMContentLoaded so api.js
// 401 handler can call reload before DOM is ready)
// ============================================================
function getStoredToken() { return localStorage.getItem('fintrack-token'); }
function getStoredUser()  {
  try { return JSON.parse(localStorage.getItem('fintrack-user') || 'null'); } catch { return null; }
}
function storeAuth(token, user) {
  if (token) {
    localStorage.setItem('fintrack-token', token);
    localStorage.setItem('fintrack-user', JSON.stringify(user || {}));
  } else {
    localStorage.removeItem('fintrack-token');
    localStorage.removeItem('fintrack-user');
  }
}

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

  // Returns e.g. "$150,000" or "-$50,000" — always explicit sign for negatives
  function signedCOP(centavos) {
    return centavos < 0
      ? '-' + formatCOP(Math.abs(centavos))
      : formatCOP(centavos);
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

  function localDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function today() { return localDateStr(new Date()); }

  function formatDateLabel(dateStr) {
    const t    = today();
    const yest = localDateStr(new Date(new Date().setDate(new Date().getDate() - 1)));
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

  function formatDateShort(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  }

  function formatDateTime(isoString) {
    if (!isoString) return '';
    const dt   = new Date(isoString);
    const dd   = String(dt.getDate()).padStart(2, '0');
    const mm   = String(dt.getMonth() + 1).padStart(2, '0');
    const yyyy = dt.getFullYear();
    const hh   = String(dt.getHours()).padStart(2, '0');
    const min  = String(dt.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  }

  // Convierte "YYYY-MM-DD" a "dd/mm/yyyy" sin conversión de zona horaria
  function formatDateField(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  }

  // Extrae hora local HH:MM de un timestamp ISO
  function formatTimeLocal(isoString) {
    if (!isoString) return '';
    const dt = new Date(isoString);
    return `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
  }

  // ============================================================
  // AUTH SCREEN CONTROL
  // ============================================================
  const authScreen = $('auth-screen');
  const appDiv     = $('app');

  function showApp() {
    if (authScreen) authScreen.classList.add('hidden');
    if (appDiv)     appDiv.style.display = '';
    // Update email display in Config
    const user = getStoredUser();
    const emailEl = $('config-user-email');
    if (emailEl && user?.email) emailEl.textContent = user.email;
  }
  function showAuth() {
    if (authScreen) authScreen.classList.remove('hidden');
    if (appDiv)     appDiv.style.display = 'none';
  }

  // ============================================================
  // ESTADO GLOBAL DE CACHÉ
  // ============================================================
  let _cachedAccounts   = [];
  let _cachedCategories = [];
  let _txCache          = null;

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
    if (viewName === 'budget')       loadBudget();
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
      if (!open) {
        cfg.rowsEl.innerHTML = '';
        cfg.checkEl.style.display = 'none';
      } else if (cfg.rowsEl.querySelectorAll('.entry-row').length === 0) {
        cfg.rowsEl.appendChild(buildDeRow(cfg));
        updateDePercent(cfg);
      }
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
          notes:       payload.notes || null,
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
    populateAccountSelects();
    populateCategorySelects();
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
    const notes     = $('tx-notes')?.value.trim() || null;
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
        type, date: today(), notes,
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
  // 7. ACTION SHEET + EDIT SHEET (genéricos)
  // ============================================================
  const EDIT_ICONS = ['🏦','💰','💳','💵','👤','📱','🔴','💜','🏠','🚗',
                      '🛒','🍕','🚗','✈️','💊','📚','🎮','🏠','💡','🎁'];

  function iconPickerHtml(selectedIcon) {
    return `<div class="icon-picker">` +
      EDIT_ICONS.map(ic =>
        `<button type="button" class="icon-opt${ic === selectedIcon ? ' active' : ''}" data-icon="${ic}">${ic}</button>`
      ).join('') + `</div>`;
  }

  function openActionSheet(title, options) {
    const overlay = $('action-sheet-overlay');
    const titleEl = $('action-sheet-title');
    const bodyEl  = $('action-sheet-body');
    if (!overlay) return;
    titleEl.textContent = title;
    bodyEl.innerHTML = '';
    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'action-item' + (opt.danger ? ' danger' : '');
      btn.textContent = opt.label;
      btn.addEventListener('click', () => { closeActionSheet(); opt.handler(); });
      bodyEl.appendChild(btn);
    });
    overlay.classList.add('open');
  }

  function closeActionSheet() { $('action-sheet-overlay')?.classList.remove('open'); }

  $('action-sheet-cancel')?.addEventListener('click', closeActionSheet);
  $('action-sheet-overlay')?.addEventListener('click', e => {
    if (e.target === $('action-sheet-overlay')) closeActionSheet();
  });

  let _editSheetOnSave = null;

  function openEditSheet(title, bodyHTML, onSave) {
    const overlay = $('edit-sheet-overlay');
    if (!overlay) return;
    $('edit-sheet-title').textContent = title;
    const bodyEl = $('edit-sheet-body');
    bodyEl.innerHTML = bodyHTML;
    bodyEl.querySelectorAll('.icon-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        bodyEl.querySelectorAll('.icon-opt').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
      });
    });
    _editSheetOnSave = onSave;
    overlay.classList.add('open');
    // Focus first text input
    setTimeout(() => bodyEl.querySelector('input')?.focus(), 100);
  }

  function closeEditSheet() { $('edit-sheet-overlay')?.classList.remove('open'); }

  $('edit-sheet-cancel')?.addEventListener('click', closeEditSheet);
  $('edit-sheet-overlay')?.addEventListener('click', e => {
    if (e.target === $('edit-sheet-overlay')) closeEditSheet();
  });
  $('edit-sheet-submit')?.addEventListener('click', async () => {
    if (_editSheetOnSave) await _editSheetOnSave();
  });

  // Generic confirm-delete helper (opens nested action sheet)
  function confirmDelete(label, onConfirm) {
    openActionSheet('¿Confirmar eliminación?', [
      { label: `🗑️ ${label}`, danger: true, handler: async () => {
        try { await onConfirm(); }
        catch (err) { showToast(err.message, 'error'); }
      }},
    ]);
  }

  // Edit helpers per entity type
  function openEditAccount(id, currentName, currentIcon, currentType) {
    const typeOpts = [
      ['bank',   '🏦 Banco'],
      ['wallet', '💰 Billetera'],
      ['cash',   '💵 Efectivo'],
      ['credit', '💳 Crédito'],
      ['person', '👤 Persona'],
    ].map(([v, lbl]) =>
      `<option value="${v}"${v === currentType ? ' selected' : ''}>${lbl}</option>`
    ).join('');

    openEditSheet('Editar cuenta', `
      <div class="field" style="margin-bottom:10px;"><div class="field-inner">
        <input type="text" id="es-name" class="field-input" value="${escHtml(currentName)}" placeholder="Nombre">
      </div></div>
      <div class="field" style="margin-bottom:10px;"><div class="field-inner">
        <span class="field-icon">📂</span>
        <select id="es-type" class="field-input">${typeOpts}</select>
      </div></div>
      <div class="modal-section-lbl">Ícono</div>
      ${iconPickerHtml(currentIcon)}`, async () => {
      const newName = $('es-name')?.value.trim();
      const newType = $('es-type')?.value || currentType;
      const newIcon = $('edit-sheet-body')?.querySelector('.icon-opt.active')?.dataset.icon || currentIcon;
      if (!newName) { showToast('Escribe un nombre', 'error'); return; }
      try {
        await API.updateAccount(id, { name: newName, icon: newIcon, type: newType });
        showToast('Cuenta actualizada ✓', 'success');
        closeEditSheet();
        await refreshAccounts();
        loadResumen();
      } catch (err) { showToast('Error: ' + err.message, 'error'); }
    });
  }

  function openEditCategory(id, currentName, currentIcon) {
    openEditSheet('Editar categoría', `
      <div class="field" style="margin-bottom:10px;"><div class="field-inner">
        <input type="text" id="es-name" class="field-input" value="${escHtml(currentName)}" placeholder="Nombre">
      </div></div>
      <div class="modal-section-lbl">Ícono</div>
      ${iconPickerHtml(currentIcon)}`, async () => {
      const newName = $('es-name')?.value.trim();
      const newIcon = $('edit-sheet-body')?.querySelector('.icon-opt.active')?.dataset.icon || currentIcon;
      if (!newName) { showToast('Escribe un nombre', 'error'); return; }
      try {
        await API.updateCategory(id, { name: newName, icon: newIcon });
        showToast('Categoría actualizada ✓', 'success');
        closeEditSheet();
        loadCategories();
        loadResumen();
      } catch (err) { showToast('Error: ' + err.message, 'error'); }
    });
  }

  function openEditTransaction(txId, currentDesc) {
    openEditSheet('Editar descripción', `
      <div class="field" style="margin-bottom:10px;"><div class="field-inner">
        <input type="text" id="es-name" class="field-input" value="${escHtml(currentDesc)}" placeholder="Descripción">
      </div></div>`, async () => {
      const newDesc = $('es-name')?.value.trim();
      if (!newDesc) { showToast('Escribe una descripción', 'error'); return; }
      try {
        await API.updateTransaction(txId, { description: newDesc });
        showToast('Descripción actualizada ✓', 'success');
        closeEditSheet();
        invalidateTxCache();
        loadAllTransactions();
        loadTransactions();
        loadDashboard();
      } catch (err) { showToast('Error: ' + err.message, 'error'); }
    });
  }

  function openEditBudget(id, currentAmountCentavos, currentPayDay) {
    openEditSheet('Editar presupuesto', `
      <div class="field" style="margin-bottom:10px;"><div class="field-inner">
        <span class="field-icon">$</span>
        <input type="number" id="es-amount" class="field-input mono"
          value="${Math.round(currentAmountCentavos / 100)}"
          placeholder="Monto en pesos" inputmode="decimal" min="0" step="1000">
      </div></div>
      <div class="field"><div class="field-inner">
        <span class="field-icon">📅</span>
        <input type="number" id="es-payday" class="field-input mono"
          value="${currentPayDay || ''}"
          placeholder="Día de pago (opcional, ej: 15)" inputmode="numeric" min="1" max="31">
      </div></div>`, async () => {
      const pesos  = parseFloat($('es-amount')?.value  || '0');
      const payDay = parseInt($('es-payday')?.value || '0', 10) || null;
      if (pesos <= 0) { showToast('Escribe un monto válido', 'error'); return; }
      try {
        await API.updateBudget(id, { amount: Math.round(pesos * 100), pay_day: payDay });
        showToast('Presupuesto actualizado ✓', 'success');
        closeEditSheet();
        loadBudget();
      } catch (err) { showToast('Error: ' + err.message, 'error'); }
    });
  }

  async function toggleBudgetFulfilled(id, value) {
    try {
      await API.updateBudget(id, { fulfilled: value });
      showToast(value ? 'Marcado como cumplido ✓' : 'Desmarcado', 'success');
      loadBudget();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  }

  // ============================================================
  // 8. FILTER CHIPS + DROPDOWNS (Movimientos)
  // ============================================================
  let _currentFilter    = 'all';
  let _filterAccountId  = '';
  let _filterCategoryId = '';

  $$('#tx-filters .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      $$('#tx-filters .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      _currentFilter = chip.dataset.filter;
      loadAllTransactions();
    });
  });

  $('filter-account')?.addEventListener('change', e => {
    _filterAccountId = e.target.value;
    e.target.classList.toggle('has-value', !!e.target.value);
    loadAllTransactions();
  });

  $('filter-category')?.addEventListener('change', e => {
    _filterCategoryId = e.target.value;
    e.target.classList.toggle('has-value', !!e.target.value);
    loadAllTransactions();
  });

  function goToTransactions(filterType, filterId) {
    // Reset chip
    _currentFilter = 'all';
    $$('#tx-filters .chip').forEach(c => c.classList.toggle('active', c.dataset.filter === 'all'));

    _filterAccountId  = filterType === 'account'  ? filterId : '';
    _filterCategoryId = filterType === 'category' ? filterId : '';

    const accSel = $('filter-account');
    if (accSel) { accSel.value = _filterAccountId; accSel.classList.toggle('has-value', !!_filterAccountId); }
    const catSel = $('filter-category');
    if (catSel) { catSel.value = _filterCategoryId; catSel.classList.toggle('has-value', !!_filterCategoryId); }

    navigateTo('transactions');
    loadAllTransactions();
    setTimeout(() => $('view-transactions')?.scrollTo(0, 0), 0);
  }

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
  // MOVIMIENTOS — selector de mes
  // ============================================================
  let txMonth = new Date().getMonth(); // 0-indexed
  let txYear  = new Date().getFullYear();

  function renderTxPeriod() {
    const lbl = $('tx-period-label');
    if (lbl) lbl.textContent = `${MONTHS[txMonth]} ${txYear}`;
  }

  $('tx-prev') && $('tx-prev').addEventListener('click', () => {
    if (--txMonth < 0) { txMonth = 11; txYear--; }
    renderTxPeriod(); invalidateTxCache(); loadAllTransactions();
  });
  $('tx-next') && $('tx-next').addEventListener('click', () => {
    if (++txMonth > 11) { txMonth = 0; txYear++; }
    renderTxPeriod(); invalidateTxCache(); loadAllTransactions();
  });

  renderTxPeriod();

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
      renderResumenBalanceCard(data);
      const allAccounts = [...(data.accounts || []), ...(data.persons || [])];
      renderResumenAccounts(allAccounts, data.net_total);
      renderResumenCategories(data.categories);
    } catch (e) {
      console.error('Error cargando resumen:', e);
    }
  }

  function renderResumenBalanceCard(data) {
    const totalEl = $('resumen-balance-total');
    if (totalEl) totalEl.textContent = signedCOP(data.net_total || 0);

    // credit: always negative (liability). person/asset: sign follows balance value.
    const typeMap = {
      'resumen-bal-banks':   { val: data.balance_banks   || 0, mode: 'asset'  },
      'resumen-bal-wallets': { val: data.balance_wallets || 0, mode: 'asset'  },
      'resumen-bal-cash':    { val: data.balance_cash    || 0, mode: 'asset'  },
      'resumen-bal-credit':  { val: data.balance_credit  || 0, mode: 'credit' },
      'resumen-bal-persons': { val: data.balance_persons || 0, mode: 'person' },
    };
    Object.entries(typeMap).forEach(([id, { val, mode }]) => {
      const el = $(id);
      if (!el) return;
      el.textContent = signedCOP(val);
      const cls = (mode === 'credit' || val < 0) ? 'neg' : 'pos';
      el.className = 'rbc-val ' + cls;
    });
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
      // credit: balance is negative for debt → always red, show absolute value
      // person: positive = te deben (green), negative = les debes (red)
      // asset: red only if overdraft (negative)
      const isCredit = a.type === 'credit';
      const neg      = (isCredit || a.balance < 0) ? ' neg' : '';
      const dispBal  = signedCOP(a.balance);
      return `<div class="account-card">
        <div class="account-icon ${meta.cls}">${escHtml(a.icon || meta.emoji)}</div>
        <div class="account-info">
          <div class="account-name">${escHtml(a.name)}</div>
          <div class="account-type">${meta.label}</div>
        </div>
        <div class="account-balance${neg}">${dispBal}</div>
        <button type="button" class="more-btn"
          data-acctid="${a.id}"
          data-acctname="${escHtml(a.name)}"
          data-accticon="${escHtml(a.icon || meta.emoji)}"
          data-accttype="${a.type}"
          aria-label="Opciones">···</button>
      </div>`;
    }).join('');

    if (netEl) netEl.textContent = formatCOP(netTotal || 0);

    list.querySelectorAll('.more-btn[data-acctid]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id   = btn.dataset.acctid;
        const name = btn.dataset.acctname;
        const icon = btn.dataset.accticon;
        const type = btn.dataset.accttype;
        openActionSheet(name, [
          { label: '✏️ Editar', handler: () => openEditAccount(id, name, icon, type) },
          { label: '🗑️ Eliminar cuenta', danger: true, handler: () =>
            confirmDelete('Eliminar cuenta', async () => {
              await API.deleteAccount(id);
              showToast('Cuenta eliminada', 'success');
              await refreshAccounts();
              loadResumen();
            })
          },
        ]);
      });
    });

    // Card click → go to Movimientos filtered by account
    list.querySelectorAll('.account-card').forEach(card => {
      const id = card.querySelector('.more-btn')?.dataset.acctid;
      if (!id) return;
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => goToTransactions('account', id));
    });
  }

  function renderResumenCategories(categories) {
    const list = $('resumen-categories-list');
    if (!list) return;

    if (!categories.length) {
      list.innerHTML = `<div class="empty-state"><div class="empty-icon">🏷️</div>
        <div class="empty-title">No hay categorías</div></div>`;
      return;
    }

    const active  = categories.filter(c => c.income > 0 || c.expense > 0);
    const inactive = categories.filter(c => c.income === 0 && c.expense === 0);

    function catRow(cat) {
      const hasActivity = cat.income > 0 || cat.expense > 0;
      const cls  = !hasActivity ? 'muted' : (cat.total >= 0 ? 'income' : 'expense');
      const sign = cat.total > 0 ? '+' : '';
      const amt  = hasActivity ? `${sign}${formatCOP(Math.abs(cat.total))}` : '<span style="color:var(--text-muted)">$0</span>';
      return `<div class="tx-group-item">
        <div class="tx-icon">${escHtml(cat.icon || '🏷️')}</div>
        <div class="tx-info">
          <div class="tx-name"${!hasActivity ? ' style="color:var(--text-muted)"' : ''}>${escHtml(cat.name)}</div>
        </div>
        <div class="tx-amount ${cls}">${amt}</div>
        <button class="btn-cat-menu" data-id="${escHtml(cat.id)}" data-name="${escHtml(cat.name)}" data-icon="${escHtml(cat.icon || '')}" title="Opciones">···</button>
      </div>`;
    }

    let html = '<div class="tx-group">';
    if (active.length)  html += active.map(catRow).join('');
    if (active.length && inactive.length) {
      html += `<div class="tx-group-divider" style="font-size:11px;color:var(--text-muted);padding:6px 0 2px;border-top:1px solid var(--border);margin-top:4px;">Sin movimientos este mes</div>`;
    }
    if (inactive.length) html += inactive.map(catRow).join('');
    html += '</div>';

    list.innerHTML = html;

    list.querySelectorAll('.btn-cat-menu').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openCategoryActionSheet(btn.dataset.id, btn.dataset.name, btn.dataset.icon || '');
      });
    });

    // Row click → go to Movimientos filtered by category
    list.querySelectorAll('.tx-group-item').forEach(item => {
      const id = item.querySelector('.btn-cat-menu')?.dataset.id;
      if (!id) return;
      item.style.cursor = 'pointer';
      item.addEventListener('click', () => goToTransactions('category', id));
    });
  }

  function openCategoryActionSheet(id, name, icon) {
    openActionSheet(name, [
      { label: '✏️ Editar categoría', handler: () => openEditCategoryModal(id, name, icon) },
      { label: '🗑️ Eliminar categoría', handler: () => confirmDeleteCategory(id, name), danger: true },
    ]);
  }

  function openEditCategoryModal(id, currentName, currentIcon) {
    const overlay  = $('modal-edit-category-overlay');
    const nameInp  = $('edit-category-name');
    const iconPicker = $('edit-category-icon-picker');
    if (!overlay) return;

    // Pre-populate
    if (nameInp) nameInp.value = currentName || '';

    // Select matching icon or first
    let matched = false;
    iconPicker?.querySelectorAll('.icon-opt').forEach(opt => {
      const isMatch = opt.dataset.icon === currentIcon;
      opt.classList.toggle('active', isMatch);
      if (isMatch) matched = true;
    });
    if (!matched) iconPicker?.querySelector('.icon-opt')?.classList.add('active');

    overlay._editId   = id;
    overlay._editIcon = currentIcon || iconPicker?.querySelector('.icon-opt.active')?.dataset.icon || '📁';
    overlay.classList.add('open');
    nameInp?.focus();
  }

  function initEditCategoryModal() {
    const overlay   = $('modal-edit-category-overlay');
    if (!overlay) return;
    const closeBtn  = $('edit-category-close');
    const nameInp   = $('edit-category-name');
    const submitBtn = $('edit-category-submit');
    const iconPicker = $('edit-category-icon-picker');

    function closeModal() { overlay.classList.remove('open'); }

    closeBtn?.addEventListener('click', closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

    iconPicker?.querySelectorAll('.icon-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        iconPicker.querySelectorAll('.icon-opt').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        overlay._editIcon = opt.dataset.icon;
      });
    });

    submitBtn?.addEventListener('click', async () => {
      const name = nameInp?.value.trim();
      const icon = overlay._editIcon || '📁';
      const id   = overlay._editId;
      if (!name) { showToast('Escribe un nombre', 'error'); return; }
      if (!id)   return;
      submitBtn.textContent = 'Guardando…'; submitBtn.disabled = true;
      try {
        await API.updateCategory(id, { name, icon });
        showToast('Categoría actualizada ✓');
        closeModal();
        await refreshCategories();
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      } finally {
        submitBtn.textContent = 'Guardar cambios'; submitBtn.disabled = false;
      }
    });
  }

  // ============================================================
  // EDITAR TRANSACCIÓN — modal completo
  // ============================================================
  function openEditTxModal(tx) {
    const overlay = $('modal-edit-tx-overlay');
    if (!overlay) return;
    overlay._editId = tx.id;

    // Type toggle
    const toggle = $('edit-tx-type-toggle');
    if (toggle) {
      toggle.querySelectorAll('.type-toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === tx.type);
      });
    }

    // Fields
    const descInp = $('edit-tx-desc');    if (descInp)    descInp.value    = tx.description || '';
    const amtInp  = $('edit-tx-amount');  if (amtInp)     amtInp.value     = tx.amount ? (tx.amount / 100).toFixed(2) : '';
    const dateInp = $('edit-tx-date');    if (dateInp)    dateInp.value    = tx.date || '';
    const notesInp = $('edit-tx-notes'); if (notesInp)   notesInp.value   = tx.notes || '';

    // Account select
    const accSel = $('edit-tx-account');
    if (accSel) {
      accSel.innerHTML = '<option value="">Seleccionar cuenta</option>';
      (_cachedAccounts || []).forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = `${a.icon || '🏦'} ${a.name}`;
        opt.selected = a.id === tx.account_id;
        accSel.appendChild(opt);
      });
    }

    // Category select
    const catSel = $('edit-tx-category');
    if (catSel) {
      catSel.innerHTML = '<option value="">Sin categoría</option>';
      (_cachedCategories || []).forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.icon || '🏷️'} ${c.name}`;
        opt.selected = c.id === tx.category_id;
        catSel.appendChild(opt);
      });
    }

    overlay.classList.add('open');
  }

  function initEditTxModal() {
    const overlay   = $('modal-edit-tx-overlay');
    if (!overlay) return;
    const closeBtn  = $('edit-tx-close');
    const cancelBtn = $('edit-tx-cancel');
    const submitBtn = $('edit-tx-submit');
    const toggle    = $('edit-tx-type-toggle');

    function closeModal() { overlay.classList.remove('open'); }

    closeBtn?.addEventListener('click', closeModal);
    cancelBtn?.addEventListener('click', closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

    // Type toggle
    toggle?.querySelectorAll('.type-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        toggle.querySelectorAll('.type-toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    submitBtn?.addEventListener('click', async () => {
      const txId = overlay._editId;
      if (!txId) return;
      const desc  = $('edit-tx-desc')?.value.trim();
      const amt   = parseFloat($('edit-tx-amount')?.value || '0');
      const type  = toggle?.querySelector('.type-toggle-btn.active')?.dataset.type || 'debit';
      const date  = $('edit-tx-date')?.value;
      const accId = $('edit-tx-account')?.value;
      const catId = $('edit-tx-category')?.value;
      const notes = $('edit-tx-notes')?.value.trim();

      if (!desc)  { showToast('Escribe una descripción', 'error'); return; }
      if (!amt || amt <= 0) { showToast('Ingresa un monto válido', 'error'); return; }
      if (!accId) { showToast('Selecciona una cuenta', 'error'); return; }

      submitBtn.textContent = 'Guardando…'; submitBtn.disabled = true;
      try {
        await API.updateTransaction(txId, {
          description: desc,
          amount: Math.round(amt * 100),
          type,
          date: date || undefined,
          account_id: accId,
          category_id: catId || null,
          notes: notes || null,
        });
        showToast('Transacción actualizada ✓', 'success');
        closeModal();
        invalidateTxCache();
        loadAllTransactions();
        loadTransactions();
        loadDashboard();
        loadResumen();
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      } finally {
        submitBtn.textContent = 'Guardar cambios'; submitBtn.disabled = false;
      }
    });
  }

  function confirmDeleteCategory(id, name) {
    if (!window.confirm(`¿Eliminar la categoría "${name}"? Esta acción no se puede deshacer.`)) return;
    API.deleteCategory(id)
      .then(() => { showToast('Categoría eliminada'); refreshCategories(); })
      .catch(err => showToast('Error: ' + err.message, 'error'));
  }

  async function refreshCategories() {
    await loadCategories();
    await loadResumen(resumenYear, resumenMonth);
  }

  function initAddCategoryModal() {
    const overlay  = $('modal-add-category-overlay');
    if (!overlay) return;
    const closeBtn = $('add-category-close');
    const nameInp  = $('add-category-name');
    const submitBtn = $('add-category-submit');
    const iconPicker = $('add-category-icon-picker');
    const colorPicker = $('add-category-color-picker');
    let selectedIcon  = '📁';
    let selectedColor = '#607d8b';

    function openModal() {
      if (nameInp) nameInp.value = '';
      // Highlight first icon/color
      iconPicker?.querySelectorAll('.icon-opt').forEach((el, i) => el.classList.toggle('active', i === 0));
      colorPicker?.querySelectorAll('.color-opt').forEach((el, i) => el.classList.toggle('active', i === 0));
      if (iconPicker) selectedIcon = iconPicker.querySelector('.icon-opt')?.dataset.icon || '📁';
      if (colorPicker) selectedColor = colorPicker.querySelector('.color-opt')?.dataset.color || '#607d8b';
      overlay.classList.add('open');
      nameInp?.focus();
    }

    function closeModal() { overlay.classList.remove('open'); }

    $('btn-add-category')?.addEventListener('click', openModal);
    closeBtn?.addEventListener('click', closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

    iconPicker?.querySelectorAll('.icon-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        iconPicker.querySelectorAll('.icon-opt').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        selectedIcon = opt.dataset.icon;
      });
    });

    colorPicker?.querySelectorAll('.color-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        colorPicker.querySelectorAll('.color-opt').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        selectedColor = opt.dataset.color;
      });
    });

    submitBtn?.addEventListener('click', async () => {
      const name = nameInp?.value.trim();
      if (!name) { showToast('Escribe un nombre para la categoría', 'error'); return; }
      submitBtn.textContent = 'Guardando…'; submitBtn.disabled = true;
      try {
        await API.createCategory({ name, icon: selectedIcon, color: selectedColor });
        showToast('Categoría creada ✓');
        closeModal();
        await loadCategories();
        await loadResumen(resumenYear, resumenMonth);
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      } finally {
        submitBtn.textContent = 'Guardar'; submitBtn.disabled = false;
      }
    });
  }

  // ============================================================
  // 10. DASHBOARD
  // ============================================================
  async function loadDashboard() {
    try {
      const d        = await API.getDashboard();
      const total    = $('balance-total');
      const inc      = $('balance-income');
      const exp      = $('balance-expenses');
      const lbl      = $('balance-month-label');
      const monthNet = $('balance-month-net');
      if (total)    total.textContent    = formatCOP(d.total);
      if (inc)      inc.textContent      = formatCOP(d.monthly_income);
      if (exp)      exp.textContent      = formatCOP(d.monthly_expenses);
      if (lbl)      lbl.textContent      = `Balance ${d.month_label || ''}`;
      if (monthNet) {
        const net = d.month_net || 0;
        monthNet.textContent = (net >= 0 ? '+' : '') + formatCOP(net);
        monthNet.className   = 'balance-month-net ' + (net >= 0 ? 'pos' : 'neg');
      }
    } catch (e) { console.error('Error cargando dashboard:', e); }
  }

  // ============================================================
  // 11. CATEGORÍAS (selects)
  // ============================================================

  function populateCategorySelects() {
    ['tx-category', 'modal-tx-category', 'filter-category'].forEach(id => {
      const sel = $(id); if (!sel) return;
      const isFilter = id === 'filter-category';
      sel.innerHTML = isFilter
        ? '<option value="">Todas las categorías</option>'
        : '<option value="">Categoría (opcional)</option>';
      _cachedCategories.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.icon || '🏷️'} ${c.name}`;
        sel.appendChild(opt);
      });
      if (isFilter && _filterCategoryId) sel.value = _filterCategoryId;
    });
  }

  async function loadCategories() {
    try {
      const cats = await API.getCategories();
      _cachedCategories = cats;
      populateCategorySelects();
    } catch (e) { console.error('Error cargando categorías:', e); }
  }

  // ============================================================
  // 12. CUENTAS — selects + caché para de-panel
  // ============================================================
  function populateAccountSelects() {
    ['tx-account', 'modal-tx-account', 'filter-account'].forEach(id => {
      const sel = $(id); if (!sel) return;
      const isFilter = id === 'filter-account';
      sel.innerHTML = isFilter
        ? '<option value="">Todas las cuentas</option>'
        : '<option value="">Seleccionar cuenta</option>';
      _cachedAccounts.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = `${a.icon || '🏦'} ${a.name}`;
        sel.appendChild(opt);
      });
      if (isFilter && _filterAccountId) sel.value = _filterAccountId;
    });
  }

  async function refreshAccounts() {
    try {
      const accounts = await API.getAccounts();
      _cachedAccounts = accounts;
      populateAccountSelects();
    } catch (e) { console.error('Error cargando cuentas:', e); }
  }

  async function loadAccounts() { return refreshAccounts(); }

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
  function invalidateTxCache() { _txCache = null; }

  function renderTxTotalCard(txs) {
    const card = $('tx-total-card');
    if (!card) return;
    if (!txs.length) { card.style.display = 'none'; return; }
    card.style.display = '';
    // Ingresos/Gastos excluyen "Saldo inicial"; Total incluye todo
    const regular = txs.filter(t => t.description !== 'Saldo inicial');
    const income  = regular.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
    const expense = regular.filter(t => t.type === 'debit').reduce((s, t)  => s + t.amount, 0);
    const total   = txs.reduce((s, t) => s + (t.type === 'credit' ? t.amount : -t.amount), 0);
    if (income > 0 && expense === 0) {
      card.innerHTML = `<span class="tx-tc-lbl">Ingresos:</span><span class="tx-tc-val pos">+${formatCOP(income)}</span>`;
    } else if (expense > 0 && income === 0) {
      card.innerHTML = `<span class="tx-tc-lbl">Gastos:</span><span class="tx-tc-val neg">−${formatCOP(expense)}</span>`;
    } else {
      card.innerHTML = `
        <span class="tx-tc-item"><span class="tx-tc-lbl">Ingresos:</span><span class="tx-tc-val pos">${formatCOP(income)}</span></span>
        <span class="tx-tc-sep">·</span>
        <span class="tx-tc-item"><span class="tx-tc-lbl">Gastos:</span><span class="tx-tc-val neg">${formatCOP(expense)}</span></span>
        <span class="tx-tc-sep">·</span>
        <span class="tx-tc-item"><span class="tx-tc-lbl">Total:</span><span class="tx-tc-val ${total >= 0 ? 'pos' : 'neg'}">${signedCOP(total)}</span></span>`;
    }
  }

  async function loadAllTransactions() {
    try {
      if (!_txCache) _txCache = await API.getAllTransactions(monthKey(txYear, txMonth));

      let txs = _txCache;
      if (_currentFilter === 'income')   txs = txs.filter(t => t.type === 'credit');
      if (_currentFilter === 'expense')  txs = txs.filter(t => t.type === 'debit');
      if (_currentFilter === 'transfer') txs = txs.filter(t => t.description.includes('(PD '));
      if (_filterAccountId)              txs = txs.filter(t => t.account_id  === _filterAccountId);
      if (_filterCategoryId)             txs = txs.filter(t => t.category_id === _filterCategoryId);

      renderTxTotalCard(txs);

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
          const sign = tx.type === 'credit' ? '+' : '−';
          const cls  = tx.type === 'credit' ? 'income' : 'expense';
          return `<div class="tx-group-item" data-txid="${tx.id}" data-txdesc="${escHtml(tx.description)}">
            <div class="tx-icon">${tx.category?.icon || '💸'}</div>
            <div class="tx-info">
              <div class="tx-name">${escHtml(tx.description)}</div>
              <div class="tx-meta">${tx.account?.name || ''}${tx.category ? ' · ' + escHtml(tx.category.name) : ''} · ${formatDateField(tx.date)} ${formatTimeLocal(tx.created_at)}</div>
              ${tx.notes ? `<div class="tx-notes">${escHtml(tx.notes)}</div>` : ''}
            </div>
            <div class="tx-amount ${cls}">${sign}${formatCOP(tx.amount)}</div>
            <button type="button" class="more-btn"
              data-txid="${tx.id}"
              data-txdesc="${escHtml(tx.description)}"
              aria-label="Opciones">···</button>
          </div>`;
        }).join('');
        return `<div class="tx-group">
          <div class="tx-group-date">${formatDateLabel(date)}</div>${rows}</div>`;
      }).join('');
    } catch (e) { console.error('Error cargando movimientos:', e); }
  }

  // ============================================================
  // 15. ACCIONES EN TRANSACCIONES (··· menú)
  // ============================================================
  function initTxActions() {
    const list = $('tx-list-full');
    if (!list) return;

    list.addEventListener('click', e => {
      const btn = e.target.closest('.more-btn[data-txid]');
      if (!btn) return;
      const txId   = btn.dataset.txid;
      const txDesc = btn.dataset.txdesc;
      const tx = (_txCache || []).find(t => t.id === txId);
      openActionSheet(txDesc, [
        { label: '✏️ Editar', handler: () => { if (tx) openEditTxModal(tx); } },
        { label: '🗑️ Eliminar', danger: true, handler: () =>
          confirmDelete('Eliminar transacción', async () => {
            // Delete PD secondary transactions linked to this one
            const pdPrefix = txDesc + ' (PD ';
            const pdTxs = (_txCache || []).filter(t => t.description.startsWith(pdPrefix));
            await API.deleteTransaction(txId);
            for (const pt of pdTxs) {
              await API.deleteTransaction(pt.id);
            }
            invalidateTxCache();
            loadDashboard();
            loadTransactions();
            loadAllTransactions();
            loadResumen();
            showToast('Transacción eliminada', 'success');
          })
        },
      ]);
    });
  }

  // ============================================================
  // 16. PRESUPUESTO — carga y renderizado
  // ============================================================
  async function loadBudget() {
    renderBudgetPeriod();
    try {
      const budgets = await API.getBudgets(monthKey(budgetYear, budgetMonth));
      renderBudgetView(budgets);
    } catch (e) {
      console.error('Error cargando presupuesto:', e);
      showToast('Error cargando presupuesto', 'error');
    }
  }

  function renderBudgetView(budgets) {
    const container = $('budget-categories');
    if (!container) return;

    const totalBudgeted = budgets.reduce((s, b) => s + b.amount, 0);
    const totalSpent    = budgets.reduce((s, b) => s + b.spent,  0);
    const totalLeft     = totalBudgeted - totalSpent;

    // Update existing stat elements in the HTML header
    const elBudget    = $('budget-total-budget');
    const elSpent     = $('budget-total-spent');
    const elRemaining = $('budget-total-remaining');
    const elBar       = $('budget-total-bar');
    if (elBudget)    elBudget.textContent    = formatCOP(totalBudgeted);
    if (elSpent)     elSpent.textContent     = formatCOP(totalSpent);
    if (elRemaining) elRemaining.textContent = formatCOP(Math.abs(totalLeft));
    if (elRemaining) elRemaining.className   = 'bstat-val ' + (totalLeft < 0 ? 'bstat-red' : 'bstat-green');
    if (elBar && totalBudgeted > 0) {
      const barPct = Math.min(Math.round(totalSpent / totalBudgeted * 100), 100);
      elBar.style.width = barPct + '%';
      elBar.className = 'progress-fill ' + (barPct >= 100 ? 'over' : barPct >= 80 ? 'warn' : 'ok');
    }

    if (!budgets.length) {
      container.innerHTML = `<div class="empty-state">
        <div class="empty-icon">🎯</div>
        <div class="empty-title">Sin presupuestos</div>
        <div class="empty-desc">Agrega un presupuesto para este mes</div>
      </div>`;
    } else {
      const now      = new Date();
      const todayDay = now.getDate();
      const isThisMonth = (budgetYear === now.getFullYear() && budgetMonth === now.getMonth());

      function statusBadge(b) {
        if (b.fulfilled) return `<span class="pay-badge pay-done">✓ Cumplido</span>`;
        if (!b.pay_day)  return '';
        const pct = b.amount > 0 ? b.spent / b.amount : 0;
        if (isThisMonth) {
          if (todayDay > b.pay_day) {
            return pct >= 1
              ? `<span class="pay-badge pay-done">✓ Pagado</span>`
              : `<span class="pay-badge pay-due">⚠ Vencido</span>`;
          }
          return `<span class="pay-badge pay-upcoming">📅 Pagar antes del día ${b.pay_day}</span>`;
        }
        return `<span class="pay-badge pay-upcoming">📅 Día ${b.pay_day}</span>`;
      }

      container.innerHTML = budgets.map(b => {
        const pct  = b.amount > 0 ? Math.min(Math.round(b.spent / b.amount * 100), 100) : 0;
        const over = !b.fulfilled && b.spent > b.amount;
        const warn = !b.fulfilled && !over && pct >= 80;
        const barCls = b.fulfilled ? 'ok' : (over ? 'over' : (warn ? 'warn' : 'ok'));
        const left = b.amount - b.spent;
        return `<div class="budget-cat${b.fulfilled ? ' budget-fulfilled' : ''}">
          <div class="budget-cat-header">
            <span class="budget-cat-icon">${b.category?.icon || '🏷️'}</span>
            <span class="budget-cat-name">${escHtml(b.category?.name || '—')}</span>
            <button type="button" class="more-btn"
              data-budgetid="${b.id}"
              data-budgetamt="${b.amount}"
              data-budgetpayday="${b.pay_day || ''}"
              data-budgetfulfilled="${b.fulfilled ? '1' : ''}"
              data-budgetname="${escHtml(b.category?.name || '—')}"
              aria-label="Opciones">···</button>
          </div>
          ${statusBadge(b)}
          <div class="budget-bar-wrap">
            <div class="budget-bar ${barCls}" style="width:${b.fulfilled ? 100 : pct}%"></div>
          </div>
          <div class="budget-cat-footer">
            <span class="budget-spent">${formatCOP(b.spent)} gastado</span>
            <span class="budget-limit ${over ? 'expense' : ''}">${over ? '−' + formatCOP(Math.abs(left)) + ' excedido' : formatCOP(left) + ' restante'}</span>
          </div>
        </div>`;
      }).join('');

      // Wire ··· buttons
      container.querySelectorAll('.more-btn[data-budgetid]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id        = btn.dataset.budgetid;
          const amt       = parseInt(btn.dataset.budgetamt, 10);
          const payDay    = btn.dataset.budgetpayday ? parseInt(btn.dataset.budgetpayday, 10) : null;
          const fulfilled = btn.dataset.budgetfulfilled === '1';
          const name      = btn.dataset.budgetname;
          openActionSheet(name, [
            { label: '✏️ Editar presupuesto', handler: () => openEditBudget(id, amt, payDay) },
            {
              label: fulfilled ? '↩️ Desmarcar cumplido' : '✅ Marcar como Cumplido',
              handler: () => toggleBudgetFulfilled(id, !fulfilled),
            },
            { label: '🗑️ Eliminar presupuesto', danger: true, handler: () =>
              confirmDelete('Eliminar presupuesto', async () => {
                await API.deleteBudget(id);
                showToast('Presupuesto eliminado', 'success');
                loadBudget();
              })
            },
          ]);
        });
      });
    }

    // "Agregar presupuesto" button
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn-primary';
    addBtn.style.cssText = 'width:100%;margin-top:12px;';
    addBtn.textContent = '+ Agregar presupuesto';
    addBtn.addEventListener('click', () => openAddBudgetModal());
    container.appendChild(addBtn);
  }

  // ============================================================
  // 17. MODAL AGREGAR CUENTA
  // ============================================================
  function initAddAccountModal() {
    const overlay  = $('modal-add-account-overlay');
    const closeBtn = $('add-account-close');
    const nameInp  = $('add-account-name');
    const typeInp  = $('add-account-type');
    const balWrap  = $('add-account-balance-wrap');
    const balInp   = $('add-account-balance');
    const iconPicker = $('add-account-icon-picker');
    const submitBtn  = $('add-account-submit');

    if (!overlay) return;

    let selectedIcon = '🏦';

    const creditNote = $('credit-balance-note');

    const personNote = $('person-balance-note');

    function updateTypeUI(type) {
      if (balWrap) balWrap.style.display = '';
      if (creditNote) creditNote.style.display = (type === 'credit') ? '' : 'none';
      if (personNote) personNote.style.display = (type === 'person') ? '' : 'none';
      if (balInp) {
        if (type === 'credit') {
          balInp.placeholder = 'Deuda actual en COP (ej: 500000)';
          balInp.removeAttribute('min');
        } else if (type === 'person') {
          balInp.placeholder = 'Saldo inicial (positivo = te debe, negativo = le debes)';
          balInp.removeAttribute('min');
        } else {
          balInp.placeholder = 'Saldo inicial (opcional)';
          balInp.removeAttribute('min');
        }
      }
    }

    function openAddAccountModal() {
      if (nameInp)  nameInp.value  = '';
      if (balInp)   balInp.value   = '';
      if (typeInp)  typeInp.value  = 'bank';
      updateTypeUI('bank');
      if (iconPicker) {
        iconPicker.querySelectorAll('.icon-opt').forEach((el, i) => {
          el.classList.toggle('active', i === 0);
        });
        selectedIcon = iconPicker.querySelector('.icon-opt')?.textContent || '🏦';
      }
      overlay.classList.add('open');
    }

    function closeAddAccountModal() {
      overlay.classList.remove('open');
    }

    $('btn-add-account')?.addEventListener('click', openAddAccountModal);
    closeBtn?.addEventListener('click', closeAddAccountModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeAddAccountModal(); });

    // Show/hide balance field and credit note based on type
    typeInp?.addEventListener('change', () => updateTypeUI(typeInp.value));

    // Icon picker
    iconPicker?.querySelectorAll('.icon-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        iconPicker.querySelectorAll('.icon-opt').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        selectedIcon = opt.textContent.trim();
      });
    });

    submitBtn?.addEventListener('click', async () => {
      const name = nameInp?.value.trim();
      const type = typeInp?.value || 'bank';
      const balPesos = parseFloat(balInp?.value || '0');

      if (!name) { showToast('Escribe un nombre para la cuenta', 'error'); return; }

      const balCentavos = Math.round(balPesos * 100);

      try {
        await API.createAccount({
          name, type, icon: selectedIcon,
          initial_balance: balCentavos,
        });
        showToast('Cuenta creada ✓', 'success');
        closeAddAccountModal();
        await refreshAccounts();
        loadResumen();
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    });
  }

  // ============================================================
  // 18. MODAL AGREGAR PRESUPUESTO
  // ============================================================
  function openAddBudgetModal() {
    const overlay = $('modal-add-budget-overlay');
    if (!overlay) return;

    const catSel    = $('add-budget-category');
    const amtInp    = $('add-budget-amount');
    const payDayInp = $('add-budget-payday');

    if (amtInp)    amtInp.value    = '';
    if (payDayInp) payDayInp.value = '';

    // Populate categories not yet budgeted this month
    if (catSel) {
      catSel.innerHTML = '<option value="">Seleccionar categoría</option>';
      _cachedCategories.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.icon || '🏷️'} ${c.name}`;
        catSel.appendChild(opt);
      });
    }

    overlay.classList.add('open');
  }

  function initAddBudgetModal() {
    const overlay  = $('modal-add-budget-overlay');
    const closeBtn = $('add-budget-close');
    const submitBtn = $('add-budget-submit');

    if (!overlay) return;

    function closeModal() { overlay.classList.remove('open'); }

    closeBtn?.addEventListener('click', closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

    submitBtn?.addEventListener('click', async () => {
      const catId  = $('add-budget-category')?.value;
      const amount = parseFloat($('add-budget-amount')?.value || '0');
      const payDay = parseInt($('add-budget-payday')?.value || '0', 10) || null;

      if (!catId)         { showToast('Selecciona una categoría', 'error'); return; }
      if (amount <= 0)    { showToast('Escribe un monto válido', 'error'); return; }

      try {
        await API.createBudget({
          category_id: catId,
          month: monthKey(budgetYear, budgetMonth),
          amount: Math.round(amount * 100),
          pay_day: payDay,
        });
        showToast('Presupuesto guardado ✓', 'success');
        closeModal();
        loadBudget();
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    });
  }

  // ============================================================
  // 19. MODAL EXPORTAR A EXCEL
  // ============================================================
  function initExportModal() {
    const overlay   = $('modal-export');
    const closeBtn  = $('export-close');
    const fromInp   = $('export-from');
    const toInp     = $('export-to');
    const submitBtn = $('export-submit');

    if (!overlay) return;

    function todayStr() { return new Date().toISOString().slice(0, 10); }

    function threeMonthsAgo() {
      const d = new Date();
      d.setMonth(d.getMonth() - 3);
      return d.toISOString().slice(0, 10);
    }

    function openExportModal() {
      const t = todayStr();
      const m = threeMonthsAgo();
      if (fromInp) { fromInp.max = t; fromInp.min = m; fromInp.value = m; }
      if (toInp)   { toInp.max   = t; toInp.value   = t; }
      overlay.classList.add('open');
    }

    function closeExportModal() { overlay.classList.remove('open'); }

    $('btn-export')?.addEventListener('click', openExportModal);
    closeBtn?.addEventListener('click', closeExportModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeExportModal(); });

    submitBtn?.addEventListener('click', async () => {
      const from = fromInp?.value;
      const to   = toInp?.value;

      if (!from || !to) { showToast('Selecciona las fechas', 'error'); return; }
      if (from > to)    { showToast('La fecha inicio debe ser anterior al fin', 'error'); return; }

      // Validate max 3-month range
      const msRange = new Date(to) - new Date(from);
      const days    = msRange / 86400000;
      if (days > 93) { showToast('El rango máximo es 3 meses', 'error'); return; }

      try {
        showToast('Exportando...', 'info');
        const token = API.getToken();
        const res = await fetch(`/api/export?from=${from}&to=${to}`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Error desconocido' }));
          throw new Error(err.error || 'Error exportando');
        }
        const blob     = await res.blob();
        const url      = URL.createObjectURL(blob);
        const a        = document.createElement('a');
        const fromStr  = from.replace(/-/g, '');
        const toStr    = to.replace(/-/g, '');
        a.href         = url;
        a.download     = `fintrack_${fromStr}_${toStr}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        closeExportModal();
        showToast('Excel descargado ✓', 'success');
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    });
  }

  // ============================================================
  // AUTH SCREEN INTERACTIONS
  // ============================================================
  function afterAuth() {
    if (!localStorage.getItem('fintrack-onboarding-done') && typeof window._showOnboarding === 'function') {
      window._showOnboarding();
    } else {
      showApp();
      navigateTo('home');
      loadDashboard(); loadCategories(); loadAccounts(); loadTransactions();
    }
  }

  function initAuthScreen() {
    const loginForm    = $('auth-login-form');
    const registerForm = $('auth-register-form');
    const authTabs     = $$('.auth-tab');

    authTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        authTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const form = tab.dataset.form;
        if (loginForm)    loginForm.style.display    = form === 'login'    ? '' : 'none';
        if (registerForm) registerForm.style.display = form === 'register' ? '' : 'none';
        // Hide forgot form when switching tabs
        const forgotForm = $('auth-forgot-form');
        if (forgotForm) forgotForm.style.display = 'none';
        const tabs = $('auth-tabs');
        if (tabs) tabs.style.display = '';
        $('login-error')    && ($('login-error').textContent    = '');
        $('register-error') && ($('register-error').textContent = '');
      });
    });

    loginForm?.addEventListener('submit', async e => {
      e.preventDefault();
      const email    = $('login-email')?.value.trim();
      const password = $('login-password')?.value;
      const errEl    = $('login-error');
      if (errEl) { errEl.style.color = ''; errEl.textContent = ''; }
      const btn = loginForm.querySelector('.auth-submit-btn');
      if (btn) { btn.textContent = 'Entrando…'; btn.disabled = true; }
      try {
        const res = await API.login({ email, password });
        storeAuth(res.session?.access_token, res.user);
        afterAuth();
      } catch (err) {
        if (errEl) errEl.textContent = err.message;
      } finally {
        if (btn) { btn.textContent = 'Entrar'; btn.disabled = false; }
      }
    });

    registerForm?.addEventListener('submit', async e => {
      e.preventDefault();
      const name     = $('register-name')?.value.trim();
      const email    = $('register-email')?.value.trim();
      const password = $('register-password')?.value;
      const confirm  = $('register-confirm')?.value;
      const errEl    = $('register-error');
      if (errEl) { errEl.style.color = ''; errEl.textContent = ''; }
      if (password !== confirm) { if (errEl) errEl.textContent = 'Las contraseñas no coinciden'; return; }
      if (password.length < 6)  { if (errEl) errEl.textContent = 'Mínimo 6 caracteres'; return; }
      const btn = registerForm.querySelector('.auth-submit-btn');
      if (btn) { btn.textContent = 'Creando…'; btn.disabled = true; }
      try {
        const res = await API.register({ email, password, name });
        if (res.session?.access_token) {
          storeAuth(res.session.access_token, res.user);
          afterAuth();
        } else {
          if (errEl) { errEl.style.color = 'var(--income)'; errEl.textContent = 'Cuenta creada. Revisa tu email para confirmar.'; }
        }
      } catch (err) {
        if (errEl) errEl.textContent = err.message;
      } finally {
        if (btn) { btn.textContent = 'Crear cuenta'; btn.disabled = false; }
      }
    });

    $('btn-logout')?.addEventListener('click', async () => {
      try { await API.logout(); } catch {}
      storeAuth(null, null);
      _cachedAccounts = []; _cachedCategories = []; _txCache = null;
      showAuth();
      if (loginForm)    loginForm.style.display    = '';
      if (registerForm) registerForm.style.display = 'none';
      const forgotForm = $('auth-forgot-form');
      if (forgotForm) forgotForm.style.display = 'none';
      const tabs = $('auth-tabs');
      if (tabs) tabs.style.display = '';
      authTabs.forEach((t, i) => t.classList.toggle('active', i === 0));
    });

    // Forgot password UI is wired in auth.js via window.initForgotPassword
  }

  // ============================================================
  // INIT
  // ============================================================
  initAddCategoryModal();
  initEditCategoryModal();
  initEditTxModal();
  initAddAccountModal();
  initAddBudgetModal();
  initTxActions();
  initExportModal();

  // auth.js registers window.initOnboarding and window.initForgotPassword
  window.initOnboarding?.(function () {
    showApp();
    navigateTo('home');
    loadDashboard(); loadCategories(); loadAccounts(); loadTransactions();
  });
  window.initForgotPassword?.();

  initAuthScreen();

  if (getStoredToken()) {
    afterAuth();
  } else {
    showAuth();
  }

  console.log('App iniciada correctamente');
});
