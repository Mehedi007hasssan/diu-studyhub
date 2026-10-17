const crypto = require('crypto');
const nodemailer = require('nodemailer');

const hasResend = () => Boolean(process.env.RESEND_API_KEY);
const hasSmtp = () => Boolean(
  (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) ||
  (process.env.GMAIL_USER && process.env.GMAIL_PASS)
);

let resendClient = null;
function getResendClient() {
  if (!resendClient && hasResend()) {
    const { Resend } = require('resend');
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

let smtpTransporter = null;
function getSmtpTransporter() {
  if (!smtpTransporter && hasSmtp()) {
    if (process.env.GMAIL_USER && process.env.GMAIL_PASS) {
      smtpTransporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_PASS,
        },
      });
    } else {
      smtpTransporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    }
  }
  return smtpTransporter;
}

/**
 * Generate a cryptographically secure 6-digit numeric OTP code
 */
function generateOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Send 6-digit OTP for Registration or Password Reset
 */
async function sendOtpEmail({ to, code, type = 'register', name = 'Student' }) {
  const isRegister = type === 'register';
  const subject = isRegister
    ? `DIU StudyHub — Your Verification Code: ${code}`
    : `DIU StudyHub — Password Reset Code: ${code}`;

  const titleText = isRegister ? 'Verify Your Email' : 'Reset Your Password';
  const actionText = isRegister
    ? 'Thank you for joining DIU StudyHub! Use the 6-digit code below to verify your email address:'
    : 'We received a request to reset your DIU StudyHub account password. Use the 6-digit code below to proceed:';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 20px; }
    .card { max-width: 480px; margin: 20px auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .logo { font-size: 20px; font-weight: 700; color: #0284c7; margin-bottom: 24px; display: inline-block; }
    h1 { font-size: 22px; font-weight: 700; margin: 0 0 12px; color: #0f172a; }
    p { font-size: 15px; line-height: 1.6; color: #475569; margin: 0 0 20px; }
    .otp-box { background: #f1f5f9; border: 2px dashed #cbd5e1; border-radius: 8px; text-align: center; padding: 18px; margin: 24px 0; }
    .otp-code { font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #0284c7; margin: 0; }
    .expiry { font-size: 13px; color: #64748b; margin-top: 8px; }
    .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #f1f5f9; font-size: 13px; color: #94a3b8; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🎓 DIU StudyHub</div>
    <h1>${titleText}</h1>
    <p>Hello ${name || 'there'},</p>
    <p>${actionText}</p>
    <div class="otp-box">
      <div class="otp-code">${code}</div>
      <div class="expiry">Expires in 10 minutes</div>
    </div>
    <p style="font-size: 13px; color: #64748b;">If you did not request this code, you can safely ignore this email. Never share this code with anyone.</p>
    <div class="footer">
      Daffodil International University · DIU StudyHub Community
    </div>
  </div>
</body>
</html>
`;

  const fromEmail = process.env.EMAIL_FROM || process.env.SMTP_FROM || 'DIU StudyHub <onboarding@resend.dev>';

  // 1. Send via Resend if configured
  if (hasResend()) {
    try {
      const resend = getResendClient();
      const { data, error } = await resend.emails.send({
        from: fromEmail,
        to: [to],
        subject,
        html,
      });
      if (error) {
        console.error('[Email] Resend API rejected email:', error.message || error);
        return { ok: false, provider: 'resend', error: error.message };
      }
      console.log(`[Email] OTP email successfully accepted by Resend (id: ${data ? data.id : 'ok'})`);
      return { ok: true, provider: 'resend' };
    } catch (err) {
      console.error('[Email] Resend exception:', err.message || err);
    }
  }

  // 2. Send via SMTP / Gmail if configured
  if (hasSmtp()) {
    try {
      const transporter = getSmtpTransporter();
      await transporter.sendMail({
        from: fromEmail,
        to,
        subject,
        html,
      });
      console.log(`[Email] OTP sent to ${to} via SMTP (${type})`);
      return { ok: true, provider: 'smtp' };
    } catch (err) {
      console.error('[Email] SMTP error:', err);
    }
  }

  // 3. Fallback: When no email provider is configured
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    console.warn(`[Email] Warning: No email provider configured. Please set RESEND_API_KEY to send emails to ${to}.`);
  } else {
    console.warn(`[Email] Warning: RESEND_API_KEY is not configured in Vercel environment variables.`);
  }

  return { ok: false, provider: 'none', error: 'No email service configured' };
}

module.exports = {
  generateOtp,
  sendOtpEmail,
  hasResend,
  hasSmtp,
};
