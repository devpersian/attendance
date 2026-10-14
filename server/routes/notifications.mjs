import express from 'express';
import { execute } from '../db.mjs';
import { authenticateToken } from '../services/auth.mjs';
import { rateLimit } from '../middleware/rateLimit.mjs';
import { sendSms, sendEmail } from '../services/notifications.mjs';

const router = express.Router();
router.use(authenticateToken);

// GET /api/notifications — delivery log (last 200)
router.get('/', async (req, res) => {
  try {
    const rows = await execute(
      `SELECT TOP 200 * FROM attendance.NotificationLog ORDER BY CreatedAt DESC`, {}
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/notifications/sms — manual/admin SMS { to, body }
router.post('/sms', rateLimit({ windowMs: 60_000, max: 20 }), async (req, res) => {
  try {
    const { to, body } = req.body;
    if (!to || !body) return res.status(400).json({ error: 'گیرنده و متن پیام الزامی است' });
    const r = await sendSms(to, body, { userId: req.user?.id });
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/notifications/email — { to, subject, text }
router.post('/email', rateLimit({ windowMs: 60_000, max: 20 }), async (req, res) => {
  try {
    const { to, subject, text } = req.body;
    if (!to || !text) return res.status(400).json({ error: 'گیرنده و متن الزامی است' });
    const r = await sendEmail(to, subject || '', text, { userId: req.user?.id });
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
