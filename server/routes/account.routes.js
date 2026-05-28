import express from 'express';
import {
  confirmPayment,
  confirmPasswordReset,
  createPayment,
  getUserById,
  handleMidtransWebhook,
  listUserPayments,
  loginUser,
  loginWithGoogle,
  registerUser,
  requestPasswordReset,
  resendVerification,
  signUser,
  updateUserProfile,
  verifyEmailCode,
  verifyToken
} from '../services/account.service.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { clientIp, clientUa } from '../middleware/clientIp.js';
import { verifyMidtransSignature, isMidtransConfigured } from '../services/midtrans.service.js';

const router = express.Router();

function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Login dibutuhkan.' });
    req.auth = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ error: 'Sesi login tidak valid.' });
  }
}

export { authMiddleware };

const authLimit = rateLimit({
  windowMs: 1000 * 60 * 15,
  max: 25,
  message: 'Terlalu banyak percobaan login/daftar. Coba lagi nanti.'
});

function ctx(req) {
  return { ip: clientIp(req), ua: clientUa(req) };
}

router.post('/auth/register', authLimit, async (req, res, next) => {
  try {
    const result = await registerUser(req.body, ctx(req));
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/auth/verify-email', authLimit, async (req, res, next) => {
  try {
    const user = await verifyEmailCode(req.body, ctx(req));
    res.json({ token: signUser(user), user });
  } catch (error) {
    next(error);
  }
});

router.post('/auth/resend-code', authLimit, async (req, res, next) => {
  try {
    res.json(await resendVerification(req.body));
  } catch (error) {
    next(error);
  }
});

router.post('/auth/login', authLimit, async (req, res, next) => {
  try {
    const user = await loginUser(req.body, ctx(req));
    res.json({ token: signUser(user), user });
  } catch (error) {
    next(error);
  }
});

router.post('/auth/forgot-password', authLimit, async (req, res, next) => {
  try {
    res.json(await requestPasswordReset(req.body));
  } catch (error) {
    next(error);
  }
});

router.post('/auth/reset-password', authLimit, async (req, res, next) => {
  try {
    const user = await confirmPasswordReset(req.body, ctx(req));
    res.json({ token: signUser(user), user });
  } catch (error) {
    next(error);
  }
});

router.post('/auth/google', authLimit, async (req, res, next) => {
  try {
    const user = await loginWithGoogle(req.body, ctx(req));
    res.json({ token: signUser(user), user });
  } catch (error) {
    next(error);
  }
});

router.get('/auth/me', authMiddleware, async (req, res, next) => {
  try {
    const user = await getUserById(req.auth.sub);
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan.' });
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

router.put('/profile', authMiddleware, async (req, res, next) => {
  try {
    const user = await updateUserProfile(req.auth.sub, req.body.profile || {});
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

router.get('/billing/payments', authMiddleware, async (req, res, next) => {
  try {
    res.json({ payments: await listUserPayments(req.auth.sub) });
  } catch (error) {
    next(error);
  }
});

router.post('/billing/create', authMiddleware, async (req, res, next) => {
  try {
    res.json({ payment: await createPayment(req.auth.sub, req.body) });
  } catch (error) {
    next(error);
  }
});

router.post('/billing/admin/confirm', async (req, res, next) => {
  try {
    if (!process.env.ADMIN_SECRET || req.headers['x-admin-secret'] !== process.env.ADMIN_SECRET) {
      return res.status(403).json({ error: 'Admin secret tidak valid.' });
    }
    res.json({ payment: await confirmPayment(req.body.invoiceId, 'admin-secret') });
  } catch (error) {
    next(error);
  }
});

router.get('/billing/gateway', (_req, res) => {
  res.json({
    midtrans: {
      enabled: isMidtransConfigured(),
      clientKey: process.env.MIDTRANS_CLIENT_KEY || '',
      production: process.env.MIDTRANS_PRODUCTION === 'true'
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || ''
    },
    admin: {
      discord: process.env.ADMIN_DISCORD || 'https://discord.com/users/lucifer404044',
      whatsapp: process.env.ADMIN_WHATSAPP || 'https://wa.me/62895331723076'
    }
  });
});

router.post('/billing/webhook/midtrans', async (req, res) => {
  try {
    const payload = req.body || {};
    const valid = verifyMidtransSignature({
      orderId: payload.order_id,
      statusCode: payload.status_code,
      grossAmount: payload.gross_amount,
      signatureKey: payload.signature_key
    });
    if (!valid) return res.status(401).json({ error: 'Signature tidak valid.' });
    await handleMidtransWebhook(payload);
    res.json({ ok: true });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

export default router;
