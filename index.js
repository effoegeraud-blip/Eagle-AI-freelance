import express from 'express';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const {
  PORT = 3001, APP_URL = 'http://localhost:5173',
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
  SASPAY_API_URL, SASPAY_API_KEY, SASPAY_WEBHOOK_SECRET,
  SASPAY_SIGNATURE_HEADER = 'x-saspay-signature', PRO_PRICE_XOF = '15000',
} = process.env;

const app = express();
const admin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

if (!admin) console.warn('⚠️  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants : le webhook répondra 503.');
if (!SASPAY_WEBHOOK_SECRET) console.warn('⚠️  SASPAY_WEBHOOK_SECRET manquant : tous les webhooks seront rejetés.');

app.get('/api/health', (_req, res) => res.json({ ok: true, supabase: !!admin, saspay: !!SASPAY_API_KEY }));

/** Vérifie la signature HMAC-SHA256 du corps BRUT, en temps constant. */
function verifySignature(rawBody, received) {
  if (!SASPAY_WEBHOOK_SECRET || !received) return false;
  const expected = crypto.createHmac('sha256', SASPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
  const given = received.replace(/^sha256=/, '').trim();
  const a = Buffer.from(expected), b = Buffer.from(given);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Le corps doit rester brut pour la signature → express.raw, PAS express.json
app.post('/api/webhooks/saspay', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  try {
    if (!admin) return res.status(503).json({ error: 'Serveur non configuré' });
    if (!verifySignature(req.body, req.get(SASPAY_SIGNATURE_HEADER))) {
      return res.status(401).json({ error: 'Signature invalide' });
    }
    const event = JSON.parse(req.body.toString('utf8'));
    // ⚠️ Adaptez ces champs au payload réel de SasPay.
    const status = String(event?.data?.status ?? event?.status ?? '').toLowerCase();
    const userId = event?.data?.metadata?.user_id ?? event?.metadata?.user_id;

    if (['paid', 'success', 'succeeded', 'completed'].includes(status) && userId) {
      const { error } = await admin.from('profiles')
        .update({ is_pro: true, pro_since: new Date().toISOString() }).eq('id', userId);
      if (error) { console.error('Supabase update:', error); return res.status(500).json({ error: 'DB' }); }
      console.log(`✅ is_pro activé pour ${userId}`);
    }
    res.json({ received: true });
  } catch (e) {
    console.error('Webhook error:', e);
    res.status(400).json({ error: 'Payload invalide' });
  }
});

app.use(express.json());

/** Crée une session de paiement SasPay pour l'utilisateur authentifié (JWT Supabase). */
app.post('/api/checkout', async (req, res) => {
  try {
    if (!admin || !SASPAY_API_URL || !SASPAY_API_KEY) {
      return res.status(503).json({ error: 'Paiement non configuré (variables SasPay manquantes).' });
    }
    const token = req.get('authorization')?.replace('Bearer ', '');
    const { data: { user } } = await admin.auth.getUser(token ?? '');
    if (!user) return res.status(401).json({ error: 'Non authentifié' });

    // ⚠️ Adaptez endpoint et champs à la documentation SasPay.
    const r = await fetch(`${SASPAY_API_URL}/checkout/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SASPAY_API_KEY}` },
      body: JSON.stringify({
        amount: Number(PRO_PRICE_XOF), currency: 'XOF',
        description: 'Eagle AI Freelance — Pro (1 mois)',
        customer_email: user.email,
        metadata: { user_id: user.id },
        success_url: `${APP_URL}/?payment=success`, cancel_url: `${APP_URL}/?payment=cancel`,
      }),
    });
    const data = await r.json();
    const checkoutUrl = data.checkout_url ?? data.url;
    if (!r.ok || !checkoutUrl) return res.status(502).json({ error: 'Réponse SasPay inattendue' });
    res.json({ url: checkoutUrl });
  } catch (e) {
    console.error('Checkout error:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.listen(PORT, () => console.log(`🦅 API Eagle sur http://localhost:${PORT}`));
