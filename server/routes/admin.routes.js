import express from 'express';
import {
  adminListUsers,
  adminGetUser,
  adminUpdateUser,
  adminExtendSubscription,
  adminResetUsage,
  adminDeleteUser,
  adminListPayments,
  adminRejectPayment,
  adminStats,
  adminCmsConfig,
  adminActivityFeed,
  confirmPayment,
  isAdminRequest
} from '../services/account.service.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = express.Router();

const adminLimit = rateLimit({
  windowMs: 1000 * 60,
  max: 60,
  message: 'Terlalu banyak request admin. Tunggu sebentar.'
});

async function adminGuard(req, res, next) {
  try {
    const result = await isAdminRequest(req);
    if (!result.ok) return res.status(403).json({ error: 'Akses admin ditolak.' });
    req.admin = { actor: result.actor || 'admin', userId: result.userId || null };
    next();
  } catch (error) {
    next(error);
  }
}

router.use(adminLimit, adminGuard);

router.get('/check', (_req, res) => res.json({ ok: true }));

router.post('/test-email', async (req, res, next) => {
  try {
    const { sendEmail, isSmtpConfigured } = await import('../services/email.service.js');
    if (!isSmtpConfigured()) return res.json({ ok: false, reason: 'smtp_not_configured' });
    const to = String(req.body?.to || '').trim();
    if (!to) return res.status(400).json({ error: 'Field "to" wajib.' });
    const result = await sendEmail({
      to,
      subject: 'Test Email — Audio Studio',
      text: 'Test SMTP dari Audio Studio. Kalau email ini sampai, SMTP sudah jalan.',
      html: '<p>Test SMTP dari <b>Audio Studio</b>. Kalau email ini sampai, SMTP sudah jalan.</p>'
    });
    res.json({
      ok: result.sent,
      reason: result.reason || null
    });
  } catch (error) {
    next(error);
  }
});

router.get('/stats', async (_req, res, next) => {
  try {
    res.json(await adminStats());
  } catch (error) {
    next(error);
  }
});

router.get('/activity', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    res.json({ events: await adminActivityFeed(limit) });
  } catch (error) {
    next(error);
  }
});

router.get('/cms/config', async (_req, res, next) => {
  try {
    res.json(await adminCmsConfig());
  } catch (error) {
    next(error);
  }
});

router.get('/users', async (req, res, next) => {
  try {
    res.json(await adminListUsers({
      search: String(req.query.search || ''),
      limit: Math.min(Number(req.query.limit) || 100, 500),
      offset: Math.max(Number(req.query.offset) || 0, 0)
    }));
  } catch (error) {
    next(error);
  }
});

router.get('/users/:id', async (req, res, next) => {
  try {
    res.json({ user: await adminGetUser(req.params.id) });
  } catch (error) {
    next(error);
  }
});

router.put('/users/:id', async (req, res, next) => {
  try {
    res.json({ user: await adminUpdateUser(req.params.id, req.body || {}, req.admin.actor) });
  } catch (error) {
    next(error);
  }
});

router.post('/users/:id/extend', async (req, res, next) => {
  try {
    res.json({ user: await adminExtendSubscription(req.params.id, req.body?.days, req.admin.actor) });
  } catch (error) {
    next(error);
  }
});

router.post('/users/promote', async (req, res, next) => {
  try {
    const target = String(req.body?.target || '').trim();
    if (!target) return res.status(400).json({ error: 'target (id/username/email) wajib.' });
    const list = await adminListUsers({ search: target, limit: 5 });
    const user = (list.users || []).find((item) =>
      item.id === target
      || item.username?.toLowerCase() === target.toLowerCase()
      || item.email?.toLowerCase() === target.toLowerCase()
    );
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan.' });
    const data = await adminUpdateUser(user.id, { role: 'admin', status: 'active', emailVerified: true }, req.admin.actor);
    res.json({ user: data });
  } catch (error) {
    next(error);
  }
});

router.post('/users/:id/reset-usage', async (req, res, next) => {
  try {
    res.json({ user: await adminResetUsage(req.params.id, req.admin.actor) });
  } catch (error) {
    next(error);
  }
});

router.delete('/users/:id', async (req, res, next) => {
  try {
    res.json(await adminDeleteUser(req.params.id, req.admin.actor));
  } catch (error) {
    next(error);
  }
});

router.get('/payments', async (req, res, next) => {
  try {
    res.json(await adminListPayments({
      status: String(req.query.status || ''),
      limit: Math.min(Number(req.query.limit) || 100, 500),
      offset: Math.max(Number(req.query.offset) || 0, 0)
    }));
  } catch (error) {
    next(error);
  }
});

router.post('/payments/:id/confirm', async (req, res, next) => {
  try {
    res.json({ payment: await confirmPayment(req.params.id, req.admin.actor) });
  } catch (error) {
    next(error);
  }
});

router.post('/payments/:id/reject', async (req, res, next) => {
  try {
    res.json({ payment: await adminRejectPayment(req.params.id, req.admin.actor) });
  } catch (error) {
    next(error);
  }
});

export default router;
