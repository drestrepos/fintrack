// FinTrack — api.js
const API = (() => {
  const BASE = '/api';

  async function request(method, path, body = null) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(BASE + path, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Error desconocido' }));
      throw new Error(err.error || 'Error en la petición');
    }
    return res.json();
  }

  return {
    // CUENTAS
    getAccounts:    ()       => request('GET',    '/accounts'),
    createAccount:  (data)   => request('POST',   '/accounts', data),

    // CATEGORÍAS
    getCategories:  ()       => request('GET',    '/categories'),

    // TRANSACCIONES
    getTransactions:   (limit) => request('GET',    `/transactions?limit=${limit || 20}`),
    getAllTransactions: ()      => request('GET',    '/transactions/all'),
    createTransaction: (data)  => request('POST',   '/transactions', data),
    deleteTransaction: (id)    => request('DELETE', `/transactions/${id}`),

    // DASHBOARD & BALANCES
    getDashboard:      ()       => request('GET', '/dashboard'),
    getAccountBalance: (id)     => request('GET', `/accounts/${id}/balance`),

    // RESUMEN
    getResumen: (month) => request('GET', `/resumen${month ? '?month=' + month : ''}`),

    // ASIENTOS CONTABLES
    createJournalEntries: (data) => request('POST', '/journal-entries', data),
  };
})();