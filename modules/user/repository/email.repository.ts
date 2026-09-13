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

// Alamat bantuan yang dicantumkan di setiap email OTP. Mailbox nyata yang diverifikasi
// 13 September 2026 (RCPT TO -> 250, dengan alamat kontrol 550 sebagai pembanding).
// Dicantumkan sebagai konstanta karena dipakai di tiga tempat: header Reply-To, badan
// plain-text, dan badan HTML - kalau berubah, ketiganya harus ikut.
const SUPPORT_EMAIL = 'support@sahamlens.id';

// Logo di kepala email. URL-nya WAJIB absolut ke domain produksi: klien email membuka
// HTML di luar konteks situs, jadi path relatif seperti `/email-logo.png` tidak akan
// pernah teresolusi. Tidak memakai APP_URL karena nilainya bisa localhost saat dev dan
// gambar yang menunjuk localhost akan rusak di kotak masuk penerima.
const EMAIL_LOGO_URL = 'https://sahamlens.id/email-logo.png';

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
      // Pengirimnya no-reply@ (mailbox tanpa penjaga), jadi balasan diarahkan ke
      // support@ yang memang dibaca manusia. Tanpa Reply-To, pengguna yang butuh
      // bantuan membalas ke no-reply@ dan tidak ada yang menjawab - footer "mohon
      // tidak membalas" tidak menghentikan orang yang sedang kebingungan.
      replyTo: SUPPORT_EMAIL,
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
        `Butuh bantuan? Hubungi ${SUPPORT_EMAIL}.`,
        '',
        'Hormat kami,',
        'Tim SahamLens',
      ].join('\n'),
      html: `
        <div style="background-color:#f8fafc;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
          <div style="max-width:560px;margin:0 auto;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
            <div style="padding:20px 28px;background-color:#0f172a;">
              <!--
                Logo DAN teks, bukan salah satu. Gmail/Outlook memblokir gambar eksternal
                secara bawaan untuk pengirim yang belum dipercaya, jadi header yang hanya
                berisi <img> akan tampil kosong persis pada email pertama - yaitu email
                OTP pendaftaran, satu-satunya email yang pasti diterima pengguna baru.
                Teks di sebelahnya membuat kepala email tetap berjenama saat gambar mati.
              -->
              <img src="${EMAIL_LOGO_URL}" width="58" height="36" alt="" style="display:inline-block;vertical-align:middle;border:0;outline:none;text-decoration:none;" />
              <span style="display:inline-block;vertical-align:middle;margin-left:12px;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">SahamLens</span>
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
              <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:#64748b;">Butuh bantuan? Hubungi <a href="mailto:${SUPPORT_EMAIL}" style="color:#0f766e;text-decoration:underline;">${SUPPORT_EMAIL}</a>.</p>
              <p style="margin:0;font-size:12px;line-height:1.6;color:#64748b;">Email ini dikirim otomatis dari alamat yang tidak dipantau. Balasan akan diteruskan ke ${SUPPORT_EMAIL}.</p>
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
    bodyText: 'Terima kasih telah mendaftar di SahamLens. Satu langkah lagi sebelum akun Anda aktif.',
    instructionText: 'Buka halaman verifikasi di SahamLens, lalu masukkan kode di bawah ini untuk menyelesaikan pendaftaran:',
    // TTL disebut eksplisit karena pengguna yang tidak tahu batas waktunya akan mencoba
    // kode lama lalu menyimpulkan aplikasinya rusak. Angka 15 harus tetap sama dengan
    // VERIFICATION_CODE_TTL_MIN di modules/user/constants/user.constants.ts - dijaga test.
    securityText: 'Kode ini hanya berlaku 15 menit dan sekali pakai. Jangan berikan kode ini kepada siapa pun, termasuk pihak yang mengaku dari SahamLens. Jika Anda tidak mendaftar, abaikan email ini dan tidak ada akun yang dibuat.',
  });
}

export async function sendResetPasswordEmail(email: string, code: string): Promise<void> {
  await sendOtpEmail(email, code, {
    label: 'Kode Reset Password',
    subject: 'Kode Reset Kata Sandi SahamLens',
    heading: 'Permintaan Reset Kata Sandi',
    bodyText: 'Kami menerima permintaan untuk mengatur ulang kata sandi akun SahamLens Anda.',
    instructionText: 'Buka halaman reset kata sandi, masukkan kode di bawah ini, lalu buat kata sandi baru:',
    // Penegasan "kata sandi TIDAK berubah" penting secara keamanan, bukan sekadar sopan:
    // penerima yang tidak meminta reset perlu tahu ia tidak harus bertindak apa pun.
    // Tanpa itu, email reset yang tidak diminta terbaca seperti akun sudah disusupi dan
    // memancing kepanikan - yang justru membuat orang mengklik hal yang tidak semestinya.
    securityText: 'Kode ini hanya berlaku 15 menit dan sekali pakai. Jangan berikan kode ini kepada siapa pun. Jika Anda tidak mengajukan permintaan ini, abaikan email ini - kata sandi Anda tidak berubah dan akun Anda tetap aman.',
  });
}
