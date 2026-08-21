import nodemailer from 'nodemailer';
import { logger } from '../../../shared/logger/logger';
import { recordDataSourceHealth } from '../../observability/service/data-source-health.service';

function getTransporter() {
  if (!process.env.SMTP_EMAIL || !process.env.SMTP_PASSWORD) return null;

  const port = Number.parseInt(process.env.SMTP_PORT || '465', 10);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.hostinger.com',
    port,
    secure: process.env.SMTP_SECURE
      ? process.env.SMTP_SECURE === 'true'
      : port === 465,
    auth: { user: process.env.SMTP_EMAIL, pass: process.env.SMTP_PASSWORD },
  });
}

// Kode OTP TIDAK PERNAH dicetak ke log production (temuan H5 di audit - kode yang
// tercetak ke log production bisa dibaca siapa pun dengan akses log Vercel, artinya
// takeover akun). Kalau SMTP gagal/belum dikonfigurasi di production, email memang
// tidak terkirim - itu lebih baik daripada kode bocor ke log.
function devOnlyLog(label: string, email: string, code: string) {
  if (process.env.NODE_ENV !== 'production') {
    logger.info(`[AUTH][DEV ONLY] ${label}`, { email, code });
  }
}

interface OtpEmailTemplate {
  label: string;
  subject: string;
  heading: string;
  bodyText: string;
  instructionText: string;
  securityText: string;
}

// Satu fungsi inti (code review M3) - sendVerificationEmail/sendResetPasswordEmail
// dulu duplikat strukturnya nyaris 100% (setup transporter, try/catch, fallback
// devOnlyLog), cuma beda subjek/isi. Kalau nanti ada OTP jenis ketiga (verifikasi
// WA misalnya), tinggal tambah satu OtpEmailTemplate, bukan fungsi keempat yang identik.
async function sendOtpEmail(email: string, code: string, template: OtpEmailTemplate): Promise<void> {
  const transporter = getTransporter();
  if (!transporter) {
    if (process.env.NODE_ENV === 'production') {
      void recordDataSourceHealth({ sourceId: 'SMTP_EMAIL', ok: false, detail: { reason: 'not_configured' } });
    }
    devOnlyLog(template.label, email, code);
    return;
  }
  const startedAt = Date.now();
  try {
    await transporter.sendMail({
      from: `"${process.env.SMTP_FROM_NAME || 'SahamLens'}" <${process.env.SMTP_EMAIL}>`,
      to: email,
      subject: template.subject,
      text: [
        template.heading,
        '',
        template.bodyText,
        template.instructionText,
        '',
        code,
        '',
        template.securityText,
        '',
        'Hormat kami,',
        'Tim SahamLens',
      ].join('\n'),
      html: `
        <div style="background-color:#f8fafc;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
          <div style="max-width:560px;margin:0 auto;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
            <div style="padding:20px 28px;background-color:#0f172a;">
              <div style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">SahamLens</div>
            </div>
            <div style="padding:32px 28px;">
              <h1 style="margin:0 0 20px;font-size:24px;line-height:1.3;color:#0f172a;">${template.heading}</h1>
              <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#475569;">${template.bodyText}</p>
              <p style="margin:0;font-size:15px;line-height:1.7;color:#475569;">${template.instructionText}</p>
              <div style="margin:24px 0;padding:20px;text-align:center;background-color:#f0fdfa;border:1px solid #99f6e4;border-radius:8px;">
                <div style="margin-bottom:8px;font-size:12px;font-weight:700;letter-spacing:1.2px;color:#0f766e;text-transform:uppercase;">Kode verifikasi</div>
                <div style="font-size:34px;font-weight:700;letter-spacing:10px;color:#0f172a;">${code}</div>
              </div>
              <div style="padding:14px 16px;background-color:#f8fafc;border-left:3px solid #0f766e;">
                <p style="margin:0;font-size:13px;line-height:1.6;color:#475569;">${template.securityText}</p>
              </div>
              <p style="margin:24px 0 0;font-size:15px;line-height:1.7;color:#475569;">Hormat kami,<br><strong style="color:#0f172a;">Tim SahamLens</strong></p>
            </div>
            <div style="padding:18px 28px;background-color:#f8fafc;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;line-height:1.6;color:#64748b;">Email ini dikirim secara otomatis. Mohon tidak membalas email ini.</p>
            </div>
          </div>
        </div>
      `,
    });
    logger.info(`[AUTH] Email ${template.label.toLowerCase()} berhasil dikirim`, { email });
    if (process.env.NODE_ENV !== 'test') void recordDataSourceHealth({ sourceId: 'SMTP_EMAIL', ok: true, latencyMs: Date.now() - startedAt });
  } catch (err) {
    logger.error(`[AUTH] Gagal mengirim email ${template.label.toLowerCase()}`, { email, err });
    if (process.env.NODE_ENV !== 'test') void recordDataSourceHealth({ sourceId: 'SMTP_EMAIL', ok: false, latencyMs: Date.now() - startedAt, detail: { error: err instanceof Error ? err.message : String(err) } });
    devOnlyLog(template.label, email, code);
  }
}

export async function sendVerificationEmail(email: string, code: string): Promise<void> {
  await sendOtpEmail(email, code, {
    label: 'Kode Verifikasi',
    subject: 'Verifikasi Akun SahamLens',
    heading: 'Verifikasi Akun Anda',
    bodyText: 'Terima kasih telah mendaftar di SahamLens.',
    instructionText: 'Masukkan kode berikut pada halaman verifikasi untuk menyelesaikan proses pendaftaran:',
    securityText: 'Kode ini berlaku selama 15 menit. Jangan membagikan kode ini kepada siapa pun. Jika Anda tidak melakukan pendaftaran, abaikan email ini.',
  });
}

export async function sendResetPasswordEmail(email: string, code: string): Promise<void> {
  await sendOtpEmail(email, code, {
    label: 'Kode Reset Password',
    subject: 'Kode Reset Kata Sandi SahamLens',
    heading: 'Permintaan Reset Kata Sandi',
    bodyText: 'Kami menerima permintaan untuk mengatur ulang kata sandi akun SahamLens Anda.',
    instructionText: 'Masukkan kode berikut pada halaman reset kata sandi untuk melanjutkan:',
    securityText: 'Kode ini berlaku selama 15 menit. Jangan membagikan kode ini kepada siapa pun. Jika Anda tidak mengajukan permintaan ini, abaikan email ini dan kata sandi Anda tidak akan berubah.',
  });
}
