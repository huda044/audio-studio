import express from 'express';
import { rateLimit } from '../middleware/rateLimit.js';
import { createAiChatCompletion, getAiConfig } from '../services/ai.service.js';

const router = express.Router();
const aiLimit = rateLimit({
  windowMs: 1000 * 60,
  max: Number(process.env.AI_RATE_LIMIT || 20),
  message: 'Terlalu banyak permintaan AI. Tunggu sebentar.'
});

function normalizeMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 50) {
    const error = new Error('messages wajib berupa array berisi 1 sampai 50 pesan.');
    error.status = 400;
    throw error;
  }

  return messages.map((message) => {
    const role = String(message?.role || '');
    const content = String(message?.content || '').trim();
    if (!['system', 'user', 'assistant'].includes(role) || !content || content.length > 20000) {
      const error = new Error('Setiap pesan harus memiliki role yang valid dan content maksimal 20.000 karakter.');
      error.status = 400;
      throw error;
    }
    return { role, content };
  });
}

router.get('/ai/status', (_req, res) => {
  res.json(getAiConfig());
});

router.post('/ai/chat', aiLimit, async (req, res, next) => {
  try {
    const messages = normalizeMessages(req.body?.messages);
    const temperature = req.body?.temperature === undefined
      ? undefined
      : Math.min(Math.max(Number(req.body.temperature), 0), 2);
    const maxTokens = req.body?.maxTokens === undefined
      ? undefined
      : Math.min(Math.max(Math.round(Number(req.body.maxTokens)), 1), 16000);

    const result = await createAiChatCompletion({
      messages,
      temperature: Number.isFinite(temperature) ? temperature : undefined,
      maxTokens: Number.isFinite(maxTokens) ? maxTokens : undefined,
      signal: req.signal
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
