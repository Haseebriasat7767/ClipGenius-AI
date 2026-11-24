/**
 * Transactional email. Uses SMTP when configured; otherwise the reset link is
 * logged and returned to the caller so the flow still works in development.
 */
import nodemailer from 'nodemailer';
import { env } from './env';

export interface MailResult {
  delivered: boolean;
  devLink?: string;
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!env.smtp.host || !env.smtp.user) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: { user: env.smtp.user, pass: env.smtp.pass },
    });
  }
  return transporter;
}

export async function sendPasswordResetEmail(email: string, resetUrl: string): Promise<MailResult> {
  const transport = getTransporter();
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#0b0b14;border-radius:12px;color:#e5e7eb">
      <h1 style="color:#a78bfa;font-size:20px;margin:0 0 12px">Reset your ClipGenius password</h1>
      <p style="line-height:1.6;color:#cbd5e1">We received a request to reset your password. The link below is valid for 60 minutes.</p>
      <a href="${resetUrl}" style="display:inline-block;margin:16px 0;padding:12px 22px;background:linear-gradient(135deg,#7c3aed,#3b82f6);color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Reset password</a>
      <p style="font-size:12px;color:#94a3b8">If you did not request this, you can safely ignore this email.</p>
    </div>`;
  if (transport) {
    await transport.sendMail({
      from: env.smtp.from,
      to: email,
      subject: 'Reset your ClipGenius AI password',
      html,
      text: `Reset your password: ${resetUrl} (valid for 60 minutes)`,
    });
    return { delivered: true };
  }
  console.log(`[mail] SMTP not configured. Password reset link for ${email}: ${resetUrl}`);
  return { delivered: false, devLink: resetUrl };
}

export async function sendWelcomeEmail(email: string, name: string): Promise<MailResult> {
  const transport = getTransporter();
  if (!transport) return { delivered: false };
  await transport.sendMail({
    from: env.smtp.from,
    to: email,
    subject: 'Welcome to ClipGenius AI',
    text: `Hi ${name || 'there'}, welcome to ClipGenius AI! Upload a video and turn it into scroll-stopping clips.`,
    html: `<p>Hi ${name || 'there'},</p><p>Welcome to <b>ClipGenius AI</b> — upload a video and turn it into scroll-stopping clips.</p>`,
  });
  return { delivered: true };
}
