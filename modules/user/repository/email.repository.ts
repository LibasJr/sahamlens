import nodemailer from 'nodemailer';
import { logger } from '../../../shared/logger/logger';

function getTransporter() {
  if (!process.env.SMTP_EMAIL || !process.env.SMTP_PASSWORD) return null;
  return nodemailer.createTransport({
    service: 'gmail',
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
  footerText: string;
}

// Satu fungsi inti (code review M3) - sendVerificationEmail/sendResetPasswordEmail
// dulu duplikat strukturnya nyaris 100% (setup transporter, try/catch, fallback
// devOnlyLog), cuma beda subjek/isi. Kalau nanti ada OTP jenis ketiga (verifikasi
// WA misalnya), tinggal tambah satu OtpEmailTemplate, bukan fungsi keempat yang identik.
async function sendOtpEmail(email: string, code: string, template: OtpEmailTemplate): Promise<void> {
  const transporter = getTransporter();
  if (!transporter) {
    devOnlyLog(template.label, email, code);
    return;
  }
  try {
    await transporter.sendMail({
      from: `"SahamLens Admin" <${process.env.SMTP_EMAIL}>`,
      to: email,
      subject: template.subject,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #0f172a;">${template.heading}</h2>
          <p style="color: #475569;">${template.bodyText}</p>
          <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; padding: 15px; text-align: center; margin: 20px 0; border-radius: 5px;">
            <h1 style="color: #0d9488; letter-spacing: 10px; margin: 0; font-size: 32px;">${code}</h1>
          </div>
          <p style="color: #64748b; font-size: 12px;">${template.footerText}</p>
        </div>
      `,
    });
    logger.info(`[AUTH] Email ${template.label.toLowerCase()} berhasil dikirim`, { email });
  } catch (err) {
    logger.error(`[AUTH] Gagal mengirim email ${template.label.toLowerCase()}`, { email, err });
    devOnlyLog(template.label, email, code);
  }
}

export async function sendVerificationEmail(email: string, code: string): Promise<void> {
  await sendOtpEmail(email, code, {
    label: 'Kode Verifikasi',
    subject: 'Kode Verifikasi SahamLens',
    heading: 'Selamat datang di SahamLens!',
    bodyText: 'Untuk menyelesaikan pendaftaran akun Anda, gunakan kode verifikasi berikut:',
    footerText: 'Jika Anda tidak mendaftar di SahamLens, abaikan email ini.',
  });
}

export async function sendResetPasswordEmail(email: string, code: string): Promise<void> {
  await sendOtpEmail(email, code, {
    label: 'Kode Reset Password',
    subject: 'Kode Reset Password SahamLens',
    heading: 'Permintaan Reset Password',
    bodyText: `Seseorang baru saja meminta reset password untuk akun SahamLens Anda (<strong>${email}</strong>). Berikut adalah kode verifikasi 6 digit Anda:`,
    footerText: 'Kode ini hanya berlaku 15 menit. Jika bukan Anda yang meminta, abaikan email ini.',
  });
}
