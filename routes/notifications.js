const express   = require('express');
const Anthropic  = require('@anthropic-ai/sdk');

const SYSTEM_PROMPT = `
Eres un clasificador de notificaciones bancarias colombianas para una app de
finanzas personales. Recibes el texto de una notificación del celular, junto
con el paquete de la app que la generó (si se conoce). Determina si es una
notificación de una transacción financiera real (compra, pago, transferencia,
abono, descuento) — no una conversación casual que mencione dinero.

Si es una transacción, extrae: monto en pesos colombianos (entero, sin
puntos ni comas), tipo ("debit" si sale dinero, "credit" si entra), comercio o
contraparte, banco o app identificado si es posible, últimos dígitos de
cuenta/tarjeta si aparecen.

Responde SOLO con JSON, sin texto adicional, con este esquema exacto:
{ "es_transaccion": boolean, "monto": number|null, "tipo": "debit"|"credit"|null,
  "comercio_o_contraparte": string|null, "banco_identificado": string|null,
  "ultimos_digitos": string|null }

EJEMPLOS:
Texto: "AVVillas. 10/07/26 13:46 COMPRA CON TU TARJETA CREDITO 2075 POR $ 42,000 EN BOLD ESTACION EL RAN"
→ {"es_transaccion":true,"monto":42000,"tipo":"debit","comercio_o_contraparte":"BOLD ESTACION EL RAN","banco_identificado":"AV Villas","ultimos_digitos":"2075"}

Texto: "AVVillas, 09/07/26 15:02 Enviaste $ 92,000 a RODRIGO JOSE SANCHEZ por Bre-B de tu cuenta 2053 a DAVIVIENDA"
→ {"es_transaccion":true,"monto":92000,"tipo":"debit","comercio_o_contraparte":"RODRIGO JOSE SANCHEZ","banco_identificado":"AV Villas","ultimos_digitos":"2053"}

Texto: "DaviPlata: recibiste $1,900,000 desde una cuenta Davivienda"
→ {"es_transaccion":true,"monto":1900000,"tipo":"credit","comercio_o_contraparte":null,"banco_identificado":"DaviPlata","ultimos_digitos":null}

Texto: "BANCO FALABELLA, informa compra aprobada 20.000 08/06/2026 17:53 con tu tarjeta *4690 En BACU UNICENTRO BOGOTA-"
→ {"es_transaccion":true,"monto":20000,"tipo":"debit","comercio_o_contraparte":"BACU UNICENTRO BOGOTA","banco_identificado":"Banco Falabella","ultimos_digitos":"4690"}

Texto: "DAVIVIENDA   Abono       de Proveedores, $1,725,000, Cta de Ahorros *2635"
→ {"es_transaccion":true,"monto":1725000,"tipo":"credit","comercio_o_contraparte":"Proveedores","banco_identificado":"Davivienda","ultimos_digitos":"2635"}

Texto: "Oye, ¿me puedes prestar $50,000 para el bus?"
→ {"es_transaccion":false,"monto":null,"tipo":null,"comercio_o_contraparte":null,"banco_identificado":null,"ultimos_digitos":null}
`.trim();

module.exports = (supabase) => {
  const router = express.Router();

  // POST /api/notifications/classify
  router.post('/classify', async (req, res) => {
    const { raw_text, source_package, notification_title } = req.body;

    if (!raw_text || typeof raw_text !== 'string') {
      return res.status(400).json({ error: 'raw_text requerido' });
    }

    const userContent = [
      source_package    ? `App origen: ${source_package}`       : null,
      notification_title ? `Título: ${notification_title}`      : null,
      `Texto: ${raw_text}`,
    ].filter(Boolean).join('\n');

    const anthropic = new Anthropic(
      process.env.ANTHROPIC_API_KEY ? { apiKey: process.env.ANTHROPIC_API_KEY } : {}
    );

    let parsed;
    try {
      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
      });
      const raw = msg.content[0].text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      parsed = JSON.parse(raw);
    } catch (err) {
      console.error('[classify] LLM/parse error:', err.message);
      return res.status(500).json({ error: 'Error al clasificar', detail: err.message });
    }

    if (!parsed.es_transaccion) {
      return res.json({ es_transaccion: false });
    }

    const userId       = req.user.id;
    const amountCents  = parsed.monto != null ? Math.round(parsed.monto * 100) : null;

    const { data, error } = await supabase
      .from('pending_transactions')
      .insert({
        user_id:           userId,
        source:            'notification',
        raw_text,
        bank_identified:   parsed.banco_identificado   ?? null,
        amount:            amountCents,
        type:              parsed.tipo                 ?? null,
        merchant_or_party: parsed.comercio_o_contraparte ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error('[classify] db error:', error.message);
      return res.status(500).json({ error: 'Error al guardar transacción pendiente' });
    }

    return res.status(201).json({ es_transaccion: true, pending_transaction: data });
  });

  // GET /api/notifications/pending
  router.get('/pending', async (req, res) => {
    const userId = req.user.id;
    const { data, error } = await supabase
      .from('pending_transactions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[pending] db error:', error.message);
      return res.status(500).json({ error: 'Error al obtener pendientes' });
    }
    return res.json(data);
  });

  // PATCH /api/notifications/pending/:id
  // Body: { status: 'confirmed' | 'dismissed', confirmed_transaction_id?: string }
  router.patch('/pending/:id', async (req, res) => {
    const userId  = req.user.id;
    const { id }  = req.params;
    const { status, confirmed_transaction_id } = req.body;

    if (!['confirmed', 'dismissed'].includes(status)) {
      return res.status(400).json({ error: 'status debe ser confirmed o dismissed' });
    }

    const { data, error } = await supabase
      .from('pending_transactions')
      .update({ status, confirmed_transaction_id: confirmed_transaction_id ?? null })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('[pending patch] db error:', error.message);
      return res.status(500).json({ error: 'Error al actualizar' });
    }
    if (!data) return res.status(404).json({ error: 'No encontrado' });
    return res.json(data);
  });

  return router;
};
