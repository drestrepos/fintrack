require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const ws      = require('ws');
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
// HEALTH
// ============================================================
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================================
// CUENTAS
// ============================================================
app.get('/api/accounts', async (req, res) => {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('active', true)
    .order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/accounts', async (req, res) => {
  const { name, type, color, icon, initial_balance } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'name y type son requeridos' });
  const { data, error } = await supabase
    .from('accounts')
    .insert([{ name, type, color, icon, initial_balance: initial_balance || 0 }])
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// ============================================================
// CATEGORÍAS
// ============================================================
app.get('/api/categories', async (req, res) => {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ============================================================
// TRANSACCIONES
// ============================================================
app.get('/api/transactions', async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const { data, error } = await supabase
    .from('transactions')
    .select(`
      *,
      account:accounts(id, name, icon),
      category:categories(id, name, icon)
    `)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/transactions', async (req, res) => {
  const { date, description, detail, account_id, category_id, amount, type, notes } = req.body;
  if (!description || !account_id || !amount || !type) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }
  const { data, error } = await supabase
    .from('transactions')
    .insert([{ date: date || new Date().toISOString().slice(0,10), description, detail, account_id, category_id, amount: Math.round(amount), type, notes, source: 'manual' }])
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.delete('/api/transactions/:id', async (req, res) => {
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ============================================================
// DASHBOARD
// ============================================================
app.get('/api/dashboard', async (req, res) => {
  const now      = new Date();
  const year     = now.getFullYear();
  const month    = String(now.getMonth() + 1).padStart(2, '0');
  const start    = `${year}-${month}-01`;
  const lastDay  = new Date(year, now.getMonth() + 1, 0).getDate();
  const end      = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;

  const [accRes, allTxRes, monthTxRes] = await Promise.all([
    supabase.from('accounts').select('initial_balance').eq('active', true),
    supabase.from('transactions').select('amount, type'),
    supabase.from('transactions').select('amount, type').gte('date', start).lte('date', end),
  ]);

  if (accRes.error)     return res.status(500).json({ error: accRes.error.message });
  if (allTxRes.error)   return res.status(500).json({ error: allTxRes.error.message });
  if (monthTxRes.error) return res.status(500).json({ error: monthTxRes.error.message });

  let balance = accRes.data.reduce((s, a) => s + (a.initial_balance || 0), 0);
  allTxRes.data.forEach(tx => {
    if (tx.type === 'credit')   balance += tx.amount;
    else if (tx.type === 'debit') balance -= tx.amount;
  });

  let monthly_income = 0, monthly_expenses = 0;
  monthTxRes.data.forEach(tx => {
    if (tx.type === 'credit')   monthly_income   += tx.amount;
    else if (tx.type === 'debit') monthly_expenses += tx.amount;
  });

  res.json({ balance, monthly_income, monthly_expenses, period: `${year}-${month}` });
});

// ============================================================
// TRANSACCIONES — sin límite con joins
// ============================================================
app.get('/api/transactions/all', async (req, res) => {
  const { data, error } = await supabase
    .from('transactions')
    .select('*, account:accounts(id,name,icon), category:categories(id,name,icon)')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ============================================================
// SALDO REAL DE UNA CUENTA
// ============================================================
app.get('/api/accounts/:id/balance', async (req, res) => {
  const { id } = req.params;

  const accRes = await supabase.from('accounts').select('initial_balance, type').eq('id', id).single();
  if (accRes.error) return res.status(500).json({ error: accRes.error.message });

  let balance = 0;

  if (accRes.data.type === 'person') {
    // Persona: sum(journal_entries credit) - sum(journal_entries debit)
    const jeRes = await supabase.from('journal_entries').select('amount, entry_type').eq('account_id', id);
    if (jeRes.error) return res.status(500).json({ error: jeRes.error.message });
    jeRes.data.forEach(je => {
      balance += je.entry_type === 'credit' ? je.amount : -je.amount;
    });
  } else {
    // bank/wallet/cash/credit: initial_balance + credits - debits de transactions
    const txRes = await supabase.from('transactions').select('amount, type').eq('account_id', id);
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
  const raw = req.query.month; // 'YYYY-MM' o vacío → mes actual
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
    supabase.from('accounts').select('*').eq('active', true).order('name'),
    supabase.from('transactions').select('account_id, amount, type'),
    supabase.from('transactions')
      .select('category_id, amount, type, category:categories(id,name,icon)')
      .gte('date', start).lte('date', end),
    supabase.from('journal_entries').select('account_id, amount, entry_type'),
  ]);

  if (accRes.error)     return res.status(500).json({ error: accRes.error.message });
  if (allTxRes.error)   return res.status(500).json({ error: allTxRes.error.message });
  if (monthTxRes.error) return res.status(500).json({ error: monthTxRes.error.message });
  if (allJeRes.error)   return res.status(500).json({ error: allJeRes.error.message });

  const bankAccts   = accRes.data.filter(a => a.type !== 'person');
  const personAccts = accRes.data.filter(a => a.type === 'person');

  // Saldo cuentas bank/wallet/cash/credit: initial_balance + credits - debits
  const balMap = {};
  bankAccts.forEach(a => { balMap[a.id] = a.initial_balance || 0; });
  allTxRes.data.forEach(tx => {
    if (balMap[tx.account_id] === undefined) return;
    balMap[tx.account_id] += tx.type === 'credit' ? tx.amount : -tx.amount;
  });

  // Saldo personas: sum(journal_entries credit) - sum(journal_entries debit)
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

  // net_total: solo bank + wallet + cash (no credit, no person)
  const NET_TYPES = ['bank', 'wallet', 'cash'];
  const net_total = accounts
    .filter(a => NET_TYPES.includes(a.type))
    .reduce((s, a) => s + a.balance, 0);

  // Totales por categoría del mes
  const catMap = {};
  monthTxRes.data.forEach(tx => {
    if (!tx.category_id) return;
    const k = tx.category_id;
    if (!catMap[k]) {
      catMap[k] = {
        id:     tx.category?.id   || k,
        name:   tx.category?.name || '—',
        icon:   tx.category?.icon || '',
        income: 0,
        expense: 0,
        total:  0,
      };
    }
    if (tx.type === 'credit') {
      catMap[k].income += tx.amount;
      catMap[k].total  += tx.amount;
    } else {
      catMap[k].expense += tx.amount;
      catMap[k].total   -= tx.amount;
    }
  });

  const categories = Object.values(catMap)
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

  res.json({ accounts, net_total, persons, categories });
});

// ============================================================
// ASIENTOS CONTABLES (partida doble)
// ============================================================
app.post('/api/journal-entries', async (req, res) => {
  const { transaction_id, entries } = req.body;
  if (!transaction_id || !Array.isArray(entries) || !entries.length) {
    return res.status(400).json({ error: 'transaction_id y entries[] son requeridos' });
  }
  const rows = entries.map(e => ({
    transaction_id,
    account_id: e.account_id,
    entry_type: e.entry_type,          // 'debit' | 'credit'
    amount:     Math.round(e.amount || 0), // centavos
    note:       e.note || null,
  }));
  const { data, error } = await supabase.from('journal_entries').insert(rows).select();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// ============================================================
// START
// ============================================================
app.listen(PORT, () => {
  console.log(`FinTrack server corriendo en http://localhost:${PORT}`);
});