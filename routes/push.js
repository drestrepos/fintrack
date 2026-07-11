const express = require('express');

module.exports = (supabase) => {
  const router = express.Router();

  // POST /api/push/register
  // Body: { expo_push_token: string }
  router.post('/register', async (req, res) => {
    const userId = req.user.id;
    const { expo_push_token } = req.body;

    if (!expo_push_token || typeof expo_push_token !== 'string') {
      return res.status(400).json({ error: 'expo_push_token requerido' });
    }

    const { error } = await supabase
      .from('push_tokens')
      .upsert(
        { user_id: userId, expo_push_token, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );

    if (error) {
      console.error('[push register] db error:', error.message);
      return res.status(500).json({ error: 'Error al registrar token' });
    }
    return res.json({ ok: true });
  });

  return router;
};
