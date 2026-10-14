/**
 * Outbound notifications for Iranian deployment:
 *   - SMS via Kavenegar (https://api.kavenegar.com/v1/{key}/sms/send.json)
 *   - SMS via SMS.ir (REST panel)
 *   - Email via SMTP (nodemailer if installed; otherwise logs only)
 *
 * Every message is written to attendance.NotificationLog so delivery can be
 * audited even when providers are not configured (dry-run mode).
 *
 * Env vars:
 *   SMS_PROVIDER      = kavenegar | smsir | none   (default: none → dry-run)
 *   KAVENEGAR_API_KEY, KAVENEGAR_SENDER
 *   SMSIR_API_KEY, SMSIR_SENDER
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 */

import { execute, executeInsert } from '../db.mjs';

const PROVIDER = (process.env.SMS_PROVIDER || 'none').toLowerCase();

async function logRow({ channel, provider, to, subject, body, template, userId }) {
  try {
    return await executeInsert(
      `INSERT INTO attendance.NotificationLog ([Channel],[Provider],[To],[Subject],[Body],[Template],[UserId],[Status])
       VALUES (@channel,@provider,@to,@subject,@body,@template,@userId,'queued')`,
      { channel, provider: provider || null, to, subject: subject || null, body, template: template || null, userId: userId || null }
    );
  } catch {
    return null; // table may not exist yet — never block business flow
  }
}

async function markSent(id, ok, error) {
  if (!id) return;
  try {
    await execute(
      `UPDATE attendance.NotificationLog SET Status=@status, Error=@error, SentAt=GETDATE() WHERE Id=@id`,
      { id, status: ok ? 'sent' : 'failed', error: error || null }
    );
  } catch { /* ignore */ }
}

async function sendKavenegar(to, body) {
  const key = process.env.KAVENEGAR_API_KEY;
  const sender = process.env.KAVENEGAR_SENDER;
  if (!key) throw new Error('KAVENEGAR_API_KEY not set');
  const res = await fetch(`https://api.kavenegar.com/v1/${key}/sms/send.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ receptor: to, sender, message: body }),
  });
  if (!res.ok) throw new Error(`kavenegar HTTP ${res.status}`);
  const json = await res.json().catch(() => ({}));
  if (json?.returnCode && String(json.returnCode)[0] !== '2') {
    throw new Error(`kavenegar ${json.returnCode}: ${json.returnMessage}`);
  }
}

async function sendSmsIr(to, body) {
  const key = process.env.SMSIR_API_KEY;
  if (!key) throw new Error('SMSIR_API_KEY not set');
  const res = await fetch('https://api.sms.ir/v1/send/linear', {
    method: 'POST',
    headers: { 'X--API-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sender: process.env.SMSIR_SENDER || '+98', recipient: to, message: body }),
  });
  if (!res.ok) throw new Error(`smsir HTTP ${res.status}`);
  const json = await res.json().catch(() => ({}));
  if (json?.status !== 1) throw new Error(`smsir status=${json?.status}`);
}

/**
 * Send an SMS. Returns { ok, skipped?, error? }. Never throws.
 */
export async function sendSms(to, body, { template, userId } = {}) {
  if (!to) return { ok: false, error: 'no recipient' };
  const id = await logRow({ channel: 'sms', provider: PROVIDER, to, body, template, userId });
  try {
    if (PROVIDER === 'kavenegar') await sendKavenegar(to, body);
    else if (PROVIDER === 'smsir') await sendSmsIr(to, body);
    else { await markSent(id, true, 'dry-run (SMS_PROVIDER=none)'); return { ok: true, skipped: true }; }
    await markSent(id, true);
    return { ok: true };
  } catch (e) {
    await markSent(id, false, e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * Send email via nodemailer if configured & installed. Falls back to log-only.
 */
export async function sendEmail(to, subject, text, { userId } = {}) {
  const id = await logRow({ channel: 'email', provider: process.env.SMTP_HOST ? 'smtp' : 'none', to, subject, body: text, userId });
  if (!process.env.SMTP_HOST) { await markSent(id, true, 'dry-run (SMTP not configured)'); return { ok: true, skipped: true }; }
  try {
    const nodemailer = await import('nodemailer').then(m => m.default ?? m);
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
    await transporter.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text });
    await markSent(id, true);
    return { ok: true };
  } catch (e) {
    await markSent(id, false, e.message);
    return { ok: false, error: e.message };
  }
}

/** Persian templates used across modules. */
export const templates = {
  leaveApproved: (n) => `سلام ${n}، مرخصی شما تایید شد. اسپرسیا`,
  leaveRejected: (n) => `سلام ${n}، درخواست مرخصی شما رد شد. برای هماهنگی با منابع انسانی تماس بگیرید. اسپرسیا`,
  leaveSubmitted: (mgr, emp, range) => `${mgr} عزیز، درخواست مرخصی ${emp} برای ${range} در انتظار بررسی است. اسپرسیا`,
  lateArrival: (n, time) => `${n} عزیز، ورود شما امروز ${time} ثبت شد (تأخیر). اسپرسیا`,
  correctionApproved: (n) => `سلام ${n}، درخواست اصلاح تردد شما ثبت و تایید شد. اسپرسیا`,
  payrollReady: (n) => `سلام ${n}، فیش حقوقی این ماه شما صادر شد. اسپرسیا`,
};
