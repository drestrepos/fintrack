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
// START
// ============================================================
app.listen(PORT, () => {
  console.log(`FinTrack server corriendo en http://localhost:${PORT}`);
});