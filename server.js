require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const ws      = require('ws');
const XLSX    = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const app  = express();
const PORT = process.env.PORT || 3000;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  { realtime: { transport: ws } }
);

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ============================================================
// AUTH MIDDLEWARE
// ============================================================
async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  const { data: { user }, error } = await supabase.auth.getUser(header.slice(7));
  if (error || !user) return res.status(401).json({ error: 'Sesión inválida o expirada' });
  req.user = user;
  next();
}

// Apply to all /api/* except health and auth endpoints
app.use('/api', (req, res, next) => {
  if (req.path === '/health' || req.path.startsWith('/auth/')) return next();
  requireAuth(req, res, next);
});

// ============================================================
// HEALTH
// ============================================================
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================================
// AUTH ENDPOINTS
// ============================================================
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { name: name || '' } },
  });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ user: data.user, session: data.session });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ user: data.user, session: data.session });
});

app.post('/api/auth/logout', (req, res) => {
  res.json({ success: true });
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requerido' });
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

// ============================================================
// CUENTAS
// ============================================================
app.get('/api/accounts', async (req, res) => {
  const uid = req.user.id;
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', uid)
    .eq('active', true)
    .order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/accounts', async (req, res) => {
  const uid = req.user.id;
  const { name, type, color, icon, initial_balance } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'name y type son requeridos' });
  const { data, error } = await supabase
    .from('accounts')
    .insert([{ user_id: uid, name, type, color, icon, initial_balance: initial_balance || 0 }])
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.patch('/api/accounts/:id', async (req, res) => {
  const uid = req.user.id;
  const updates = {};
  if (req.body.name !== undefined) updates.name = req.body.name;
  if (req.body.icon !== undefined) updates.icon = req.body.icon;
  if (req.body.type !== undefined) updates.type = req.body.type;
  const { data, error } = await supabase
    .from('accounts').update(updates)
    .eq('id', req.params.id).eq('user_id', uid)
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/accounts/:id', async (req, res) => {
  const { id } = req.params;
  const uid = req.user.id;
  const [txCheck, jeCheck] = await Promise.all([
    supabase.from('transactions').select('id', { count: 'exact', head: true })
      .eq('account_id', id).eq('user_id', uid),
    supabase.from('journal_entries').select('id', { count: 'exact', head: true })
      .eq('account_id', id).eq('user_id', uid),
  ]);
  if (txCheck.error) return res.status(500).json({ error: txCheck.error.message });
  if (jeCheck.error) return res.status(500).json({ error: jeCheck.error.message });
  if ((txCheck.count || 0) > 0 || (jeCheck.count || 0) > 0)
    return res.status(409).json({ error: 'La cuenta tiene movimientos y no puede eliminarse' });
  const { error } = await supabase.from('accounts').delete()
    .eq('id', id).eq('user_id', uid);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ============================================================
// CATEGORÍAS (globales, sin filtro por usuario)
// ============================================================
app.get('/api/categories', async (req, res) => {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.patch('/api/categories/:id', async (req, res) => {
  const updates = {};
  if (req.body.name !== undefined) updates.name = req.body.name;
  if (req.body.icon !== undefined) updates.icon = req.body.icon;
  const { data, error } = await supabase
    .from('categories').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/categories/:id', async (req, res) => {
  const { id } = req.params;
  const uid = req.user.id;
  // Only block if THIS user has transactions with this category
  const txCheck = await supabase
    .from('transactions').select('id', { count: 'exact', head: true })
    .eq('category_id', id).eq('user_id', uid);
  if (txCheck.error) return res.status(500).json({ error: txCheck.error.message });
  if ((txCheck.count || 0) > 0)
    return res.status(409).json({ error: 'La categoría tiene transacciones y no puede eliminarse' });
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ============================================================
// TRANSACCIONES
// ============================================================
app.get('/api/transactions', async (req, res) => {
  const uid   = req.user.id;
  const limit = parseInt(req.query.limit) || 20;
  const { data, error } = await supabase
    .from('transactions')
    .select(`
      *,
      account:accounts(id, name, icon),
      category:categories(id, name, icon)
    `)
    .eq('user_id', uid)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/transactions', async (req, res) => {
  const uid = req.user.id;
  const { date, description, detail, account_id, category_id, amount, type, notes } = req.body;
  if (!description || !account_id || !amount || !type) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }
  const { data, error } = await supabase
    .from('transactions')
    .insert([{
      user_id: uid,
      date: date || new Date().toISOString().slice(0, 10),
      description, detail, account_id, category_id,
      amount: Math.round(amount), type, notes, source: 'manual',
    }])
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.patch('/api/transactions/:id', async (req, res) => {
  const uid = req.user.id;
  const updates = {};
  if (req.body.description !== undefined) updates.description = req.body.description;
  if (req.body.notes       !== undefined) updates.notes       = req.body.notes;
  const { data, error } = await supabase
    .from('transactions').update(updates)
    .eq('id', req.params.id).eq('user_id', uid)
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/transactions/:id', async (req, res) => {
  const uid = req.user.id;
  const { error } = await supabase
    .from('transactions').delete()
    .eq('id', req.params.id).eq('user_id', uid);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ============================================================
// DASHBOARD
// ============================================================
app.get('/api/dashboard', async (req, res) => {
  const uid     = req.user.id;
  const now     = new Date();
  const year    = now.getFullYear();
  const month   = String(now.getMonth() + 1).padStart(2, '0');
  const start   = `${year}-${month}-01`;
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
  const end     = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;

  const [accRes, allTxRes, monthTxRes, allJeRes] = await Promise.all([
    supabase.from('accounts').select('id, type, initial_balance')
      .eq('user_id', uid).eq('active', true),
    supabase.from('transactions').select('account_id, amount, type')
      .eq('user_id', uid).not('description', 'ilike', '%(PD%'),
    supabase.from('transactions').select('amount, type')
      .eq('user_id', uid).gte('date', start).lte('date', end)
      .not('description', 'ilike', '%(PD%'),
    supabase.from('journal_entries').select('account_id, amount, entry_type')
      .eq('user_id', uid),
  ]);

  if (accRes.error)     return res.status(500).json({ error: accRes.error.message });
  if (allTxRes.error)   return res.status(500).json({ error: allTxRes.error.message });
  if (monthTxRes.error) return res.status(500).json({ error: monthTxRes.error.message });
  if (allJeRes.error)   return res.status(500).json({ error: allJeRes.error.message });

  const balMap = {};
  accRes.data.forEach(a => {
    if (a.type !== 'person') balMap[a.id] = { type: a.type, balance: a.initial_balance || 0 };
  });
  allTxRes.data.forEach(tx => {
    if (balMap[tx.account_id] !== undefined)
      balMap[tx.account_id].balance += tx.type === 'credit' ? tx.amount : -tx.amount;
  });

  const personBalMap = {};
  accRes.data.filter(a => a.type === 'person').forEach(a => { personBalMap[a.id] = 0; });
  allJeRes.data.forEach(je => {
    if (personBalMap[je.account_id] !== undefined)
      personBalMap[je.account_id] += je.entry_type === 'credit' ? je.amount : -je.amount;
  });

  let balance_banks = 0, balance_wallets = 0, balance_cash = 0, balance_credit = 0;
  Object.values(balMap).forEach(({ type, balance }) => {
    if (type === 'bank')   balance_banks   += balance;
    if (type === 'wallet') balance_wallets += balance;
    if (type === 'cash')   balance_cash    += balance;
    if (type === 'credit') balance_credit  += balance;
  });
  const balance_persons = Object.values(personBalMap).reduce((s, v) => s + v, 0);
  const total = balance_banks + balance_wallets + balance_cash + balance_credit + balance_persons;

  let monthly_income = 0, monthly_expenses = 0;
  monthTxRes.data.forEach(tx => {
    if (tx.type === 'credit')     monthly_income   += tx.amount;
    else if (tx.type === 'debit') monthly_expenses += tx.amount;
  });

  res.json({
    balance: total,
    balance_banks, balance_wallets, balance_cash, balance_credit, balance_persons,
    total, monthly_income, monthly_expenses,
    period: `${year}-${month}`,
  });
});

// ============================================================
// TRANSACCIONES — sin límite con joins
// ============================================================
app.get('/api/transactions/all', async (req, res) => {
  const uid = req.user.id;
  const { data, error } = await supabase
    .from('transactions')
    .select('*, account:accounts(id,name,icon), category:categories(id,name,icon)')
    .eq('user_id', uid)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ============================================================
// SALDO REAL DE UNA CUENTA
// ============================================================
app.get('/api/accounts/:id/balance', async (req, res) => {
  const uid = req.user.id;
  const { id } = req.params;

  const accRes = await supabase.from('accounts')
    .select('initial_balance, type').eq('id', id).eq('user_id', uid).single();
  if (accRes.error) return res.status(500).json({ error: accRes.error.message });

  let balance = 0;

  if (accRes.data.type === 'person') {
    const jeRes = await supabase.from('journal_entries').select('amount, entry_type')
      .eq('account_id', id).eq('user_id', uid);
    if (jeRes.error) return res.status(500).json({ error: jeRes.error.message });
    jeRes.data.forEach(je => {
      balance += je.entry_type === 'credit' ? je.amount : -je.amount;
    });
  } else {
    const txRes = await supabase.from('transactions').select('amount, type')
      .eq('account_id', id).eq('user_id', uid)
      .not('description', 'ilike', '%(PD%');
    if (txRes.error) return res.status(500).json({ error: txRes.error.message });
    balance = accRes.data.initial_balance || 0;
    txRes.data.forEach(tx => {
      balance += tx.type === 'credit' ? tx.amount : -tx.amount;
    });
  }

  res.json({ balance });
});

// ============================================================
// RESUMEN — cuentas con saldo + personas + categorías del mes
// ============================================================
app.get('/api/resumen', async (req, res) => {
  const uid = req.user.id;
  const raw = req.query.month;
  let year, monthNum;
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    year     = parseInt(raw.split('-')[0]);
    monthNum = parseInt(raw.split('-')[1]);
  } else {
    const now = new Date();
    year     = now.getFullYear();
    monthNum = now.getMonth() + 1;
  }
  const month   = String(monthNum).padStart(2, '0');
  const start   = `${year}-${month}-01`;
  const lastDay = new Date(year, monthNum, 0).getDate();
  const end     = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;

  const [accRes, allTxRes, monthTxRes, allJeRes] = await Promise.all([
    supabase.from('accounts').select('*')
      .eq('user_id', uid).eq('active', true).order('name'),
    supabase.from('transactions').select('account_id, amount, type')
      .eq('user_id', uid).not('description', 'ilike', '%(PD%'),
    supabase.from('transactions')
      .select('category_id, amount, type, category:categories(id,name,icon)')
      .eq('user_id', uid).gte('date', start).lte('date', end),
    supabase.from('journal_entries').select('account_id, amount, entry_type')
      .eq('user_id', uid),
  ]);

  if (accRes.error)     return res.status(500).json({ error: accRes.error.message });
  if (allTxRes.error)   return res.status(500).json({ error: allTxRes.error.message });
  if (monthTxRes.error) return res.status(500).json({ error: monthTxRes.error.message });
  if (allJeRes.error)   return res.status(500).json({ error: allJeRes.error.message });

  const bankAccts   = accRes.data.filter(a => a.type !== 'person');
  const personAccts = accRes.data.filter(a => a.type === 'person');

  const balMap = {};
  bankAccts.forEach(a => { balMap[a.id] = a.initial_balance || 0; });
  allTxRes.data.forEach(tx => {
    if (balMap[tx.account_id] === undefined) return;
    balMap[tx.account_id] += tx.type === 'credit' ? tx.amount : -tx.amount;
  });

  const personBalMap = {};
  personAccts.forEach(a => { personBalMap[a.id] = 0; });
  allJeRes.data.forEach(je => {
    if (personBalMap[je.account_id] === undefined) return;
    personBalMap[je.account_id] += je.entry_type === 'credit' ? je.amount : -je.amount;
  });

  const accounts = bankAccts.map(a => ({
    id: a.id, name: a.name, icon: a.icon, type: a.type,
    balance: balMap[a.id] || 0,
  }));
  const persons = personAccts.map(a => ({
    id: a.id, name: a.name, icon: a.icon, type: 'person',
    balance: personBalMap[a.id] || 0,
  }));

  const balance_banks   = accounts.filter(a => a.type === 'bank').reduce((s, a) => s + a.balance, 0);
  const balance_wallets = accounts.filter(a => a.type === 'wallet').reduce((s, a) => s + a.balance, 0);
  const balance_cash    = accounts.filter(a => a.type === 'cash').reduce((s, a) => s + a.balance, 0);
  const balance_credit  = accounts.filter(a => a.type === 'credit').reduce((s, a) => s + a.balance, 0);
  const balance_persons = persons.reduce((s, a) => s + a.balance, 0);
  const net_total = balance_banks + balance_wallets + balance_cash + balance_credit + balance_persons;

  const catMap = {};
  monthTxRes.data.forEach(tx => {
    if (!tx.category_id) return;
    const k = tx.category_id;
    if (!catMap[k]) {
      catMap[k] = {
        id: tx.category?.id || k, name: tx.category?.name || '—',
        icon: tx.category?.icon || '', income: 0, expense: 0, total: 0,
      };
    }
    if (tx.type === 'credit') {
      catMap[k].income += tx.amount; catMap[k].total += tx.amount;
    } else {
      catMap[k].expense += tx.amount; catMap[k].total -= tx.amount;
    }
  });

  const categories = Object.values(catMap).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

  res.json({ accounts, persons, categories,
    balance_banks, balance_wallets, balance_cash, balance_credit, balance_persons, net_total });
});

// ============================================================
// ASIENTOS CONTABLES (partida doble)
// ============================================================
app.post('/api/journal-entries', async (req, res) => {
  const uid = req.user.id;
  const { transaction_id, entries } = req.body;
  if (!transaction_id || !Array.isArray(entries) || !entries.length) {
    return res.status(400).json({ error: 'transaction_id y entries[] son requeridos' });
  }
  const rows = entries.map(e => ({
    user_id: uid,
    transaction_id,
    account_id: e.account_id,
    entry_type: e.entry_type,
    amount:     Math.round(e.amount || 0),
    note:       e.note || null,
  }));
  const { data, error } = await supabase.from('journal_entries').insert(rows).select();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// ============================================================
// PRESUPUESTOS
// ============================================================
// NOTA: /api/budgets/copy debe ir ANTES de /api/budgets/:id
app.get('/api/budgets/copy', async (req, res) => {
  const uid = req.user.id;
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from y to son requeridos' });

  const { data: source, error } = await supabase
    .from('budgets').select('category_id, amount')
    .eq('month', from).eq('user_id', uid);
  if (error) return res.status(500).json({ error: error.message });
  if (!source.length) return res.json({ copied: 0 });

  const rows = source.map(b => ({
    user_id: uid, category_id: b.category_id, month: to, amount: b.amount,
  }));
  const { data, error: upsertErr } = await supabase
    .from('budgets').upsert(rows, { onConflict: 'user_id,category_id,month' }).select();
  if (upsertErr) return res.status(500).json({ error: upsertErr.message });
  res.json({ copied: data.length });
});

app.get('/api/budgets', async (req, res) => {
  const uid = req.user.id;
  const raw = req.query.month;
  let year, monthNum;
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    year     = parseInt(raw.split('-')[0]);
    monthNum = parseInt(raw.split('-')[1]);
  } else {
    const now = new Date();
    year     = now.getFullYear();
    monthNum = now.getMonth() + 1;
  }
  const monthPad = String(monthNum).padStart(2, '0');
  const monthKey = `${year}-${monthPad}`;
  const start    = `${monthKey}-01`;
  const lastDay  = new Date(year, monthNum, 0).getDate();
  const end      = `${monthKey}-${String(lastDay).padStart(2, '0')}`;

  const [budgetsRes, txRes] = await Promise.all([
    supabase.from('budgets')
      .select('*, category:categories(id, name, icon)')
      .eq('month', monthKey).eq('user_id', uid).order('created_at'),
    supabase.from('transactions')
      .select('category_id, amount, type, description')
      .eq('user_id', uid).gte('date', start).lte('date', end),
  ]);
  if (budgetsRes.error) return res.status(500).json({ error: budgetsRes.error.message });
  if (txRes.error)      return res.status(500).json({ error: txRes.error.message });

  const spentMap = {};
  txRes.data.forEach(tx => {
    if (!tx.category_id) return;
    const k = tx.category_id;
    if (!spentMap[k]) spentMap[k] = 0;
    if (tx.type === 'debit') {
      spentMap[k] += tx.amount;
    } else if (tx.type === 'credit' && tx.description && tx.description.includes('(PD')) {
      spentMap[k] -= tx.amount;
    }
  });

  const result = budgetsRes.data.map(b => ({
    id: b.id, category_id: b.category_id, category: b.category,
    month: b.month, amount: b.amount, spent: spentMap[b.category_id] || 0,
  }));
  res.json(result);
});

app.post('/api/budgets', async (req, res) => {
  const uid = req.user.id;
  const { category_id, month, amount } = req.body;
  if (!category_id || !month || !amount)
    return res.status(400).json({ error: 'category_id, month y amount son requeridos' });
  const { data, error } = await supabase
    .from('budgets')
    .upsert([{ user_id: uid, category_id, month, amount: Math.round(amount) }],
            { onConflict: 'user_id,category_id,month' })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.patch('/api/budgets/:id', async (req, res) => {
  const uid = req.user.id;
  const { amount } = req.body;
  if (!amount) return res.status(400).json({ error: 'amount es requerido' });
  const { data, error } = await supabase
    .from('budgets').update({ amount: Math.round(amount) })
    .eq('id', req.params.id).eq('user_id', uid)
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/budgets/:id', async (req, res) => {
  const uid = req.user.id;
  const { error } = await supabase.from('budgets').delete()
    .eq('id', req.params.id).eq('user_id', uid);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ============================================================
// EXPORTAR A EXCEL
// ============================================================
app.get('/api/export', async (req, res) => {
  const uid = req.user.id;
  const { from, to } = req.query;
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return res.status(400).json({ error: 'Parámetros from y to requeridos (YYYY-MM-DD)' });
  }
  if (from > to) return res.status(400).json({ error: 'from debe ser anterior o igual a to' });

  const { data, error } = await supabase
    .from('transactions')
    .select('date, created_at, description, notes, type, amount, account:accounts(name), category:categories(name)')
    .eq('user_id', uid)
    .gte('date', from).lte('date', to)
    .not('description', 'ilike', '%(PD%')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  const rows = data.map(tx => {
    const dt  = new Date(tx.created_at);
    const hh  = String(dt.getHours()).padStart(2, '0');
    const min = String(dt.getMinutes()).padStart(2, '0');
    return {
      'Fecha':       tx.date,
      'Hora':        `${hh}:${min}`,
      'Descripción': tx.description,
      'Notas':       tx.notes || '',
      'Tipo':        tx.type === 'credit' ? 'Ingreso' : 'Gasto',
      'Monto':       Math.round(tx.amount / 100).toLocaleString('es-CO'),
      'Cuenta':      tx.account?.name || '',
      'Categoría':   tx.category?.name || '',
    };
  });

  const wb  = XLSX.utils.book_new();
  const ws2 = XLSX.utils.json_to_sheet(rows);
  ws2['!cols'] = [
    { wch: 12 }, { wch: 7 }, { wch: 30 }, { wch: 25 },
    { wch: 9 },  { wch: 14 }, { wch: 20 }, { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, ws2, 'Transacciones');

  const fromStr  = from.replace(/-/g, '');
  const toStr    = to.replace(/-/g, '');
  const filename = `fintrack_${fromStr}_${toStr}.xlsx`;

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buf);
});

// ============================================================
// START
// ============================================================
app.listen(PORT, () => {
  console.log(`FinTrack server corriendo en http://localhost:${PORT}`);
});
