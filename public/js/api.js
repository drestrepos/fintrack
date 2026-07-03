// FinTrack — api.js
const API = (() => {
  const BASE = '/api';

  function getToken() { return localStorage.getItem('fintrack-token'); }

  async function request(method, path, body = null) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    const token = getToken();
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(BASE + path, opts);

    if (res.status === 401) {
      localStorage.removeItem('fintrack-token');
      localStorage.removeItem('fintrack-user');
      window.location.reload();
      throw new Error('Sesión expirada');
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Error desconocido' }));
      throw new Error(err.error || 'Error en la petición');
    }
    return res.json();
  }

  return {
    // AUTH
    login:         (data) => request('POST', '/auth/login', data),
    register:      (data) => request('POST', '/auth/register', data),
    logout:        ()     => request('POST', '/auth/logout'),
    resetPassword: (data) => request('POST', '/auth/reset-password', data),

    // CUENTAS
    getAccounts:    ()         => request('GET',    '/accounts'),
    createAccount:  (data)     => request('POST',   '/accounts', data),
    updateAccount:  (id, data) => request('PATCH',  `/accounts/${id}`, data),
    deleteAccount:  (id)       => request('DELETE', `/accounts/${id}`),

    // CATEGORÍAS
    getCategories:   ()         => request('GET',    '/categories'),
    createCategory:  (data)     => request('POST',   '/categories', data),
    updateCategory:  (id, data) => request('PATCH',  `/categories/${id}`, data),
    deleteCategory:  (id)       => request('DELETE', `/categories/${id}`),

    // TRANSACCIONES
    getTransactions:   (limit) => request('GET',    `/transactions?limit=${limit || 20}`),
    getAllTransactions: (month) => request('GET',    `/transactions/all${month ? '?month=' + month : ''}`),
    createTransaction: (data)  => request('POST',   '/transactions', data),
    updateTransaction: (id, data) => request('PATCH', `/transactions/${id}`, data),
    deleteTransaction: (id)    => request('DELETE', `/transactions/${id}`),

    // DASHBOARD & BALANCES
    getDashboard:      ()    => request('GET', '/dashboard'),
    getAccountBalance: (id)  => request('GET', `/accounts/${id}/balance`),

    // RESUMEN
    getResumen: (month) => request('GET', `/resumen${month ? '?month=' + month : ''}`),

    // ASIENTOS CONTABLES
    createJournalEntries: (data) => request('POST', '/journal-entries', data),

    // PRESUPUESTOS
    getBudgets:   (month)    => request('GET',    `/budgets${month ? '?month=' + month : ''}`),
    createBudget: (data)     => request('POST',   '/budgets', data),
    updateBudget: (id, data) => request('PATCH',  `/budgets/${id}`, data),
    deleteBudget: (id)       => request('DELETE', `/budgets/${id}`),
    copyBudgets:  (from, to) => request('GET',    `/budgets/copy?from=${from}&to=${to}`),

    // Expose getToken for non-API fetch calls (e.g. export blob)
    getToken,
  };
})();
