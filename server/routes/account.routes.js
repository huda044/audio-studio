import express from 'express';
import { getUserById, loginUser, registerUser, signUser, updateUserProfile, verifyToken } from '../services/account.service.js';

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

router.post('/auth/register', async (req, res, next) => {
  try {
    const user = await registerUser(req.body);
    res.json({ token: signUser(user), user });
  } catch (error) {
    next(error);
  }
});

router.post('/auth/login', async (req, res, next) => {
  try {
    const user = await loginUser(req.body);
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

export default router;
